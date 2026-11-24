// Inventário de programas instalados (registro Uninstall + Store/MSIX) com
// heurística de último uso (UserAssist, Prefetch e último acesso do .exe).
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import * as W from './native';
import type { AppEntry } from '../types';
import { t as tr, LOCALE } from '../../i18n';

export type { AppEntry };

const PS_INVENTORY = String.raw`
$ErrorActionPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
function ms($d){ if($d){ [DateTimeOffset]::new($d.ToUniversalTime()).ToUnixTimeMilliseconds() } else { $null } }
$roots=@(
 @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall','HKLM','64'),
 @('HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall','HKLM','32'),
 @('HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall','HKCU','64'),
 @('HKCU:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall','HKCU','32'))
$apps=@(foreach($r in $roots){ Get-ChildItem $r[0] | ForEach-Object { $v=Get-ItemProperty $_.PSPath; if($v.DisplayName){
 [pscustomobject]@{key=$_.PSChildName;hive=$r[1];arch=$r[2];regPath=$_.Name;name=$v.DisplayName;version=$v.DisplayVersion;publisher=$v.Publisher;installDate=$v.InstallDate;size=$v.EstimatedSize;location=$v.InstallLocation;uninstall=$v.UninstallString;quiet=$v.QuietUninstallString;icon=$v.DisplayIcon;system=$v.SystemComponent;parent=$v.ParentKeyName;msi=$v.WindowsInstaller;releaseType=$v.ReleaseType} } } })
$start=@(Get-StartApps | ForEach-Object { [pscustomobject]@{n=$_.Name;id=$_.AppID} })
$appx=@(Get-AppxPackage -PackageTypeFilter Main | Where-Object { -not $_.IsFramework -and $_.SignatureKind -ne 'System' } | ForEach-Object {
 $c=$null; if($_.InstallLocation){ $c=ms((Get-Item -LiteralPath $_.InstallLocation).CreationTime) }
 [pscustomobject]@{name=$_.Name;full=$_.PackageFullName;family=$_.PackageFamilyName;version=$_.Version;publisher=$_.Publisher;location=$_.InstallLocation;nonRemovable=$_.NonRemovable;sig=[string]$_.SignatureKind;created=$c} })
$ua=@(foreach($g in Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist'){ $k=Get-Item -LiteralPath ($g.PSPath+'\Count'); if($k){ foreach($n in $k.GetValueNames()){ $d=$k.GetValue($n); if($d -is [byte[]] -and $d.Length -ge 68){ [pscustomobject]@{n=$n;c=[BitConverter]::ToInt32($d,4);t=[BitConverter]::ToInt64($d,60)} } } } })
$pf=@(Get-ChildItem 'C:\Windows\Prefetch' -Filter *.pf | ForEach-Object { [pscustomobject]@{n=$_.Name;t=ms($_.LastWriteTime)} })
$la=(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem').NtfsDisableLastAccessUpdate
[pscustomobject]@{apps=$apps;appx=$appx;start=$start;ua=$ua;pf=$pf;lastAccess=$la} | ConvertTo-Json -Depth 4 -Compress
`;

export function runPowerShell(script: string, timeout = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    // sem barra de progresso e com erros em texto (e não em CLIXML)
    const enc = Buffer.from(`$ProgressPreference='SilentlyContinue'\n` + script, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-OutputFormat', 'Text', '-EncodedCommand', enc],
      { maxBuffer: 64 * 1024 * 1024, timeout, windowsHide: true, encoding: 'utf8' },
      (err, stdout, stderr) => (err && !stdout ? reject(new Error(cleanPsError(stderr) || err.message)) : resolve(stdout)));
  });
}

