// Outros programas que também controlam ventoinhas (Armoury Crate, MSI Center, L-Connect, iCUE e outros).
// O CleanCode só aponta um programa quando há prova: o leitor de sensores viu a ventoinha mudar sem o CleanCode mandar
// (a placa "recusou") ou o RPM não seguir o pedido. Abrir um desses programas, sozinho, não gera aviso.
// - board: o programa escreve no chip das ventoinhas da placa-mãe e briga com o CleanCode;
// - usb: o programa controla um hub de ventoinhas pelo USB (o hub só segue a placa-mãe com a sincronização ligada);
// - gpu: o programa controla as ventoinhas da placa de vídeo.
// "Assumir o controle" só existe para serviços que cuidam apenas das ventoinhas; o CleanCode nunca para um serviço que
// também cuida de luzes, de telas de bomba ou de outras funções.
import { app } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { FanRival } from '../types';

interface Entry { id: string; name: string; kind: FanRival['kind']; processes?: string[]; services?: string[]; takeover?: string }
const CATALOG: Entry[] = [
  { id: 'asus', name: 'Armoury Crate (ASUS)', kind: 'board', services: ['AsusFanControlService'], takeover: 'AsusFanControlService' },
  { id: 'msi', name: 'MSI Center', kind: 'board', processes: ['MSI Center', 'MSI.CentralServer', 'MSI_Central_Service'] },
  { id: 'gigabyte', name: 'Gigabyte Control Center', kind: 'board', processes: ['GCC', 'GigabyteControlCenter'] },
  { id: 'fancontrol', name: 'Fan Control', kind: 'board', processes: ['FanControl'] },
  { id: 'argus', name: 'Argus Monitor', kind: 'board', processes: ['ArgusMonitor'] },
  { id: 'speedfan', name: 'SpeedFan', kind: 'board', processes: ['speedfan'] },
  { id: 'lianli', name: 'L-Connect (Lian Li)', kind: 'usb', processes: ['L-Connect 3', 'L-Connect-Service'] },
  { id: 'icue', name: 'iCUE (Corsair)', kind: 'usb', processes: ['iCUE'] },
  { id: 'cam', name: 'NZXT CAM', kind: 'usb', processes: ['NZXT CAM'] },
  { id: 'afterburner', name: 'MSI Afterburner', kind: 'gpu', processes: ['MSIAfterburner'] },
];

function run(cmd: string, args: string[], timeout = 15000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (e, out) => resolve({ ok: !e, out: out || '' })));
}
const ps = (script: string, timeout?: number) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], timeout);
/** Roda um script PowerShell elevado (o Windows pede a permissão de administrador) e espera terminar. */
function psAdmin(script: string) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return ps(`$p = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'; exit $p.ExitCode`, 120000);
}

// serviços parados pelo CleanCode, com o modo de início original, para devolver depois
const TAKEN = () => path.join(app.getPath('userData'), 'fan-takeover.json');
type Taken = Record<string, { service: string; startType: string }>;
const readTaken = (): Taken => { try { return JSON.parse(fs.readFileSync(TAKEN(), 'utf8')); } catch { return {}; } };
const writeTaken = (t: Taken) => { try { fs.writeFileSync(TAKEN(), JSON.stringify(t)); } catch { /* sem registro */ } };

// lista dos processos abertos e dos serviços de cada um (uma chamada só do tasklist), lida no máximo a cada 30 segundos
let cache: { at: number; procs: Set<string>; services: Set<string> } = { at: 0, procs: new Set(), services: new Set() };
let reading: Promise<void> | null = null;
function refresh() {
  if (reading || Date.now() - cache.at < 30000) return;
  reading = run('tasklist.exe', ['/svc', '/fo', 'csv', '/nh']).then(({ out }) => {
    const procs = new Set<string>(), services = new Set<string>();
    for (const line of out.split(/\r?\n/)) {
      const cols = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
      if (!cols[0]) continue;
      procs.add(cols[0].replace(/\.exe$/i, '').toLowerCase());
      for (const s of (cols[2] || '').split(',')) if (s && s !== 'N/A') services.add(s.trim().toLowerCase());
    }
    cache = { at: Date.now(), procs, services };
  }).finally(() => { reading = null; });
}

/**
 * Programas que podem estar brigando pelas ventoinhas. evidence: board, uma ventoinha da placa-mãe mudou sem o CleanCode
 * mandar; usb, o RPM de uma ventoinha da placa-mãe não seguiu o pedido (um hub que não segue a placa); gpu, a ventoinha
 * da placa de vídeo não obedeceu. Os serviços que o CleanCode parou aparecem sempre, para o botão de devolver.
 */
export function rivals(evidence: { board: boolean; usb: boolean; gpu: boolean }): FanRival[] {
  const taken = readTaken();
  const any = evidence.board || evidence.usb || evidence.gpu;
  if (any) refresh();
  const out: FanRival[] = [];
  for (const e of CATALOG) {
    if (taken[e.id]) { out.push({ id: e.id, name: e.name, kind: e.kind, canTakeOver: true, takenOver: true }); continue; }
    if (!any) continue;
    const open = (e.processes || []).some((p) => cache.procs.has(p.toLowerCase())) || (e.services || []).some((s) => cache.services.has(s.toLowerCase()));
    if (!open) continue;
    if (evidence[e.kind]) out.push({ id: e.id, name: e.name, kind: e.kind, canTakeOver: !!e.takeover });
  }
  return out;
}

/** Para o serviço de ventoinhas do programa (on) ou devolve como estava (off). O Windows pede a permissão de administrador. */
export async function takeover(id: string, on: boolean): Promise<{ ok: boolean }> {
  const e = CATALOG.find((x) => x.id === id);
  if (!e?.takeover) return { ok: false };
  const svc = e.takeover.replace(/[^\w.-]/g, '');
  const taken = readTaken();
  if (on) {
    const st = (await ps(`(Get-Service -Name '${svc}' -ErrorAction SilentlyContinue).StartType`)).out.trim() || 'Automatic';
    const r = await psAdmin(`Stop-Service -Name '${svc}' -Force -ErrorAction SilentlyContinue; Set-Service -Name '${svc}' -StartupType Disabled`);
    if (!r.ok) return { ok: false };
    taken[id] = { service: svc, startType: /^(Automatic|Manual|Disabled)$/.test(st) ? st : 'Automatic' };
  } else {
    const start = taken[id]?.startType || 'Automatic';
    const r = await psAdmin(`Set-Service -Name '${svc}' -StartupType ${start}; Start-Service -Name '${svc}' -ErrorAction SilentlyContinue`);
    if (!r.ok) return { ok: false };
    delete taken[id];
  }
  writeTaken(taken);
  cache.at = 0;
  return { ok: true };
}
