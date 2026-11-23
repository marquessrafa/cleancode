// Gera o ícone "template" da barra de menus do macOS: build/trayTemplate.png (16 px) e @2x (32 px).
// Template = preto + transparência; o macOS pinta de branco ou preto conforme o tema da barra.
// Desenho: o mesmo anel de uso de disco do ícone do app (scripts/make-icon.cjs), sem o quadrado de fundo.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

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
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function render(size) {
  const SS = 8, N = size * SS;
  const acc = new Float64Array(size * size);
  const cx = N / 2, cy = N / 2;
  const ro = N * 0.47, ri = N * 0.29;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x + 0.5, py = y + 0.5, d = Math.hypot(px - cx, py - cy);
    let a = 0;
    if (d <= ro && d >= ri) {
      let ang = Math.atan2(py - cy, px - cx) + Math.PI / 2; if (ang < 0) ang += Math.PI * 2;
      const frac = ang / (Math.PI * 2);
      if (frac < 0.68) a = 1;                         // parte usada
      else if (frac > 0.73 && frac < 0.95) a = 0.45;  // parte livre, mais clara
    }
    if (d < N * 0.1) a = 1; // ponto central
    acc[(y / SS | 0) * size + (x / SS | 0)] += a;
  }
  const out = Buffer.alloc(size * size * 4); // RGB = 0 (preto)
  for (let i = 0; i < size * size; i++) out[i * 4 + 3] = Math.round((acc[i] / (SS * SS)) * 255);
  return out;
}

const dir = path.join(__dirname, '..', 'build');
fs.writeFileSync(path.join(dir, 'trayTemplate.png'), png(16, render(16)));
fs.writeFileSync(path.join(dir, 'trayTemplate@2x.png'), png(32, render(32)));
console.log('build/trayTemplate.png e build/trayTemplate@2x.png gerados');