/** Extrai a mensagem legível de um erro do PowerShell (inclusive em formato CLIXML). */
export function cleanPsError(s: string): string {
  if (!s) return '';
  if (s.includes('CLIXML')) {
    const parts = [...s.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)].map((m) => m[1]);
    s = parts.join('');
  }
  return s.replace(/_x000D__x000A_/g, ' ').replace(/_x([0-9A-F]{4})_/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s*(No linha|At line|\+ CategoryInfo|\+ FullyQualifiedErrorId)[\s\S]*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function rot13(s: string) {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const b = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b);
  });
}
const KNOWN: Record<string, string> = {
  '{6D809377-6AF0-444B-8957-A3773F02200E}': process.env['ProgramW6432'] || 'C:\\Program Files',
  '{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}': process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  '{F38BF404-1D43-42F2-9305-67DE0B28FC23}': process.env['windir'] || 'C:\\Windows',
  '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}': (process.env['windir'] || 'C:\\Windows') + '\\System32',
  '{D65231B0-B2F1-4857-A4CE-A8E7C6EA7D27}': (process.env['windir'] || 'C:\\Windows') + '\\SysWOW64',
  '{0139D44E-6AFE-49F2-8690-3DAFCAE6FFB8}': (process.env['ProgramData'] || 'C:\\ProgramData') + '\\Microsoft\\Windows\\Start Menu\\Programs',
  '{A77F5D77-2E2B-44C3-A6A2-ABA601054A51}': (process.env['APPDATA'] || '') + '\\Microsoft\\Windows\\Start Menu\\Programs',
  '{9E3995AB-1F9C-4F13-B827-48B24B6C7174}': (process.env['APPDATA'] || '') + '\\Microsoft\\Internet Explorer\\Quick Launch\\User Pinned',
  '{F1B32785-6FBA-4FCF-9D55-7B8E7F157091}': process.env['LOCALAPPDATA'] || '',
  '{5E6C858F-0E22-4760-9AFE-EA3317B67173}': process.env['USERPROFILE'] || '',
};
function expandKnown(p: string) {
  return p.replace(/^\{[0-9A-F-]{36}\}/i, (g) => KNOWN[g.toUpperCase()] ?? g);
}
const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|x64|x86|64-bit|32-bit|version|[\d.]+$/g, '').replace(/[^a-z0-9]/g, '');
const NOISE = /unins|uninst|update|updater|crash|helper|setup|install|elevat|report|squirrel|notif|service/i;

function exeFromCommand(cmd?: string): string | undefined {
  if (!cmd) return;
  let s = cmd.trim();
  if (s.startsWith('"')) { const e = s.indexOf('"', 1); return e > 0 ? s.slice(1, e) : undefined; }
  const m = /^(.*?\.exe)\b/i.exec(s);
  return m ? m[1] : undefined;
}
function iconPath(icon?: string) {
  if (!icon) return;
  let s = icon.trim().replace(/^"|"$/g, '');
  s = s.replace(/,\s*-?\d+$/, '').replace(/^"|"$/g, '');
  return s;
}
function listExes(dir: string, depth = 2, out: string[] = []): string[] {
  if (out.length > 40) return out;
  let ents: fs.Dirent[];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isFile() && /\.exe$/i.test(e.name)) out.push(p);
    else if (e.isDirectory() && depth > 0 && !/^(locales|resources|lang|_?temp)$/i.test(e.name)) listExes(p, depth - 1, out);
  }
  return out;
}
/** Logotipo de um pacote MSIX/Store (Square44x44Logo ou Logo do AppxManifest, na escala que existir). */
function appxLogo(dir?: string): string | undefined {
  if (!dir) return;
  let x = '';
  try { x = fs.readFileSync(path.join(dir, 'AppxManifest.xml'), 'utf8'); } catch { return; }
  const rel = /Square44x44Logo="([^"]+)"/.exec(x)?.[1] || /Square150x150Logo="([^"]+)"/.exec(x)?.[1] || /<Logo>([^<]+)<\/Logo>/.exec(x)?.[1];
  if (!rel) return;
  const full = path.join(dir, rel);
  if (fs.existsSync(full)) return full;
  const d = path.dirname(full), ext = path.extname(full).toLowerCase(), base = path.basename(full, path.extname(full)).toLowerCase();
  let files: string[] = [];
  try { files = fs.readdirSync(d).filter((n) => n.toLowerCase().startsWith(base + '.') && n.toLowerCase().endsWith(ext)); } catch { return; }
  const pick = files.find((n) => /targetsize-(48|64)(?!_altform-lightunplated)/i.test(n) && !/contrast/i.test(n))
    || files.find((n) => /scale-(200|150|100)/i.test(n) && !/contrast/i.test(n)) || files.find((n) => !/contrast/i.test(n));
  return pick ? path.join(d, pick) : undefined;
}

function parseInstallDate(s?: string): number | undefined {
  if (!s) return;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s).trim());
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  const d = Date.parse(s);
  return isNaN(d) ? undefined : d;
}

