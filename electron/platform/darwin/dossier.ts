// Dossiê de um app do macOS, só com o que está no Mac: Info.plist, assinatura (codesign), notarização
// (spctl), permissões pedidas (entitlements), arquiteturas, Spotlight (de onde veio, uso), quarentena,
// frameworks, licenças e os dados em ~/Library.
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { AppEntry, DossierFact, DossierLocal } from '../types';
import { binaryInfo, detectTech, findLicenses } from '../dossierCommon';
import { findLeftovers } from './apps';
import { t as tr, LOCALE } from '../../i18n';

function sh(cmd: string, args: string[], input?: string, timeout = 15000): Promise<{ out: string; err: string }> {
  return new Promise((resolve) => {
    const c = execFile(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 }, (_e, out, err) => resolve({ out: out || '', err: err || '' }));
    if (input !== undefined) c.stdin?.end(input);
  });
}
async function plist(file: string): Promise<any> {
  const { out } = await sh('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file]);
  try { return JSON.parse(out); } catch { return null; }
}
async function plistText(xml: string): Promise<any> {
  if (!xml.trim()) return null;
  const { out } = await sh('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], xml);
  try { return JSON.parse(out); } catch { return null; }
}

const CATEGORY: Record<string, string> = {
  business: tr("Negócios"), 'developer-tools': tr("Ferramentas de desenvolvimento"), education: tr("Educação"), entertainment: tr("Entretenimento"),
  finance: tr("Finanças"), games: tr("Jogos"), 'graphics-design': tr("Design gráfico"), 'healthcare-fitness': tr("Saúde e fitness"), lifestyle: tr("Estilo de vida"),
  medical: tr("Medicina"), music: tr("Música"), news: tr("Notícias"), photography: tr("Fotografia"), productivity: tr("Produtividade"), reference: tr("Referência"),
  'social-networking': tr("Redes sociais"), sports: tr("Esportes"), travel: tr("Viagem"), utilities: tr("Utilitários"), video: tr("Vídeo"), weather: tr("Clima"),
};
const ENT: [string, string][] = [
  ['com.apple.security.device.camera', tr("Câmera")], ['com.apple.security.device.audio-input', tr("Microfone")], ['com.apple.security.device.microphone', tr("Microfone")],
  ['com.apple.security.personal-information.location', tr("Localização")], ['com.apple.security.personal-information.addressbook', tr("Contatos")],
  ['com.apple.security.personal-information.calendars', tr("Calendários")], ['com.apple.security.personal-information.photos-library', tr("Fotos")],
  ['com.apple.security.network.client', tr("Internet (conexões de saída)")], ['com.apple.security.network.server', tr("Aceita conexões de rede")],
  ['com.apple.security.device.usb', 'USB'], ['com.apple.security.device.bluetooth', 'Bluetooth'], ['com.apple.security.print', tr("Impressão")],
  ['com.apple.security.files.user-selected.read-write', tr("Arquivos que você escolher")], ['com.apple.security.files.downloads.read-write', 'Pasta Downloads'],
  ['com.apple.security.automation.apple-events', 'Controlar outros apps (Apple Events)'],
];

const dateOf = (s?: string) => { if (!s) return undefined; const t = Date.parse(s); return isNaN(t) ? undefined : t; };

export async function macDossier(a: AppEntry): Promise<DossierLocal> {
  const p = a.location!;
  const facts: DossierFact[] = [];
  const badges: DossierLocal['badges'] = [];
  const f = (group: DossierFact['group'], label: string, value: unknown, kind?: DossierFact['kind'], extra?: Partial<DossierFact>) => {
    if (value === undefined || value === null || value === '' || (typeof value === 'number' && !value)) return;
    facts.push({ group, label, value: value as any, kind, ...extra });
  };
  const contents = path.join(p, 'Contents');
  const wrapped = fs.existsSync(path.join(p, 'WrappedBundle')); // app de iPhone/iPad rodando no Mac
  const info = (await plist(path.join(contents, 'Info.plist'))) || (await plist(path.join(p, 'Wrapper', 'iTunesMetadata.plist'))) || {};
  const exe = info.CFBundleExecutable ? path.join(contents, 'MacOS', info.CFBundleExecutable) : '';

  // o Gatekeeper (spctl) leva segundos em apps grandes: vem depois, por gatekeeper()
  const [cs, ent, md, qt, ps] = await Promise.all([
    sh('/usr/bin/codesign', ['-dv', '--verbose=4', p]),
    sh('/usr/bin/codesign', ['-d', '--entitlements', '-', '--xml', p]),
    sh('/usr/bin/mdls', ['-plist', '-', '-name', 'kMDItemWhereFroms', '-name', 'kMDItemAppStoreAdamID', '-name', 'kMDItemAppStoreCategory',
      '-name', 'kMDItemDateAdded', '-name', 'kMDItemLastUsedDate', '-name', 'kMDItemUseCount', '-name', 'kMDItemContentCreationDate', p]),
    sh('/usr/bin/xattr', ['-p', 'com.apple.quarantine', p]),
    sh('/bin/ps', ['-axo', 'comm=']),
  ]);
  const mdv = (await plistText(md.out)) || {};
  const entv = (await plistText(ent.out.slice(ent.out.indexOf('<?xml')))) || {};
  const csTxt = cs.err;
  const line = (k: string) => new RegExp('^' + k + '=(.*)$', 'm').exec(csTxt)?.[1]?.trim();
  const authorities = [...csTxt.matchAll(/^Authority=(.*)$/gm)].map((m) => m[1].trim());
  const team = line('TeamIdentifier');
  const signedAt = line('Timestamp') || line('Signed Time');
  const adhoc = /Signature=adhoc/.test(csTxt);
  const runtime = /flags=0x[0-9a-f]*\([^)]*runtime/.test(csTxt);
  const unsigned = /code object is not signed/i.test(csTxt);
  const mas = !!a.source && a.source === 'store' || fs.existsSync(path.join(contents, '_MASReceipt'));

  // sobre
  f('about', tr("Nome"), a.name);
  const inner = info.CFBundleDisplayName || info.CFBundleName;
  if (inner && inner !== a.name) f('about', tr("Nome interno"), inner);
  f('about', tr("Fabricante"), a.publisher);
  f('about', tr("Direitos autorais"), info.NSHumanReadableCopyright);
  const cat = String(info.LSApplicationCategoryType || mdv.kMDItemAppStoreCategory || '').replace('public.app-category.', '');
  f('about', tr("Categoria"), CATEGORY[cat] || (cat && !cat.includes('.') ? cat : undefined));
  if (wrapped) f('about', tr("Tipo"), tr("App de iPhone/iPad (roda no Mac com Apple Silicon)"));
  else if (info.LSUIElement === true || info.LSUIElement === '1') f('about', tr("Tipo"), tr("App da barra de menus (sem ícone no Dock)"));

  // instalação
  f('install', tr("Instalado em"), a.installDate, 'date');
  f('install', tr("Pasta"), p, 'path');
  f('install', tr("Tamanho do app"), a.size, 'size');
  f('install', tr("Origem"), mas ? 'Mac App Store' : a.origin);
  const from = (mdv.kMDItemWhereFroms || []).filter((u: string) => /^https?:/i.test(u));
  if (from[0]) f('install', tr("Baixado de"), from[0], 'url', { hint: from[1] ? tr("Página: {0}", from[1]) : undefined });
  if (qt.out.trim()) {
    const [, hex, agent] = qt.out.trim().split(';');
    const t = parseInt(hex, 16) * 1000;
    f('install', tr("Baixado por"), agent || undefined, 'text', { hint: t > 0 ? tr("Marcado como baixado da internet em {0}", new Date(t).toLocaleString(LOCALE)) : undefined });
  }
  const updater = mas ? 'App Store' : info.KSProductID ? 'Google Software Update (Keystone)' : /^com\.microsoft\./.test(info.CFBundleIdentifier || '') && !fs.existsSync(path.join(contents, 'Frameworks', 'Squirrel.framework')) ? 'Microsoft AutoUpdate' : info.SUFeedURL ? `Sparkle (${String(info.SUFeedURL).replace(/^https?:\/\//, '').split('/')[0]})` : fs.existsSync(path.join(contents, 'Frameworks', 'Squirrel.framework')) ? tr("Squirrel (próprio do app)") : fs.existsSync(path.join(contents, 'Frameworks', 'Sparkle.framework')) ? 'Sparkle' : undefined;
  f('install', tr("Atualizações por"), updater || tr("Não identificado (manual ou pelo próprio app)"));

  // uso
  f('usage', tr("Último uso"), a.lastUsed, 'date');
  f('usage', tr("Aberto"), a.runCount ? `${a.runCount} vezes` : undefined, 'text', { hint: tr("Contagem do Spotlight") });
  const prefix = p.replace(/\/+$/, '') + '/Contents/';
  const running = ps.out.split('\n').some((l) => l.trim().startsWith(prefix));
  f('usage', tr("Agora"), running ? tr("Em execução") : tr("Fechado"), 'text', { tone: running ? 'ok' : undefined });
  const loginItems = (() => { try { return fs.readdirSync(path.join(contents, 'Library', 'LoginItems')).filter((n) => n.endsWith('.app')); } catch { return []; } })();
  if (loginItems.length) f('usage', tr("Item de abertura embutido"), loginItems.map((n) => n.replace(/\.app$/, '')).join(', '), 'text', { hint: tr("Pode abrir sozinho com o Mac (Ajustes > Geral > Itens de Início)") });

  // técnico
  f('tech', tr("Identificador"), info.CFBundleIdentifier || a.bundleId, 'mono');
  f('tech', tr("Versão"), info.CFBundleShortVersionString);
  if (info.CFBundleVersion && info.CFBundleVersion !== info.CFBundleShortVersionString) f('tech', 'Build', info.CFBundleVersion, 'mono');
  f('tech', tr("macOS mínimo"), info.LSMinimumSystemVersion);
  const bin = exe ? binaryInfo(exe) : { archs: [] as string[] };
  const archs = [...new Set(bin.archs)];
  if (archs.length) f('tech', tr("Arquitetura"), archs.length > 1 ? `Universal (${archs.join(' + ')})` : archs[0]);
  if (archs.length === 1 && archs[0].startsWith('Intel')) badges.push({ label: tr("Só Intel"), tone: 'warn', hint: tr("Roda no Apple Silicon pelo Rosetta 2, que a Apple vai descontinuar") });
  f('tech', tr("Compilado com"), [info.DTSDKName && `SDK ${String(info.DTSDKName).replace(/^macosx/, 'macOS ')}`, info.DTXcode && `Xcode ${String(info.DTXcode).replace(/^(\d+)(\d)(\d)$/, '$1.$2.$3').replace(/^0/, '')}`].filter(Boolean).join(' · '));
  f('tech', tr("Executável"), exe, 'path');
  try { const st = fs.statSync(exe); f('tech', tr("Data do executável"), st.mtimeMs, 'date', { hint: tr("Normalmente a data em que esta versão foi gerada") }); } catch { /* */ }
  const plugins = (() => { try { return fs.readdirSync(path.join(contents, 'PlugIns')).filter((n) => /\.(appex|plugin|bundle)$/.test(n)); } catch { return []; } })();
  if (plugins.length) f('tech', tr("Extensões"), plugins.map((n) => n.replace(/\.(appex|plugin|bundle)$/, '')).slice(0, 8).join(', ') + (plugins.length > 8 ? ` +${plugins.length - 8}` : ''));
  const docs = (info.CFBundleDocumentTypes || []).flatMap((d: any) => d.CFBundleTypeExtensions || []).filter((x: string) => x && x !== '*');
  if (docs.length) f('tech', tr("Abre arquivos"), [...new Set(docs)].slice(0, 14).map((x) => '.' + x).join(' ') + (docs.length > 14 ? ' …' : ''));
  const schemes = (info.CFBundleURLTypes || []).flatMap((u: any) => u.CFBundleURLSchemes || []);
  if (schemes.length) f('tech', tr("Links que abre"), [...new Set(schemes)].slice(0, 8).map((x) => `${x}://`).join(' '), 'mono');

  // segurança
  if (unsigned) { f('security', tr("Assinatura"), tr("Sem assinatura"), 'text', { tone: 'danger' }); badges.push({ label: tr("Sem assinatura"), tone: 'danger' }); }
  else if (adhoc) { f('security', tr("Assinatura"), tr("Ad hoc (sem certificado de desenvolvedor)"), 'text', { tone: 'warn' }); badges.push({ label: tr("Assinatura ad hoc"), tone: 'warn' }); }
  else if (authorities[0]) f('security', tr("Assinado por"), authorities[0].replace(/^(Developer ID Application|Apple Mac OS Application Signing|Apple Development|Mac Developer): /, ''), 'text', { tone: 'ok', hint: authorities.join(' → ') });
  f('security', 'Equipe (Team ID)', team && team !== 'not set' ? team : undefined, 'mono');
  f('security', tr("Assinado em"), dateOf(signedAt), 'date');
  if (/Notarization Ticket=stapled/.test(csTxt)) { f('security', tr("Notarização"), tr("Ticket da Apple anexado ao app"), 'text', { tone: 'ok' }); }
  f('security', tr("Runtime reforçado"), runtime ? tr("Sim") : unsigned ? undefined : tr("Não"), 'text', { tone: runtime ? 'ok' : undefined });
  const sandbox = entv['com.apple.security.app-sandbox'] === true;
  f('security', 'Sandbox', sandbox ? tr("Sim (isolado do resto do sistema)") : tr("Não"), 'text', { tone: sandbox ? 'ok' : undefined });
  if (sandbox) badges.push({ label: tr("Sandbox"), tone: 'ok' });
  const perms = [...new Set(ENT.filter(([k]) => entv[k] === true).map(([, v]) => v))];
  if (perms.length) f('security', tr("Pode pedir acesso a"), perms.join(', '));
  const risky = ['com.apple.security.cs.disable-library-validation', 'com.apple.security.cs.allow-unsigned-executable-memory', 'com.apple.security.cs.allow-dyld-environment-variables'].filter((k) => entv[k] === true);
  if (risky.length) f('security', tr("Exceções do runtime"), risky.map((k) => k.split('.').pop()).join(', '), 'mono', { hint: tr("Comum em apps com plug-ins ou JavaScript (Electron)") });

  // tecnologias e versão do Electron
  const tech = detectTech(contents);
  if (wrapped) tech.unshift('iOS / iPadOS');
  if (info.LSRequiresIPhoneOS || info.UIDeviceFamily) tech.push('Mac Catalyst');
  for (const pl of [path.join(contents, 'Frameworks', 'Electron Framework.framework', 'Resources', 'Info.plist'), path.join(contents, 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Resources', 'Info.plist')]) {
    if (!fs.existsSync(pl)) continue;
    const ei = await plist(pl);
    if (ei?.CFBundleVersion) { const i = tech.indexOf('Electron'); if (i >= 0) tech[i] = `Electron ${ei.CFBundleVersion}`; }
    break;
  }
  if (!tech.some((x) => !/atualizações/.test(x)) && exe) tech.unshift('Nativo (Swift / Objective-C)');

  // tamanhos medidos depois, num worker (dossier:sizes): pastas grandes levariam segundos aqui
  const data = findLeftovers(a, () => -1).map((l) => ({ path: l.path, size: l.size, kind: l.kind }));

  const licenses = findLicenses(contents);
  return {
    facts, badges, tech, licenses, data, folder: p, running, aliases: [info.CFBundleName, info.CFBundleDisplayName, info.CFBundleExecutable].filter(Boolean).map(String),
    query: { name: a.name, bundleId: info.CFBundleIdentifier || a.bundleId, adamId: mdv.kMDItemAppStoreAdamID ? String(mdv.kMDItemAppStoreAdamID) : undefined, publisher: a.publisher, kind: cat === 'games' ? 'game' : 'app', mas },
  };
}

/** Avaliação do Gatekeeper (spctl): notarizado, App Store, sistema ou recusado. Leva de 1 a 15 s. */
export async function gatekeeper(p: string): Promise<{ fact: DossierFact; badge: DossierLocal['badges'][number] } | null> {
  const sp = await sh('/usr/sbin/spctl', ['-a', '-vv', '-t', 'exec', p], undefined, 60000);
  const out = sp.err + sp.out;
  if (!out.trim() || /not signed|no usable signature/i.test(out)) return null;
  const source = /source=(.*)/.exec(out)?.[1]?.trim() || '';
  if (/: accepted/.test(out)) {
    const lbl = /Notarized/i.test(source) ? tr("Notarizado pela Apple") : /App Store/i.test(source) ? 'Mac App Store' : /Apple System/i.test(source) ? tr("Sistema da Apple") : source || tr("Aceito");
    return { fact: { group: 'security', label: tr("Gatekeeper"), value: lbl, tone: 'ok' }, badge: { label: lbl, tone: 'ok' } };
  }
  return { fact: { group: 'security', label: tr("Gatekeeper"), value: tr("Recusado. O macOS mostra um aviso ao abrir."), tone: 'warn', hint: out.trim().split('\n').slice(-1)[0] }, badge: { label: tr("Não notarizado"), tone: 'warn' } };
}
