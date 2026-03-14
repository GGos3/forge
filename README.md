# Forge Terminal

Forge is a modern desktop terminal built with **Tauri 2 + SolidJS + xterm.js**.
It combines Warp-style command blocks and split panes with Termius-style terminal workflows.

## Current status

- Cross-platform desktop app foundation is implemented
- PTY-backed shell sessions are implemented in Rust
- Tabs, split panes, block parsing, block overlay, and dark theme are implemented
- Frontend/unit/E2E test scaffolding is in place

## Tech stack

- **Desktop shell:** Tauri 2
- **Frontend:** SolidJS + Vite
- **Terminal rendering:** xterm.js
- **PTY/session backend:** Rust + portable-pty
- **Testing:** Vitest + Playwright

## Project scripts

```bash
pnpm dev           # Start Vite dev server
pnpm build         # Build frontend assets into dist/
pnpm tauri dev     # Run desktop app in development
pnpm test:run      # Run Vitest once
pnpm test:e2e      # Run Playwright E2E suite
```

## Release channels

- **Development channel**: automatic GitHub prereleases from `main`
- **Production channel**: GitHub releases from `v*` tags

Both channels publish desktop artifacts through GitHub Actions.

## One-line install commands

These commands assume you have authenticated `gh` CLI access to this repository.

### Linux

Development build:

```bash
gh repo clone GGos3/forge /tmp/forge-install -- --depth 1 && bash /tmp/forge-install/scripts/install.sh --channel dev && rm -rf /tmp/forge-install
```

Production build:

```bash
gh repo clone GGos3/forge /tmp/forge-install -- --depth 1 && bash /tmp/forge-install/scripts/install.sh --channel prod && rm -rf /tmp/forge-install
```

This installs an AppImage to:

```text
~/.local/bin/forge-dev
~/.local/bin/forge
```

### macOS

Development build:

```bash
gh repo clone GGos3/forge /tmp/forge-install -- --depth 1 && bash /tmp/forge-install/scripts/install.sh --channel dev && rm -rf /tmp/forge-install
```

Production build:

```bash
gh repo clone GGos3/forge /tmp/forge-install -- --depth 1 && bash /tmp/forge-install/scripts/install.sh --channel prod && rm -rf /tmp/forge-install
```

This installs the app into:

```text
~/Applications/
```

### Windows

Development build:

```powershell
gh repo clone GGos3/forge $env:TEMP\forge-install -- --depth 1; & "$env:TEMP\forge-install\scripts\install.ps1" -Channel dev; Remove-Item $env:TEMP\forge-install -Recurse -Force
```

Production build:

```powershell
gh repo clone GGos3/forge $env:TEMP\forge-install -- --depth 1; & "$env:TEMP\forge-install\scripts\install.ps1" -Channel prod; Remove-Item $env:TEMP\forge-install -Recurse -Force
```

This downloads the latest Windows installer from GitHub Releases and runs it.

## How to run it locally

### 1. Install dependencies

```bash
pnpm install
```

### 2. Run the frontend only

This is useful when you want to check the UI shell quickly.

```bash
pnpm dev
```

Then open:

```text
http://localhost:1420
```

### 3. Run the actual desktop app

```bash
export PATH="$HOME/.cargo/bin:$PATH"
pnpm dev:desktop
```

This launches the Tauri window and uses the Rust PTY backend.

## How to try the built result

### Frontend build output

Build the web assets:

```bash
pnpm build
```

This produces static frontend files in:

```text
dist/
```

You can preview those built frontend assets with:

```bash
pnpm serve
```

### Desktop build output

To build the desktop app bundle:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
pnpm tauri build
```

Tauri will place packaged artifacts under:

```text
src-tauri/target/release/bundle/
```

Typical outputs include installers or app bundles depending on your OS.

## GitHub release automation

- `.github/workflows/ci.yml` runs verification on pushes and pull requests
- `.github/workflows/release-dev.yml` publishes prerelease desktop artifacts from `main`
- `.github/workflows/release-prod.yml` publishes production desktop artifacts from `v*` tags

To cut a production release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Linux system dependencies

On Linux, Tauri/WebKit/GTK builds need system packages. On Debian/Ubuntu, the usual setup is:

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  pkg-config \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libjavascriptcoregtk-4.1-dev \
  libsoup-3.0-dev \
  libxdo-dev \
  patchelf \
  librsvg2-dev \
  libssl-dev \
  libayatana-appindicator3-dev
```

For Playwright browser tests:

```bash
pnpm exec playwright install --with-deps chromium
```

## Verification workflow

Recommended local verification order:

```bash
export PATH="$HOME/.cargo/bin:$PATH"

pnpm test:run
pnpm test:e2e
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri dev
```

If you only want a fast pre-push check:

```bash
export PATH="$HOME/.cargo/bin:$PATH"

pnpm test:run && pnpm build && cargo check --manifest-path src-tauri/Cargo.toml
```

## Repo workflow

- `main` is the primary branch
- push feature work to your private remote first
- use the CI workflow to validate frontend build, Vitest, Playwright, and Rust tests/checks

## Recommended IDE setup

- VS Code
- Tauri extension
- rust-analyzer
- Playwright extension
