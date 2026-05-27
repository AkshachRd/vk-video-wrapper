# VK Video Dual Subtitles MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri + React MVP that loads public VK Video subtitles from VK's own embed data, synchronizes them with the VK iframe player, and shows a word-only popover on subtitle word click.

**Architecture:** The Rust/Tauri backend owns VK network access, URL parsing, `video_ext.php` fetching, subtitle metadata extraction, and subtitle file downloading. The React frontend owns WebVTT parsing, VK player time synchronization, subtitle rendering, and shadcn UI. The internal subtitle model includes `primary` and future `secondary` lanes, but the MVP UI only renders `primary`.

**Tech Stack:** Tauri 2, Rust, reqwest, serde, thiserror, React, TypeScript, Vite, Vitest, Testing Library, Tailwind CSS, shadcn-style components, Radix Popover.

---

## File Structure

Create or modify these paths:

- `package.json` - npm scripts and frontend dependencies.
- `vite.config.ts` - Vite, React, Tailwind, and Vitest config.
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` - TypeScript path aliases and project config.
- `src/main.tsx` - React bootstrap.
- `src/App.tsx` - top-level app state and Tauri command integration.
- `src/styles.css` - Tailwind import and application styles.
- `src/lib/subtitles/types.ts` - shared subtitle lane, cue, word, and track types.
- `src/lib/subtitles/parse-webvtt.ts` - WebVTT/SRT-like parser and word tokenizer.
- `src/lib/subtitles/select-active-cue.ts` - current-time cue selection.
- `src/lib/subtitles/parse-webvtt.test.ts` - parser tests.
- `src/lib/subtitles/select-active-cue.test.ts` - active cue tests.
- `src/lib/vk-player/vk-player-bridge.ts` - browser wrapper around `VK.VideoPlayer`.
- `src/lib/vk-player/vk-player-bridge.test.ts` - bridge tests with a fake VK player.
- `src/components/subtitle-overlay.tsx` - clickable subtitle overlay.
- `src/components/subtitle-overlay.test.tsx` - UI behavior tests.
- `src/components/video-player.tsx` - iframe player wrapper.
- `src/components/ui/button.tsx` - shadcn-style Button.
- `src/components/ui/input.tsx` - shadcn-style Input.
- `src/components/ui/alert.tsx` - shadcn-style Alert.
- `src/components/ui/popover.tsx` - shadcn-style Popover using Radix.
- `src/lib/utils.ts` - `cn()` class helper.
- `src/test/setup.ts` - Vitest DOM setup.
- `src-tauri/Cargo.toml` - Rust dependencies.
- `src-tauri/tauri.conf.json` - Tauri config and CSP.
- `src-tauri/src/lib.rs` - command registration.
- `src-tauri/src/main.rs` - app entrypoint.
- `src-tauri/src/vk/mod.rs` - backend module root.
- `src-tauri/src/vk/link_parser.rs` - public VK URL parser.
- `src-tauri/src/vk/embed.rs` - embed HTML fetch and subtitle metadata extraction.
- `src-tauri/src/vk/subtitles.rs` - subtitle URL fetcher and track selection.
- `src-tauri/src/vk/command.rs` - `load_video_from_url` Tauri command.
- `src-tauri/src/vk/errors.rs` - typed backend errors.
- `src-tauri/tests/fixtures/embed_with_subtitles.html` - representative VK embed fixture.
- `src-tauri/tests/fixtures/embed_without_subtitles.html` - missing subtitles fixture.

## Execution Notes

- Work only in `D:\Projects\vk-video-wrapper\.worktrees\codex-vk-subtitles-mvp`.
- Do not edit `D:\Projects\vk-video-wrapper` directly.
- Do not revert user or other-agent changes.
- Use TDD for behavior code: write the failing test, run it, implement, then rerun.
- Commit after each task.
- If `node -v` is below `v20.19.0`, use a newer Node only for that shell session, for example `fnm use 24.14.0`, then rerun the command. Do not change the global/default fnm version.

---

### Task 1: Scaffold Tauri React App And Test Harness

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/test/setup.ts`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/alert.tsx`
- Create: `src/components/ui/popover.tsx`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/main.rs`

- [ ] **Step 1: Scaffold the app non-interactively**

Run in the worktree:

```powershell
node -v
npx --yes create-tauri-app@latest vk-video-wrapper-scaffold --template react-ts --manager npm --identifier com.codex.vkvideowrapper --tauri-version 2 --yes
```

Expected: a `vk-video-wrapper-scaffold` directory is created with React + TypeScript + Tauri 2 files.

Copy scaffold contents into the worktree root without overwriting `docs/`:

```powershell
Copy-Item -Path .\vk-video-wrapper-scaffold\* -Destination . -Recurse -Force
Remove-Item -LiteralPath .\vk-video-wrapper-scaffold -Recurse -Force
```

- [ ] **Step 2: Install frontend test and UI dependencies**

Run:

```powershell
npm install
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install @tauri-apps/api @radix-ui/react-popover class-variance-authority clsx tailwind-merge lucide-react tailwindcss @tailwindcss/vite
```

Expected: `package-lock.json` exists and `node_modules` is installed.

- [ ] **Step 3: Configure Vite and Vitest**

Replace `vite.config.ts` with:

```ts
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
})
```

- [ ] **Step 4: Configure TypeScript aliases**

Ensure `tsconfig.json` contains references and shared path config:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Ensure `tsconfig.app.json` has:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowImportingTsExtensions": true,
    "module": "ESNext",
    "moduleDetection": "force",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Add test setup and UI helpers**

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest"
```

Create `src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Create `src/styles.css`:

