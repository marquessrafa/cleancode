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
import { t } from '../../i18n';
import type { HwCheck } from '../types';

export interface LhmSensor { name: string; type: string; value: number | null; min: number | null; max: number | null }
export interface LhmHardware { name: string; type: string; id: string; stuck?: boolean; sensors: LhmSensor[]; sub: LhmHardware[] }
/** groups: estado de cada etapa de abertura do helper ("ok", "pending", "timeout", "skipped" ou "error: …") */
export interface LhmSnapshot { at: number; admin: boolean; pawnio?: boolean; groups?: Record<string, string>; hardware: LhmHardware[] }

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
/**
 * Lê o JSON do helper. Se ele vier com caracteres de controle crus (um helper antigo deixava passar os bytes nulos do
 * nome de um pente de memória), troca esses caracteres por espaço e tenta de novo. O erro fica guardado em parseError,
 * para o relatório mostrar o motivo em vez de a leitura sumir em silêncio.
 */
export let parseError = '';
function parseSnapshot(text: string, from: string): LhmSnapshot | null {
  try { const s = JSON.parse(text); parseError = ''; return s; } catch (e: any) {
    try {
      const s = JSON.parse(text.replace(/[\u0000-\u001f]/g, ' '));
      parseError = t("A leitura de {0} veio com caracteres inválidos, e o CleanCode limpou esses caracteres para ler os dados.", from);
      return s;
    } catch {
      parseError = t("A leitura de {0} não pôde ser lida: {1}", from, String(e?.message || e).slice(0, 160));
      return null;
    }
  }
}
let child: ChildProcess | null = null;
let childStarted = 0;
let last: LhmSnapshot | null = null;
let buf = '';
function startChild() {
  const exe = helperPath(); if (!exe || child) return;
  child = spawn(exe, ['--loop'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  childStarted = Date.now();
  child.stdout!.setEncoding('utf8');
  child.stdout!.on('data', (d: string) => {
    buf += d; let i: number;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line.startsWith('{')) { const s = parseSnapshot(line, t("o programa comum dos sensores")); if (s) last = s; } }
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
    return parseSnapshot(fs.readFileSync(DATA, 'utf8').replace(/^\uFEFF/, ''), t("a tarefa de administrador"));
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
  if (!askedAt) askedAt = Date.now();
  let s: LhmSnapshot | null = null;
  if (await advancedActive()) {
    s = await readTaskFile();
    if (s) {
      taskMissingSince = 0;
      // a tarefa voltou a responder: encerra o helper comum, mas só depois da janela dos marcadores de queda
      // (abertura e primeiras leituras), para ele não deixar um marcador que pareça uma queda
      if (child && Date.now() - childStarted > 30000) { child.kill(); child = null; last = null; }
    } else {
      // a tarefa ainda não gravou a leitura (por exemplo, logo depois do logon): espera até 20 segundos antes de abrir
      // o helper comum. Duas cópias abrindo as peças ao mesmo tempo faziam uma achar que a outra tinha caído (1.4.15).
      if (!taskMissingSince) taskMissingSince = Date.now();
      if (Date.now() - taskMissingSince < 20000) return child ? last : null;
    }
  }
  if (!s) { startChild(); s = last; }
  if (s?.hardware?.length) dataAt = Date.now();
  return s;
}
let taskMissingSince = 0;
// Quando foi pedida a primeira leitura e quando chegou a última leitura com peças.
let askedAt = 0, dataAt = 0;
/**
 * O helper está mudo? Isso acontece quando ele cai ou trava antes de gravar qualquer leitura (foi o que aconteceu
 * na 1.4.12 em PCs Intel). Sem este aviso, a tela ficava só com o que o Windows informa e não explicava nada.
 * Conta 45 segundos desde o primeiro pedido ou desde a última leitura boa.
 */
export function helperSilent(): boolean {
  return !!helperPath() && askedAt > 0 && Date.now() - Math.max(askedAt, dataAt) > 45000;
}
/** Onde o helper grava o registro de cada passo (lhm.log). */
export function logPath(active: boolean): string {
  return active ? path.join(path.dirname(DATA), 'lhm.log') : path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'CleanCode', 'lhm', 'lhm.log');
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
export async function activate(onStep: (step: number, info?: { driverPresent?: boolean }) => void = () => {}): Promise<{ ok: boolean; message: string; checks?: HwCheck[] }> {
  onStep(0);
  const exe = helperPath();
  if (!exe) return { ok: false, message: t("O componente dos sensores não foi encontrado nesta instalação") };
  const dir = path.join(os.tmpdir(), 'cleancode-pawnio'); fs.mkdirSync(dir, { recursive: true });
  const setup = path.join(dir, 'PawnIO_setup.exe');
  const needPawn = !(await pawnioInstalled());
  onStep(1, { driverPresent: !needPawn });
  if (needPawn) {
    // download do endereço oficial e conferência da assinatura digital antes de executar
    const dl = await ps(`$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri ${psq(PAWNIO_URL)} -OutFile ${psq(setup)}; $s=Get-AuthenticodeSignature ${psq(setup)}; "$($s.Status)|$($s.SignerCertificate.Subject)"`, 180000);
    const [status, subject] = dl.out.trim().split('|');
    if (!dl.ok || status !== 'Valid') { try { fs.unlinkSync(setup); } catch { /* */ } return { ok: false, message: t("O instalador do driver não passou na verificação de assinatura ({0})", status || dl.err.slice(0, 80)) }; }
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
    // marcadores de queda antigos: começam do zero com o helper novo
    `Remove-Item -Force -ErrorAction SilentlyContinue -Path ${psq(path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'CleanCode', 'lhm', 'opening-*'))}`,
    `New-Item -ItemType Directory -Force -Path ${psq(SENSORS_DIR)} | Out-Null`,
    `Copy-Item -Path ${psq(path.join(path.dirname(exe), '*'))} -Destination ${psq(SENSORS_DIR)} -Recurse -Force`,
    `$a = ${taskXmlAction}`,
    "$t = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME",
    "$p = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest -LogonType Interactive",
    "$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew",
    `Register-ScheduledTask -TaskName ${psq(TASK)} -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null`,
    `Start-ScheduledTask -TaskName ${psq(TASK)}`,
  ].filter(Boolean).join('; ');
  onStep(2, { driverPresent: !needPawn });
  child?.kill(); child = null; last = null;
  const r = await psAdmin(script);
  taskInstalled = null;
  try { fs.unlinkSync(setup); } catch { /* */ }
  if (!r.ok) return { ok: false, message: /cancel/i.test(r.err) ? t("Cancelado") : needPawn && !(await pawnioInstalled()) ? t("O driver PawnIO não pôde ser instalado") : t("Sem permissão de administrador") };
  // espera a primeira leitura da tarefa de administrador (até 25 segundos)
  onStep(3, { driverPresent: !needPawn });
  for (let i = 0; i < 25; i++) {
    if (await advancedActive()) { const s = await readTaskFile(); if (s?.hardware?.length) { dataAt = Date.now(); break; } }
    await new Promise((res) => setTimeout(res, 1000));
    taskInstalled = null;
  }
  onStep(4, { driverPresent: !needPawn });
  const checks = await validate();
  await new Promise((res) => setTimeout(res, 400));
  const reboot = fs.existsSync(path.join(path.dirname(DATA), 'reboot'));
  return { checks, ok: true, message: needPawn ? (reboot ? t("Driver instalado. Reinicie o Windows para ler todos os sensores.") : t("Driver instalado e monitoramento avançado ativo")) : t("Monitoramento avançado ativo") };
}
// ---------- validação das peças e relatório ----------
/**
 * Confere, na leitura atual, cada dado que gera as métricas de cada peça. Para cada peça, devolve o que foi mapeado
 * (com o valor lido) e o que não foi mapeado, com o motivo. O motivo vem do estado de cada etapa do helper, do driver
 * PawnIO, da permissão de administrador ou do próprio tipo de peça (por exemplo, uma placa de vídeo integrada).
 * - "ok": tudo foi mapeado;
 * - "warn": a peça funciona, mas não informa alguns dados neste PC;
 * - "fail": a leitura da peça travou, caiu ou deu erro.
 */
export async function validate(): Promise<HwCheck[]> {
  const s = await snapshot().catch(() => null);
  const flat = flatten(s);
  const g = s?.groups || {};
  if (!s?.hardware?.length) {
    const why = parseError || t("O programa dos sensores não entregou nenhuma leitura.");
    return (['cpu', 'gpu', 'ram', 'board', 'disk', 'power'] as const).map((id) => ({ id, status: 'fail' as const, detail: why, found: [], missing: [{ what: t("Todos os dados"), why }] }));
  }
  const hw = s.hardware;
  // motivo de uma etapa do helper que travou, caiu ou deu erro
  const stageWhy = (grp: string) => {
    const st = g[grp] || '';
    if (st === 'timeout') return t("A abertura dessa peça passou de 20 segundos, então o programa dos sensores seguiu sem ela.");
    if (st === 'skipped') return t("A leitura dessa peça caiu duas vezes seguidas, então ela fica de fora por um dia.");
    if (st.startsWith('error')) return t("A abertura dessa peça deu erro: {0}", st.replace(/^error:\s*/, ''));
    return '';
  };
  // dados que só o driver libera (temperatura, consumo e tensão do processador, sensores da placa-mãe e da memória)
  const driverWhy = s.pawnio === false ? t("O Windows só libera esse dado com o driver PawnIO, e ele não está instalado.")
    : !s.admin ? t("O programa dos sensores não está rodando como administrador, e o Windows só libera esse dado assim.") : '';
  const fmt = (x: FlatSensor) => {
    const v = x.group === 'volt' ? x.value.toFixed(2) : x.group === 'power' ? (Math.round(x.value * 10) / 10).toLocaleString() : Math.round(x.value).toLocaleString();
    return `${v} ${x.unit}`.trim();
  };
  const pick = (list: FlatSensor[], prefer: RegExp[] = []) => { for (const re of prefer) { const x = list.find((y) => re.test(y.name)); if (x) return x; } return list[0]; };
  type Spec = { what: string; list: FlatSensor[]; prefer?: RegExp[]; driver?: boolean; why: string };
  const build = (id: HwCheck['id'], specs: Spec[], stage: string, name?: string): HwCheck => {
    const found: HwCheck['found'] = [], missing: HwCheck['missing'] = [];
    for (const sp of specs) {
      const x = pick(sp.list, sp.prefer);
      if (x) found.push({ what: sp.what, value: fmt(x) });
      else missing.push({ what: sp.what, why: stage || (sp.driver && driverWhy) || sp.why });
    }
    const status: HwCheck['status'] = stage && !found.length ? 'fail' : missing.length ? (stage ? 'fail' : 'warn') : 'ok';
    const detail = !missing.length ? t("Tudo mapeado.") : !found.length ? t("Nenhum dado mapeado.") : t("{0} de {1} dados mapeados.", found.length, specs.length);
    return { id, name, status, detail, found, missing };
  };
  const of = (kind: string, group: string, hwId?: string) => flat.filter((x) => x.kind === kind && x.group === group && (!hwId || x.hwId === hwId));
  const out: HwCheck[] = [];

  // processador
  const cpuHw = hw.find((h) => h.type === 'Cpu');
  out.push(build('cpu', [
    { what: t("Temperatura"), list: of('cpu', 'temp'), prefer: [/package/i, /tctl|tdie/i, /core max/i, /core average/i], driver: true, why: t("O processador não informou a temperatura ao LibreHardwareMonitor.") },
    { what: t("Consumo"), list: of('cpu', 'power'), prefer: [/package/i], driver: true, why: t("Este processador não informa o consumo ao LibreHardwareMonitor.") },
    { what: t("Frequência dos núcleos"), list: of('cpu', 'clock'), prefer: [/^(p-)?core #?1$/i, /core/i], driver: true, why: t("O processador não informou a frequência de cada núcleo.") },
    { what: t("Carga"), list: of('cpu', 'load'), prefer: [/total/i], why: t("O Windows não informou a carga do processador.") },
    { what: t("Tensão"), list: of('cpu', 'volt'), prefer: [/core|vid/i], driver: true, why: t("Este processador não informa a tensão ao LibreHardwareMonitor. Em muitos modelos, a tensão só aparece pela placa-mãe.") },
  ], stageWhy('cpu'), cpuHw?.name));

  // placas de vídeo (uma linha para cada)
  const gpus = hw.filter((h) => /^Gpu/.test(h.type));
  if (!gpus.length) out.push({ id: 'gpu', status: stageWhy('base') ? 'fail' : 'warn', detail: t("Nenhum dado mapeado."), found: [], missing: [{ what: t("Placa de vídeo"), why: stageWhy('base') || t("O LibreHardwareMonitor não encontrou nenhuma placa de vídeo. O driver da placa pode estar desatualizado.") }] });
  for (const h of gpus) {
    const integrated = h.type === 'GpuIntel' && !/arc/i.test(h.name);
    const gpuOf = (group: string) => of('gpu', group, h.id);
    out.push(build('gpu', [
      { what: t("Temperatura"), list: gpuOf('temp').filter((x) => x.value > 0), prefer: [/core|gpu temperature|^gpu$/i], why: integrated ? t("As placas de vídeo integradas da Intel não informam a temperatura. A temperatura delas aparece junto com a do processador.") : t("O driver da placa de vídeo não informou a temperatura.") },
      { what: t("Carga"), list: gpuOf('load'), prefer: [/core|d3d 3d/i], why: t("O driver da placa de vídeo não informou a carga.") },
      { what: t("Memória de vídeo"), list: [...gpuOf('data')].filter((x) => /memory|dedicated|shared/i.test(x.name)), prefer: [/used|dedicated/i], why: t("O driver da placa de vídeo não informou o uso da memória de vídeo.") },
      { what: t("Consumo"), list: gpuOf('power'), prefer: [/package|total|board|gpu power/i], why: integrated ? t("As placas de vídeo integradas não informam o consumo separado. O consumo delas entra no do processador.") : t("O driver da placa de vídeo não informa o consumo.") },
      ...(integrated ? [] : [{ what: t("Ventoinha"), list: of('gpu', 'fan', h.id), why: t("A placa de vídeo não informou a ventoinha. Muitas placas param a ventoinha com pouca carga, e algumas não informam a rotação.") }]),
    ], '', h.name));
  }

  // memória
  out.push(build('ram', [
    { what: t("Uso"), list: [...of('ram', 'load'), ...of('ram', 'data')], prefer: [/^memory$/i, /used/i], why: t("O Windows não informou o uso da memória.") },
    { what: t("Temperatura dos pentes"), list: of('ram', 'temp'), driver: true, why: t("Os pentes de memória não informaram a temperatura. Muitos pentes DDR4 e alguns DDR5 não têm esse sensor.") },
  ], stageWhy('memory')));

  // placa-mãe: os sensores ficam no chip de sensores (SuperIO) ou no controlador embutido (EC)
  const board = hw.find((h) => h.type === 'Motherboard');
  const chip = board?.sub?.find((x) => x.type === 'SuperIO' || x.type === 'EmbeddedController');
  const noChip = t("A placa-mãe não tem um chip de sensores que o LibreHardwareMonitor reconheça, então ela não informa temperaturas, ventoinhas nem tensões.");
  out.push(build('board', [
    { what: t("Temperaturas"), list: of('board', 'temp'), driver: true, why: chip ? t("O chip de sensores {0} não informou temperaturas.", chip.name) : noChip },
    { what: t("Ventoinhas"), list: of('board', 'fan').filter((x) => x.value > 0), driver: true, why: chip ? t("O chip de sensores {0} não informou ventoinhas girando. Elas podem estar ligadas num controlador separado, como um hub de RGB, ou paradas neste momento.", chip.name) : noChip },
    { what: t("Tensões"), list: of('board', 'volt'), driver: true, why: chip ? t("O chip de sensores {0} não informou tensões.", chip.name) : noChip },
  ], stageWhy('motherboard'), board?.name));

  // discos: um item para cada disco
  const disks = hw.filter((h) => h.type === 'Storage');
  const diskFound: HwCheck['found'] = [], diskMissing: HwCheck['missing'] = [];
  for (const d of disks) {
    const x = pick(of('disk', 'temp', d.id).filter((y) => y.value > 0 && y.value < 125), [/^(composite temperature|temperature)$/i]);
    if (x) diskFound.push({ what: d.name, value: fmt(x) });
    else diskMissing.push({ what: d.name, why: t("O disco não informou a temperatura. Discos USB, cartões de memória e controladoras RAID costumam esconder esse dado.") });
  }
  if (!disks.length) diskMissing.push({ what: t("Discos"), why: stageWhy('base') || t("O LibreHardwareMonitor não encontrou nenhum disco.") });
  out.push({ id: 'disk', status: !disks.length && stageWhy('base') ? 'fail' : diskMissing.length ? 'warn' : 'ok', detail: !diskMissing.length ? t("Tudo mapeado.") : t("{0} de {1} discos com temperatura.", diskFound.length, disks.length), found: diskFound, missing: diskMissing });

  // energia: consumo do processador e da placa de vídeo; bateria e fonte quando existem
  const dgpu = gpus.find((h) => h.type !== 'GpuIntel' || /arc/i.test(h.name));
  const battery = hw.find((h) => h.type === 'Battery'), psu = hw.find((h) => h.type === 'Psu');
  out.push(build('power', [
    { what: t("Consumo do processador"), list: of('cpu', 'power'), prefer: [/package/i], driver: true, why: stageWhy('cpu') || t("Este processador não informa o consumo ao LibreHardwareMonitor.") },
    ...(dgpu ? [{ what: t("Consumo da placa de vídeo"), list: of('gpu', 'power', dgpu.id), prefer: [/package|total|board|gpu power/i], why: t("O driver da placa de vídeo não informa o consumo.") }] : []),
    ...(battery ? [{ what: t("Bateria"), list: [...of('battery', 'power'), ...of('battery', 'level')], prefer: [/rate|discharge|charge/i], why: t("A bateria não informou a carga nem o consumo.") }] : []),
    ...(psu ? [{ what: t("Fonte"), list: of('psu', 'power'), why: t("A fonte não informou o consumo.") }] : []),
  ], ''));
  return out;
}

/** Troca o nome do usuário, o nome do computador e a pasta pessoal por textos genéricos. */
function anonymize(text: string): string {
  let out = text;
  const pairs: [string, string][] = [[os.homedir(), '%USERPROFILE%'], [os.userInfo().username, 'usuario'], [os.hostname(), 'computador']];
  for (const [a, b] of pairs) if (a && a.length > 2) out = out.split(a).join(b).replace(new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), b);
  return out;
}
/** Relatório dos sensores em Markdown, sem dados pessoais, para a issue do GitHub. */
export async function report(checks?: HwCheck[]): Promise<string> {
  const s = await snapshot().catch(() => null);
  const list = checks?.length ? checks : await validate();
  const names = (re: RegExp) => (s?.hardware || []).filter((h) => re.test(h.type)).map((h) => h.name).join(', ') || '-';
  // os dois registros: o da tarefa de administrador e o do programa comum (o problema pode estar em qualquer um)
  const tail = (f: string, n: number) => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).slice(-n).join('\n'); } catch { return t("Sem registro."); } };
  let fileAge = '-';
  try { fileAge = t("{0} segundos", Math.round((Date.now() - fs.statSync(DATA).mtimeMs) / 1000)); } catch { /* sem arquivo */ }
  const icon = { ok: '✅', warn: '⚠️', fail: '❌' } as const;
  const body = [
    '### ' + t("O que aconteceu"),
    t("Descreva aqui, se quiser, o que você viu na tela."),
    '',
    '### ' + t("Sistema"),
    `- CleanCode: ${app.getVersion()}`,
    `- Windows: ${os.release()} (${os.arch()})`,
    `- ${t("Processador")}: ${names(/^Cpu$/)}`,
    `- ${t("Placa de vídeo")}: ${names(/^Gpu/)}`,
    `- ${t("Placa-mãe")}: ${names(/^Motherboard$/)}`,
    `- ${t("Administrador")}: ${s ? (s.admin ? t("sim") : t("não")) : '-'}; PawnIO: ${s?.pawnio === undefined ? '-' : s.pawnio ? t("instalado") : t("não instalado")}; ${t("tarefa ativa")}: ${(await advancedActive()) ? t("sim") : t("não")}`,
    `- ${t("Etapas do helper")}: ${s?.groups ? Object.entries(s.groups).map(([k, v]) => `${k}=${v}`).join(', ') : '-'}`,
    `- ${t("Idade do arquivo da tarefa (sensors.json)")}: ${fileAge}`,
    `- ${t("Erro de leitura")}: ${parseError || t("nenhum")}`,
    '',
    '### ' + t("Validação das peças"),
    ...list.flatMap((c) => [
      `- ${icon[c.status]} **${c.id}**${c.name ? ` (${c.name})` : ''}: ${c.detail}`,
      ...c.found.map((f) => `  - ${t("mapeado")}: ${f.what}${f.value ? ` = ${f.value}` : ''}`),
      ...c.missing.map((m) => `  - ${t("não mapeado")}: ${m.what}. ${m.why}`),
    ]),
    '',
    '### ' + t("Registro da tarefa de administrador"),
    '```log',
    tail(logPath(true), 40),
    '```',
    '',
    '### ' + t("Registro do programa comum dos sensores"),
    '```log',
    tail(logPath(false), 40),
    '```',
  ].join('\n');
  return anonymize(body);
}

