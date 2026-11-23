// Worker da Limpeza: percorre as pastas de cada categoria e mede cada item (espaço alocado),
// sem seguir links. Envia o resultado categoria por categoria.
import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import * as W from './platform/fs';
import type { JunkCategory, JunkTarget } from './platform/fs';

export interface JunkItem { path: string; name: string; size: number; mtime: number; dir: boolean }
const port = parentPort!;
const cats: JunkCategory[] = workerData.categories;
const aggressive: boolean = !!workerData.aggressive;
const MAX_ITEMS = 3000;

function sizeOf(p: string, isDir: boolean, alloc: number): { size: number; mtime: number } {
  if (!isDir) return { size: alloc, mtime: 0 };
  let total = 0, mtime = 0;
  const stack = [p];
  while (stack.length) {
    const d = stack.pop()!;
    W.listDir(d, (e) => {
      if (e.mtime > mtime) mtime = e.mtime;
      if (e.attr & W.ATTR.DIRECTORY) { if (!(e.attr & W.ATTR.REPARSE)) stack.push(W.join(d, e.name)); }
      else total += e.alloc ?? e.size;
    });
  }
  return { size: total, mtime };
}

function excluded(name: string, list?: string[]) {
  if (!list) return false;
  return list.some((x) => (x.endsWith('*') ? name.startsWith(x.slice(0, -1)) : name === x));
}
const extOf = (n: string) => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; };

/** Devolve true quando a pasta existe mas não pôde ser lida (permissão). */
function scanTarget(t: JunkTarget, out: JunkItem[], seen: Set<string>): boolean {
  const now = Date.now();
  const add = (p: string, name: string, dir: boolean, alloc: number, ownMtime: number) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const m = sizeOf(p, dir, alloc);
    out.push({ path: p, name, size: m.size, mtime: Math.max(ownMtime, m.mtime), dir });
  };
  if (t.mode === 'self') {
    let st: fs.Stats;
    try { st = fs.lstatSync(t.path); } catch { return false; }
    if (st.isSymbolicLink()) return false;
    add(t.path, t.path.split(W.sep).pop() || t.path, st.isDirectory(), st.blocks ? st.blocks * 512 : st.size, st.mtimeMs);
    return false;
  }
  if (t.findDirs) {
    // procura subpastas com esses nomes até maxDepth (ex.: perfis de navegador → Cache)
    const want = new Set(t.findDirs.map((n) => n.toLowerCase()));
    const walk = (dir: string, depth: number) => {
      W.listDir(dir, (e) => {
        if (!(e.attr & W.ATTR.DIRECTORY) || (e.attr & W.ATTR.REPARSE)) return;
        const p = W.join(dir, e.name);
        if (want.has(e.name.toLowerCase())) add(p, `${dir.split(W.sep).pop()} › ${e.name}`, true, 0, e.mtime);
        else if (depth < (t.maxDepth ?? 2)) walk(p, depth + 1);
      });
    };
    walk(t.path, 0);
    return false;
  }
  const ageDays = aggressive && t.aggressiveMinAgeDays !== undefined ? t.aggressiveMinAgeDays : t.minAgeDays;
  const maxAge = ageDays ? ageDays * 86400000 : 0;
  // Com idade mínima, uma pasta com algo recente não é descartada inteira: entra nela e pega o que está
  // parado (antes, um único arquivo novo escondia gigabytes antigos em %TEMP%).
  const scanDir = (dir: string, label: string, depth: number): number => W.listDir(dir, (e) => {
    if (depth === 0 && excluded(e.name, t.exclude)) return;
    if (e.name === '.DS_Store' || e.name === '.localized' || e.name === 'desktop.ini') return;
    const isDir = !!(e.attr & W.ATTR.DIRECTORY);
    if (e.attr & W.ATTR.REPARSE && isDir) return; // links/junções: nunca entra
    if (t.exts && (isDir || !t.exts.includes(extOf(e.name)))) return;
    const p = W.join(dir, e.name), name = label ? `${label} › ${e.name}` : e.name;
    if (!maxAge) { add(p, name, isDir, e.alloc ?? e.size, e.mtime); return; }
    if (!isDir) { if (now - e.mtime >= maxAge) add(p, name, false, e.alloc ?? e.size, e.mtime); return; }
    const m = sizeOf(p, true, 0);
    if (now - Math.max(e.mtime, m.mtime) >= maxAge) add(p, name, true, 0, e.mtime);
    else if (depth < 6) scanDir(p, name, depth + 1);
  });
  const err = scanDir(t.path, '', 0);
  return err === 5; // acesso negado (no macOS: falta Acesso Total ao Disco)
}

for (const c of cats) {
  if (c.special) continue; // tratadas no processo principal
  port.postMessage({ type: 'start', id: c.id });
  const items: JunkItem[] = [];
  const seen = new Set<string>();
  let denied = false;
  for (const t of c.targets) {
    try { if (scanTarget(t, items, seen)) denied = true; } catch { /* pasta inexistente */ }
  }
  // categoria "antigas" não deve repetir itens que já estão em outra (instaladores): o principal resolve
  items.sort((a, b) => b.size - a.size);
  const size = items.reduce((s, i) => s + i.size, 0);
  port.postMessage({ type: 'category', id: c.id, size, count: items.length, items: items.slice(0, MAX_ITEMS), truncated: items.length > MAX_ITEMS, denied });
}
port.postMessage({ type: 'done' });
