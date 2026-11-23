// Navegadores: limpeza e otimização por perfil (Chrome, Edge, Brave, Vivaldi, Chromium, Opera,
// Opera GX, Firefox e Safari). Cache e shaders são pastas; histórico, downloads e preenchimento
// automático ficam em bancos SQLite e são apagados por SQL (os favoritos e as senhas nunca são tocados).
// Com o navegador aberto os bancos ficam travados: o app pede para fechar antes.
import { execFile } from 'child_process';
import { Worker } from 'worker_threads';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { system } from './platform';

const mac = process.platform === 'darwin';
const H = os.homedir();
const LOCAL = process.env.LOCALAPPDATA || path.join(H, 'AppData', 'Local');
const ROAMING = process.env.APPDATA || path.join(H, 'AppData', 'Roaming');
const AS = path.join(H, 'Library', 'Application Support');
const CACHES = path.join(H, 'Library', 'Caches');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite: any = (() => { try { return require('node:sqlite'); } catch { return null; } })();

export type ItemId = 'cache' | 'gpu' | 'history' | 'downloads' | 'cookies' | 'sessions' | 'autofill';
export const ITEM_INFO: Record<ItemId, { label: string; detail: string; safe: boolean }> = {
  cache: { label: 'Cache e imagens', detail: 'Páginas, imagens e scripts guardados para abrir sites mais rápido. O navegador baixa de novo quando precisar.', safe: true },
  gpu: { label: 'Cache de GPU e shaders', detail: 'Gráficos pré-compilados. São refeitos sozinhos.', safe: true },
  history: { label: 'Histórico de navegação', detail: 'Sites visitados e sugestões da barra de endereço. Os favoritos ficam.', safe: false },
  downloads: { label: 'Histórico de downloads', detail: 'A lista de downloads do navegador. Os arquivos baixados continuam no disco.', safe: false },
  cookies: { label: 'Cookies e dados de sites', detail: 'Logins em sites, preferências e dados guardados pelos sites. Você vai precisar entrar de novo nos sites.', safe: false },
  sessions: { label: 'Sessões e abas', detail: 'Abas abertas e janelas da última sessão (o "restaurar abas").', safe: false },
  autofill: { label: 'Preenchimento automático', detail: 'Textos digitados em formulários. Senhas e cartões salvos não são apagados.', safe: false },
};

interface Spec { dirs: string[]; files: string[]; sql?: { db: string; statements: string[]; count?: string }[] }
export interface BrowserItem { id: ItemId; label: string; detail: string; safe: boolean; size: number; count?: number }
export interface BrowserProfile { id: string; browserId: string; browser: string; name: string; path: string; running: boolean; items: BrowserItem[] }
interface Def { id: string; name: string; app: string; exe: string; kind: 'chromium' | 'firefox' | 'safari'; base: string; cache?: string; single?: boolean }

