// Leituras do sistema no macOS para o painel da barra de menus.
// Memória: memory_pressure + vm_stat; bateria: pmset; rede: netstat -ib da interface padrão;
// temperatura: helper próprio cc-sensors (IOHID/SMC); dispositivos: system_profiler (Bluetooth).
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { MetricsApi, MemoryInfo, BatteryInfo, Temperatures, NetCounters, ConnectedDevice, MemoryDetail, BatteryHealth, NetworkInfo, HardwareInfo, HwLive } from '../types';

function run(cmd: string, args: string[], timeout = 8000): Promise<string> {
  return new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 }, (_e, out) => resolve(out || '')));
}

/** Caminho do helper de sensores: fora do asar no app empacotado, dist-electron em desenvolvimento. */
function sensorsPath(): string | null {
  const base = path.join(__dirname, 'cc-sensors');
  const candidates = [base.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep), base];
  for (const p of candidates) { try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* */ } }
  return null;
}

let modelName: string | null = null;
async function machineName(): Promise<string> {
  if (modelName) return modelName;
  // "Model Name: MacBook Air" (uma vez por execução; o comando leva ~0,5 s)
  const out = await run('/usr/sbin/system_profiler', ['SPHardwareDataType', '-json'], 15000);
  try { modelName = JSON.parse(out).SPHardwareDataType?.[0]?.machine_name || null; } catch { /* */ }
  if (!modelName) modelName = (await run('/usr/sbin/sysctl', ['-n', 'hw.model'])).trim() || 'Mac';
  return modelName;
}

async function memory(): Promise<MemoryInfo> {
  const total = os.totalmem();
  const [mp, vm, lvl] = await Promise.all([
    run('/usr/bin/memory_pressure', []),
    run('/usr/bin/vm_stat', []),
    run('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']),
  ]);
  const freePct = Number(/free percentage:\s*(\d+)%/.exec(mp)?.[1]);
  const pressure = Number.isFinite(freePct) ? 100 - freePct : Math.round((1 - os.freemem() / total) * 100);
  // usada = ativa + fixa + comprimida (como o Monitor de Atividade chama "Memória usada", aproximadamente)
  const page = Number(/page size of (\d+) bytes/.exec(vm)?.[1]) || 16384;
  const pages = (k: string) => Number(new RegExp(`${k}:\\s+(\\d+)`).exec(vm)?.[1]) || 0;
  const used = (pages('Pages active') + pages('Pages wired down') + pages('Pages occupied by compressor')) * page;
  const l = Number(lvl.trim());
  return { total, used: used || total - os.freemem(), pressure, level: l >= 4 ? 'critical' : l >= 2 ? 'warn' : 'normal' };
}

async function battery(): Promise<BatteryInfo | null> {
  // " -InternalBattery-0 (id=…)	85%; discharging; 4:12 remaining present: true"
  const out = await run('/usr/bin/pmset', ['-g', 'batt']);
  const m = /(\d+)%;\s*([^;]+);\s*([^\n]*)/.exec(out);
  if (!m) return null; // Mac de mesa
  const state = m[2].trim().toLowerCase();
  const time = /(\d+):(\d+) remaining/.exec(m[3]);
  return {
    percent: Number(m[1]),
    charging: state === 'charging',
    plugged: /AC Power/.test(out),
    minutesLeft: time ? Number(time[1]) * 60 + Number(time[2]) : undefined,
  };
}

let tempCache: { at: number; value: Temperatures } | null = null;
async function temperatures(): Promise<Temperatures> {
  if (tempCache && Date.now() - tempCache.at < 3000) return tempCache.value;
  const bin = sensorsPath();
  let value: Temperatures = {};
  if (bin) {
    try {
      const j = JSON.parse(await run(bin, [], 5000));
      value = { cpu: j.cpu, gpu: j.gpu, battery: j.battery, ssd: j.ssd };
    } catch { /* helper indisponível */ }
  }
  tempCache = { at: Date.now(), value };
  return value;
}

