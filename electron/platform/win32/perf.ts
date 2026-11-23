// Desempenho no Windows.
// Itens de início: chaves Run (usuário e máquina) e pastas Inicializar; ligar/desligar grava o mesmo
// "StartupApproved" que o Gerenciador de Tarefas usa (02 = ativo, 03 = desativado). Itens da máquina
// pedem UAC. Manutenção: comandos do sistema (DNS sem administrador; os demais com UAC).
import { shell } from 'electron';
import { execFile } from 'child_process';
import os from 'os';
import type { PerfApi, StartupItem, MaintenanceTask, ProcInfo } from '../types';

function run(cmd: string, args: string[], timeout = 60000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (e, out, err) => resolve({ ok: !e, out: out || '', err: String(err || e?.message || '') })));
}
const ps = (script: string, timeout?: number) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], timeout);
const psq = (s: string) => "'" + s.replace(/'/g, "''") + "'";
/** Roda um script PowerShell elevado (UAC) e espera terminar. */
function psAdmin(script: string, timeout = 60 * 60000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return ps(`$p = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'; exit $p.ExitCode`, timeout);
}

const APPROVED = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved';
const LIST = String.raw`
$ErrorActionPreference='SilentlyContinue'
$ap='${APPROVED}'
function approved($hive,$sub,$name){ $v=(Get-ItemProperty -LiteralPath "$hive\$ap\$sub").$name; if($v -is [byte[]]){ return ($v[0] % 2) -eq 0 } return $true }
$out=@()
foreach($r in @(@('HKCU:','Software\Microsoft\Windows\CurrentVersion\Run','Run','user'),@('HKLM:','Software\Microsoft\Windows\CurrentVersion\Run','Run','system'),@('HKLM:','Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run','Run32','system'))){
  $k=Get-Item -LiteralPath "$($r[0])\$($r[1])"; if(-not $k){continue}
  foreach($n in $k.GetValueNames()){ if(-not $n){continue}; $out+=[pscustomobject]@{kind='run';hive=$r[0];sub=$r[2];key=$r[1];name=$n;cmd=[string]$k.GetValue($n);scope=$r[3];enabled=(approved $r[0] $r[2] $n)} }
}
foreach($f in @(@([Environment]::GetFolderPath('Startup'),'HKCU:','user'),@([Environment]::GetFolderPath('CommonStartup'),'HKLM:','system'))){
  if(-not $f[0]){continue}
  foreach($i in Get-ChildItem -LiteralPath $f[0] -File | Where-Object { $_.Name -ne 'desktop.ini' }){ $out+=[pscustomobject]@{kind='folder';hive=$f[1];sub='StartupFolder';key=$f[0];name=$i.Name;cmd=$i.FullName;scope=$f[2];enabled=(approved $f[1] 'StartupFolder' $i.Name)} }
}
$out | ConvertTo-Json -Compress
`;

async function startupItems(): Promise<StartupItem[]> {
  const r = await ps(LIST);
  let raw: any[] = [];
  try { const j = JSON.parse(r.out.trim() || '[]'); raw = Array.isArray(j) ? j : [j]; } catch { /* */ }
  return raw.map((x) => ({
    id: `${x.kind}:${x.hive}:${x.sub}:${x.name}`, name: String(x.name).replace(/\.lnk$/i, ''), detail: x.cmd,
    kind: x.kind, scope: x.scope, enabled: !!x.enabled, control: 'toggle' as const, admin: x.hive === 'HKLM:',
    location: `${x.hive}|${x.sub}|${x.name}`,
  }));
}

async function setStartupItem(item: StartupItem, enabled: boolean) {
  const [hive, sub, name] = (item.location || '').split('|');
  if (!hive || !sub || !name) return { ok: false, message: 'Item inválido' };
  // mesmo formato do Gerenciador de Tarefas: 12 bytes, o primeiro indica o estado
  const script = `$p=${psq(`${hive}\\${APPROVED}\\${sub}`)}; if(-not (Test-Path -LiteralPath $p)){ New-Item -Path $p -Force | Out-Null }; ` +
    `$b=[byte[]](${enabled ? 2 : 3},0,0,0,0,0,0,0,0,0,0,0); Set-ItemProperty -LiteralPath $p -Name ${psq(name)} -Value $b -Type Binary`;
  const r = hive === 'HKLM:' ? await psAdmin(script, 120000) : await ps(script);
  return r.ok ? { ok: true, message: enabled ? 'Ativado (vale no próximo login)' : 'Desativado (vale no próximo login)' } : { ok: false, message: /canceled|cancelad/i.test(r.err) ? 'Permissão de administrador negada' : r.err.slice(0, 200) };
}

const TASKS: (MaintenanceTask & { cmd: string })[] = [
  { id: 'flush-dns', name: 'Limpar cache de DNS', description: 'Resolve sites que não abrem depois de mudanças de rede ou de DNS.', admin: false, duration: 'segundos', recommended: true, cmd: 'ipconfig /flushdns' },
  { id: 'optimize', name: 'Otimizar unidades', description: 'Envia TRIM aos SSDs e desfragmenta HDs (o mesmo do "Otimizar unidades" do Windows).', admin: true, duration: 'alguns minutos', recommended: true, cmd: 'Optimize-Volume -DriveLetter $env:SystemDrive[0] -Verbose' },
  { id: 'sfc', name: 'Reparar arquivos do sistema', description: 'Verifica e corrige arquivos do Windows corrompidos (SFC).', admin: true, duration: '10 a 30 minutos', cmd: 'sfc /scannow' },
  { id: 'dism', name: 'Reparar imagem do Windows', description: 'Corrige a imagem do sistema usada pelo SFC (DISM /RestoreHealth).', admin: true, duration: '10 a 30 minutos', cmd: 'DISM /Online /Cleanup-Image /RestoreHealth' },
];

async function runTasks(ids: string[]) {
  const chosen = TASKS.filter((t) => ids.includes(t.id));
  const results: { id: string; ok: boolean; message: string }[] = [];
  for (const t of chosen.filter((x) => !x.admin)) {
    const r = await ps(t.cmd);
    results.push({ id: t.id, ok: r.ok, message: r.ok ? 'Concluído' : r.err.slice(0, 200) });
  }
  const admin = chosen.filter((x) => x.admin);
  if (admin.length) {
    // uma elevação só; cada tarefa grava o resultado num arquivo temporário
    const log = `$env:TEMP\\cleancode-maint-${Date.now()}.txt`;
    const script = admin.map((t) => `try { ${t.cmd} | Out-Null; if($LASTEXITCODE -and $LASTEXITCODE -ne 0){ throw 'erro' }; Add-Content ${log} 'OK ${t.id}' } catch { Add-Content ${log} 'FAIL ${t.id}' }`).join('; ');
    const r = await psAdmin(script);
    const out = (await ps(`Get-Content ${log} -ErrorAction SilentlyContinue; Remove-Item ${log} -ErrorAction SilentlyContinue`)).out;
    for (const t of admin) {
      const ok = new RegExp(`OK ${t.id}\\b`).test(out);
      results.push({ id: t.id, ok, message: ok ? 'Concluído' : !r.ok && !out ? 'Permissão de administrador negada' : 'O comando terminou com erro' });
    }
  }
  return results;
}

async function processes(): Promise<ProcInfo[]> {
  const r = await ps("Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.IDProcess -gt 4 -and $_.Name -notmatch '^(_Total|Idle|System)$' } | Select-Object IDProcess,Name,PercentProcessorTime,WorkingSetPrivate | ConvertTo-Json -Compress", 30000);
  let raw: any[] = [];
  try { const j = JSON.parse(r.out.trim() || '[]'); raw = Array.isArray(j) ? j : [j]; } catch { /* */ }
  const cores = os.cpus().length || 1;
  // processos essenciais do Windows: encerrar derruba a sessão ou o sistema
  const CRITICAL = /^(csrss|wininit|winlogon|smss|services|lsass|lsaiso|svchost|dwm|fontdrvhost|sihost|ctfmon|RuntimeBroker|SearchHost|StartMenuExperienceHost|ShellExperienceHost|TextInputHost|conhost|explorer|Registry|MemCompression|spoolsv|audiodg|WmiPrvSE|dllhost|taskhostw|SecurityHealthService|MsMpEng|NisSrv|System Idle Process)$/i;
  return raw.map((p) => ({ pid: Number(p.IDProcess), name: String(p.Name).replace(/#\d+$/, ''), cpu: Number(p.PercentProcessorTime) / cores, mem: Number(p.WorkingSetPrivate) || 0 }))
    .filter((p) => !CRITICAL.test(p.name));
}

export const perf: PerfApi = {
  startupItems, setStartupItem,
  tasks: () => TASKS.map(({ cmd, ...t }) => t),
  runTasks, processes,
  openStartupSettings: () => { shell.openExternal('ms-settings:startupapps'); },
};
