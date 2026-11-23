// Proteção: junta o estado das defesas do SO, avalia o que inicia sozinho (assinatura e local) e
// lista extensões de navegador. Não é um antivírus: aponta o que merece atenção e deixa o usuário decidir.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { system } from './platform';
import type { SecurityCheck, SignatureInfo, StartupItem } from './platform';

export interface PersistenceFinding {
  id: string; name: string; kind: string; executable: string; detail: string;
  signature: SignatureInfo; level: 'ok' | 'warn' | 'risk'; reasons: string[];
  /** id do item na lista de itens de início, quando dá para desativar por lá */
  startupId?: string; enabled: boolean; control?: StartupItem['control'];
}
export interface ExtensionInfo { id: string; name: string; browser: string; version?: string; path: string; allSites?: boolean; profile?: string }
export interface ProtectionReport { at: number; checks: SecurityCheck[]; persistence: PersistenceFinding[]; extensions: ExtensionInfo[]; quickScanName?: string }

const H = os.homedir();
const SUSPICIOUS = process.platform === 'win32'
  ? [/\\AppData\\Local\\Temp\\/i, /\\Windows\\Temp\\/i, /\\Users\\Public\\/i, /^[A-Z]:\\ProgramData\\[^\\]+\.exe$/i, /\\\$Recycle\.Bin\\/i]
  : [/^\/(private\/)?(tmp|var\/tmp)\//, /^\/Users\/Shared\//, /\/\.[^/]+\//, new RegExp(`^${H.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/Library/Application Support/[0-9a-f]{8,}/`, 'i')];
const SCRIPT_HOST = /(^|[\\/])(bash|sh|zsh|python3?|perl|ruby|osascript|node|powershell|pwsh|wscript|cscript|mshta|cmd)(\.exe)?$/i;

function assess(exe: string, sig: SignatureInfo, detail: string): { level: PersistenceFinding['level']; reasons: string[] } {
  const reasons: string[] = [];
  const suspicious = SUSPICIOUS.some((re) => re.test(exe)) || SUSPICIOUS.some((re) => re.test(detail));
  if (sig.status === 'missing') reasons.push('O programa não existe mais (item quebrado)');
  if (sig.status === 'unsigned') reasons.push('Programa sem assinatura digital');
  if (sig.status === 'adhoc') reasons.push('Assinatura sem identificação do desenvolvedor');
  if (sig.status === 'invalid') reasons.push('Assinatura inválida: o programa foi alterado depois de assinado');
  if (suspicious) reasons.push('Roda de uma pasta incomum (temporária, oculta ou compartilhada)');
  if (SCRIPT_HOST.test(exe)) reasons.push('Executa um script por um interpretador');
  const risk = sig.status === 'invalid' || (suspicious && ['unsigned', 'adhoc', 'missing', 'unknown'].includes(sig.status)) || (SCRIPT_HOST.test(exe) && suspicious);
  const level = risk ? 'risk' : reasons.length ? 'warn' : 'ok';
  return { level, reasons };
}

async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k]); } }));
  return res;
}