let ifaceCache: { at: number; iface: string; kind: string } | null = null;
async function network(): Promise<NetCounters | null> {
  if (!ifaceCache || Date.now() - ifaceCache.at > 30000) {
    const r = await run('/sbin/route', ['-n', 'get', 'default']);
    const iface = /interface:\s*(\S+)/.exec(r)?.[1];
    if (!iface) return null;
    const ports = await run('/usr/sbin/networksetup', ['-listallhardwareports']);
    // "Hardware Port: Wi-Fi\nDevice: en0"
    const block = ports.split(/\n\n/).find((b) => new RegExp(`Device: ${iface}\\b`).test(b)) || '';
    const kind = /Hardware Port: (.+)/.exec(block)?.[1]?.trim() || (iface.startsWith('utun') ? 'VPN' : 'Rede');
    ifaceCache = { at: Date.now(), iface, kind };
  }
  const { iface, kind } = ifaceCache;
  const out = await run('/usr/sbin/netstat', ['-ibn', '-I', iface]);
  // primeira linha <Link#n> da interface: Ibytes e Obytes
  for (const l of out.split('\n')) {
    const c = l.trim().split(/\s+/);
    if (c[0] === iface && c[2]?.startsWith('<Link')) {
      // Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll (Address pode faltar)
      const nums = c.slice(3).filter((x) => /^\d+$/.test(x)).map(Number);
      if (nums.length >= 6) return { rx: nums[nums.length - 5], tx: nums[nums.length - 2], iface, kind };
    }
  }
  return null;
}

let devCache: { at: number; list: ConnectedDevice[] } | null = null;
async function devices(): Promise<ConnectedDevice[]> {
  if (devCache && Date.now() - devCache.at < 30000) return devCache.list;
  const list: ConnectedDevice[] = [];
  try {
    const j = JSON.parse(await run('/usr/sbin/system_profiler', ['SPBluetoothDataType', '-json'], 15000));
    for (const ctl of j.SPBluetoothDataType || []) {
      for (const group of ctl.device_connected || []) {
        for (const [name, info] of Object.entries<any>(group)) {
          const pct = Number(String(info.device_batteryLevelMain || info.device_batteryLevel || '').replace('%', ''));
          list.push({ name, kind: String(info.device_minorType || 'Bluetooth'), battery: Number.isFinite(pct) && pct > 0 ? pct : undefined });
        }
      }
    }
  } catch { /* sem Bluetooth */ }
  devCache = { at: Date.now(), list };
  return list;
}

// ---------- detalhes (abertos ao clicar num cartão do painel) ----------
async function memoryDetail(): Promise<MemoryDetail | null> {
  const [vm, sw] = await Promise.all([run('/usr/bin/vm_stat', []), run('/usr/sbin/sysctl', ['-n', 'vm.swapusage'])]);
  const page = Number(/page size of (\d+) bytes/.exec(vm)?.[1]) || 16384;
  const pages = (k: string) => (Number(new RegExp(`${k}:\\s+(\\d+)`).exec(vm)?.[1]) || 0) * page;
  const mb = (k: string) => { const m = new RegExp(`${k} = ([\\d.]+)M`).exec(sw); return m ? Number(m[1]) * 1048576 : 0; };
  const active = pages('Pages active'), wired = pages('Pages wired down'), compressed = pages('Pages occupied by compressor');
  const total = os.totalmem();
  return { active, wired, compressed, available: Math.max(0, total - active - wired - compressed), swapUsed: mb('used'), swapTotal: mb('total') };
}

let healthCache: { at: number; value: BatteryHealth | null } | null = null;
async function batteryHealth(): Promise<BatteryHealth | null> {
  if (healthCache && Date.now() - healthCache.at < 5 * 60000) return healthCache.value;
  let value: BatteryHealth | null = null;
  try {
    const j = JSON.parse(await run('/usr/sbin/system_profiler', ['SPPowerDataType', '-json'], 15000));
    const b = (j.SPPowerDataType || []).find((x: any) => x._name === 'spbattery_information');
    const h = b?.sppower_battery_health_info;
    if (h) value = { cycles: Number(h.sppower_battery_cycle_count) || undefined, condition: h.sppower_battery_health, maxCapacity: parseInt(h.sppower_battery_health_maximum_capacity, 10) || undefined };
  } catch { /* Mac de mesa */ }
  healthCache = { at: Date.now(), value };
  return value;
}

