// Integração com o Windows (processo principal).
import { app, nativeImage } from 'electron';
import { execFile, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { SystemApi, MonitorEvent } from '../types';
import { listApps, uninstallApp, removeEntry } from './apps';
import { driveHardware } from './hardware';
import { metrics } from './metrics';
import { junk } from './junk';
import { perf } from './perf';
import { repairs } from './repairs';
import { game } from './game';
import { protection } from './protection';
import { t } from '../../i18n';

// ---------- registro ----------
function regOk(args: string[]): Promise<boolean> {
  return new Promise((res) => execFile('reg.exe', args, { windowsHide: true }, (err) => res(!err)));
}
function regOut(args: string[]): Promise<string> {
  return new Promise((res) => execFile('reg.exe', args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (_e, out) => res(out || '')));
}
async function subkeys(key: string): Promise<string[]> {
  const out = await regOut(['query', key]);
  return out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.toUpperCase().startsWith(key.toUpperCase().replace(/^HKLM/, 'HKEY_LOCAL_MACHINE').replace(/^HKCU/, 'HKEY_CURRENT_USER') + '\\'));
}
async function values(key: string): Promise<Record<string, string>> {
  const out = await regOut(['query', key]);
  const r: Record<string, string> = {};
  for (const l of out.split(/\r?\n/)) {
    const m = /^\s{2,}(\S.*?)\s{2,}REG_\w+\s{2,}(.*)$/.exec(l);
    if (m) r[m[1]] = m[2].trim();
  }
  return r;
}

// ---------- monitor de programas ----------
const UNINSTALL_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];
// pacotes Store/MSIX do usuário (legível sem administrador)
const APPX_KEY = 'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages';

async function installedAppKeys(): Promise<Set<string>> {
  const all = new Set<string>();
  for (const k of [...UNINSTALL_KEYS, APPX_KEY]) for (const s of await subkeys(k)) all.add(s);
  return all;
}
async function describeInstalledApp(key: string): Promise<MonitorEvent> {
  const v = await values(key);
  const isAppx = key.toUpperCase().includes('APPMODEL\\REPOSITORY');
  let name = v.DisplayName || '';
  if (!name || name.startsWith('@') || name.startsWith('ms-resource')) {
    const pkg = key.split('\\').pop() || '';
    name = (isAppx ? pkg.split('_')[0] : pkg).replace(/^(Microsoft(Corporation(II)?)?)\./, '').replace(/\./g, ' ');
  }
  const loc = (v.InstallLocation || v.PackageRootFolder || '').replace(/^"|"$/g, '');
  const drive = /^[a-zA-Z]:/.test(loc) ? loc.slice(0, 2).toUpperCase() : 'C:';
  const kb = parseInt(v.EstimatedSize || '', 16);
  return { kind: 'app', title: t("Novo programa instalado"), drive, amount: isNaN(kb) ? 0 : kb * 1024, detail: name, app: { key, name } };
}

// ---------- menu de contexto do Explorer ----------
const CTX_KEYS = ['Directory\\shell\\CleanCode', 'Drive\\shell\\CleanCode', 'Directory\\Background\\shell\\CleanCode'];
const CTX_PROBE = 'HKCU\\Software\\Classes\\Directory\\shell\\CleanCode';

/** Janelinha de instalação (WPF): espera o app fechar, roda o instalador silencioso e reabre o app no fim. */
/** Textos da janela de instalação no idioma do app, em JSON e base64 (o script do PowerShell lê o parâmetro -Texts). */
const updateTexts = () => Buffer.from(JSON.stringify({
  top: t("Atualizando o CleanCode"), head: t("Instalando a versão {0}"), sub: t("Não desligue o computador. O CleanCode abre de novo sozinho quando terminar."),
  done: t("Atualizado para a versão {0}"), opening: t("Abrindo o CleanCode…"), fail: t("Não foi possível atualizar"),
  failSub: t("O CleanCode vai abrir na versão atual."), canceled: t("A instalação foi cancelada."), code: t("O instalador terminou com o código {0}."),
}), 'utf8').toString('base64');

