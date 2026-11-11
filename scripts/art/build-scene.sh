#!/usr/bin/env bash
# Rebuild all scene art. usage: scripts/art/build-scene.sh <LPC repo dir (sparse clone)> <Ninja Adventure - Asset Pack dir>
set -euo pipefail
LPC="$1"; NIN="$2"; D="$(dirname "$0")"; OUT="$D/../../client/src/scene/art"
python3 -I "$D/build-hero.py" "$LPC/spritesheets" "$OUT"
python3 -I "$D/build-backdrops.py" "$NIN" "$OUT"
python3 -I "$D/build-bosses.py" "$NIN" "$OUT"
python3 -I "$D/make-credits-scene.py" "$LPC" "$D/../../art/credits-scene.md"
