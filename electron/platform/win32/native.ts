// Bindings Win32 via koffi (FFI, sem compilador nativo). Só é carregado no Windows (ver ../fs.ts).
import koffi from 'koffi';
import { ATTR, RawEntry, DriveInfo } from '../types';
import { t as tr } from '../../i18n';

export { ATTR };
export type { RawEntry, DriveInfo };
export const sep = '\\';

const kernel32 = koffi.load('kernel32.dll');
const advapi32 = koffi.load('advapi32.dll');
const shell32 = koffi.load('shell32.dll');

const FILETIME = koffi.struct('CC_FILETIME', { lo: 'uint32', hi: 'uint32' });
export const WIN32_FIND_DATAW = koffi.struct('CC_WIN32_FIND_DATAW', {
  attr: 'uint32',
  ctime: FILETIME,
  atime: FILETIME,
  mtime: FILETIME,
  sizeHi: 'uint32',
  sizeLo: 'uint32',
  r0: 'uint32',
  r1: 'uint32',
  name: koffi.array('char16_t', 260),
  alt: koffi.array('char16_t', 14),
});

const FindFirstFileExW = kernel32.func(
  'intptr_t __stdcall FindFirstFileExW(const char16_t *name, int level, _Out_ CC_WIN32_FIND_DATAW *data, int op, void *filter, uint32 flags)'
);
const FindNextFileW = kernel32.func('int __stdcall FindNextFileW(intptr_t h, _Out_ CC_WIN32_FIND_DATAW *data)');
const FindClose = kernel32.func('int __stdcall FindClose(intptr_t h)');
const GetLastError = kernel32.func('uint32 __stdcall GetLastError()');
const GetCompressedFileSizeW = kernel32.func('uint32 __stdcall GetCompressedFileSizeW(const char16_t *name, _Out_ uint32 *hi)');
const GetDiskFreeSpaceW = kernel32.func(
  'int __stdcall GetDiskFreeSpaceW(const char16_t *root, _Out_ uint32 *spc, _Out_ uint32 *bps, _Out_ uint32 *free, _Out_ uint32 *total)'
);
const GetDiskFreeSpaceExW = kernel32.func(
  'int __stdcall GetDiskFreeSpaceExW(const char16_t *root, _Out_ uint64 *avail, _Out_ uint64 *total, _Out_ uint64 *free)'
);
const GetLogicalDrives = kernel32.func('uint32 __stdcall GetLogicalDrives()');
const GetDriveTypeW = kernel32.func('uint32 __stdcall GetDriveTypeW(const char16_t *root)');
const GetVolumeInformationW = kernel32.func(
  'int __stdcall GetVolumeInformationW(const char16_t *root, void *name, uint32 nameLen, _Out_ uint32 *serial, _Out_ uint32 *maxComp, _Out_ uint32 *flags, void *fs, uint32 fsLen)'
);
const GetFileSecurityW = advapi32.func(
  'int __stdcall GetFileSecurityW(const char16_t *name, uint32 info, void *sd, uint32 len, _Out_ uint32 *needed)'
);
const GetSecurityDescriptorOwner = advapi32.func(
  'int __stdcall GetSecurityDescriptorOwner(void *sd, _Out_ void **owner, _Out_ int *defaulted)'
);
const GetLengthSid = advapi32.func('uint32 __stdcall GetLengthSid(void *sid)');
const LookupAccountSidW = advapi32.func(
  'int __stdcall LookupAccountSidW(const char16_t *sys, void *sid, void *name, _Inout_ uint32 *nameLen, void *dom, _Inout_ uint32 *domLen, _Out_ int *use)'
);
const IsUserAnAdmin = shell32.func('int __stdcall IsUserAnAdmin()');

