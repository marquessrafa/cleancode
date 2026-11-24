// Leituras do sistema no Windows para o painel da bandeja.
// Memória: os; bateria e dispositivos: CIM via PowerShell (com cache); rede: netstat -e;
// temperatura: zona térmica ACPI (costuma exigir administrador; sem leitura, fica vazia).
import { execFile } from 'child_process';
import os from 'os';
import * as Lhm from './lhm';
import type { DiskDetail, MetricsApi, MemoryInfo, BatteryInfo, Temperatures, NetCounters, ConnectedDevice, MemoryDetail, BatteryHealth, NetworkInfo, HardwareInfo, HwLive } from '../types';
import { t as tr, LOCALE } from '../../i18n';

function run(cmd: string, args: string[], timeout = 15000): Promise<string> {
  return new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (_e, out) => resolve(out || '')));
}
const ps = (script: string) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);

let model: string | null = null;
async function machineName(): Promise<string> {
  if (model) return model;
  const out = (await ps('(Get-CimInstance Win32_ComputerSystem).Model')).trim();
  model = out && !/system product name|to be filled/i.test(out) ? out : os.hostname();
  return model;
}

async function memory(): Promise<MemoryInfo> {
  const total = os.totalmem(), used = total - os.freemem();
  const pressure = Math.round((used / total) * 100);
  return { total, used, pressure, level: pressure >= 90 ? 'critical' : pressure >= 75 ? 'warn' : 'normal' };
}

let battCache: { at: number; value: BatteryInfo | null } | null = null;
async function battery(): Promise<BatteryInfo | null> {
  if (battCache && Date.now() - battCache.at < 20000) return battCache.value;
  let value: BatteryInfo | null = null;
  try {
    const t = (await ps('Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus,EstimatedRunTime | ConvertTo-Json -Compress')).trim();
    if (t) {
      const b = JSON.parse(t);
      // BatteryStatus: 1 descarregando, 2 na tomada, 6–9 carregando
      const st = Number(b.BatteryStatus);
      const run = Number(b.EstimatedRunTime);
      value = {
        percent: Number(b.EstimatedChargeRemaining) || 0,
        charging: st >= 6 && st <= 9, plugged: st !== 1,
        minutesLeft: st === 1 && run > 0 && run < 71582788 ? run : undefined,
      };
    }
  } catch { /* desktop sem bateria */ }
  battCache = { at: Date.now(), value };
  return value;
}

let tempCache: { at: number; value: Temperatures } | null = null;
// Temperatura da CPU e da GPU pelo LibreHardwareMonitor (a mesma fonte do AIDA64/HWiNFO).
// A zona térmica ACPI (MSAcpi_ThermalZoneTemperature) não é usada como temperatura da CPU: em muitos PCs ela
// é um sensor da placa, ou um valor fixo (~27,8 °C), e mostrava "28 °C" o tempo todo.
// Sem o monitoramento avançado (driver PawnIO), o Windows não informa a temperatura da CPU: fica em branco.
async function temperatures(): Promise<Temperatures> {
  if (tempCache && Date.now() - tempCache.at < 3000) return tempCache.value;
  const flat = Lhm.flatten(await Lhm.snapshot().catch(() => null));
  const find = (kind: string, res: RegExp[]) => {
    for (const re of res) { const x = flat.find((s) => s.kind === kind && s.group === 'temp' && re.test(s.name) && s.value > 5 && s.value < 125); if (x) return Math.round(x.value * 10) / 10; }
    return undefined;
  };
  const value: Temperatures = {};
  const cpu = find('cpu', [/package/i, /tctl|tdie/i, /core max/i, /core average/i, /^(core|cpu)/i]);
  const gpu = find('gpu', [/gpu core|gpu temperature|^gpu$/i, /hot ?spot/i]);
  if (cpu !== undefined) value.cpu = cpu;
  if (gpu !== undefined) value.gpu = gpu;
  tempCache = { at: Date.now(), value };
  return value;
}

async function network(): Promise<NetCounters | null> {
  // "Bytes   123456   654321" (recebidos, enviados), soma de todas as interfaces
  const out = await run('netstat.exe', ['-e'], 5000);
  const m = /^\s*Bytes\s+(\d+)\s+(\d+)/m.exec(out);
  if (!m) return null;
  return { rx: Number(m[1]), tx: Number(m[2]), iface: 'all', kind: 'Rede' };
}

