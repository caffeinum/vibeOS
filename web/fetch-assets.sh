#!/bin/sh
# The v86 engine and a small Linux image, ~11 MB. Not committed: they are
# third-party build artifacts, and git is the wrong place for them.
set -e
cd "$(dirname "$0")"
mkdir -p v86
npm pack v86@0.5.445 >/dev/null
tar -xzf v86-0.5.445.tgz
cp package/build/libv86.js package/build/v86.wasm v86/
rm -rf package v86-0.5.445.tgz
for f in bios/seabios.bin bios/vgabios.bin images/linux4.iso; do
  curl -sL -o "v86/$(basename "$f")" "https://copy.sh/v86/$f"
done
echo "v86 assets ready in ./v86"
