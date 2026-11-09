import { deflateSync } from "zlib";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const raw = [];
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.32;
  for (let y = 0; y < size; y++) {
    raw.push(0);
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy) / radius;
      let r = 10;
      let g = 10;
      let b = 14;
      if (d < 1) {
        const highlight = Math.max(0, 1 - Math.hypot(dx + radius * 0.25, dy + radius * 0.3) / radius);
        r = Math.round(120 + highlight * 90);
        g = Math.round(118 + highlight * 80);
        b = Math.round(110 + highlight * 70);
      } else if (d < 1.08) {
        r = 196;
        g = 165;
        b = 116;
      }
      raw.push(r, g, b, 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from(raw))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
writeFileSync(join(dir, "icon-192.png"), png(192));
writeFileSync(join(dir, "icon-512.png"), png(512));
writeFileSync(join(dir, "apple-touch-icon.png"), png(180));
console.log("icons written");
