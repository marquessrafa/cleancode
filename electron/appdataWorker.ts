// Worker da análise do AppData (Windows: Local, Roaming, LocalLow; macOS: Application Support e Caches).
// Mede cada pasta de programa e separa o que é seguro apagar:
// - caches, logs, despejos de travamento e temporários (qualquer nível até 5);
// - atualizações antigas de apps Squirrel (Discord, Slack, Teams, GitHub Desktop…): as pastas app-<versão>
//   anteriores à atual e os pacotes .nupkg baixados.
import { parentPort, workerData } from 'worker_threads';
import * as W from './platform/fs';

export interface AppDataEntry {
  path: string; name: string; root: string; parent?: string;
  size: number; files: number; mtime: number;
  safe: number; safePaths: { path: string; size: number; reason: string }[];
}
const port = parentPort!;
const roots: { path: string; label: string }[] = workerData.roots;
const vendors: string[] = (workerData.vendors || []).map((v: string) => v.toLowerCase());

const CACHE = /^(cache|caches|cache2|code cache|gpucache|shadercache|shader cache|dawncache|dawngraphitecache|dawnwebgpucache|grshadercache|graphitedawncache|cachestorage|crashpad|crashdumps|crash reports|crashreports|dumps|minidumps|logs?|temp|tmp|squirreltemp|webcache|inetcache|blob_storage)$/i;
const REASON = (n: string) => (/log/i.test(n) ? 'logs' : /crash|dump/i.test(n) ? 'relatórios de travamento' : /te?mp/i.test(n) ? 'temporários' : 'cache');

function measure(dir: string): { size: number; files: number; mtime: number } {
  let size = 0, files = 0, mtime = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    W.listDir(d, (e) => {
      if (e.mtime > mtime) mtime = e.mtime;
      if (e.attr & W.ATTR.DIRECTORY) { if (!(e.attr & W.ATTR.REPARSE)) stack.push(W.join(d, e.name)); }
      else { size += e.alloc ?? e.size; files++; }
    });
  }
  return { size, files, mtime };
}

const verKey = (n: string) => n.replace(/^app-/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
const newer = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); return false; };

function analyze(dir: string, name: string, root: string, parent?: string): AppDataEntry {
  const out: AppDataEntry = { path: dir, name, root, parent, size: 0, files: 0, mtime: 0, safe: 0, safePaths: [] };
  const addSafe = (p: string, m: { size: number; files: number; mtime: number }, reason: string) => {
    out.safe += m.size; if (out.safePaths.length < 200) out.safePaths.push({ path: p, size: m.size, reason });
  };
  const walk = (d: string, depth: number) => {
    const subdirs: string[] = [], names: string[] = []; let squirrel = false;
    W.listDir(d, (e) => {
      if (e.mtime > out.mtime) out.mtime = e.mtime;
      if (e.attr & W.ATTR.DIRECTORY) { if (!(e.attr & W.ATTR.REPARSE)) { subdirs.push(e.name); } }
      else { out.size += e.alloc ?? e.size; out.files++; names.push(e.name.toLowerCase()); }
    });
    // apps Squirrel: Update.exe + pastas app-<versão>; só a mais nova é usada
    squirrel = names.includes('update.exe') && subdirs.some((s) => /^app-\d/.test(s));
    let latest = '';
    if (squirrel) for (const s of subdirs) if (/^app-\d/.test(s) && (!latest || newer(verKey(s), verKey(latest)))) latest = s;
    for (const s of subdirs) {
      const p = W.join(d, s);
      const m = () => measure(p);
      if (CACHE.test(s)) { const x = m(); out.size += x.size; out.files += x.files; out.mtime = Math.max(out.mtime, x.mtime); addSafe(p, x, REASON(s)); continue; }
      if (squirrel && /^app-\d/.test(s) && s !== latest) { const x = m(); out.size += x.size; out.files += x.files; addSafe(p, x, `versão antiga (${s.slice(4)})`); continue; }
      if (squirrel && s.toLowerCase() === 'packages') {
        // pacotes .nupkg de atualizações já aplicadas
        const pk = p; let sz = 0, n = 0;
        W.listDir(pk, (e) => { if (!(e.attr & W.ATTR.DIRECTORY) && /\.nupkg$/i.test(e.name)) { const f = W.join(pk, e.name); const a = e.alloc ?? e.size; sz += a; n++; if (out.safePaths.length < 200) out.safePaths.push({ path: f, size: a, reason: 'pacote de atualização' }); } else if (!(e.attr & W.ATTR.DIRECTORY)) { out.size += e.alloc ?? e.size; out.files++; } });
        out.size += sz; out.files += n; out.safe += sz; continue;
      }
      if (depth < 5) walk(p, depth + 1);
      else { const x = m(); out.size += x.size; out.files += x.files; }
    }
  };
  walk(dir, 0);
  return out;
}

const entries: AppDataEntry[] = [];
for (const r of roots) {
  const tops: string[] = [];
  W.listDir(r.path, (e) => { if (e.attr & W.ATTR.DIRECTORY && !(e.attr & W.ATTR.REPARSE)) tops.push(e.name); });
  port.postMessage({ type: 'root', label: r.label, total: tops.length });
  for (const t of tops) {
    const p = W.join(r.path, t);
    // pastas de fabricante (Google, Adobe, JetBrains…): uma linha por produto
    if (vendors.includes(t.toLowerCase())) {
      const kids: string[] = []; let loose = 0;
      W.listDir(p, (e) => { if (e.attr & W.ATTR.DIRECTORY && !(e.attr & W.ATTR.REPARSE)) kids.push(e.name); else loose += e.alloc ?? e.size; });
      for (const k of kids) entries.push(analyze(W.join(p, k), k, r.label, t));
      void loose;
    } else entries.push(analyze(p, t, r.label));
    port.postMessage({ type: 'progress', label: r.label, name: t, count: entries.length });
  }
}
port.postMessage({ type: 'done', entries });
