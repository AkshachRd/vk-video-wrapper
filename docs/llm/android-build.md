# Android build (Tauri mobile)

Status: the Android target is **scaffolded and committed** (`src-tauri/gen/android`).
`tauri android init` ran successfully on 2026-06-15, and an arm64 APK build was
attempted: the frontend + **Rust cross-compile succeed**, but Gradle packaging is
blocked by two machine-environment issues (see "Build status on this dev machine"
below). The commands below are the path to a full build once those are resolved.

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

## Build status on this dev machine (2026-06-15)

A full `tauri android build --apk --target aarch64` was attempted. **Validated end
to end:** the frontend build, the **arm64 Rust cross-compile** (full dep tree incl.
bundled SQLite + reqwest, via the NDK; `libvk_video_wrapper_lib.so` built in ~1m20s)
and the symlink into `app/src/main/jniLibs/arm64-v8a`. The Gradle/APK packaging step
is blocked by **two machine-environment issues** (independent of this repo's code —
they would hit any Gradle/Android build on this box):

1. **Intermittent Gradle loopback failure** — `java.io.IOException: Unable to
   establish loopback connection` at Gradle bootstrap. Reproduced with the sandbox
   off, `-Djava.net.preferIPv4Stack=true`, and `org.gradle.daemon=false`; a bare
   `gradlew --no-daemon` sometimes gets past it (it's flaky). Gradle/Java can't
   reliably open a `127.0.0.1` socket here — usually **security software (AV/EDR/
   firewall) intercepting java loopback**, or a loopback/hosts misconfig. Fixes to
   try: add an AV/firewall exclusion for the Android Studio JBR `java.exe` and the
   Gradle daemon; confirm `127.0.0.1 localhost` in
   `C:\Windows\System32\drivers\etc\hosts`.

2. **Stray JRE 8 picked as the Java toolchain** — once past the loopback, Gradle
   auto-detected `C:\Program Files\Java\jre1.8.0_491` (a JRE, no `javac`) for
   `:buildSrc:compileJava` → `does not provide … [JAVA_COMPILER]`. Fix: pin the
   JDK. Put this in your **global** `~/.gradle/gradle.properties`
   (`C:\Users\<you>\.gradle\gradle.properties`) so the committed project file stays
   portable:
   ```properties
   org.gradle.java.home=C:/Program Files/Android/Android Studio/jbr
   org.gradle.java.installations.auto-detect=false
   ```

**Recommended path:** open `src-tauri/gen/android` in **Android Studio** and Build →
Build APK(s). The IDE manages the JDK/toolchain and daemon itself and typically
sidesteps both issues. For more signal on the loopback error from the CLI, run
`src-tauri/gen/android/gradlew.bat help --stacktrace`.

## What is committed

`src-tauri/gen/android` is committed (40 files, no machine-specific paths). Tauri's
nested `.gitignore` there excludes build output, `local.properties`, keystores and
generated glue. The project is regenerable at any time with `tauri android init`.
