// Dossiê de um programa do Windows, só com o que está no PC: chave de desinstalação no registro,
// informações de versão do executável, assinatura digital (Authenticode), cabeçalho PE (arquitetura e
// data de compilação), manifesto MSIX, tecnologias, licenças e as pastas de dados no AppData.
import fs from 'fs';
import path from 'path';
import type { AppEntry, DossierFact, DossierLocal } from '../types';
import { binaryInfo, detectTech, findLicenses } from '../dossierCommon';
import { runPowerShell } from './apps';
import { t as tr } from '../../i18n';

const PS = String.raw`
$ErrorActionPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$a=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__ARGS__')) | ConvertFrom-Json
$reg=$null
if($a.reg){ $p=Get-ItemProperty -LiteralPath ('Registry::'+$a.reg); if($p){ $reg=[ordered]@{}; foreach($n in 'URLInfoAbout','HelpLink','URLUpdateInfo','HelpTelephone','Contact','Comments','Readme','InstallSource','Language','ModifyPath','NoModify','NoRepair','DisplayVersion','Publisher','InstallDate'){ if($p.$n -ne $null){ $reg[$n]=[string]$p.$n } } } }
$vi=$null; $sig=$null
if($a.exe -and (Test-Path -LiteralPath $a.exe)){
 $v=(Get-Item -LiteralPath $a.exe).VersionInfo
 $vi=[ordered]@{company=$v.CompanyName;product=$v.ProductName;desc=$v.FileDescription;copyright=$v.LegalCopyright;trademarks=$v.LegalTrademarks;pver=$v.ProductVersion;fver=$v.FileVersion;original=$v.OriginalFilename;lang=$v.Language;comments=$v.Comments}
 $s=Get-AuthenticodeSignature -LiteralPath $a.exe
 if($s){ $sig=[ordered]@{status=[string]$s.Status;msg=$s.StatusMessage;subject=$s.SignerCertificate.Subject;issuer=$s.SignerCertificate.Issuer;notAfter=$(if($s.SignerCertificate){$s.SignerCertificate.NotAfter.ToString('o')});ts=$(if($s.TimeStamperCertificate){$s.TimeStamperCertificate.Subject});type=[string]$s.SignatureType} }
}
$run=$false
if($a.dir){ $d=$a.dir.TrimEnd('\')+'\'; $run=[bool](Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($d,[StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1) }
[pscustomobject]@{reg=$reg;vi=$vi;sig=$sig;run=$run} | ConvertTo-Json -Depth 4 -Compress
`;

const NOISE = /unins|uninst|update|updater|crash|helper|setup|install|elevat|report|squirrel|notif|service|redist|vc_?redist/i;

/** Executável principal: o que tem o nome do programa, senão o maior. */
export function mainExe(a: AppEntry): string | undefined {
  const cands = (a.exes || []).filter((e) => /\.exe$/i.test(e) && !NOISE.test(path.basename(e)) && fs.existsSync(e));
  if (a.icon && /\.exe$/i.test(a.icon) && fs.existsSync(a.icon) && !NOISE.test(path.basename(a.icon))) cands.unshift(a.icon);
  if (!cands.length) return undefined;
  const key = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const named = cands.find((e) => { const b = path.basename(e, '.exe').toLowerCase().replace(/[^a-z0-9]/g, ''); return b.length >= 3 && (key.startsWith(b) || b.startsWith(key)); });
  if (named) return named;
  return cands.map((e) => { let s = 0; try { s = fs.statSync(e).size; } catch { /* */ } return { e, s }; }).sort((x, y) => y.s - x.s)[0].e;
}

const cn = (s?: string) => (s ? (/CN="?([^",]+)"?/.exec(s)?.[1] || s) : undefined);
const tidy = (s?: string) => (s || '').replace(/\s+/g, ' ').trim() || undefined;