let devCache: { at: number; list: ConnectedDevice[] } | null = null;
async function devices(): Promise<ConnectedDevice[]> {
  if (devCache && Date.now() - devCache.at < 60000) return devCache.list;
  const list: ConnectedDevice[] = [];
  try {
    const t = (await ps("Get-PnpDevice -Class Bluetooth -PresentOnly -Status OK | Where-Object { $_.FriendlyName -and ($_.InstanceId -like 'BTHENUM*' -or $_.InstanceId -like 'BTHLE*') } | Select-Object -ExpandProperty FriendlyName | ConvertTo-Json -Compress")).trim();
    if (t) {
      const names: string[] = [].concat(JSON.parse(t));
      for (const n of [...new Set(names)]) if (!/enumerator|service|protocol|transport|generic/i.test(n)) list.push({ name: n, kind: 'Bluetooth' });
    }
  } catch { /* sem Bluetooth */ }
  devCache = { at: Date.now(), list };
  return list;
}

async function memoryDetail(): Promise<MemoryDetail | null> {
  const total = os.totalmem(), free = os.freemem();
  let swapUsed = 0, swapTotal = 0;
  try {
    const j = JSON.parse((await ps('Get-CimInstance Win32_PageFileUsage | Measure-Object -Property CurrentUsage,AllocatedBaseSize -Sum | Select-Object Property,Sum | ConvertTo-Json -Compress')).trim() || '[]');
    for (const x of [].concat(j)) { if ((x as any).Property === 'CurrentUsage') swapUsed = Number((x as any).Sum) * 1048576; else swapTotal = Number((x as any).Sum) * 1048576; }
  } catch { /* */ }
  return { active: total - free, wired: 0, compressed: 0, available: free, swapUsed, swapTotal };
}
let healthCache: { at: number; value: BatteryHealth | null } | null = null;
async function batteryHealth(): Promise<BatteryHealth | null> {
  if (healthCache && Date.now() - healthCache.at < 5 * 60000) return healthCache.value;
  let value: BatteryHealth | null = null;
  try {
    const t = (await ps("$f=(Get-CimInstance -Namespace root/wmi BatteryFullChargedCapacity -ErrorAction Stop | Select -First 1).FullChargedCapacity; $d=(Get-CimInstance -Namespace root/wmi BatteryStaticData -ErrorAction Stop | Select -First 1).DesignedCapacity; $c=(Get-CimInstance -Namespace root/wmi BatteryCycleCount -ErrorAction SilentlyContinue | Select -First 1).CycleCount; \"$f $d $c\"")).trim();
    const [f, d, c] = t.split(/\s+/).map(Number);
    if (f && d) { const max = Math.min(100, Math.round((f / d) * 100)); value = { maxCapacity: max, cycles: c || undefined, condition: max >= 80 ? 'Good' : 'Service Recommended' }; }
  } catch { /* desktop */ }
  healthCache = { at: Date.now(), value };
  return value;
}
let netInfoCache: { at: number; value: NetworkInfo } | null = null;
async function networkInfo(): Promise<NetworkInfo> {
  if (netInfoCache && Date.now() - netInfoCache.at < 30000) return netInfoCache.value;
  const value: NetworkInfo = {};
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !value.ip) value.ip = a.address;
  const out = await run('netsh', ['wlan', 'show', 'interfaces'], 8000);
  const get = (k: string) => new RegExp(`^\\s*${k}\\s*:\\s*(.+)$`, 'mi').exec(out)?.[1]?.trim();
  value.ssid = get('SSID');
  const auth = get('Authentication') || get('Autenticação');
  if (auth) { value.security = auth; value.securityLevel = /open|aberta/i.test(auth) ? 'open' : /wep/i.test(auth) ? 'weak' : /wpa3/i.test(auth) ? 'strong' : /wpa2/i.test(auth) ? 'good' : 'weak'; }
  value.phy = get('Radio type') || get('Tipo de rádio');
  value.channel = get('Channel') || get('Canal');
  value.signal = get('Signal') || get('Sinal');
  netInfoCache = { at: Date.now(), value };
  return value;
}
async function eject(root: string) {
  const letter = root.slice(0, 2);
  const out = await ps(`(New-Object -ComObject Shell.Application).Namespace(17).ParseName('${letter}').InvokeVerb('Eject'); Start-Sleep -Seconds 2; if (Test-Path '${letter}\\') { 'still' } else { 'ok' }`);
  return /ok/.test(out) ? { ok: true, message: tr("Ejetado com segurança") } : { ok: false, message: tr("Não foi possível ejetar. Feche os arquivos abertos nesse disco.") };
}

