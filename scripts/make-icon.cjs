// Gera build/icon.ico (ícone próprio: quadrado arredondado com anel de uso de disco).
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
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function render(size) {
  const SS = 4, N = size * SS;
  const acc = new Float64Array(size * size * 4);
  const r = N * 0.22; // raio do canto
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x + 0.5, py = y + 0.5;
    // quadrado arredondado
    const dx = Math.max(r - px, 0, px - (N - r)), dy = Math.max(r - py, 0, py - (N - r));
    if (dx * dx + dy * dy > r * r) continue;
    const t = (px + py) / (2 * N);
    let R = 16 + (6 - 16) * t, G = 185 + (95 - 185) * t, B = 129 + (70 - 129) * t; // esmeralda -> verde escuro
    let A = 255;
    // anel (gráfico de rosca) centralizado
    const cx = N / 2, cy = N / 2, d = Math.hypot(px - cx, py - cy);
    const ro = N * 0.33, ri = N * 0.19;
    if (d <= ro && d >= ri) {
      let ang = Math.atan2(py - cy, px - cx) + Math.PI / 2; if (ang < 0) ang += Math.PI * 2;
      const frac = ang / (Math.PI * 2);
      if (frac < 0.68) { R = 255; G = 255; B = 255; }
      else if (frac > 0.71 && frac < 0.97) { R = 255; G = 255; B = 255; A = 255; R = 190; G = 245; B = 220; }
    }
    // ponto central
    if (d < N * 0.07) { R = 255; G = 255; B = 255; }
    const o = ((y / SS | 0) * size + (x / SS | 0)) * 4;
    acc[o] += R * A / 255; acc[o + 1] += G * A / 255; acc[o + 2] += B * A / 255; acc[o + 3] += A;
  }
  const out = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let i = 0; i < size * size; i++) {
    const a = acc[i * 4 + 3] / n;
    out[i * 4 + 3] = Math.round(a);
    if (a > 0) for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(acc[i * 4 + k] / n / (a / 255));
  }
  return out;
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((s) => png(s, render(s)));
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s >= 256 ? 0 : s; e[1] = s >= 256 ? 0 : s; e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.ico'), Buffer.concat([header, ...dir, ...pngs]));
fs.writeFileSync(path.join(__dirname, '..', 'public', 'icon.png'), pngs[sizes.indexOf(256)]);
// macOS: PNG 1024 px com a margem padrão dos ícones do sistema (desenho em 824 px, centralizado);
// o electron-builder converte em .icns no build do Mac.
{
  const inner = 824, full = 1024, off = (full - inner) / 2;
  const src = render(inner), out = Buffer.alloc(full * full * 4);
  for (let y = 0; y < inner; y++) src.copy(out, ((y + off) * full + off) * 4, y * inner * 4, (y + 1) * inner * 4);
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon-mac.png'), png(full, out));
}
console.log('ícone gerado');
