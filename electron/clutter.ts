// Acúmulos: arquivos grandes e antigos, duplicados, fotos parecidas e Transferências.
// O worker lê as pastas pessoais; as fotos parecidas usam miniaturas do próprio sistema
// (Quick Look no macOS, shell do Windows) e um hash de diferença (dHash) de 64 bits.
import { app, nativeImage, shell } from 'electron';
import { Worker } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { t as tr } from './i18n';

interface CFile { path: string; name: string; size: number; mtime: number; atime: number }
export interface SimilarGroup { files: (CFile & { thumb?: string; width?: number; height?: number })[] }
export interface ClutterReport { scanned: number; large: CFile[]; old: CFile[]; duplicates: { size: number; files: CFile[] }[]; similar: SimilarGroup[]; downloads: CFile[]; roots: string[] }
type Send = (ch: string, d: any) => void;

let allowed = new Map<string, number>(); // caminho → tamanho
let running: Worker | null = null;

export function roots(): string[] {
  const keys = ['desktop', 'documents', 'downloads', 'pictures', 'videos', 'music'] as const;
  const out: string[] = [];
  for (const k of keys) { try { const p = app.getPath(k); if (fs.existsSync(p) && !out.includes(p)) out.push(p); } catch { /* */ } }
  return out;
}

/** dHash: miniatura 9×8 em tons de cinza; cada bit diz se o pixel é mais claro que o vizinho. */
function dhash(img: Electron.NativeImage): [number, number] | null {
  const small = img.resize({ width: 9, height: 8, quality: 'good' });
  const bmp = small.toBitmap(); // BGRA
  const { width, height } = small.getSize();
  if (width !== 9 || height !== 8 || bmp.length < 9 * 8 * 4) return null;
  const g = (x: number, y: number) => { const i = (y * 9 + x) * 4; return bmp[i + 2] * 0.299 + bmp[i + 1] * 0.587 + bmp[i] * 0.114; };
  let hi = 0, lo = 0, bit = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++, bit++) {
    const v = g(x, y) > g(x + 1, y) ? 1 : 0;
    if (bit < 32) hi = (hi << 1) | v; else lo = (lo << 1) | v;
  }
  return [hi >>> 0, lo >>> 0];
}
const popcount = (n: number) => { n = n - ((n >>> 1) & 0x55555555); n = (n & 0x33333333) + ((n >>> 2) & 0x33333333); return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
const distance = (a: [number, number], b: [number, number]) => popcount((a[0] ^ b[0]) >>> 0) + popcount((a[1] ^ b[1]) >>> 0);

async function similarPhotos(images: CFile[], exclude: Set<string>, send: Send): Promise<SimilarGroup[]> {
  const list = images.filter((f) => !exclude.has(f.path)).slice(0, 4000);
  const hashes: { f: CFile; h: [number, number] }[] = [];
  let last = 0;
  for (let i = 0; i < list.length; i++) {
    try {
      const t = await nativeImage.createThumbnailFromPath(list[i].path, { width: 64, height: 64 });
      const h = !t.isEmpty() ? dhash(t) : null;
      if (h) hashes.push({ f: list[i], h });
    } catch { /* formato não suportado */ }
    if (Date.now() - last > 250) { last = Date.now(); send('clutter:progress', { phase: tr("Comparando fotos"), done: i + 1, total: list.length }); }
  }
  // agrupamento por líder: uma foto só entra num grupo se for parecida com a primeira dele
  // (encadear "A parece B, B parece C" juntava imagens diferentes, como fundos escuros).
  // Imagens quase uniformes (hash com poucos bits variando) não dão sinal confiável e ficam de fora.
  const bits = (h: [number, number]) => popcount(h[0]) + popcount(h[1]);
  const usable = hashes.filter((x) => { const b = bits(x.h); return b >= 10 && b <= 54; }).sort((a, b) => b.f.size - a.f.size);
  const leaders: { h: [number, number]; files: CFile[] }[] = [];
  for (const x of usable) {
    const g = leaders.find((l) => distance(l.h, x.h) <= 5);
    if (g) g.files.push(x.f); else leaders.push({ h: x.h, files: [x.f] });
  }
  const groups = new Map<number, CFile[]>(leaders.map((l, i) => [i, l.files]));
  const out: SimilarGroup[] = [];
  for (const g of [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.reduce((s, f) => s + f.size, 0) - a.reduce((s, f) => s + f.size, 0)).slice(0, 300)) {
    const files = await Promise.all(g.slice(0, 12).map(async (f) => {
      try {
        const t = await nativeImage.createThumbnailFromPath(f.path, { width: 220, height: 220 });
        const full = nativeImage.createFromPath(f.path).getSize();
        return { ...f, thumb: 'data:image/jpeg;base64,' + t.toJPEG(72).toString('base64'), width: full.width || undefined, height: full.height || undefined };
      } catch { return { ...f }; }
    }));
    out.push({ files });
  }
  return out;
}

export function scan(send: Send): Promise<ClutterReport> {
  running?.terminate();
  allowed = new Map();
  const r = roots();
  return new Promise((resolve) => {
    const w = new Worker(path.join(__dirname, 'clutterWorker.js'), { workerData: { roots: r } });
    running = w;
    w.on('message', async (m: any) => {
      if (m.type === 'progress') { send('clutter:progress', m); return; }
      if (m.type !== 'done') return;
      running = null; w.terminate();
      const dupPaths = new Set<string>(m.duplicates.flatMap((g: any) => g.files.map((f: CFile) => f.path)));
      const similar = await similarPhotos(m.images, dupPaths, send);
      const dl = app.getPath('downloads');
      const downloads = (m.large as CFile[]).concat(m.old).filter((f) => f.path.startsWith(dl + path.sep));
      // Transferências: tudo o que o worker viu lá (≥ 512 KB), sem repetir
      const seen = new Set<string>();
      const allDl: CFile[] = [];
      for (const f of [...downloads, ...m.images, ...(m.duplicates.flatMap((g: any) => g.files))] as CFile[]) {
        if (f.path.startsWith(dl + path.sep) && !seen.has(f.path)) { seen.add(f.path); allDl.push(f); }
      }
      const report: ClutterReport = { scanned: m.scanned, large: m.large, old: m.old, duplicates: m.duplicates, similar, downloads: allDl.sort((a, b) => b.size - a.size).slice(0, 1500), roots: r };
      for (const f of [...report.large, ...report.old, ...report.duplicates.flatMap((g) => g.files), ...report.similar.flatMap((g) => g.files), ...report.downloads]) allowed.set(f.path, f.size);
      send('clutter:progress', { phase: tr("Pronto") });
      resolve(report);
    });
    w.on('error', (e) => { running = null; send('clutter:progress', { phase: tr("Erro"), error: String(e) }); resolve({ scanned: 0, large: [], old: [], duplicates: [], similar: [], downloads: [], roots: r }); });
  });
}

export function cancel() { running?.terminate(); running = null; }

/** Move para a Lixeira só caminhos que vieram da última análise. */
export async function trash(paths: string[]): Promise<{ freed: number; removed: number; failed: { path: string; error: string }[] }> {
  const res = { freed: 0, removed: 0, failed: [] as { path: string; error: string }[] };
  for (const p of [...new Set(paths)]) {
    const size = allowed.get(p);
    if (size === undefined) { res.failed.push({ path: p, error: tr("Fora da última análise") }); continue; }
    try { await shell.trashItem(p); allowed.delete(p); res.freed += size; res.removed++; }
    catch (err: any) { res.failed.push({ path: p, error: String(err?.message || err).slice(0, 120) }); }
  }
  return res;
}
