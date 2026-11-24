// Identificação do hardware por trás de cada letra de unidade:
// SSD/HD, barramento (NVMe, SATA, USB…), velocidade USB negociada, modelo e fabricante.
import { runPowerShell } from './apps';
import type { DriveHardware } from '../types';
import { brandOf } from '../brands';
import { t as tr } from '../../i18n';

export type { DriveHardware };

// C# embutido (compilado pelo PowerShell): pergunta ao hub USB a velocidade da porta.
const PS = String.raw`
$ErrorActionPreference='SilentlyContinue'
$src = @'
using System; using System.Runtime.InteropServices; using Microsoft.Win32.SafeHandles;
public static class CcUsb {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  static extern SafeFileHandle CreateFile(string n, uint a, uint s, IntPtr sec, uint c, uint f, IntPtr t);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool DeviceIoControl(SafeFileHandle h, uint code, byte[] inb, int inl, byte[] outb, int outl, out int ret, IntPtr ov);
  // retorna "speed;protocols;flags" (speed: 0 low,1 full,2 high,3 super; -1 se falhar)
  public static string Query(string hubPath, int port) {
    using (var h = CreateFile(hubPath, 0x40000000, 2, IntPtr.Zero, 3, 0, IntPtr.Zero)) {
      if (h.IsInvalid) return "-1;0;0";
      int ret; int speed = -1; uint proto = 0, flags = 0;
      var ex = new byte[512]; BitConverter.GetBytes(port).CopyTo(ex, 0);
      if (DeviceIoControl(h, 0x220448, ex, ex.Length, ex, ex.Length, out ret, IntPtr.Zero)) speed = ex[23];
      var v2 = new byte[16]; BitConverter.GetBytes(port).CopyTo(v2, 0); BitConverter.GetBytes(16).CopyTo(v2, 4); BitConverter.GetBytes(7).CopyTo(v2, 8);
      if (DeviceIoControl(h, 0x22045C, v2, 16, v2, 16, out ret, IntPtr.Zero)) { proto = BitConverter.ToUInt32(v2, 8); flags = BitConverter.ToUInt32(v2, 12); }
      return speed + ";" + proto + ";" + flags;
    }
  }
}
'@
try { Add-Type -TypeDefinition $src -Language CSharp } catch {}
function Prop($id, $key) { (Get-PnpDeviceProperty -InstanceId $id -KeyName $key -ErrorAction SilentlyContinue).Data }
$phys = @{}; foreach ($p in Get-PhysicalDisk) { $phys[[string]$p.DeviceId] = $p }
$dd = @{}; foreach ($d in Get-CimInstance Win32_DiskDrive) { $dd[[string]$d.Index] = $d }
$out = @()
foreach ($part in (Get-Partition | Where-Object { $_.DriveLetter })) {
  $n = [string]$part.DiskNumber; $p = $phys[$n]; $d = $dd[$n]; $disk = Get-Disk -Number $part.DiskNumber
  $usb = $null
  if ($d -and ($p.BusType -eq 'USB' -or $d.InterfaceType -eq 'USB' -or $d.PNPDeviceID -like 'USBSTOR*')) {
    # sobe na árvore de dispositivos até o dispositivo USB (USB\VID_...) e lê porta + hub
    $id = $d.PNPDeviceID; $guard = 0
    while ($id -and $id -notlike 'USB\VID_*' -and $guard -lt 6) { $id = Prop $id 'DEVPKEY_Device_Parent'; $guard++ }
    if ($id -like 'USB\VID_*') {
      $loc = [string](Prop $id 'DEVPKEY_Device_LocationInfo'); $hub = Prop $id 'DEVPKEY_Device_Parent'
      $port = 0; if ($loc -match 'Port_#(\d+)') { $port = [int]$Matches[1] }
      $q = '-1;0;0'
      if ($hub -and $port -gt 0) { $path = '\\?\' + ($hub -replace '\\','#') + '#{f18a0e88-c30c-11d0-8815-00a0c906bed8}'; try { $q = [CcUsb]::Query($path, $port) } catch {} }
      $usb = @{ q = $q; name = [string](Prop $id 'DEVPKEY_Device_BusReportedDeviceDesc'); svc = [string](Prop $d.PNPDeviceID 'DEVPKEY_Device_Service') }
    }
  }
  $out += [pscustomobject]@{
    letter = [string]$part.DriveLetter; disk = $n
    media = [string]$p.MediaType; bus = [string]$p.BusType; spindle = $p.SpindleSpeed
    model = [string]($(if ($p.FriendlyName) { $p.FriendlyName } else { $d.Model }))
    manufacturer = [string]$p.Manufacturer; firmware = [string]$p.FirmwareVersion; health = [string]$p.HealthStatus
    size = $p.Size; removable = [bool]($disk.IsBoot -eq $false -and $p.BusType -eq 'USB'); pnp = [string]$d.PNPDeviceID; usb = $usb
  }
}
$out | ConvertTo-Json -Depth 4 -Compress
`;

