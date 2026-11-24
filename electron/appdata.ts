// Análise do AppData (Windows) / dados de apps (macOS): mede as pastas que os programas guardam no perfil,
// cruza com os programas instalados e classifica cada uma:
//   installed  pasta de um programa instalado: só caches, logs e atualizações antigas podem ser apagados;
//   orphan     nenhum programa instalado corresponde e está parada há mais de 30 dias (sobra de desinstalação):
//              pode ir inteira para a Lixeira (dá para restaurar);
//   unknown    sem programa identificado, mas usada recentemente: só as partes seguras;
//   system     pastas do sistema operacional: só as partes seguras, nunca a pasta inteira.
// A limpeza só aceita caminhos vindos da última análise.
import { shell } from 'electron';
import { Worker } from 'worker_threads';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AppEntry } from './platform';
import type { AppDataEntry } from './appdataWorker';
import { t as tr } from './i18n';

const isMac = process.platform === 'darwin';
const H = os.homedir();
const ROOTS = isMac
  ? [{ path: path.join(H, 'Library', 'Application Support'), label: tr("Application Support") }, { path: path.join(H, 'Library', 'Caches'), label: tr("Caches") }]
  : [
    { path: process.env.LOCALAPPDATA || path.join(H, 'AppData', 'Local'), label: tr("Local") },
    { path: process.env.APPDATA || path.join(H, 'AppData', 'Roaming'), label: tr("Roaming") },
    { path: path.join(H, 'AppData', 'LocalLow'), label: tr("LocalLow") },
  ];
const VENDORS = ['Google', 'Adobe', 'JetBrains', 'Mozilla', 'Autodesk', 'Corel', 'Unity', 'Unity Technologies', 'Riot Games', 'Ubisoft', 'Electronic Arts', 'Blizzard Entertainment', 'NVIDIA Corporation', 'NVIDIA', 'AMD', 'Intel', 'Logitech', 'Razer', 'Programs'];
const SYSTEM_WIN = new Set(['microsoft', 'packages', 'temp', 'connecteddevicesplatform', 'd3dscache', 'peerdistrepub', 'publishers', 'virtualstore', 'comms', 'history', 'microsoft_corporation', 'crashdumps', 'elevateddiagnostics', 'iconcache', 'placeholdertilelogofolder', 'windows', 'nvidia', 'nvidia corporation', 'amd', 'intel', 'programs', 'cleancode']);
const SYSTEM_MAC = /^(com\.apple\.|apple$|cloudkit|clouddocs|callhistory|knowledge|addressbook|mobilesync|crashreporter|diagnostics|icdd|familycircle|dock$|calendar|contacts|homekit|cleancode)/i;

export type AppDataStatus = 'installed' | 'orphan' | 'unknown' | 'system';
export interface AppDataItem extends AppDataEntry { status: AppDataStatus; program?: string }

const norm = (s: string) => s.toLowerCase().replace(/\.(app|exe)$/, '').replace(/[^a-z0-9]/g, '');
// palavras que não identificam um programa (prefixos de bundle id, "installer", "updater"…)
const STOP = new Set(['com', 'net', 'org', 'io', 'co', 'app', 'apps', 'install', 'installer', 'installers', 'updater', 'update', 'updates', 'helper', 'data', 'user', 'users', 'software', 'inc', 'corp', 'corporation', 'llc', 'ltd', 'gmbh', 'the', 'desktop', 'client', 'launcher', 'service', 'services', 'agent', 'cache', 'caches', 'support', 'files', 'local', 'roaming', 'for', 'and']);
const toks = (s: string) => s.replace(/\.(app|exe)$/i, '').split(/[^A-Za-z0-9]+/)
  .flatMap((w) => w.split(/(?<=[a-zA-Z])(?=\d)|(?<=\d)(?=[a-zA-Z])/))
  .map((x) => x.toLowerCase()).filter((x) => x.length >= 3 && !STOP.has(x) && !/^\d+$/.test(x));
function matches(name: string, parent: string | undefined, a: AppEntry): boolean {
  const whole = norm(a.name);
  if (!whole) return false;
  // bundle id (com.empresa.Programa): o que identifica o programa é a última parte
  const rdns = /^[a-z]{2,4}\.[\w-]+\.(.+)$/i.exec(name);
  if (rdns) name = rdns[1].split('.')[0];
  const n = norm(name);
  if (n === whole || (parent && norm(parent) + n === whole)) return true;
  // a pasta começa com o nome inteiro do programa ("antigravity-updater" ↔ "Antigravity")
  if (whole.length >= (rdns ? 3 : 4) && n.startsWith(whole)) return true;
  const ft = toks(name), at = [...toks(a.name), ...toks(a.publisher || ''), ...toks(a.location ? path.basename(a.location) : '')];
  if (!ft.length) return false;
  // todas as palavras da pasta estão no nome do programa ("Android Studio" ↔ "AndroidStudio2026.1")
  if (ft.every((t) => at.includes(t))) return true;
  // a primeira palavra da pasta começa o nome do programa, ou começa com uma palavra dele (≥ 5 letras)
  const f0 = ft[0];
  return f0.length >= 5 && (whole.startsWith(f0) || at.some((t) => t.length >= 5 && f0.startsWith(t)));
}