/** Lê DisplayName, PublisherDisplayName e Description de um AppxManifest.xml. */
function appxManifest(dir?: string): { name?: string; publisher?: string; desc?: string; caps: string[] } | null {
  if (!dir) return null;
  let x = '';
  try { x = fs.readFileSync(path.join(dir, 'AppxManifest.xml'), 'utf8'); } catch { return null; }
  const tag = (t: string) => { const v = new RegExp(`<${t}>([^<]*)</${t}>`).exec(x)?.[1]?.trim(); return v && !v.startsWith('ms-resource:') ? v : undefined; };
  const caps = [...x.matchAll(/<(?:\w+:)?(?:Device)?Capability\s+Name="([^"]+)"/g)].map((m) => m[1]);
  return { name: tag('DisplayName'), publisher: tag('PublisherDisplayName'), desc: tag('Description'), caps: [...new Set(caps)] };
}
const CAPS: Record<string, string> = {
  internetClient: 'Internet', internetClientServer: tr("Internet (cliente e servidor)"), privateNetworkClientServer: tr("Rede local"), webcam: tr("Câmera"),
  microphone: tr("Microfone"), location: tr("Localização"), picturesLibrary: tr("Imagens"), videosLibrary: tr("Vídeos"), musicLibrary: tr("Músicas"),
  documentsLibrary: 'Documentos', removableStorage: tr("Discos removíveis"), bluetooth: 'Bluetooth', contacts: tr("Contatos"), appointments: tr("Calendário"),
  runFullTrust: tr("Acesso total (programa clássico empacotado)"), broadFileSystemAccess: tr("Todos os arquivos"), userAccountInformation: tr("Dados da conta"),
};