// ShellExecuteEx: respeita o manifesto (pede UAC quando o programa exige) e devolve o processo
const SHELLEXECUTEINFOW = koffi.struct('CC_SHELLEXECUTEINFOW', {
  cbSize: 'uint32', fMask: 'uint32', hwnd: 'void *', lpVerb: 'const char16_t *', lpFile: 'const char16_t *',
  lpParameters: 'const char16_t *', lpDirectory: 'const char16_t *', nShow: 'int', hInstApp: 'void *',
  lpIDList: 'void *', lpClass: 'const char16_t *', hkeyClass: 'void *', dwHotKey: 'uint32', hIcon: 'void *', hProcess: 'void *',
});
const ShellExecuteExW = shell32.func('int __stdcall ShellExecuteExW(_Inout_ CC_SHELLEXECUTEINFOW *info)');
const WaitForSingleObject = kernel32.func('uint32 __stdcall WaitForSingleObject(void *h, uint32 ms)');
const GetExitCodeProcess = kernel32.func('int __stdcall GetExitCodeProcess(void *h, _Out_ uint32 *code)');
const CloseHandle = kernel32.func('int __stdcall CloseHandle(void *h)');

/** Executa um programa (com UAC se o manifesto pedir) e espera terminar sem bloquear o processo. */
export function shellExecWait(file: string, params: string, dir?: string, verb?: 'runas', hidden = false): Promise<{ code: number; error?: number }> {
  const info: any = {
    // NOCLOSEPROCESS | NOASYNC | FLAG_NO_UI (sem caixas de erro do Windows; o app mostra a mensagem)
    cbSize: koffi.sizeof(SHELLEXECUTEINFOW), fMask: 0x40 | 0x100 | 0x400, hwnd: null,
    lpVerb: verb || null, lpFile: file, lpParameters: params || null, lpDirectory: dir || null, nShow: hidden ? 0 : 1,
    hInstApp: null, lpIDList: null, lpClass: null, hkeyClass: null, dwHotKey: 0, hIcon: null, hProcess: null,
  };
  if (!ShellExecuteExW(info)) return Promise.resolve({ code: -1, error: GetLastError() });
  const h = info.hProcess;
  if (!h) return Promise.resolve({ code: 0 });
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      if (WaitForSingleObject(h, 0) !== 0) return; // 0 = WAIT_OBJECT_0 (terminou)
      clearInterval(iv);
      const code = [0];
      GetExitCodeProcess(h, code);
      CloseHandle(h);
      resolve({ code: code[0] });
    }, 400);
  });
}


const EPOCH_DIFF = 11644473600000;
export function ftToMs(ft: { lo: number; hi: number }): number {
  const v = ft.hi * 4294967296 + ft.lo;
  if (v === 0) return 0;
  return Math.round(v / 10000 - EPOCH_DIFF);
}

export function longPath(p: string): string {
  if (p.startsWith('\\\\?\\')) return p;
  if (p.startsWith('\\\\')) return '\\\\?\\UNC\\' + p.slice(2);
  return '\\\\?\\' + p;
}

/** Lista uma pasta. Retorna null + código de erro em caso de falha. */
export function listDir(dir: string, cb: (e: RawEntry) => void): number {
  const pattern = longPath(dir.endsWith('\\') ? dir + '*' : dir + '\\*');
  const data: any = {};
  // level 1 = FindExInfoBasic, flag 2 = FIND_FIRST_EX_LARGE_FETCH
  const h = FindFirstFileExW(pattern, 1, data, 0, null, 2);
  if (h === -1 || h === -1n as any) return GetLastError() || 5;
  try {
    const d = data;
    for (;;) {
      const name: string = d.name;
      if (name !== '.' && name !== '..') {
        cb({
          name,
          attr: d.attr,
          size: d.sizeHi * 4294967296 + d.sizeLo,
          ctime: ftToMs(d.ctime),
          atime: ftToMs(d.atime),
          mtime: ftToMs(d.mtime),
        });
      }
      if (!FindNextFileW(h, d)) break;
    }
  } finally {
    FindClose(h);
  }
  return 0;
}