function vendorFromPnp(pnp: string) {
  const m = /VEN_([^&\\]+)/i.exec(pnp || '');
  const v = m ? m[1].replace(/_/g, ' ').trim() : '';
  // códigos genéricos de barramento não são fabricantes
  return /^(nvme|ata|scsi|usb|generic|mass|storage|disk|raid|sd|mmc|virtual|msft)$/i.test(v) ? '' : v;
}

function usbLabel(q: string): { usb: string; note?: string } {
  const [speedS, protoS, flagsS] = q.split(';');
  const speed = parseInt(speedS, 10), proto = parseInt(protoS, 10) || 0, flags = parseInt(flagsS, 10) || 0;
  const superPlus = (flags & 4) !== 0, superOp = (flags & 1) !== 0, superCap = (flags & 2) !== 0;
  let usb: string;
  if (superPlus) usb = 'USB 3.2 Gen 2 (10 Gbps)';
  else if (superOp || speed === 3) usb = 'USB 3.2 Gen 1 (5 Gbps)';
  else if (speed === 2) usb = 'USB 2.0 (480 Mbps)';
  else if (speed === 1) usb = 'USB 1.1 (12 Mbps)';
  else if (speed === 0) usb = 'USB 1.0 (1,5 Mbps)';
  else usb = 'USB';
  let note: string | undefined;
  if (speed === 2 && superCap) note = tr("O dispositivo suporta USB 3.x, mas está numa porta ou cabo USB 2.0");
  else if (speed === 2 && (proto & 4)) note = tr("A porta suporta USB 3.x, mas o dispositivo é USB 2.0.");
  return { usb, note };
}

let cache: { at: number; data: DriveHardware[] } | null = null;
export async function driveHardware(force = false): Promise<DriveHardware[]> {
  if (!force && cache && Date.now() - cache.at < 60000) return cache.data;
  let raw: any[] = [];
  try { const t = (await runPowerShell(PS, 60000)).trim(); raw = t ? JSON.parse(t) : []; } catch { raw = []; }
  if (!Array.isArray(raw)) raw = [raw];
  const data: DriveHardware[] = raw.map((r) => {
    const busRaw = String(r.bus || '');
    const bus = /nvme/i.test(busRaw) ? 'NVMe' : /sata|ata/i.test(busRaw) ? 'SATA' : /usb/i.test(busRaw) || r.usb ? 'USB'
      : /sas/i.test(busRaw) ? 'SAS' : /raid/i.test(busRaw) ? 'RAID' : /sd|mmc/i.test(busRaw) ? 'SD' : /virtual|file backed/i.test(busRaw) ? 'Virtual' : busRaw || '—';
    const mediaRaw = String(r.media || '');
    let media: DriveHardware['media'] = /ssd/i.test(mediaRaw) ? 'SSD' : /hdd/i.test(mediaRaw) ? 'HD' : 'Desconhecido';
    if (media === 'Desconhecido' && bus === 'NVMe') media = 'SSD';
    if (media === 'Desconhecido' && Number(r.spindle) > 0 && Number(r.spindle) < 0xffffffff) media = 'HD';
    if (media === 'Desconhecido' && /ssd|nvme|flash|solid/i.test(r.model || '')) media = 'SSD';
    const model = String(r.model || '').replace(/\s+/g, ' ').trim() || tr("Dispositivo sem nome");
    const hw: DriveHardware = {
      letter: String(r.letter), media, bus, model,
      brand: brandOf(r.manufacturer, model, r.usb?.name, vendorFromPnp(r.pnp))
        || (r.manufacturer && !/^\(|standard|nvme|^ata$|generic/i.test(r.manufacturer) ? r.manufacturer : vendorFromPnp(r.pnp) || undefined),
      firmware: r.firmware || undefined, health: r.health || undefined, diskSize: Number(r.size) || undefined, removable: !!r.removable,
    };
    if (r.usb) { const u = usbLabel(String(r.usb.q || '-1;0;0')); hw.usb = u.usb; hw.usbNote = u.note; if (/uasp/i.test(r.usb.svc || '')) hw.usb += ' · UASP'; }
    return hw;
  });
  cache = { at: Date.now(), data };
  return data;
}