export async function winDossier(a: AppEntry, dataFolders: (a: AppEntry, aliases: string[]) => { path: string; size: number; kind: string }[]): Promise<DossierLocal> {
  const facts: DossierFact[] = [];
  const badges: DossierLocal['badges'] = [];
  const f = (group: DossierFact['group'], label: string, value: unknown, kind?: DossierFact['kind'], extra?: Partial<DossierFact>) => {
    if (value === undefined || value === null || value === '' || (typeof value === 'number' && !value)) return;
    facts.push({ group, label, value: value as any, kind, ...extra });
  };
  const exe = mainExe(a);
  let dir = a.location && fs.existsSync(a.location) ? a.location : exe ? path.dirname(exe) : undefined;
  // ícone/executável dentro do Windows ou na raiz do disco não diz nada sobre a pasta do programa
  if (dir && (/^[a-z]:\\?$/i.test(dir) || /^[a-z]:\\windows(\\|$)/i.test(dir))) dir = undefined;
  const args = Buffer.from(JSON.stringify({ reg: a.regPath, exe, dir }), 'utf8').toString('base64');
  let r: any = {};
  try { r = JSON.parse(await runPowerShell(PS.replace('__ARGS__', args), 30000)); } catch { /* sem PowerShell: segue só com o que o Node lê */ }
  const reg = r.reg || {}, vi = r.vi || {}, sig = r.sig;
  const mx = a.source === 'store' ? appxManifest(a.location) : null;

  // sobre
  f('about', tr("Nome"), a.name);
  f('about', tr("Descrição"), tidy(mx?.desc) || (tidy(vi.desc) !== a.name ? tidy(vi.desc) : undefined));
  f('about', tr("Fabricante"), a.publisher || mx?.publisher || tidy(vi.company));
  if (tidy(vi.company) && tidy(vi.company) !== a.publisher) f('about', tr("Empresa (executável)"), tidy(vi.company));
  f('about', tr("Direitos autorais"), tidy(vi.copyright));
  f('about', tr("Marcas"), tidy(vi.trademarks));
  f('about', tr("Comentários"), tidy(reg.Comments) || tidy(vi.comments));
  f('about', tr("Site"), tidy(reg.URLInfoAbout), 'url');
  f('about', tr("Suporte"), tidy(reg.HelpLink), 'url');
  f('about', tr("Telefone de suporte"), tidy(reg.HelpTelephone));
  f('about', tr("Contato"), tidy(reg.Contact));

  // instalação
  f('install', tr("Instalado em"), a.installDate, 'date');
  f('install', tr("Pasta"), dir, 'path');
  f('install', tr("Tamanho"), a.size, 'size', { hint: a.sizeSource === 'calculado' ? tr("Calculado pela pasta") : tr("Informado pelo instalador") });
  f('install', tr("Origem"), a.source === 'store' ? 'Microsoft Store / MSIX' : `${a.msi ? 'Windows Installer (MSI)' : tr("Instalador próprio")} · ${a.hive === 'HKCU' ? tr("só este usuário") : 'todos os usuários'}`);
  f('install', tr("Instalado a partir de"), tidy(reg.InstallSource), 'path');
  f('install', tr("Atualizações"), tidy(reg.URLUpdateInfo), 'url');
  f('install', tr("Desinstalação"), a.uninstall || (a.packageFullName ? `Remove-AppxPackage ${a.packageFullName}` : undefined), 'mono');
  if (reg.NoModify === '1' && reg.NoRepair === '1') f('install', 'Reparar / modificar', tr("Não oferece"));
  f('install', tr("Registro"), a.regPath, 'mono');
  f('install', tr("Pacote"), a.packageFullName, 'mono');

  // uso
  f('usage', tr("Último uso"), a.lastUsed, 'date', { hint: a.lastUsedSource ? tr("Fonte: {0}", a.lastUsedSource) : undefined });
  f('usage', tr("Aberto"), a.runCount ? `${a.runCount} vezes` : undefined);
  f('usage', tr("Agora"), r.run ? tr("Em execução") : tr("Fechado"), 'text', { tone: r.run ? 'ok' : undefined });

  // técnico
  f('tech', tr("Versão"), a.version || tidy(vi.pver));
  if (tidy(vi.fver) && tidy(vi.fver) !== a.version) f('tech', tr("Versão do arquivo"), tidy(vi.fver), 'mono');
  f('tech', tr("Executável"), exe, 'path');
  f('tech', tr("Nome original"), tidy(vi.original), 'mono');
  f('tech', tr("Idioma"), tidy(vi.lang));
  const bin = exe ? binaryInfo(exe) : { archs: [] as string[] };
  if (bin.archs[0]) f('tech', tr("Arquitetura"), bin.archs[0]);
  if (bin.archs[0]?.startsWith('x86')) badges.push({ label: tr("32 bits"), tone: 'warn', hint: tr("Programa de 32 bits (limite de 4 GB de memória)") });
  f('tech', tr("Compilado em"), bin.built, 'date', { hint: tr("Data gravada no cabeçalho do executável (PE)") });

  // segurança
  if (sig) {
    const ok = sig.status === 'Valid';
    const who = cn(sig.subject);
    if (ok) { f('security', tr("Assinado por"), who, 'text', { tone: 'ok', hint: sig.issuer ? tr("Emitido por {0}", cn(sig.issuer)) : undefined }); badges.push({ label: tr("Assinado"), tone: 'ok', hint: who }); }
    else if (sig.status === 'NotSigned') { f('security', tr("Assinatura"), tr("Sem assinatura digital"), 'text', { tone: 'warn' }); badges.push({ label: tr("Sem assinatura"), tone: 'warn' }); }
    else { f('security', tr("Assinatura"), `${sig.status}${who ? ` · ${who}` : ''}`, 'text', { tone: 'danger', hint: sig.msg }); badges.push({ label: tr("Assinatura inválida"), tone: 'danger' }); }
    f('security', tr("Certificado válido até"), sig.notAfter ? Date.parse(sig.notAfter) : undefined, 'date');
    f('security', tr("Carimbo de tempo"), cn(sig.ts), 'text', { hint: tr("Com carimbo, a assinatura continua válida mesmo depois que o certificado vence") });
    if (sig.type === 'Catalog') f('security', tr("Tipo de assinatura"), tr("Catálogo do Windows"));
  }
  if (mx?.caps.length) f('security', tr("Pode acessar"), mx.caps.map((c) => CAPS[c] || c).join(', '));

  const tech = dir ? detectTech(dir) : [];
  if (a.source === 'store') tech.unshift('MSIX / UWP');
  const aliases = [exe && path.basename(exe, '.exe'), tidy(vi.product), dir && path.basename(dir)].filter(Boolean) as string[];
  const data = dataFolders(a, aliases);

  return {
    facts, badges, tech, licenses: dir ? findLicenses(dir) : [], data, folder: dir, running: !!r.run,
    query: { name: a.name, publisher: a.publisher, kind: 'app' },
  };
}
