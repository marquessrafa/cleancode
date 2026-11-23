// Painel da barra de menus / bandeja: junta as leituras do SO (platform/*/metrics) num retrato só,
// calcula taxas (CPU e rede, por diferença entre leituras) e o estado de saúde.
import os from 'os';
import { app, net, nativeImage } from 'electron';
import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs';
import { system, drives } from './platform';
import type { MemoryInfo, BatteryInfo, Temperatures, ConnectedDevice } from './platform';

export interface MetricsSnapshot {
  machine: string;
  os: string;
  at: number;
  cpu: { load: number; cores: number; temperature?: number; user: number; system: number };
  memory: MemoryInfo;
  disk: { root: string; label: string; total: number; free: number } | null;
  battery: BatteryInfo | null;
  temperatures: Temperatures;
  network: { kind: string; iface: string; rxRate: number; txRate: number; rxTotal: number; txTotal: number } | null;
  devices: ConnectedDevice[];
  gpu: { util?: number; temp?: number } | null;
  power: { systemW?: number; batteryW?: number; adapterW?: number } | null;
  health: { level: 'good' | 'fair' | 'attention'; issues: string[] };
}

// ---------- CPU: média de todos os núcleos entre duas leituras ----------
let prevCpu: { idle: number; total: number; user: number; sys: number; at: number } | null = null;
let lastLoad = 0;
let lastSplit = { user: 0, system: 0, idle: 100 };
function cpuTimes() {
  let idle = 0, total = 0, user = 0, sys = 0;
  for (const c of os.cpus()) { const t = c.times; idle += t.idle; user += t.user + t.nice; sys += t.sys + t.irq; total += t.user + t.nice + t.sys + t.irq + t.idle; }
  return { idle, total, user, sys };
}
/** Intervalos curtos demais dão leituras sem sentido (0% ou 100%): abaixo de ~1 s, repete a última. */
function cpuLoad(): number {
  const now = { ...cpuTimes(), at: Date.now() };
  const prev = prevCpu;
  if (prev && now.at - prev.at < 900) return lastLoad;
  prevCpu = now;
  if (!prev || now.total <= prev.total) return lastLoad;
  const dt = now.total - prev.total;
  lastLoad = Math.max(0, Math.min(100, Math.round((1 - (now.idle - prev.idle) / dt) * 100)));
  lastSplit = { user: Math.round(((now.user - prev.user) / dt) * 100), system: Math.round(((now.sys - prev.sys) / dt) * 100), idle: Math.round(((now.idle - prev.idle) / dt) * 100) };
  return lastLoad;
}

// ---------- rede: bytes por segundo ----------
let prevNet: { rx: number; tx: number; at: number; iface: string } | null = null;
let lastRates = { rx: 0, tx: 0 };

function health(s: Omit<MetricsSnapshot, 'health'>): MetricsSnapshot['health'] {
  const issues: string[] = [];
  let score = 0;
  if (s.disk && s.disk.total > 0) {
    const freePct = s.disk.free / s.disk.total;
    if (freePct < 0.05) { score += 2; issues.push('disco quase cheio'); } else if (freePct < 0.15) { score += 1; issues.push('pouco espaço livre'); }
  }
  if (s.memory.level === 'critical' || s.memory.pressure >= 90) { score += 2; issues.push('memória sob pressão'); }
  else if (s.memory.level === 'warn' || s.memory.pressure >= 75) { score += 1; issues.push('memória alta'); }
  const t = s.temperatures.cpu;
  if (t !== undefined) { if (t >= 95) { score += 2; issues.push('CPU muito quente'); } else if (t >= 80) { score += 1; issues.push('CPU quente'); } }
  if (s.battery && !s.battery.plugged && s.battery.percent <= 10) { score += 1; issues.push('bateria baixa'); }
  return { level: score >= 2 ? 'attention' : score === 1 ? 'fair' : 'good', issues };
}

