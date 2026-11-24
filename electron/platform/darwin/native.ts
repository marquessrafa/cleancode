// Sistema de arquivos no macOS: Node puro (sem FFI). Só é carregado no macOS (ver ../fs.ts).
import fs from 'fs';
import { execFileSync } from 'child_process';
import { ATTR, RawEntry, DriveInfo } from '../types';
import { t as tr } from '../../i18n';

export { ATTR };
export const sep = '/';

const S_IFMT = 0o170000, S_IFDIR = 0o040000, S_IFLNK = 0o120000;

/**
 * Pastas listadas mas não percorridas (como junções no Windows):
 * o volume de dados aparece de novo em /System/Volumes/Data (firmlinks), /Volumes tem os
 * outros discos (cada um é varrido à parte) e /dev é o devfs.
 */
const NO_DESCEND = new Set(['/System/Volumes/Data', '/Volumes', '/dev', '/net', '/home']);

/** errno → código no padrão Win32 que a interface já sabe explicar. */
function errCode(e: any): number {
  switch (e?.code) {
    case 'EACCES': case 'EPERM': return 5;
    case 'ENOENT': case 'ENOTDIR': return 3;
    case 'EBUSY': return 32;
    default: return 1;
  }
}

export function listDir(dir: string, cb: (e: RawEntry) => void): number {
  let names: string[];
  try { names = fs.readdirSync(dir); } catch (e) { return errCode(e); }
  const base = dir.endsWith('/') ? dir : dir + '/';
  for (const name of names) {
    const full = base + name;
    let st: fs.Stats | undefined;
    try { st = fs.lstatSync(full, { throwIfNoEntry: false }); } catch { continue; }
    if (!st) continue; // sumiu entre a listagem e o lstat
    const t = st.mode & S_IFMT;
    let attr = 0;
    if (t === S_IFDIR) attr |= ATTR.DIRECTORY;
    if (t === S_IFLNK) attr |= ATTR.REPARSE; // links simbólicos: mostrados, nunca seguidos
    if (t === S_IFDIR && NO_DESCEND.has(full)) attr |= ATTR.REPARSE;
    if (name.startsWith('.')) attr |= ATTR.HIDDEN;
    if (!(st.mode & 0o222)) attr |= ATTR.READONLY;
    const size = t === S_IFDIR ? 0 : st.size;
    const alloc = t === S_IFDIR ? 0 : st.blocks * 512;
    // APFS/HFS+ com compressão (decmpfs): ocupa bem menos blocos que o tamanho lógico
    if (t !== S_IFDIR && t !== S_IFLNK && size > 4096 && alloc + 4096 < size) attr |= ATTR.COMPRESSED;
    cb({ name, attr, size, alloc, ctime: st.birthtimeMs, atime: st.atimeMs, mtime: st.mtimeMs });
  }
  return 0;
}

export function compressedSize(p: string): number {
  try { return fs.lstatSync(p).blocks * 512; } catch { return -1; }
}

export function clusterSize(root: string): number {
  try { return fs.statfsSync(root).bsize || 4096; } catch { return 4096; }
}

/** Raiz do volume: /Volumes/<nome> ou / */
export function rootOf(p: string): string {
  const m = /^\/Volumes\/[^/]+/.exec(p);
  return m ? m[0] : '/';
}

// ---------- unidades ----------
interface Mount { dev: string; on: string; fs: string; flags: string[] }
let mountCache: { at: number; list: Mount[] } | null = null;
function mounts(): Mount[] {
  if (mountCache && Date.now() - mountCache.at < 5000) return mountCache.list;
  let out = '';
  try { out = execFileSync('/sbin/mount', { encoding: 'utf8', timeout: 5000 }); } catch { /* */ }
  const list: Mount[] = [];
  for (const l of out.split('\n')) {
    // /dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)
    const m = /^(.+?) on (.+) \(([^)]*)\)$/.exec(l);
    if (!m) continue;
    const [fsType, ...flags] = m[3].split(',').map((s) => s.trim());
    list.push({ dev: m[1], on: m[2], fs: fsType, flags });
  }
  mountCache = { at: Date.now(), list };
  return list;
}

const FS_NAMES: Record<string, string> = { apfs: 'APFS', hfs: 'HFS+', msdos: 'FAT32', exfat: 'exFAT', ntfs: 'NTFS', smbfs: 'SMB', afpfs: 'AFP', nfs: 'NFS', webdav: 'WebDAV' };

function driveOf(root: string, label: string, m: Mount | undefined): DriveInfo | null {
  let s: fs.StatsFs;
  try { s = fs.statfsSync(root); } catch { return null; }
  const total = s.blocks * s.bsize, free = s.bavail * s.bsize;
  const local = !m || m.flags.includes('local');
  // discos externos montam com nosuid/noowners; o volume do sistema e os internos, não
  const type = !local ? 'Rede' : root !== '/' && m && (m.flags.includes('noowners') || m.flags.includes('nosuid')) ? 'Removível' : 'Local';
  return { root, label, fs: m ? FS_NAMES[m.fs] || m.fs.toUpperCase() : '', type, total, free, used: total - free };
}

export function drives(): DriveInfo[] {
  const ms = mounts();
  const out: DriveInfo[] = [];
  let rootDev = -1, rootLabel = 'Macintosh HD';
  try { rootDev = fs.statSync('/').dev; } catch { /* */ }
  const vols: string[] = [];
  try { for (const n of fs.readdirSync('/Volumes')) vols.push(n); } catch { /* */ }
  // o volume do sistema aparece em /Volumes como link para "/"
  for (const n of vols) {
    try { if (fs.lstatSync('/Volumes/' + n).isSymbolicLink() && fs.realpathSync('/Volumes/' + n) === '/') rootLabel = n; } catch { /* */ }
  }
  const r = driveOf('/', rootLabel, ms.find((m) => m.on === '/'));
  if (r) out.push(r);
  for (const n of vols) {
    const p = '/Volumes/' + n;
    try {
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink() || !st.isDirectory() || st.dev === rootDev) continue;
    } catch { continue; }
    const m = ms.find((x) => x.on === p);
    if (!m || m.flags.includes('nobrowse')) continue; // pasta vazia sem volume montado, ou volume interno do sistema
    const d = driveOf(p, n, m);
    if (d) out.push(d);
  }
  return out;
}

// ---------- dono ----------
const userCache = new Map<number, string>();
export function ownerOf(p: string): string {
  let uid: number;
  try { uid = fs.lstatSync(p).uid; } catch { return tr("(sem acesso)"); }
  const hit = userCache.get(uid);
  if (hit) return hit;
  let name = `uid ${uid}`;
  try { name = execFileSync('/usr/bin/id', ['-nu', String(uid)], { encoding: 'utf8', timeout: 3000 }).trim() || name; } catch { /* usuário removido */ }
  userCache.set(uid, name);
  return name;
}

export function isAdmin(): boolean {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}