function defs(): Def[] {
  if (mac) return [
    { id: 'chrome', name: 'Google Chrome', app: 'Google Chrome', exe: 'chrome', kind: 'chromium', base: path.join(AS, 'Google/Chrome'), cache: path.join(CACHES, 'Google/Chrome') },
    { id: 'edge', name: 'Microsoft Edge', app: 'Microsoft Edge', exe: 'msedge', kind: 'chromium', base: path.join(AS, 'Microsoft Edge'), cache: path.join(CACHES, 'Microsoft Edge') },
    { id: 'brave', name: 'Brave', app: 'Brave Browser', exe: 'brave', kind: 'chromium', base: path.join(AS, 'BraveSoftware/Brave-Browser'), cache: path.join(CACHES, 'BraveSoftware/Brave-Browser') },
    { id: 'vivaldi', name: 'Vivaldi', app: 'Vivaldi', exe: 'vivaldi', kind: 'chromium', base: path.join(AS, 'Vivaldi'), cache: path.join(CACHES, 'Vivaldi') },
    { id: 'chromium', name: 'Chromium', app: 'Chromium', exe: 'chromium', kind: 'chromium', base: path.join(AS, 'Chromium'), cache: path.join(CACHES, 'Chromium') },
    { id: 'opera', name: 'Opera', app: 'Opera', exe: 'opera', kind: 'chromium', base: path.join(AS, 'com.operasoftware.Opera'), cache: path.join(CACHES, 'com.operasoftware.Opera'), single: true },
    { id: 'operagx', name: 'Opera GX', app: 'Opera GX', exe: 'opera', kind: 'chromium', base: path.join(AS, 'com.operasoftware.OperaGX'), cache: path.join(CACHES, 'com.operasoftware.OperaGX'), single: true },
    { id: 'firefox', name: 'Firefox', app: 'Firefox', exe: 'firefox', kind: 'firefox', base: path.join(AS, 'Firefox/Profiles'), cache: path.join(CACHES, 'Firefox/Profiles') },
    { id: 'safari', name: 'Safari', app: 'Safari', exe: 'safari', kind: 'safari', base: path.join(H, 'Library/Safari'), single: true },
  ];
  return [
    { id: 'chrome', name: 'Google Chrome', app: 'Google Chrome', exe: 'chrome', kind: 'chromium', base: path.join(LOCAL, 'Google/Chrome/User Data') },
    { id: 'edge', name: 'Microsoft Edge', app: 'Microsoft Edge', exe: 'msedge', kind: 'chromium', base: path.join(LOCAL, 'Microsoft/Edge/User Data') },
    { id: 'brave', name: 'Brave', app: 'Brave', exe: 'brave', kind: 'chromium', base: path.join(LOCAL, 'BraveSoftware/Brave-Browser/User Data') },
    { id: 'vivaldi', name: 'Vivaldi', app: 'Vivaldi', exe: 'vivaldi', kind: 'chromium', base: path.join(LOCAL, 'Vivaldi/User Data') },
    { id: 'chromium', name: 'Chromium', app: 'Chromium', exe: 'chromium', kind: 'chromium', base: path.join(LOCAL, 'Chromium/User Data') },
    { id: 'opera', name: 'Opera', app: 'Opera', exe: 'opera', kind: 'chromium', base: path.join(ROAMING, 'Opera Software/Opera Stable'), cache: path.join(LOCAL, 'Opera Software/Opera Stable'), single: true },
    { id: 'operagx', name: 'Opera GX', app: 'Opera GX', exe: 'opera', kind: 'chromium', base: path.join(ROAMING, 'Opera Software/Opera GX Stable'), cache: path.join(LOCAL, 'Opera Software/Opera GX Stable'), single: true },
    { id: 'firefox', name: 'Firefox', app: 'Firefox', exe: 'firefox', kind: 'firefox', base: path.join(ROAMING, 'Mozilla/Firefox/Profiles'), cache: path.join(LOCAL, 'Mozilla/Firefox/Profiles') },
  ];
}

const exists = (p: string) => { try { fs.accessSync(p); return true; } catch { return false; } };
const ls = (d: string) => { try { return fs.readdirSync(d); } catch { return null; } };
const J = (...p: string[]) => path.join(...p);

// tabelas de histórico do Chromium (as de downloads ficam em "downloads")
const CR_HISTORY = ['visits', 'visit_source', 'keyword_search_terms', 'segment_usage', 'segments', 'urls', 'content_annotations', 'context_annotations', 'clusters', 'clusters_and_visits', 'cluster_keywords', 'cluster_visit_duplicates'];

