import hashlib
import os
import re
import struct
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

PROJECT_ROOT = Path('/data/user/0/com.agy/files/teamwork_projects/horizon6_3d_apk')
ASSETS_DIR = PROJECT_ROOT / 'app' / 'src' / 'main' / 'assets'
MAIN_ACTIVITY = (
    PROJECT_ROOT
    / 'app'
    / 'src'
    / 'main'
    / 'java'
    / 'com'
    / 'horizon6'
    / 'japan3d'
    / 'MainActivity.java'
)
PROJECT_APK = PROJECT_ROOT / 'horizon6_japan_3d.apk'
DOWNLOAD_APK = Path('/storage/emulated/0/Download/horizon6_japan_3d.apk')

HTTP_PATTERN = re.compile(r'https?://', re.IGNORECASE)

REQUIRED_ASSET_FILES = [
    'assets/index.html',
    'assets/css/style.css',
    'assets/vendor/three.min.js',
    'assets/vendor/GLTFLoader.js',
    'assets/models/mercedes_c63.glb',
    'assets/js/cars.js',
    'assets/js/world_data.js',
    'assets/js/physics.js',
    'assets/js/car_models.js',
    'assets/js/world_meshes.js',
    'assets/js/renderer3d.js',
    'assets/js/controls.js',
    'assets/js/audio.js',
    'assets/js/hud.js',
    'assets/js/main.js',
]

REMOVED_PLACEHOLDER_GLBS = [
    'assets/models/car1_truck.glb',
    'assets/models/car2_dragster.glb',
    'assets/models/car3_minivan.glb',
]


def scan_tree_for_http(root_dir: Path):
    matches = []
    for path in sorted(root_dir.rglob('*')):
        if not path.is_file():
            continue
        raw = path.read_bytes()
        text = raw.decode('utf-8', errors='replace')
        for lineno, line in enumerate(text.splitlines(), start=1):
            if HTTP_PATTERN.search(line):
                matches.append(f'{path.relative_to(root_dir)}:{lineno}: {line.strip()[:120]}')
    return matches


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


