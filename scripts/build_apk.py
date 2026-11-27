#!/usr/bin/env python3
"""Direct ARM64 APK build & signing pipeline for Horizon 6: Japan 3D.

Toolchain (zero Gradle / zero AndroidX dependencies):
  1. $PREFIX/bin/aapt2 compile & link
  2. $PREFIX/bin/javac --release 11 against $HOME/Android/platforms/android-34/android.jar
  3. java -cp $HOME/Android/build-tools/34.0.0/lib/d8.jar com.android.tools.r8.D8
  4. Python zipfile merge + deterministic 4-byte alignment for ZIP_STORED entries
  5. keytool PKCS12 keystore generation (if absent)
  6. $PREFIX/bin/apksigner sign (v1 + v2 + v3)
  7. Optional copy to /storage/emulated/0/Download/horizon6_japan_3d.apk
"""

from __future__ import annotations

import argparse
import os
import shutil
import struct
import subprocess
import sys
import zipfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ASSETS_DIR = PROJECT_ROOT / "app" / "src" / "main" / "assets"
DEFAULT_OUT_APK = PROJECT_ROOT / "horizon6_japan_3d.apk"
DEFAULT_COPY_TO = Path("/storage/emulated/0/Download/horizon6_japan_3d.apk")
DEFAULT_BUILD_DIR = PROJECT_ROOT / "build"
DEFAULT_KEYSTORE = PROJECT_ROOT / "keystore" / "horizon6_release.p12"

KEYSTORE_ALIAS = "horizon6"
KEYSTORE_PASS = "horizon6japan3d"
KEYSTORE_DNAME = "CN=Horizon6 Japan 3D, OU=Mobile, O=Horizon6, L=Tokyo, ST=Tokyo, C=JP"

UNCOMPRESSED_ASSET_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".ogg", ".mp3", ".wav", ".aac", ".arsc"}


def find_tool(name: str, extra_dirs: list[Path]) -> Path:
    which_hit = shutil.which(name)
    if which_hit:
        return Path(which_hit)
    for directory in extra_dirs:
        candidate = directory / name
        if candidate.exists():
            return candidate
    return extra_dirs[0] / name


def resolve_toolchain() -> dict[str, Path]:
    home = Path(os.environ.get("HOME", "/data/user/0/com.agy/files"))
    prefix = Path(os.environ.get("PREFIX", str(home / "usr")))
    android_home = Path(
        os.environ.get("ANDROID_HOME")
        or os.environ.get("ANDROID_SDK_ROOT")
        or (home / "Android")
    )
    build_tools_34 = android_home / "build-tools" / "34.0.0"

    aapt2 = find_tool("aapt2", [prefix / "bin", build_tools_34])
    javac = find_tool("javac", [prefix / "bin"])
    java_bin = find_tool("java", [prefix / "bin"])
    apksigner = find_tool("apksigner", [prefix / "bin", build_tools_34])
    keytool = find_tool(
        "keytool",
        [prefix / "lib" / "jvm" / "java-21-openjdk" / "bin", prefix / "bin"],
    )

    android_jar = android_home / "platforms" / "android-34" / "android.jar"
    r8_jar = android_home / "cmdline-tools" / "cmdline-tools" / "lib" / "r8.jar"
    d8_jar = build_tools_34 / "lib" / "d8.jar"
    dexer_jar = r8_jar if r8_jar.exists() else d8_jar

    tools = {
        "aapt2": aapt2,
        "javac": javac,
        "java": java_bin,
        "apksigner": apksigner,
        "keytool": keytool,
        "android_jar": android_jar,
        "d8_jar": dexer_jar,
    }
    for name, path in tools.items():
        if not path.exists():
            raise FileNotFoundError(f"Required toolchain component '{name}' not found at: {path}")
    return tools


def run_step(cmd: list[str], label: str) -> None:
    print(f"[build_apk] {label}: {' '.join(cmd)}")
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if proc.stdout:
        print(proc.stdout.rstrip())
    if proc.returncode != 0:
        raise RuntimeError(f"Step '{label}' failed with exit code {proc.returncode}")


def ensure_keystore(keystore_path: Path, keytool_bin: Path) -> None:
    if keystore_path.exists():
        return
    keystore_path.parent.mkdir(parents=True, exist_ok=True)
    run_step(
        [
            str(keytool_bin),
            "-genkeypair",
            "-v",
            "-keystore",
            str(keystore_path),
            "-storetype",
            "PKCS12",
            "-storepass",
            KEYSTORE_PASS,
            "-keypass",
            KEYSTORE_PASS,
            "-alias",
            KEYSTORE_ALIAS,
            "-keyalg",
            "RSA",
            "-keysize",
            "2048",
            "-validity",
            "10000",
            "-dname",
            KEYSTORE_DNAME,
        ],
        "Generate PKCS12 release keystore",
    )


