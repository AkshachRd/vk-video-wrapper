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
and the symlink into `app/src/main/jniLibs/arm64-v8a`. Gradle/APK packaging is blocked
by **two machine-environment issues** (independent of this repo's code — they would
hit any Gradle build on this box). Both were root-caused on 2026-06-15:

### Blocker 1 — Kaspersky intercepts Java's loopback (`Unable to establish loopback connection`)

Full trace: `java.io.IOException: Unable to establish loopback connection` at
`sun.nio.ch.PipeImpl$Initializer$LoopbackConnector.run`. This is Java NIO's internal
**self-pipe**: it binds a transient `127.0.0.1` listening port, connects to itself,
and verifies a secret handshake. Evidence gathered:

- A plain Java `ServerSocket` loopback test and `Pipe.open()` ×8 on the JBR both
  **succeed** in isolation — so loopback/IPv6/hosts/ports are fine (TCP dynamic range
  49152–65535, only ~67 TIME_WAIT). It only fails under Gradle's rapid port churn.
- This machine runs **Kaspersky Endpoint Security** (`avp.exe` ×2, `klnagent`
  listening on loopback ports) and a `wazuh-agent`. Kaspersky's network-traffic
  scanning connects to newly-opened loopback listeners, so it wins the race against
  PipeImpl's self-connect → the secret handshake fails → "Unable to establish loopback
  connection." Classic Kaspersky-vs-Gradle failure mode. `preferIPv4Stack`,
  `--no-daemon`, and sandbox-off do **not** help; it cannot be fixed from Gradle/Java
  config.

**Fix (needs Kaspersky admin):** in Kaspersky → Settings → *Threats and Exclusions →
Trusted applications*, add the Android Studio JBR java
(`C:\Program Files\Android\Android Studio\jbr\bin\java.exe`) with **"Do not scan
network traffic"** (or have IT exclude the build / disable Web-AntiVirus port
monitoring for it). Then the build proceeds. Building inside **Android Studio** keeps a
single long-lived daemon and may also avoid the per-run rescan.

### Blocker 2 — kotlin-dsl wants Java 8, but only a JRE exists

Once past the loopback, `:buildSrc:compileJava` fails: the `kotlin-dsl` plugin compiles
`buildSrc` against a **Java 8 toolchain**, and Gradle auto-detects the only Java 8 here
— `C:\Program Files\Java\jre1.8.0_491`, a **JRE without `javac`** →
`does not provide … [JAVA_COMPILER]`. The sole JDK on the machine is the JBR (21).

**Fix** — compile `buildSrc` with the JBR 21 instead of Java 8. With `JAVA_HOME` set to
the JBR, add to `src-tauri/gen/android/buildSrc/build.gradle.kts` (re-apply after
`tauri android init` regenerates it):
```kotlin
java {
    toolchain { languageVersion = JavaLanguageVersion.of(21) }
}
```
(Verified the override takes effect — the toolchain request switched from 8 to 21.)
Alternatively install a standard JDK 17+ and point `JAVA_HOME`/`org.gradle.java.home`
at it, which also sidesteps Blocker 1's JBR-specific scanning.

**Recommended path:** add the Kaspersky exclusion (Blocker 1), set `JAVA_HOME` to the
JBR, apply the `buildSrc` toolchain snippet (Blocker 2), then
`npm run tauri android build -- --apk`. Or open `src-tauri/gen/android` in Android
Studio and Build → Build APK(s).

## What is committed

`src-tauri/gen/android` is committed (40 files, no machine-specific paths). Tauri's
nested `.gitignore` there excludes build output, `local.properties`, keystores and
generated glue. The project is regenerable at any time with `tauri android init`.
