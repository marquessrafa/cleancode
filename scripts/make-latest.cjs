// Gera o feed do atualizador embutido (formato do electron-builder, com extensões do CleanCode):
//   Windows: release/latest.yml     macOS: release/latest-mac.yml
// Topo (version/path/sha512/files): o que as versões antigas do atualizador leem.
//   Windows → instalador x64 (todas as instalações anteriores eram x64)
//   macOS   → .zip Intel: roda em qualquer Mac (no Apple Silicon pelo Rosetta). O universal saiu na 1.4.1;
//             a partir da 1.4.1 o atualizador detecta o Rosetta e volta para o build Apple Silicon.
// pathArm64/pathX64/pathIa32 (+ sha512/size): o arquivo de cada arquitetura, lido a partir da 1.3.0.
// base: pasta do Release com os arquivos (permite servir o feed a partir do repositório).
// Uso: node scripts/make-latest.cjs [win|mac]  (padrão: o SO atual)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8').replace(/^﻿/, ''));
const v = pkg.version;
const target = process.argv[2] || (process.platform === 'darwin' ? 'mac' : 'win');
const feed = target === 'mac' ? 'latest-mac.yml' : 'latest.yml';
const arch = target === 'mac'
  ? { Arm64: `CleanCode-${v}-macOS-Apple-Silicon.zip`, X64: `CleanCode-${v}-macOS-Intel.zip` }
  : { X64: `CleanCode-${v}-Windows-x64.exe` };
const info = {};
for (const [k, f] of Object.entries(arch)) {
  const p = path.join(root, 'release', f);
  if (!fs.existsSync(p)) continue;
  const buf = fs.readFileSync(p);
  info[k] = { file: f, sha512: crypto.createHash('sha512').update(buf).digest('base64'), size: buf.length };
}
const main = target === 'mac' ? (info.X64 || info.Arm64) : (info.X64 || info.Ia32);
if (!main) throw new Error('Nenhum arquivo para o feed em release/');
const order = [main, ...Object.values(info).filter((x) => x !== main)];
const lines = [`version: ${v}`, 'files:', ...order.flatMap((x) => [`  - url: ${x.file}`, `    sha512: ${x.sha512}`, `    size: ${x.size}`]), `path: ${main.file}`, `sha512: ${main.sha512}`];
for (const [k, x] of Object.entries(info)) lines.push(`path${k}: ${x.file}`, `sha512${k}: ${x.sha512}`, `size${k}: ${x.size}`);
if (process.env.CLEANCODE_RELEASE_BASE) lines.push(`base: ${process.env.CLEANCODE_RELEASE_BASE}`);
// novidades das últimas versões (src/lib/changelog.ts) numa linha em base64: o popup de atualização mostra as da
// versão nova (e das que a pessoa pulou). Versões antigas do app ignoram a chave.
try {
  const { transformSync } = require('esbuild');
  const src = fs.readFileSync(path.join(root, 'src', 'lib', 'changelog.ts'), 'utf8');
  const js = transformSync(src, { loader: 'ts', format: 'cjs' }).code;
  const mod = { exports: {} }; new Function('module', 'exports', js)(mod, mod.exports);
  const notes = (mod.exports.CHANGELOG || []).slice(0, 8);
  if (notes.length) lines.push(`notes: ${Buffer.from(JSON.stringify(notes), 'utf8').toString('base64')}`);
  // versões traduzidas das novidades (o app usa a do próprio idioma; versões antigas ignoram estas chaves)
  for (const lang of ['en', 'es']) {
    let dict = {};
    try { dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'locales', `${lang}.json`), 'utf8')); } catch { /* sem dicionário */ }
    const tr = (s) => (s && dict[s]) || s;
    const translated = notes.map((n) => ({ ...n, headline: tr(n.headline), groups: (n.groups || []).map((g) => ({ ...g, title: tr(g.title), items: (g.items || []).map(tr) })) }));
    if (notes.length) lines.push(`notes_${lang}: ${Buffer.from(JSON.stringify(translated), 'utf8').toString('base64')}`);
  }
} catch (e) { console.warn('novidades fora do feed:', e.message); }
lines.push(`releaseDate: '${new Date().toISOString()}'`, '');
fs.writeFileSync(path.join(root, 'release', feed), lines.join('\n'));
console.log(`${feed} →`, v, Object.keys(info).join(', '));
