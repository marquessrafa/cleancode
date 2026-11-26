// Procura jogos em qualquer pasta dos discos, sem depender de loja: jogos de lojas menores, ports, recomps, pastas de
// emuladores (romfs e exefs) e jogos instalados de outras formas. Cada pasta é reconhecida pelos sinais que só jogos têm:
// - motores de jogo: Unity (UnityPlayer.dll, GameAssembly.dll ou a pasta <nome>_Data ao lado de <nome>.exe), Unreal
//   (pasta Engine com Binaries ou Content) e Godot (arquivo .pck ao lado de um .exe);
// - Switch e emuladores: pastas romfs ou exefs;
// - recomps: pasta com "recomp" no nome e com um executável;
// - integração com o Steam fora do Steam e emuladores do Steam (steam_api64.dll, steam_settings e arquivos .ini conhecidos);
// - pacotes de dados de jogos (.bsa, .ba2, .rpf, .vpk, .forge, .cpk e outros).
// A busca desce até 5 níveis a partir de cada raiz, pula pastas do sistema, de programação e de dados de apps, e para de
// descer quando acha um jogo. As pastas das lojas (Steam, Epic e GOG) já são conhecidas e ficam de fora.
import { parentPort, workerData } from 'worker_threads';
import * as W from './platform/fs';

interface Found { dir: string; name: string; kind: string }
const isWin = W.isWin;
const norm = (p: string) => (isWin ? p.toLowerCase() : p).replace(/[\\/]+$/, '');
const roots: string[] = workerData.roots || [];
const known = new Set<string>((workerData.known || []).map(norm));
const MAX_DEPTH = 5;
const deadline = Date.now() + (workerData.timeoutMs || 4 * 60000);

// pastas que nunca têm jogos (ou que já são de uma loja conhecida) e que deixariam a busca lenta
const SKIP = new Set([
  'windows', '$recycle.bin', 'system volume information', 'recovery', 'perflogs', 'msocache', '$windows.~bt', '$windows.~ws', '$winreagent',
  'programdata', 'appdata', 'windowsapps', 'winsxs', 'node_modules', '.git', '.svn', '.hg', '.cache', '.npm', '.gradle', '.m2', '.nuget', '.cargo',
  '.rustup', '.vscode', '.cursor', '.idea', '__pycache__', 'site-packages', '.venv', 'venv', 'steam', 'steamapps', 'library', 'system', '.trash',
  'microsoft', 'windows defender', 'windows kits', 'common files', 'reference assemblies', 'dotnet', 'nvidia corporation', 'amd', 'intel',
]);
// nomes de subpasta comuns dentro de um jogo: quando o sinal aparece numa delas, a pasta do jogo é a de cima
const GENERIC = new Set(['bin', 'bin64', 'bin32', 'binaries', 'win64', 'win32', 'x64', 'x86', 'x86_64', 'data', 'retail', 'shipping', 'executable', 'game']);
const STEAMLIKE = ['steam_api64.dll', 'steam_api.dll', 'steam_emu.ini', 'onlinefix64.dll', 'onlinefix.ini', 'codex.ini', 'cpy.ini', '3dmgame.ini', 'empress.ini', 'steam_appid.txt'];
const PACK = /\.(bsa|ba2|rpf|vpk|forge|cpk|xp3|rgssad|rgss3a|rgss2a)$/i;
// launchers e lojas (o próprio programa não é um jogo, mas os jogos podem estar dentro da pasta dele)
const LAUNCHER = /launcher|^ea desktop$|^destager$|battle\.net|ubisoft connect|^origin$|gog galaxy|^galaxy$|^heroic$|^playnite$|^lutris$/i;
// nome de pasta que é só uma versão (v3.0.0-rc.4, 1.2.3): o nome do jogo fica na pasta de cima
const VERSION = /^v?\d+(\.\d+)+([-_.+ ].*)?$/i;

function list(dir: string) {
  const files: string[] = [], dirs: string[] = [];
  W.listDir(dir, (e) => {
    if (e.name === '.' || e.name === '..') return;
    if (e.attr & W.ATTR.DIRECTORY) { if (!(e.attr & W.ATTR.REPARSE)) dirs.push(e.name); } else files.push(e.name.toLowerCase());
  });
  return { files, dirs };
}
const base = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
const parent = (p: string) => { const i = p.replace(/[\\/]+$/, '').search(/[\\/][^\\/]*$/); return i > 0 ? p.slice(0, i) : p; };

