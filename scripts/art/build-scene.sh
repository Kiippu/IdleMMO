#!/usr/bin/env bash
# Rebuild all scene art. usage: scripts/art/build-scene.sh <LPC repo dir (sparse clone)> <Ninja Adventure - Asset Pack dir>
set -euo pipefail
LPC="$1"; NIN="$2"; D="$(dirname "$0")"; OUT="$D/../../client/src/scene/art"
python3 -I "$D/build-hero.py" "$LPC/spritesheets" "$OUT"
python3 -I "$D/build-backdrops.py" "$NIN" "$OUT"
python3 -I "$D/build-bosses.py" "$NIN" "$OUT"
python3 -I "$D/build-foes.py" "$NIN" "$OUT"
python3 -I "$D/make-credits-scene.py" "$LPC" /tmp/credits-scene.md
echo "LPC layer credits written to /tmp/credits-scene.md: copy any new rows into art/CREDITS.md (the credits test fails until every hero layer is credited)."