class TestOfflineAndApkDeliverable(unittest.TestCase):
    def test_01_source_assets_zero_http_https(self):
        self.assertTrue(ASSETS_DIR.is_dir(), f'Missing assets dir: {ASSETS_DIR}')
        index_html = ASSETS_DIR / 'index.html'
        self.assertTrue(index_html.is_file(), f'Missing {index_html}')
        html_text = index_html.read_text(encoding='utf-8')
        self.assertNotIn('type="module"', html_text.lower(), 'ES modules are disallowed in offline WebView')
        self.assertNotIn("type='module'", html_text.lower(), 'ES modules are disallowed in offline WebView')

        matches = scan_tree_for_http(ASSETS_DIR)
        self.assertEqual(
            matches,
            [],
            f'Found external http(s):// references in {ASSETS_DIR}:\n' + '\n'.join(matches[:20]),
        )

    def test_02_android_manifest_offline_and_gles(self):
        manifest_candidates = [
            PROJECT_ROOT / 'app' / 'AndroidManifest.xml',
            PROJECT_ROOT / 'app' / 'src' / 'main' / 'AndroidManifest.xml',
        ]
        manifest_path = next((p for p in manifest_candidates if p.is_file()), None)
        self.assertIsNotNone(manifest_path, f'Missing AndroidManifest.xml in {manifest_candidates}')

        xml_text = manifest_path.read_text(encoding='utf-8')
        self.assertIsNone(
            HTTP_PATTERN.search(
                re.sub(r'xmlns:[a-zA-Z0-9_]+="http://schemas\.android\.com/apk/res/android"', '', xml_text)
            ),
            'Unexpected non-xmlns http(s):// URL in AndroidManifest.xml',
        )

        root = ET.fromstring(xml_text)
        self.assertEqual(root.attrib.get('package'), 'com.horizon6.japan3d')

        android_ns = '{http://schemas.android.com/apk/res/android}'
        perms = [el.attrib.get(f'{android_ns}name', '') for el in root.findall('uses-permission')]
        self.assertNotIn('android.permission.INTERNET', perms, 'INTERNET permission must be omitted')

        features = root.findall('uses-feature')
        has_gles2 = any(f.attrib.get(f'{android_ns}glEsVersion') == '0x00020000' for f in features)
        self.assertTrue(has_gles2, 'AndroidManifest must declare glEsVersion 0x00020000')

        app_el = root.find('application')
        self.assertIsNotNone(app_el)
        self.assertEqual(app_el.attrib.get(f'{android_ns}hardwareAccelerated'), 'true')

        activities = app_el.findall('activity')
        self.assertTrue(activities, 'Manifest must declare MainActivity')
        main_act = activities[0]
        self.assertIn('MainActivity', main_act.attrib.get(f'{android_ns}name', ''))
        self.assertIn('landscape', main_act.attrib.get(f'{android_ns}screenOrientation', '').lower())

    def test_03_main_activity_webview_offline_hardening(self):
        self.assertTrue(MAIN_ACTIVITY.is_file(), f'Missing {MAIN_ACTIVITY}')
        java_src = MAIN_ACTIVITY.read_text(encoding='utf-8')
        self.assertIsNone(HTTP_PATTERN.search(java_src), 'MainActivity.java must contain zero http(s):// URLs')
        self.assertIn('setBlockNetworkLoads(true)', java_src)
        self.assertIn('setJavaScriptEnabled(true)', java_src)
        self.assertIn('setDomStorageEnabled(true)', java_src)
        self.assertIn('file:///android_asset/index.html', java_src)
        self.assertIn('AndroidBridge', java_src)
        self.assertIn('readAssetBase64', java_src)
        self.assertIn('SensorManager', java_src)
        self.assertIn('HorizonBridge', java_src)

    def test_04_dual_apk_deliverables_exist_and_identical_sha256(self):
        self.assertTrue(PROJECT_APK.is_file(), f'Missing project APK: {PROJECT_APK}')
        self.assertTrue(DOWNLOAD_APK.is_file(), f'Missing Download APK: {DOWNLOAD_APK}')

        proj_size = PROJECT_APK.stat().st_size
        dl_size = DOWNLOAD_APK.stat().st_size
        self.assertGreater(proj_size, 100_000, f'Project APK unexpectedly small: {proj_size} bytes')
        self.assertEqual(proj_size, dl_size, f'APK size mismatch: {proj_size} vs {dl_size}')

        proj_sha = sha256_file(PROJECT_APK)
        dl_sha = sha256_file(DOWNLOAD_APK)
        self.assertEqual(proj_sha, dl_sha, f'SHA-256 mismatch between {PROJECT_APK} and {DOWNLOAD_APK}')

    def test_05_apk_unzip_contents_alignment_and_zero_http_in_packed_assets(self):
        for apk_path in (PROJECT_APK, DOWNLOAD_APK):
            res = subprocess.run(['unzip', '-l', str(apk_path)], capture_output=True, text=True, check=False)
            self.assertEqual(res.returncode, 0, f'unzip -l failed on {apk_path}: {res.stderr}')
            listing = res.stdout

            for required in ['classes.dex', 'AndroidManifest.xml', 'resources.arsc', *REQUIRED_ASSET_FILES]:
                self.assertIn(required, listing, f'{apk_path} missing {required} in unzip -l')
            for removed in REMOVED_PLACEHOLDER_GLBS:
                self.assertNotIn(removed, listing, f'{apk_path} must not contain removed placeholder {removed}')

            with zipfile.ZipFile(apk_path, 'r') as zf:
                arsc = zf.getinfo('resources.arsc')
                self.assertEqual(arsc.compress_type, zipfile.ZIP_STORED, 'resources.arsc must be ZIP_STORED')
                with apk_path.open('rb') as raw_fp:
                    raw_fp.seek(arsc.header_offset + 26)
                    fname_len, extra_len = struct.unpack('<HH', raw_fp.read(4))
                    data_offset = arsc.header_offset + 30 + fname_len + extra_len
                    self.assertEqual(
                        data_offset % 4,
                        0,
                        f'{apk_path} resources.arsc data_offset={data_offset} is not 4-byte aligned',
                    )

                with tempfile.TemporaryDirectory() as tmpdir:
                    tmp_path = Path(tmpdir)
                    for info in zf.infolist():
                        if info.filename.startswith('assets/') and not info.is_dir():
                            zf.extract(info, tmp_path)
                    packed_matches = scan_tree_for_http(tmp_path / 'assets')
                    self.assertEqual(
                        packed_matches,
                        [],
                        f'Found http(s):// inside packed {apk_path} assets:\n' + '\n'.join(packed_matches[:20]),
                    )

    def test_06_aapt2_dump_badging_both_apks(self):
        for apk_path in (PROJECT_APK, DOWNLOAD_APK):
            res = subprocess.run(
                ['aapt2', 'dump', 'badging', str(apk_path)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(res.returncode, 0, f'aapt2 dump badging failed on {apk_path}: {res.stderr}')
            out = res.stdout
            self.assertIn("package: name='com.horizon6.japan3d'", out)
            self.assertIn("launchable-activity: name='com.horizon6.japan3d.MainActivity'", out)
            self.assertNotIn("uses-permission: name='android.permission.INTERNET'", out)

    def test_07_apksigner_verify_verbose_both_apks(self):
        for apk_path in (PROJECT_APK, DOWNLOAD_APK):
            res = subprocess.run(
                ['apksigner', 'verify', '--verbose', str(apk_path)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(
                res.returncode,
                0,
                f'apksigner verify failed on {apk_path}:\nSTDOUT:\n{res.stdout}\nSTDERR:\n{res.stderr}',
            )
            self.assertIn('Verifies', res.stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