```css
@import "tailwindcss";

:root {
  color: #f8fafc;
  background: #0b0f14;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 960px;
  min-height: 720px;
}

button,
input {
  font: inherit;
}
```

- [ ] **Step 6: Add shadcn-style primitives**

Create `src/components/ui/button.tsx`:

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost"
}

const variants = {
  default: "bg-sky-500 text-white hover:bg-sky-400 focus-visible:ring-sky-300",
  secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 focus-visible:ring-slate-500",
  ghost: "bg-transparent text-slate-200 hover:bg-slate-800 focus-visible:ring-slate-500",
}

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
```

Create `src/components/ui/input.tsx`:

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30",
        className,
      )}
      {...props}
    />
  )
}
```

Create `src/components/ui/alert.tsx`:

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

export function Alert({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="alert"
      className={cn("rounded-md border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100", className)}
      {...props}
    />
  )
}
```

Create `src/components/ui/popover.tsx`:

```tsx
import * as PopoverPrimitive from "@radix-ui/react-popover"
import * as React from "react"
import { cn } from "@/lib/utils"

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 shadow-lg outline-none",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName
```

- [ ] **Step 7: Replace bootstrap files**

Create `src/main.tsx`:

```tsx
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./styles.css"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

Create initial `src/App.tsx`:

```tsx
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function App() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <form className="mx-auto flex max-w-5xl gap-2">
        <Input aria-label="VK Video URL" placeholder="https://vkvideo.ru/video-..." />
        <Button type="submit">Load</Button>
      </form>
    </main>
  )
}
```

- [ ] **Step 8: Configure package scripts**

Ensure `package.json` scripts include:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "tauri": "tauri"
  }
}
```

- [ ] **Step 9: Configure Tauri CSP for VK iframe and scripts**

In `src-tauri/tauri.conf.json`, ensure the app uses Vite and allows VK script/frame sources:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "vk-video-wrapper",
  "version": "0.1.0",
  "identifier": "com.codex.vkvideowrapper",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "VK Video Wrapper",
        "width": 1180,
        "height": 820
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' https://vk.com; frame-src https://vk.com https://vkvideo.ru; connect-src 'self' ipc: http://ipc.localhost https://vk.com https://vkvideo.ru https://*.okcdn.ru https://*.userapi.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.userapi.com https://*.vk.com https://*.okcdn.ru"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": []
  }
}
```

- [ ] **Step 10: Verify scaffold**

Run:

```powershell
npm test -- --run
npm run build
cd src-tauri
cargo test
cd ..
git status --short
```

Expected: Vitest reports no failing tests, frontend build succeeds, Rust tests pass or report zero tests, and only intended scaffold files are modified.

- [ ] **Step 11: Commit**

```powershell
git add .
git commit -m "chore: scaffold Tauri React app"
```

---

### Task 2: Backend VK Loading Pipeline

**Files:**
- Create: `src-tauri/src/vk/mod.rs`
- Create: `src-tauri/src/vk/link_parser.rs`
- Create: `src-tauri/src/vk/embed.rs`
- Create: `src-tauri/src/vk/subtitles.rs`
- Create: `src-tauri/src/vk/command.rs`
- Create: `src-tauri/src/vk/errors.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/tests/fixtures/embed_with_subtitles.html`
- Create: `src-tauri/tests/fixtures/embed_without_subtitles.html`

- [ ] **Step 1: Add Rust dependencies**

In `src-tauri/Cargo.toml`, add:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
url = "2"
regex = "1"
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
```

- [ ] **Step 2: Write failing link parser tests**

Create `src-tauri/src/vk/link_parser.rs` with tests first:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_vkvideo_url_with_negative_owner() {
        let id = parse_vk_video_url("https://vkvideo.ru/video-145784486_456239038").unwrap();
        assert_eq!(id.owner_id, -145784486);
        assert_eq!(id.video_id, 456239038);
    }

    #[test]
    fn parses_vkvideo_url_with_list_query() {
        let id = parse_vk_video_url(
            "https://vkvideo.ru/video-51890028_456242200?list=ln-Cg6C0nEVR81075JXFU",
        )
        .unwrap();
        assert_eq!(id.owner_id, -51890028);
        assert_eq!(id.video_id, 456242200);
        assert_eq!(id.list.as_deref(), Some("ln-Cg6C0nEVR81075JXFU"));
    }

    #[test]
    fn parses_vk_com_url() {
        let id = parse_vk_video_url("https://vk.com/video-145784486_456239038").unwrap();
        assert_eq!(id.owner_id, -145784486);
        assert_eq!(id.video_id, 456239038);
    }

    #[test]
    fn rejects_non_vk_video_url() {
        assert!(matches!(
            parse_vk_video_url("https://example.com/video-1_2"),
            Err(VkLoadError::InvalidLink)
        ));
    }
}
```

Run:

```powershell
cd src-tauri
cargo test vk::link_parser -- --nocapture
```

Expected: compile fails because `parse_vk_video_url`, `VkVideoId`, and `VkLoadError` are missing.

- [ ] **Step 3: Implement link parser**

Create `src-tauri/src/vk/errors.rs`:

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", content = "message")]
pub enum VkLoadError {
    #[error("invalid-link")]
    InvalidLink,
    #[error("video-unavailable")]
    VideoUnavailable,
    #[error("subtitles-not-found")]
    SubtitlesNotFound,
    #[error("subtitle-fetch-failed")]
    SubtitleFetchFailed,
    #[error("subtitle-parse-failed")]
    SubtitleParseFailed,
}