function specs(d: Def, P: string, C: string, root: string): Record<ItemId, Spec> {
  if (d.kind === 'chromium') {
    return {
      cache: { dirs: [J(C, 'Cache'), J(C, 'Code Cache'), J(P, 'Cache'), J(P, 'Code Cache'), J(P, 'Service Worker/CacheStorage'), J(P, 'Service Worker/ScriptCache')], files: [] },
      gpu: { dirs: [J(P, 'GPUCache'), J(P, 'DawnGraphiteCache'), J(P, 'DawnWebGPUCache'), J(C, 'GPUCache'), J(root, 'ShaderCache'), J(root, 'GrShaderCache'), J(root, 'GraphiteDawnCache')], files: [] },
      history: { dirs: [], files: [J(P, 'Visited Links'), J(P, 'Top Sites')], sql: [{ db: J(P, 'History'), statements: CR_HISTORY.map((t) => `DELETE FROM ${t}`), count: 'SELECT COUNT(*) AS n FROM urls' }] },
      downloads: { dirs: [], files: [], sql: [{ db: J(P, 'History'), statements: ['DELETE FROM downloads_url_chains', 'DELETE FROM downloads_slices', 'DELETE FROM downloads'], count: 'SELECT COUNT(*) AS n FROM downloads' }] },
      cookies: { dirs: [J(P, 'Local Storage'), J(P, 'IndexedDB'), J(P, 'Session Storage'), J(P, 'File System'), J(P, 'databases'), J(P, 'WebStorage'), J(P, 'Service Worker/Database')], files: [J(P, 'Network/Cookies'), J(P, 'Cookies')] },
      sessions: { dirs: [J(P, 'Sessions')], files: [J(P, 'Current Session'), J(P, 'Current Tabs'), J(P, 'Last Session'), J(P, 'Last Tabs')] },
      autofill: { dirs: [], files: [], sql: [{ db: J(P, 'Web Data'), statements: ['DELETE FROM autofill'], count: 'SELECT COUNT(*) AS n FROM autofill' }] },
    };
  }
  if (d.kind === 'firefox') {
    return {
      cache: { dirs: [J(C, 'cache2'), J(C, 'startupCache'), J(C, 'thumbnails'), J(P, 'startupCache'), J(P, 'thumbnails')], files: [] },
      gpu: { dirs: [J(P, 'shader-cache'), J(C, 'shader-cache')], files: [] },
      history: { dirs: [], files: [], sql: [{ db: J(P, 'places.sqlite'), statements: ['DELETE FROM moz_historyvisits', 'DELETE FROM moz_inputhistory', 'DELETE FROM moz_places WHERE foreign_count = 0 AND id NOT IN (SELECT fk FROM moz_bookmarks WHERE fk IS NOT NULL)'], count: 'SELECT COUNT(*) AS n FROM moz_historyvisits' }] },
      downloads: { dirs: [], files: [], sql: [{ db: J(P, 'places.sqlite'), statements: ["DELETE FROM moz_annos WHERE anno_attribute_id IN (SELECT id FROM moz_anno_attributes WHERE name LIKE 'downloads/%')"], count: "SELECT COUNT(*) AS n FROM moz_annos WHERE anno_attribute_id IN (SELECT id FROM moz_anno_attributes WHERE name = 'downloads/destinationFileURI')" }] },
      cookies: { dirs: [J(P, 'storage/default')], files: [J(P, 'cookies.sqlite'), J(P, 'webappsstore.sqlite')] },
      sessions: { dirs: [J(P, 'sessionstore-backups')], files: [J(P, 'sessionstore.jsonlz4')] },
      autofill: { dirs: [], files: [J(P, 'formhistory.sqlite')] },
    };
  }
  const SC = J(H, 'Library/Containers/com.apple.Safari/Data/Library');
  return {
    cache: { dirs: [J(CACHES, 'com.apple.Safari'), J(SC, 'Caches')], files: [] },
    gpu: { dirs: [], files: [] },
    history: { dirs: [], files: [], sql: [{ db: J(P, 'History.db'), statements: ['DELETE FROM history_visits', 'DELETE FROM history_items'], count: 'SELECT COUNT(*) AS n FROM history_items' }] },
    downloads: { dirs: [], files: [J(P, 'Downloads.plist')] },
    cookies: { dirs: [J(SC, 'Cookies'), J(P, 'LocalStorage'), J(P, 'Databases'), J(SC, 'WebKit/WebsiteData')], files: [] },
    sessions: { dirs: [], files: [] },
    autofill: { dirs: [], files: [] },
  };
}

// bancos que a otimização compacta (VACUUM)
const VACUUM: Record<Def['kind'], string[]> = {
  chromium: ['History', 'Web Data', 'Favicons', 'Network/Cookies', 'Cookies', 'Top Sites', 'Shortcuts', 'Network Action Predictor'],
  firefox: ['places.sqlite', 'cookies.sqlite', 'formhistory.sqlite', 'favicons.sqlite', 'permissions.sqlite', 'content-prefs.sqlite', 'webappsstore.sqlite'],
  safari: ['History.db'],
};

interface Found { def: Def; id: string; name: string; P: string; C: string; root: string }
let lastFound = new Map<string, Found>();

function profilesOf(d: Def): Found[] {
  if (d.single) return exists(d.base) ? [{ def: d, id: `${d.id}:default`, name: 'Padrão', P: d.base, C: d.cache || d.base, root: d.base }] : [];
  if (d.kind === 'firefox') {
    return (ls(d.base) || []).filter((n) => exists(J(d.base, n, 'prefs.js'))).map((n) => ({ def: d, id: `${d.id}:${n}`, name: n.replace(/^[^.]+\./, ''), P: J(d.base, n), C: d.cache ? J(d.cache, n) : J(d.base, n), root: J(d.base, n) }));
  }
  let names: Record<string, string> = {};
  try { names = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(J(d.base, 'Local State'), 'utf8'))?.profile?.info_cache || {}).map(([k, v]: any) => [k, v?.name || k])); } catch { /* */ }
  return (ls(d.base) || []).filter((n) => (n === 'Default' || /^Profile \d+$/.test(n)) && exists(J(d.base, n, 'Preferences')))
    .map((n) => ({ def: d, id: `${d.id}:${n}`, name: names[n] || (n === 'Default' ? 'Padrão' : n), P: J(d.base, n), C: d.cache ? J(d.cache, n) : J(d.base, n), root: d.base }));
}

