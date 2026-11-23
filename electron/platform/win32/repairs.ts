// Reparos do registro do Windows: só itens comprovadamente quebrados (apontam para um arquivo que
// não existe mais). Nada de "limpeza genérica" do registro, que a Microsoft desaconselha.
// Antes de mexer, cada chave é exportada com reg.exe para um .reg (dá para restaurar depois).
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { shell } from 'electron';
import type { RepairsApi, RepairItem, AppErrorEvent } from '../types';

function run(cmd: string, args: string[], timeout = 120000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (e, out, err) => resolve({ ok: !e, out: out || '', err: String(err || e?.message || '') })));
}
const ps = (script: string, timeout?: number) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], timeout);
const json = (t: string) => { try { return JSON.parse(t.trim() || 'null'); } catch { return null; } };

// Extrai o executável de uma linha de comando e diz se ele sumiu. Comandos que dependem do PATH
// ou de intérpretes do sistema (rundll32, msiexec, cmd...) nunca são marcados como quebrados.
const SCAN = String.raw`
$ErrorActionPreference='SilentlyContinue'
function exeOf([string]$cmd){
  if(-not $cmd){return $null}
  $c=[Environment]::ExpandEnvironmentVariables($cmd.Trim())
  if($c -match '^"([^"]+)"'){ $p=$matches[1] } elseif($c -match '^(.+?\.(exe|com|bat|cmd|dll|lnk|scr))(\s|,|$)'){ $p=$matches[1] } else { return $null }
  if($p -notmatch '^[a-zA-Z]:\\'){ return $null }
  if($p -match '\\(rundll32|msiexec|cmd|powershell|pwsh|wscript|cscript|explorer|regsvr32|mshta|conhost)\.exe$'){ return $null }
  return $p
}
function missing([string]$cmd){ $p=exeOf $cmd; if($p -and -not (Test-Path -LiteralPath $p)){ return $p } return $null }
$out=New-Object System.Collections.ArrayList
function add($cat,$title,$detail,$target,$kind,$path,$name,$fixable,$admin){ [void]$out.Add([pscustomobject]@{category=$cat;title=$title;detail=$detail;target=$target;kind=$kind;path=$path;name=$name;fixable=$fixable;admin=$admin}) }

# 1) inicialização apontando para arquivo inexistente
foreach($r in @(@('HKCU','Software\Microsoft\Windows\CurrentVersion\Run',$false),@('HKCU','Software\Microsoft\Windows\CurrentVersion\RunOnce',$false),@('HKLM','Software\Microsoft\Windows\CurrentVersion\Run',$true),@('HKLM','Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run',$true),@('HKLM','Software\Microsoft\Windows\CurrentVersion\RunOnce',$true))){
  $k=Get-Item -LiteralPath "Registry::$($r[0])\$($r[1])"; if(-not $k){continue}
  foreach($n in $k.GetValueNames()){ if(-not $n){continue}; $m=missing ([string]$k.GetValue($n)); if($m){ add 'startup' $n "Inicia com o Windows, mas o programa não existe mais: $m" "$($r[0])\$($r[1])" 'value' "$($r[0])\$($r[1])" $n $true $r[2] } }
}
# 2) programas desinstalados que continuam na lista de instalados
foreach($r in @(@('HKCU','Software\Microsoft\Windows\CurrentVersion\Uninstall',$false),@('HKLM','Software\Microsoft\Windows\CurrentVersion\Uninstall',$true),@('HKLM','Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',$true))){
  foreach($k in Get-ChildItem -LiteralPath "Registry::$($r[0])\$($r[1])"){
    $p=Get-ItemProperty -LiteralPath $k.PSPath; $name=$p.DisplayName; if(-not $name -or $p.SystemComponent -eq 1){continue}
    $u=[string]$p.UninstallString; if($u -match 'msiexec'){continue}
    $mu=missing $u; $loc=[string]$p.InstallLocation
    $locGone = $loc -and ($loc -match '^[a-zA-Z]:\\') -and -not (Test-Path -LiteralPath $loc)
    if($mu -and ($locGone -or -not $loc)){ add 'uninstall' $name "Aparece como instalado, mas o desinstalador sumiu: $mu" "$($r[0])\$($r[1])\$($k.PSChildName)" 'key' "$($r[0])\$($r[1])\$($k.PSChildName)" $null $true $r[2] }
  }
}
# 3) caminhos de apps (App Paths) inválidos
foreach($r in @(@('HKCU',$false),@('HKLM',$true))){
  foreach($k in Get-ChildItem -LiteralPath "Registry::$($r[0])\Software\Microsoft\Windows\CurrentVersion\App Paths"){
    $v=[string](Get-Item -LiteralPath $k.PSPath).GetValue(''); $m=missing $v
    if($m){ add 'apppaths' $k.PSChildName "Atalho de execução aponta para arquivo inexistente: $m" "$($r[0])\...\App Paths\$($k.PSChildName)" 'key' "$($r[0])\Software\Microsoft\Windows\CurrentVersion\App Paths\$($k.PSChildName)" $null $true $r[1] }
  }
}
# 4) "Abrir com" de apps que não existem mais
foreach($k in Get-ChildItem -LiteralPath 'Registry::HKCU\Software\Classes\Applications'){
  $v=[string](Get-Item -LiteralPath "Registry::HKCU\Software\Classes\Applications\$($k.PSChildName)\shell\open\command").GetValue(''); $m=missing $v
  if($m){ add 'fileassoc' $k.PSChildName "Aparece em ""Abrir com"", mas o programa não existe mais: $m" "HKCU\Software\Classes\Applications\$($k.PSChildName)" 'key' "HKCU\Software\Classes\Applications\$($k.PSChildName)" $null $true $false }
}
# 5) itens do menu de contexto (botão direito) que apontam para programas removidos
foreach($r in @(@('HKCU',$false),@('HKLM',$true))){
  foreach($base in @('*\shell','Directory\shell','Directory\Background\shell','Drive\shell')){
    foreach($k in Get-ChildItem -LiteralPath "Registry::$($r[0])\Software\Classes\$base"){
      $v=[string](Get-Item -LiteralPath "$($k.PSPath)\command").GetValue(''); $m=missing $v
      if($m){ $label=[string](Get-Item -LiteralPath $k.PSPath).GetValue(''); if(-not $label){$label=$k.PSChildName}; add 'contextmenu' ($label -replace '&','') "Item do botão direito aponta para programa removido: $m" "$($r[0])\Software\Classes\$base\$($k.PSChildName)" 'key' "$($r[0])\Software\Classes\$base\$($k.PSChildName)" $null $true $r[1] }
    }
  }
}
# 6) histórico de nomes de programas (MuiCache) de executáveis apagados
$mui='HKCU\Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache'
$k=Get-Item -LiteralPath "Registry::$mui"
if($k){ $gone=@(); foreach($n in $k.GetValueNames()){ $p=($n -replace '\.(FriendlyAppName|ApplicationCompany)$',''); if($p -match '^[a-zA-Z]:\\' -and -not (Test-Path -LiteralPath $p)){ $gone+=$n } }
  foreach($n in $gone){ add 'muicache' (Split-Path $n -Leaf) "Nome em cache de um programa que foi apagado" $mui 'value' $mui $n $true $false } }
# 7) atalhos quebrados (Área de Trabalho e Menu Iniciar)
$sh=New-Object -ComObject WScript.Shell
foreach($d in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('CommonDesktopDirectory'),[Environment]::GetFolderPath('StartMenu'),[Environment]::GetFolderPath('CommonStartMenu'))){
  if(-not $d){continue}
  foreach($f in Get-ChildItem -LiteralPath $d -Filter *.lnk -Recurse){
    $t=$sh.CreateShortcut($f.FullName).TargetPath
    if($t -and $t -match '^[a-zA-Z]:\\' -and -not (Test-Path -LiteralPath $t)){ add 'shortcuts' $f.BaseName "Atalho para arquivo que não existe mais: $t" $f.FullName 'file' $f.FullName $null $true ($f.FullName -like "$env:ProgramData*") }
  }
}
# 8) serviços cujo programa sumiu (só aviso: corrigir serviço pede cuidado)
foreach($k in Get-ChildItem -LiteralPath 'Registry::HKLM\SYSTEM\CurrentControlSet\Services'){
  $p=Get-ItemProperty -LiteralPath $k.PSPath
  if($p.Type -lt 16 -or $p.Start -eq 4 -or -not $p.ImagePath){continue}
  $m=missing ([string]$p.ImagePath)
  if($m){ $n=$p.DisplayName; if(-not $n -or $n -like '@*'){$n=$k.PSChildName}; add 'services' $n "Serviço configurado para um programa que não existe mais: $m. Desinstale o programa pelo Desinstalador ou reinstale-o." "HKLM\SYSTEM\CurrentControlSet\Services\$($k.PSChildName)" 'key' '' $null $false $true }
}
$out | ConvertTo-Json -Depth 3 -Compress
`;

