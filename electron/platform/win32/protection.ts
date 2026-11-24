// Proteção no Windows: estado do Microsoft Defender, firewall, UAC e SmartScreen; assinatura
// Authenticode dos itens que iniciam sozinhos e das tarefas agendadas de terceiros; verificação
// rápida do Defender.
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ProtectionApi, SecurityCheck, SignatureInfo, StartupItem, PersistenceExtra } from '../types';
import { t as tr } from '../../i18n';

function ps(script: string, timeout = 60000): Promise<{ out: string; ok: boolean; err: string }> {
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (e, out, err) => resolve({ out: out || '', ok: !e, err: String(err || e?.message || '') })));
}
const psq = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const json = (t: string) => { try { return JSON.parse(t.trim() || 'null'); } catch { return null; } };

const STATUS = String.raw`
$ErrorActionPreference='SilentlyContinue'
$d = Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureAge,AntivirusSignatureLastUpdated,QuickScanAge
$fw = @(Get-NetFirewallProfile | Select-Object Name,Enabled)
$uac = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System').EnableLUA
$ss = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer').SmartScreenEnabled
$av = @(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct | Select-Object -ExpandProperty displayName)
[pscustomobject]@{defender=$d;firewall=$fw;uac=$uac;smartscreen=$ss;av=$av} | ConvertTo-Json -Depth 4 -Compress
`;

async function status(): Promise<SecurityCheck[]> {
  const j = json((await ps(STATUS)).out) || {};
  const d = j.defender;
  const others: string[] = (j.av || []).filter((n: string) => !/defender/i.test(n));
  const fw: any[] = [].concat(j.firewall || []);
  const fwOff = fw.filter((p) => p.Enabled === false || p.Enabled === 0).map((p) => p.Name);
  const age = Number(d?.AntivirusSignatureAge);
  return [
    { id: 'antivirus', name: tr("Antivírus"), critical: true, settingsUrl: 'windowsdefender://threat',
      ok: d ? !!d.AntivirusEnabled || others.length > 0 : others.length ? true : null,
      detail: d?.AntivirusEnabled ? tr("O Microsoft Defender está ativo") : others.length ? tr("Protegido por {0}", others.join(', ')) : tr("Nenhum antivírus ativo encontrado") },
    { id: 'realtime', name: tr("Proteção em tempo real"), critical: true, settingsUrl: 'windowsdefender://threatsettings',
      ok: d ? !!d.RealTimeProtectionEnabled || others.length > 0 : null,
      detail: d?.RealTimeProtectionEnabled ? tr("Os arquivos são verificados quando você abre e baixa") : others.length ? tr("Gerenciada pelo outro antivírus") : tr("Desligada") },
    { id: 'signatures', name: tr("Definições de vírus"), settingsUrl: 'windowsdefender://threat',
      ok: Number.isFinite(age) ? age <= 3 : null,
      detail: Number.isFinite(age) ? (age === 0 ? tr("Atualizadas hoje") : tr("Atualizadas há {0} dia(s)", age)) : tr("Não informado") },
    { id: 'firewall', name: tr("Firewall"), critical: true, settingsUrl: 'windowsdefender://network',
      ok: fw.length ? fwOff.length === 0 : null,
      detail: !fw.length ? tr("Não informado") : fwOff.length ? tr("Desligado nos perfis: {0}", fwOff.join(', ')) : tr("Ligado em todos os perfis de rede") },
    { id: 'uac', name: tr("Controle de Conta de Usuário"), ok: j.uac === undefined || j.uac === null ? null : Number(j.uac) === 1,
      detail: Number(j.uac) === 1 ? tr("Mudanças no sistema pedem confirmação") : tr("Desligado. Assim, os programas mudam o sistema sem perguntar") },
    { id: 'smartscreen', name: tr("SmartScreen"), settingsUrl: 'windowsdefender://appbrowser',
      ok: j.smartscreen ? !/off/i.test(j.smartscreen) : true,
      detail: j.smartscreen && /off/i.test(j.smartscreen) ? tr("Desligado") : tr("Avisa antes de abrir programas desconhecidos") },
  ];
}

