#!/usr/bin/env python3
"""APK & offline-asset verification suite for Horizon 6: Japan 3D.

Checks:
  1. Zero http:// or https:// strings in --assets-dir (if provided/present).
  2. Zero http:// or https:// strings in unpacked APK assets/ entries.
  3. aapt2 dump badging confirms package 'com.horizon6.japan3d', launchable
     MainActivity, and absence of android.permission.INTERNET.
  4. unzip -l and Python zipfile verify classes.dex, AndroidManifest.xml,
     4-byte aligned ZIP_STORED resources.arsc, and bundled assets.
  5. apksigner verify --verbose passes with exit code 0.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import struct
import subprocess
import sys
import zipfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ASSETS_DIR = PROJECT_ROOT / "app" / "src" / "main" / "assets"
DEFAULT_APK = PROJECT_ROOT / "horizon6_japan_3d.apk"

HTTP_PATTERN = re.compile(rb"https?://", re.IGNORECASE)
EXPECTED_PACKAGE = "com.horizon6.japan3d"
EXPECTED_ACTIVITY = "com.horizon6.japan3d.MainActivity"


def find_tool(name: str, extra_dirs: list[Path]) -> Path:
    which_hit = shutil.which(name)
    if which_hit:
        return Path(which_hit)
    for directory in extra_dirs:
        candidate = directory / name
        if candidate.exists():
            return candidate
    return extra_dirs[0] / name


def resolve_tools() -> dict[str, Path]:
    home = Path(os.environ.get("HOME", "/data/user/0/com.agy/files"))
    prefix = Path(os.environ.get("PREFIX", str(home / "usr")))
    android_home = Path(
        os.environ.get("ANDROID_HOME")
        or os.environ.get("ANDROID_SDK_ROOT")
        or (home / "Android")
    )
    build_tools_34 = android_home / "build-tools" / "34.0.0"

    aapt2 = find_tool("aapt2", [prefix / "bin", build_tools_34])
    apksigner = find_tool("apksigner", [prefix / "bin", build_tools_34])
    unzip = find_tool("unzip", [prefix / "bin"])

    tools = {"aapt2": aapt2, "apksigner": apksigner, "unzip": unzip}
    for name, path in tools.items():
        if not path.exists():
            raise FileNotFoundError(f"Required verification tool '{name}' not found at: {path}")
    return tools


def run_checked(cmd: list[str], label: str) -> str:
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"{label} failed (exit {proc.returncode}):\n{proc.stdout.strip()}"
        )
    return proc.stdout


def scan_bytes_for_http(data: bytes, source_label: str) -> list[str]:
    violations: list[str] = []
    for match in HTTP_PATTERN.finditer(data):
        start = max(0, match.start() - 24)
        end = min(len(data), match.end() + 48)
        snippet = data[start:end].decode("utf-8", errors="replace").replace("\n", " ")
        violations.append(f"{source_label} @ byte {match.start()}: ...{snippet}...")
    return violations


def audit_assets_dir(assets_dir: Path) -> None:
    if not assets_dir.is_dir():
        raise FileNotFoundError(f"Assets directory not found: {assets_dir}")

    files = sorted(p for p in assets_dir.rglob("*") if p.is_file())
    if not files:
        raise RuntimeError(f"Assets directory is empty: {assets_dir}")

    violations: list[str] = []
    for fpath in files:
        rel = fpath.relative_to(assets_dir)
        violations.extend(scan_bytes_for_http(fpath.read_bytes(), f"assets_dir/{rel}"))

    if violations:
        raise RuntimeError(
            "External http(s):// references detected in assets directory:\n  "
            + "\n  ".join(violations[:20])
        )
    print(f"[verify_apk] Offline assets dir audit passed ({len(files)} files, 0 http/https matches): {assets_dir}")


def verify_single_apk(apk_path: Path, tools: dict[str, Path]) -> None:
    if not apk_path.is_file():
        raise FileNotFoundError(f"APK not found: {apk_path}")

    print(f"\n[verify_apk] === Verifying APK: {apk_path} ({apk_path.stat().st_size} bytes) ===")

    # 1. aapt2 dump badging + permissions
    badging = run_checked([str(tools["aapt2"]), "dump", "badging", str(apk_path)], "aapt2 dump badging")
    if f"package: name='{EXPECTED_PACKAGE}'" not in badging:
        raise RuntimeError(f"Unexpected package in badging output:\n{badging}")
    if f"launchable-activity: name='{EXPECTED_ACTIVITY}'" not in badging:
        raise RuntimeError(f"Missing launchable-activity '{EXPECTED_ACTIVITY}' in badging:\n{badging}")

    perms = run_checked([str(tools["aapt2"]), "dump", "permissions", str(apk_path)], "aapt2 dump permissions")
    if "android.permission.INTERNET" in perms:
        raise RuntimeError(f"Forbidden INTERNET permission present in APK:\n{perms}")
    print("[verify_apk] aapt2 badging & offline permissions OK")

    # 2. unzip -l
    unzip_out = run_checked([str(tools["unzip"]), "-l", str(apk_path)], "unzip -l")
    for required_entry in ("AndroidManifest.xml", "classes.dex", "resources.arsc"):
        if required_entry not in unzip_out:
            raise RuntimeError(f"Missing '{required_entry}' in unzip -l output")

    # 3. Zip structure, bundled assets audit, and 4-byte alignment check
    asset_count = 0
    violations: list[str] = []
    arsc_aligned = False

    with open(apk_path, "rb") as fp, zipfile.ZipFile(fp, "r") as zf:
        names = set(zf.namelist())
        for required_entry in ("AndroidManifest.xml", "classes.dex", "resources.arsc", "assets/index.html"):
            if required_entry not in names:
                raise RuntimeError(f"Missing required APK entry: {required_entry}")

        for info in zf.infolist():
            if info.filename.startswith("assets/") and not info.is_dir():
                asset_count += 1
                violations.extend(scan_bytes_for_http(zf.read(info.filename), f"apk:{info.filename}"))

            if info.compress_type == zipfile.ZIP_STORED:
                fp.seek(info.header_offset)
                lfh = fp.read(30)
                if len(lfh) != 30 or lfh[:4] != b"PK\x03\x04":
                    raise RuntimeError(f"Invalid ZIP local file header for {info.filename}")
                _, _, _, _, _, _, _, _, _, fname_len, extra_len = struct.unpack("<IHHHHHIIIHH", lfh)
                data_offset = info.header_offset + 30 + fname_len + extra_len
                if data_offset % 4 != 0:
                    raise RuntimeError(
                        f"Unaligned ZIP_STORED entry '{info.filename}': data_offset={data_offset}"
                    )
                if info.filename == "resources.arsc":
                    arsc_aligned = True
            elif info.filename == "resources.arsc":
                raise RuntimeError("resources.arsc must be ZIP_STORED (uncompressed)")

    if not arsc_aligned:
        raise RuntimeError("resources.arsc was not verified as 4-byte aligned ZIP_STORED")
    if asset_count == 0:
        raise RuntimeError("No bundled files found under assets/ inside APK")
    if violations:
        raise RuntimeError(
            "External http(s):// references detected inside APK assets/:\n  "
            + "\n  ".join(violations[:20])
        )
    print(f"[verify_apk] ZIP structure, 4-byte alignment, & APK assets audit OK ({asset_count} asset files)")

    # 4. apksigner verify --verbose
    verify_out = run_checked(
        [str(tools["apksigner"]), "verify", "--verbose", str(apk_path)],
        "apksigner verify --verbose",
    )
    if "Verifies" not in verify_out:
        raise RuntimeError(f"apksigner verify did not report 'Verifies':\n{verify_out}")
    print("[verify_apk] apksigner verify --verbose PASSED:")
    for line in verify_out.splitlines():
        if line.strip():
            print(f"    {line}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify Horizon 6: Japan 3D APK and offline assets")
    parser.add_argument(
        "--apk",
        type=Path,
        action="append",
        dest="apks",
        help=f"APK path to verify (may be passed multiple times; default: {DEFAULT_APK})",
    )
    parser.add_argument(
        "--assets-dir",
        type=Path,
        default=DEFAULT_ASSETS_DIR,
        help=f"Assets directory to audit (default: {DEFAULT_ASSETS_DIR})",
    )
    parser.add_argument(
        "--skip-assets-dir",
        action="store_true",
        help="Skip auditing the source --assets-dir (still audits unpacked APK assets/)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    apk_paths = args.apks if args.apks else [DEFAULT_APK]
    try:
        tools = resolve_tools()
        if not args.skip_assets_dir:
            audit_assets_dir(args.assets_dir.resolve())
        for apk_path in apk_paths:
            verify_single_apk(apk_path.resolve(), tools)
    except Exception as exc:
        print(f"[verify_apk] ERROR: {exc}", file=sys.stderr)
        return 1
    print("\n[verify_apk] ALL CHECKS PASSED.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
