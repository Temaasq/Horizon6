# Horizon 6: Japan 3D

Offline 3D open-world racing game for Android featuring a textured **Mercedes-Benz C63 AMG W204** (`.glb` with 15 materials & 9 textures) and a Japan map.

## Repository Contents
- `app/`, `scripts/`, `tests/`, `keystore/` — Full Android WebView + Three.js APK source and verification/build pipeline.
- `.github/workflows/release.yml` — GitHub Actions CI/CD that runs tests (`node --test`), builds & signs `horizon6_japan_3d.apk`, verifies it (`verify_apk.py`), and publishes it to **Releases**.
- `horizon6_japan_3d.apk` — Latest signed Android APK.
- `godot_project/` — Godot 4 3D project source (scenes, GDScript car physics, touch controls, and Mercedes C63 AMG assets).

## Releases via GitHub Actions
Every push to `main` touching `app/**`, `scripts/**`, `tests/**`, or `.github/workflows/release.yml` (as well as `v*` tags or manual `workflow_dispatch`) automatically builds, verifies, and publishes `horizon6_japan_3d.apk` under **Releases**.
