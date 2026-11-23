// Worker dos Acúmulos: percorre as pastas pessoais (Mesa, Documentos, Transferências, Imagens,
// Filmes, Música) e encontra arquivos grandes, antigos, duplicados (conteúdo idêntico) e imagens.
import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import crypto from 'crypto';
import * as W from './platform/fs';

export interface ClutterFile { path: string; name: string; size: number; mtime: number; atime: number }
const port = parentPort!;
const roots: string[] = workerData.roots;
const now = Date.now();
const YEAR = 365 * 86400000;
// pastas que nunca entram: bibliotecas de apps, código, pacotes e pastas de sistema
const SKIP_DIR = /^(node_modules|\.git|\.svn|\.hg|__pycache__|\.venv|venv|build|dist|DerivedData|Pods|\.gradle|\.next|target)$/i;
const SKIP_PKG = /\.(photoslibrary|musiclibrary|tvlibrary|fcpbundle|imovielibrary|app|bundle|framework|lrlibrary|aplibrary|logicx|band|xcodeproj|xcworkspace)$/i;
const IMAGE = /\.(jpe?g|png|heic|heif|webp|gif|tiff?|bmp)$/i;
const MIN_FILE = 512 * 1024;

const files: ClutterFile[] = [];
const images: ClutterFile[] = [];
let scanned = 0, lastPost = 0;

for (const root of roots) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    W.listDir(dir, (e) => {
      if (e.name.startsWith('.')) return;
      const p = W.join(dir, e.name);
      if (e.attr & W.ATTR.DIRECTORY) {
        if (e.attr & W.ATTR.REPARSE || SKIP_DIR.test(e.name) || SKIP_PKG.test(e.name)) return;
        stack.push(p);
        return;
      }
      if (e.attr & W.ATTR.REPARSE) return;
      scanned++;
      const f = { path: p, name: e.name, size: e.size, mtime: e.mtime, atime: e.atime };
      if (IMAGE.test(e.name) && e.size >= 20 * 1024) images.push(f);
      if (e.size >= MIN_FILE) files.push(f);
    });
    if (Date.now() - lastPost > 250) { lastPost = Date.now(); port.postMessage({ type: 'progress', phase: 'Lendo pastas', scanned, current: dir }); }
  }
}

const large = files.filter((f) => f.size >= 100 * 1048576).sort((a, b) => b.size - a.size).slice(0, 2000);
const old = files.filter((f) => f.size >= 10 * 1048576 && now - f.mtime > YEAR && now - (f.atime || 0) > 180 * 86400000).sort((a, b) => b.size - a.size).slice(0, 2000);

// ---------- duplicados: tamanho → início do arquivo → SHA-1 completo ----------
function hashFile(p: string, limit?: number): string | null {
  try {
    const fd = fs.openSync(p, 'r');
    try {
      const h = crypto.createHash('sha1');
      const buf = Buffer.allocUnsafe(1 << 20);
      let pos = 0;
      for (;;) {
        const want = limit ? Math.min(buf.length, limit - pos) : buf.length;
        if (want <= 0) break;
        const n = fs.readSync(fd, buf, 0, want, pos);
        if (!n) break;
        h.update(buf.subarray(0, n)); pos += n;
      }
      return h.digest('hex');
    } finally { fs.closeSync(fd); }
  } catch { return null; }
}
const bySize = new Map<number, ClutterFile[]>();
for (const f of files) { const l = bySize.get(f.size); l ? l.push(f) : bySize.set(f.size, [f]); }
const candidates = [...bySize.values()].filter((l) => l.length > 1);
const dupGroups: { size: number; files: ClutterFile[] }[] = [];
let done = 0;
for (const group of candidates) {
  done++;
  if (done % 20 === 0) port.postMessage({ type: 'progress', phase: 'Comparando arquivos', scanned, done, total: candidates.length });
  const byHead = new Map<string, ClutterFile[]>();
  for (const f of group) { const h = hashFile(f.path, 65536); if (!h) continue; const l = byHead.get(h); l ? l.push(f) : byHead.set(h, [f]); }
  for (const same of byHead.values()) {
    if (same.length < 2) continue;
    const byFull = new Map<string, ClutterFile[]>();
    for (const f of same) { const h = group[0].size <= 65536 ? 'head' : hashFile(f.path); if (!h) continue; const l = byFull.get(h); l ? l.push(f) : byFull.set(h, [f]); }
    for (const g of byFull.values()) if (g.length > 1) dupGroups.push({ size: group[0].size, files: g.sort((a, b) => a.mtime - b.mtime) });
  }
}
dupGroups.sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1));

port.postMessage({ type: 'done', scanned, large, old, duplicates: dupGroups.slice(0, 1500), images: images.slice(0, 6000) });
