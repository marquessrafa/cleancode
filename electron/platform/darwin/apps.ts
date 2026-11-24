// Apps do macOS: pacotes .app em /Applications, ~/Applications e /System/Applications.
// Versão e identificador vêm do Info.plist; último uso, data de inclusão e tamanho, do Spotlight (mdls).
// Desinstalar = mover o .app para a Lixeira e, se o usuário quiser, os restos em ~/Library.
import { shell } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AppEntry, UninstallResult, Leftover, MonitorEvent } from '../types';
import { listDir, ATTR, drives } from './native';
import { t as tr, LOCALE } from '../../i18n';

const HOME = os.homedir();
const LIB = path.join(HOME, 'Library');

function run(cmd: string, args: string[], input?: string, timeout = 30000): Promise<string> {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 }, (_e, out) => resolve(out || ''));
    if (input !== undefined) child.stdin?.end(input);
  });
}

// ---------- descoberta dos pacotes ----------
interface Found { path: string; origin: string; system: boolean }
const ROOTS: { dir: string; origin: string; system: boolean }[] = [
  { dir: '/Applications', origin: tr("Aplicativos"), system: false },
  { dir: path.join(HOME, 'Applications'), origin: tr("Aplicativos do usuário"), system: false },
  { dir: '/System/Applications', origin: tr("Sistema"), system: true },
];
/** .app até 2 níveis abaixo da raiz (ex.: /Applications/Utilities, /Applications/Adobe X/). */
function findApps(): Found[] {
  const out: Found[] = [];
  const walk = (dir: string, depth: number, r: (typeof ROOTS)[number]) => {
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.name.endsWith('.app')) {
        if (e.isDirectory()) { out.push({ path: p, origin: r.origin, system: r.system }); continue; }
        // Safari e outros apps do sistema aparecem em /Applications como links para o volume do sistema
        if (e.isSymbolicLink()) {
          try {
            const real = fs.realpathSync(p);
            if (fs.statSync(real).isDirectory()) out.push({ path: p, origin: real.startsWith('/System/') ? tr("Sistema") : r.origin, system: r.system || real.startsWith('/System/') });
          } catch { /* link quebrado */ }
        }
        continue;
      }
      if (e.isDirectory() && !e.isSymbolicLink() && depth < 2) walk(p, depth + 1, r);
    }
  };
  for (const r of ROOTS) walk(r.dir, 0, r);
  return out;
}

// ---------- Info.plist ----------
async function plistJson(file: string): Promise<any> {
  const out = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], undefined, 10000);
  try { return JSON.parse(out); } catch { return null; }
}
async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k]); } }));
  return res;
}

// ---------- Spotlight ----------
/** Um atributo do Spotlight para vários arquivos de uma vez (-raw: valores separados por \0, na ordem dos arquivos). */
async function mdlsAttr(files: string[], attr: string): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (let i = 0; i < files.length; i += 200) {
    const chunk = files.slice(i, i + 200);
    const raw = await run('/usr/bin/mdls', ['-raw', '-name', attr, ...chunk], undefined, 60000);
    const vals = raw.split('\0');
    for (let k = 0; k < chunk.length; k++) { const v = vals[k]; out.push(v === undefined || v === '(null)' || v === '' ? null : v); }
  }
  return out;
}
const mdDate = (v: string | null) => { if (!v) return undefined; const t = Date.parse(v.replace(' ', 'T').replace(' +0000', 'Z')); return isNaN(t) ? undefined : t; };

function publisherOf(info: any, bundleId: string): string | undefined {
  const c = String(info?.NSHumanReadableCopyright || '');
  const m = /(?:(?:©|\(c\)|copyright)\s*)+(?:\d{4}(?:\s*[-–]\s*\d{4})?,?\s*)?([^.,;\n]+?)(?:\.|,|;|\s+all rights|\s*$)/i.exec(c);
  if (m && m[1].trim().length >= 2 && !/^\d+$/.test(m[1].trim())) return m[1].trim();
  if (bundleId.startsWith('com.apple.')) return 'Apple';
  return undefined;
}

