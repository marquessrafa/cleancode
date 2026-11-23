// Modo Jogo no macOS: fecha apps em segundo plano, libera memória, desliga o Modo Pouca Energia
// durante a sessão (e religa ao encerrar) e limpa os caches de shaders Metal. O Modo Jogo do
// próprio macOS liga sozinho quando um jogo fica em tela cheia.
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scanGameDirs } from '../gameDirs';
import type { GameApi, GameInfo, GameStatus, GameSessionOptions } from '../types';

function run(cmd: string, args: string[], timeout = 30000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 }, (e, out, err) => resolve({ ok: !e, out: out || '', err: String(err || e?.message || '') })));
}
const asq = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const runAsAdmin = (script: string, timeout = 10 * 60000) => run('/usr/bin/osascript', ['-e', `do shell script ${asq(script)} with administrator privileges`], timeout);
const H = os.homedir();
let restoreLowPower = false;

async function lowPower(): Promise<boolean> { return /lowpowermode\s+1/.test((await run('/usr/bin/pmset', ['-g'])).out); }
async function userCacheDir() { return (await run('/usr/bin/getconf', ['DARWIN_USER_CACHE_DIR'])).out.trim(); }
function dirSize(dir: string, depth = 0): number {
  let total = 0;
  let entries: fs.Dirent[]; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) { const p = path.join(dir, e.name); try { if (e.isDirectory()) { if (depth < 6) total += dirSize(p, depth + 1); } else total += fs.statSync(p).size; } catch { /* */ } }
  return total;
}
/** Pastas com.apple.metal dentro do cache de cada app (shaders compilados). */
async function metalDirs(): Promise<string[]> {
  const base = await userCacheDir();
  const out: string[] = [];
  let apps: string[] = []; try { apps = fs.readdirSync(base); } catch { return out; }
  for (const a of apps) { const p = path.join(base, a, 'com.apple.metal'); if (fs.existsSync(p)) out.push(p); }
  return out;
}

async function status(): Promise<GameStatus> {
  const metal = await metalDirs();
  return {
    shaderCache: metal.reduce((s, d) => s + dirSize(d), 0),
    memory: { total: os.totalmem(), free: os.freemem() },
    toggles: [
      { id: 'lowpower', label: 'Modo Pouca Energia', detail: 'Reduz a velocidade do processador para economizar bateria. Durante a sessão de jogo ele é desligado.', on: await lowPower(), needsAdmin: true, recommended: false },
    ],
  };
}

async function setToggle(id: string, on: boolean) {
  if (id !== 'lowpower') return { ok: false, message: 'Ajuste desconhecido' };
  const r = await runAsAdmin(`/usr/bin/pmset -a lowpowermode ${on ? 1 : 0}`);
  return { ok: r.ok, message: r.ok ? (on ? 'Modo Pouca Energia ligado' : 'Modo Pouca Energia desligado') : 'Cancelado' };
}

