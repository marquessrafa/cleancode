// Mapa do armazenamento do disco do sistema (Visão geral): quanto cada tipo de conteúdo ocupa
// (apps, documentos, downloads, mídia, desenvolvimento, caches, dados de apps, Lixeira). O que sobra do
// espaço usado é "Sistema e outros". Medido num worker e guardado por 15 minutos.
import { app } from 'electron';
import { Worker } from 'worker_threads';
import fs from 'fs';
import os from 'os';
import path from 'path';

const isMac = process.platform === 'darwin';
const H = os.homedir();
const j = (...p: string[]) => path.join(H, ...p);

export interface StorageCat { id: string; label: string; paths: string[]; size: number; done: boolean; partial?: boolean }
export interface StorageMap { root: string; at: number; done: boolean; cats: StorageCat[] }

function defs(): { id: string; label: string; paths: string[] }[] {
  if (isMac) {
    return [
      { id: 'docs', label: 'Documentos', paths: [j('Documents'), j('Desktop')] },
      { id: 'downloads', label: 'Downloads', paths: [j('Downloads')] },
      { id: 'media', label: 'Fotos, vídeos e música', paths: [j('Pictures'), j('Movies'), j('Music')] },
      { id: 'dev', label: 'Desenvolvimento', paths: [j('Library', 'Developer'), j('.npm'), j('.gradle'), j('.cargo'), j('.m2'), j('.rustup'), j('.docker'), j('Library', 'Containers', 'com.docker.docker'), j('Library', 'Android'), j('.android'), j('.pub-cache'), j('.cocoapods')] },
      { id: 'caches', label: 'Caches e logs', paths: [j('Library', 'Caches'), j('Library', 'Logs')] },
      { id: 'appdata', label: 'Dados de apps', paths: [j('Library', 'Application Support'), j('Library', 'Containers'), j('Library', 'Group Containers')] },
      { id: 'mail', label: 'Mail e Mensagens', paths: [j('Library', 'Mail'), j('Library', 'Messages')] },
      { id: 'trash', label: 'Lixeira', paths: [j('.Trash')] },
    ];
  }
  const local = process.env.LOCALAPPDATA || j('AppData', 'Local');
  const roaming = process.env.APPDATA || j('AppData', 'Roaming');
  const temp = process.env.TEMP || path.join(local, 'Temp');
  return [
    { id: 'docs', label: 'Documentos', paths: [j('Documents'), j('Desktop')] },
    { id: 'downloads', label: 'Downloads', paths: [j('Downloads')] },
    { id: 'media', label: 'Fotos, vídeos e música', paths: [j('Pictures'), j('Videos'), j('Music')] },
    { id: 'dev', label: 'Desenvolvimento', paths: [j('.npm'), j('.gradle'), j('.cargo'), j('.m2'), j('.rustup'), j('.nuget'), j('.android'), path.join(local, 'Android'), path.join(local, 'npm-cache'), path.join(local, 'pip'), path.join(local, 'Docker'), j('source', 'repos')] },
    { id: 'caches', label: 'Temporários e caches', paths: [temp, path.join(local, 'Microsoft', 'Windows', 'INetCache'), path.join(local, 'CrashDumps')] },
    { id: 'appdata', label: 'Dados de apps (AppData)', paths: [roaming, local, j('AppData', 'LocalLow')] },
  ];
}

let cache: StorageMap | null = null;
let workers: Worker[] = [];
const file = () => path.join(app.getPath('userData'), 'storage-map.json');
function loadSaved(): StorageMap | null {
  try { const m = JSON.parse(fs.readFileSync(file(), 'utf8')); return m && Array.isArray(m.cats) ? m : null; } catch { return null; }
}
function save(m: StorageMap) { try { fs.writeFileSync(file(), JSON.stringify(m)); } catch { /* */ } }

/** Mapa atual. A última medição (guardada em disco) aparece na hora; se tiver mais de 15 minutos, mede de novo
 *  em segundo plano, todas as categorias ao mesmo tempo, e o progresso chega por onProgress. */
export function storageMap(onProgress: (m: StorageMap) => void, refresh = false): StorageMap {
  if (!cache) cache = loadSaved();
  const busy = workers.length > 0;
  if (cache && !refresh && (busy || Date.now() - cache.at < 15 * 60000)) return cache;
  const d = defs();
  const root = isMac ? '/' : (process.env.SystemDrive || 'C:') + '\\';
  const prev = cache;
  const cur: StorageMap = {
    root, at: prev?.at || Date.now(), done: false,
    // enquanto mede de novo, os valores anteriores continuam na tela
    cats: [{ id: 'apps', label: 'Aplicativos', paths: [], size: 0, done: false }, ...d.map((x) => {
      const old = prev?.cats.find((c) => c.id === x.id);
      return { ...x, size: old?.size || 0, done: !!old?.done, partial: old?.partial };
    })],
  };
  cache = cur;
  const all = d.flatMap((x) => x.paths.map((p) => ({ id: x.id, p })));
  const inside = (p: string, parent: string) => p.toLowerCase().startsWith(parent.toLowerCase() + path.sep);
  for (const w of workers) w.terminate();
  workers = [];
  let left = d.length;
  for (const x of d) {
    // cada categoria pula as pastas que pertencem a outra (ex.: Docker fica em Desenvolvimento, não em Dados de apps)
    const exclude = all.filter((o) => o.id !== x.id && x.paths.some((p) => inside(o.p, p))).map((o) => o.p);
    const w = new Worker(path.join(__dirname, 'storageWorker.js'), { workerData: { cats: [{ id: x.id, paths: x.paths, exclude }] } });
    workers.push(w);
    const finish = () => {
      w.terminate(); workers = workers.filter((y) => y !== w);
      if (--left === 0 && cache === cur) { cur.done = true; cur.at = Date.now(); save(cur); }
      onProgress(cur);
    };
    w.on('message', (m: any) => {
      if (m.done) return finish();
      const c = cur.cats.find((y) => y.id === m.id);
      if (c) { c.size = m.size; c.done = true; c.partial = m.partial; }
      onProgress(cur);
    });
    w.on('error', finish);
  }
  return cur;
}