export async function listApps(): Promise<AppEntry[]> {
  const found = findApps();
  const infos = await mapLimit(found, 8, (f) => plistJson(path.join(f.path, 'Contents', 'Info.plist')));
  const files = found.map((f) => f.path);
  const [lastUsed, added, useCount, physSize] = await Promise.all([
    mdlsAttr(files, 'kMDItemLastUsedDate'), mdlsAttr(files, 'kMDItemDateAdded'),
    mdlsAttr(files, 'kMDItemUseCount'), mdlsAttr(files, 'kMDItemPhysicalSize'),
  ]);
  const out: AppEntry[] = [];
  const seen = new Set<string>();
  found.forEach((f, i) => {
    const info = infos[i] || {};
    const real = (() => { try { return fs.realpathSync(f.path); } catch { return f.path; } })();
    if (seen.has(real)) return; // mesmo pacote por dois caminhos (links)
    seen.add(real);
    const bundleId = String(info.CFBundleIdentifier || '');
    const name = String(info.CFBundleDisplayName || info.CFBundleName || path.basename(f.path, '.app'));
    const mas = fs.existsSync(path.join(f.path, 'Contents', '_MASReceipt'));
    let installDate = mdDate(added[i]);
    if (!installDate) { try { installDate = fs.statSync(f.path).birthtimeMs; } catch { /* */ } }
    const size = Number(physSize[i]) || undefined;
    const lu = mdDate(lastUsed[i]);
    const e: AppEntry = {
      id: 'app:' + f.path, source: mas ? 'store' : 'mac', name: path.basename(f.path, '.app') || name,
      version: info.CFBundleShortVersionString || info.CFBundleVersion || undefined,
      publisher: mas && !publisherOf(info, bundleId) ? 'App Store' : publisherOf(info, bundleId),
      installDate, size, sizeSource: size ? 'calculado' : undefined,
      location: f.path, icon: f.path, bundleId: bundleId || undefined, origin: mas ? 'App Store' : f.origin,
      // apps do sistema (volume selado) não podem ser removidos
      canUninstall: !f.system,
      // agentes sem ícone no Dock (LSUIElement/LSBackgroundOnly): componentes, não "apps sem uso"
      background: !!(info.LSUIElement === true || info.LSUIElement === '1' || info.LSBackgroundOnly === true),
    };
    if (lu) { e.lastUsed = lu; e.lastUsedSource = tr("Spotlight (última abertura)"); e.runCount = Number(useCount[i]) || undefined; }
    out.push(e);
  });
  return out.sort((a, b) => a.name.localeCompare(b.name, LOCALE));
}

// ---------- restos ----------
function duSize(p: string, budgetMs = 3000): number {
  let st: fs.Stats;
  try { st = fs.lstatSync(p); } catch { return 0; }
  if (!st.isDirectory()) return st.blocks * 512;
  const deadline = Date.now() + budgetMs;
  let total = 0;
  const stack = [p];
  while (stack.length && Date.now() < deadline) {
    const d = stack.pop()!;
    listDir(d, (e) => {
      if (e.attr & ATTR.DIRECTORY) { if (!(e.attr & ATTR.REPARSE)) stack.push(d + '/' + e.name); }
      else total += e.alloc ?? e.size;
    });
  }
  return total;
}

/** Arquivos que o app deixa em ~/Library. Só nomes exatos (identificador ou nome do app) para não pegar coisa de outro app. */
export function findLeftovers(a: AppEntry, sizeOf: (p: string) => number = (p) => duSize(p)): Leftover[] {
  const id = a.bundleId || '';
  const name = a.name;
  if (id.startsWith('com.apple.')) return []; // dados de apps da Apple são compartilhados com o sistema
  const cands: [string, string][] = [];
  const add = (kind: string, ...parts: string[]) => cands.push([path.join(LIB, ...parts), kind]);
  const keys = [id, name.length >= 3 ? name : ''].filter(Boolean);
  for (const k of keys) {
    add(tr("Suporte do app"), 'Application Support', k);
    add('Cache', 'Caches', k);
    add('Logs', 'Logs', k);
  }
  if (id) {
    add('Preferências', 'Preferences', id + '.plist');
    add(tr("Contêiner (sandbox)"), 'Containers', id);
    add(tr("Estado salvo das janelas"), 'Saved Application State', id + '.savedState');
    add('Dados web', 'HTTPStorages', id);
    add('Dados web', 'WebKit', id);
    add('Cookies', 'Cookies', id + '.binarycookies');
    // preferências de componentes (com.x.app.helper.plist), agentes de inicialização e contêineres de grupo
    const scan = (sub: string, kind: string, test: (n: string) => boolean) => {
      try { for (const n of fs.readdirSync(path.join(LIB, sub))) if (test(n)) cands.push([path.join(LIB, sub, n), kind]); } catch { /* sem acesso */ }
    };
    scan('Preferences', tr("Preferências"), (n) => n.startsWith(id + '.') && n.endsWith('.plist') && n !== id + '.plist');
    scan('LaunchAgents', tr("Agente de inicialização"), (n) => n.startsWith(id) && n.endsWith('.plist'));
    scan('Group Containers', tr("Contêiner de grupo"), (n) => n === 'group.' + id || new RegExp('^[A-Z0-9]{10}\\.' + id.replace(/\./g, '\\.') + '$').test(n));
  }
  const out: Leftover[] = [];
  const seen = new Set<string>();
  for (const [p, kind] of cands) {
    if (seen.has(p.toLowerCase())) continue;
    seen.add(p.toLowerCase());
    try { fs.lstatSync(p); } catch { continue; }
    out.push({ path: p, kind, size: sizeOf(p) });
  }
  return out;
}

