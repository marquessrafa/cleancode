// Integração com o Windows (processo principal).
import { app, nativeImage } from 'electron';
import { execFile, spawn } from 'child_process';
import path from 'path';
import type { SystemApi, MonitorEvent } from '../types';
import { listApps, uninstallApp, removeEntry } from './apps';
import { driveHardware } from './hardware';
import { metrics } from './metrics';
import { junk } from './junk';
import { perf } from './perf';
import { repairs } from './repairs';
import { game } from './game';
import { protection } from './protection';

// ---------- registro ----------
function regOk(args: string[]): Promise<boolean> {
  return new Promise((res) => execFile('reg.exe', args, { windowsHide: true }, (err) => res(!err)));
}
function regOut(args: string[]): Promise<string> {
  return new Promise((res) => execFile('reg.exe', args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (_e, out) => res(out || '')));
}
async function subkeys(key: string): Promise<string[]> {
  const out = await regOut(['query', key]);
  return out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.toUpperCase().startsWith(key.toUpperCase().replace(/^HKLM/, 'HKEY_LOCAL_MACHINE').replace(/^HKCU/, 'HKEY_CURRENT_USER') + '\\'));
}
async function values(key: string): Promise<Record<string, string>> {
  const out = await regOut(['query', key]);
  const r: Record<string, string> = {};
  for (const l of out.split(/\r?\n/)) {
    const m = /^\s{2,}(\S.*?)\s{2,}REG_\w+\s{2,}(.*)$/.exec(l);
    if (m) r[m[1]] = m[2].trim();
  }
  return r;
}

// ---------- monitor de programas ----------
const UNINSTALL_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];
// pacotes Store/MSIX do usuário (legível sem administrador)
const APPX_KEY = 'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages';

async function installedAppKeys(): Promise<Set<string>> {
  const all = new Set<string>();
  for (const k of [...UNINSTALL_KEYS, APPX_KEY]) for (const s of await subkeys(k)) all.add(s);
  return all;
}
async function describeInstalledApp(key: string): Promise<MonitorEvent> {
  const v = await values(key);
  const isAppx = key.toUpperCase().includes('APPMODEL\\REPOSITORY');
  let name = v.DisplayName || '';
  if (!name || name.startsWith('@') || name.startsWith('ms-resource')) {
    const pkg = key.split('\\').pop() || '';
    name = (isAppx ? pkg.split('_')[0] : pkg).replace(/^(Microsoft(Corporation(II)?)?)\./, '').replace(/\./g, ' ');
  }
  const loc = (v.InstallLocation || v.PackageRootFolder || '').replace(/^"|"$/g, '');
  const drive = /^[a-zA-Z]:/.test(loc) ? loc.slice(0, 2).toUpperCase() : 'C:';
  const kb = parseInt(v.EstimatedSize || '', 16);
  return { kind: 'app', title: 'Novo programa instalado', drive, amount: isNaN(kb) ? 0 : kb * 1024, detail: name, app: { key, name } };
}

// ---------- menu de contexto do Explorer ----------
const CTX_KEYS = ['Directory\\shell\\CleanCode', 'Drive\\shell\\CleanCode', 'Directory\\Background\\shell\\CleanCode'];
const CTX_PROBE = 'HKCU\\Software\\Classes\\Directory\\shell\\CleanCode';

const win32: SystemApi = {
  osName: 'Windows',
  fileManager: 'Explorer',
  canElevate: true,

  relaunchAsAdmin(extra) {
    const args = [...process.argv.slice(1), ...extra].filter((a) => a !== '--cc-elevated');
    const argList = [...args, '--cc-elevated'].map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
    const cmd = `Start-Process -FilePath '${process.execPath.replace(/'/g, "''")}' -Verb RunAs` + (argList ? ` -ArgumentList ${argList}` : '');
    execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true }, (err) => {
      if (!err) app.exit(0);
    });
  },

  windowChrome: (c) => ({ titleBarStyle: 'hidden', titleBarOverlay: { color: c.color, symbolColor: c.symbolColor, height: 40 } }),
  setTitleBarColors(win, c) {
    try { win.setTitleBarOverlay({ ...c, height: 40 }); } catch { /* */ }
  },
  trayImage(baseDir) {
    const img = nativeImage.createFromPath(path.join(baseDir, 'build', 'icon.ico'));
    return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 });
  },
  popupCorner: 'bottom-right',

  fullDiskAccess: () => null,
  openFullDiskAccessSettings() { /* não se aplica */ },

  showProperties(p) {
    // abre a caixa de propriedades do Explorer
    const dir = path.dirname(p), name = path.basename(p);
    const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
    execFile('powershell.exe', ['-NoProfile', '-STA', '-Command',
      `$s=New-Object -ComObject Shell.Application; $f=$s.Namespace(${q(dir)}).ParseName(${q(name)}); $f.InvokeVerb('properties'); Start-Sleep -Seconds 60`], { windowsHide: true });
  },

  contextMenu: {
    supported: true,
    status: () => regOk(['query', CTX_PROBE]),
    async set(enable, { exe, packaged, appDir }) {
      for (const k of CTX_KEYS) {
        const key = 'HKCU\\Software\\Classes\\' + k;
        if (enable) {
          const arg = k.includes('Background') ? '%V' : '%1';
          await regOk(['add', key, '/ve', '/d', 'Analisar com CleanCode', '/f']);
          await regOk(['add', key, '/v', 'Icon', '/d', `"${exe}",0`, '/f']);
          const cmd = packaged ? `"${exe}" "${arg}"` : `"${exe}" "${appDir}" "${arg}"`;
          await regOk(['add', key + '\\command', '/ve', '/d', cmd, '/f']);
        } else {
          await regOk(['delete', key, '/f']);
        }
      }
      return regOk(['query', CTX_PROBE]);
    },
  },

  listApps,
  appLeftovers: async () => [],
  uninstallApp,
  removeEntry,
  driveHardware,
  installedAppKeys,
  describeInstalledApp,
  setBackgroundMode() { /* a barra de tarefas some sozinha com a janela escondida */ },

  metrics,
  junk,
  perf,
  repairs,
  game,
  protection,

  loginItem: {
    set: (open) => app.setLoginItemSettings({ openAtLogin: open, path: process.execPath, args: ['--hidden'] }),
    get: () => app.getLoginItemSettings({ path: process.execPath, args: ['--hidden'] }).openAtLogin,
    launchedAtLogin: () => process.argv.includes('--hidden'),
  },

  /** Roda o instalador NSIS em modo silencioso e encerra o app; o NSIS reabre o CleanCode ao terminar. */
  installUpdate(file, quit, relaunch) {
    // reinstala na mesma pasta e no mesmo modo da instalação atual
    const dir = path.dirname(process.execPath);
    // instalação "para todos os usuários" fica em Program Files; a "só para mim" fica no perfil
    const pf = [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map((p) => p!.toLowerCase() + '\\');
    const perMachine = pf.some((p) => (dir.toLowerCase() + '\\').startsWith(p));
    const args = ['/S', '--updated', ...(relaunch ? ['--force-run'] : []), perMachine ? '/allusers' : '/currentuser', `/D=${dir}`]; // /D precisa ser o último e sem aspas
    const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true });
    child.unref();
    setTimeout(quit, 400);
  },
};

export default win32;