impl From<VkLoadError> for String {
    fn from(value: VkLoadError) -> Self {
        serde_json::to_string(&value).unwrap_or_else(|_| value.to_string())
    }
}
```

Implement `src-tauri/src/vk/link_parser.rs`:

```rust
use regex::Regex;
use serde::Serialize;
use url::Url;

use super::errors::VkLoadError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VkVideoId {
    pub owner_id: i64,
    pub video_id: i64,
    pub list: Option<String>,
    pub access_key: Option<String>,
}

pub fn parse_vk_video_url(input: &str) -> Result<VkVideoId, VkLoadError> {
    let url = Url::parse(input).map_err(|_| VkLoadError::InvalidLink)?;
    let host = url.host_str().ok_or(VkLoadError::InvalidLink)?;
    if !matches!(host, "vkvideo.ru" | "www.vkvideo.ru" | "vk.com" | "www.vk.com") {
        return Err(VkLoadError::InvalidLink);
    }

    let re = Regex::new(r"video(-?\d+)_(\d+)").expect("valid video regex");
    let captures = re
        .captures(url.path())
        .or_else(|| re.captures(url.as_str()))
        .ok_or(VkLoadError::InvalidLink)?;

    let owner_id = captures
        .get(1)
        .and_then(|m| m.as_str().parse::<i64>().ok())
        .ok_or(VkLoadError::InvalidLink)?;
    let video_id = captures
        .get(2)
        .and_then(|m| m.as_str().parse::<i64>().ok())
        .ok_or(VkLoadError::InvalidLink)?;

    let list = url
        .query_pairs()
        .find(|(key, _)| key == "list")
        .map(|(_, value)| value.to_string());
    let access_key = url
        .query_pairs()
        .find(|(key, _)| key == "access_key")
        .map(|(_, value)| value.to_string());

    Ok(VkVideoId {
        owner_id,
        video_id,
        list,
        access_key,
    })
}
```

Create `src-tauri/src/vk/mod.rs`:

```rust
pub mod command;
pub mod embed;
pub mod errors;
pub mod link_parser;
pub mod subtitles;
```

Run:

```powershell
cd src-tauri
cargo test vk::link_parser -- --nocapture
cd ..
```

Expected: link parser tests pass.

- [ ] **Step 4: Write failing embed extraction tests**

Create `src-tauri/tests/fixtures/embed_with_subtitles.html`:

```html
<html>
  <body>
    <script>
      initEmbeddedPage({"owner_id":-1,"video_id":2});
      window.playerParams = {"title":"Sample","duration":42,"has_subtitles":1,"subtitles":[{"is_auto":true,"storage_index":0,"lang":"ru","title":"ru_auto.vtt","url":"https:\/\/vkvd737.okcdn.ru\/?subId=1&id=1","manifest_name":"Русский"},{"is_auto":false,"storage_index":1,"lang":"en","title":"en.vtt","url":"https:\/\/vkvd737.okcdn.ru\/?subId=2&id=2","manifest_name":"English"}]};
    </script>
  </body>
</html>
```

Create `src-tauri/tests/fixtures/embed_without_subtitles.html`:

```html
<html>
  <body>
    <script>
      window.playerParams = {"title":"No subtitles","duration":42,"has_subtitles":0};
    </script>
  </body>
</html>
```

Add tests to `src-tauri/src/vk/embed.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_subtitle_tracks_from_embed_html() {
        let html = include_str!("../../tests/fixtures/embed_with_subtitles.html");
        let metadata = extract_embed_metadata(html).unwrap();

        assert_eq!(metadata.tracks.len(), 2);
        assert_eq!(metadata.tracks[0].id, "ru_0_ru_auto.vtt");
        assert_eq!(metadata.tracks[0].lang, "ru");
        assert_eq!(metadata.tracks[0].manifest_name, "Русский");
        assert!(metadata.tracks[0].is_auto);
        assert_eq!(metadata.tracks[0].url, "https://vkvd737.okcdn.ru/?subId=1&id=1");
    }

    #[test]
    fn returns_subtitles_not_found_when_embed_has_no_tracks() {
        let html = include_str!("../../tests/fixtures/embed_without_subtitles.html");
        assert!(matches!(
            extract_embed_metadata(html),
            Err(VkLoadError::SubtitlesNotFound)
        ));
    }
}
```

Run:

```powershell
cd src-tauri
cargo test vk::embed -- --nocapture
```

Expected: compile fails because `extract_embed_metadata` and metadata types are missing.

- [ ] **Step 5: Implement embed extraction**

Create `src-tauri/src/vk/embed.rs`:

```rust
use regex::Regex;
use serde::{Deserialize, Serialize};