def verify_zip_stored_alignment(apk_path: Path) -> None:
    """Verify every ZIP_STORED entry has data_offset % 4 == 0."""
    with open(apk_path, "rb") as fp, zipfile.ZipFile(fp, "r") as zf:
        found_arsc = False
        for info in zf.infolist():
            if info.filename == "resources.arsc":
                found_arsc = True
                if info.compress_type != zipfile.ZIP_STORED:
                    raise RuntimeError("resources.arsc must use ZIP_STORED compression")
            if info.compress_type == zipfile.ZIP_STORED:
                fp.seek(info.header_offset)
                lfh = fp.read(30)
                if len(lfh) != 30 or lfh[:4] != b"PK\x03\x04":
                    raise RuntimeError(f"Invalid local file header for {info.filename}")
                _, _, _, _, _, _, _, _, _, fname_len, extra_len = struct.unpack("<IHHHHHIIIHH", lfh)
                data_offset = info.header_offset + 30 + fname_len + extra_len
                if data_offset % 4 != 0:
                    raise RuntimeError(
                        f"Unaligned ZIP_STORED entry '{info.filename}': data_offset={data_offset} (mod4={data_offset % 4})"
                    )
        if not found_arsc:
            raise RuntimeError("resources.arsc missing from packaged APK")


def package_and_align(unaligned_apk: Path, dex_dir: Path, aligned_apk: Path) -> None:
    dex_files = sorted(dex_dir.glob("*.dex"))
    if not dex_files:
        raise RuntimeError(f"No .dex files produced in {dex_dir}")

    with zipfile.ZipFile(unaligned_apk, "r") as zin, zipfile.ZipFile(aligned_apk, "w") as zout:
        # 1. Write all entries from aapt2 link output (resources.arsc first for optimal lookup)
        entries = zin.infolist()
        entries_sorted = sorted(entries, key=lambda e: (0 if e.filename == "resources.arsc" else 1, e.filename))

        for src_info in entries_sorted:
            data = zin.read(src_info.filename)
            ext = Path(src_info.filename).suffix.lower()
            should_store = (
                src_info.filename == "resources.arsc"
                or src_info.compress_type == zipfile.ZIP_STORED
                or ext in UNCOMPRESSED_ASSET_EXTS
            )

            dst_info = zipfile.ZipInfo(src_info.filename, date_time=src_info.date_time)
            dst_info.external_attr = src_info.external_attr
            dst_info.extra = b""

            if should_store:
                dst_info.compress_type = zipfile.ZIP_STORED
                # Calculate exact data offset after local file header (30 bytes + filename + extra)
                zout.fp.flush()
                header_offset = zout.fp.tell()
                fname_len = len(dst_info.filename.encode("utf-8"))
                base_end = header_offset + 30 + fname_len
                pad = (4 - (base_end % 4)) % 4
                if pad:
                    dst_info.extra = b"\x00" * pad
            else:
                dst_info.compress_type = zipfile.ZIP_DEFLATED

            zout.writestr(dst_info, data)

        # 2. Add compiled DEX file(s)
        for dex_path in dex_files:
            dex_info = zipfile.ZipInfo(dex_path.name, date_time=(2026, 1, 1, 0, 0, 0))
            dex_info.compress_type = zipfile.ZIP_DEFLATED
            zout.writestr(dex_info, dex_path.read_bytes())

    verify_zip_stored_alignment(aligned_apk)
    print(f"[build_apk] Packaged & 4-byte aligned: {aligned_apk}")


