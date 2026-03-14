#!/usr/bin/env bash

set -euo pipefail

CHANNEL="prod"
REPO="GGos3/forge"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel)
      CHANNEL="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required. Install it first: https://cli.github.com/" >&2
  exit 1
fi

resolve_tag() {
  local repo="$1"
  local channel="$2"

  if [[ "$channel" == "dev" ]]; then
    gh api "repos/${repo}/releases?per_page=50" --jq 'map(select(.prerelease == true and .draft == false)) | sort_by(.published_at // .created_at) | reverse | .[0].tag_name'
  else
    gh api "repos/${repo}/releases?per_page=50" --jq 'map(select(.prerelease == false and .draft == false)) | sort_by(.published_at // .created_at) | reverse | .[0].tag_name'
  fi
}

TAG="$(resolve_tag "$REPO" "$CHANNEL")"
if [[ -z "$TAG" || "$TAG" == "null" ]]; then
  echo "No release found for channel: $CHANNEL" >&2
  exit 1
fi

OS="$(uname -s)"
TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ "$OS" == "Linux" ]]; then
  gh release download "$TAG" -R "$REPO" -D "$TMP_DIR" -p "*.AppImage"
  APPIMAGE="$(find "$TMP_DIR" -maxdepth 1 -name '*.AppImage' | head -n 1)"
  if [[ -z "$APPIMAGE" ]]; then
    echo "No AppImage asset found in release $TAG" >&2
    exit 1
  fi

  mkdir -p "$HOME/.local/bin"
  TARGET="$HOME/.local/bin/forge"
  if [[ "$CHANNEL" == "dev" ]]; then
    TARGET="$HOME/.local/bin/forge-dev"
  fi

  install -m 755 "$APPIMAGE" "$TARGET"
  echo "Installed to $TARGET"
  echo "Run it with: $TARGET"
  exit 0
fi

if [[ "$OS" == "Darwin" ]]; then
  APP_DIR="$HOME/Applications"
  mkdir -p "$APP_DIR"

  if gh release download "$TAG" -R "$REPO" -D "$TMP_DIR" -p "*.app.tar.gz"; then
    TAR_FILE="$(find "$TMP_DIR" -maxdepth 1 -name '*.app.tar.gz' | head -n 1)"
    tar -xzf "$TAR_FILE" -C "$TMP_DIR"
    APP_BUNDLE="$(find "$TMP_DIR" -maxdepth 2 -name '*.app' | head -n 1)"
    if [[ -z "$APP_BUNDLE" ]]; then
      echo "No .app bundle found after extracting $TAR_FILE" >&2
      exit 1
    fi
    rsync -a --delete "$APP_BUNDLE" "$APP_DIR/"
    INSTALLED_APP="$APP_DIR/$(basename "$APP_BUNDLE")"
    echo "Installed to $INSTALLED_APP"
    echo "Open it with: open '$INSTALLED_APP'"
    exit 0
  fi

  gh release download "$TAG" -R "$REPO" -D "$TMP_DIR" -p "*.dmg"
  DMG_FILE="$(find "$TMP_DIR" -maxdepth 1 -name '*.dmg' | head -n 1)"
  if [[ -z "$DMG_FILE" ]]; then
    echo "No macOS asset found in release $TAG" >&2
    exit 1
  fi

  MOUNT_DIR="$TMP_DIR/mount"
  mkdir -p "$MOUNT_DIR"
  hdiutil attach "$DMG_FILE" -mountpoint "$MOUNT_DIR" -nobrowse >/dev/null
  APP_BUNDLE="$(find "$MOUNT_DIR" -maxdepth 1 -name '*.app' | head -n 1)"
  if [[ -z "$APP_BUNDLE" ]]; then
    hdiutil detach "$MOUNT_DIR" >/dev/null || true
    echo "No .app bundle found in DMG" >&2
    exit 1
  fi
  rsync -a --delete "$APP_BUNDLE" "$APP_DIR/"
  hdiutil detach "$MOUNT_DIR" >/dev/null
  INSTALLED_APP="$APP_DIR/$(basename "$APP_BUNDLE")"
  echo "Installed to $INSTALLED_APP"
  echo "Open it with: open '$INSTALLED_APP'"
  exit 0
fi

echo "Unsupported OS for install.sh: $OS" >&2
exit 1
