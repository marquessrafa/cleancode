// Reparos do macOS: preferências (.plist) corrompidas, agentes de inicialização apontando para
// programas que sumiram e o banco do "Abrir com" (LaunchServices). Os arquivos vão para a Lixeira.
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { shell } from 'electron';
import type { RepairsApi, RepairItem, AppErrorEvent } from '../types';
import { t } from '../../i18n';

function run(cmd: string, args: string[], timeout = 60000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 }, (e, out, err) => resolve({ ok: !e, out: out || '', err: String(err || e?.message || '') })));
}
const H = os.homedir();
const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
const list = (dir: string) => { try { return fs.readdirSync(dir); } catch { return []; } };

async function scan(): Promise<RepairItem[]> {
  const out: RepairItem[] = [];
  // 1) preferências corrompidas: o app não consegue ler e às vezes não abre ou perde ajustes
  const prefDir = path.join(H, 'Library/Preferences');
  const plists = list(prefDir).filter((f) => f.endsWith('.plist')).map((f) => path.join(prefDir, f));
  for (let i = 0; i < plists.length; i += 200) {
    const r = await run('/usr/bin/plutil', ['-lint', ...plists.slice(i, i + 200)]);
    for (const line of (r.out + '\n' + r.err).split('\n')) {
      const m = /^(.+\.plist):\s*(.+)$/.exec(line.trim());
      // "sem permissão" é proteção do macOS (TCC), não arquivo corrompido
      if (m && !/:\s*OK$/.test(line.trim()) && !/permission|not permitted|couldn.t be opened/i.test(m[2]) && fs.existsSync(m[1])) {
        out.push({ id: `prefs:${m[1]}`, category: 'prefs', title: path.basename(m[1], '.plist'), detail: t("Arquivo de preferências corrompido ({0}). O app recria um novo ao abrir.", m[2].slice(0, 80)), target: m[1], fixable: true, fix: { kind: 'file', path: m[1] } });
      }
    }
  }
  // 2) agentes de inicialização do usuário apontando para programa inexistente
  const agentDir = path.join(H, 'Library/LaunchAgents');
  for (const f of list(agentDir).filter((x) => x.endsWith('.plist'))) {
    const file = path.join(agentDir, f);
    const r = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], 5000);
    let j: any; try { j = JSON.parse(r.out); } catch { continue; }
    const prog: string | undefined = j?.Program || j?.ProgramArguments?.[0];
    if (prog && prog.startsWith('/') && !fs.existsSync(prog)) {
      out.push({ id: `launchagents:${file}`, category: 'launchagents', title: j.Label || f, detail: t("Um agente de inicialização aponta para um programa que não existe mais: {0}", prog), target: file, fixable: true, fix: { kind: 'file', path: file } });
    }
  }
  // 3) atalhos (aliases) quebrados na Mesa: alias sem destino
  // (o macOS resolve aliases sozinho; aqui ficam só os links simbólicos quebrados, que o Finder mostra sem ícone)
  for (const f of list(path.join(H, 'Desktop'))) {
    const p = path.join(H, 'Desktop', f);
    try { if (fs.lstatSync(p).isSymbolicLink() && !fs.existsSync(p)) out.push({ id: `shortcuts:${p}`, category: 'shortcuts', title: f, detail: t("Link para um arquivo que não existe mais: {0}", fs.readlinkSync(p)), target: p, fixable: true, fix: { kind: 'file', path: p } }); } catch { /* */ }
  }
  // 4) manutenção opcional: reconstruir o banco do "Abrir com"
  out.push({ id: 'launchservices', category: 'launchservices', title: t("Reconstruir o menu \"Abrir com\""), detail: t("Use quando o menu \"Abrir com\" mostrar apps duplicados ou já apagados, ou quando os arquivos abrirem no app errado."), fixable: true, optional: true, fix: { kind: 'command', path: 'lsregister' } });
  return out;
}

async function fix(items: RepairItem[], _backupDir: string) {
  const res: { id: string; ok: boolean; message: string }[] = [];
  for (const it of items) {
    if (!it.fixable || !it.fix) { res.push({ id: it.id, ok: false, message: t("Só aviso") }); continue; }
    if (it.fix.kind === 'command') {
      const r = await run(LSREGISTER, ['-kill', '-r', '-domain', 'local', '-domain', 'system', '-domain', 'user'], 10 * 60000);
      res.push({ id: it.id, ok: r.ok, message: r.ok ? t("Banco de dados refeito. O Finder pode demorar um pouco para mostrar os ícones de novo.") : r.err.slice(0, 140) });
      continue;
    }
    try {
      if (it.category === 'launchagents') await run('/bin/launchctl', ['bootout', `gui/${process.getuid?.() ?? 501}`, it.fix.path], 10000);
      await shell.trashItem(it.fix.path);
      res.push({ id: it.id, ok: true, message: t("Movido para a Lixeira") });
    } catch (e: any) { res.push({ id: it.id, ok: false, message: String(e?.message || e).slice(0, 140) }); }
  }
  return res;
}

async function restore() { return { ok: false, message: t("No macOS, os itens corrigidos ficam na Lixeira, então você pode colocar tudo de volta.") }; }

/** Apps que travaram nos últimos 3 dias (relatórios de diagnóstico do usuário). */
async function recentErrors(): Promise<AppErrorEvent[]> {
  const dir = path.join(H, 'Library/Logs/DiagnosticReports');
  const since = Date.now() - 3 * 86400000;
  const out: AppErrorEvent[] = [];
  for (const f of list(dir)) {
    if (!/\.(ips|crash|hang)$/.test(f)) continue;
    let st: fs.Stats; try { st = fs.statSync(path.join(dir, f)); } catch { continue; }
    if (st.mtimeMs < since) continue;
    const app = f.replace(/[-_]\d{4}-\d{2}-\d{2}.*$/, '').replace(/\.(ips|crash|hang)$/, '');
    out.push({ app, message: f.endsWith('.hang') ? t("Parou de responder") : t("Fechou inesperadamente (falha)"), at: st.mtimeMs });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 40);
}

export const repairs: RepairsApi = { scan, fix, restore, recentErrors };
