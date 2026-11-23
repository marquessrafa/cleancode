// Modo Jogo no Windows: plano de energia de alto desempenho durante a sessão, apps em segundo plano
// fechados, memória em espera liberada, prioridade alta para o jogo, ajustes do Windows para jogos
// e limpeza dos caches de shaders. Ao encerrar, o plano de energia anterior volta.
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scanGameDirs } from '../gameDirs';
import type { GameApi, GameInfo, GameStatus, GameSessionOptions } from '../types';

function run(cmd: string, args: string[], timeout = 60000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (e, out, err) => resolve({ ok: !e, out: out || '', err: String(err || e?.message || '') })));
}
const ps = (script: string, timeout?: number) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], timeout);
const psq = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const json = (t: string) => { try { return JSON.parse(t.trim() || 'null'); } catch { return null; } };
function psAdmin(script: string, timeout = 10 * 60000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return ps(`$p = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'; exit $p.ExitCode`, timeout);
}

const HIGH = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const ULTIMATE = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
let previousScheme: string | null = null;
let boostTimer: ReturnType<typeof setInterval> | null = null;

const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const SHADER_DIRS = ['D3DSCache', 'NVIDIA\\DXCache', 'NVIDIA\\GLCache', 'NVIDIA Corporation\\NV_Cache', 'AMD\\DxCache', 'AMD\\DxcCache', 'AMD\\VkCache', 'AMD\\GLCache', 'Intel\\ShaderCache'].map((d) => path.join(LOCAL, d));

function dirSize(dir: string, depth = 0): number {
  let total = 0;
  let entries: fs.Dirent[]; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    try { if (e.isDirectory()) { if (depth < 6) total += dirSize(p, depth + 1); } else total += fs.statSync(p).size; } catch { /* */ }
  }
  return total;
}

const STATUS = String.raw`$ErrorActionPreference='SilentlyContinue'
$gm=(Get-ItemProperty 'HKCU:\Software\Microsoft\GameBar').AutoGameModeEnabled
$dvr=(Get-ItemProperty 'HKCU:\System\GameConfigStore').GameDVR_Enabled
$cap=(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR').AppCaptureEnabled
$hags=(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers').HwSchMode
$plan=(powercfg /getactivescheme) -join ' '
[pscustomobject]@{gm=$gm;dvr=$dvr;cap=$cap;hags=$hags;plan=$plan} | ConvertTo-Json -Compress`;

async function status(): Promise<GameStatus> {
  const j = json((await ps(STATUS, 30000)).out) || {};
  const plan = /\(([^)]+)\)\s*$/.exec(String(j.plan || '').trim())?.[1];
  const dvrOn = j.dvr !== 0 && j.cap !== 0;
  return {
    powerPlan: plan,
    shaderCache: SHADER_DIRS.reduce((s, d) => s + dirSize(d), 0),
    memory: { total: os.totalmem(), free: os.freemem() },
    toggles: [
      { id: 'gamemode', label: 'Modo de Jogo do Windows', detail: 'Dá prioridade de CPU e GPU ao jogo e segura atualizações do Windows durante a partida.', on: j.gm !== 0, recommended: true },
      { id: 'gamedvr', label: 'Gravação em segundo plano (Xbox Game Bar)', detail: 'Grava os últimos minutos do jogo o tempo todo. Desligar libera CPU, GPU e disco.', on: dvrOn, recommended: false },
      { id: 'hags', label: 'Agendamento de GPU acelerado por hardware', detail: 'A placa de vídeo gerencia a própria memória; reduz a latência na maioria das GPUs recentes. Pede reinício.', on: Number(j.hags) === 2, needsAdmin: true, needsRestart: true, recommended: true },
    ],
  };
}

async function setToggle(id: string, on: boolean) {
  if (id === 'gamemode') {
    const r = await ps(`New-Item -Path 'HKCU:\\Software\\Microsoft\\GameBar' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\GameBar' -Name AutoGameModeEnabled -Value ${on ? 1 : 0} -Type DWord`);
    return { ok: r.ok, message: r.ok ? (on ? 'Modo de Jogo ligado' : 'Modo de Jogo desligado') : r.err.slice(0, 140) };
  }
  if (id === 'gamedvr') {
    const v = on ? 1 : 0;
    const r = await ps(`New-Item -Path 'HKCU:\\System\\GameConfigStore' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\System\\GameConfigStore' -Name GameDVR_Enabled -Value ${v} -Type DWord; New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR' -Name AppCaptureEnabled -Value ${v} -Type DWord`);
    return { ok: r.ok, message: r.ok ? (on ? 'Gravação ligada' : 'Gravação em segundo plano desligada') : r.err.slice(0, 140) };
  }
  if (id === 'hags') {
    const r = await psAdmin(`Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name HwSchMode -Value ${on ? 2 : 1} -Type DWord`);
    return { ok: r.ok, message: r.ok ? 'Alterado. Reinicie o computador para valer.' : 'Cancelado ou sem permissão de administrador' };
  }
  return { ok: false, message: 'Ajuste desconhecido' };
}

