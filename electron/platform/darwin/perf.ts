// Desempenho no macOS.
// Itens de início: LaunchAgents (usuário e todos os usuários) ligados/desligados com
// "launchctl disable/enable gui/<uid>/<label>" (preferência do usuário, sem senha);
// LaunchDaemons exigem senha; itens de login visíveis via System Events (só remover).
// Manutenção: um script com todas as tarefas escolhidas, numa única senha de administrador.
import { shell } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PerfApi, StartupItem, MaintenanceTask, ProcInfo } from '../types';

const UID = typeof process.getuid === 'function' ? process.getuid() : 501;
function run(cmd: string, args: string[], timeout = 20000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 }, (e, out, err) => resolve({ ok: !e, out: out || '', err: String(err || e?.message || '') })));
}
const asq = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
/** Roda um script sh como administrador (o macOS pede a senha uma vez). */
function runAsAdmin(script: string, timeout = 30 * 60000) {
  return run('/usr/bin/osascript', ['-e', `do shell script ${asq(script)} with administrator privileges`], timeout);
}

// ---------- itens de início ----------
async function plist(file: string): Promise<any> {
  const r = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], 5000);
  try { return JSON.parse(r.out); } catch { return null; }
}
function publisherOf(label: string) {
  const known: [RegExp, string][] = [[/^com\.adobe/, 'Adobe'], [/^com\.google/, 'Google'], [/^com\.microsoft/, 'Microsoft'], [/^com\.logi/, 'Logitech'], [/^com\.docker/, 'Docker'], [/^com\.setapp/, 'Setapp'], [/^com\.macpaw/, 'MacPaw'], [/^com\.apple/, 'Apple'], [/^us\.zoom/, 'Zoom'], [/^com\.dropbox/, 'Dropbox']];
  return known.find(([re]) => re.test(label))?.[1];
}
async function disabledMap(domain: string): Promise<Map<string, boolean>> {
  const r = await run('/bin/launchctl', ['print-disabled', domain]);
  const m = new Map<string, boolean>();
  for (const l of r.out.split('\n')) { const x = /"([^"]+)" => (enabled|disabled|true|false)/.exec(l); if (x) m.set(x[1], x[2] === 'disabled' || x[2] === 'true'); }
  return m;
}

