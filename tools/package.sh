#!/bin/bash
# Builds the Chrome Web Store upload: dist/anti-slop-<version>.zip
# Checks first: tests pass, manifest is valid JSON, icons are the right size, and the telemetry
# address is set (pass --no-telemetry to build anyway, e.g. for a private test build).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./extension/manifest.json').version")
URL=$(grep -oP "^const TELEMETRY_URL = '\K[^']*" extension/background.js || true)

if [[ -z "$URL" && "${1:-}" != "--no-telemetry" ]]; then
  echo "TELEMETRY_URL in extension/background.js is empty. Deploy the Worker first (worker/README.md)," >&2
  echo "or run: tools/package.sh --no-telemetry" >&2
  exit 1
fi
if [[ -n "$URL" && ! "$URL" =~ ^https://[a-z0-9.-]+/v1/collect$ ]]; then
  echo "TELEMETRY_URL must be https://<host>/v1/collect (got $URL)" >&2; exit 1
fi

echo "Running tests..."
node --test tests/*.test.js > /dev/null
node --test worker/test/ > /dev/null

node -e "
const m = require('./extension/manifest.json');
const fs = require('fs');
if (m.manifest_version !== 3) throw new Error('not MV3');
for (const [s, f] of Object.entries(m.icons)) {
  const b = fs.readFileSync('extension/' + f);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (w != s || h != s) throw new Error(f + ' is ' + w + 'x' + h);
}
if (m.description.length > 132) throw new Error('manifest description over 132 characters');
console.log('Manifest OK:', m.name, m.version, '·', m.permissions.join(', '));
"

mkdir -p dist
OUT="dist/anti-slop-$VERSION.zip"
rm -f "$OUT"
(cd extension && zip -qr -X "../$OUT" . -x '.*' -x '*/.*')
echo "Built $OUT ($(du -h "$OUT" | cut -f1)) with telemetry ${URL:-OFF}"
unzip -l "$OUT" | tail -n +4 | head -n -2 | awk '{print "  " $4}'
