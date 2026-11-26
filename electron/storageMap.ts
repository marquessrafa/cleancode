// Mapa do armazenamento do disco do sistema (Visão geral): quanto cada tipo de conteúdo ocupa
// (apps, jogos, documentos, downloads, mídia, desenvolvimento, caches, dados de apps, Lixeira). O que sobra do
// espaço usado é "Sistema e outros". Medido num worker e guardado por 15 minutos.
// Os jogos são as pastas que o Modo Jogo encontra (Steam, Epic, GOG e as pastas escolhidas por você) e que ficam no
// disco do sistema. Cada pasta entra numa categoria só: um jogo dentro de Documentos, por exemplo, sai de Documentos.
import { app } from 'electron';
import { Worker } from 'worker_threads';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { t } from './i18n';

const isMac = process.platform === 'darwin';
const H = os.homedir();
const j = (...p: string[]) => path.join(H, ...p);

export interface StorageCat { id: string; label: string; paths: string[]; size: number; done: boolean; partial?: boolean }
export interface StorageMap { root: string; at: number; done: boolean; cats: StorageCat[] }

function defs(): { id: string; label: string; paths: string[] }[] {
  if (isMac) {
    return [
      { id: 'docs', label: t("Documentos"), paths: [j('Documents'), j('Desktop')] },
      { id: 'downloads', label: t("Downloads"), paths: [j('Downloads')] },
      { id: 'media', label: t("Fotos, vídeos e música"), paths: [j('Pictures'), j('Movies'), j('Music')] },
      { id: 'dev', label: t("Desenvolvimento"), paths: [j('Library', 'Developer'), j('.npm'), j('.gradle'), j('.cargo'), j('.m2'), j('.rustup'), j('.docker'), j('Library', 'Containers', 'com.docker.docker'), j('Library', 'Android'), j('.android'), j('.pub-cache'), j('.cocoapods')] },
      { id: 'caches', label: t("Caches e logs"), paths: [j('Library', 'Caches'), j('Library', 'Logs')] },
      { id: 'appdata', label: t("Dados de apps"), paths: [j('Library', 'Application Support'), j('Library', 'Containers'), j('Library', 'Group Containers')] },
      { id: 'mail', label: t("Mail e Mensagens"), paths: [j('Library', 'Mail'), j('Library', 'Messages')] },
      { id: 'trash', label: t("Lixeira"), paths: [j('.Trash')] },
    ];
  }
  const local = process.env.LOCALAPPDATA || j('AppData', 'Local');
  const roaming = process.env.APPDATA || j('AppData', 'Roaming');
  const temp = process.env.TEMP || path.join(local, 'Temp');
  return [
    { id: 'docs', label: t("Documentos"), paths: [j('Documents'), j('Desktop')] },
    { id: 'downloads', label: t("Downloads"), paths: [j('Downloads')] },
    { id: 'media', label: t("Fotos, vídeos e música"), paths: [j('Pictures'), j('Videos'), j('Music')] },
    { id: 'dev', label: t("Desenvolvimento"), paths: [j('.npm'), j('.gradle'), j('.cargo'), j('.m2'), j('.rustup'), j('.nuget'), j('.android'), path.join(local, 'Android'), path.join(local, 'npm-cache'), path.join(local, 'pip'), path.join(local, 'Docker'), j('source', 'repos')] },
    { id: 'caches', label: t("Temporários e caches"), paths: [temp, path.join(local, 'Microsoft', 'Windows', 'INetCache'), path.join(local, 'CrashDumps')] },
    { id: 'appdata', label: t("Dados de apps (AppData)"), paths: [roaming, local, j('AppData', 'LocalLow')] },
  ];
}

let cache: StorageMap | null = null;
/** A lista de jogos mudou: a próxima consulta mede o mapa de novo. */
export function storageMapStale() { if (cache) cache.at = 0; }
let workers: Worker[] = [];
const file = () => path.join(app.getPath('userData'), 'storage-map.json');
function loadSaved(): StorageMap | null {
  try { const m = JSON.parse(fs.readFileSync(file(), 'utf8')); return m && Array.isArray(m.cats) ? m : null; } catch { return null; }
}
function save(m: StorageMap) { try { fs.writeFileSync(file(), JSON.stringify(m)); } catch { /* */ } }

/** Mapa atual. A última medição (guardada em disco) aparece na hora; se tiver mais de 15 minutos, mede de novo
 *  em segundo plano, todas as categorias ao mesmo tempo, e o progresso chega por onProgress. */
export function storageMap(onProgress: (m: StorageMap) => void, refresh = false, gameDirs: () => Promise<string[]> = async () => []): StorageMap {
  if (!cache) cache = loadSaved();
  const busy = workers.length > 0;
  if (cache && !refresh && (busy || Date.now() - cache.at < 15 * 60000)) return cache;
  const d = defs();
  const root = isMac ? '/' : (process.env.SystemDrive || 'C:') + '\\';
  const prev = cache;
  const cur: StorageMap = {
    root, at: prev?.at || Date.now(), done: false,
    // enquanto mede de novo, os valores anteriores continuam na tela
    cats: [{ id: 'apps', label: t("Aplicativos"), paths: [], size: 0, done: false }, ...[{ id: 'games', label: t("Jogos"), paths: [] as string[] }, ...d].map((x) => {
      const old = prev?.cats.find((c) => c.id === x.id);
      return { ...x, paths: x.id === 'games' ? old?.paths || [] : x.paths, size: old?.size || 0, done: !!old?.done, partial: old?.partial };
    })],
  };
  cache = cur;
  const inside = (p: string, parent: string) => p.toLowerCase().startsWith(parent.toLowerCase() + path.sep);
  const same = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  for (const w of workers) w.terminate();
  workers = [];
  // primeiro, a lista de jogos; depois, todas as categorias ao mesmo tempo, já sabendo quais pastas são de jogos
  void gameDirs().catch(() => [] as string[]).then((found) => {
    if (cache !== cur) return;
    // só as pastas do disco do sistema, sem repetir pastas e sem uma pasta dentro de outra. Uma pasta que contém a
    // pasta pessoal ou o disco inteiro (por exemplo, uma pasta de jogos escolhida como C:\) fica de fora.
    // no Windows, o mesmo caminho pode chegar com letras maiúsculas e minúsculas diferentes (o Steam lista a mesma
    // biblioteca duas vezes, por exemplo), então a comparação ignora essa diferença
    const byKey = new Map<string, string>();
    for (const p of found.filter(Boolean).map((x) => path.resolve(x))) { const k = isMac ? p : p.toLowerCase(); if (!byKey.has(k)) byKey.set(k, p); }
    let dirs = [...byKey.values()]
      .filter((p) => (isMac || p.toLowerCase().startsWith(root.toLowerCase())) && !same(p, root) && !same(p, H) && !inside(H, p) && fs.existsSync(p));
    dirs = dirs.filter((p) => !dirs.some((o) => o !== p && inside(p, o)));
    const g = cur.cats.find((c) => c.id === 'games')!;
    g.paths = dirs;
    if (!dirs.length) { g.size = 0; g.done = true; }
    run([...(dirs.length ? [{ id: 'games', label: g.label, paths: dirs }] : []), ...d]);
  });
  const run = (list: { id: string; label: string; paths: string[] }[]) => {
  const all = list.flatMap((x) => x.paths.map((p) => ({ id: x.id, p })));
  let left = list.length;
  for (const x of list) {
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
  };
  return cur;
}
