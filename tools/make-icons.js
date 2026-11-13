// SUPERSEDED by tools/make-store-assets.js (which draws the current icon with the store's padding).
// Running this would overwrite the icons with the old design. Kept until Oscar decides to delete it.
// Generates the extension icons (16/48/128 px PNG) with no dependencies.
// A dark-red rounded square with a white "broom stroke" diagonal.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
function draw(size) {
  const r = size * 0.22;
  return png(size, (x, y) => {
    // rounded square
    const cx = Math.min(Math.max(x, r), size - 1 - r), cy = Math.min(Math.max(y, r), size - 1 - r);
    const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    if (!inside) return [0, 0, 0, 0];
    // white diagonal stroke (bottom-left to top-right) with a blob at the end
    const d = Math.abs((x + y) - (size - 1)) / Math.SQRT2;
    const stroke = d < size * 0.09 && x > size * 0.18 && x < size * 0.82;
    const blob = (x - size * 0.72) ** 2 + (y - size * 0.28) ** 2 < (size * 0.16) ** 2;
    if (stroke || blob) return [255, 255, 255, 255];
    return [178, 58, 72, 255];
  });
}
const out = path.join(__dirname, '..', 'extension', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const s of [16, 48, 128]) fs.writeFileSync(path.join(out, s + '.png'), draw(s));
console.log('icons written to', out);