// ---------- hardware ----------
const HW = String.raw`$ErrorActionPreference='SilentlyContinue'
$c=Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed,L2CacheSize,L3CacheSize
$g=@(Get-CimInstance Win32_VideoController | ForEach-Object { $v=$_; $q=$null
  Get-ChildItem 'HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' | ForEach-Object { $p=Get-ItemProperty $_.PSPath; if($p.DriverDesc -eq $v.Name -and $p.'HardwareInformation.qwMemorySize'){ $q=[int64]$p.'HardwareInformation.qwMemorySize' } }
  [pscustomobject]@{name=$v.Name;driver=$v.DriverVersion;ram=$(if($q){$q}else{[int64]$v.AdapterRAM});vendor=$v.AdapterCompatibility;w=$v.CurrentHorizontalResolution;h=$v.CurrentVerticalResolution;hz=$v.CurrentRefreshRate} })
$m=@(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity,ConfiguredClockSpeed,Speed,Manufacturer,PartNumber,DeviceLocator,SMBIOSMemoryType,FormFactor)
$slots=(Get-CimInstance Win32_PhysicalMemoryArray | Measure-Object -Property MemoryDevices -Sum).Sum
$b=Get-CimInstance Win32_BaseBoard | Select-Object -First 1 Manufacturer,Product,Version
$bi=Get-CimInstance Win32_BIOS | Select-Object -First 1 SMBIOSBIOSVersion,ReleaseDate
$cs=Get-CimInstance Win32_ComputerSystem | Select-Object -First 1 Manufacturer,Model,PCSystemType
$ch=@((Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1).ChassisTypes)
$bat=@(Get-CimInstance Win32_Battery).Count
[pscustomobject]@{cpu=$c;gpu=$g;mem=$m;slots=$slots;board=$b;bios=$bi;cs=$cs;chassis=$ch;bat=$bat} | ConvertTo-Json -Depth 4 -Compress`;
const MEMTYPE: Record<number, string> = { 20: 'DDR', 21: 'DDR2', 24: 'DDR3', 26: 'DDR4', 27: 'LPDDR', 28: 'LPDDR2', 29: 'LPDDR3', 30: 'LPDDR4', 34: 'DDR5', 35: 'LPDDR5' };
// notebook: tipo de gabinete portátil (SMBIOS 8, 9, 10, 14, 30, 31, 32), PCSystemType móvel ou bateria presente
const isLaptop = (j: any) => { const ch = (Array.isArray(j.chassis) ? j.chassis : [j.chassis]).map(Number); return ch.some((c: number) => [8, 9, 10, 14, 30, 31, 32].includes(c)) || j.cs?.PCSystemType === 2 || Number(j.bat) > 0; };
let hwCache: HardwareInfo | null = null;
async function hardware(): Promise<HardwareInfo> {
  if (hwCache) return hwCache;
  let j: any = {}; try { j = JSON.parse((await ps(HW)).trim() || '{}'); } catch { /* */ }
  const arr = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);
  const c = j.cpu || {}, mem = arr(j.mem);
  const date = /\/Date\((\d+)\)/.exec(String(j.bios?.ReleaseDate || ''))?.[1];
  hwCache = {
    cpu: { name: String(c.Name || os.cpus()[0]?.model || 'Processador').trim(), cores: c.NumberOfCores || os.cpus().length, threads: c.NumberOfLogicalProcessors || os.cpus().length, maxMHz: c.MaxClockSpeed, baseMHz: c.MaxClockSpeed, l2: c.L2CacheSize ? c.L2CacheSize * 1024 : undefined, l3: c.L3CacheSize ? c.L3CacheSize * 1024 : undefined, arch: process.arch === 'ia32' ? 'x86 (32 bits)' : process.arch === 'arm64' ? 'ARM64' : 'x86-64' },
    gpus: arr(j.gpu).map((g: any) => ({ name: g.name, driver: g.driver, vram: g.ram > 0 ? g.ram : undefined, vendor: g.vendor, api: 'DirectX 12' })),
    memory: { total: os.totalmem(), type: MEMTYPE[mem[0]?.SMBIOSMemoryType], speed: mem[0]?.ConfiguredClockSpeed || mem[0]?.Speed, manufacturer: String(mem[0]?.Manufacturer || '').trim() || undefined, slots: j.slots || undefined,
      modules: mem.map((m: any) => ({ size: Number(m.Capacity) || 0, speed: m.ConfiguredClockSpeed || m.Speed, manufacturer: String(m.Manufacturer || '').trim(), part: String(m.PartNumber || '').trim(), slot: m.DeviceLocator, formFactor: m.FormFactor === 12 ? 'sodimm' as const : m.FormFactor === 8 ? 'dimm' as const : /^LP/.test(MEMTYPE[m.SMBIOSMemoryType] || '') ? 'onboard' as const : undefined })) },
    board: { system: [j.cs?.Manufacturer, j.cs?.Model].filter(Boolean).join(' '), manufacturer: j.board?.Manufacturer, model: j.board?.Product, version: j.board?.Version, firmware: j.bios?.SMBIOSBIOSVersion, firmwareDate: date ? new Date(+date).toLocaleDateString(LOCALE) : undefined, chassis: isLaptop(j) ? 'laptop' : 'desktop' },
    displays: arr(j.gpu).filter((g: any) => g.w).map((g: any) => ({ name: g.name, resolution: `${g.w} x ${g.h}${g.hz ? ` @ ${g.hz}Hz` : ''}` })),
  };
  return hwCache;
}
// GPU por contadores de desempenho (motor 3D de cada processo), frequência atual da CPU,
// potência da bateria (root/wmi) e temperatura da GPU NVIDIA quando o nvidia-smi existe
const LIVE = String.raw`$ErrorActionPreference='SilentlyContinue'
$s=(Get-Counter '\GPU Engine(*engtype_3D)\Utilization Percentage','\GPU Adapter Memory(*)\Dedicated Usage','\Processor Information(_Total)\% Processor Performance','\Thermal Zone Information(*)\Temperature' -ErrorAction SilentlyContinue).CounterSamples
$by=@{}; $mem=0; $perf=$null
$zones=@()
foreach($x in $s){ if($x.Path -like '*thermal zone*'){ $k=[double]$x.CookedValue; if($k -gt 250 -and $k -lt 400){ $zones+=[pscustomobject]@{name=$x.InstanceName;c=[math]::Round($k-273.15,1)} } } elseif($x.Path -like '*gpu engine*'){ if($x.InstanceName -match 'pid_(\d+)'){ $p=[int]$matches[1]; $by[$p]=[double]$by[$p]+$x.CookedValue } } elseif($x.Path -like '*adapter memory*'){ $mem+=$x.CookedValue } else { $perf=$x.CookedValue } }
$procs=@($by.GetEnumerator() | Where-Object { $_.Value -gt 0.5 } | Sort-Object Value -Descending | Select-Object -First 6 | ForEach-Object { [pscustomobject]@{pid=$_.Key;util=[math]::Round($_.Value,1);name=(Get-Process -Id $_.Key).ProcessName} })
$util=[math]::Min(100,($by.Values | Measure-Object -Sum).Sum)
$bs=Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus | Select-Object -First 1 ChargeRate,DischargeRate,Voltage,PowerOnline
$plan=(powercfg /getactivescheme) -join ' '
$t=$null; $nv="$env:SystemRoot\System32\nvidia-smi.exe"; if(Test-Path $nv){ $t=(& $nv --query-gpu=temperature.gpu --format=csv,noheader,nounits | Select-Object -First 1) }
[pscustomobject]@{util=$util;mem=$mem;perf=$perf;procs=$procs;bat=$bs;plan=$plan;temp=$t;zones=$zones} | ConvertTo-Json -Depth 3 -Compress`;
// temperatura de cada disco (SMART/NVMe via contador de confiabilidade). O Windows só entrega com administrador.
const DISKS = String.raw`$ErrorActionPreference='SilentlyContinue'
@(Get-PhysicalDisk | ForEach-Object { $r = $_ | Get-StorageReliabilityCounter; [pscustomobject]@{name=$_.FriendlyName;media=[string]$_.MediaType;bus=[string]$_.BusType;temp=$r.Temperature;max=$r.TemperatureMax} }) | ConvertTo-Json -Compress`;
let diskCache: { at: number; value: { name: string; media: string; bus: string; temp?: number }[] } | null = null;
async function diskTemps() {
  if (diskCache && Date.now() - diskCache.at < 60000) return diskCache.value;
  let j: any = []; try { j = JSON.parse((await ps(DISKS)).trim() || '[]'); } catch { /* */ }
  const value = (Array.isArray(j) ? j : j ? [j] : []).filter((d: any) => d?.name).map((d: any) => ({ name: String(d.name).trim(), media: d.media, bus: d.bus, temp: Number(d.temp) > 0 && Number(d.temp) < 120 ? Number(d.temp) : undefined }));
  diskCache = { at: Date.now(), value };
  return value;
}
// sensores das GPUs (D3DKMT); carregado só aqui para não pesar a inicialização
let gpuSensorsFn: (() => { name: string; temp?: number; fanRPM?: number; powerPct?: number }[]) | null | undefined;
function readGpuSensors() {
  if (gpuSensorsFn === undefined) { try { gpuSensorsFn = require('./gpuperf').gpuSensors; } catch { gpuSensorsFn = null; } }
  try { return gpuSensorsFn ? gpuSensorsFn() : []; } catch { return []; }
}
let isAdminCache: boolean | undefined;
async function amAdmin() {
  if (isAdminCache === undefined) isAdminCache = /True/i.test(await ps('([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'));
  return isAdminCache;
}