/** Pastas de dados de um programa no perfil (Windows: AppData e ProgramData; macOS: Application Support e Caches),
 *  para o dossiê. Mais rígido que a classificação do AppData: o nome da pasta precisa ser o do programa (ou o nome
 *  interno/executável em `aliases`), aceitando só sufixos como versão, "updater" ou "helper". */
export function dataFoldersFor(a: AppEntry, sizeOf: (p: string) => number, aliases: string[] = []): { path: string; size: number; kind: string }[] {
  const roots = [...ROOTS];
  if (!isMac && process.env.ProgramData) roots.push({ path: process.env.ProgramData, label: tr("ProgramData") });
  const names = [...new Set([a.name, ...aliases].map(norm).filter((n) => n.length >= 3))];
  if (!names.length) return [];
  const REST = /^(\d+|x64|x86|updater|update|helper|launcher|crashpad|crashreports?|data|cache|logs?|desktop|app)$/;
  const hit = (folder: string, parent?: string) => {
    const n = norm(folder);
    const cands = parent ? [n, norm(parent) + n] : [n];
    return cands.some((c) => names.some((w) => c === w || (c.startsWith(w) && REST.test(c.slice(w.length)))));
  };
  const out: { path: string; size: number; kind: string }[] = [];
  const dirs = (p: string) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.isSymbolicLink()).map((e) => e.name); } catch { return []; } };
  for (const r of roots) {
    for (const t of dirs(r.path)) {
      if ((isMac ? SYSTEM_MAC.test(t) : SYSTEM_WIN.has(t.toLowerCase())) && !VENDORS.includes(t)) continue;
      if (/^[a-z]{2,4}\.[\w-]+\./i.test(t)) continue; // com.empresa.app: já vem pelos restos (identificador exato)
      if (hit(t)) out.push({ path: path.join(r.path, t), size: 0, kind: r.label });
      else if (VENDORS.includes(t) || (a.publisher && norm(t) === norm(a.publisher))) {
        for (const k of dirs(path.join(r.path, t))) if (hit(k, t)) out.push({ path: path.join(r.path, t, k), size: 0, kind: r.label });
      }
      if (out.length >= 12) break;
    }
  }
  for (const o of out) o.size = sizeOf(o.path);
  return out;
}

let last: AppDataItem[] = [];
let running: Worker | null = null;

function classify(e: AppDataEntry, apps: AppEntry[]): AppDataItem {
  // macOS: tudo em ~/Library/Caches é cache (o app recria)
  if (isMac && e.root === 'Caches') e = { ...e, safe: e.size, safePaths: [{ path: e.path, size: e.size, reason: 'cache' }] };
  const name = e.name, top = e.parent || e.name;
  if ((!isMac && (SYSTEM_WIN.has(top.toLowerCase()) && !e.parent || SYSTEM_WIN.has(name.toLowerCase()))) || (isMac && SYSTEM_MAC.test(top))) return { ...e, status: 'system' };
  const program = apps.find((a) => matches(name, e.parent, a))?.name;
  if (program) return { ...e, status: 'installed', program };
  const idle = Date.now() - e.mtime > 30 * 86400000;
  return { ...e, status: idle && e.size > 0 ? 'orphan' : 'unknown' };
}

export function scan(apps: AppEntry[], send: (ch: string, d: unknown) => void): Promise<AppDataItem[]> {
  running?.terminate();
  return new Promise((resolve) => {
    const w = new Worker(path.join(__dirname, 'appdataWorker.js'), { workerData: { roots: ROOTS.filter((r) => fs.existsSync(r.path)), vendors: VENDORS } });
    running = w;
    w.on('message', (m: any) => {
      if (m.type !== 'done') { send('appdata:progress', m); return; }
      last = (m.entries as AppDataEntry[]).map((e) => classify(e, apps)).sort((a, b) => b.size - a.size);
      running = null; w.terminate(); resolve(last);
    });
    w.on('error', () => { running = null; resolve(last = []); });
  });
}
export function cancel() { running?.terminate(); running = null; }

/** Apaga as partes seguras (caches, logs, versões antigas) e manda sobras inteiras para a Lixeira. */
export async function clean(req: { safe: string[]; trash: string[] }): Promise<{ freed: number; removed: number; failed: number }> {
  const safeOk = new Map<string, number>(), trashOk = new Map<string, number>();
  for (const it of last) {
    for (const s of it.safePaths) safeOk.set(s.path, s.size);
    if (it.status === 'orphan') trashOk.set(it.path, it.size);
  }
  let freed = 0, removed = 0, failed = 0;
  for (const p of req.safe) {
    const size = safeOk.get(p); if (size === undefined) { failed++; continue; }
    try {
      const st = fs.lstatSync(p);
      if (st.isDirectory()) {
        // esvazia a pasta (o programa a recria igual); itens em uso ficam
        for (const c of fs.readdirSync(p)) { try { fs.rmSync(path.join(p, c), { recursive: true, force: true, maxRetries: 1 }); } catch { failed++; } }
        if (/[\\/]app-\d[^\\/]*$/.test(p)) fs.rmSync(p, { recursive: true, force: true }); // versões antigas saem inteiras
      } else fs.rmSync(p, { force: true });
      freed += size; removed++;
    } catch { failed++; }
  }
  for (const p of req.trash) {
    const size = trashOk.get(p); if (size === undefined) { failed++; continue; }
    try { await shell.trashItem(p); freed += size; removed++; } catch { failed++; }
  }
  last = last.filter((it) => !req.trash.includes(it.path));
  return { freed, removed, failed };
}