// ---------- jogos instalados ----------
function vdfPaths(text: string): string[] { return [...text.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => m[1].replace(/\\\\/g, '\\')); }
function acf(text: string, key: string) { return new RegExp(`"${key}"\\s+"([^"]*)"`, 'i').exec(text)?.[1]; }
async function games(extraDirs: string[] = []): Promise<GameInfo[]> {
  const out: GameInfo[] = [];
  // Steam
  const sp = json((await ps(`(Get-ItemProperty 'HKCU:\\Software\\Valve\\Steam').SteamPath | ConvertTo-Json`, 15000)).out);
  if (sp) {
    const steam = String(sp).replace(/\//g, '\\');
    let libs = [steam];
    try { libs = [...new Set([steam, ...vdfPaths(fs.readFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8'))])]; } catch { /* */ }
    for (const lib of libs) {
      const apps = path.join(lib, 'steamapps');
      let files: string[] = []; try { files = fs.readdirSync(apps).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
      for (const f of files) {
        try {
          const t = fs.readFileSync(path.join(apps, f), 'utf8');
          const id = acf(t, 'appid'), name = acf(t, 'name'), dir = acf(t, 'installdir');
          if (!id || !name || /redistributable|steamworks common|proton|steam linux runtime/i.test(name)) continue;
          out.push({ id: `steam:${id}`, name, store: 'steam', dir: dir ? path.join(apps, 'common', dir) : undefined, size: Number(acf(t, 'SizeOnDisk')) || undefined, launch: `steam://rungameid/${id}` });
        } catch { /* */ }
      }
    }
  }
  // Epic Games
  const epic = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  try {
    for (const f of fs.readdirSync(epic).filter((x) => x.endsWith('.item'))) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(epic, f), 'utf8'));
        if (!j.DisplayName || j.bIsApplication === false) continue;
        out.push({ id: `epic:${j.AppName}`, name: j.DisplayName, store: 'epic', dir: j.InstallLocation, size: Number(j.InstallSize) || undefined, launch: `com.epicgames.launcher://apps/${encodeURIComponent(j.AppName)}?action=launch&silent=true` });
      } catch { /* */ }
    }
  } catch { /* sem Epic */ }
  // GOG
  const gog = json((await ps(String.raw`$ErrorActionPreference='SilentlyContinue'
Get-ChildItem 'HKLM:\SOFTWARE\WOW6432Node\GOG.com\Games' | ForEach-Object { $p=Get-ItemProperty $_.PSPath; [pscustomobject]@{id=$p.gameID;name=$p.gameName;dir=$p.path;exe=$p.exe} } | ConvertTo-Json -Compress`, 15000)).out);
  for (const g of (Array.isArray(gog) ? gog : gog ? [gog] : [])) if (g?.name && g.exe) out.push({ id: `gog:${g.id}`, name: g.name, store: 'gog', dir: g.dir, launch: g.exe });
  // pastas escolhidas pelo usuário (sem repetir jogos das lojas)
  const known = new Set(out.map((g) => (g.dir || '').toLowerCase()).filter(Boolean));
  for (const g of scanGameDirs(extraDirs, false)) if (!known.has((g.dir || '').toLowerCase())) out.push(g);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Libera a lista de memória em espera (standby) e enxuga a memória dos processos em segundo plano.
// Exige administrador (privilégio SeProfileSingleProcessPrivilege).
const FREE_MEM = String.raw`$ErrorActionPreference='SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class CCMem {
  [StructLayout(LayoutKind.Sequential)] struct LUID { public uint Lo; public int Hi; }
  [StructLayout(LayoutKind.Sequential)] struct TP { public int Count; public LUID Luid; public int Attr; }
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr h, int acc, out IntPtr tok);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool LookupPrivilegeValue(string s, string n, out LUID l);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool AdjustTokenPrivileges(IntPtr t, bool d, ref TP n, int l, IntPtr p, IntPtr r);
  [DllImport("ntdll.dll")] static extern int NtSetSystemInformation(int cls, ref int info, int len);
  [DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr h);
  static void Priv(string n){ IntPtr t; OpenProcessToken(System.Diagnostics.Process.GetCurrentProcess().Handle, 0x28, out t); TP tp = new TP(); tp.Count=1; tp.Attr=2; LookupPrivilegeValue(null, n, out tp.Luid); AdjustTokenPrivileges(t, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero); }
  public static int Standby(){ Priv("SeProfileSingleProcessPrivilege"); int cmd = 4; return NtSetSystemInformation(80, ref cmd, 4); }
}
"@
foreach($p in Get-Process){ try { [void][CCMem]::EmptyWorkingSet($p.Handle) } catch {} }
exit [CCMem]::Standby()`;

async function start(o: GameSessionOptions) {
  const steps: { label: string; ok: boolean; message: string }[] = [];
  for (const c of o.close) {
    // fechamento normal (como clicar no X), sem forçar: o app pode pedir para salvar
    const r = await run('taskkill.exe', c.pids.flatMap((p) => ['/PID', String(p)]), 15000);
    steps.push({ label: `Fechar ${c.name}`, ok: r.ok, message: r.ok ? 'Fechado' : 'Não respondeu ao pedido de fechar' });
  }
  if (o.power) {
    const cur = /([0-9a-f-]{36})/i.exec((await run('powercfg.exe', ['/getactivescheme'])).out)?.[1];
    if (cur && !previousScheme) previousScheme = cur;
    const list = (await run('powercfg.exe', ['/list'])).out;
    const target = list.includes(ULTIMATE) ? ULTIMATE : HIGH;
    let r = await run('powercfg.exe', ['/setactive', target]);
    if (!r.ok && target === HIGH) { await run('powercfg.exe', ['-duplicatescheme', HIGH]); r = await run('powercfg.exe', ['/setactive', HIGH]); }
    steps.push({ label: 'Plano de energia de alto desempenho', ok: r.ok, message: r.ok ? (target === ULTIMATE ? 'Desempenho Máximo ativado' : 'Alto desempenho ativado') : 'O Windows não permitiu trocar o plano' });
  }
  if (o.freeMemory) {
    const before = os.freemem();
    const r = await psAdmin(FREE_MEM, 120000);
    const freed = Math.max(0, os.freemem() - before);
    steps.push({ label: 'Liberar memória', ok: r.ok, message: r.ok ? `${Math.round(freed / 1048576)} MB liberados` : 'Cancelado (precisa de administrador)' });
  }
  if (o.boostDir) {
    const dir = o.boostDir;
    const n = await boost(dir);
    if (boostTimer) clearInterval(boostTimer);
    boostTimer = setInterval(() => { boost(dir).catch(() => 0); }, 30000);
    steps.push({ label: 'Prioridade alta para o jogo', ok: true, message: n ? `${n} processo(s) do jogo em prioridade alta` : 'Vai aplicar assim que o jogo abrir' });
  }
  return { steps };
}

async function stop() {
  const steps: { label: string; ok: boolean; message: string }[] = [];
  if (boostTimer) { clearInterval(boostTimer); boostTimer = null; }
  if (previousScheme) {
    const r = await run('powercfg.exe', ['/setactive', previousScheme]);
    steps.push({ label: 'Plano de energia anterior', ok: r.ok, message: r.ok ? 'Restaurado' : 'Não foi possível restaurar' });
    previousScheme = null;
  }
  steps.push({ label: 'Apps fechados', ok: true, message: 'Abra de novo os que precisar' });
  return { steps };
}

async function boost(dir: string) {
  const r = await ps(`$n=0; Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith(${psq(dir)}, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { try { $_.PriorityClass='High'; $n++ } catch {} }; $n`, 20000);
  return parseInt(r.out.trim(), 10) || 0;
}

async function cleanShaders() {
  let freed = 0;
  for (const d of SHADER_DIRS) {
    let entries: string[] = []; try { entries = fs.readdirSync(d); } catch { continue; }
    for (const e of entries) {
      const p = path.join(d, e);
      const size = dirSize(p) || (() => { try { return fs.statSync(p).size; } catch { return 0; } })();
      try { fs.rmSync(p, { recursive: true, force: true }); freed += size; } catch { /* em uso */ }
    }
  }
  return { freed, message: 'Os jogos recompilam os shaders na próxima vez (a primeira partida pode engasgar um pouco).' };
}

// liberar RAM sem administrador: esvazia o conjunto de trabalho dos processos do próprio usuário
// (o Windows devolve as páginas ao disco/cache; elas voltam sob demanda)
export const TRIM_MEM = String.raw`$ErrorActionPreference='SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class CCTrim { [DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr h); }
"@
$n=0; foreach($p in Get-Process){ try { if([CCTrim]::EmptyWorkingSet($p.Handle)){ $n++ } } catch {} }; $n`;
async function freeMemory(deep: boolean) {
  const before = os.freemem();
  const r = deep ? await psAdmin(FREE_MEM, 120000) : await ps(TRIM_MEM, 120000);
  await new Promise((res) => setTimeout(res, 800));
  const freed = Math.max(0, os.freemem() - before);
  if (!r.ok && deep) return { ok: false, freed: 0, message: 'Cancelado (a limpeza completa precisa de administrador)' };
  return { ok: true, freed, message: `${Math.round(freed / 1048576)} MB liberados` };
}

export const game: GameApi = { status, setToggle, games, start, stop, boost, cleanShaders, freeMemory };