async function startupItems(): Promise<StartupItem[]> {
  const out: StartupItem[] = [];
  const [guiDisabled, sysDisabled] = await Promise.all([disabledMap(`gui/${UID}`), disabledMap('system')]);
  const dirs: { dir: string; kind: 'agent' | 'daemon'; scope: 'user' | 'system' }[] = [
    { dir: path.join(os.homedir(), 'Library', 'LaunchAgents'), kind: 'agent', scope: 'user' },
    { dir: '/Library/LaunchAgents', kind: 'agent', scope: 'system' },
    { dir: '/Library/LaunchDaemons', kind: 'daemon', scope: 'system' },
  ];
  for (const d of dirs) {
    let files: string[] = [];
    try { files = fs.readdirSync(d.dir).filter((f) => f.endsWith('.plist')); } catch { continue; }
    await Promise.all(files.map(async (f) => {
      const file = path.join(d.dir, f);
      const p = await plist(file);
      const label: string = p?.Label || f.replace(/\.plist$/, '');
      const prog: string = p?.Program || (Array.isArray(p?.ProgramArguments) ? p.ProgramArguments.join(' ') : '') || '';
      const overridden = (d.kind === 'daemon' ? sysDisabled : guiDisabled).get(label);
      const enabled = overridden !== undefined ? !overridden : !p?.Disabled;
      out.push({
        id: `${d.kind}:${file}`, name: label, detail: prog, kind: d.kind, scope: d.scope, enabled,
        control: 'toggle', admin: d.kind === 'daemon', location: file, publisher: publisherOf(label),
      });
    }));
  }
  // itens de login visíveis (Ajustes › Geral › Itens de Início); o macOS pede permissão para o System Events
  const r = await run('/usr/bin/osascript', ['-e', 'tell application "System Events" to get the {name, path} of every login item'], 15000);
  if (r.ok && r.out.trim()) {
    // saída: "Nome1, Nome2, /caminho1, /caminho2"
    const parts = r.out.trim().split(', ');
    const half = Math.floor(parts.length / 2);
    for (let i = 0; i < half; i++) {
      const p = parts[half + i] && parts[half + i] !== 'missing value' ? parts[half + i] : '';
      out.push({ id: `login:${parts[i]}`, name: parts[i], detail: p || 'Registrado pelo próprio app', kind: 'login', scope: 'user', enabled: true, control: 'remove', location: p || undefined });
    }
  }
  const order = { login: 0, agent: 1, daemon: 2, run: 3, folder: 4 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
}

async function setStartupItem(item: StartupItem, enabled: boolean): Promise<{ ok: boolean; message: string }> {
  if (item.kind === 'login') {
    if (enabled) return { ok: false, message: 'Para adicionar de novo, use Ajustes do Sistema › Geral › Itens de Início' };
    const r = await run('/usr/bin/osascript', ['-e', `tell application "System Events" to delete login item ${asq(item.name)}`]);
    return r.ok ? { ok: true, message: 'Removido dos itens de início' } : { ok: false, message: r.err.slice(0, 200) };
  }
  const label = item.name, file = item.location || '';
  if (item.kind === 'daemon') {
    const cmd = enabled
      ? `launchctl enable system/${label}; launchctl bootstrap system ${JSON.stringify(file)} 2>/dev/null; true`
      : `launchctl disable system/${label}; launchctl bootout system/${label} 2>/dev/null; true`;
    const r = await runAsAdmin(cmd, 60000);
    return r.ok ? { ok: true, message: enabled ? 'Ativado' : 'Desativado' } : { ok: false, message: /cancel/i.test(r.err) ? 'Senha cancelada' : r.err.slice(0, 200) };
  }
  // agentes: preferência por usuário (vale para os de /Library também), sem senha
  const svc = `gui/${UID}/${label}`;
  const r1 = await run('/bin/launchctl', [enabled ? 'enable' : 'disable', svc]);
  if (enabled) await run('/bin/launchctl', ['bootstrap', `gui/${UID}`, file]);
  else await run('/bin/launchctl', ['bootout', svc]);
  return r1.ok ? { ok: true, message: enabled ? 'Ativado (vale a partir de agora)' : 'Desativado e encerrado' } : { ok: false, message: r1.err.slice(0, 200) };
}

// ---------- manutenção ----------
const TASKS: (MaintenanceTask & { script: string })[] = [
  { id: 'free-ram', name: 'Liberar memória', description: 'Descarta o cache de arquivos inativo para abrir espaço na RAM.', admin: true, duration: 'segundos', recommended: true, script: '/usr/sbin/purge' },
  { id: 'flush-dns', name: 'Limpar cache de DNS', description: 'Resolve sites que não abrem depois de mudanças de rede ou de DNS.', admin: true, duration: 'segundos', recommended: true, script: '/usr/bin/dscacheutil -flushcache; /usr/bin/killall -HUP mDNSResponder' },
  { id: 'thin-snapshots', name: 'Reduzir instantâneos locais', description: 'Remove instantâneos locais do Time Machine que ocupam espaço "liberável" no disco.', admin: true, duration: 'até 1 minuto', recommended: true, script: '/usr/bin/tmutil thinlocalsnapshots / 999999999999 4' },
  { id: 'periodic', name: 'Scripts de manutenção', description: 'Roda as rotinas diárias, semanais e mensais do macOS (rotação de logs, limpezas).', admin: true, duration: 'até 1 minuto', script: '/usr/sbin/periodic daily weekly monthly' },
  { id: 'reindex-spotlight', name: 'Reindexar o Spotlight', description: 'Refaz o índice de busca. Use se a busca estiver lenta ou incompleta; a reindexação continua em segundo plano.', admin: true, duration: 'segundos para iniciar', script: '/usr/bin/mdutil -E /' },
  { id: 'reset-permissions', name: 'Reparar permissões do usuário', description: 'Restaura as permissões padrão da sua pasta pessoal. Use se apps reclamarem de acesso.', admin: true, duration: 'alguns minutos', script: `/usr/sbin/diskutil resetUserPermissions / ${UID}` },
];

async function runTasks(ids: string[]) {
  const chosen = TASKS.filter((t) => ids.includes(t.id));
  if (!chosen.length) return [];
  // um script só, uma senha; cada tarefa grava o próprio status
  const script = chosen.map((t) => `( ${t.script} ) >/dev/null 2>&1 && echo "OK ${t.id}" || echo "FAIL ${t.id}"`).join('; ');
  const r = await runAsAdmin(script);
  if (!r.ok && !r.out) {
    const msg = /cancel/i.test(r.err) ? 'Senha de administrador cancelada' : r.err.slice(0, 200);
    return chosen.map((t) => ({ id: t.id, ok: false, message: msg }));
  }
  return chosen.map((t) => {
    const ok = new RegExp(`OK ${t.id}\\b`).test(r.out);
    return { id: t.id, ok, message: ok ? 'Concluído' : 'O comando terminou com erro' };
  });
}

// ---------- apps pesados ----------
const SYSTEM_PATHS = /^\/(System|usr\/(libexec|sbin|bin)|sbin|bin|Library\/Apple)\//;
async function processes(): Promise<ProcInfo[]> {
  const r = await run('/bin/ps', ['-axo', 'pid=,uid=,pcpu=,rss=,comm=']);
  const list: ProcInfo[] = [];
  for (const l of r.out.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/.exec(l);
    if (!m || Number(m[2]) !== UID) continue; // só processos do usuário (os do sistema não podem ser encerrados)
    const full = m[5];
    // componentes do macOS (loginwindow, Dock, NotificationCenter…): encerrar derruba a sessão ou só reinicia
    if (!full.startsWith('/') || SYSTEM_PATHS.test(full)) continue;
    // nome legível: o app que contém o executável ("Google Chrome" em vez de "Google Chrome Helper (Renderer)")
    const app = /\/([^/]+?)\.app\//.exec(full)?.[1]; // o .app mais externo
    list.push({ pid: Number(m[1]), name: app || path.basename(full), cpu: Number(m[3]), mem: Number(m[4]) * 1024, path: full });
  }
  return list;
}

export const perf: PerfApi = {
  startupItems, setStartupItem,
  tasks: () => TASKS.map(({ script, ...t }) => t),
  runTasks, processes,
  openStartupSettings: () => { shell.openExternal('x-apple.systempreferences:com.apple.LoginItems-Settings.extension'); },
};
