import { build } from 'esbuild';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';

// Fonte padrão de atualizações gravada no app: a pasta onde os builds são publicados.
// Pode ser trocada por uma URL/pasta de distribuição com CLEANCODE_UPDATE_SOURCE.
const updateSource = process.env.CLEANCODE_UPDATE_SOURCE || path.resolve('release');
// Identificador fixo da pasta de publicação: permite ao app reencontrá-la se o projeto mudar de lugar.
const feedId = fs.readFileSync(path.resolve('build/feed-id.txt'), 'utf8').trim();

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: false,
  external: ['electron', 'koffi', 'exceljs'],
  define: { __UPDATE_SOURCE__: JSON.stringify(updateSource), __FEED_ID__: JSON.stringify(feedId) },
  logLevel: 'info',
};

await build({
  ...common,
  entryPoints: {
    main: 'electron/main.ts',
    preload: 'electron/preload.ts',
    scanWorker: 'electron/scanWorker.ts',
    sizeWorker: 'electron/sizeWorker.ts',
    junkWorker: 'electron/junkWorker.ts',
    appdataWorker: 'electron/appdataWorker.ts',
    clutterWorker: 'electron/clutterWorker.ts',
    storageWorker: 'electron/storageWorker.ts',
  },
  outdir: 'dist-electron',
});

// macOS: helper nativo de sensores (temperatura), universal (arm64 + x86_64).
// Fica fora do asar (asarUnpack) para poder ser executado.
if (process.platform === 'darwin') {
  execFileSync('clang', [
    '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=12.0', '-O2', '-Wall',
    '-framework', 'IOKit', '-framework', 'CoreFoundation',
    'native/macos/cc-sensors.c', '-o', 'dist-electron/cc-sensors',
  ], { stdio: 'inherit' });
  console.log('dist-electron/cc-sensors gerado');
  // consumo e frequência (IOReport, sem senha)
  execFileSync('clang', [
    '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=12.0', '-O2', '-Wall',
    '-framework', 'IOKit', '-framework', 'CoreFoundation', '-lIOReport',
    'native/macos/cc-power.c', '-o', 'dist-electron/cc-power',
  ], { stdio: 'inherit' });
  console.log('dist-electron/cc-power gerado');
}