let liveCache: { at: number; value: HwLive } | null = null;
let liveRunning: Promise<HwLive> | null = null;
async function hwLive(): Promise<HwLive> {
  if (liveCache && Date.now() - liveCache.at < 2500) return liveCache.value;
  return (liveRunning ||= (async () => {
    let j: any = {}; try { j = JSON.parse((await ps(LIVE)).trim() || '{}'); } catch { /* */ }
    const hw = await hardware().catch(() => null);
    const b = j.bat || {};
    const rate = b.PowerOnline ? b.ChargeRate : -(b.DischargeRate || 0);
    const [disks, admin] = await Promise.all([diskTemps(), amAdmin()]);
    const gpus = readGpuSensors();
    const zones: { name: string; c: number }[] = (Array.isArray(j.zones) ? j.zones : j.zones ? [j.zones] : []).filter((z: any) => z && z.c > 0);
    const gpuTemp = gpus.find((g) => g.temp !== undefined)?.temp ?? (j.temp ? Number(j.temp) : undefined);
    const sensors: NonNullable<HwLive['sensors']> = [
      // zona térmica ACPI: sensor da placa (não é a temperatura da CPU)
      ...zones.map((z, i) => ({ kind: 'board' as const, group: 'temp', name: zones.length > 1 ? tr("Zona térmica ACPI {0}", i + 1) : tr("Zona térmica ACPI"), value: z.c })),
      ...gpus.filter((g) => g.temp !== undefined).map((g) => ({ kind: 'gpu' as const, name: g.name, value: g.temp! })),
      ...(!gpus.some((g) => g.temp !== undefined) && j.temp ? [{ kind: 'gpu' as const, name: hw?.gpus[0]?.name || 'GPU', value: Number(j.temp) }] : []),
      ...disks.filter((d) => d.temp !== undefined).map((d) => ({ kind: 'disk' as const, name: `${d.name}${d.bus ? ` (${d.bus})` : ''}`, value: d.temp! })),
    ];
    // LibreHardwareMonitor (helper incluído): sensores completos, nível AIDA quando o driver está ativo
    const lsnap = await Lhm.snapshot().catch(() => null);
    const flat = Lhm.flatten(lsnap);
    const lhmActive = await Lhm.advancedActive().catch(() => false);
    const pick = (kind: string, group: string, re: RegExp) => flat.find((x) => x.kind === kind && x.group === group && re.test(x.name));
    const cpuClocks = flat.filter((x) => x.kind === 'cpu' && x.group === 'clock' && /^(Core|P-Core|E-Core|CPU Core) ?#?\d+/i.test(x.name)).map((x) => x.value).filter((v) => v > 0);
    const cpuPkgW = pick('cpu', 'power', /Package|CPU Package/i)?.value;
    const gpuW = pick('gpu', 'power', /GPU (Package|Power|Board)|Total/i)?.value;
    const value: HwLive = {
      advanced: { available: !!Lhm.helperPath(), active: lhmActive, source: 'LibreHardwareMonitor', cpuBlocked: Lhm.cpuBlocked(lsnap, flat), logPath: Lhm.logPath(lhmActive) },
      sensors: flat.length ? flat.map((x) => ({ kind: x.kind as any, group: x.group, hw: x.hw, name: x.name, value: x.value, min: x.min, max: x.max, unit: x.unit })) : sensors,
      needsAdmin: !lhmActive && !admin && disks.length > 0 && disks.every((d) => d.temp === undefined) && !flat.some((x) => x.kind === 'disk' && x.group === 'temp') ? tr("A temperatura de {0} só é informada pelo Windows com o app aberto como administrador.", disks.length === 1 ? 'o disco' : `cada um dos ${disks.length} discos`) : undefined,
      gpu: { util: pick('gpu', 'load', /GPU Core|^D3D 3D/i)?.value !== undefined ? Math.round(pick('gpu', 'load', /GPU Core|^D3D 3D/i)!.value) : typeof j.util === 'number' ? Math.round(j.util) : undefined, memUsed: (pick('gpu', 'data', /Memory Used|GPU Memory Used/i)?.value ?? 0) * 1048576 || j.mem || undefined, memTotal: (pick('gpu', 'data', /Memory Total/i)?.value ?? 0) * 1048576 || hw?.gpus[0]?.vram, temp: pick('gpu', 'temp', /GPU Core|GPU Temperature|^GPU$/i)?.value ?? gpuTemp, procs: (Array.isArray(j.procs) ? j.procs : j.procs ? [j.procs] : []).map((p: any) => ({ name: p.name || `PID ${p.pid}`, pid: p.pid, util: p.util })) },
      power: { systemW: cpuPkgW !== undefined ? cpuPkgW + (gpuW || 0) : undefined, batteryW: rate ? rate / 1000 : undefined, voltage: b.Voltage ? b.Voltage / 1000 : undefined, plan: /\(([^)]+)\)\s*$/.exec(String(j.plan || '').trim())?.[1] },
      cpuMHz: cpuClocks.length ? Math.round(cpuClocks.reduce((a, b) => a + b, 0) / cpuClocks.length) : j.perf && hw?.cpu.baseMHz ? Math.round((j.perf / 100) * hw.cpu.baseMHz) : undefined,
      fans: flat.some((x) => x.group === 'fan') ? flat.filter((x) => x.group === 'fan' && x.value > 0).map((x) => ({ name: `${x.name} · ${x.hw}`, rpm: Math.round(x.value) })) : gpus.filter((g) => g.fanRPM).map((g) => ({ name: tr("Ventoinha da {0}", g.name), rpm: g.fanRPM! })),
    };
    liveCache = { at: Date.now(), value };
    return value;
  })().finally(() => { liveRunning = null; }));
}