export async function deactivate() {
  const r = await psAdmin(`Stop-ScheduledTask -TaskName ${psq(TASK)} -ErrorAction SilentlyContinue; Get-Process cc-lhm -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName ${psq(TASK)} -Confirm:$false; Remove-Item -Recurse -Force -ErrorAction SilentlyContinue -Path ${psq(SENSORS_DIR)}`);
  taskInstalled = null;
  return { ok: r.ok, message: r.ok ? t("O monitoramento avançado foi desligado. Você pode remover o driver PawnIO em Aplicativos instalados.") : t("Cancelado") };
}

/**
 * Motivo de o processador ficar sem temperatura e sem consumo (issue #1):
 * - 'driver': o driver PawnIO não está instalado, então o Windows bloqueia a leitura;
 * - 'admin': o driver está instalado, mas o helper não roda como administrador (a tarefa do monitoramento avançado não está ativa);
 * - 'crash': a leitura do processador travou ou caiu neste PC, então o helper deixou o processador de fora por um dia;
 * - 'nodata': o helper não entrega nenhuma leitura (caiu ou travou antes da primeira leitura).
 */
export function cpuBlocked(s: LhmSnapshot | null, flat: FlatSensor[]): 'driver' | 'admin' | 'crash' | 'nodata' | undefined {
  if (helperSilent()) return 'nodata';
  if (!s || !s.hardware) return undefined;
  if (flat.some((x) => x.kind === 'cpu' && (x.group === 'temp' || x.group === 'power'))) return undefined;
  const g = s.groups?.cpu || '';
  if (g === 'timeout' || g === 'skipped' || g.startsWith('error') || s.hardware.some((h) => h.type === 'Cpu' && h.stuck)) return 'crash';
  if (g === 'pending') return undefined;
  if (s.pawnio === false) return 'driver';
  if (!s.admin) return s.pawnio ? 'admin' : 'driver';
  return 'crash';
}

