// Categorias da Limpeza no Windows. Pastas do sistema (Windows\Temp, SoftwareDistribution) exigem
// administrador; sem ele, os itens sem acesso são simplesmente ignorados.
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import type { JunkApi, JunkCategory } from '../types';

const H = os.homedir();
const LOCAL = process.env.LOCALAPPDATA || path.join(H, 'AppData', 'Local');
const ROAMING = process.env.APPDATA || path.join(H, 'AppData', 'Roaming');
const WIN = process.env.SystemRoot || 'C:\\Windows';
const PDATA = process.env.ProgramData || 'C:\\ProgramData';

const ps = (script: string, timeout = 120000) => new Promise<string>((resolve, reject) =>
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', timeout, windowsHide: true }, (e, out, err) => (e ? reject(new Error(String(err || e.message))) : resolve(out || ''))));

// pastas de cache dentro dos perfis dos navegadores Chromium
const CHROMIUM_CACHE_DIRS = ['Cache', 'Code Cache', 'GPUCache', 'CacheStorage', 'DawnCache', 'GrShaderCache'];
const browserRoots = [
  path.join(LOCAL, 'Google', 'Chrome', 'User Data'),
  path.join(LOCAL, 'Microsoft', 'Edge', 'User Data'),
  path.join(LOCAL, 'BraveSoftware', 'Brave-Browser', 'User Data'),
  path.join(LOCAL, 'Vivaldi', 'User Data'),
  path.join(ROAMING, 'Opera Software', 'Opera Stable'),
];

const categories: JunkCategory[] = [
  {
    id: 'user-temp', name: 'Temporários do usuário', group: 'Sistema', selected: true, risk: 'safe',
    description: 'Arquivos que programas criam e esquecem em %TEMP%, com mais de 1 dia.',
    targets: [{ path: os.tmpdir(), mode: 'children', minAgeDays: 1 }],
  },
  {
    id: 'win-temp', name: 'Temporários do Windows', group: 'Sistema', selected: true, risk: 'safe',
    description: 'Pasta Windows\\Temp (exige executar como administrador).',
    targets: [{ path: path.join(WIN, 'Temp'), mode: 'children', minAgeDays: 1 }],
  },
  {
    id: 'browser-caches', name: 'Caches de navegadores', group: 'Sistema', selected: true, risk: 'safe',
    description: 'Páginas e imagens guardadas pelo Chrome, Edge, Brave, Opera e Firefox. Senhas e histórico não são tocados.',
    targets: [
      ...browserRoots.map((r) => ({ path: r, mode: 'children' as const, findDirs: CHROMIUM_CACHE_DIRS, maxDepth: 2 })),
      { path: path.join(LOCAL, 'Mozilla', 'Firefox', 'Profiles'), mode: 'children', findDirs: ['cache2'], maxDepth: 2 },
    ],
  },
  {
    id: 'error-reports', name: 'Relatórios de erro', group: 'Sistema', selected: true, risk: 'safe',
    description: 'Relatórios do Windows Error Reporting e despejos de memória de programas que travaram.',
    targets: [
      { path: path.join(LOCAL, 'Microsoft', 'Windows', 'WER'), mode: 'children' },
      { path: path.join(PDATA, 'Microsoft', 'Windows', 'WER'), mode: 'children' },
      { path: path.join(LOCAL, 'CrashDumps'), mode: 'children' },
    ],
  },
  {
    id: 'thumbnails', name: 'Cache de miniaturas', group: 'Sistema', selected: false, risk: 'safe',
    description: 'Miniaturas do Explorer. São refeitas ao abrir as pastas (alguns arquivos ficam em uso).',
    targets: [{ path: path.join(LOCAL, 'Microsoft', 'Windows', 'Explorer'), mode: 'children', exts: ['db'] }],
  },
  {
    id: 'update-cache', name: 'Downloads do Windows Update', group: 'Sistema', selected: false, risk: 'review',
    description: 'Atualizações já instaladas em SoftwareDistribution\\Download (exige administrador).',
    targets: [{ path: path.join(WIN, 'SoftwareDistribution', 'Download'), mode: 'children' }],
  },
  {
    id: 'recycle-bin', name: 'Lixeira', group: 'Sistema', selected: true, risk: 'safe', removal: 'delete', special: true,
    description: 'Itens já enviados para a Lixeira de todas as unidades. São apagados definitivamente.',
    targets: [],
  },
  {
    id: 'dev-caches', name: 'Caches de pacotes (npm, Gradle, pip…)', group: 'Desenvolvimento', selected: false, risk: 'review',
    description: 'Pacotes baixados por gerenciadores. São baixados de novo quando um projeto precisar.',
    targets: [
      { path: path.join(LOCAL, 'npm-cache'), mode: 'self' },
      { path: path.join(H, '.gradle', 'caches'), mode: 'self' },
      { path: path.join(LOCAL, 'pip', 'cache'), mode: 'self' },
      { path: path.join(LOCAL, 'Yarn', 'Cache'), mode: 'self' },
      { path: path.join(LOCAL, 'pnpm', 'store'), mode: 'self' },
    ],
  },
  {
    id: 'installers', name: 'Instaladores em Downloads', group: 'Arquivos', selected: false, risk: 'review',
    description: 'Arquivos .exe, .msi e .iso baixados há mais de 7 dias.',
    targets: [{ path: path.join(H, 'Downloads'), mode: 'children', exts: ['exe', 'msi', 'iso', 'msix'], minAgeDays: 7 }],
  },
  {
    id: 'old-downloads', name: 'Downloads antigos', group: 'Arquivos', selected: false, risk: 'review',
    description: 'Tudo em Downloads sem modificação há mais de 90 dias.',
    targets: [{ path: path.join(H, 'Downloads'), mode: 'children', minAgeDays: 90 }],
  },
];

export const junk: JunkApi = {
  categories: () => categories,
  async specialScan(id) {
    if (id !== 'recycle-bin') return null;
    // Shell.Application, pasta 10 = Lixeira
    const out = await ps("$i=(New-Object -ComObject Shell.Application).NameSpace(10).Items(); $s=0; foreach($x in $i){ $s += [int64]$x.ExtendedProperty('Size') }; \"$($i.Count) $s\"", 60000).catch(() => '');
    const [count, size] = out.trim().split(/\s+/).map(Number);
    return Number.isFinite(count) ? { count, size: size || 0 } : null;
  },
  async specialClean(id) {
    if (id === 'recycle-bin') await ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue');
  },
};