let netInfoCache: { at: number; value: NetworkInfo } | null = null;
// system_profiler SPAirPortDataType leva ~10 s: cache de 2 min e uma leitura por vez
let netInfoRunning: Promise<NetworkInfo> | null = null;
function networkInfo(): Promise<NetworkInfo> {
  if (netInfoCache && Date.now() - netInfoCache.at < 120000) return Promise.resolve(netInfoCache.value);
  return (netInfoRunning ||= readNetworkInfo().finally(() => { netInfoRunning = null; }));
}
async function readNetworkInfo(): Promise<NetworkInfo> {
  const value: NetworkInfo = {};
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !value.ip) value.ip = a.address;
  const r = await run('/sbin/route', ['-n', 'get', 'default']);
  value.router = /gateway:\s*(\S+)/.exec(r)?.[1];
  try {
    const j = JSON.parse(await run('/usr/sbin/system_profiler', ['SPAirPortDataType', '-json'], 20000));
    for (const itf of j.SPAirPortDataType?.[0]?.spairport_airport_interfaces || []) {
      const c = itf.spairport_current_network_information;
      if (!c) continue;
      value.ssid = c._name; value.phy = c.spairport_network_phymode; value.channel = c.spairport_network_channel; value.signal = c.spairport_signal_noise;
      const sec = String(c.spairport_security_mode || '').replace('spairport_security_mode_', '');
      value.security = sec.replace(/_/g, ' ').toUpperCase().replace('PERSONAL', 'Pessoal').replace('ENTERPRISE', 'Empresarial');
      value.securityLevel = !sec || sec === 'none' ? 'open' : /wep/.test(sec) ? 'weak' : /wpa3/.test(sec) ? 'strong' : /wpa2/.test(sec) ? 'good' : 'weak';
      break;
    }
  } catch { /* sem Wi-Fi */ }
  netInfoCache = { at: Date.now(), value };
  return value;
}

async function eject(root: string) {
  if (!root.startsWith('/Volumes/')) return { ok: false, message: 'Só discos externos podem ser ejetados' };
  const r = await new Promise<{ ok: boolean; err: string }>((resolve) => execFile('/usr/sbin/diskutil', ['eject', root], { timeout: 60000 }, (e, _o, err) => resolve({ ok: !e, err: String(err || e?.message || '') })));
  return r.ok ? { ok: true, message: 'Ejetado com segurança' } : { ok: false, message: /busy|in use/i.test(r.err) ? 'Em uso por algum app: feche os arquivos abertos e tente de novo' : r.err.slice(0, 160) };
}

