#!/usr/bin/env bash
set -euo pipefail
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
runtime_root="${RUNTIME_ROOT:-/home/zin-kg/.cache/codex-runtimes/codex-primary-runtime/dependencies}"
export DECK_WORK="${DECK_WORK:-/tmp/roadstar-pitch-build}"
export DECK_REV="${DECK_REV:-review-1}"
export ROADSTAR_ROOT="${ROADSTAR_ROOT:-$(cd "$source_dir/../../.." && pwd)}"
export RUNTIME_NODE_MODULES="$runtime_root/node/node_modules"
mkdir -p "$DECK_WORK/build" "$DECK_WORK/output"
cp "$source_dir/deck.mjs" "$source_dir/speaker-notes.json" "$DECK_WORK/build/"
mkdir -p "$DECK_WORK/build/assets"
cp -R "$source_dir/assets/." "$DECK_WORK/build/assets/"
if [[ ! -e "$DECK_WORK/build/node_modules" ]]; then
  ln -s "$RUNTIME_NODE_MODULES" "$DECK_WORK/build/node_modules"
fi
export FONTCONFIG_FILE="$DECK_WORK/build/fonts.conf"
cat > "$FONTCONFIG_FILE" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig><include>/etc/fonts/fonts.conf</include><dir>$source_dir/fonts</dir></fontconfig>
EOF
"$runtime_root/node/bin/node" "$DECK_WORK/build/deck.mjs"
"$runtime_root/bin/override/soffice" "-env:UserInstallation=file://$DECK_WORK/lo-profile" --headless --convert-to pdf --outdir "$DECK_WORK/output" "$DECK_WORK/output/roadstar-precision-$DECK_REV.pptx"
