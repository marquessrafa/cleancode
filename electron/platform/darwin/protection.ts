// Proteção no macOS: estado das defesas do sistema e assinatura de código dos itens que iniciam sozinhos.
// A detecção de malware conhecido continua com o XProtect da Apple; aqui mostramos se ele está atualizado.
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ProtectionApi, SecurityCheck, SignatureInfo, StartupItem } from '../types';
import { t as tr, LOCALE } from '../../i18n';

function run(cmd: string, args: string[], timeout = 15000): Promise<{ out: string; err: string; ok: boolean }> {
  return new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', timeout }, (e, out, err) => resolve({ out: out || '', err: err || '', ok: !e })));
}
const PANE = (anchor: string) => `x-apple.systempreferences:com.apple.preference.security?${anchor}`;

async function status(): Promise<SecurityCheck[]> {
  const [gk, sip, fv, fw, xp, su] = await Promise.all([
    run('/usr/sbin/spctl', ['--status']),
    run('/usr/bin/csrutil', ['status']),
    run('/usr/bin/fdesetup', ['status']),
    run('/usr/libexec/ApplicationFirewall/socketfilterfw', ['--getglobalstate']),
    run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '/Library/Apple/System/Library/CoreServices/XProtect.bundle/Contents/Info.plist']),
    run('/usr/bin/defaults', ['read', '/Library/Preferences/com.apple.SoftwareUpdate']),
  ]);
  const flag = (k: string) => { const m = new RegExp(`${k} = (\\d)`).exec(su.out); return m ? m[1] === '1' : true; }; // ausente = padrão (ligado)
  let xpDate = '';
  try { xpDate = new Date(fs.statSync('/Library/Apple/System/Library/CoreServices/XProtect.bundle').mtimeMs).toLocaleDateString(LOCALE); } catch { /* */ }
  const gkOk = /enabled/.test(gk.out + gk.err) ? true : /disabled/.test(gk.out + gk.err) ? false : null;
  const sipOk = /status: enabled/.test(sip.out) ? true : /status: disabled/.test(sip.out) ? false : null;
  const fvOk = /FileVault is On/.test(fv.out) ? true : /FileVault is Off/.test(fv.out) ? false : null;
  const fwOk = /enabled/.test(fw.out) ? true : /disabled/.test(fw.out) ? false : null;
  return [
    { id: 'gatekeeper', name: tr("Gatekeeper"), critical: true, ok: gkOk, settingsUrl: PANE('General'),
      detail: gkOk ? tr("Só abre apps assinados ou que você liberou") : tr("Apps de qualquer origem abrem sem verificação. Para ligar essa proteção de novo, vá em Privacidade e Segurança ou rode \"sudo spctl --master-enable\" no Terminal.") },
    { id: 'sip', name: tr("Proteção da Integridade do Sistema"), critical: true, ok: sipOk,
      detail: sipOk ? tr("Os arquivos do sistema estão protegidos contra mudanças") : tr("Desligada. Ela só pode ser ligada de novo pelo modo de recuperação (csrutil enable).") },
    { id: 'xprotect', name: tr("XProtect (antimalware da Apple)"), critical: true, ok: xp.out.trim() ? flag('ConfigDataInstall') : null,
      detail: xp.out.trim() ? tr("Versão {0}{1}{2}", xp.out.trim(), xpDate ? tr(", atualizada em {0}", xpDate) : '', flag('ConfigDataInstall') ? '' : tr(" · atualizações de segurança automáticas desligadas")) : tr("Não encontrado") },
    { id: 'security-updates', name: tr("Respostas de segurança automáticas"), ok: flag('CriticalUpdateInstall'), settingsUrl: 'x-apple.systempreferences:com.apple.Software-Update-Settings.extension',
      detail: flag('CriticalUpdateInstall') ? tr("Correções urgentes são instaladas sozinhas") : tr("Desligadas em Atualização de Software") },
    { id: 'filevault', name: tr("FileVault"), ok: fvOk, settingsUrl: PANE('FDE'),
      detail: fvOk ? tr("O disco está criptografado") : tr("O disco não está criptografado. Por isso, quem pegar o Mac consegue ler os seus arquivos") },
    { id: 'firewall', name: tr("Firewall"), ok: fwOk, settingsUrl: 'x-apple.systempreferences:com.apple.Network-Settings.extension?Firewall',
      detail: fwOk ? tr("Bloqueia conexões de entrada não autorizadas") : tr("Desligado (recomendado ligar em redes públicas)") },
  ];
}

