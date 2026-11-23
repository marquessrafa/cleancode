// Copia o build recém-gerado de release-build/ para release/ com os nomes de download definitivos
// e gera o feed do atualizador (latest.yml no Windows, latest-mac.yml no macOS).
//   macOS:   CleanCode-<v>-macOS-Apple-Silicon.dmg/.zip, CleanCode-<v>-macOS-Intel.dmg/.zip
//            (+ CleanCode-<v>-macOS-Universal.zip na 1.3.0: as versões antigas do atualizador baixam um
//             único arquivo para Intel e Apple Silicon, então esta versão ainda publica o universal)
//   Windows: CleanCode-<v>-Windows-x64.exe (o Electron 45 não tem build para Windows 32 bits)
// (o build sai em release-build/ porque a pasta win-unpacked antiga às vezes fica bloqueada)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8').replace(/^﻿/, ''));
const v = pkg.version;
const mac = process.platform === 'darwin';
const map = mac ? {
  [`CleanCode-${v}-mac-arm64.dmg`]: `CleanCode-${v}-macOS-Apple-Silicon.dmg`,
  [`CleanCode-${v}-mac-x64.dmg`]: `CleanCode-${v}-macOS-Intel.dmg`,
  [`CleanCode-${v}-mac-arm64.zip`]: `CleanCode-${v}-macOS-Apple-Silicon.zip`,
  [`CleanCode-${v}-mac-x64.zip`]: `CleanCode-${v}-macOS-Intel.zip`,
  [`CleanCode-${v}-mac-universal.zip`]: `CleanCode-${v}-macOS-Universal.zip`,
} : {
  [`CleanCode-${v}-win-x64.exe`]: `CleanCode-${v}-Windows-x64.exe`,
};
fs.mkdirSync(path.join(root, 'release'), { recursive: true });
for (const [from, to] of Object.entries(map)) {
  const src = path.join(root, 'release-build', from);
  if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(root, 'release', to)); console.log(from, '→', to); }
  else console.warn('faltando:', from);
}
process.argv[2] = mac ? 'mac' : 'win';
require('./make-latest.cjs');
// marcador que identifica esta pasta como a fonte de atualizações do CleanCode (atualização por pasta local)
const feedId = fs.readFileSync(path.join(root, 'build', 'feed-id.txt'), 'utf8').trim();
fs.writeFileSync(path.join(root, 'release', 'cleancode-feed.json'), JSON.stringify({ app: 'CleanCode', id: feedId }, null, 2));