// ---------- discos físicos ----------
const DISKINFO = String.raw`$ErrorActionPreference='SilentlyContinue'
@(Get-PhysicalDisk | ForEach-Object { $d=$_; $r=$d | Get-StorageReliabilityCounter
  $parts=@(Get-Partition -DiskNumber $d.DeviceId | ForEach-Object { $v=$_ | Get-Volume; [pscustomobject]@{name=$(if($_.DriveLetter){"$($_.DriveLetter):"}else{$_.Type});size=[int64]$_.Size;fs=$v.FileSystem;mount=$v.FileSystemLabel} })
  [pscustomobject]@{id=[string]$d.DeviceId;name=$d.FriendlyName;model=$d.Model;fw=$d.FirmwareVersion;bus=[string]$d.BusType;media=[string]$d.MediaType;size=[int64]$d.Size;health=[string]$d.HealthStatus;spindle=$d.SpindleSpeed;
    temp=$r.Temperature;hours=$r.PowerOnHours;cycles=$r.StartStopCycleCount;wear=$r.Wear;rerr=$r.ReadErrorsTotal;werr=$r.WriteErrorsTotal;parts=$parts} }) | ConvertTo-Json -Depth 4 -Compress`;
async function disks(): Promise<DiskDetail[]> {
  let j: any = []; try { j = JSON.parse((await ps(DISKINFO)).trim() || '[]'); } catch { /* */ }
  const list: any[] = Array.isArray(j) ? j : j ? [j] : [];
  const flat = Lhm.flatten(await Lhm.snapshot().catch(() => null)).filter((x) => x.kind === 'disk');
  // cada disco do LibreHardwareMonitor tem um identificador "/nvme/N" ou "/hdd/N", com N = número do disco
  // físico (o mesmo DeviceId do Get-PhysicalDisk). Dois SSDs iguais têm o mesmo nome: casar pelo nome
  // misturava os sensores dos dois.
  const byId = new Map<string, typeof flat>();
  for (const x of flat) { const k = x.hwId; if (!byId.has(k)) byId.set(k, []); byId.get(k)!.push(x); }
  const idxOf = (id: string) => /\/(\d+)$/.exec(id)?.[1];
  return list.map((d) => {
    const exact = [...byId.entries()].find(([id]) => idxOf(id) === String(d.id))?.[1];
    const mine = exact || flat.filter((x) => d.name && (x.hw.includes(d.name) || d.name.includes(x.hw)));
    const f = (re: RegExp, g?: string) => mine.find((x) => re.test(x.name) && (!g || x.group === g))?.value;
    // temperatura de verdade: a composta do NVMe ("Temperature"/"Composite Temperature") ou o primeiro sensor;
    // os limites "Warning/Critical Temperature" ficam no grupo 'limit'
    const temps = mine.filter((x) => x.group === 'temp' && x.value > 0 && x.value < 125);
    const temp = (temps.find((x) => /^(composite temperature|temperature)$/i.test(x.name)) || temps.find((x) => /^temperature( #?\d+)?$/i.test(x.name)) || temps[0])?.value;
    // vida restante: "Remaining Life" (SATA) ou 100 − "Percentage Used" (NVMe: é o desgaste, começa em 0)
    const remaining = f(/Remaining Life/i, 'level');
    const used = f(/Percentage Used/i, 'level');
    const lifeLeft = remaining ?? (used !== undefined ? Math.max(0, 100 - used) : undefined);
    return {
      id: d.id, name: d.name || d.model || tr("Disco {0}", d.id), model: d.model, firmware: d.fw, bus: d.bus, media: d.media === 'Unspecified' ? undefined : d.media, size: d.size,
      health: d.health === 'Healthy' ? tr("Saudável") : d.health === 'Warning' ? tr("Atenção") : d.health === 'Unhealthy' ? tr("Falhando") : d.health || undefined,
      healthPct: lifeLeft !== undefined ? Math.round(lifeLeft) : typeof d.wear === 'number' ? 100 - d.wear : undefined,
      temp: temp ?? (d.temp > 0 ? d.temp : undefined), powerOnHours: f(/Power.?On Hours/i) ?? (d.hours || undefined), powerCycles: f(/Power Cycle/i) ?? (d.cycles || undefined),
      written: (f(/Data Written|Total Bytes Written|Host Writes/i, 'data') ?? 0) * 1073741824 || undefined, read: (f(/Data Read|Total Bytes Read|Host Reads/i, 'data') ?? 0) * 1073741824 || undefined,
      unsafeShutdowns: f(/Unsafe Shutdown/i), mediaErrors: f(/Media Errors/i), spare: f(/Available Spare$/i),
      partitions: (Array.isArray(d.parts) ? d.parts : d.parts ? [d.parts] : []).map((p: any) => ({ name: p.name, size: p.size, fs: p.fs || undefined, mount: p.mount || undefined })),
      needsAdmin: d.temp == null && !mine.length,
    };
  });
}

export const metrics: MetricsApi = { machineName, memory, battery, temperatures, network, devices, memoryDetail, batteryHealth, networkInfo, eject, hardware, hwLive, disks,
  advancedActivate: () => Lhm.activate(), advancedDeactivate: () => Lhm.deactivate() };
