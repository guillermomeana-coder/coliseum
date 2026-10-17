// Generates desktop/assets/tray-<level>.png (16x16) and tray-<level>@2x.png (32x32): colored dots.
// Run: node desktop/scripts/make-tray-icons.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const COLORS = {
  offline: [0x80, 0x80, 0x80],
  idle: [0x4c, 0xaf, 0x50],
  working: [0x21, 0x96, 0xf3],
  attention: [0xff, 0xb3, 0x00],
  error: [0xe5, 0x39, 0x35],
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function dotPng(size, [r, g, b]) {
  const c = (size - 1) / 2;
  const radius = size / 2 - 1;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      const a = Math.max(0, Math.min(1, radius + 0.5 - d)); // 1px antialiased edge
      const o = row + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
for (const [level, rgb] of Object.entries(COLORS)) {
  fs.writeFileSync(path.join(out, `tray-${level}.png`), dotPng(16, rgb));
  fs.writeFileSync(path.join(out, `tray-${level}@2x.png`), dotPng(32, rgb));
}