const sigCache = new Map<string, SignatureInfo>();
async function signature(file: string): Promise<SignatureInfo> {
  if (!file) return { status: 'unknown' };
  if (sigCache.has(file)) return sigCache.get(file)!;
  let info: SignatureInfo;
  if (!fs.existsSync(file)) info = { status: 'missing' };
  else {
    const j = json((await ps(`$s=Get-AuthenticodeSignature -LiteralPath ${psq(file)}; [pscustomobject]@{st=[string]$s.Status;sub=[string]$s.SignerCertificate.Subject} | ConvertTo-Json -Compress`, 20000)).out);
    const cn = /CN=("?)([^",]+)\1/.exec(j?.sub || '')?.[2];
    info = !j ? { status: 'unknown' }
      : j.st === 'Valid' ? (/Microsoft/i.test(cn || '') ? { status: 'apple', signer: 'Microsoft' } : { status: 'developer', signer: cn })
      : j.st === 'NotSigned' ? { status: 'unsigned' }
      : { status: 'invalid', signer: cn };
  }
  sigCache.set(file, info);
  return info;
}

function executableOf(item: StartupItem): string {
  const d = (item.detail || '').trim();
  if (item.kind === 'folder') return d;
  const expand = (s: string) => s.replace(/%([^%]+)%/g, (m, k) => process.env[k] ?? m);
  if (d.startsWith('"')) return expand(d.slice(1, d.indexOf('"', 1)));
  const m = /^(.*?\.(exe|cmd|bat|com|scr|vbs|js|ps1))(\s|$)/i.exec(d);
  return expand(m ? m[1] : d.split(' ')[0]);
}

async function extraPersistence(): Promise<PersistenceExtra[]> {
  // tarefas agendadas fora da pasta \Microsoft\ que rodam um executável
  const j = json((await ps(String.raw`Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\Microsoft\*' -and $_.State -ne 'Disabled' } | ForEach-Object { foreach($a in $_.Actions){ if($a.Execute){ [pscustomobject]@{name=$_.TaskName;path=$_.TaskPath;exe=[Environment]::ExpandEnvironmentVariables($a.Execute.Trim('"'));args=$a.Arguments} } } } | ConvertTo-Json -Compress`, 60000)).out);
  return [].concat(j || []).map((t: any) => ({ id: `task:${t.path}${t.name}`, name: t.name, path: t.exe, kind: 'task' as const, detail: `${t.exe} ${t.args || ''}`.trim() }));
}

const H = os.homedir();
const LOCAL = process.env.LOCALAPPDATA || path.join(H, 'AppData', 'Local');
const ROAMING = process.env.APPDATA || path.join(H, 'AppData', 'Roaming');

export const protection: ProtectionApi = {
  status, signature, executableOf, extraPersistence,
  browserRoots: () => [
    { browser: 'Google Chrome', root: path.join(LOCAL, 'Google', 'Chrome', 'User Data'), type: 'chromium' },
    { browser: 'Microsoft Edge', root: path.join(LOCAL, 'Microsoft', 'Edge', 'User Data'), type: 'chromium' },
    { browser: 'Brave', root: path.join(LOCAL, 'BraveSoftware', 'Brave-Browser', 'User Data'), type: 'chromium' },
    { browser: 'Vivaldi', root: path.join(LOCAL, 'Vivaldi', 'User Data'), type: 'chromium' },
    { browser: 'Opera', root: path.join(ROAMING, 'Opera Software'), type: 'chromium' },
    { browser: 'Firefox', root: path.join(ROAMING, 'Mozilla', 'Firefox', 'Profiles'), type: 'firefox' },
  ],
  quickScanName: tr("Verificação rápida do Microsoft Defender"),
  async quickScan() {
    const r = await ps('Start-MpScan -ScanType QuickScan; $t = Get-MpThreatDetection | Where-Object { $_.InitialDetectionTime -gt (Get-Date).AddHours(-1) }; @($t).Count', 60 * 60000);
    if (!r.ok) return { ok: false, message: /not recognized|não é reconhecido/i.test(r.err) ? tr("O Microsoft Defender não está disponível. Talvez outro antivírus esteja em uso.") : r.err.slice(0, 200) };
    const n = Number(r.out.trim().split(/\s+/).pop());
    return { ok: true, message: n > 0 ? tr("{0} ameaça(s) encontrada(s). Para ver, abra Segurança do Windows › Proteção contra vírus e ameaças.", n) : tr("Nenhuma ameaça encontrada") };
  },
};
