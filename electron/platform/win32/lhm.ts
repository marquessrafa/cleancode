// Monitoramento avançado no Windows com o LibreHardwareMonitor (helper cc-lhm, incluído no instalador).
// - Sem ativação: o app roda o helper como processo comum (GPU detalhada, carga e parte dos sensores).
// - Com ativação ("Ativar monitoramento avançado"): uma única elevação instala o driver PawnIO
//   (baixado do endereço oficial e com a assinatura digital conferida) e cria a tarefa agendada
//   "CleanCodeSensors", que roda o helper elevado a cada logon e grava a leitura em %ProgramData%.
//   Daí em diante o app só lê o arquivo, sem pedir permissão de novo.
import { app } from 'electron';
import { execFile, spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface LhmSensor { name: string; type: string; value: number | null; min: number | null; max: number | null }
export interface LhmHardware { name: string; type: string; id: string; sensors: LhmSensor[]; sub: LhmHardware[] }
export interface LhmSnapshot { at: number; admin: boolean; hardware: LhmHardware[] }

const TASK = 'CleanCodeSensors';
const DATA = path.join(process.env.ProgramData || 'C:\\ProgramData', 'CleanCode', 'sensors.json');
// cópia do helper usada pela tarefa elevada: em Arquivos de Programas (só administradores alteram),
// fora da pasta do app. Assim a atualização do app nunca encontra o helper travado e um programa comum
// do usuário não consegue trocar o executável que roda elevado.
const SENSORS_DIR = path.join(process.env.ProgramW6432 || process.env.ProgramFiles || 'C:\\Program Files', 'CleanCode', 'Sensors');
const PAWNIO_URL = 'https://github.com/namazso/PawnIO.Setup/releases/latest/download/PawnIO_setup.exe';

function run(cmd: string, args: string[], timeout = 60000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (e, out, err) => resolve({ ok: !e, out: out || '', err: String(err || e?.message || '') })));
}
const ps = (script: string, timeout?: number) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], timeout);
const psq = (s: string) => "'" + s.replace(/'/g, "''") + "'";
function psAdmin(script: string, timeout = 15 * 60000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return ps(`$p = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'; exit $p.ExitCode`, timeout);
}

export function helperPath(): string | null {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'cc-lhm', 'cc-lhm.exe')]
    : [path.join(app.getAppPath(), 'native', 'windows', 'cc-lhm', 'bin', 'Release', 'net472', 'cc-lhm.exe')];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

// ---------- leitura ----------
let child: ChildProcess | null = null;
let last: LhmSnapshot | null = null;
let buf = '';
function startChild() {
  const exe = helperPath(); if (!exe || child) return;
  child = spawn(exe, ['--loop'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  child.stdout!.setEncoding('utf8');
  child.stdout!.on('data', (d: string) => {
    buf += d; let i: number;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line.startsWith('{')) { try { last = JSON.parse(line); } catch { /* linha parcial */ } } }
  });
  child.on('exit', () => { child = null; });
  app.once('before-quit', () => child?.kill());
}
let taskKick = 0;
async function readTaskFile(): Promise<LhmSnapshot | null> {
  try {
    const st = fs.statSync(DATA);
    if (Date.now() - st.mtimeMs > 6000 && Date.now() - taskKick > 15000) { taskKick = Date.now(); run('schtasks.exe', ['/Run', '/TN', TASK], 15000); }
    if (Date.now() - st.mtimeMs > 60000) return null;
    return JSON.parse(fs.readFileSync(DATA, 'utf8').replace(/^\uFEFF/, ''));
  } catch { return null; }
}
let taskInstalled: boolean | null = null;
const sha = (f: string) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return ''; } };
/** A cópia em Arquivos de Programas é a mesma versão do helper deste app? (senão, é preciso ativar de novo) */
function copyCurrent(): boolean {
  const exe = helperPath(); if (!exe) return false;
  const a = sha(exe); return !!a && a === sha(path.join(SENSORS_DIR, 'cc-lhm.exe'));
}
export async function advancedActive(): Promise<boolean> {
  if (taskInstalled === null) taskInstalled = (await run('schtasks.exe', ['/Query', '/TN', TASK], 15000)).ok && copyCurrent();
  return taskInstalled;
}
/** Última leitura (tarefa elevada, se ativa; senão o helper comum). */
export async function snapshot(): Promise<LhmSnapshot | null> {
  if (await advancedActive()) { const s = await readTaskFile(); if (s) return s; }
  startChild();
  return last;
}

