// Dossiê de um programa ou jogo: junta o que o sistema sabe (platform/*/dossier) com dados do jogo
// (loja, pasta, executável). A parte pública (internet) fica em dossierOnline.ts.
import fs from 'fs';
import path from 'path';
import type { AppEntry, DossierLocal, GameInfo } from './platform/types';
import { detectTech, findLicenses } from './platform/dossierCommon';
import { dataFoldersFor } from './appdata';
import { t } from './i18n';

const isMac = process.platform === 'darwin';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plat = () => (isMac ? require('./platform/darwin/dossier') : require('./platform/win32/dossier'));

export async function appDossier(a: AppEntry): Promise<DossierLocal> {
  if (isMac) {
    if (!a.location || !fs.existsSync(a.location)) return empty(a.name, 'app');
    const d: DossierLocal = await plat().macDossier(a);
    // pastas em ~/Library/Application Support e Caches com o nome do app ou do fabricante (Google/Chrome…)
    const more = dataFoldersFor(a, () => -1, d.aliases).filter((x) => !d.data.some((y) => x.path === y.path || x.path.startsWith(y.path + '/') || y.path.startsWith(x.path + '/')));
    if (more.length) {
      d.data.push(...more.map((m) => ({ ...m, kind: m.kind === 'Caches' ? 'Cache' : t("Suporte do app") })));
    }
    return d;
  }
  return plat().winDossier(a, (x: AppEntry, al: string[]) => dataFoldersFor(x, () => -1, al));
}

function empty(name: string, kind: 'app' | 'game'): DossierLocal {
  return { facts: [], badges: [], tech: [], licenses: [], data: [], query: { name, kind } };
}

/** .app dentro da pasta do jogo (até 2 níveis), no macOS. */
function findApp(dir: string, depth = 2): string | undefined {
  let ents: fs.Dirent[];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) if (e.isDirectory() && e.name.endsWith('.app')) return path.join(dir, e.name);
  if (depth > 0) for (const e of ents) if (e.isDirectory() && !e.isSymbolicLink()) { const r = findApp(path.join(dir, e.name), depth - 1); if (r) return r; }
}

const STORE: Record<GameInfo['store'], string> = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG Galaxy', app: 'Aplicativo', custom: t("Pasta escolhida por você") };

export async function gameDossier(g: GameInfo, apps: AppEntry[] | null): Promise<DossierLocal> {
  const steamId = g.store === 'steam' ? g.id.replace(/^steam:/, '') : undefined;
  const dir = g.dir && fs.existsSync(g.dir) ? g.dir : g.launch && /\.(app|exe)$/i.test(g.launch) ? path.dirname(g.launch) : undefined;
  let base: DossierLocal = empty(g.name, 'game');
  if (dir) {
    // reaproveita a análise de app: no Mac o .app do jogo, no Windows o maior executável da pasta
    if (isMac) {
      const appPath = g.launch?.endsWith('.app') ? g.launch : findApp(dir);
      if (appPath) base = await plat().macDossier({ id: 'game:' + appPath, source: 'mac', name: g.name, location: appPath, canUninstall: false } as AppEntry);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { biggestExe } = require('./platform/gameDirs');
      const exe = /\.exe$/i.test(g.launch) ? g.launch : biggestExe(dir, 3)?.file;
      const reg = apps?.find((a) => a.location && dir.toLowerCase().startsWith(a.location.toLowerCase().replace(/\\+$/, '')) && a.location.length > 3);
      base = await plat().winDossier({ ...(reg || { id: 'game:' + dir, source: 'win32', name: g.name, canUninstall: false }), location: dir, exes: exe ? [exe] : reg?.exes } as AppEntry,
        (x: AppEntry, al: string[]) => dataFoldersFor(x, () => -1, al));
    }
    if (!base.tech.length) base.tech = detectTech(dir);
    if (!base.licenses.length) base.licenses = findLicenses(dir);
    base.folder = dir;
  }
  const DROP = new Set([t("Pasta"), t("Origem"), t("Tamanho"), t("Tamanho do app"), t("Instalado em")]);
  const facts = base.facts.filter((f) => !(f.group === 'install' && DROP.has(f.label)) && !(f.group === 'about' && f.label === t("Nome")));
  facts.unshift(
    { group: 'about', label: t("Nome"), value: g.name },
    { group: 'install', label: t("Loja"), value: STORE[g.store] || g.store },
    ...(steamId ? [{ group: 'install' as const, label: t("ID na Steam"), value: steamId, kind: 'mono' as const }] : []),
    ...(dir ? [{ group: 'install' as const, label: t("Pasta"), value: dir, kind: 'path' as const }] : []),
    ...(g.size ? [{ group: 'install' as const, label: t("Tamanho"), value: g.size, kind: 'size' as const }] : []),
    { group: 'install', label: t("Como abre"), value: g.launch, kind: 'mono' },
  );
  if (dir) { try { const st = fs.statSync(dir); facts.push({ group: 'install', label: t("Instalado em"), value: st.birthtimeMs || st.ctimeMs, kind: 'date' }); } catch { /* */ } }
  return { ...base, facts, query: { name: g.name, steamId, kind: 'game' } };
}