use super::errors::VkLoadError;
use super::link_parser::VkVideoId;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VkSubtitleTrack {
    pub id: String,
    pub lang: String,
    pub title: String,
    pub url: String,
    pub manifest_name: String,
    pub is_auto: bool,
    pub storage_index: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VkEmbedMetadata {
    pub embed_url: String,
    pub tracks: Vec<VkSubtitleTrack>,
}

#[derive(Debug, Deserialize)]
struct RawSubtitleTrack {
    #[serde(default)]
    is_auto: bool,
    #[serde(default)]
    storage_index: i64,
    #[serde(default)]
    lang: String,
    #[serde(default)]
    title: String,
    url: String,
    #[serde(default)]
    manifest_name: String,
}

pub fn build_embed_url(id: &VkVideoId) -> String {
    format!(
        "https://vk.com/video_ext.php?oid={}&id={}&hd=2&js_api=1",
        id.owner_id, id.video_id
    )
}

pub fn extract_embed_metadata(html: &str) -> Result<VkEmbedMetadata, VkLoadError> {
    let tracks = extract_tracks(html)?;
    Ok(VkEmbedMetadata {
        embed_url: String::new(),
        tracks,
    })
}

pub async fn fetch_embed_metadata(id: &VkVideoId) -> Result<VkEmbedMetadata, VkLoadError> {
    let embed_url = build_embed_url(id);
    let response = reqwest::Client::new()
        .get(&embed_url)
        .header(reqwest::header::USER_AGENT, "Mozilla/5.0")
        .header(reqwest::header::REFERER, "https://vkvideo.ru/")
        .send()
        .await
        .map_err(|_| VkLoadError::VideoUnavailable)?;

    if !response.status().is_success() {
        return Err(VkLoadError::VideoUnavailable);
    }

    let html = response
        .text()
        .await
        .map_err(|_| VkLoadError::VideoUnavailable)?;
    let mut metadata = extract_embed_metadata(&html)?;
    metadata.embed_url = embed_url;
    Ok(metadata)
}

fn extract_tracks(html: &str) -> Result<Vec<VkSubtitleTrack>, VkLoadError> {
    let re = Regex::new(r#""subtitles"\s*:\s*(\[[^\]]*\])"#).expect("valid subtitle regex");
    let raw_json = re
        .captures(html)
        .and_then(|captures| captures.get(1))
        .map(|m| m.as_str().replace("\\/", "/"))
        .ok_or(VkLoadError::SubtitlesNotFound)?;

    let raw_tracks: Vec<RawSubtitleTrack> =
        serde_json::from_str(&raw_json).map_err(|_| VkLoadError::SubtitlesNotFound)?;

    let tracks: Vec<VkSubtitleTrack> = raw_tracks
        .into_iter()
        .filter(|track| !track.url.is_empty())
        .map(|track| {
            let id = [track.lang.as_str(), &track.storage_index.to_string(), track.title.as_str()]
                .into_iter()
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join("_");
            VkSubtitleTrack {
                id,
                lang: track.lang,
                title: track.title,
                url: track.url,
                manifest_name: track.manifest_name,
                is_auto: track.is_auto,
                storage_index: track.storage_index,
            }
        })
        .collect();

    if tracks.is_empty() {
        Err(VkLoadError::SubtitlesNotFound)
    } else {
        Ok(tracks)
    }
}
```

Run:

```powershell
cd src-tauri
cargo test vk::embed -- --nocapture
cd ..
```

Expected: embed tests pass.

- [ ] **Step 6: Write failing track selection tests**

Create `src-tauri/src/vk/subtitles.rs` with tests:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::vk::embed::VkSubtitleTrack;

    fn track(id: &str, lang: &str) -> VkSubtitleTrack {
        VkSubtitleTrack {
            id: id.to_string(),
            lang: lang.to_string(),
            title: format!("{lang}.vtt"),
            url: format!("https://example.com/{id}.vtt"),
            manifest_name: lang.to_string(),
            is_auto: false,
            storage_index: 0,
        }
    }

    #[test]
    fn prefers_russian_track() {
        let tracks = vec![track("en", "en"), track("ru", "ru")];
        assert_eq!(select_primary_track(&tracks).unwrap().id, "ru");
    }

    #[test]
    fn falls_back_to_first_track() {
        let tracks = vec![track("de", "de"), track("en", "en")];
        assert_eq!(select_primary_track(&tracks).unwrap().id, "de");
    }

    #[test]
    fn rejects_empty_tracks() {
        assert!(matches!(
            select_primary_track(&[]),
            Err(VkLoadError::SubtitlesNotFound)
        ));
    }
}
```

Run:

```powershell
cd src-tauri
cargo test vk::subtitles -- --nocapture
```

Expected: compile fails because `select_primary_track` is missing.

- [ ] **Step 7: Implement subtitle track selection and fetcher**

Implement `src-tauri/src/vk/subtitles.rs`:

```rust
use super::embed::VkSubtitleTrack;
use super::errors::VkLoadError;

pub fn select_primary_track(tracks: &[VkSubtitleTrack]) -> Result<&VkSubtitleTrack, VkLoadError> {
    tracks
        .iter()
        .find(|track| track.lang.eq_ignore_ascii_case("ru"))
        .or_else(|| tracks.first())
        .ok_or(VkLoadError::SubtitlesNotFound)
}

pub async fn fetch_subtitle_text(track: &VkSubtitleTrack) -> Result<String, VkLoadError> {
    let response = reqwest::Client::new()
        .get(&track.url)
        .header(reqwest::header::USER_AGENT, "Mozilla/5.0")
        .header(reqwest::header::REFERER, "https://vk.com/")
        .send()
        .await
        .map_err(|_| VkLoadError::SubtitleFetchFailed)?;

    if !response.status().is_success() {
        return Err(VkLoadError::SubtitleFetchFailed);
    }

    response
        .text()
        .await
        .map_err(|_| VkLoadError::SubtitleFetchFailed)
}
```

Run:

```powershell
cd src-tauri
cargo test vk::subtitles -- --nocapture
cd ..
```

Expected: subtitle selection tests pass.

- [ ] **Step 8: Add Tauri command DTOs and registration**

Create `src-tauri/src/vk/command.rs`:

```rust
use serde::Serialize;

use super::embed::{fetch_embed_metadata, VkSubtitleTrack};
use super::errors::VkLoadError;
use super::link_parser::{parse_vk_video_url, VkVideoId};
use super::subtitles::{fetch_subtitle_text, select_primary_track};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedVideo {
    pub video_id: VkVideoId,
    pub embed_url: String,
    pub tracks: Vec<VkSubtitleTrack>,
    pub selected_track_id: String,
    pub subtitle_text: String,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn load_video_from_url(url: String) -> Result<LoadedVideo, VkLoadError> {
    let video_id = parse_vk_video_url(&url)?;
    let metadata = fetch_embed_metadata(&video_id).await?;
    let selected_track = select_primary_track(&metadata.tracks)?.clone();
    let subtitle_text = fetch_subtitle_text(&selected_track).await?;

    Ok(LoadedVideo {
        video_id,
        embed_url: metadata.embed_url,
        tracks: metadata.tracks,
        selected_track_id: selected_track.id,
        subtitle_text,
    })
}
```

Modify `src-tauri/src/lib.rs`:

```rust
mod vk;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![vk::command::load_video_from_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 9: Verify backend**

Run:

```powershell
cd src-tauri
cargo test
cargo fmt --check
cd ..
```

Expected: all Rust tests pass and formatting is clean.

- [ ] **Step 10: Commit**

```powershell
git add src-tauri
git commit -m "feat: add VK subtitle backend pipeline"
```

---

### Task 3: Frontend Subtitle Parser And Cue Selection

**Files:**
- Create: `src/lib/subtitles/types.ts`
- Create: `src/lib/subtitles/parse-webvtt.ts`
- Create: `src/lib/subtitles/parse-webvtt.test.ts`
- Create: `src/lib/subtitles/select-active-cue.ts`
- Create: `src/lib/subtitles/select-active-cue.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `src/lib/subtitles/parse-webvtt.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { parseWebVtt } from "./parse-webvtt"

describe("parseWebVtt", () => {
  it("parses ordinary WebVTT cues into words", () => {
    const cues = parseWebVtt(`WEBVTT

00:10.433 --> 00:12.633
Доброе утро, господин Мюллер,
как поживаете?
`)

    expect(cues).toHaveLength(1)
    expect(cues[0]).toMatchObject({
      startMs: 10433,
      endMs: 12633,
      text: "Доброе утро, господин Мюллер, как поживаете?",
    })
    expect(cues[0].words.map((word) => word.text)).toEqual([
      "Доброе",
      "утро,",
      "господин",
      "Мюллер,",
      "как",
      "поживаете?",
    ])
  })

  it("cleans VK auto subtitle inline timestamps and tags", () => {
    const cues = parseWebVtt(`WEBVTT
Language: ru

00:00:00.000 --> 00:00:03.605
Грин<00:00:00.480><c> флаг,</c><00:00:01.121><c> ну</c>
`)

    expect(cues[0].text).toBe("Грин флаг, ну")
    expect(cues[0].words.map((word) => word.text)).toEqual(["Грин", "флаг,", "ну"])
  })

  it("parses SRT style cue counters", () => {
    const cues = parseWebVtt(`1
00:00:01,000 --> 00:00:02,500
Hello world.
`)

    expect(cues[0].startMs).toBe(1000)
    expect(cues[0].endMs).toBe(2500)
    expect(cues[0].text).toBe("Hello world.")
  })
})
```

Run:

```powershell
npm test -- src/lib/subtitles/parse-webvtt.test.ts
```

Expected: test fails because `parseWebVtt` is missing.

- [ ] **Step 2: Implement parser types and parser**

Create `src/lib/subtitles/types.ts`:

```ts
export type SubtitleWord = {
  id: string
  text: string
  cleanText: string
  startMs?: number
  endMs?: number
}

export type SubtitleCue = {
  id: string
  startMs: number
  endMs: number
  text: string
  words: SubtitleWord[]
}

export type SubtitleLane = {
  role: "primary" | "secondary"
  source: "vk-track" | "machine-translation"
  trackId?: string
  cues: SubtitleCue[]
}

export type VkSubtitleTrack = {
  id: string
  lang: string
  title: string
  url: string
  manifestName: string
  isAuto: boolean
  storageIndex: number
}

export type LoadedVideo = {
  videoId: {
    ownerId: number
    videoId: number
    list?: string
    accessKey?: string
  }
  embedUrl: string
  tracks: VkSubtitleTrack[]
  selectedTrackId: string
  subtitleText: string
}
```

Create `src/lib/subtitles/parse-webvtt.ts`:

```ts
import type { SubtitleCue, SubtitleWord } from "./types"

const TIMING_SEPARATOR = "-->"
const INLINE_TIMESTAMP_RE = /<\d{2}:\d{2}:\d{2}\.\d{3}>/g
const TAG_RE = /<\/?c[^>]*>|<\/?v[^>]*>|<\/?i>|<\/?b>|<\/?u>/g
const EDGE_PUNCTUATION_RE = /^[\s"'“”‘’()[\]{}«».,!?;:—–-]+|[\s"'“”‘’()[\]{}«».,!?;:—–-]+$/g

export function parseWebVtt(raw: string): SubtitleCue[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  const cues: SubtitleCue[] = []

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean)
    const timingIndex = lines.findIndex((line) => line.includes(TIMING_SEPARATOR))
    if (timingIndex === -1) continue

    const [startRaw, endAndSettingsRaw] = lines[timingIndex].split(TIMING_SEPARATOR)
    const endRaw = endAndSettingsRaw.trim().split(/\s+/)[0]
    const startMs = parseTimestamp(startRaw.trim())
    const endMs = parseTimestamp(endRaw.trim())
    const text = cleanCueText(lines.slice(timingIndex + 1).join(" "))
    if (!text) continue

    const cueId = `cue-${cues.length}`
    cues.push({
      id: cueId,
      startMs,
      endMs,
      text,
      words: tokenizeWords(text, cueId),
    })
  }

  return cues
}

function parseTimestamp(value: string): number {
  const normalized = value.replace(",", ".")
  const parts = normalized.split(":")
  const secondsPart = parts.pop()
  if (!secondsPart) return 0

  const seconds = Number(secondsPart)
  const minutes = Number(parts.pop() ?? 0)
  const hours = Number(parts.pop() ?? 0)

  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000)
}

function cleanCueText(value: string): string {
  return value
    .replace(INLINE_TIMESTAMP_RE, "")
    .replace(TAG_RE, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenizeWords(text: string, cueId: string): SubtitleWord[] {
  return text.split(/\s+/).map((word, index) => ({
    id: `${cueId}-word-${index}`,
    text: word,
    cleanText: cleanWord(word),
  }))
}

export function cleanWord(word: string): string {
  return word.replace(EDGE_PUNCTUATION_RE, "")
}
```

Run:

```powershell
npm test -- src/lib/subtitles/parse-webvtt.test.ts
```

Expected: parser tests pass.

- [ ] **Step 3: Write failing active cue tests**

Create `src/lib/subtitles/select-active-cue.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { selectActiveCue } from "./select-active-cue"
import type { SubtitleCue } from "./types"

const cues: SubtitleCue[] = [
  { id: "a", startMs: 1000, endMs: 2000, text: "one", words: [] },
  { id: "b", startMs: 2500, endMs: 4000, text: "two", words: [] },
]

describe("selectActiveCue", () => {
  it("returns the cue containing the current time", () => {
    expect(selectActiveCue(cues, 2600)?.id).toBe("b")
  })

  it("returns undefined between cues", () => {
    expect(selectActiveCue(cues, 2250)).toBeUndefined()
  })

  it("treats the cue end time as exclusive", () => {
    expect(selectActiveCue(cues, 2000)).toBeUndefined()
  })
})
```

Run:

```powershell
npm test -- src/lib/subtitles/select-active-cue.test.ts
```

Expected: test fails because `selectActiveCue` is missing.

- [ ] **Step 4: Implement active cue selection**

Create `src/lib/subtitles/select-active-cue.ts`:

```ts
import type { SubtitleCue } from "./types"

export function selectActiveCue(cues: SubtitleCue[], timeMs: number): SubtitleCue | undefined {
  return cues.find((cue) => cue.startMs <= timeMs && timeMs < cue.endMs)
}
```

Run:

```powershell
npm test -- src/lib/subtitles
npm run build
```

Expected: subtitle tests and TypeScript build pass.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/subtitles
git commit -m "feat: add subtitle parsing model"
```

---

### Task 4: VK Player Bridge And Subtitle Overlay

**Files:**
- Create: `src/lib/vk-player/vk-player-bridge.ts`
- Create: `src/lib/vk-player/vk-player-bridge.test.ts`
- Create: `src/components/subtitle-overlay.tsx`
- Create: `src/components/subtitle-overlay.test.tsx`
- Create: `src/components/video-player.tsx`

- [ ] **Step 1: Write failing player bridge tests**

Create `src/lib/vk-player/vk-player-bridge.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { createVkPlayerBridge } from "./vk-player-bridge"

describe("createVkPlayerBridge", () => {
  it("subscribes to timeupdate and reports milliseconds", () => {
    const handlers = new Map<string, (payload: { time: number }) => void>()
    const fakePlayer = {
      on: vi.fn((event: string, handler: (payload: { time: number }) => void) => {
        handlers.set(event, handler)
      }),
      off: vi.fn(),
      destroy: vi.fn(),
    }
    const iframe = document.createElement("iframe")
    const onTimeUpdate = vi.fn()

    const bridge = createVkPlayerBridge({
      iframe,
      playerFactory: () => fakePlayer,
      onTimeUpdate,
    })

    handlers.get("timeupdate")?.({ time: 12.345 })

    expect(onTimeUpdate).toHaveBeenCalledWith(12345)
    bridge.destroy()
    expect(fakePlayer.destroy).toHaveBeenCalled()
  })
})
```

Run:

```powershell
npm test -- src/lib/vk-player/vk-player-bridge.test.ts
```

Expected: test fails because `createVkPlayerBridge` is missing.

- [ ] **Step 2: Implement player bridge**

Create `src/lib/vk-player/vk-player-bridge.ts`:

```ts
type VkPlayerEvent = "timeupdate"

type VkPlayer = {
  on(event: VkPlayerEvent, handler: (payload: { time?: number }) => void): void
  off?(event: VkPlayerEvent, handler: (payload: { time?: number }) => void): void
  destroy(): void
}

type VkWindow = Window & {
  VK?: {
    VideoPlayer?: new (iframe: HTMLIFrameElement) => VkPlayer
  }
}

type CreateBridgeOptions = {
  iframe: HTMLIFrameElement
  onTimeUpdate: (timeMs: number) => void
  playerFactory?: (iframe: HTMLIFrameElement) => VkPlayer
}

export function createVkPlayerBridge({ iframe, onTimeUpdate, playerFactory }: CreateBridgeOptions) {
  const factory =
    playerFactory ??
    ((targetIframe: HTMLIFrameElement) => {
      const VideoPlayer = (window as VkWindow).VK?.VideoPlayer
      if (!VideoPlayer) {
        throw new Error("VK.VideoPlayer is not available")
      }
      return new VideoPlayer(targetIframe)
    })

  const player = factory(iframe)
  const handleTimeUpdate = (payload: { time?: number }) => {
    onTimeUpdate(Math.round((payload.time ?? 0) * 1000))
  }

  player.on("timeupdate", handleTimeUpdate)

  return {
    destroy() {
      player.off?.("timeupdate", handleTimeUpdate)
      player.destroy()
    },
  }
}

export function loadVkPlayerScript(): Promise<void> {
  const scriptId = "vk-video-player-api"
  if (document.getElementById(scriptId)) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.id = scriptId
    script.src = "https://vk.com/js/api/videoplayer.js"
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Failed to load VK player script"))
    document.head.appendChild(script)
  })
}
```

Run:

```powershell
npm test -- src/lib/vk-player/vk-player-bridge.test.ts
```

Expected: player bridge test passes.

- [ ] **Step 3: Write failing overlay tests**

Create `src/components/subtitle-overlay.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { SubtitleOverlay } from "./subtitle-overlay"
import type { SubtitleLane } from "@/lib/subtitles/types"