/** Tamanho das pastas e arquivos num worker (bibliotecas de cache podem ter centenas de milhares de arquivos). */
function sizes(items: { id: string; path: string }[]): Promise<Map<string, number>> {
  return new Promise((resolve) => {
    const out = new Map<string, number>();
    const files = items.filter((i) => { try { return fs.statSync(i.path).isFile(); } catch { return false; } });
    for (const f of files) { let s = 0; for (const suf of ['', '-journal', '-wal', '-shm']) { try { s += fs.statSync(f.path + suf).size; } catch { /* */ } } out.set(f.id, s); }
    const dirs = items.filter((i) => !files.includes(i) && exists(i.path));
    if (!dirs.length) return resolve(out);
    const w = new Worker(path.join(__dirname, 'sizeWorker.js'), { workerData: { items: dirs } });
    w.on('message', (m: any) => { if (m.done) { w.terminate(); resolve(out); } else out.set(m.id, m.size); });
    w.on('error', () => resolve(out));
  });
}

async function runningSet(): Promise<Set<string>> {
  const procs = await system.perf.processes().catch(() => []);
  return new Set(procs.map((p) => p.name.toLowerCase().replace(/#\d+$/, '').replace(/\.exe$/, '')));
}
const isRunning = (d: Def, run: Set<string>) => run.has(d.app.toLowerCase()) || run.has(d.exe);

function countRows(db: string, q: string): number | undefined {
  if (!sqlite || !exists(db)) return undefined;
  try { const c = new sqlite.DatabaseSync(db, { readOnly: true }); try { return Number(c.prepare(q).get()?.n) || 0; } finally { c.close(); } } catch { return undefined; }
}

export async function scan(): Promise<{ profiles: BrowserProfile[]; denied: string[] }> {
  const found: Found[] = [];
  const denied: string[] = [];
  for (const d of defs()) {
    // sem Acesso Total ao Disco o macOS bloqueia a pasta de dados de outros apps (EPERM)
    if (exists(d.base) && ls(d.base) === null) { if (!denied.includes(d.name)) denied.push(d.name); continue; }
    found.push(...profilesOf(d));
  }
  lastFound = new Map(found.map((f) => [f.id, f]));
  const run = await runningSet();
  const req: { id: string; path: string }[] = [];
  const plan = found.map((f) => {
    const sp = specs(f.def, f.P, f.C, f.root);
    for (const [item, s] of Object.entries(sp) as [ItemId, Spec][]) {
      [...new Set([...s.dirs, ...s.files])].forEach((p, i) => req.push({ id: `${f.id}|${item}|${i}`, path: p }));
      // itens só de banco: o tamanho mostrado é o do arquivo do banco
      (s.sql || []).forEach((q, i) => { if (item === 'history' || (!s.dirs.length && !s.files.length)) req.push({ id: `${f.id}|${item}|db${i}`, path: q.db }); });
    }
    return { f, sp };
  });
  const sz = await sizes(req);
  const total = (pid: string, item: string) => { let t = 0; for (const [k, v] of sz) if (k.startsWith(`${pid}|${item}|`)) t += v; return t; };
  const profiles: BrowserProfile[] = plan.map(({ f, sp }) => ({
    id: f.id, browserId: f.def.id, browser: f.def.name, name: f.name, path: f.P, running: isRunning(f.def, run),
    items: (Object.keys(ITEM_INFO) as ItemId[]).filter((id) => { const s = sp[id]; return s.dirs.length || s.files.length || s.sql?.length; }).map((id) => {
      const s = sp[id];
      const count = s.sql?.[0]?.count ? countRows(s.sql[0].db, s.sql[0].count) : undefined;
      // downloads e preenchimento ficam dentro de bancos maiores: mostram a contagem, não o tamanho do banco
      const size = id === 'downloads' || id === 'autofill' ? (s.files.length ? total(f.id, id) : 0) : total(f.id, id);
      return { id, ...ITEM_INFO[id], size, count };
    }).filter((it) => it.size > 0 || (it.count || 0) > 0),
  })).filter((p) => p.items.length);
  return { profiles, denied };
}

function rmContents(dir: string): number {
  let freed = 0;
  for (const n of ls(dir) || []) {
    const p = J(dir, n);
    let st: fs.Stats; try { st = fs.lstatSync(p); } catch { continue; }
    try { if (st.isDirectory()) { const s = dirBytes(p); fs.rmSync(p, { recursive: true, force: true }); freed += s; } else { fs.rmSync(p, { force: true }); freed += st.size; } } catch { /* em uso */ }
  }
  return freed;
}
function dirBytes(d: string, depth = 0): number {
  let t = 0;
  for (const n of ls(d) || []) { const p = J(d, n); try { const st = fs.lstatSync(p); t += st.isDirectory() ? (depth < 12 ? dirBytes(p, depth + 1) : 0) : st.size; } catch { /* */ } }
  return t;
}
function rmFile(f: string): number {
  let freed = 0;
  for (const suf of ['', '-journal', '-wal', '-shm']) { try { const s = fs.statSync(f + suf).size; fs.rmSync(f + suf, { force: true }); freed += s; } catch { /* */ } }
  return freed;
}
const dbSize = (db: string) => ['', '-wal', '-journal'].reduce((s, suf) => { try { return s + fs.statSync(db + suf).size; } catch { return s; } }, 0);
function sqlRun(db: string, statements: string[], vacuum: boolean): number {
  if (!sqlite) throw new Error('SQLite indisponível');
  if (!exists(db)) return 0;
  const before = dbSize(db);
  const c = new sqlite.DatabaseSync(db);
  try {
    c.exec('PRAGMA busy_timeout = 3000');
    for (const s of statements) { try { c.exec(s); } catch { /* tabela inexistente nesta versão do navegador */ } }
    if (vacuum) c.exec('VACUUM');
  } finally { c.close(); }
  return Math.max(0, before - dbSize(db));
}

export async function clean(sel: { profileId: string; items: ItemId[] }[]) {
  const run = await runningSet();
  const out: { profileId: string; ok: boolean; freed: number; message: string }[] = [];
  for (const s of sel) {
    const f = lastFound.get(s.profileId);
    if (!f) { out.push({ profileId: s.profileId, ok: false, freed: 0, message: 'Perfil fora da última análise' }); continue; }
    const needsClosed = s.items.some((i) => i !== 'cache' && i !== 'gpu');
    if (needsClosed && isRunning(f.def, run)) { out.push({ profileId: s.profileId, ok: false, freed: 0, message: `Feche o ${f.def.name} antes de limpar histórico, cookies e sessões` }); continue; }
    const sp = specs(f.def, f.P, f.C, f.root);
    let freed = 0; const errs: string[] = [];
    for (const item of s.items) {
      const spec = sp[item]; if (!spec) continue;
      for (const d of spec.dirs) freed += rmContents(d);
      for (const file of spec.files) freed += rmFile(file);
      for (const q of spec.sql || []) { try { freed += sqlRun(q.db, q.statements, true); } catch (e: any) { errs.push(String(e?.message || e).slice(0, 80)); } }
    }
    out.push({ profileId: s.profileId, ok: !errs.length, freed, message: errs.length ? `Parte não foi limpa: ${errs[0]}` : 'Limpo' });
  }
  return out;
}

export async function optimize(profileIds: string[]) {
  const run = await runningSet();
  const out: { profileId: string; ok: boolean; freed: number; message: string }[] = [];
  for (const id of profileIds) {
    const f = lastFound.get(id);
    if (!f) { out.push({ profileId: id, ok: false, freed: 0, message: 'Perfil fora da última análise' }); continue; }
    if (isRunning(f.def, run)) { out.push({ profileId: id, ok: false, freed: 0, message: `Feche o ${f.def.name} para otimizar` }); continue; }
    let freed = 0, n = 0;
    for (const rel of VACUUM[f.def.kind]) { try { const db = J(f.P, rel); if (exists(db)) { freed += sqlRun(db, [], true); n++; } } catch { /* travado */ } }
    out.push({ profileId: id, ok: true, freed, message: `${n} banco(s) compactado(s)` });
  }
  return out;
}

/** Pede para o navegador fechar normalmente (como Cmd+Q / clicar no X) e espera até 10 s. */
export async function closeBrowser(browserId: string): Promise<boolean> {
  const d = defs().find((x) => x.id === browserId); if (!d) return false;
  await new Promise<void>((res) => {
    if (mac) execFile('/usr/bin/osascript', ['-e', `tell application "${d.app.replace(/"/g, '')}" to quit`], () => res());
    else execFile('taskkill.exe', ['/IM', `${d.exe}.exe`], { windowsHide: true }, () => res());
  });
  for (let i = 0; i < 20; i++) { if (!isRunning(d, await runningSet())) return true; await new Promise((r) => setTimeout(r, 500)); }
  return false;
}