export async function listApps(): Promise<AppEntry[]> {
  const raw = JSON.parse(await runPowerShell(PS_INVENTORY));
  const arr = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);
  const ua = arr(raw.ua).map((u: any) => {
    const n = expandKnown(rot13(u.n));
    let t = 0;
    try { t = u.t > 0 ? Math.round(Number(u.t) / 10000 - 11644473600000) : 0; } catch { /* */ }
    return { name: n, lower: n.toLowerCase(), count: u.c, time: t };
  }).filter((u: any) => u.time > 0);
  const pf = new Map<string, number>();
  for (const p of arr(raw.pf)) {
    const exe = String(p.n).replace(/-[0-9A-F]{8}\.pf$/i, '').toLowerCase();
    pf.set(exe, Math.max(pf.get(exe) || 0, p.t || 0));
  }
  const lastAccessOn = raw.lastAccess == null ? false : (Number(raw.lastAccess) & 1) === 0;
  const startByFamily = new Map<string, string>();
  for (const s of arr(raw.start)) {
    const id = String(s.id || '');
    const i = id.indexOf('!');
    if (i > 0) startByFamily.set(id.slice(0, i).toLowerCase(), s.n);
  }

  const out: AppEntry[] = [];
  const seen = new Set<string>();
  for (const a of arr(raw.apps)) {
    if (Number(a.system) === 1 || a.parent || /update|hotfix/i.test(a.releaseType || '')) continue;
    if (!a.uninstall && !a.quiet) continue;
    const dedupe = (a.name + '|' + (a.version || '')).toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    let location: string | undefined = a.location ? String(a.location).replace(/^"|"$/g, '').replace(/\\+$/, '') : undefined;
    const icon = iconPath(a.icon);
    if (!location && icon && /\.exe$/i.test(icon)) location = path.dirname(icon);
    if (!location) {
      const ue = exeFromCommand(a.uninstall);
      if (ue && !/msiexec/i.test(ue) && !/\\windows\\/i.test(ue)) location = path.dirname(ue);
    }
    if (location && /^(c:\\windows|c:\\program files( \(x86\))?|c:\\programdata)$/i.test(location)) location = undefined;
    let exes = location ? listExes(location) : [];
    if (icon && /\.exe$/i.test(icon) && !exes.includes(icon)) exes.unshift(icon);
    exes = exes.filter((e) => !NOISE.test(path.basename(e)));
    let installDate = parseInstallDate(a.installDate);
    if (!installDate && location) { try { installDate = fs.statSync(location).birthtimeMs; } catch { /* */ } }
    const e: AppEntry = {
      id: 'reg:' + a.regPath, source: 'win32', name: a.name, version: a.version, publisher: a.publisher,
      installDate, size: a.size ? Number(a.size) * 1024 : undefined, sizeSource: a.size ? 'registro' : undefined,
      location, uninstall: a.uninstall, quiet: a.quiet, icon: icon && fs.existsSync(icon) ? icon : exes[0],
      hive: a.hive, arch: a.arch, regPath: a.regPath, msi: Number(a.msi) === 1 || /msiexec/i.test(a.uninstall || ''),
      canUninstall: true, exes,
    };
    // último uso
    let best = 0, src = '', count = 0;
    const loc = location?.toLowerCase();
    const nn = norm(a.name);
    for (const u of ua) {
      let hit = false;
      if (loc && u.lower.startsWith(loc + '\\')) hit = true;
      else if (u.lower.endsWith('.lnk') && nn.length >= 4) {
        const ln = norm(path.basename(u.name, '.lnk'));
        if (ln.length >= 4 && (ln === nn || nn.startsWith(ln) || ln.startsWith(nn))) hit = true;
      } else if (exes.some((x) => x.toLowerCase() === u.lower)) hit = true;
      if (hit) { count += u.count; if (u.time > best) { best = u.time; src = tr("Histórico do Explorer (UserAssist)"); } }
    }
    for (const x of exes) {
      const t = pf.get(path.basename(x).toLowerCase());
      if (t && t > best) { best = t; src = tr("Prefetch do Windows"); }
    }
    // Obs.: o "último acesso" do .exe não é usado: antivírus, indexador e leitura de ícones
    // atualizam essa data e geram falsos "usado hoje".
    void lastAccessOn;
    if (best) { e.lastUsed = best; e.lastUsedSource = src; e.runCount = count || undefined; }
    // órfão: desinstalador ausente (exceto MSI, que usa o msiexec do sistema)
    const un = exeFromCommand(expandEnv(String(a.uninstall || a.quiet || '')));
    const declaredLoc = a.location ? String(a.location).replace(/^"|"$/g, '').replace(/\\+$/, '') : '';
    // só é órfão se também sumiram a pasta do desinstalador e a pasta declarada (ex.: Steam sem uninstall.exe não é órfão)
    if (un && path.isAbsolute(un) && !/msiexec/i.test(un) && !fs.existsSync(un) && !fs.existsSync(path.dirname(un)) && (!declaredLoc || !fs.existsSync(declaredLoc))) {
      e.orphan = true;
      e.size = undefined; e.sizeSource = undefined; // a pasta não existe: não há espaço a liberar
    }
    out.push(e);
  }

  for (const p of arr(raw.appx)) {
    const fam = String(p.family).toLowerCase();
    const friendly = startByFamily.get(fam);
    const e: AppEntry = {
      id: 'appx:' + p.full, source: 'store', name: friendly || prettifyPkg(p.name), version: p.version, background: !friendly,
      publisher: String(p.publisher || '').replace(/^CN=([^,]+).*$/, '$1'), installDate: p.created || undefined,
      location: p.location, packageFullName: p.full, family: p.family, canUninstall: !p.nonRemovable,
      icon: appxLogo(p.location),
    };
    let best = 0, count = 0;
    for (const u of ua) if (u.lower.startsWith(fam + '!')) { count += u.count; if (u.time > best) best = u.time; }
    if (best) { e.lastUsed = best; e.lastUsedSource = tr("Histórico do Explorer (UserAssist)"); e.runCount = count || undefined; }
    out.push(e);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, LOCALE));
}