// ---------- desinstalação ----------
/** O app está aberto? (algum processo roda um executável de dentro do pacote) */
async function isRunning(appPath: string): Promise<boolean> {
  const out = await run('/bin/ps', ['-axo', 'comm=']);
  const prefix = appPath.replace(/\/+$/, '') + '/Contents/';
  return out.split('\n').some((l) => l.trim().startsWith(prefix));
}
const fmt = (n: number) => {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' ' + u[i];
};

/** Move o .app para a Lixeira; com withLeftovers, também os restos em ~/Library. Nada é apagado de vez. */
export async function uninstallApp(a: AppEntry, withLeftovers: boolean): Promise<UninstallResult> {
  const p = a.location;
  if (!p || !p.endsWith('.app')) return { ok: false, code: -1, message: tr("Pacote do app não encontrado") };
  let real = p;
  try { real = fs.realpathSync(p); } catch { /* */ }
  if (!a.canUninstall || p.startsWith('/System/') || real.startsWith('/System/')) return { ok: false, code: -1, message: tr("Apps do sistema não podem ser removidos") };
  if (!fs.existsSync(p)) return { ok: true, code: 0, message: tr("O app já não estava mais no disco") };
  if (await isRunning(p)) return { ok: false, code: -1, message: tr("{0} está aberto. Feche o app e tente de novo.", a.name) };
  const leftovers = withLeftovers ? findLeftovers(a) : [];
  try { await shell.trashItem(p); }
  catch (err: any) {
    const msg = String(err?.message || err);
    return { ok: false, code: -1, message: /permission|not permitted|denied/i.test(msg)
      ? tr("O CleanCode não tem permissão para mover este app, porque ele foi instalado para todos os usuários. Arraste o app para a Lixeira no Finder, que pede a senha de administrador.")
      : tr("Não foi possível mover para a Lixeira: {0}", msg) };
  }
  let moved = 0, freed = 0;
  const failed: string[] = [];
  for (const l of leftovers) {
    try { await shell.trashItem(l.path); moved++; freed += l.size; } catch { failed.push(path.basename(l.path)); }
  }
  const gone = !fs.existsSync(p);
  let message = gone ? tr("Movido para a Lixeira") : tr("O app continua no disco");
  if (moved) message += tr(" com {0} resto(s) ({1})", moved, fmt(freed));
  if (failed.length) message += tr("; {0} resto(s) não puderam ser movidos", failed.length);
  return { ok: gone, code: gone ? 0 : -1, message };
}

// ---------- monitor ----------
/** Caminhos dos .app fora do sistema (o monitor compara com o snapshot anterior). */
export async function installedAppKeys(): Promise<Set<string>> {
  return new Set(findApps().filter((f) => !f.system).map((f) => f.path));
}
export async function describeInstalledApp(key: string): Promise<MonitorEvent> {
  const info = await plistJson(path.join(key, 'Contents', 'Info.plist'));
  const name = String(info?.CFBundleDisplayName || info?.CFBundleName || path.basename(key, '.app'));
  const version = info?.CFBundleShortVersionString ? ` ${info.CFBundleShortVersionString}` : '';
  const root = key.startsWith('/Volumes/') ? key.split('/').slice(0, 3).join('/') : '/';
  const label = drives().find((d) => d.root === root)?.label;
  return { kind: 'app', title: tr("Novo app instalado"), drive: root, driveLabel: label, amount: duSize(key, 5000), detail: name + version, app: { key, name: path.basename(key, '.app') } };
}
/** fs.watch nas pastas de apps; espera a cópia terminar (arrastar um .app grande leva alguns segundos). */
export function watchInstalls(onChange: () => void): () => void {
  let timer: NodeJS.Timeout | null = null;
  const later = () => { if (timer) clearTimeout(timer); timer = setTimeout(onChange, 8000); };
  const ws: fs.FSWatcher[] = [];
  for (const r of ROOTS) {
    if (r.system) continue;
    try { const w = fs.watch(r.dir, later); w.on('error', () => { /* pasta removida */ }); ws.push(w); } catch { /* pasta inexistente */ }
  }
  return () => { if (timer) clearTimeout(timer); for (const w of ws) w.close(); };
}
