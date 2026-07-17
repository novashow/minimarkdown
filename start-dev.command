#!/bin/zsh
cd "$(dirname "$0")" || exit 1

# Homebrew installs rustup as keg-only on macOS. Keep this project runnable even
# when the user's shell profile has not added it to PATH yet.
export PATH="/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:$PATH"

pnpm dev:desktop
