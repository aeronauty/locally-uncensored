#!/usr/bin/env bash
# Build a complete Apple silicon app, including the Metal inference engine.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ "$(uname -sm)" != "Darwin arm64" ]; then
  echo "Apple silicon macOS is required. Run from a native arm64 terminal (not Rosetta)." >&2
  exit 1
fi
for tool in rustc cargo cmake node npm; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool (see CONTRIBUTING.md)." >&2; exit 1; }
done
if [ "$(rustc -vV | awk '/^host:/{print $2}')" != "aarch64-apple-darwin" ]; then
  echo "Install the native aarch64-apple-darwin Rust toolchain (see CONTRIBUTING.md)." >&2
  exit 1
fi

export MACOSX_DEPLOYMENT_TARGET
MACOSX_DEPLOYMENT_TARGET="$(node -p "require('./src-tauri/tauri.macos.conf.json').bundle.macOS.minimumSystemVersion")"
bash scripts/build-llama.sh aarch64-apple-darwin
bash scripts/build-llama.sh --check
npm run tauri -- build --ci --bundles app,dmg
bash scripts/verify-mac-bundle.sh src-tauri/target/release/bundle/macos/LU.app
