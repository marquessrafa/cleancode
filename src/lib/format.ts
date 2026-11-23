import { isMac } from './api';
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function fmtSize(n: number | undefined, units = 'auto', decimals = 1): string {
  if (n == null || isNaN(n)) return '—';
  const neg = n < 0;
  let v = Math.abs(n);
  let i: number;
  if (units === 'auto') { i = 0; while (v >= 1024 && i < UNITS.length - 1) { v /= 1024; i++; } }
  else { i = Math.max(0, UNITS.indexOf(units)); v = v / Math.pow(1024, i); }
  const d = i === 0 ? 0 : decimals;
  return (neg ? '-' : '') + v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' ' + UNITS[i];
}
export const fmtNum = (n: number | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR'));
export const fmtPct = (p: number | undefined, d = 1) => (p == null ? '—' : (p * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%');
export function fmtDate(t: number | undefined, withTime = false): string {
  if (!t) return '—';
  const d = new Date(t);
  return withTime ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : d.toLocaleDateString('pt-BR');
}
export function fmtRelative(t: number | undefined): string {
  if (!t) return 'nunca registrado';
  const diff = Date.now() - t;
  const day = 86400000;
  if (diff < 0) return 'agora';
  if (diff < day) return 'hoje';
  if (diff < 2 * day) return 'ontem';
  if (diff < 30 * day) return `há ${Math.floor(diff / day)} dias`;
  if (diff < 365 * day) { const m = Math.floor(diff / (30.4 * day)); return `há ${m} ${m === 1 ? 'mês' : 'meses'}`; }
  const y = Math.floor(diff / (365 * day));
  return `há ${y} ${y === 1 ? 'ano' : 'anos'}`;
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
  { key: 'video', label: 'Vídeos', color: '#8b5cf6', exts: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'flv', 'm4v', 'mpg', 'mpeg', 'ts', 'vob', '3gp'] },
  { key: 'image', label: 'Imagens', color: '#ec4899', exts: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'tif', 'tiff', 'raw', 'cr2', 'nef', 'psd', 'svg', 'ico', 'avif', 'dng'] },
  { key: 'audio', label: 'Áudio', color: '#f59e0b', exts: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'aiff', 'mid'] },
  { key: 'doc', label: 'Documentos', color: '#3b82f6', exts: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'txt', 'rtf', 'md', 'csv', 'epub', 'one', 'pst', 'ost'] },
  { key: 'archive', label: 'Compactados e imagens de disco', color: '#ef4444', exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst', 'zs', 'iso', 'img', 'vhd', 'vhdx', 'vmdk', 'nsp', 'xci', 'cab', 'wim', 'esd', 'dmg'] },
  { key: 'exe', label: 'Programas e bibliotecas', color: '#10b981', exts: ['exe', 'dll', 'msi', 'msix', 'appx', 'sys', 'ocx', 'drv', 'com', 'bat', 'cmd', 'ps1', 'jar', 'apk', 'node', 'so', 'pyd', 'efi', 'mui'] },
  { key: 'code', label: 'Código-fonte', color: '#06b6d4', exts: ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'scss', 'json', 'xml', 'yml', 'yaml', 'sql', 'kt', 'swift', 'lua', 'map', 'pdb', 'obj', 'lib', 'pch', 'ipch'] },
  { key: 'game', label: 'Dados de jogos', color: '#d946ef', exts: ['cas', 'paz', 'xsub', 'xpak', 'xpakdata', 'ff', 'toc', 'pak', 'forge', 'vpk', 'bsa', 'ba2', 'wad', 'upk', 'uasset', 'uexp', 'ucas', 'utoc', 'rpf', 'dcache', 'fp', 'big', 'arc', 'cpk', 'bnk', 'pck', 'wem', 'nsp', 'xci'] },
  { key: 'data', label: 'Dados, caches e bancos', color: '#a3a3a3', exts: ['bin', 'dat', 'db', 'sqlite', 'ldb', 'log', 'tmp', 'cache', 'pak', 'blob', 'idx', 'etl', 'evtx', 'mdf', 'ldf', 'bak', 'dmp', 'pf', 'sst', 'pma'] },
];
const EXT_CAT = new Map<string, Category>();
for (const c of CATEGORIES) for (const e of c.exts) EXT_CAT.set(e, c);
export const OTHER: Category = { key: 'other', label: 'Outros', color: '#64748b', exts: [] };
export const categoryOf = (ext: string) => EXT_CAT.get(ext) || OTHER;
export const typeLabel = (name: string, kind: string) => {
  if (kind === 'dir') return 'Pasta';
  const e = extOf(name);
  return e ? `Arquivo ${e.toUpperCase()}` : 'Arquivo';
};

export const PALETTE = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#a855f7'];
