// Integração com o Windows (processo principal).
import { app, nativeImage } from 'electron';
import { execFile, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { SystemApi, MonitorEvent, UpdateUi } from '../types';
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
const updateTexts = (version: string) => Buffer.from(JSON.stringify({
  done: t("Atualizado"), fail: t("Não deu certo"), noteDone: t("Tudo pronto. O CleanCode {0} está instalado e vai reiniciar agora.", version),
  footDone: t("Reiniciando"), failSub: t("O CleanCode vai abrir na versão atual."), canceled: t("A instalação foi cancelada."),
  code: t("O instalador terminou com o código {0}."),
}), 'utf8').toString('base64');

// ---------- janela de instalação: o mesmo desenho do popup de atualização do app ----------
// A janela é montada aqui, com as cores do tema e os textos já traduzidos, e o script do PowerShell só controla as etapas.
const xmlq = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
const hex = (c: string | undefined, d: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : d);
/** Largura do cartão do popup (max-w-[580px] em UpdateModal.tsx) e a margem em volta dele, onde fica a sombra. */
const UPD_W = 580, UPD_M = 24;
function updateXaml(ui: UpdateUi, steps: string[]) {
  const dark = ui.dark, c = ui.colors || {};
  const C = {
    surface: hex(c.surface, dark ? '#171717' : '#ffffff'), line: hex(c.line, dark ? '#2a2a2a' : '#e6e6e8'), lineStrong: hex(c.lineStrong, dark ? '#3a3a3a' : '#d4d4d8'),
    fg: hex(c.fg, dark ? '#ededed' : '#1c1c1e'), muted: hex(c.muted, dark ? '#a1a1a1' : '#6b6b73'), faint: hex(c.faint, dark ? '#707070' : '#9a9aa3'),
    track: hex(c.track, dark ? '#1f1f1f' : '#f4f4f5'), accent: hex(c.accent || ui.accent, '#34d399'), onAccent: hex(c.onAccent, '#ffffff'), danger: hex(c.danger, dark ? '#f87171' : '#dc2626'),
  };
  const W = Math.round(ui.rect?.w || UPD_W), barW = W - 56;
  const glow = '#2E' + C.accent.slice(1); // destaque com 18% de opacidade, como o brilho do topo do popup
  const deep = '#' + [1, 3, 5].map((i) => Math.round(parseInt(C.accent.slice(i, i + 2), 16) * 0.55).toString(16).padStart(2, '0')).join('');
  const spin = (name: string, size: number, color: string, hidden = true) => `<Viewbox x:Name='${name}' Width='${size}' Height='${size}' RenderTransformOrigin='0.5,0.5'${hidden ? " Visibility='Collapsed'" : ''}><Viewbox.RenderTransform><RotateTransform/></Viewbox.RenderTransform><Canvas Width='18' Height='18'><Path Data='M 9,1.6 A 7.4,7.4 0 1 1 1.6,9' Stroke='${color}' StrokeThickness='2.4' StrokeStartLineCap='Round' StrokeEndLineCap='Round'/></Canvas></Viewbox>`;
  const check = (name: string, size: number, color: string, w: number) => `<Viewbox x:Name='${name}' Width='${size}' Height='${size}' Visibility='Collapsed'><Canvas Width='18' Height='18'><Path Data='M 3.5,9.6 L 7.4,13.4 L 14.6,5' Stroke='${color}' StrokeThickness='${w}' StrokeStartLineCap='Round' StrokeEndLineCap='Round' StrokeLineJoin='Round'/></Canvas></Viewbox>`;
  const cross = (name: string, size: number, color: string) => `<Viewbox x:Name='${name}' Width='${size}' Height='${size}' Visibility='Collapsed'><Canvas Width='18' Height='18'><Path Data='M 5,5 L 13,13 M 13,5 L 5,13' Stroke='${color}' StrokeThickness='2.6' StrokeStartLineCap='Round' StrokeEndLineCap='Round'/></Canvas></Viewbox>`;
  // uma etapa: círculo (ponto quando falta, girando quando está em andamento, check quando terminou, x quando falhou) e o nome
  const row = (n: number, text: string) => `
          <Grid Margin='0,0,0,10'>
            <Grid.ColumnDefinitions><ColumnDefinition Width='24'/><ColumnDefinition Width='*'/></Grid.ColumnDefinitions>
            <Border x:Name='C${n}' Width='24' Height='24' CornerRadius='12' BorderThickness='1' BorderBrush='${C.line}' Background='Transparent'>
              <Grid><Ellipse x:Name='D${n}' Width='6' Height='6' Fill='${C.lineStrong}'/>${spin('P' + n, 13, C.accent)}${check('K' + n, 13, C.onAccent, 3)}${cross('X' + n, 11, '#ffffff')}</Grid>
            </Border>
            <TextBlock x:Name='T${n}' Grid.Column='1' Margin='12,0,0,0' VerticalAlignment='Center' FontSize='13.5' Foreground='${C.faint}' Text='${xmlq(text)}'/>
          </Grid>`;
  return `<Window xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml'
  WindowStyle='None' AllowsTransparency='True' Background='Transparent' Width='${W + UPD_M * 2}' SizeToContent='Height' ResizeMode='NoResize'
  WindowStartupLocation='${ui.rect ? 'Manual' : 'CenterScreen'}' Topmost='True' ShowInTaskbar='True' Title='CleanCode'
  FontFamily='Segoe UI Variable Text, Segoe UI' UseLayoutRounding='True'>
  <Border Margin='${UPD_M}' CornerRadius='16' Background='${C.surface}' BorderBrush='${C.line}' BorderThickness='1'>
    <Border.Effect><DropShadowEffect BlurRadius='28' ShadowDepth='8' Direction='270' Opacity='0.5'/></Border.Effect>
    <Grid>
      <Border CornerRadius='16,16,0,0' Height='160' VerticalAlignment='Top'>
        <Border.Background><RadialGradientBrush Center='0.5,0' GradientOrigin='0.5,0' RadiusX='0.7' RadiusY='1'><GradientStop Color='${glow}' Offset='0'/><GradientStop Color='#00000000' Offset='0.7'/></RadialGradientBrush></Border.Background>
      </Border>
      <StackPanel>
        <Grid Margin='28,28,28,16'>
          <Grid.ColumnDefinitions><ColumnDefinition Width='56'/><ColumnDefinition Width='*'/></Grid.ColumnDefinitions>
          <Border Width='56' Height='56' CornerRadius='16'>
            <Border.Background><LinearGradientBrush StartPoint='0,0' EndPoint='1,1'><GradientStop Color='${C.accent}' Offset='0'/><GradientStop Color='${deep}' Offset='1'/></LinearGradientBrush></Border.Background>
            <Border.Effect><DropShadowEffect Color='${C.accent}' BlurRadius='26' ShadowDepth='6' Direction='270' Opacity='0.45'/></Border.Effect>
            <Grid>${spin('HSpin', 26, C.onAccent, false)}${check('HCheck', 28, C.onAccent, 2.6)}${cross('HFail', 24, C.onAccent)}</Grid>
          </Border>
          <StackPanel Grid.Column='1' Margin='16,0,0,0' VerticalAlignment='Center'>
            <TextBlock x:Name='Tag' FontSize='11.5' FontWeight='SemiBold' Foreground='${C.accent}' Text='${xmlq(t("Instalando").toUpperCase())}'/>
            <TextBlock FontSize='21' FontWeight='SemiBold' Foreground='${C.fg}' TextTrimming='CharacterEllipsis' Text='${xmlq('CleanCode ' + ui.version)}'/>
            <TextBlock FontSize='12.5' Foreground='${C.muted}' TextTrimming='CharacterEllipsis' Text='${xmlq(ui.subtitle || '')}'/>
          </StackPanel>
        </Grid>
        <StackPanel Margin='28,12,28,8'>${steps.map((x, i) => row(i + 1, x)).join('')}
          <Border x:Name='Track' Height='6' CornerRadius='3' Background='${C.track}' Margin='0,10,0,0' ClipToBounds='True' Width='${barW}' HorizontalAlignment='Left'>
            <Border x:Name='Fill' Width='${Math.round(barW / 3)}' CornerRadius='3' Background='${C.accent}' HorizontalAlignment='Left'><Border.RenderTransform><TranslateTransform/></Border.RenderTransform></Border>
          </Border>
          <TextBlock x:Name='Note' FontSize='12.5' Foreground='${C.muted}' TextWrapping='Wrap' Margin='0,12,0,0' Text='${xmlq(t("O CleanCode vai fechar, instalar a versão nova e abrir de novo sozinho."))}'/>
        </StackPanel>
        <Border BorderBrush='${C.line}' BorderThickness='0,1,0,0' Padding='28,16'>
          <StackPanel Orientation='Horizontal' HorizontalAlignment='Right' Height='32'>
            ${spin('FootSpin', 14, C.accent)}
            <TextBlock x:Name='Foot' Margin='8,0,0,0' VerticalAlignment='Center' FontSize='12' Foreground='${C.muted}' Text='${xmlq(t("Não desligue o computador"))}'/>
          </StackPanel>
        </Border>
      </StackPanel>
    </Grid>
  </Border>
</Window>`;
}

/** Aspas para a linha de comando do Windows (regras do CommandLineToArgvW). */
const winQuote = (a: string) => (/[\s"]/.test(a) ? '"' + a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"' : a);
const psq = (s: string) => "'" + s.replace(/'/g, "''") + "'";

/**
 * Inicia um programa FORA do job do Windows em que o app roda.
 * O Node/Electron coloca os processos filhos num job que é encerrado junto com o app, e a opção "detached" não tira
 * o processo desse job. Por isso, um instalador iniciado com spawn morria no instante em que o app fechava
 * (o bug da atualização no Windows). Pelo WMI (Win32_Process.Create), o processo nasce como filho do serviço do WMI,
 * na sessão do usuário, e continua rodando depois que o app fecha. Devolve o número do processo, ou null se falhar.
 */
function launchOutsideJob(cmdline: string): Promise<number | null> {
  // ShowWindow = 0: o processo nasce sem janela de console
  const script = `$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ${psq(cmdline)}; ProcessStartupInformation = $si }
"$($r.ReturnValue)|$($r.ProcessId)"`;
  // -EncodedCommand evita qualquer problema de aspas entre o Node e o PowerShell
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, timeout: 30000 }, (e, out) => {
    const [rv, pid] = String(out || '').trim().split('|');
    resolve(!e && rv === '0' && Number(pid) > 0 ? Number(pid) : null);
  }));
}