export function compressedSize(path: string): number {
  const hi = [0];
  const lo = GetCompressedFileSizeW(longPath(path), hi);
  if (lo === 0xffffffff && GetLastError() !== 0) return -1;
  return hi[0] * 4294967296 + lo;
}

export function clusterSize(root: string): number {
  const spc = [0], bps = [0], f = [0], t = [0];
  if (!GetDiskFreeSpaceW(rootOf(root), spc, bps, f, t)) return 4096;
  return spc[0] * bps[0] || 4096;
}

export function rootOf(p: string): string {
  if (/^[a-zA-Z]:/.test(p)) return p.slice(0, 2).toUpperCase() + '\\';
  const m = /^\\\\[^\\]+\\[^\\]+\\?/.exec(p);
  return m ? (m[0].endsWith('\\') ? m[0] : m[0] + '\\') : p;
}

const DRIVE_TYPES = ['Desconhecido', tr("Sem raiz"), 'Removível', 'Local', 'Rede', 'CD/DVD', 'RAM disk'];

export function drives(): DriveInfo[] {
  const mask = GetLogicalDrives();
  const out: DriveInfo[] = [];
  for (let i = 0; i < 26; i++) {
    if (!(mask & (1 << i))) continue;
    const root = String.fromCharCode(65 + i) + ':\\';
    const type = GetDriveTypeW(root);
    const avail = [0n], total = [0n], free = [0n];
    let t = 0, fr = 0;
    if (GetDiskFreeSpaceExW(root, avail, total, free)) { t = Number(total[0]); fr = Number(free[0]); }
    const nameBuf = Buffer.alloc(522), fsBuf = Buffer.alloc(522);
    let label = '', fs = '';
    if (GetVolumeInformationW(root, nameBuf, 261, [0], [0], [0], fsBuf, 261)) {
      label = utf16z(nameBuf); fs = utf16z(fsBuf);
    }
    out.push({ root, label, fs, type: DRIVE_TYPES[type] || '?', total: t, free: fr, used: t - fr });
  }
  return out;
}

function utf16z(b: Buffer): string {
  const s = b.toString('utf16le');
  const z = s.indexOf('\0');
  return z >= 0 ? s.slice(0, z) : s;
}

const sidCache = new Map<string, string>();
let sdBuf = Buffer.alloc(1024);
/** Dono de um arquivo (DOMÍNIO\usuário), com cache por SID. */
export function ownerOf(path: string): string {
  const needed = [0];
  const lp = longPath(path);
  if (!GetFileSecurityW(lp, 1 /* OWNER */, sdBuf, sdBuf.length, needed)) {
    if (needed[0] > sdBuf.length) {
      sdBuf = Buffer.alloc(needed[0] + 64);
      if (!GetFileSecurityW(lp, 1, sdBuf, sdBuf.length, needed)) return tr("(sem acesso)");
    } else return tr("(sem acesso)");
  }
  const pOwner = [null], def = [0];
  if (!GetSecurityDescriptorOwner(sdBuf, pOwner, def) || !pOwner[0]) return '(desconhecido)';
  const sid = pOwner[0];
  const len = GetLengthSid(sid);
  const key = Buffer.from(koffi.decode(sid, koffi.array('uint8', len)) as any).toString('hex');
  const hit = sidCache.get(key);
  if (hit) return hit;
  const name = Buffer.alloc(512), dom = Buffer.alloc(512);
  const nl = [256], dl = [256], use = [0];
  let res = 'SID ' + key.slice(0, 16);
  if (LookupAccountSidW(null, sid, name, nl, dom, dl, use)) {
    const n = utf16z(name), d = utf16z(dom);
    res = d ? `${d}\\${n}` : n;
  }
  sidCache.set(key, res);
  return res;
}

export function isAdmin(): boolean {
  try { return !!IsUserAnAdmin(); } catch { return false; }
}
