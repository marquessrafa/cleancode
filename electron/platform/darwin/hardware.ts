// Hardware por trás de cada volume no macOS: SSD/HD, barramento, modelo, saúde (SMART) e
// velocidade USB negociada. Fontes: diskutil info -plist e system_profiler (USB).
import { execFile } from 'child_process';
import type { DriveHardware } from '../types';
import { brandOf } from '../brands';
import { drives } from './native';
import { t as tr } from '../../i18n';

function run(cmd: string, args: string[], input?: string, timeout = 20000): Promise<string> {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 }, (_e, out) => resolve(out || ''));
    if (input !== undefined) { child.stdin?.end(input); }
  });
}

/** Lê um plist (XML) como objeto, via plutil. */
async function plistOf(cmd: string, args: string[]): Promise<any> {
  const xml = await run(cmd, args);
  if (!xml.trim()) return null;
  const json = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], xml);
  try { return JSON.parse(json); } catch { return null; }
}
const diskInfo = (id: string) => plistOf('/usr/sbin/diskutil', ['info', '-plist', id]);

function busOf(p: string): string {
  if (/apple fabric|pci/i.test(p)) return 'NVMe'; // SSD interno da Apple e NVMe em PCIe
  if (/thunderbolt/i.test(p)) return 'Thunderbolt';
  if (/usb/i.test(p)) return 'USB';
  if (/sata|ata/i.test(p)) return 'SATA';
  if (/secure digital|sd/i.test(p)) return 'SD';
  if (/disk image|virtual/i.test(p)) return 'Virtual';
  if (/sas/i.test(p)) return 'SAS';
  return p || '—';
}

// ---------- USB ----------
interface UsbNode { name: string; vendor: string; speed: string; bsd: string[] }
function usbNodes(tree: any): UsbNode[] {
  const out: UsbNode[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const bsd: string[] = [];
    // formato antigo (SPUSBDataType): Media[].bsd_name; procura em qualquer nível abaixo do dispositivo
    const collect = (x: any) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(collect); return; }
      if (typeof x.bsd_name === 'string') bsd.push(x.bsd_name);
      for (const k of Object.keys(x)) if (k !== '_items') collect(x[k]);
    };
    collect(n);
    const speed = n.USBDeviceKeyLinkSpeed || n.device_speed || n.link_speed || '';
    if (n._name && speed) out.push({ name: String(n._name), vendor: String(n.USBDeviceKeyVendorName || n.manufacturer || ''), speed: String(speed), bsd });
    if (n._items) walk(n._items);
  };
  walk(tree);
  return out;
}
let usbCache: { at: number; nodes: UsbNode[] } | null = null;
async function usbTree(): Promise<UsbNode[]> {
  if (usbCache && Date.now() - usbCache.at < 30000) return usbCache.nodes;
  const nodes: UsbNode[] = [];
  for (const t of ['SPUSBHostDataType', 'SPUSBDataType']) {
    const txt = await run('/usr/sbin/system_profiler', [t, '-json'], undefined, 30000);
    try { nodes.push(...usbNodes(JSON.parse(txt)[t])); } catch { /* tipo inexistente nesta versão do macOS */ }
  }
  usbCache = { at: Date.now(), nodes };
  return nodes;
}
function usbLabel(speed: string): string {
  const s = speed.toLowerCase();
  if (/20 ?gb|super_speed_plus_by2/.test(s)) return 'USB 3.2 Gen 2x2 (20 Gbps)';
  if (/40 ?gb/.test(s)) return 'USB4 (40 Gbps)';
  if (/10 ?gb|super_speed_plus/.test(s)) return 'USB 3.2 Gen 2 (10 Gbps)';
  if (/5 ?gb|super_speed/.test(s)) return 'USB 3.2 Gen 1 (5 Gbps)';
  if (/480 ?mb|high_speed/.test(s)) return 'USB 2.0 (480 Mbps)';
  if (/12 ?mb|full_speed/.test(s)) return 'USB 1.1 (12 Mbps)';
  if (/1\.5 ?mb|low_speed/.test(s)) return 'USB 1.0 (1,5 Mbps)';
  return 'USB';
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
function findUsb(nodes: UsbNode[], diskId: string, model: string): UsbNode | undefined {
  const byBsd = nodes.find((n) => n.bsd.some((b) => b === diskId || b.startsWith(diskId + 's')));
  if (byBsd) return byBsd;
  // formato novo não liga o dispositivo ao disco: compara o nome do produto com o modelo do disco
  const m = norm(model);
  if (m.length < 4) return undefined;
  return nodes.find((n) => { const a = norm(n.name), b = norm(n.vendor + n.name); return (a.length >= 4 && (m.includes(a) || a.includes(m))) || (b.length >= 4 && m.includes(b)); });
}

// ---------- unidades ----------
let cache: { at: number; data: DriveHardware[] } | null = null;
export async function driveHardware(force = false): Promise<DriveHardware[]> {
  if (!force && cache && Date.now() - cache.at < 60000) return cache.data;
  const list = await Promise.all(drives().filter((d) => d.type !== 'Rede').map(async (d): Promise<DriveHardware | null> => {
    const vol = await diskInfo(d.root);
    if (!vol) return null;
    // volume APFS → armazenamento físico (disk0s2) → disco inteiro (disk0)
    const store: string = vol.APFSPhysicalStores?.[0]?.APFSPhysicalStore || vol.ParentWholeDisk || vol.DeviceIdentifier || '';
    const wholeId = /^(disk\d+)/.exec(store)?.[1] || store;
    const whole = (wholeId && (await diskInfo(wholeId))) || vol;
    const bus = busOf(String(whole.BusProtocol || vol.BusProtocol || ''));
    const model = String(whole.MediaName || vol.MediaName || '').replace(/\s+Media$/i, '').replace(/\s+/g, ' ').trim() || d.label || tr("Dispositivo sem nome");
    const ssd = whole.SolidState ?? vol.SolidState;
    const media: DriveHardware['media'] = ssd === true ? 'SSD' : ssd === false && bus !== 'USB' && bus !== 'Virtual' ? 'HD' : 'Desconhecido';
    const smart = String(whole.SMARTStatus || vol.SMARTStatus || '');
    const hw: DriveHardware = {
      letter: d.root, media, bus, model,
      brand: brandOf(model, String(whole.IORegistryEntryName || '')) || (bus === 'NVMe' && whole.Internal ? 'Apple' : undefined),
      health: smart === 'Verified' ? 'Healthy' : smart && !/not supported/i.test(smart) ? smart : undefined,
      diskSize: Number(whole.TotalSize || whole.Size) || undefined,
      removable: !!(whole.RemovableMediaOrExternalDevice || whole.Removable || whole.Internal === false),
    };
    if (bus === 'USB') {
      const u = findUsb(await usbTree(), wholeId, model);
      if (u) { hw.usb = usbLabel(u.speed); if (!hw.brand) hw.brand = brandOf(u.vendor, u.name) || u.vendor || undefined; }
    }
    return hw;
  }));
  const data = list.filter((x): x is DriveHardware => !!x);
  cache = { at: Date.now(), data };
  return data;
}