// Janela de instalação no Windows (WPF, com o mesmo desenho do popup do app e no mesmo lugar dele). Ela é iniciada fora do
// job do app e:
// 1) avisa o app que abriu (arquivo de "pronto"); só então o app fecha;
// 2) espera fechar todos os processos que rodam da pasta do app (Electron e o helper de sensores);
// 3) roda o instalador em silêncio, mostrando as mesmas etapas do popup;
// 4) reabre o CleanCode quando a instalação termina (ou na versão atual, se ela falhar).
// Cada passo vai para %TEMP%\cleancode-update.log. Sem WPF, instala do jeito clássico (o instalador reabre o app).
const UPDATE_PS1 = String.raw`param([int]$ParentPid, [string]$Installer, [string]$InstArgs, [string]$Exe, [string]$AppDir, [string]$Version, [string]$XamlFile, [int]$Left = -99999, [int]$Top = 0, [string]$Fg = '#ffffff', [string]$Danger = '#f87171', [string]$Texts, [string]$ReadyFile, [string]$LogFile)
$ErrorActionPreference = 'Stop'
function Log([string]$m) { try { Add-Content -LiteralPath $LogFile -Value ((Get-Date).ToString('HH:mm:ss.fff') + '  ' + $m) -Encoding UTF8 } catch {} }
function Ready { try { New-Item -ItemType File -Force -Path $ReadyFile | Out-Null } catch {} }
Log ('início: versão ' + $Version + ', app ' + $Exe)
$T = $null; try { $T = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Texts)) | ConvertFrom-Json } catch {}
function L([string]$k, [string]$d) { if ($T -and $T.$k) { [string]$T.$k } else { $d } }
function AppProcs {
  # processos que rodam da pasta do app (o CleanCode, os processos auxiliares do Electron e o helper de sensores)
  $r = @()
  foreach ($p in (Get-Process -ErrorAction SilentlyContinue)) {
    if ($p.Id -eq $PID) { continue }
    $path = $null; try { $path = $p.Path } catch {}
    if ($path -and $path.StartsWith($AppDir, [StringComparison]::OrdinalIgnoreCase)) { $r += $p }
  }
  return $r
}
$script:started = $false
try {
  Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
  # a janela vem pronta do app (updateXaml): o mesmo desenho do popup, com as cores do tema e os textos traduzidos
  $win = [Windows.Markup.XamlReader]::Parse([IO.File]::ReadAllText($XamlFile, [Text.Encoding]::UTF8))
  Remove-Item -LiteralPath $XamlFile -Force -ErrorAction SilentlyContinue
  # abre exatamente onde estava o popup do app (a margem da sombra fica em volta do cartão)
  if ($Left -ne -99999) { $win.Left = $Left; $win.Top = $Top }
  $bc = New-Object Windows.Media.BrushConverter
  function B([string]$c) { $bc.ConvertFromString($c) }
  $F = { param($n) $win.FindName($n) }
  $accentB = (& $F 'Fill').Background; $transB = B '#00000000'
  $lineB = (& $F 'C1').BorderBrush; $faintB = (& $F 'T1').Foreground; $fgB = B $Fg; $dangerB = B $Danger
  function Spin($el, [double]$sec) {
    $a = New-Object Windows.Media.Animation.DoubleAnimation(0, 360, [TimeSpan]::FromSeconds($sec))
    $a.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever
    $el.RenderTransform.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $a)
  }
  function Show($el, [bool]$on) { $el.Visibility = $(if ($on) { 'Visible' } else { 'Collapsed' }) }
  # etapa: 0 = falta, 1 = em andamento, 2 = concluída, 3 = falhou
  function SetStep([int]$n, [int]$s) {
    if (-not (& $F ('C' + $n))) { return }
    Show (& $F ('D' + $n)) ($s -eq 0); Show (& $F ('P' + $n)) ($s -eq 1); Show (& $F ('K' + $n)) ($s -eq 2); Show (& $F ('X' + $n)) ($s -eq 3)
    if ($s -eq 1) { Spin (& $F ('P' + $n)) 0.9 }
    $c = & $F ('C' + $n)
    $c.BorderBrush = $(if ($s -eq 1) { $accentB } elseif ($s -ge 2) { $transB } else { $lineB })
    $c.Background = $(if ($s -eq 2) { $accentB } elseif ($s -eq 3) { $dangerB } else { $transB })
    $t = & $F ('T' + $n); $t.Foreground = $(if ($s -eq 0) { $faintB } else { $fgB }); $t.FontWeight = $(if ($s -eq 1) { 'Medium' } else { 'Normal' })
  }
  Spin (& $F 'HSpin') 0.9
  # barra em andamento: um pedaço na cor de destaque passa de um lado para o outro, como no popup
  $fill = & $F 'Fill'; $barW = (& $F 'Track').Width
  $slide = New-Object Windows.Media.Animation.DoubleAnimation((-$fill.Width), $barW, [TimeSpan]::FromSeconds(1.4))
  $slide.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever
  $fill.RenderTransform.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $slide)
  SetStep 1 1
  $win.Add_ContentRendered({ Ready; Log 'janela aberta' })
  $win.Add_MouseLeftButtonDown({ try { $win.DragMove() } catch {} })
  $script:phase = 'wait'; $script:proc = $null; $script:t0 = Get-Date; $script:closeAt = $null; $script:killed = $false
  $finish = {
    param($ok, $msg)
    $fill.RenderTransform.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $null)
    $fill.RenderTransform.X = 0; $fill.Width = $barW
    Show (& $F 'HSpin') $false
    if ($ok) {
      SetStep 2 2; SetStep 3 1; Show (& $F 'HCheck') $true
      (& $F 'Tag').Text = (L 'done' 'Atualizado').ToUpper(); (& $F 'Note').Text = (L 'noteDone' 'Tudo pronto.')
      $foot = & $F 'Foot'; $foot.Text = (L 'footDone' 'Reiniciando'); $foot.Foreground = $accentB; $foot.FontWeight = 'Medium'
      Show (& $F 'FootSpin') $true; Spin (& $F 'FootSpin') 0.9
    } else {
      SetStep 2 3; SetStep 3 1; Show (& $F 'HFail') $true; $fill.Background = $dangerB
      (& $F 'Tag').Text = (L 'fail' 'Não deu certo').ToUpper(); (& $F 'Tag').Foreground = $dangerB
      (& $F 'Note').Text = $msg + ' ' + (L 'failSub' 'O CleanCode vai abrir na versão atual.')
    }
    try { Start-Process -FilePath $Exe -ArgumentList '--updated'; Log 'app reaberto'; SetStep 3 2 } catch { Log ('falha ao reabrir: ' + $_.Exception.Message) }
    $script:closeAt = (Get-Date).AddSeconds($(if ($ok) { 2.5 } else { 7 }))
    $script:phase = 'done'
  }
  $timer = New-Object Windows.Threading.DispatcherTimer
  $timer.Interval = [TimeSpan]::FromMilliseconds(400)
  $timer.Add_Tick({
    try {
      if ($script:phase -eq 'wait') {
        # espera o app e todos os processos dele fecharem; depois de 25 s, encerra o que sobrou
        $left = @(AppProcs)
        $elapsed = ((Get-Date) - $script:t0).TotalSeconds
        if ($left.Count -gt 0 -and $elapsed -gt 25 -and -not $script:killed) { Log ('encerrando ' + $left.Count + ' processo(s) que sobraram'); $left | Stop-Process -Force -ErrorAction SilentlyContinue; $script:killed = $true; return }
        if ($left.Count -eq 0 -or $elapsed -gt 40) {
          SetStep 1 2; SetStep 2 1
          Log ('rodando o instalador: ' + $InstArgs)
          $script:proc = Start-Process -FilePath $Installer -ArgumentList $InstArgs -PassThru
          $null = $script:proc.Handle  # sem isso, o ExitCode do Start-Process volta vazio
          $script:phase = 'install'; $script:started = $true
        }
      } elseif ($script:phase -eq 'install') {
        if ($script:proc.HasExited) {
          $code = $script:proc.ExitCode
          Log ('instalador terminou com o código ' + $code)
          if ($code -eq 0) { & $finish $true '' } else { & $finish $false ((L 'code' 'O instalador terminou com o código {0}.') -f $code) }
        }
      } elseif ($script:phase -eq 'done' -and (Get-Date) -ge $script:closeAt) {
        $timer.Stop(); $win.Close()
      }
    } catch { Log ('erro: ' + $_.Exception.Message); if (-not $script:started) { & $finish $false (L 'canceled' 'A instalação foi cancelada.') } }
  })
  $timer.Start()
  [void]$win.ShowDialog()
  Log 'janela fechada'
} catch {
  # plano B: sem a janela (WPF indisponível ou erro inesperado), instala do jeito clássico, que reabre o app sozinho
  Log ('plano B: ' + $_.Exception.Message)
  Ready
  if (-not $script:started) {
    $i = 0; while (@(AppProcs).Count -gt 0 -and $i -lt 75) { Start-Sleep -Milliseconds 400; $i++ }
    @(AppProcs) | Stop-Process -Force -ErrorAction SilentlyContinue
    try { $p = Start-Process -FilePath $Installer -ArgumentList ('--force-run ' + $InstArgs) -PassThru -Wait; Log ('instalador (plano B) terminou com o código ' + $p.ExitCode) }
    catch { Log ('falha no plano B: ' + $_.Exception.Message); try { Start-Process -FilePath $Exe } catch {} }
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
    const instArgs = ['/S', '--updated', perMachine ? '/allusers' : '/currentuser', `/D=${dir}`].join(' '); // /D precisa ser o último e sem aspas
    const version = ui.version.replace(/[^0-9a-z.\-]/gi, '');
    const stamp = Date.now();
    const script = path.join(os.tmpdir(), `cleancode-update-${stamp}.ps1`);
    const ready = path.join(os.tmpdir(), `cleancode-update-${stamp}.ready`);
    const xaml = path.join(os.tmpdir(), `cleancode-update-${stamp}.xaml`);
    fs.writeFileSync(xaml, updateXaml({ ...ui, version }, this.updateSteps || []), 'utf8');
    // posição da janela: o canto do cartão do popup menos a margem da sombra
    const pos = ui.rect ? ['-Left', String(Math.round(ui.rect.x - UPD_M)), '-Top', String(Math.round(ui.rect.y - UPD_M))] : [];
    const fg = hex(ui.colors?.fg, ui.dark ? '#ededed' : '#1c1c1e'), danger = hex(ui.colors?.danger, ui.dark ? '#f87171' : '#dc2626');
    const log = path.join(os.tmpdir(), 'cleancode-update.log');
    try { fs.writeFileSync(log, ''); } catch { /* */ }
    fs.writeFileSync(script, '﻿' + UPDATE_PS1, 'utf8');
    const cmd = ['powershell.exe', '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script,
      '-ParentPid', String(process.pid), '-Installer', file, '-InstArgs', instArgs, '-Exe', process.execPath, '-AppDir', dir + '\\', '-Version', version,
      '-XamlFile', xaml, ...pos, '-Fg', fg, '-Danger', danger, '-Texts', updateTexts(version), '-ReadyFile', ready, '-LogFile', log].map(winQuote).join(' ');
    // a janela de instalação nasce fora do job do app; o app só fecha depois que ela aparece na tela
    const pid = await launchOutsideJob(cmd);
    let shown = false;
    if (pid) for (let i = 0; i < 200 && !shown; i++) { await new Promise((r) => setTimeout(r, 100)); shown = fs.existsSync(ready); }
    if (!shown) {
      // encerra a janela que não abriu a tempo, para não rodar dois instaladores
      if (pid) { try { process.kill(pid); } catch { /* já saiu */ } }
      // a janela não abriu: instalador clássico em silêncio (também fora do job), que reabre o app no fim
      try { fs.appendFileSync(log, `janela não abriu (pid ${pid ?? '-'}); usando o instalador clássico\n`); } catch { /* */ }
      const fallback = [file, '/S', '--updated', '--force-run', perMachine ? '/allusers' : '/currentuser'].map(winQuote).join(' ') + ` /D=${dir}`;
      if (!(await launchOutsideJob(fallback))) { const inst = spawn(file, ['/S', '--updated', '--force-run', perMachine ? '/allusers' : '/currentuser', `/D=${dir}`], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }); inst.unref(); }
    }
    try { fs.unlinkSync(ready); } catch { /* */ }
    // a etapa seguinte fica com a janela de instalação, que continua exatamente de onde o popup parou
    return 'handoff' as const;
  },
  installUpdate(file, quit, relaunch) {
    // reinstala na mesma pasta e no mesmo modo da instalação atual
    const dir = path.dirname(process.execPath);
    // instalação "para todos os usuários" fica em Program Files; a "só para mim" fica no perfil
    const pf = [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map((p) => p!.toLowerCase() + '\\');
    const perMachine = pf.some((p) => (dir.toLowerCase() + '\\').startsWith(p));
    const args = ['/S', '--updated', ...(relaunch ? ['--force-run'] : []), perMachine ? '/allusers' : '/currentuser'];
    // fora do job do app: sem isso, o instalador era encerrado junto com o app (ver launchOutsideJob)
    launchOutsideJob([file, ...args].map(winQuote).join(' ') + ` /D=${dir}`).then((pid) => {
      if (!pid) { const child = spawn(file, [...args, `/D=${dir}`], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }); child.unref(); }
      setTimeout(quit, 400);
    });
  },
};

export default win32;