/** Qual sinal de jogo a pasta tem (ou null). */
function signature(dir: string, files: string[], dirs: string[]): string | null {
  const fs = new Set(files), dl = dirs.map((d) => d.toLowerCase());
  const exes = files.filter((f) => f.endsWith('.exe'));
  if (fs.has('unityplayer.dll') || fs.has('gameassembly.dll') || fs.has('unityplayer.dylib')) return 'Unity';
  if (exes.some((e) => dl.includes(e.slice(0, -4) + '_data'))) return 'Unity';
  if (dl.includes('romfs') || dl.includes('exefs')) return 'Switch';
  if (dl.includes('engine') && dl.length > 1) {
    const eng = list(W.join(dir, dirs[dl.indexOf('engine')])).dirs.map((d) => d.toLowerCase());
    if (eng.includes('binaries') || eng.includes('content')) return 'Unreal';
  }
  if (exes.length && files.some((f) => f.endsWith('.pck'))) return 'Godot';
  if (/recomp/i.test(base(dir)) && (exes.length || dl.includes('bin'))) return 'Recomp';
  if (STEAMLIKE.some((f) => fs.has(f)) || dl.includes('steam_settings')) return 'Steamworks';
  if (files.some((f) => PACK.test(f))) return 'Pacotes';
  return null;
}
/** Sobe das subpastas comuns (bin, Binaries, Win64, Data…) até a pasta do jogo, sem passar da raiz da busca. */
function gameRoot(dir: string, root: string) {
  let d = dir;
  while (GENERIC.has(base(d).toLowerCase()) && norm(parent(d)) !== norm(root) && parent(d) !== d) d = parent(d);
  return d;
}
/** macOS: um .app é jogo quando traz o Unity, o Godot ou o Unreal dentro dele. */
function macApp(dir: string): string | null {
  const fw = list(W.join(W.join(dir, 'Contents'), 'Frameworks')).files;
  if (fw.includes('unityplayer.dylib') || fw.includes('gameassembly.dylib')) return 'Unity';
  const res = list(W.join(W.join(dir, 'Contents'), 'Resources'));
  if (res.files.some((f) => f.endsWith('.pck'))) return 'Godot';
  if (res.dirs.some((d) => d.toLowerCase() === 'engine')) return 'Unreal';
  return null;
}

const found: Found[] = [];
let partial = false;
for (const root of roots) {
  const stack: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];
  while (stack.length) {
    if (Date.now() > deadline) { partial = true; break; }
    const { dir, depth } = stack.pop()!;
    if (known.has(norm(dir))) continue;
    if (!isWin && dir.endsWith('.app')) { const k = macApp(dir); if (k) found.push({ dir, name: base(dir).replace(/\.app$/, ''), kind: k }); continue; }
    const { files, dirs } = list(dir);
    const kind = depth > 0 ? signature(dir, files, dirs) : null;
    if (kind) {
      const g = gameRoot(dir, root);
      if (!LAUNCHER.test(base(g))) {
        found.push({ dir: g, name: VERSION.test(base(g)) ? `${base(parent(g))} ${base(g)}` : base(g), kind });
        continue;
      }
    }
    if (depth >= MAX_DEPTH) continue;
    for (const d of dirs) {
      const l = d.toLowerCase();
      if (SKIP.has(l) || (l.startsWith('.') && l !== '.app') || l.startsWith('$')) continue;
      stack.push({ dir: W.join(dir, d), depth: depth + 1 });
    }
  }
}
// sem repetir e sem uma pasta dentro de outra (fica a de fora); sem as pastas que já são de uma loja
const inside = (p: string, o: string) => norm(p).startsWith(norm(o) + (isWin ? '\\' : '/'));
const uniq = new Map<string, Found>();
for (const f of found) if (!uniq.has(norm(f.dir))) uniq.set(norm(f.dir), f);
const all = [...uniq.values()];
const out = all.filter((f) => !all.some((o) => o !== f && inside(f.dir, o.dir)) && ![...known].some((k) => inside(f.dir, k) || norm(f.dir) === k));
parentPort!.postMessage({ found: out, partial });
