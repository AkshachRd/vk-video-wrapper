# Android build (Tauri mobile)

Status: the Android target is **scaffolded and committed** (`src-tauri/gen/android`).
`tauri android init` ran successfully on the dev machine on 2026-06-15. A full APK
build/run was **not** executed in that pass — the commands below are the path to
do it.

The mobile UI is selected automatically at runtime: `usePlatform()` (src/lib/
platform/use-platform.ts) reads `@tauri-apps/plugin-os` `platform()`, and on
`android`/`ios` renders the mobile shell (`src/app/mobile-app.tsx`); orientation
(`useOrientation`) switches portrait ↔ landscape. Desktop is unaffected.

## Prerequisites

Tauri auto-detects an Android Studio install, so explicit env vars are optional if
Android Studio is present. Required pieces:

- **JDK 17+** — Android Studio ships its own JBR; Tauri uses
  `…/Android Studio/jbr` automatically. Otherwise set `JAVA_HOME` to a JDK 17.
- **Android SDK** + platform-tools — Tauri found it at
  `%LOCALAPPDATA%\Android\Sdk`. Otherwise set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`).
- **Android NDK** — detected at `…\Android\Sdk\ndk\<version>` (29.x here).
  Otherwise set `NDK_HOME` to the NDK folder.
- **Rust Android targets** (needed for `build`/`dev`):
  ```powershell
  rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
  ```

Verify env (PowerShell): `$env:ANDROID_HOME`, `$env:NDK_HOME`, `$env:JAVA_HOME`.

## Commands

Run from the repo root. Use Node `24.14.0` (see AGENTS.md / fnm note).

```powershell
# (re)generate the native project — already committed, only needed after a clean checkout
npm run tauri android init

# live dev on a connected device/emulator (adb reverse forwards the Vite dev server)
npm run tauri android dev

# release-ish APK/AAB (runs `npm run build` via beforeBuildCommand, bundles ../dist)
npm run tauri android build
```

`tauri android dev` needs a running emulator or a USB device with debugging on.
List devices with `adb devices`.

## On-device re-checks (not verifiable on the Windows dev box)

- **VK iframe + JS API**: the player runs inside Android System WebView (Chromium).
  Confirm the `vk.com/video_ext.php` iframe loads and the `VK.VideoPlayer` bridge
  fires events on-device.
- **CSP**: `src-tauri/tauri.conf.json` `app.security.csp` (allowing `vk.com`,
  `vkvideo.ru`, `*.userapi.com`, `*.okcdn.ru`) applies to the Android WebView too —
  re-check that subtitle fetches and the iframe aren't blocked there.
- **Orientation**: the generated `AndroidManifest.xml` activity handles
  `orientation|screenSize` itself (no recreate), so `useOrientation()` flips the
  layout in place. Confirm portrait sheets ↔ landscape side-panels on rotation.
- **INTERNET** permission is present in the manifest.

## What is committed

`src-tauri/gen/android` is committed (40 files, no machine-specific paths). Tauri's
nested `.gitignore` there excludes build output, `local.properties`, keystores and
generated glue. The project is regenerable at any time with `tauri android init`.