export async function snapshot(): Promise<MetricsSnapshot> {
  const m = system.metrics;
  const [machine, memory, battery, temperatures, counters, devices, live] = await Promise.all([
    m.machineName().catch(() => os.hostname()),
    m.memory(),
    m.battery().catch(() => null),
    m.temperatures().catch((): Temperatures => ({})),
    m.network().catch(() => null),
    m.devices().catch(() => []),
    m.hwLive().catch(() => null),
  ]);
  const now = Date.now();
  let network: MetricsSnapshot['network'] = null;
  if (counters) {
    const p = prevNet;
    const dt = p ? (now - p.at) / 1000 : 0;
    const same = !!p && p.iface === counters.iface;
    if (!same || dt >= 0.9) {
      lastRates = same ? { rx: Math.max(0, (counters.rx - p!.rx) / dt), tx: Math.max(0, (counters.tx - p!.tx) / dt) } : { rx: 0, tx: 0 };
      prevNet = { rx: counters.rx, tx: counters.tx, at: now, iface: counters.iface };
    }
    network = { kind: counters.kind, iface: counters.iface, rxRate: lastRates.rx, txRate: lastRates.tx, rxTotal: counters.rx, txTotal: counters.tx };
  }
  const d = drives().find((x) => x.type === 'Local' && x.total > 0) || null;
  const base = {
    machine, os: system.osName, at: now,
    cpu: { load: cpuLoad(), cores: os.cpus().length, temperature: temperatures.cpu ?? live?.sensors?.find((x) => x.kind === 'cpu')?.value, user: lastSplit.user, system: lastSplit.system },
    memory,
    disk: d ? { root: d.root, label: d.label || d.root, total: d.total, free: d.free } : null,
    battery, temperatures, network, devices,
    gpu: live ? { util: live.gpu.util, temp: live.gpu.temp ?? temperatures.gpu } : null,
    power: live ? { systemW: live.power.systemW, batteryW: live.power.batteryW, adapterW: live.power.adapterW } : null,
  };
  return { ...base, health: health(base) };
}

// ---------- teste de velocidade (servidores públicos da Cloudflare) ----------
export interface SpeedProgress { phase: 'ping' | 'download' | 'upload' | 'done' | 'error'; mbps?: number; ping?: number; download?: number; upload?: number; error?: string }
const SPEED_HOST = 'https://speed.cloudflare.com';

export async function speedTest(onProgress: (p: SpeedProgress) => void): Promise<SpeedProgress> {
  try {
    // latência: menor de 5 requisições vazias
    let ping = Infinity;
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      const r = await net.fetch(`${SPEED_HOST}/__down?bytes=0&r=${Math.random()}`, { cache: 'no-store' } as any);
      await r.arrayBuffer();
      ping = Math.min(ping, performance.now() - t);
    }
    onProgress({ phase: 'ping', ping: Math.round(ping) });

    // download: 25 MB em streaming, com progresso
    const total = 25_000_000;
    let got = 0;
    const t0 = performance.now();
    const res = await net.fetch(`${SPEED_HOST}/__down?bytes=${total}&r=${Math.random()}`, { cache: 'no-store' } as any);
    const reader = (res.body as any).getReader();
    let lastEmit = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      got += value.length;
      const el = (performance.now() - t0) / 1000;
      if (el - lastEmit > 0.15) { lastEmit = el; onProgress({ phase: 'download', mbps: (got * 8) / el / 1e6, ping: Math.round(ping) }); }
    }
    const download = (got * 8) / ((performance.now() - t0) / 1000) / 1e6;
    onProgress({ phase: 'download', mbps: download, ping: Math.round(ping), download });

    // upload: 8 MB
    const body = Buffer.alloc(8_000_000);
    const t1 = performance.now();
    onProgress({ phase: 'upload', mbps: 0, ping: Math.round(ping), download });
    const up = await net.fetch(`${SPEED_HOST}/__up`, { method: 'POST', body, headers: { 'content-type': 'application/octet-stream' } } as any);
    await up.arrayBuffer();
    const upload = (body.length * 8) / ((performance.now() - t1) / 1000) / 1e6;
    const result: SpeedProgress = { phase: 'done', ping: Math.round(ping), download, upload };
    onProgress(result);
    return result;
  } catch (err: any) {
    const r: SpeedProgress = { phase: 'error', error: String(err?.message || err) };
    onProgress(r);
    return r;
  }
}