// ---------- conversão para a lista de sensores do app ----------
const COMPONENT: Record<string, string> = { Cpu: 'cpu', GpuNvidia: 'gpu', GpuAmd: 'gpu', GpuIntel: 'gpu', Memory: 'ram', Motherboard: 'board', SuperIO: 'board', EmbeddedController: 'board', Cooler: 'board', Storage: 'disk', Battery: 'battery', Psu: 'psu' };
const GROUP: Record<string, { g: string; unit: string }> = {
  Temperature: { g: 'temp', unit: '°C' }, Voltage: { g: 'volt', unit: 'V' }, Current: { g: 'current', unit: 'A' }, Power: { g: 'power', unit: 'W' }, Clock: { g: 'clock', unit: t("MHz") },
  Load: { g: 'load', unit: '%' }, Fan: { g: 'fan', unit: 'RPM' }, Control: { g: 'control', unit: '%' }, Level: { g: 'level', unit: '%' }, Data: { g: 'data', unit: 'GB' }, SmallData: { g: 'data', unit: 'MB' },
  Throughput: { g: 'throughput', unit: 'B/s' }, Energy: { g: 'energy', unit: t("mWh") }, Frequency: { g: 'clock', unit: t("Hz") }, Factor: { g: 'factor', unit: '' }, TimeSpan: { g: 'time', unit: 's' },
};
export interface FlatSensor { kind: string; group: string; hw: string; hwId: string; name: string; value: number; min?: number; max?: number; unit: string }
export function flatten(s: LhmSnapshot | null): FlatSensor[] {
  const out: FlatSensor[] = [];
  const walk = (h: LhmHardware, parent?: LhmHardware) => {
    const kind = COMPONENT[h.type] || (parent && COMPONENT[parent.type]) || 'board';
    for (const x of h.sensors || []) {
      if (x.value === null || x.value === undefined) continue;
      const g = GROUP[x.type]; if (!g) continue;
      // Sem acesso ao hardware, a biblioteca cria os sensores do processador e da placa, mas devolve 0 sempre (issue #1).
      // Uma temperatura de 0 °C, ou um consumo, uma tensão ou uma frequência que nunca saem de 0, não são leituras reais.
      if (g.g === 'temp' && x.value <= 0) continue;
      if ((kind === 'cpu' || kind === 'board') && ['power', 'volt', 'clock', 'current'].includes(g.g) && x.value === 0 && !x.max) continue;
      // limites de fábrica ("Warning/Critical Temperature" dos SSDs NVMe, "Thermal Sensor High Limit"…) não são leituras
      const group = g.g === 'temp' && /warning|critical|limit|alarm|threshold/i.test(x.name) ? 'limit' : g.g;
      out.push({ kind, group, hw: h.name, hwId: h.id, name: x.name, value: x.value, min: x.min ?? undefined, max: x.max ?? undefined, unit: g.unit });
    }
    (h.sub || []).forEach((c) => walk(c, h));
  };
  (s?.hardware || []).forEach((h) => walk(h));
  return out;
}