// ---------- hardware ----------
let hwCache: HardwareInfo | null = null;
async function sysctl(k: string) { return (await run('/usr/sbin/sysctl', ['-n', k], 3000)).trim(); }
async function hardware(): Promise<HardwareInfo> {
  if (hwCache) return hwCache;
  let sp: any = {};
  try { sp = JSON.parse(await run('/usr/sbin/system_profiler', ['SPHardwareDataType', 'SPMemoryDataType', 'SPDisplaysDataType', '-json'], 30000)); } catch { /* */ }
  const hw = sp.SPHardwareDataType?.[0] || {}, mem = sp.SPMemoryDataType?.[0] || {}, gpus = sp.SPDisplaysDataType || [];
  const n = async (k: string) => Number(await sysctl(k)) || undefined;
  const cores = (await n('hw.physicalcpu')) || os.cpus().length;
  const freqMax = await n('hw.cpufrequency_max');
  const modules = Array.isArray(mem._items) && mem._items.length
    ? mem._items.map((m: any) => ({ size: parseFloat(m.dimm_size) * 1073741824 || 0, speed: parseInt(m.dimm_speed, 10) || undefined, manufacturer: m.dimm_manufacturer, part: m.dimm_part_number, slot: m._name }))
    : [{ size: os.totalmem(), manufacturer: mem.dimm_manufacturer, slot: 'Memória unificada' }];
  hwCache = {
    cpu: { name: (await sysctl('machdep.cpu.brand_string')) || hw.chip_type || 'Processador', cores, threads: (await n('hw.logicalcpu')) || os.cpus().length, pCores: await n('hw.perflevel0.physicalcpu'), eCores: await n('hw.perflevel1.physicalcpu'), maxMHz: freqMax ? Math.round(freqMax / 1e6) : undefined, l2: await n('hw.perflevel0.l2cachesize') || await n('hw.l2cachesize'), l3: await n('hw.l3cachesize'), arch: process.arch === 'arm64' ? 'Apple Silicon (ARM64)' : 'Intel (x86-64)' },
    gpus: gpus.map((g: any) => ({ name: g._name || g.sppci_model, cores: parseInt(g.sppci_cores, 10) || undefined, vram: parseInt(g.spdisplays_vram, 10) ? parseInt(g.spdisplays_vram, 10) * 1048576 : undefined, api: String(g.spdisplays_mtlgpufamilysupport || '').replace('spdisplays_metal', 'Metal ').trim() || undefined, vendor: String(g.spdisplays_vendor || 'Apple').replace(/^sppci_vendor_/, '') })),
    memory: { total: os.totalmem(), type: mem.dimm_type || modules[0]?.part, manufacturer: mem.dimm_manufacturer, modules },
    board: { system: hw.machine_name, model: hw.machine_model, version: hw.model_number, firmware: hw.boot_rom_version, chip: hw.chip_type || hw.cpu_type, manufacturer: 'Apple' },
    displays: gpus.flatMap((g: any) => (g.spdisplays_ndrvs || []).map((d: any) => ({ name: d._name, resolution: d._spdisplays_resolution || d.spdisplays_resolution, builtin: d.spdisplays_connection_type === 'spdisplays_internal' }))),
  };
  // núcleos da GPU (Apple Silicon): ioreg
  if (hwCache.gpus[0] && !hwCache.gpus[0].cores) { const c = /"gpu-core-count"\s*=\s*(\d+)/.exec(await run('/usr/sbin/ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], 5000))?.[1]; if (c) hwCache.gpus[0].cores = +c; }
  return hwCache;
}
let liveCache: { at: number; value: HwLive } | null = null;
async function hwLive(): Promise<HwLive> {
  if (liveCache && Date.now() - liveCache.at < 1500) return liveCache.value;
  const [acc, bat, temps] = await Promise.all([run('/usr/sbin/ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], 4000), run('/usr/sbin/ioreg', ['-rn', 'AppleSmartBattery'], 4000), temperatures()]);
  const stat = (k: string) => { const m = new RegExp(`"${k}"=(\\d+)`).exec(acc); return m ? +m[1] : undefined; };
  const num = (k: string) => { const m = new RegExp(`"${k}" = (-?\\d+)`).exec(bat); return m ? +m[1] : undefined; };
  const sysLoad = /"SystemLoad"=(\d+)/.exec(bat)?.[1];
  const adapterW = /"AdapterDetails" = \{[^}]*"Watts"=(\d+)/.exec(bat)?.[1];
  let amp = num('InstantAmperage') ?? num('Amperage');
  if (amp !== undefined && amp > 2 ** 31) amp -= 2 ** 64; // valor sem sinal no ioreg
  const volt = num('Voltage');
  const value: HwLive = {
    gpu: { util: stat('Device Utilization %'), memUsed: stat('In use system memory'), memTotal: os.totalmem(), temp: temps.gpu },
    power: { systemW: sysLoad ? +sysLoad / 1000 : undefined, adapterW: adapterW ? +adapterW : undefined, voltage: volt ? volt / 1000 : undefined, current: amp !== undefined ? amp / 1000 : undefined, batteryW: volt && amp !== undefined ? (volt * amp) / 1e6 : undefined },
    cpuMHz: undefined,
    fans: [],
  };
  liveCache = { at: Date.now(), value };
  return value;
}

export const metrics: MetricsApi = { machineName, memory, battery, temperatures, network, devices, memoryDetail, batteryHealth, networkInfo, eject, hardware, hwLive };
