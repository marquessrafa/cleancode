import { isMac } from './api';
import { t as tr, LOCALE } from './i18n';
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function fmtSize(n: number | undefined, units = 'auto', decimals = 1): string {
  if (n == null || isNaN(n)) return '—';
  const neg = n < 0;
  let v = Math.abs(n);
  let i: number;
  if (units === 'auto') { i = 0; while (v >= 1024 && i < UNITS.length - 1) { v /= 1024; i++; } }
  else { i = Math.max(0, UNITS.indexOf(units)); v = v / Math.pow(1024, i); }
  const d = i === 0 ? 0 : decimals;
  return (neg ? '-' : '') + v.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }) + ' ' + UNITS[i];
}
export const fmtNum = (n: number | undefined) => (n == null ? '—' : n.toLocaleString(LOCALE));
export const fmtPct = (p: number | undefined, d = 1) => (p == null ? '—' : (p * 100).toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }) + '%');
export function fmtDate(t: number | undefined, withTime = false): string {
  if (!t) return '—';
  const d = new Date(t);
  return withTime ? d.toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' }) : d.toLocaleDateString(LOCALE);
}
export function fmtRelative(t: number | undefined): string {
  if (!t) return 'nunca registrado';
  const diff = Date.now() - t;
  const day = 86400000;
  if (diff < 0) return tr("agora");
  if (diff < day) return tr("hoje");
  if (diff < 2 * day) return tr("ontem");
  if (diff < 30 * day) return tr("há {0} dias", Math.floor(diff / day));
  if (diff < 365 * day) { const m = Math.floor(diff / (30.4 * day)); return m === 1 ? tr("há 1 mês") : tr("há {0} meses", m); }
  const y = Math.floor(diff / (365 * day));
  return y === 1 ? tr("há 1 ano") : tr("há {0} anos", y);
}
export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min ${s % 60}s`;
}
export const extOf = (n: string) => { const i = n.lastIndexOf('.'); return i > 0 && i < n.length - 1 ? n.slice(i + 1).toLowerCase() : ''; };
export const baseName = (p: string) => (isMac ? p.replace(/\/+$/, '').split('/') : p.replace(/\\+$/, '').split('\\')).pop() || p;
/** rótulo curto da unidade: "C:" no Windows, o ponto de montagem no macOS ("/", "/Volumes/X") */
export const driveTag = (root: string) => (isMac ? root : root.slice(0, 2));

export function attrString(a: number): string {
  const m: [number, string][] = [[1, 'R'], [2, 'H'], [4, 'S'], [0x10, 'D'], [0x20, 'A'], [0x800, 'C'], [0x200, 'P'], [0x100, 'T'], [0x1000, 'O'], [0x400, 'L'], [0x4000, 'E']];
  return m.filter(([b]) => a & b).map(([, s]) => s).join('');
}

export interface Category { key: string; label: string; color: string; exts: string[] }
export const CATEGORIES: Category[] = [
  { key: 'video', label: tr("Vídeos"), color: '#8b5cf6', exts: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'flv', 'm4v', 'mpg', 'mpeg', 'ts', 'vob', '3gp'] },
  { key: 'image', label: tr("Imagens"), color: '#ec4899', exts: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'tif', 'tiff', 'raw', 'cr2', 'nef', 'psd', 'svg', 'ico', 'avif', 'dng'] },
  { key: 'audio', label: tr("Áudio"), color: '#f59e0b', exts: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'aiff', 'mid'] },
  { key: 'doc', label: tr("Documentos"), color: '#3b82f6', exts: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'txt', 'rtf', 'md', 'csv', 'epub', 'one', 'pst', 'ost'] },
  { key: 'archive', label: tr("Compactados e imagens de disco"), color: '#ef4444', exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst', 'zs', 'iso', 'img', 'vhd', 'vhdx', 'vmdk', 'nsp', 'xci', 'cab', 'wim', 'esd', 'dmg'] },
  { key: 'exe', label: tr("Programas e bibliotecas"), color: '#10b981', exts: ['exe', 'dll', 'msi', 'msix', 'appx', 'sys', 'ocx', 'drv', 'com', 'bat', 'cmd', 'ps1', 'jar', 'apk', 'node', 'so', 'pyd', 'efi', 'mui'] },
  { key: 'code', label: tr("Código-fonte"), color: '#06b6d4', exts: ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'scss', 'json', 'xml', 'yml', 'yaml', 'sql', 'kt', 'swift', 'lua', 'map', 'pdb', 'obj', 'lib', 'pch', 'ipch'] },
  { key: 'game', label: tr("Dados de jogos"), color: '#d946ef', exts: ['cas', 'paz', 'xsub', 'xpak', 'xpakdata', 'ff', 'toc', 'pak', 'forge', 'vpk', 'bsa', 'ba2', 'wad', 'upk', 'uasset', 'uexp', 'ucas', 'utoc', 'rpf', 'dcache', 'fp', 'big', 'arc', 'cpk', 'bnk', 'pck', 'wem', 'nsp', 'xci'] },
  { key: 'data', label: tr("Dados, caches e bancos de dados"), color: '#a3a3a3', exts: ['bin', 'dat', 'db', 'sqlite', 'ldb', 'log', 'tmp', 'cache', 'pak', 'blob', 'idx', 'etl', 'evtx', 'mdf', 'ldf', 'bak', 'dmp', 'pf', 'sst', 'pma'] },
];
const EXT_CAT = new Map<string, Category>();
for (const c of CATEGORIES) for (const e of c.exts) EXT_CAT.set(e, c);
export const OTHER: Category = { key: 'other', label: tr("Outros"), color: '#64748b', exts: [] };
export const categoryOf = (ext: string) => EXT_CAT.get(ext) || OTHER;
export const typeLabel = (name: string, kind: string) => {
  if (kind === 'dir') return 'Pasta';
  const e = extOf(name);
  return e ? `Arquivo ${e.toUpperCase()}` : tr("Arquivo");
};

export const PALETTE = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#a855f7'];