// ---------- extensões ----------
function readJson(p: string): any { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; } }
function chromiumName(dir: string, manifest: any): string {
  const raw: string = manifest.name || '';
  const m = /^__MSG_(.+)__$/.exec(raw);
  if (!m) return raw;
  for (const loc of [manifest.default_locale, 'pt_BR', 'pt', 'en', 'en_US'].filter(Boolean)) {
    const msgs = readJson(path.join(dir, '_locales', loc, 'messages.json'));
    if (!msgs) continue;
    const key = Object.keys(msgs).find((k) => k.toLowerCase() === m[1].toLowerCase());
    if (key && msgs[key]?.message) return msgs[key].message;
  }
  return raw;
}
function browserExtensions(): ExtensionInfo[] {
  const out: ExtensionInfo[] = [];
  for (const b of system.protection.browserRoots()) {
    let profiles: string[] = [];
    try { profiles = fs.readdirSync(b.root); } catch { continue; }
    for (const prof of profiles) {
      if (b.type === 'chromium') {
        const extDir = path.join(b.root, prof, 'Extensions');
        let ids: string[] = [];
        try { ids = fs.readdirSync(extDir); } catch { continue; }
        for (const id of ids) {
          let vers: string[] = [];
          try { vers = fs.readdirSync(path.join(extDir, id)).filter((v) => !v.startsWith('.')); } catch { continue; }
          const ver = vers.sort().pop();
          if (!ver) continue;
          const dir = path.join(extDir, id, ver);
          const man = readJson(path.join(dir, 'manifest.json'));
          if (!man) continue;
          const perms = [...(man.permissions || []), ...(man.host_permissions || []), ...((man.content_scripts || []).flatMap((c: any) => c.matches || []))].map(String);
          out.push({ id: `${b.browser}:${prof}:${id}`, name: chromiumName(dir, man) || id, browser: b.browser, version: man.version, path: dir, profile: prof === 'Default' ? undefined : prof,
            allSites: perms.some((p) => p === '<all_urls>' || /^(\*|https?):\/\/\*\/\*/.test(p)) });
        }
      } else {
        const data = readJson(path.join(b.root, prof, 'extensions.json'));
        for (const a of data?.addons || []) {
          if (a.type !== 'extension' || /^app-/.test(a.location || '') || a.isSystem) continue;
          out.push({ id: `${b.browser}:${prof}:${a.id}`, name: a.defaultLocale?.name || a.id, browser: b.browser, version: a.version, path: a.path || path.join(b.root, prof),
            allSites: (a.userPermissions?.origins || []).some((o: string) => o === '<all_urls>') });
        }
      }
    }
  }
  return out;
}

export async function scan(): Promise<{ report: ProtectionReport; startupItems: StartupItem[] }> {
  const p = system.protection;
  const [checks, startup, extra, sysExt] = await Promise.all([
    p.status().catch(() => [] as SecurityCheck[]),
    system.perf.startupItems().catch(() => [] as StartupItem[]),
    p.extraPersistence?.().catch(() => []) ?? Promise.resolve([]),
    p.systemExtensions?.().catch(() => []) ?? Promise.resolve([]),
  ]);
  const entries = [
    ...startup.map((s) => ({ id: s.id, name: s.name, kind: s.kind, exe: p.executableOf(s), detail: s.detail, startupId: s.id, enabled: s.enabled, control: s.control })),
    ...extra.map((t) => ({ id: t.id, name: t.name, kind: t.kind, exe: t.path, detail: t.detail, startupId: undefined, enabled: true, control: undefined })),
  ];
  const persistence = await mapLimit(entries, 6, async (e): Promise<PersistenceFinding> => {
    const signature = await p.signature(e.exe).catch((): SignatureInfo => ({ status: 'unknown' }));
    // o próprio CleanCode usa assinatura ad-hoc (sem conta Apple): conhecido, não é alerta
    const own = /[\\/]CleanCode(\.app|\.exe)?([\\/]|$)/i.test(e.exe);
    const a = own ? { level: 'ok' as const, reasons: [] as string[] } : assess(e.exe, signature, e.detail);
    return { id: e.id, name: e.name, kind: e.kind, executable: e.exe, detail: e.detail, signature, level: a.level, reasons: a.reasons, startupId: e.startupId, enabled: e.enabled, control: e.control };
  });
  const rank = { risk: 0, warn: 1, ok: 2 };
  persistence.sort((a, b) => rank[a.level] - rank[b.level] || a.name.localeCompare(b.name));
  const extensions = [...browserExtensions(), ...sysExt].sort((a, b) => a.browser.localeCompare(b.browser) || a.name.localeCompare(b.name));
  return { report: { at: Date.now(), checks, persistence, extensions, quickScanName: p.quickScanName }, startupItems: startup };
}