const sigCache = new Map<string, SignatureInfo>();
async function signature(file: string): Promise<SignatureInfo> {
  if (!file) return { status: 'unknown' };
  if (sigCache.has(file)) return sigCache.get(file)!;
  let info: SignatureInfo;
  if (!fs.existsSync(file)) info = { status: 'missing' };
  else {
    const r = await run('/usr/bin/codesign', ['-dv', '--verbose=2', file], 10000);
    const t = r.err + r.out;
    if (/not signed at all/.test(t)) info = { status: 'unsigned' };
    else if (/Signature=adhoc/.test(t)) info = { status: 'adhoc' };
    else {
      const auth = /Authority=([^\n]+)/.exec(t)?.[1]?.trim();
      if (!auth) info = /Identifier=com\.apple\./.test(t) || file.startsWith('/System/') || file.startsWith('/usr/') ? { status: 'apple', signer: 'Apple' } : { status: 'unknown' };
      else if (/^(Software Signing|Apple Mac OS Application Signing|Apple iPhone OS)/.test(auth)) info = { status: 'apple', signer: 'Apple' };
      else {
        const v = await run('/usr/bin/codesign', ['--verify', file], 10000);
        const signer = auth.replace(/^Developer ID Application:\s*/, '').replace(/^Apple Development:\s*/, '');
        info = v.ok ? { status: 'developer', signer } : { status: 'invalid', signer };
      }
    }
  }
  sigCache.set(file, info);
  return info;
}

function executableOf(item: StartupItem): string {
  if (item.kind === 'login') return item.location || '';
  // "Program" ou primeiro argumento do ProgramArguments (o detail é a linha de comando completa)
  const d = item.detail.trim();
  if (!d) return '';
  if (fs.existsSync(d)) return d;
  const first = d.split(' ')[0];
  // caminhos com espaço: cresce até achar um arquivo existente
  const parts = d.split(' ');
  for (let i = parts.length; i > 0; i--) { const c = parts.slice(0, i).join(' '); if (c.startsWith('/') && fs.existsSync(c)) return c; }
  return first;
}

const H = os.homedir();
const AS = (...p: string[]) => path.join(H, 'Library', 'Application Support', ...p);

export const protection: ProtectionApi = {
  status, signature, executableOf,
  browserRoots: () => [
    { browser: 'Google Chrome', root: AS('Google', 'Chrome'), type: 'chromium' },
    { browser: 'Microsoft Edge', root: AS('Microsoft Edge'), type: 'chromium' },
    { browser: 'Brave', root: AS('BraveSoftware', 'Brave-Browser'), type: 'chromium' },
    { browser: 'Vivaldi', root: AS('Vivaldi'), type: 'chromium' },
    { browser: 'Arc', root: AS('Arc', 'User Data'), type: 'chromium' },
    { browser: 'Firefox', root: AS('Firefox', 'Profiles'), type: 'firefox' },
  ],
  async systemExtensions() {
    // extensões do Safari registradas no sistema (apps que trazem .appex)
    const r = await run('/usr/bin/pluginkit', ['-mAvvv', '-p', 'com.apple.Safari.web-extension']);
    const out: { id: string; name: string; browser: string; path: string }[] = [];
    for (const block of r.out.split(/\n(?=\s*\S+\(\d)/)) {
      const name = /Display Name = (.+)/.exec(block)?.[1]?.trim();
      const p = /Path = (.+)/.exec(block)?.[1]?.trim();
      const id = /^\s*(\S+)\(/.exec(block)?.[1] || p || '';
      if (name && p) out.push({ id, name, browser: 'Safari', path: p });
    }
    return out;
  },
};
