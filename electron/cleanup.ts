// Limpeza: varredura das categorias (worker) e remoção segura.
// Só remove caminhos devolvidos pela última varredura; o padrão é a Lixeira.
import { shell } from 'electron';
import { Worker } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { system } from './platform';
import type { JunkCategory } from './platform';

export interface CategoryResult { id: string; size: number; count: number; denied?: boolean; items: { path: string; name: string; size: number; mtime: number; dir: boolean }[]; truncated?: boolean; error?: string }
type Send = (channel: string, data: any) => void;

let allowed = new Map<string, { category: string; size: number }>(); // caminho → categoria
let lastCats: JunkCategory[] = [];
let running: Worker | null = null;

export function categories() {
  lastCats = system.junk.categories();
  return lastCats.map(({ targets, ...c }) => ({ ...c, paths: targets.map((t) => t.path) }));
}

export function scan(send: Send): Promise<CategoryResult[]> {
  running?.terminate();
  lastCats = system.junk.categories();
  allowed = new Map();
  const results: CategoryResult[] = [];
  const claimed = new Set<string>();
  return new Promise((resolve) => {
    const w = new Worker(path.join(__dirname, 'junkWorker.js'), { workerData: { categories: lastCats } });
    running = w;
    w.on('message', async (m: any) => {
      if (m.type === 'start') send('cleanup:progress', { type: 'start', id: m.id });
      else if (m.type === 'category') {
        // um item aparece numa só categoria (ex.: um instalador antigo não conta também em "antigas")
        const items = m.items.filter((i: any) => !claimed.has(i.path));
        let size = 0;
        for (const i of items) { claimed.add(i.path); allowed.set(i.path, { category: m.id, size: i.size }); size += i.size; }
        const removed = m.items.length - items.length;
        const r: CategoryResult = { id: m.id, size: removed ? size : m.size, count: m.count - removed, items, truncated: m.truncated, denied: m.denied };
        results.push(r);
        send('cleanup:progress', { type: 'category', ...r });
      } else if (m.type === 'done') {
        // categorias tratadas pelo SO (Lixeira do Windows)
        for (const c of lastCats.filter((x) => x.special)) {
          send('cleanup:progress', { type: 'start', id: c.id });
          const s = await system.junk.specialScan?.(c.id).catch(() => null);
          const r: CategoryResult = { id: c.id, size: s?.size || 0, count: s?.count || 0, items: [] };
          results.push(r);
          send('cleanup:progress', { type: 'category', ...r });
        }
        running = null;
        w.terminate();
        send('cleanup:progress', { type: 'done' });
        resolve(results);
      }
    });
    w.on('error', (e) => { running = null; send('cleanup:progress', { type: 'error', error: String(e) }); resolve(results); });
  });
}

export function cancelScan() { running?.terminate(); running = null; }

export interface CleanResult { freed: number; removed: number; failed: { path: string; error: string }[] }

export async function clean(paths: string[], specials: string[], mode: 'trash' | 'delete', send: Send, activityFile: string): Promise<CleanResult> {
  const res: CleanResult = { freed: 0, removed: 0, failed: [] };
  const total = paths.length + specials.length;
  let done = 0, lastEmit = 0;
  const progress = (current: string) => {
    if (Date.now() - lastEmit < 100 && done < total) return;
    lastEmit = Date.now();
    send('cleanup:cleanProgress', { done, total, freed: res.freed, current });
  };
  for (const p of paths) {
    const info = allowed.get(p);
    done++;
    if (!info) { res.failed.push({ path: p, error: 'Fora da última análise' }); continue; }
    const cat = lastCats.find((c) => c.id === info.category);
    const permanent = mode === 'delete' || cat?.removal === 'delete';
    try {
      if (permanent) await fs.promises.rm(p, { recursive: true, force: true, maxRetries: 2 });
      else await shell.trashItem(p);
      if (fs.existsSync(p)) throw new Error('Em uso ou protegido');
      res.freed += info.size; res.removed++;
      allowed.delete(p);
    } catch (err: any) {
      res.failed.push({ path: p, error: /EPERM|EACCES|denied|not permitted/i.test(String(err?.message)) ? 'Sem permissão' : /EBUSY|em uso/i.test(String(err?.message)) ? 'Em uso por outro programa' : String(err?.message || err).slice(0, 120) });
    }
    progress(p);
  }
  for (const id of specials) {
    done++;
    try {
      const before = await system.junk.specialScan?.(id).catch(() => null);
      await system.junk.specialClean?.(id);
      res.freed += before?.size || 0; res.removed += before?.count || 0;
    } catch (err: any) { res.failed.push({ path: id, error: String(err?.message || err) }); }
    progress(id);
  }
  send('cleanup:cleanProgress', { done, total, freed: res.freed, current: '' });
  // registro para "Atividades"
  try {
    let log: any[] = [];
    try { log = JSON.parse(fs.readFileSync(activityFile, 'utf8')); } catch { /* primeiro registro */ }
    log.unshift({ at: Date.now(), kind: 'cleanup', freed: res.freed, removed: res.removed, failed: res.failed.length, mode });
    fs.writeFileSync(activityFile, JSON.stringify(log.slice(0, 500)));
  } catch { /* não impede a limpeza */ }
  return res;
}

export function activity(activityFile: string): any[] {
  try { return JSON.parse(fs.readFileSync(activityFile, 'utf8')); } catch { return []; }
}