function acf(text: string, key: string) { return new RegExp(`"${key}"\\s+"([^"]*)"`, 'i').exec(text)?.[1]; }
async function games(extraDirs: string[] = []): Promise<GameInfo[]> {
  const out: GameInfo[] = [];
  // Steam
  const steam = path.join(H, 'Library/Application Support/Steam');
  let libs = [steam];
  try { libs = [...new Set([steam, ...[...fs.readFileSync(path.join(steam, 'steamapps/libraryfolders.vdf'), 'utf8').matchAll(/"path"\s+"([^"]+)"/g)].map((m) => m[1])])]; } catch { /* */ }
  for (const lib of libs) {
    const apps = path.join(lib, 'steamapps');
    let files: string[] = []; try { files = fs.readdirSync(apps).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      try {
        const t = fs.readFileSync(path.join(apps, f), 'utf8');
        const id = acf(t, 'appid'), name = acf(t, 'name'), dir = acf(t, 'installdir');
        if (!id || !name || /redistributable|steamworks common/i.test(name)) continue;
        out.push({ id: `steam:${id}`, name, store: 'steam', dir: dir ? path.join(apps, 'common', dir) : undefined, size: Number(acf(t, 'SizeOnDisk')) || undefined, launch: `steam://rungameid/${id}` });
      } catch { /* */ }
    }
  }
  // apps da categoria Jogos (App Store e outros que declaram a categoria)
  const r = await run('/usr/bin/mdfind', ['kMDItemContentType == "com.apple.application-bundle" && kMDItemAppStoreCategoryType == "public.app-category.*games*"'], 20000);
  for (const p of r.out.split('\n').map((x) => x.trim()).filter(Boolean)) {
    if (!p.startsWith('/Applications') && !p.startsWith(path.join(H, 'Applications'))) continue;
    out.push({ id: `app:${p}`, name: path.basename(p, '.app'), store: 'app', dir: p, launch: p });
  }
  const known = new Set(out.map((g) => g.launch));
  for (const g of scanGameDirs(extraDirs, true)) if (!known.has(g.launch)) out.push(g);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function start(o: GameSessionOptions) {
  const steps: { label: string; ok: boolean; message: string }[] = [];
  for (const c of o.close) {
    // pede para o app fechar normalmente (ele pode perguntar se quer salvar)
    const r = await run('/usr/bin/osascript', ['-e', `tell application ${asq(c.name)} to quit`], 15000);
    steps.push({ label: `Fechar ${c.name}`, ok: r.ok, message: r.ok ? 'Fechado' : 'Não respondeu ao pedido de fechar' });
  }
  const admin: string[] = [];
  const wasLow = await lowPower();
  if (o.power && wasLow) admin.push('/usr/bin/pmset -a lowpowermode 0');
  if (o.freeMemory) admin.push('/usr/sbin/purge');
  if (admin.length) {
    const before = os.freemem();
    const r = await runAsAdmin(admin.join(' && '));
    if (o.power && wasLow) { restoreLowPower = r.ok; steps.push({ label: 'Desligar Modo Pouca Energia', ok: r.ok, message: r.ok ? 'Desligado durante a sessão' : 'Cancelado' }); }
    if (o.freeMemory) steps.push({ label: 'Liberar memória', ok: r.ok, message: r.ok ? `${Math.max(0, Math.round((os.freemem() - before) / 1048576))} MB liberados` : 'Cancelado' });
  } else if (o.power) steps.push({ label: 'Energia', ok: true, message: 'O Modo Pouca Energia já está desligado' });
  if (o.boostDir) steps.push({ label: 'Prioridade do jogo', ok: true, message: 'O macOS dá prioridade sozinho ao jogo em tela cheia (Modo Jogo)' });
  return { steps };
}

async function stop() {
  const steps: { label: string; ok: boolean; message: string }[] = [];
  if (restoreLowPower) {
    const r = await runAsAdmin('/usr/bin/pmset -a lowpowermode 1');
    steps.push({ label: 'Religar Modo Pouca Energia', ok: r.ok, message: r.ok ? 'Religado' : 'Cancelado' });
    restoreLowPower = false;
  }
  steps.push({ label: 'Apps fechados', ok: true, message: 'Abra de novo os que precisar' });
  return { steps };
}

async function boost() { return 0; }

async function cleanShaders() {
  let freed = 0;
  for (const d of await metalDirs()) { const size = dirSize(d); try { fs.rmSync(d, { recursive: true, force: true }); freed += size; } catch { /* em uso */ } }
  return { freed, message: 'Os jogos recompilam os shaders na próxima vez (a primeira partida pode engasgar um pouco).' };
}

async function freeMemory() {
  const before = os.freemem();
  const r = await runAsAdmin('/usr/sbin/purge');
  const freed = Math.max(0, os.freemem() - before);
  return r.ok ? { ok: true, freed, message: `${Math.round(freed / 1048576)} MB liberados` } : { ok: false, freed: 0, message: 'Cancelado' };
}

export const game: GameApi = { status, setToggle, games, start, stop, boost, cleanShaders, freeMemory };