const lane: SubtitleLane = {
  role: "primary",
  source: "vk-track",
  cues: [
    {
      id: "cue-0",
      startMs: 1000,
      endMs: 5000,
      text: "Доброе утро!",
      words: [
        { id: "w1", text: "Доброе", cleanText: "Доброе" },
        { id: "w2", text: "утро!", cleanText: "утро" },
      ],
    },
  ],
}

describe("SubtitleOverlay", () => {
  it("renders active cue words", () => {
    render(<SubtitleOverlay lane={lane} timeMs={1200} />)

    expect(screen.getByRole("button", { name: "Доброе" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "утро!" })).toBeInTheDocument()
  })

  it("opens a popover with the cleaned word", async () => {
    const user = userEvent.setup()
    render(<SubtitleOverlay lane={lane} timeMs={1200} />)

    await user.click(screen.getByRole("button", { name: "утро!" }))

    expect(screen.getByText("утро")).toBeInTheDocument()
  })

  it("renders nothing when no cue is active", () => {
    render(<SubtitleOverlay lane={lane} timeMs={800} />)

    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
```

Run:

```powershell
npm test -- src/components/subtitle-overlay.test.tsx
```

Expected: test fails because `SubtitleOverlay` is missing.

- [ ] **Step 4: Implement subtitle overlay**

Create `src/components/subtitle-overlay.tsx`:

```tsx
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { selectActiveCue } from "@/lib/subtitles/select-active-cue"
import type { SubtitleLane } from "@/lib/subtitles/types"

type SubtitleOverlayProps = {
  lane: SubtitleLane
  timeMs: number
}

export function SubtitleOverlay({ lane, timeMs }: SubtitleOverlayProps) {
  const cue = selectActiveCue(lane.cues, timeMs)
  if (!cue) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-7 flex justify-center px-8">
      <div className="pointer-events-auto max-w-4xl rounded-md bg-black/65 px-4 py-3 text-center text-2xl leading-relaxed text-white shadow-lg">
        {cue.words.map((word) => (
          <Popover key={word.id}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="mx-1 rounded-sm px-1 text-white underline-offset-4 hover:bg-white/15 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                {word.text}
              </button>
            </PopoverTrigger>
            <PopoverContent>{word.cleanText || word.text}</PopoverContent>
          </Popover>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Implement iframe wrapper**

Create `src/components/video-player.tsx`:

```tsx
import { useEffect, useRef } from "react"
import { createVkPlayerBridge, loadVkPlayerScript } from "@/lib/vk-player/vk-player-bridge"

type VideoPlayerProps = {
  embedUrl: string
  onTimeUpdate: (timeMs: number) => void
}

export function VideoPlayer({ embedUrl, onTimeUpdate }: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    let cleanup: { destroy(): void } | undefined
    let cancelled = false

    async function connectPlayer() {
      if (!iframeRef.current) return
      await loadVkPlayerScript()
      if (cancelled || !iframeRef.current) return
      cleanup = createVkPlayerBridge({
        iframe: iframeRef.current,
        onTimeUpdate,
      })
    }

    void connectPlayer()

    return () => {
      cancelled = true
      cleanup?.destroy()
    }
  }, [embedUrl, onTimeUpdate])

  return (
    <iframe
      ref={iframeRef}
      title="VK Video player"
      src={withJsApi(embedUrl)}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      className="h-full w-full border-0"
    />
  )
}

function withJsApi(url: string): string {
  const parsed = new URL(url)
  parsed.searchParams.set("js_api", "1")
  return parsed.toString()
}
```

Run:

```powershell
npm test -- src/lib/vk-player src/components/subtitle-overlay.test.tsx
npm run build
```

Expected: tests and build pass.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/vk-player src/components/subtitle-overlay.tsx src/components/subtitle-overlay.test.tsx src/components/video-player.tsx
git commit -m "feat: add VK player bridge and subtitle overlay"
```

---

### Task 5: App Integration And Verification

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/App.test.tsx`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Write failing App integration tests**

Create `src/App.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "./App"

const invokeMock = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args: unknown) => invokeMock(command, args),
}))

vi.mock("@/components/video-player", () => ({
  VideoPlayer: ({ embedUrl }: { embedUrl: string }) => <div data-testid="video-player">{embedUrl}</div>,
}))

describe("App", () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it("loads a VK URL and renders the player with subtitles", async () => {
    invokeMock.mockResolvedValue({
      embedUrl: "https://vk.com/video_ext.php?oid=-1&id=2&hd=2&js_api=1",
      tracks: [],
      selectedTrackId: "ru_0_ru_auto.vtt",
      subtitleText: `WEBVTT

00:00:01.000 --> 00:00:03.000
Привет мир
`,
    })

    render(<App />)

    fireEvent.change(screen.getByLabelText("VK Video URL"), {
      target: { value: "https://vkvideo.ru/video-1_2" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Load" }))

    await waitFor(() => {
      expect(screen.getByTestId("video-player")).toHaveTextContent("video_ext.php")
    })
  })

  it("shows an error when loading fails", async () => {
    invokeMock.mockRejectedValue('{"kind":"subtitles-not-found","message":"subtitles-not-found"}')

    render(<App />)

    fireEvent.change(screen.getByLabelText("VK Video URL"), {
      target: { value: "https://vkvideo.ru/video-1_2" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Load" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Subtitles were not found")
  })
})
```

Run:

```powershell
npm test -- src/App.test.tsx
```

Expected: tests fail because `App` does not call Tauri or render loaded state.

- [ ] **Step 2: Implement integrated App**

Replace `src/App.tsx` with:

```tsx
import { invoke } from "@tauri-apps/api/core"
import { FormEvent, useCallback, useMemo, useState } from "react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SubtitleOverlay } from "@/components/subtitle-overlay"
import { VideoPlayer } from "@/components/video-player"
import { parseWebVtt } from "@/lib/subtitles/parse-webvtt"
import type { LoadedVideo, SubtitleLane } from "@/lib/subtitles/types"

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; video: LoadedVideo; lane: SubtitleLane }
  | { status: "error"; message: string }

export default function App() {
  const [url, setUrl] = useState("")
  const [timeMs, setTimeMs] = useState(0)
  const [state, setState] = useState<LoadState>({ status: "idle" })

  const canLoad = useMemo(() => url.trim().length > 0 && state.status !== "loading", [state.status, url])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canLoad) return

    setState({ status: "loading" })
    setTimeMs(0)

    try {
      const video = await invoke<LoadedVideo>("load_video_from_url", { url: url.trim() })
      const cues = parseWebVtt(video.subtitleText)
      if (!cues.length) {
        setState({ status: "error", message: "Subtitles could not be parsed for this video." })
        return
      }
      setState({
        status: "ready",
        video,
        lane: {
          role: "primary",
          source: "vk-track",
          trackId: video.selectedTrackId,
          cues,
        },
      })
    } catch (error) {
      setState({ status: "error", message: formatLoadError(error) })
    }
  }

  const handleTimeUpdate = useCallback((nextTimeMs: number) => {
    setTimeMs(nextTimeMs)
  }, [])

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <section className="mx-auto flex max-w-6xl flex-col gap-4">
        <form className="flex gap-2" onSubmit={handleSubmit}>
          <Input
            aria-label="VK Video URL"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://vkvideo.ru/video-..."
          />
          <Button type="submit" disabled={!canLoad}>
            {state.status === "loading" ? "Loading" : "Load"}
          </Button>
        </form>

        {state.status === "error" ? <Alert>{state.message}</Alert> : null}

        <div className="relative aspect-video overflow-hidden rounded-md border border-slate-800 bg-black">
          {state.status === "ready" ? (
            <>
              <VideoPlayer embedUrl={state.video.embedUrl} onTimeUpdate={handleTimeUpdate} />
              <SubtitleOverlay lane={state.lane} timeMs={timeMs} />
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Paste a public VK Video link to load subtitles.
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function formatLoadError(error: unknown): string {
  const raw = typeof error === "string" ? error : ""
  try {
    const parsed = JSON.parse(raw) as { kind?: string }
    switch (parsed.kind) {
      case "invalid-link":
        return "This does not look like a public VK Video link."
      case "video-unavailable":
        return "This video is unavailable without VK login or cannot be opened."
      case "subtitles-not-found":
        return "Subtitles were not found for this video."
      case "subtitle-fetch-failed":
        return "The subtitle file could not be downloaded."
      case "subtitle-parse-failed":
        return "Subtitles could not be parsed for this video."
      default:
        return "The video could not be loaded."
    }
  } catch {
    return "The video could not be loaded."
  }
}
```

- [ ] **Step 3: Verify frontend integration**

Run:

```powershell
npm test -- src/App.test.tsx src/components/subtitle-overlay.test.tsx src/lib/subtitles src/lib/vk-player
npm run build
```

Expected: all frontend tests and build pass.

- [ ] **Step 4: Verify Rust and Tauri build**

Run:

```powershell
cd src-tauri
cargo test
cargo fmt --check
cd ..
npm run tauri build
```

Expected: Rust tests pass, formatting is clean, and Tauri build completes. If the Tauri build fails due to missing Windows signing/bundling tooling, run `npm run tauri build -- --no-bundle` and record the exact failure.

- [ ] **Step 5: Manual smoke test**

Run:

```powershell
npm run tauri dev
```

Use these URLs:

```text
https://vkvideo.ru/video-145784486_456239038
https://vkvideo.ru/video-51890028_456242200?list=ln-Cg6C0nEVR81075JXFU
```

Expected: the app window opens, a public VK Video loads, subtitles appear, and clicking a word opens a popover with only that word.

- [ ] **Step 6: Commit**

```powershell
git add src src-tauri package.json package-lock.json vite.config.ts tsconfig*.json
git commit -m "feat: integrate VK subtitle MVP"
```

---

## Self-Review Checklist

- Spec coverage: public URL input, `video_ext.php`, backend subtitle fetch, WebVTT parsing, player bridge, clickable words, word-only popover, and error states all map to tasks.
- Scope control: translation, dictionaries, auth, search, local import, editing, and saved words remain out of scope.
- Type consistency: backend returns camelCase `LoadedVideo`; frontend `LoadedVideo` type uses matching keys.
- Risk handling: undocumented `subtitles[]`, temporary URLs, missing subtitles, CORS, and player init are represented in errors or backend ownership.