async function scan(): Promise<RepairItem[]> {
  const r = await ps(SCAN, 180000);
  const raw = json(r.out);
  const list: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((x) => ({
    id: `${x.category}:${x.path || x.target}:${x.name || ''}`,
    category: x.category, title: String(x.title || ''), detail: String(x.detail || ''), target: x.target,
    fixable: !!x.fixable, needsAdmin: !!x.admin,
    fix: x.kind && x.path ? { kind: x.kind, path: x.path, name: x.name || undefined } : undefined,
  }));
}

const regq = (s: string) => s.replace(/'/g, "''");
async function fix(items: RepairItem[], backupDir: string) {
  fs.mkdirSync(backupDir, { recursive: true });
  const res: { id: string; ok: boolean; message: string }[] = [];
  let n = 0;
  for (const it of items) {
    if (!it.fixable || !it.fix) { res.push({ id: it.id, ok: false, message: 'Só aviso: não é corrigido automaticamente' }); continue; }
    if (it.fix.kind === 'file') {
      try { await shell.trashItem(it.fix.path); res.push({ id: it.id, ok: true, message: 'Atalho movido para a Lixeira' }); }
      catch (e: any) { res.push({ id: it.id, ok: false, message: String(e?.message || e).slice(0, 140) }); }
      continue;
    }
    // backup: a chave (ou a chave do valor) inteira vai para um .reg antes da mudança
    const file = path.join(backupDir, `${String(++n).padStart(3, '0')}.reg`);
    const exp = await run('reg.exe', ['export', it.fix.path, file, '/y'], 30000);
    if (!exp.ok) { res.push({ id: it.id, ok: false, message: 'Não foi possível fazer o backup; nada foi alterado' }); continue; }
    const cmd = it.fix.kind === 'key'
      ? `Remove-Item -LiteralPath 'Registry::${regq(it.fix.path)}' -Recurse -Force -ErrorAction Stop`
      : `Remove-ItemProperty -LiteralPath 'Registry::${regq(it.fix.path)}' -Name '${regq(it.fix.name || '')}' -Force -ErrorAction Stop`;
    const r = await ps(cmd, 30000);
    if (r.ok) res.push({ id: it.id, ok: true, message: 'Corrigido (backup salvo)' });
    else { try { fs.unlinkSync(file); } catch { /* */ } res.push({ id: it.id, ok: false, message: /denied|negado|unauthorized/i.test(r.err) ? 'Precisa abrir o CleanCode como administrador' : r.err.split('\n')[0].slice(0, 140) }); }
  }
  return res;
}

async function restore(backupDir: string) {
  const files = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter((f) => f.endsWith('.reg')).sort() : [];
  if (!files.length) return { ok: false, message: 'Backup vazio' };
  let ok = 0;
  for (const f of files) if ((await run('reg.exe', ['import', path.join(backupDir, f)], 30000)).ok) ok++;
  return { ok: ok === files.length, message: ok === files.length ? `${ok} chave(s) restaurada(s)` : `${ok} de ${files.length} restauradas (as do sistema pedem administrador)` };
}

/** Travamentos e encerramentos inesperados de apps nos últimos 3 dias (Visualizador de Eventos). */
async function recentErrors(): Promise<AppErrorEvent[]> {
  const r = await ps(String.raw`$ErrorActionPreference='SilentlyContinue'
Get-WinEvent -FilterHashtable @{LogName='Application';Id=1000,1002;StartTime=(Get-Date).AddDays(-3)} -MaxEvents 40 | ForEach-Object { [pscustomobject]@{app=[string]$_.Properties[0].Value;id=$_.Id;at=[int64](($_.TimeCreated.ToUniversalTime()-[datetime]'1970-01-01').TotalMilliseconds)} } | ConvertTo-Json -Compress`, 30000);
  const raw = json(r.out);
  const list: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.filter((x) => x.app).map((x) => ({ app: x.app, message: x.id === 1002 ? 'Parou de responder e foi fechado' : 'Fechou inesperadamente (falha)', at: Number(x.at) || 0 }));
}

export const repairs: RepairsApi = { scan, fix, restore, recentErrors };