function prettifyPkg(n: string) {
  // pacotes sem atalho no Iniciar: mostra o nome do pacote sem o prefixo do fabricante
  return n.replace(/^(Microsoft(Corporation(II)?)?|MicrosoftWindows)\./, '').replace(/\./g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** Divide uma linha de comando em executável + argumentos. */
export function splitCommand(cmd: string): { file: string; args: string } {
  const s = cmd.trim();
  if (s.startsWith('"')) {
    const e = s.indexOf('"', 1);
    return { file: s.slice(1, e), args: s.slice(e + 1).trim() };
  }
  const m = /^(.*?\.(exe|cmd|bat))(\s+|$)(.*)$/i.exec(s);
  if (m) return { file: m[1], args: m[4] || '' };
  const sp = s.indexOf(' ');
  return sp < 0 ? { file: s, args: '' } : { file: s.slice(0, sp), args: s.slice(sp + 1) };
}

const psq = (s: string) => "'" + s.replace(/'/g, "''") + "'";

/** Desinstala um app. Retorna o código de saída. */
export async function uninstallApp(a: AppEntry, silent: boolean): Promise<{ ok: boolean; code: number; message: string }> {
  if (a.source === 'store') {
    if (!a.packageFullName) return { ok: false, code: -1, message: tr("Pacote sem nome completo") };
    try {
      await runPowerShell(`$ErrorActionPreference='Stop'; Remove-AppxPackage -Package ${psq(a.packageFullName)}`, 600000);
      return { ok: true, code: 0, message: tr("Pacote removido") };
    } catch (e: any) {
      return { ok: false, code: -1, message: String(e.message || e).slice(0, 400) };
    }
  }
  const cmd = (silent && a.quiet) || a.uninstall || a.quiet;
  if (!cmd) return { ok: false, code: -1, message: tr("Sem comando de desinstalação") };
  let { file, args } = splitCommand(expandEnv(cmd));
  if (/msiexec(\.exe)?$/i.test(file)) {
    args = args.replace(/\/I\s*\{/i, '/X{');
    if (silent && !/\/q/i.test(args)) args += ' /qb';
  }
  if (!/msiexec(\.exe)?$/i.test(file) && path.isAbsolute(file) && !fs.existsSync(file)) {
    if (a.orphan) return { ok: false, code: -1, message: tr("O desinstalador não existe mais ({0}). Os arquivos já foram removidos. Para apagar a entrada que sobrou, use \"Remover da lista\".", file) };
    return { ok: false, code: -1, message: tr("O desinstalador do programa sumiu ({0} não está em {1}), mas a pasta continua no disco. Reinstale ou repare o programa para recuperar o desinstalador.", path.basename(file), path.dirname(file)) };
  }

  // ShellExecuteEx direto (sem PowerShell): pede o UAC quando o desinstalador exige administrador
  const dir = path.isAbsolute(file) ? path.dirname(file) : undefined;
  const r = await W.shellExecWait(file, args, dir);
  if (r.error) {
    const msg = r.error === 1223 ? tr("Permissão de administrador negada no aviso do Windows (UAC). Tente de novo e clique em \"Sim\".")
      : r.error === 2 || r.error === 3 ? tr("Desinstalador não encontrado: {0}", file)
      : r.error === 740 ? tr("Este desinstalador precisa de permissão de administrador. Abra o CleanCode de novo como administrador e tente outra vez.")
      : tr("O Windows não conseguiu iniciar o desinstalador (erro {0}).", r.error);
    return { ok: false, code: -1, message: msg };
  }

  // Inno Setup/NSIS se copiam para %TEMP% e o processo original fecha na hora:
  // acompanha a cópia temporária e a remoção da chave do registro (até 30 min).
  let gone = a.regPath ? !(await regExists(a.regPath)) : r.code === 0;
  const deadline = Date.now() + 30 * 60000;
  let idle = 0;
  while (!gone && a.regPath && Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, 2000));
    if (!(await regExists(a.regPath))) { gone = true; break; }
    idle = (await uninstallerRunning()) ? 0 : idle + 1;
    if (idle >= 3) break; // nenhum desinstalador rodando há ~6 s: terminou ou foi cancelado
  }
  const c = r.code;
  let message: string;
  if (gone) message = c === 3010 || c === 1641 ? tr("Removido. Reinicie o Windows para terminar.") : tr("Removido");
  else if (c === 1602 || c === 1223) message = tr("Cancelado no assistente do desinstalador");
  else if (c === 0) message = tr("O desinstalador terminou, mas o programa continua registrado. Ele pode ter sido cancelado ou pedir para reiniciar o Windows.");
  else message = tr("O desinstalador terminou com erro (código {0})", c);
  return { ok: gone, code: c, message };
}

/** Remove a entrada do registro de um programa órfão (pede administrador quando está em HKLM). */
export async function removeEntry(a: AppEntry): Promise<{ ok: boolean; message: string }> {
  if (a.source !== 'win32' || !a.regPath) return { ok: false, message: tr("Só entradas do registro podem ser removidas assim") };
  if (!/\\Uninstall\\[^\\]+$/i.test(a.regPath)) return { ok: false, message: tr("Caminho de registro inesperado") };
  const machine = /^HKEY_LOCAL_MACHINE\\/i.test(a.regPath);
  const r = await W.shellExecWait('reg.exe', `delete "${a.regPath}" /f`, undefined, machine ? 'runas' : undefined, true);
  if (r.error === 1223) return { ok: false, message: tr("Permissão de administrador negada no aviso do Windows (UAC)") };
  if (r.error) return { ok: false, message: tr("Não foi possível remover (erro {0})", r.error) };
  const gone = !(await regExists(a.regPath));
  return { ok: gone, message: gone ? tr("Entrada removida da lista de programas") : tr("Não foi possível remover (código {0})", r.code) };
}

function expandEnv(s: string) {
  return s.replace(/%([^%]+)%/g, (m, k) => process.env[k] ?? m);
}
function regExists(key: string): Promise<boolean> {
  return new Promise((res) => execFile('reg.exe', ['query', key], { windowsHide: true }, (err) => res(!err)));
}
/** Há algum processo típico de desinstalador rodando (Inno, NSIS, MSI…)? */
function uninstallerRunning(): Promise<boolean> {
  return new Promise((res) => execFile('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (_e, out) => {
    const names = String(out || '').split(/\r?\n/).map((l) => l.split('","')[0].replace(/^"/, '').toLowerCase());
    res(names.some((n) => /^_iu\w*\.tmp$|^au_\.exe$|^un_[a-z]\.exe$|^unins\d*\.exe$|uninst|^msiexec\.exe$/.test(n)));
  }));
}