// ---------- detalhes do painel (ao clicar num cartão) ----------
// ícone do app (o .app mais externo no Mac, o executável no Windows), guardado por nome
const iconCache = new Map<string, string | null>();
async function appIcon(name: string, exe?: string): Promise<string | undefined> {
  if (iconCache.has(name)) return iconCache.get(name) || undefined;
  let icon: string | null = null;
  const target = exe && (/^(.*?\.app)\//.exec(exe)?.[1] || exe);
  if (target) {
    try {
      // no Mac o getFileIcon devolve o ícone genérico de documento para .app; a miniatura do Quick Look traz o ícone do app
      const img = process.platform === 'darwin' ? await nativeImage.createThumbnailFromPath(target, { width: 64, height: 64 }) : await app.getFileIcon(target, { size: 'normal' });
      if (!img.isEmpty()) icon = img.toDataURL();
    } catch { /* sem ícone */ }
  }
  iconCache.set(name, icon);
  return icon || undefined;
}
async function topApps(by: 'cpu' | 'mem', n = 5) {
  const procs = await system.perf.processes().catch(() => []);
  const g = new Map<string, { name: string; cpu: number; mem: number; pids: number[]; exe?: string }>();
  for (const p of procs) { const x = g.get(p.name) || { name: p.name, cpu: 0, mem: 0, pids: [], exe: p.path }; x.cpu += p.cpu; x.mem += p.mem; x.pids.push(p.pid); g.set(p.name, x); }
  const top = [...g.values()].filter((x) => !/^(CleanCode|Electron)$/i.test(x.name)).sort((a, b) => (by === 'cpu' ? b.cpu - a.cpu : b.mem - a.mem)).slice(0, n);
  return Promise.all(top.map(async ({ exe, ...x }) => ({ ...x, icon: await appIcon(x.name, exe) })));
}

// tamanho das pastas principais do disco (em segundo plano, guardado por 10 min)
let storageCache: { at: number; sizes: Record<string, number>; running: boolean; trash?: number } = { at: 0, sizes: {}, running: false };
const TRASH = '__lixeira';
/** sem Acesso Total ao Disco o macOS não deixa ler a Lixeira: melhor não mostrar "0 KB" */
function trashReadable() { try { fs.readdirSync(trashPath()); return true; } catch { return false; } }
function trashPath() {
  if (process.platform === 'darwin') return path.join(os.homedir(), '.Trash');
  return path.join((process.env.SystemDrive || 'C:') + '\\', '$Recycle.Bin');
}
function storageFolders() {
  const keys: [string, string][] = [['Aplicativos', process.platform === 'darwin' ? '/Applications' : (process.env.ProgramFiles || 'C:\\Program Files')], ['Mesa', app.getPath('desktop')], ['Documentos', app.getPath('documents')], ['Transferências', app.getPath('downloads')]];
  return keys;
}
// a última medição fica em disco: depois de reiniciar, o detalhe abre já preenchido enquanto mede de novo
const storageFile = () => path.join(app.getPath('userData'), 'storage-cache.json');
let storageLoaded = false;
function loadStorage() {
  if (storageLoaded) return; storageLoaded = true;
  try { const j = JSON.parse(fs.readFileSync(storageFile(), 'utf8')); if (j && j.sizes) storageCache = { at: 0, sizes: j.sizes, running: false, trash: j.trash }; } catch { /* primeira vez */ }
}
function refreshStorage() {
  loadStorage();
  if (storageCache.running || Date.now() - storageCache.at < 10 * 60000) return;
  storageCache.running = true;
  const items = [...storageFolders().map(([id, p]) => ({ id, path: p })), { id: TRASH, path: trashPath() }];
  const w = new Worker(path.join(__dirname, 'sizeWorker.js'), { workerData: { items } });
  const sizes: Record<string, number> = {};
  let trash: number | undefined;
  if (!storageCache.at && !Object.keys(storageCache.sizes).length) storageCache.sizes = sizes; // sem nada guardado: cada pasta aparece assim que termina
  w.on('message', (m: any) => {
    if (m.done) { storageCache = { at: Date.now(), sizes, running: false, trash }; w.terminate(); try { fs.writeFileSync(storageFile(), JSON.stringify({ sizes, trash })); } catch { /* */ } }
    else if (m.id === TRASH) trash = m.size;
    else sizes[m.id] = m.size;
  });
  w.on('error', () => { storageCache.running = false; });
}

export async function details(kind: string): Promise<any> {
  const m = system.metrics;
  switch (kind) {
    case 'cpu': {
      cpuLoad();
      const [temps, top] = await Promise.all([m.temperatures().catch((): Temperatures => ({})), topApps('cpu')]);
      return { split: lastSplit, load: lastLoad, cores: os.cpus().length, model: os.cpus()[0]?.model, uptime: os.uptime(), temperature: temps.cpu, top };
    }
    case 'memory': {
      const [mem, detail, top] = await Promise.all([m.memory(), m.memoryDetail().catch(() => null), topApps('mem')]);
      return { memory: mem, detail, top };
    }
    case 'battery': {
      const [battery, health, temps] = await Promise.all([m.battery().catch(() => null), m.batteryHealth().catch(() => null), m.temperatures().catch((): Temperatures => ({}))]);
      return { battery, health, temperature: temps.battery };
    }
    case 'storage': {
      refreshStorage();
      const d = drives().find((x) => x.type === 'Local' && x.total > 0) || null;
      const hw = d ? (await system.driveHardware(false).catch(() => [])).find((h) => h.letter === d.root || h.letter === d.root.slice(0, 1)) : undefined;
      return { disk: d && { root: d.root, label: d.label, total: d.total, free: d.free, used: d.used }, categories: storageCache.sizes, trash: trashReadable() ? storageCache.trash : null, computing: storageCache.running, hardware: hw || null, ssd: (await m.temperatures().catch((): Temperatures => ({}))).ssd };
    }
    case 'network': {
      const info = await m.networkInfo().catch(() => ({}));
      return { info };
    }
    case 'gpu': {
      const [info, live, top] = await Promise.all([m.hardware(), m.hwLive(), topApps('cpu', 5)]);
      return { info: info.gpus, live: live.gpu, displays: info.displays, top };
    }
    case 'power': {
      const [live, battery, health, temps] = await Promise.all([m.hwLive(), m.battery().catch(() => null), m.batteryHealth().catch(() => null), m.temperatures().catch((): Temperatures => ({}))]);
      return { power: live.power, battery, health, temperature: temps.battery };
    }
    case 'devices': {
      const [devs] = await Promise.all([m.devices().catch(() => [])]);
      const external = drives().filter((x) => x.type === 'Removível').map((x) => ({ root: x.root, label: x.label || x.root, total: x.total, free: x.free }));
      return { devices: devs, external };
    }
  }
  return null;
}
export const eject = (root: string) => system.metrics.eject(root);

// ---------- monitor de hardware ----------
let prevCores: { idle: number; total: number }[] | null = null;
let lastCores: number[] = [];
function perCore(): number[] {
  const now = os.cpus().map((c) => { const t = c.times; return { idle: t.idle, total: t.user + t.nice + t.sys + t.irq + t.idle }; });
  if (prevCores && prevCores.length === now.length) {
    const fresh = now.map((c, i) => { const dt = c.total - prevCores![i].total; return dt > 0 ? Math.round((1 - (c.idle - prevCores![i].idle) / dt) * 100) : lastCores[i] || 0; });
    if (now.some((c, i) => c.total - prevCores![i].total > 0)) lastCores = fresh;
  }
  prevCores = now;
  return lastCores.length ? lastCores : now.map(() => 0);
}
export const hardwareInfo = () => system.metrics.hardware();
export async function hardwareLive() {
  const m = system.metrics;
  const [live, temps, memory, detail, battery, health] = await Promise.all([
    m.hwLive().catch(() => null), m.temperatures().catch((): Temperatures => ({})), m.memory(), m.memoryDetail().catch(() => null),
    m.battery().catch(() => null), m.batteryHealth().catch(() => null),
  ]);
  return { live, temps, memory, memoryDetail: detail, battery, batteryHealth: health, cores: perCore(), load: cpuLoad(), split: lastSplit, uptime: os.uptime() };
}
