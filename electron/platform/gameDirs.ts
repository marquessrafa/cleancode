// Jogos em pastas escolhidas pelo usuário (Modo Jogo): cada subpasta com um executável vira um jogo.
// Windows: o maior .exe da pasta (até 3 níveis), sem instaladores, desinstaladores e utilitários.
// macOS: cada .app até 2 níveis.
import fs from 'fs';
import path from 'path';
import type { GameInfo } from './types';

const SKIP = /unins|setup|install|redist|vc_?redist|dxsetup|directx|crash|report|prereq|helper|update|patch|config|settings|benchmark|easyanticheat|battleye|dotnet|vcruntime|ue4prereq|cefprocess|webhelper/i;

function biggestExe(dir: string, depth: number): { file: string; size: number } | null {
  let best: { file: string; size: number } | null = null;
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isFile() && /\.exe$/i.test(e.name) && !SKIP.test(e.name)) {
      try { const size = fs.statSync(p).size; if (!best || size > best.size) best = { file: p, size }; } catch { /* */ }
    } else if (e.isDirectory() && !e.isSymbolicLink() && depth > 0 && !/^(_commonredist|redist|redistributables?|directx|support|tools|docs?|manual)$/i.test(e.name)) {
      const sub = biggestExe(p, depth - 1);
      if (sub && (!best || sub.size > best.size)) best = sub;
    }
  }
  return best;
}

function macApps(dir: string, depth: number, out: string[]) {
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory() || e.isSymbolicLink()) continue;
    const p = path.join(dir, e.name);
    if (e.name.endsWith('.app')) out.push(p);
    else if (depth > 0) macApps(p, depth - 1, out);
  }
}

export function scanGameDirs(dirs: string[], mac: boolean): GameInfo[] {
  const out: GameInfo[] = [];
  for (const root of dirs) {
    if (!root || !fs.existsSync(root)) continue;
    if (mac) {
      const apps: string[] = []; macApps(root, 2, apps);
      for (const a of apps) out.push({ id: `dir:${a}`, name: path.basename(a, '.app'), store: 'custom', dir: path.dirname(a), launch: a });
      continue;
    }
    // a própria pasta escolhida pode ser um jogo (tem .exe direto nela)
    const own = biggestExe(root, 0);
    if (own) { out.push({ id: `dir:${root}`, name: path.basename(root), store: 'custom', dir: root, launch: own.file }); continue; }
    let subs: fs.Dirent[] = [];
    try { subs = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const s of subs) {
      if (!s.isDirectory() || s.isSymbolicLink()) continue;
      const dir = path.join(root, s.name);
      const exe = biggestExe(dir, 3);
      if (exe) out.push({ id: `dir:${dir}`, name: s.name, store: 'custom', dir, launch: exe.file });
    }
  }
  return out;
}