// ---------- ativação ----------
// mesma checagem da LibreHardwareMonitorLib: chave de desinstalação do PawnIO (valor DisplayVersion)
export async function pawnioInstalled(): Promise<boolean> {
  for (const key of ['HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PawnIO', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PawnIO']) {
    const r = await run('reg.exe', ['query', key, '/v', 'DisplayVersion'], 10000);
    if (r.ok && /DisplayVersion/i.test(r.out)) return true;
  }
  return false;
}
export async function activate(): Promise<{ ok: boolean; message: string }> {
  const exe = helperPath();
  if (!exe) return { ok: false, message: 'Componente de sensores não encontrado nesta instalação' };
  const dir = path.join(os.tmpdir(), 'cleancode-pawnio'); fs.mkdirSync(dir, { recursive: true });
  const setup = path.join(dir, 'PawnIO_setup.exe');
  const needPawn = !(await pawnioInstalled());
  if (needPawn) {
    // download do endereço oficial e conferência da assinatura digital antes de executar
    const dl = await ps(`$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri ${psq(PAWNIO_URL)} -OutFile ${psq(setup)}; $s=Get-AuthenticodeSignature ${psq(setup)}; "$($s.Status)|$($s.SignerCertificate.Subject)"`, 180000);
    const [status, subject] = dl.out.trim().split('|');
    if (!dl.ok || status !== 'Valid') { try { fs.unlinkSync(setup); } catch { /* */ } return { ok: false, message: `O instalador do driver não passou na verificação de assinatura (${status || dl.err.slice(0, 80)})` }; }
    void subject;
  }
  const taskXmlAction = `New-ScheduledTaskAction -Execute ${psq(path.join(SENSORS_DIR, 'cc-lhm.exe'))} -Argument ${psq(`--loop --out "${DATA}"`)}`;
  const script = [
    "$ErrorActionPreference='Stop'",
    `New-Item -ItemType Directory -Force -Path ${psq(path.dirname(DATA))} | Out-Null`,
    `Remove-Item -Force -ErrorAction SilentlyContinue -Path ${psq(path.join(path.dirname(DATA), 'reboot'))}`,
    // instalação silenciosa (-install -silent: sem janela, nem em erro); 0 = ok, 3010 = ok, reiniciar depois
    needPawn ? `$i = Start-Process -FilePath ${psq(setup)} -ArgumentList '-install','-silent' -Wait -PassThru; if ($i.ExitCode -ne 0 -and $i.ExitCode -ne 3010) { exit 20 }; if ($i.ExitCode -eq 3010) { New-Item -ItemType File -Force -Path ${psq(path.join(path.dirname(DATA), 'reboot'))} | Out-Null }` : '',
    // para a tarefa antiga (se houver) e copia o helper para Arquivos de Programas
    `Stop-ScheduledTask -TaskName ${psq(TASK)} -ErrorAction SilentlyContinue`,
    "Get-Process cc-lhm -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue",
    `New-Item -ItemType Directory -Force -Path ${psq(SENSORS_DIR)} | Out-Null`,
    `Copy-Item -Path ${psq(path.join(path.dirname(exe), '*'))} -Destination ${psq(SENSORS_DIR)} -Recurse -Force`,
    `$a = ${taskXmlAction}`,
    "$t = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME",
    "$p = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest -LogonType Interactive",
    "$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew",
    `Register-ScheduledTask -TaskName ${psq(TASK)} -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null`,
    `Start-ScheduledTask -TaskName ${psq(TASK)}`,
  ].filter(Boolean).join('; ');
  const r = await psAdmin(script);
  taskInstalled = null;
  try { fs.unlinkSync(setup); } catch { /* */ }
  if (!r.ok) return { ok: false, message: /cancel/i.test(r.err) ? 'Cancelado' : needPawn && !(await pawnioInstalled()) ? 'O driver PawnIO não pôde ser instalado' : 'Sem permissão de administrador' };
  child?.kill(); child = null;
  const reboot = fs.existsSync(path.join(path.dirname(DATA), 'reboot'));
  return { ok: true, message: needPawn ? (reboot ? 'Driver instalado: reinicie o Windows para ler todos os sensores' : 'Driver instalado e monitoramento avançado ativo') : 'Monitoramento avançado ativo' };
}
export async function deactivate() {
  const r = await psAdmin(`Stop-ScheduledTask -TaskName ${psq(TASK)} -ErrorAction SilentlyContinue; Get-Process cc-lhm -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName ${psq(TASK)} -Confirm:$false; Remove-Item -Recurse -Force -ErrorAction SilentlyContinue -Path ${psq(SENSORS_DIR)}`);
  taskInstalled = null;
  return { ok: r.ok, message: r.ok ? 'Monitoramento avançado desativado (o driver PawnIO pode ser removido em Aplicativos instalados)' : 'Cancelado' };
}

// ---------- conversão para a lista de sensores do app ----------
const COMPONENT: Record<string, string> = { Cpu: 'cpu', GpuNvidia: 'gpu', GpuAmd: 'gpu', GpuIntel: 'gpu', Memory: 'ram', Motherboard: 'board', SuperIO: 'board', EmbeddedController: 'board', Cooler: 'board', Storage: 'disk', Battery: 'battery', Psu: 'psu' };
const GROUP: Record<string, { g: string; unit: string }> = {
  Temperature: { g: 'temp', unit: '°C' }, Voltage: { g: 'volt', unit: 'V' }, Current: { g: 'current', unit: 'A' }, Power: { g: 'power', unit: 'W' }, Clock: { g: 'clock', unit: 'MHz' },
  Load: { g: 'load', unit: '%' }, Fan: { g: 'fan', unit: 'RPM' }, Control: { g: 'control', unit: '%' }, Level: { g: 'level', unit: '%' }, Data: { g: 'data', unit: 'GB' }, SmallData: { g: 'data', unit: 'MB' },
  Throughput: { g: 'throughput', unit: 'B/s' }, Energy: { g: 'energy', unit: 'mWh' }, Frequency: { g: 'clock', unit: 'Hz' }, Factor: { g: 'factor', unit: '' }, TimeSpan: { g: 'time', unit: 's' },
};
export interface FlatSensor { kind: string; group: string; hw: string; hwId: string; name: string; value: number; min?: number; max?: number; unit: string }
export function flatten(s: LhmSnapshot | null): FlatSensor[] {
  const out: FlatSensor[] = [];
  const walk = (h: LhmHardware, parent?: LhmHardware) => {
    const kind = COMPONENT[h.type] || (parent && COMPONENT[parent.type]) || 'board';
    for (const x of h.sensors || []) {
      if (x.value === null || x.value === undefined) continue;
      const g = GROUP[x.type]; if (!g) continue;
      // limites de fábrica ("Warning/Critical Temperature" dos SSDs NVMe, "Thermal Sensor High Limit"…) não são leituras
      const group = g.g === 'temp' && /warning|critical|limit|alarm|threshold/i.test(x.name) ? 'limit' : g.g;
      out.push({ kind, group, hw: h.name, hwId: h.id, name: x.name, value: x.value, min: x.min ?? undefined, max: x.max ?? undefined, unit: g.unit });
    }
    (h.sub || []).forEach((c) => walk(c, h));
  };
  (s?.hardware || []).forEach((h) => walk(h));
  return out;
}