const UPDATE_PS1 = String.raw`param([int]$ParentPid, [string]$Installer, [string]$InstArgs, [string]$Exe, [string]$Version, [string]$Accent, [string]$Dark, [string]$Texts)
$ErrorActionPreference = 'Stop'
$started = $false
try {
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
$bg = if ($Dark -eq '1') { '#F2161A1F' } else { '#F7FFFFFF' }
$fg = if ($Dark -eq '1') { '#FFFFFFFF' } else { '#FF15171B' }
$muted = if ($Dark -eq '1') { '#FF9AA0A8' } else { '#FF5F6670' }
$track = if ($Dark -eq '1') { '#22FFFFFF' } else { '#1A000000' }
$xaml = @"
<Window xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml'
  WindowStyle='None' AllowsTransparency='True' Background='Transparent' Width='460' Height='250' ResizeMode='NoResize'
  WindowStartupLocation='CenterScreen' Topmost='True' ShowInTaskbar='True' Title='CleanCode'>
  <Border CornerRadius='18' Background='$bg' BorderBrush='#33FFFFFF' BorderThickness='1' Padding='30,26'>
    <Border.Effect><DropShadowEffect BlurRadius='30' ShadowDepth='6' Opacity='0.45'/></Border.Effect>
    <StackPanel>
      <StackPanel Orientation='Horizontal'>
        <Border Width='34' Height='34' CornerRadius='9' Background='$Accent'><TextBlock Text='&#x2191;' Foreground='White' FontSize='20' FontWeight='Bold' HorizontalAlignment='Center' VerticalAlignment='Center'/></Border>
        <TextBlock x:Name='Top' Text='Atualizando o CleanCode' Foreground='$muted' FontSize='13' Margin='12,0,0,0' VerticalAlignment='Center'/>
      </StackPanel>
      <TextBlock x:Name='Head' Text='Instalando a versão $Version' Foreground='$fg' FontSize='21' FontWeight='SemiBold' Margin='0,16,0,0'/>
      <TextBlock x:Name='Sub' Text='Não desligue o computador. O CleanCode reabre sozinho quando terminar.' Foreground='$muted' FontSize='13' TextWrapping='Wrap' Margin='0,6,0,20'/>
      <ProgressBar x:Name='Bar' IsIndeterminate='True' Height='6' Foreground='$Accent' Background='$track' BorderThickness='0'/>
    </StackPanel>
  </Border>
</Window>
"@
$win = [Windows.Markup.XamlReader]::Parse($xaml)
$title = $win.FindName('Head'); $sub = $win.FindName('Sub'); $bar = $win.FindName('Bar')
# textos no idioma do app (JSON em base64); sem eles, ficam os textos em português
$T = $null; try { $T = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Texts)) | ConvertFrom-Json } catch {}
function L([string]$k, [string]$d) { if ($T -and $T.$k) { [string]$T.$k } else { $d } }
$win.FindName('Top').Text = (L 'top' 'Atualizando o CleanCode')
$title.Text = (L 'head' 'Instalando a versão {0}') -f $Version
$sub.Text = (L 'sub' 'Não desligue o computador. O CleanCode abre de novo sozinho quando terminar.')
$win.Add_MouseLeftButtonDown({ $win.DragMove() })
$script:phase = 'wait'; $script:proc = $null; $script:t0 = Get-Date; $script:closeAt = $null
$finish = {
  param($ok, $msg)
  $bar.IsIndeterminate = $false; $bar.Value = 100
  if ($ok) { $title.Text = (L 'done' 'Atualizado para a versão {0}') -f $Version; $sub.Text = (L 'opening' 'Abrindo o CleanCode…') }
  else { $title.Text = (L 'fail' 'Não foi possível atualizar'); $sub.Text = $msg + ' ' + (L 'failSub' 'O CleanCode vai abrir na versão atual.') }
  try { Start-Process -FilePath $Exe -ArgumentList '--updated' } catch {}
  $script:closeAt = (Get-Date).AddSeconds($(if ($ok) { 2 } else { 6 }))
  $script:phase = 'done'
}
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(400)
$timer.Add_Tick({
  if ($script:phase -eq 'wait') {
    $alive = Get-Process -Id $ParentPid -ErrorAction SilentlyContinue
    if (-not $alive -or ((Get-Date) - $script:t0).TotalSeconds -gt 30) {
      try { $script:proc = Start-Process -FilePath $Installer -ArgumentList $InstArgs -PassThru; $script:phase = 'install'; $script:started = $true }
      catch { & $finish $false (L 'canceled' 'A instalação foi cancelada.') }
    }
  } elseif ($script:phase -eq 'install') {
    if ($script:proc.HasExited) {
      if ($script:proc.ExitCode -eq 0) { & $finish $true '' } else { & $finish $false ((L 'code' 'O instalador terminou com o código {0}.') -f $script:proc.ExitCode) }
    }
  } elseif ($script:phase -eq 'done' -and (Get-Date) -ge $script:closeAt) {
    $timer.Stop(); $win.Close()
  }
})
$timer.Start()
[void]$win.ShowDialog()
} catch {
  # plano B: sem a janelinha (WPF indisponível, erro inesperado), instala do jeito clássico, que reabre o app sozinho
  if (-not $script:started) {
    $i = 0; while ((Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) -and $i -lt 75) { Start-Sleep -Milliseconds 400; $i++ }
    try { Start-Process -FilePath $Installer -ArgumentList ('--force-run ' + $InstArgs) } catch { try { Start-Process -FilePath $Exe } catch {} }
  }
}
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
`;