def build_apk(
    assets_dir: Path,
    out_apk: Path,
    copy_to: Path | None,
    build_dir: Path,
    keystore_path: Path,
) -> None:
    if not assets_dir.is_dir():
        raise FileNotFoundError(f"Assets directory does not exist: {assets_dir}")

    manifest_path = PROJECT_ROOT / "app" / "AndroidManifest.xml"
    res_dir = PROJECT_ROOT / "app" / "src" / "main" / "res"
    java_src_dir = PROJECT_ROOT / "app" / "src" / "main" / "java"

    if not manifest_path.is_file():
        raise FileNotFoundError(f"Missing manifest: {manifest_path}")
    if not res_dir.is_dir():
        raise FileNotFoundError(f"Missing res directory: {res_dir}")
    if not java_src_dir.is_dir():
        raise FileNotFoundError(f"Missing Java source directory: {java_src_dir}")

    tools = resolve_toolchain()
    ensure_keystore(keystore_path, tools["keytool"])

    if build_dir.exists():
        shutil.rmtree(build_dir)
    gen_dir = build_dir / "gen"
    classes_dir = build_dir / "classes"
    dex_dir = build_dir / "dex"
    gen_dir.mkdir(parents=True, exist_ok=True)
    classes_dir.mkdir(parents=True, exist_ok=True)
    dex_dir.mkdir(parents=True, exist_ok=True)

    res_zip = build_dir / "res.zip"
    unaligned_apk = build_dir / "unaligned.apk"
    aligned_apk = build_dir / "aligned.apk"

    # 1. aapt2 compile
    run_step(
        [str(tools["aapt2"]), "compile", "--dir", str(res_dir), "-o", str(res_zip)],
        "aapt2 compile",
    )

    # 2. aapt2 link
    run_step(
        [
            str(tools["aapt2"]),
            "link",
            "-o",
            str(unaligned_apk),
            "--manifest",
            str(manifest_path),
            "-I",
            str(tools["android_jar"]),
            "-A",
            str(assets_dir),
            "--java",
            str(gen_dir),
            "--min-sdk-version",
            "24",
            "--target-sdk-version",
            "34",
            str(res_zip),
        ],
        "aapt2 link",
    )

    # 3. javac --release 11
    java_files = sorted(
        [str(p) for p in java_src_dir.rglob("*.java")]
        + [str(p) for p in gen_dir.rglob("*.java")]
    )
    if not java_files:
        raise RuntimeError("No Java source files found")

    run_step(
        [
            str(tools["javac"]),
            "--release",
            "11",
            "-Xlint:unchecked",
            "-classpath",
            str(tools["android_jar"]),
            "-d",
            str(classes_dir),
            *java_files,
        ],
        "javac compile",
    )

    # 4. d8 DEX compilation
    class_files = sorted(str(p) for p in classes_dir.rglob("*.class"))
    if not class_files:
        raise RuntimeError("No .class files produced by javac")

    run_step(
        [
            str(tools["java"]),
            "-cp",
            str(tools["d8_jar"]),
            "com.android.tools.r8.D8",
            "--min-api",
            "24",
            "--lib",
            str(tools["android_jar"]),
            "--output",
            str(dex_dir),
            *class_files,
        ],
        "d8 DEX compilation",
    )

    # 5. Merge + 4-byte align
    package_and_align(unaligned_apk, dex_dir, aligned_apk)

    # 6. apksigner sign
    out_apk.parent.mkdir(parents=True, exist_ok=True)
    run_step(
        [
            str(tools["apksigner"]),
            "sign",
            "--ks",
            str(keystore_path),
            "--ks-type",
            "PKCS12",
            "--ks-pass",
            f"pass:{KEYSTORE_PASS}",
            "--key-pass",
            f"pass:{KEYSTORE_PASS}",
            "--ks-key-alias",
            KEYSTORE_ALIAS,
            "--v1-signing-enabled",
            "true",
            "--v2-signing-enabled",
            "true",
            "--v3-signing-enabled",
            "true",
            "--out",
            str(out_apk),
            str(aligned_apk),
        ],
        "apksigner sign",
    )

    verify_zip_stored_alignment(out_apk)
    print(f"[build_apk] Signed APK ready: {out_apk} ({out_apk.stat().st_size} bytes)")

    # 7. Copy to Download destination if enabled
    if copy_to is not None:
        copy_to.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(out_apk, copy_to)
        print(f"[build_apk] Copied signed APK to: {copy_to}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build and sign Horizon 6: Japan 3D APK")
    parser.add_argument(
        "--assets-dir",
        type=Path,
        default=DEFAULT_ASSETS_DIR,
        help=f"Path to web assets directory (default: {DEFAULT_ASSETS_DIR})",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT_APK,
        help=f"Output signed APK path (default: {DEFAULT_OUT_APK})",
    )
    parser.add_argument(
        "--copy-to",
        type=Path,
        default=DEFAULT_COPY_TO,
        help=f"Destination copy path (default: {DEFAULT_COPY_TO})",
    )
    parser.add_argument(
        "--no-copy",
        action="store_true",
        help="Skip copying APK to --copy-to destination (useful for dry-run/smoke builds)",
    )
    parser.add_argument(
        "--build-dir",
        type=Path,
        default=DEFAULT_BUILD_DIR,
        help=f"Intermediate build directory (default: {DEFAULT_BUILD_DIR})",
    )
    parser.add_argument(
        "--keystore",
        type=Path,
        default=DEFAULT_KEYSTORE,
        help=f"PKCS12 keystore path (default: {DEFAULT_KEYSTORE})",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    copy_dest = None if args.no_copy else args.copy_to
    try:
        build_apk(
            assets_dir=args.assets_dir.resolve(),
            out_apk=args.out.resolve(),
            copy_to=copy_dest.resolve() if copy_dest is not None else None,
            build_dir=args.build_dir.resolve(),
            keystore_path=args.keystore.resolve(),
        )
    except Exception as exc:
        print(f"[build_apk] ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