const win32: SystemApi = {
  osName: 'Windows',
  fileManager: 'Explorer',
  canElevate: true,

  relaunchAsAdmin(extra) {
    const args = [...process.argv.slice(1), ...extra].filter((a) => a !== '--cc-elevated');
    const argList = [...args, '--cc-elevated'].map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
    const cmd = `Start-Process -FilePath '${process.execPath.replace(/'/g, "''")}' -Verb RunAs` + (argList ? ` -ArgumentList ${argList}` : '');
    execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true }, (err) => {
      if (!err) app.exit(0);
    });
  },

  windowChrome: (c) => ({ titleBarStyle: 'hidden', titleBarOverlay: { color: c.color, symbolColor: c.symbolColor, height: 40 } }),
  setTitleBarColors(win, c) {
    try { win.setTitleBarOverlay({ ...c, height: 40 }); } catch { /* */ }
  },
  trayImage(baseDir) {
    const img = nativeImage.createFromPath(path.join(baseDir, 'build', 'icon.ico'));
    return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 });
  },
  popupCorner: 'bottom-right',

  fullDiskAccess: () => null,
  openFullDiskAccessSettings() { /* não se aplica */ },

  showProperties(p) {
    // abre a caixa de propriedades do Explorer
    const dir = path.dirname(p), name = path.basename(p);
    const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
    execFile('powershell.exe', ['-NoProfile', '-STA', '-Command',
      `$s=New-Object -ComObject Shell.Application; $f=$s.Namespace(${q(dir)}).ParseName(${q(name)}); $f.InvokeVerb('properties'); Start-Sleep -Seconds 60`], { windowsHide: true });
  },

  contextMenu: {
    supported: true,
    status: () => regOk(['query', CTX_PROBE]),
    async set(enable, { exe, packaged, appDir }) {
      for (const k of CTX_KEYS) {
        const key = 'HKCU\\Software\\Classes\\' + k;
        if (enable) {
          const arg = k.includes('Background') ? '%V' : '%1';
          await regOk(['add', key, '/ve', '/d', t("Analisar com CleanCode"), '/f']);
          await regOk(['add', key, '/v', 'Icon', '/d', `"${exe}",0`, '/f']);
          const cmd = packaged ? `"${exe}" "${arg}"` : `"${exe}" "${appDir}" "${arg}"`;
          await regOk(['add', key + '\\command', '/ve', '/d', cmd, '/f']);
        } else {
          await regOk(['delete', key, '/f']);
        }
      }
      return regOk(['query', CTX_PROBE]);
    },
  },

  listApps,
  appLeftovers: async () => [],
  uninstallApp,
  removeEntry,
  driveHardware,
  installedAppKeys,
  describeInstalledApp,
  setBackgroundMode() { /* a barra de tarefas some sozinha com a janela escondida */ },

  metrics,
  junk,
  perf,
  repairs,
  game,
  protection,

  loginItem: {
    set: (open) => app.setLoginItemSettings({ openAtLogin: open, path: process.execPath, args: ['--hidden'] }),
    get: () => app.getLoginItemSettings({ path: process.execPath, args: ['--hidden'] }).openAtLogin,
    launchedAtLogin: () => process.argv.includes('--hidden'),
  },

  /** Roda o instalador NSIS em modo silencioso e encerra o app; o NSIS reabre o CleanCode ao terminar. */
  updateSteps: [t("Preparando o instalador"), t("Instalando"), t("Reabrindo o CleanCode")],
  // os arquivos do app ficam em uso enquanto ele roda: o app fecha e uma janelinha própria (WPF, no mesmo estilo)
  // assume no centro da tela, roda o instalador, mostra o resultado e reabre o CleanCode só quando termina
  async installUpdateLive(file, onStep, ui) {
    onStep(0);
    const dir = path.dirname(process.execPath);
    const pf = [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map((p) => p!.toLowerCase() + '\\');
    const perMachine = pf.some((p) => (dir.toLowerCase() + '\\').startsWith(p));
    const instArgs = ['/S', '--updated', perMachine ? '/allusers' : '/currentuser', `/D=${dir}`].join(' ');
    const accent = /^#[0-9a-f]{6}$/i.test(ui.accent) ? ui.accent : '#34d399';
    const version = ui.version.replace(/[^0-9a-z.\-]/gi, '');
    const script = path.join(os.tmpdir(), `cleancode-update-${Date.now()}.ps1`);
    fs.writeFileSync(script, '﻿' + UPDATE_PS1, 'utf8');
    const args = ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script,
      '-ParentPid', String(process.pid), '-Installer', file, '-InstArgs', instArgs, '-Exe', process.execPath, '-Version', version, '-Accent', accent, '-Dark', ui.dark ? '1' : '0', '-Texts', updateTexts()];
    let failed = false;
    const child = spawn('powershell.exe', args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => { failed = true; });
    child.unref();
    await new Promise((r) => setTimeout(r, 700));
    if (failed) {
      // sem PowerShell: instalador clássico em silêncio, que reabre o app sozinho no fim
      const inst = spawn(file, ['/S', '--updated', '--force-run', perMachine ? '/allusers' : '/currentuser', `/D=${dir}`], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true });
      inst.unref();
    }
    onStep(1);
    return 'handoff' as const;
  },
  installUpdate(file, quit, relaunch) {
    // reinstala na mesma pasta e no mesmo modo da instalação atual
    const dir = path.dirname(process.execPath);
    // instalação "para todos os usuários" fica em Program Files; a "só para mim" fica no perfil
    const pf = [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map((p) => p!.toLowerCase() + '\\');
    const perMachine = pf.some((p) => (dir.toLowerCase() + '\\').startsWith(p));
    const args = ['/S', '--updated', ...(relaunch ? ['--force-run'] : []), perMachine ? '/allusers' : '/currentuser', `/D=${dir}`]; // /D precisa ser o último e sem aspas
    const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true });
    child.unref();
    setTimeout(quit, 400);
  },
};

export default win32;
