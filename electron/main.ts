// O idioma precisa ser descoberto antes de qualquer outro módulo montar textos.
import { LANG } from './lang';
import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeTheme, nativeImage, Tray, Menu, screen, powerMonitor } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
const execFileP = promisify(execFile);
import { Monitor, MonitorEvent } from './monitor';
import { checkForUpdate, downloadUpdate, UpdateInfo, FEED_FILE } from './updater';
import * as Browsers from './browsers';
import { locateFeed, isFeed } from './feedLocator';
import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { system, drives, isAdmin, isMac } from './platform';
import { setupFdaAssistant } from './fdaAssistant';
import * as AppData from './appdata';
import type { AppEntry } from './platform';
import type { DossierQuery, GameInfo, FanConfig } from './platform/types';
import { previewState as previewFanState, previewTest as previewFanTest } from './fansPreview';
import { toCSV, toXLSX, toHTML, writeText } from './exporter';
import { snapshot as metricsSnapshot, speedTest, details as metricsDetails, eject as ejectDrive , hardwareInfo, hardwareLive } from './metrics';
import * as Cleanup from './cleanup';
import * as Protection from './protection';
import * as Clutter from './clutter';
import { appDossier, gameDossier } from './dossier';
import { onlineDossier } from './dossierOnline';
import { storageMap, storageMapStale } from './storageMap';
import { foundGames, foundGamesCached, forgetFoundGame, onGamesFound, type FoundGame } from './gameFinder';
import { t as tr, LOCALE } from './i18n';

declare const __UPDATE_SOURCE__: string; // definidas no build (scripts/build-electron.mjs)
declare const __FEED_ID__: string;
const DEFAULT_UPDATE_SOURCE = typeof __UPDATE_SOURCE__ === 'string' ? __UPDATE_SOURCE__ : '';
const FEED_ID = typeof __FEED_ID__ === 'string' ? __FEED_ID__ : '';
const isDev = !app.isPackaged && process.env.CC_DEV === '1';
app.setAppUserModelId('com.cleancode.app');
// Perfis separados: execução de desenvolvimento e perfis isolados (CLEANCODE_PROFILE) não
// compartilham configurações nem o bloqueio de instância única com o app instalado.
if (process.env.CLEANCODE_PROFILE) app.setPath('userData', path.join(app.getPath('appData'), 'CleanCode-' + process.env.CLEANCODE_PROFILE.replace(/[^\w-]/g, '')));
else if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'CleanCode-dev'));

// ---------- configurações ----------
const userDir = app.getPath('userData');
const settingsFile = path.join(userDir, 'settings.json');
const historyDir = path.join(userDir, 'history');
const DEFAULTS = {
  theme: 'system', accent: 'green', units: 'auto', decimals: 1, displayMode: 'size', showFilesInTree: false, hideEmpty: false,
  boldLarge: true, sizeBars: true, compressedBlue: true, datesWithTime: false, showErrorsAfterScan: false,
  autoSaveHistory: true, alwaysAdmin: false, staleMonths: 6, sidebarCollapsed: false, silentUninstall: false,
  columns: ['name', 'size', 'alloc', 'files', 'pct', 'mtime'], recent: [] as string[],
  treemap: { depth: 4, showFiles: false, labels: true, hierarchy: true, freeSpace: false, cushion: true },
  // segundo plano e notificações
  runInBackground: true, startWithWindows: false, notifyEnabled: true, notifyDisk: true, notifyApps: true, notifyThresholdMB: 1024,
  // atualizações (pasta com latest.yml + instalador, ou URL)
  updateSource: DEFAULT_UPDATE_SOURCE, autoCheckUpdates: true, autoInstallUpdates: true,
  // reparos: avisar quando aparecer item quebrado; ids já avisados
  notifyRepairs: true, repairsSeen: [] as string[],
  // janela de novidades: última versão cujas notas o usuário já viu
  lastSeenVersion: '',
  // 1.3.1: a 1.3.0 não mostrava as novidades para quem atualizava; marca que a correção já rodou
  whatsNewFixed: false,
  // Modo Jogo: pastas extras onde procurar jogos
  gameDirs: [] as string[],
  // idioma: 'auto' segue o idioma do computador; 'pt', 'en' ou 'es' fixa um idioma
  language: 'auto' as 'auto' | 'pt' | 'en' | 'es',
  // ventoinhas (Windows): configuração de cada ventoinha, pelo identificador do controle no LibreHardwareMonitor
  fans: {} as Record<string, FanConfig>,
};
type Settings = typeof DEFAULTS;
let settings: Settings = { ...DEFAULTS };
// já havia configurações salvas? (distingue atualização de instalação nova, para a janela de novidades)
const hadSettings = fs.existsSync(settingsFile);
try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) }; } catch { /* primeiro uso */ }
// a fonte de atualizações é obrigatória: se estiver vazia, usa a definida no app
if (!settings.updateSource) settings.updateSource = DEFAULT_UPDATE_SOURCE;
// 1.3.0: o feed passou para o repositório (os anexos do Release ficam só com os instaladores)
if (DEFAULT_UPDATE_SOURCE && /\/releases\/latest\/download\/?$/.test(settings.updateSource) && settings.updateSource !== DEFAULT_UPDATE_SOURCE) settings.updateSource = DEFAULT_UPDATE_SOURCE;
function saveSettings() { fs.mkdirSync(userDir, { recursive: true }); fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2)); }

// ---------- elevação (só onde existe: UAC no Windows) ----------
const relaunchAsAdmin = (extra: string[] = []) => system.relaunchAsAdmin(extra);
if (system.canElevate && settings.alwaysAdmin && !isAdmin() && !process.argv.includes('--cc-elevated') && app.isPackaged) {
  relaunchAsAdmin();
}

// ---------- instância única ----------
function pathFromArgv(argv: string[]): string | null {
  for (const a of argv.slice(1)) {
    if (a.startsWith('-')) continue;
    const p = a.replace(/^"|"$/g, '');
    if (/^[a-zA-Z]:\\?$/.test(p)) return p.slice(0, 2) + '\\';
    try { if (path.isAbsolute(p) && fs.statSync(p).isDirectory()) return p; } catch { /* */ }
  }
  return null;
}
if (!app.requestSingleInstanceLock()) app.quit();
let mainWin: BrowserWindow | null = null;
const windows = new Set<BrowserWindow>();
app.on('second-instance', (_e, argv) => {
  const p = pathFromArgv(argv);
  showMain();
  if (p && mainWin) mainWin.webContents.send('open-path', p);
});

// ---------- segundo plano: bandeja / barra de menus, iniciar com o sistema, monitor ----------
let startHidden = process.argv.includes('--hidden'); // confirmado por system.loginItem quando o app fica pronto
let isQuitting = false;
let tray: Tray | null = null;
let trayHintShown = false;
function showMain() {
  if (!mainWin) { mainWin = createWindow(); return; }
  if (mainWin.isMinimized()) mainWin.restore();
  system.setBackgroundMode(false);
  mainWin.show();
  mainWin.focus();
}
function quitApp() { isQuitting = true; app.quit(); }
function createTray() {
  if (tray) return;
  tray = new Tray(system.trayImage(path.join(__dirname, '..')));
  tray.setToolTip('CleanCode: monitorando discos');
  const menu = () => Menu.buildFromTemplate([
    { label: tr("Abrir CleanCode"), click: showMain },
    { type: 'separator' },
    { label: tr("Liberar memória"), click: async () => {
      const r = await system.game.freeMemory(false).catch(() => ({ ok: false, freed: 0, message: tr("Não foi possível liberar a memória") }));
      showNotification({ kind: 'update', title: r.ok ? tr("Memória liberada") : tr("Liberar memória"), detail: r.message } as MonitorEvent);
    } },
    { type: 'separator' },
    { label: tr("Notificações"), type: 'checkbox', checked: settings.notifyEnabled, click: (i) => { settings.notifyEnabled = i.checked; saveSettings(); applyMonitor(); broadcastSettings(); } },
    { label: tr("Iniciar com o {0}", system.osName), type: 'checkbox', checked: settings.startWithWindows, enabled: app.isPackaged, click: (i) => { settings.startWithWindows = i.checked; saveSettings(); applyLoginItem(); broadcastSettings(); } },
    { type: 'separator' },
    { label: tr("Sair"), click: quitApp },
  ]);
  // clique: painel com a saúde do computador; botão direito (ou Ctrl+clique no Mac): menu
  tray.on('click', (e) => { if (isMac && e.ctrlKey) tray?.popUpContextMenu(menu()); else togglePanel(); });
  tray.on('right-click', () => tray?.popUpContextMenu(menu()));
  tray.on('double-click', showMain);
  // pré-carrega as leituras do painel: ao passar o mouse no ícone e logo depois de abrir o app
  tray.on('mouse-enter', () => { metricsSnapshot().catch(() => null); });
  setTimeout(() => { metricsSnapshot().catch(() => null); }, 2500);
}

// ---------- painel da barra de menus / bandeja ----------
// A janela fica sempre no canto da tela (Mac: superior direito; Windows: inferior direito) e tem
// tamanho fixo: a largura das duas colunas e a altura da área útil. Assim abrir ou trocar um detalhe
// nunca redimensiona a janela (redimensionar uma janela transparente pisca). As partes transparentes
// deixam o clique passar para o que está atrás (setIgnoreMouseEvents com forward, controlado pelo renderer).
let panelWidth = 916;
let panelWin: BrowserWindow | null = null;
let panelHiddenAt = 0;
let panelRevealTimer: ReturnType<typeof setTimeout> | undefined;
let panelHideTimer: ReturnType<typeof setTimeout> | undefined;
// esconder o widget: a janela escondida guarda o último quadro e mostra esse quadro por um instante na próxima
// abertura (a piscada). Por isso, o renderer apaga o conteúdo primeiro, desenha um quadro vazio e avisa (panel:blanked);
// só então a janela some. Se o aviso não chegar em 150 ms, a janela some assim mesmo.
function hidePanel() {
  const w = panelWin;
  if (!w || w.isDestroyed() || !w.isVisible()) return;
  panelHiddenAt = Date.now();
  clearTimeout(panelHideTimer);
  w.webContents.send('panel:hiding');
  panelHideTimer = setTimeout(() => { if (!w.isDestroyed()) w.hide(); }, 150);
}
function placePanel() {
  if (!panelWin || panelWin.isDestroyed()) return;
  const b = tray?.getBounds();
  const disp = b && b.width ? screen.getDisplayMatching(b) : screen.getPrimaryDisplay();
  const area = disp.workArea;
  const w = Math.min(panelWidth, area.width);
  panelWin.setBounds({ x: Math.round(area.x + area.width - w), y: Math.round(area.y), width: Math.round(w), height: Math.round(area.height) }, false);
}
function createPanel() {
  const win = new BrowserWindow({
    width: panelWidth, height: 720, show: false, frame: false, transparent: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, // a sombra nativa de janela transparente não acompanha o redimensionamento
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // fecha ao clicar fora, como os painéis da barra de menus
  win.on('blur', () => { if (!win.webContents.isDevToolsOpened()) hidePanel(); });
  if (isDev) win.loadURL('http://localhost:5173/#panel');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'panel' });
  windows.add(win);
  win.on('closed', () => { windows.delete(win); panelWin = null; });
  return win;
}
function togglePanel() {
  if (panelWin && !panelWin.isDestroyed() && panelWin.isVisible()) { hidePanel(); return; }
  checkUpdatesSoon(1500);
  // o clique no ícone tira o foco do painel antes de chegar aqui: não reabrir no mesmo clique
  if (Date.now() - panelHiddenAt < 250) return;
  if (!panelWin || panelWin.isDestroyed()) panelWin = createPanel();
  placePanel();
  // mostra invisível, o renderer remonta o conteúdo com a animação de entrada e avisa (panel:ready)
  // quando o primeiro quadro novo está pronto; só então a janela fica opaca (sem quadro velho ou branco)
  const reveal = () => {
    if (!panelWin || panelWin.isDestroyed()) return;
    placePanel();
    panelWin.setOpacity(0);
    panelWin.setIgnoreMouseEvents(false);
    if (isMac) app.focus({ steal: true });
    panelWin.show(); panelWin.focus();
    panelWin.webContents.send('panel:shown');
    clearTimeout(panelRevealTimer); clearTimeout(panelHideTimer);
    panelRevealTimer = setTimeout(() => { if (panelWin && !panelWin.isDestroyed()) panelWin.setOpacity(1); }, 350);
    metricsDetails('network').catch(() => null); // pré-aquece: o detalhe de rede abre já preenchido
  };
  if (panelWin.webContents.isLoading()) panelWin.webContents.once('did-finish-load', reveal); else reveal();
}
ipcMain.handle('metrics:snapshot', () => metricsSnapshot());
ipcMain.handle('metrics:details', (_e, kind: string) => metricsDetails(kind));
ipcMain.handle('metrics:eject', (_e, root: string) => ejectDrive(root));
ipcMain.handle('hardware:info', () => hardwareInfo());
ipcMain.handle('hardware:live', () => hardwareLive());
ipcMain.handle('hardware:disks', () => system.metrics.disks().catch(() => []));
// ventoinhas: estado (ventoinhas com controle, temperaturas e o que a tarefa aplicou) e teste de uma ventoinha
// (na versão de desenvolvimento, CLEANCODE_PREVIEW_FANS=1 troca as ventoinhas reais por uma simulação; ver fansPreview.ts)
const PREVIEW_FANS = !app.isPackaged && !!process.env.CLEANCODE_PREVIEW_FANS;
ipcMain.handle('fans:state', () => {
  if (PREVIEW_FANS) return previewFanState(settings.fans);
  return system.metrics.fanState ? system.metrics.fanState().catch(() => null) : null;
});
ipcMain.handle('fans:test', (_e, id: string, pct: number | null) => {
  const p = typeof pct === 'number' ? pct : null;
  if (PREVIEW_FANS) previewFanTest(String(id), p); else system.metrics.fanTest?.(String(id), p);
  return true;
});
ipcMain.handle('hardware:advanced', async (e, on: boolean) => {
  if (on && system.metrics.advancedActivate) {
    // cada etapa vai para a tela, que mostra o popup de ativação com os passos
    return system.metrics.advancedActivate((step, info) => { if (!e.sender.isDestroyed()) e.sender.send('hardware:advancedStep', { step, ...info }); });
  }
  const f = on ? undefined : system.metrics.advancedDeactivate;
  return f ? f() : { ok: false, message: tr("No Mac, o monitoramento avançado já é automático") };
});
// relatório dos sensores: abre uma issue nova no GitHub, já preenchida, para a pessoa revisar e enviar.
// O link leva só um resumo (o endereço tem limite de tamanho); o relatório completo vai para a área de transferência.
const ISSUES = 'https://github.com/marquessrafa/cleancode/issues/new';
ipcMain.handle('hardware:report', async (_e, checks?: any[]) => {
  if (!system.metrics.advancedReport) return { ok: false, truncated: false };
  const full = await system.metrics.advancedReport(checks);
  clipboard.writeText(full);
  const title = tr("Sensores do Windows: relatório do monitoramento avançado (CleanCode {0})", app.getVersion());
  const url = (body: string) => `${ISSUES}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  let body = full, truncated = false;
  // corta as linhas mais antigas do registro até o endereço caber (cerca de 7.500 caracteres)
  while (url(body).length > 7500) {
    const lines = body.split('\n'); const at = lines.findIndex((l) => l.startsWith('```log'));
    if (at < 0 || lines.length - at < 4) { body = body.slice(0, 2500); truncated = true; break; }
    lines.splice(at + 1, 1); body = lines.join('\n'); truncated = true;
  }
  if (truncated) body += '\n\n' + tr("O registro foi cortado para caber no link. O relatório completo está na área de transferência, e você pode colar aqui se quiser.");
  await shell.openExternal(url(body));
  return { ok: true, truncated };
});
// ---------- limpeza ----------
const activityFile = path.join(userDir, 'activity.json');
ipcMain.handle('cleanup:categories', () => Cleanup.categories());
ipcMain.handle('cleanup:scan', (e, opts?: { aggressive?: boolean }) => Cleanup.scan((ch, d) => { if (!e.sender.isDestroyed()) e.sender.send(ch, d); }, opts || {}));
ipcMain.handle('cleanup:cancel', () => { Cleanup.cancelScan(); return true; });
ipcMain.handle('cleanup:clean', (e, paths: string[], specials: string[], mode: 'trash' | 'delete') =>
  Cleanup.clean(paths, specials, mode, (ch, d) => { if (!e.sender.isDestroyed()) e.sender.send(ch, d); }, activityFile));
ipcMain.handle('activity:list', () => Cleanup.activity(activityFile));
ipcMain.handle('activity:clear', () => { try { fs.unlinkSync(activityFile); } catch { /* */ } return true; });
// ---------- desempenho ----------
function logActivity(entry: Record<string, any>) {
  try {
    let log: any[] = [];
    try { log = JSON.parse(fs.readFileSync(activityFile, 'utf8')); } catch { /* */ }
    log.unshift({ at: Date.now(), ...entry });
    fs.writeFileSync(activityFile, JSON.stringify(log.slice(0, 500)));
  } catch { /* */ }
}
let startupCache: import('./platform').StartupItem[] = [];
ipcMain.handle('perf:startup', async () => (startupCache = await system.perf.startupItems()));
ipcMain.handle('perf:setStartup', async (_e, id: string, enabled: boolean) => {
  const item = startupCache.find((x) => x.id === id);
  if (!item || item.control === 'none') return { ok: false, message: tr("Item não encontrado") };
  const r = await system.perf.setStartupItem(item, enabled);
  if (r.ok) { item.enabled = enabled; logActivity({ kind: 'startup', name: item.name, enabled }); }
  return r;
});
ipcMain.handle('perf:tasks', () => system.perf.tasks());
ipcMain.handle('perf:runTasks', async (_e, ids: string[]) => {
  const r = await system.perf.runTasks(ids);
  logActivity({ kind: 'maintenance', tasks: r.filter((x) => x.ok).map((x) => x.id), failed: r.filter((x) => !x.ok).length });
  return r;
});
ipcMain.handle('perf:processes', () => system.perf.processes());
ipcMain.handle('perf:kill', async (_e, pids: number[]) => {
  // só encerra processos que aparecem na lista atual (do próprio usuário)
  const allowed = new Set((await system.perf.processes()).map((p) => p.pid));
  let ok = 0;
  for (const pid of pids) { if (!allowed.has(pid) || pid === process.pid) continue; try { process.kill(pid, 'SIGTERM'); ok++; } catch { /* já saiu */ } }
  return ok;
});
ipcMain.handle('perf:openStartupSettings', () => { system.perf.openStartupSettings(); return true; });
// ---------- acúmulos ----------
ipcMain.handle('clutter:scan', (e) => Clutter.scan((ch, d) => { if (!e.sender.isDestroyed()) e.sender.send(ch, d); }));
ipcMain.handle('clutter:cancel', () => { Clutter.cancel(); return true; });
ipcMain.handle('clutter:trash', async (_e, paths: string[]) => {
  const r = await Clutter.trash(paths);
  if (r.removed) logActivity({ kind: 'cleanup', name: tr("Acúmulos"), freed: r.freed, removed: r.removed, failed: r.failed.length, mode: 'trash' });
  return r;
});
// ---------- proteção ----------
// ---------- reparos (registro do Windows / preferências do macOS) ----------
let lastRepairs = new Map<string, import('./platform').RepairItem>();
const backupRoot = path.join(userDir, 'registry-backups');
ipcMain.handle('repairs:scan', async () => { const r = await system.repairs.scan(); lastRepairs = new Map(r.map((x) => [x.id, x])); return r; });
ipcMain.handle('repairs:fix', async (_e, ids: string[]) => {
  const items = ids.map((id) => lastRepairs.get(id)).filter(Boolean) as import('./platform').RepairItem[];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(backupRoot, stamp);
  const res = await system.repairs.fix(items, dir);
  const ok = res.filter((x) => x.ok).length;
  if (ok) logActivity({ kind: 'cleanup', name: isMac ? tr("Reparos do sistema") : tr("Reparos do registro"), freed: 0, removed: ok, failed: res.length - ok, mode: isMac ? 'trash' : 'delete', backup: isMac ? undefined : stamp });
  try { if (fs.existsSync(dir) && !fs.readdirSync(dir).length) fs.rmdirSync(dir); } catch { /* */ }
  return { results: res, backup: fs.existsSync(dir) ? stamp : null };
});
ipcMain.handle('repairs:backups', () => {
  let dirs: string[] = []; try { dirs = fs.readdirSync(backupRoot); } catch { /* */ }
  return dirs.map((d) => { let files = 0; try { files = fs.readdirSync(path.join(backupRoot, d)).filter((f) => f.endsWith('.reg')).length; } catch { /* */ } let at = 0; try { at = fs.statSync(path.join(backupRoot, d)).mtimeMs; } catch { /* */ } return { id: d, files, at }; })
    .filter((b) => b.files).sort((a, b) => b.at - a.at).slice(0, 30);
});
ipcMain.handle('repairs:restore', async (_e, id: string) => {
  if (!/^[\w-]+$/.test(id)) return { ok: false, message: tr("A cópia de segurança não é válida") };
  const r = await system.repairs.restore(path.join(backupRoot, id));
  if (r.ok) logActivity({ kind: 'maintenance', tasks: [tr("Registro restaurado do backup")], failed: 0 });
  return r;
});
ipcMain.handle('repairs:errors', () => system.repairs.recentErrors());
// aviso em segundo plano: item quebrado novo (programa removido que ainda inicia, atalho quebrado...)
async function checkRepairs() {
  if (!settings.notifyEnabled || !settings.notifyRepairs) return;
  const items = (await system.repairs.scan().catch(() => [])).filter((x) => !x.optional);
  const seen = new Set(settings.repairsSeen || []);
  const fresh = items.filter((x) => !seen.has(x.id));
  settings.repairsSeen = items.map((x) => x.id).slice(0, 800); saveSettings();
  if (!fresh.length) return;
  const one = fresh[0];
  showNotification({ kind: 'repair', title: fresh.length === 1 ? tr("Item quebrado: {0}", one.title) : tr("{0} itens quebrados encontrados", fresh.length), drive: '', amount: 0,
    detail: fresh.length === 1 ? one.detail : tr("Encontramos programas removidos que ainda iniciam, além de atalhos e entradas que apontam para arquivos que não existem mais. Clique para revisar e corrigir com uma cópia de segurança."), page: 'repairs' });
}
setTimeout(() => { checkRepairs(); setInterval(checkRepairs, 6 * 3600000); }, 3 * 60000);

// ---------- navegadores ----------
ipcMain.handle('browsers:scan', () => Browsers.scan());
ipcMain.handle('browsers:clean', async (_e, sel: { profileId: string; items: Browsers.ItemId[] }[]) => {
  const r = await Browsers.clean(sel);
  const freed = r.reduce((s, x) => s + x.freed, 0);
  if (r.some((x) => x.ok)) logActivity({ kind: 'cleanup', name: tr("Navegadores"), freed, removed: r.filter((x) => x.ok).length, failed: r.filter((x) => !x.ok).length, mode: 'delete' });
  return r;
});
ipcMain.handle('browsers:optimize', async (_e, ids: string[]) => {
  const r = await Browsers.optimize(ids);
  const freed = r.reduce((s, x) => s + x.freed, 0);
  if (r.some((x) => x.ok)) logActivity({ kind: 'cleanup', name: tr("Navegadores (otimização)"), freed, removed: r.filter((x) => x.ok).length, failed: r.filter((x) => !x.ok).length, mode: 'delete' });
  return r;
});
ipcMain.handle('browsers:close', (_e, id: string) => Browsers.closeBrowser(id));

// ---------- modo jogo ----------
let gameSession: { at: number; options: import('./platform').GameSessionOptions } | null = null;
ipcMain.handle('game:status', async () => ({ ...(await system.game.status()), session: gameSession }));
ipcMain.handle('game:toggle', (_e, id: string, on: boolean) => system.game.setToggle(id, on));
ipcMain.handle('game:games', () => system.game.games(settings.gameDirs));
ipcMain.handle('game:dirs', () => settings.gameDirs);
ipcMain.handle('game:addDir', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, { title: tr("Pasta com jogos"), properties: ['openDirectory'] });
  const dir = r.canceled ? null : r.filePaths[0];
  if (dir && !settings.gameDirs.includes(dir)) { settings.gameDirs = [...settings.gameDirs, dir]; saveSettings(); }
  return settings.gameDirs;
});
ipcMain.handle('game:removeDir', (_e, dir: string) => { settings.gameDirs = settings.gameDirs.filter((d) => d !== dir); saveSettings(); return settings.gameDirs; });
// liberar memória (Memória do Monitor de hardware, painel da bandeja e menu do ícone)
ipcMain.handle('mem:free', (_e, deep?: boolean) => system.game.freeMemory(!!deep));
// análise do AppData (dados que os programas guardam no perfil)
ipcMain.handle('appdata:scan', async (e) => {
  if (!appsCache) appsCache = await system.listApps().catch(() => []);
  return AppData.scan(appsCache, (ch, d) => { if (!e.sender.isDestroyed()) e.sender.send(ch, d); });
});
ipcMain.handle('appdata:cancel', () => { AppData.cancel(); return true; });
ipcMain.handle('appdata:clean', (_e, req: { safe: string[]; trash: string[] }) => AppData.clean(req));
ipcMain.handle('game:start', async (_e, o: import('./platform').GameSessionOptions) => {
  const r = await system.game.start(o);
  gameSession = { at: Date.now(), options: o };
  logActivity({ kind: 'maintenance', tasks: ['Modo Jogo ativado', ...r.steps.filter((x) => x.ok).map((x) => x.label)], failed: r.steps.filter((x) => !x.ok).length });
  return r;
});
ipcMain.handle('game:stop', async () => { const r = await system.game.stop(); gameSession = null; return r; });
ipcMain.handle('game:shaders', async () => {
  const r = await system.game.cleanShaders();
  if (r.freed) logActivity({ kind: 'cleanup', name: tr("Cache de shaders"), freed: r.freed, removed: 1, failed: 0, mode: 'delete' });
  return r;
});
ipcMain.handle('game:launch', async (_e, target: string) => {
  if (/^(steam|com\.epicgames\.launcher):\/\//.test(target)) { await shell.openExternal(target); return true; }
  if (path.isAbsolute(target) && fs.existsSync(target)) { const err = await shell.openPath(target); return !err; }
  return false;
});
app.on('before-quit', () => { if (gameSession) system.game.stop().catch(() => null); });

// ---------- novidades da versão ----------
ipcMain.handle('app:whatsNew', () => {
  const v = app.getVersion();
  // a 1.3.0 tratava a atualização vinda da 1.2.x como instalação nova (a chave não existia) e não mostrava nada:
  // quem ficou marcado como "já viu a 1.3.0" sem ter visto recebe as notas desde a 1.2.1
  if (!settings.whatsNewFixed) {
    settings.whatsNewFixed = true; saveSettings();
    if (hadSettings && (!settings.lastSeenVersion || settings.lastSeenVersion === '1.3.0')) return { show: true, version: v, previous: '1.2.1' };
  }
  if (!settings.lastSeenVersion) {
    settings.lastSeenVersion = v; saveSettings();
    return hadSettings ? { show: true, version: v } : { show: false, version: v }; // sem configurações salvas = instalação nova
  }
  return { show: settings.lastSeenVersion !== v, version: v, previous: settings.lastSeenVersion };
});
ipcMain.handle('app:whatsNewSeen', () => { settings.lastSeenVersion = app.getVersion(); saveSettings(); return true; });

ipcMain.handle('protection:scan', async () => {
  const { report, startupItems } = await Protection.scan();
  startupCache = startupItems; // permite desativar itens direto da Proteção (perf:setStartup)
  const issues = report.checks.filter((c) => c.ok === false).length + report.persistence.filter((p) => p.level === 'risk').length;
  logActivity({ kind: 'protection', removed: report.persistence.length, failed: issues });
  return report;
});
ipcMain.handle('protection:quickScan', async () => {
  const r = await (system.protection.quickScan?.() ?? Promise.resolve({ ok: false, message: tr("Indisponível neste sistema") }));
  logActivity({ kind: 'protection', name: 'quickScan', failed: r.ok ? 0 : 1 });
  return r;
});
ipcMain.handle('app:openExternal', (_e, url: string) => { if (/^(x-apple\.systempreferences:|windowsdefender:|ms-settings:)/.test(url)) shell.openExternal(url); return true; });
// links do dossiê (site, Wikipedia, loja): só http(s)
ipcMain.handle('app:openLink', (_e, url: string) => { if (/^https?:\/\/[^\s]+$/i.test(url)) shell.openExternal(url); return true; });
ipcMain.handle('metrics:speedTest', (e) => speedTest((p) => { if (!e.sender.isDestroyed()) e.sender.send('metrics:speedProgress', p); }));
ipcMain.handle('panel:ready', () => { clearTimeout(panelRevealTimer); if (panelWin && !panelWin.isDestroyed() && panelWin.isVisible()) panelWin.setOpacity(1); return true; });
ipcMain.handle('panel:resize', (_e, _h: number, w?: number) => {
  if (w && Math.round(w) !== panelWidth) { panelWidth = Math.max(360, Math.min(1100, Math.round(w))); placePanel(); }
  return true;
});
ipcMain.handle('panel:mouse', (_e, ignore: boolean) => { if (panelWin && !panelWin.isDestroyed()) panelWin.setIgnoreMouseEvents(!!ignore, { forward: true }); return true; });
ipcMain.handle('panel:hide', () => { hidePanel(); return true; });
ipcMain.handle('panel:blanked', () => { clearTimeout(panelHideTimer); if (panelWin && !panelWin.isDestroyed()) panelWin.hide(); return true; });
ipcMain.handle('panel:toggle', () => { togglePanel(); return true; });
ipcMain.handle('panel:openMain', (_e, page?: string) => {
  hidePanel();
  showMain();
  if (page && mainWin) {
    const w = mainWin;
    const send = () => w.webContents.send('navigate', page);
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
  }
  return true;
});
function applyLoginItem() {
  if (!app.isPackaged) return; // em desenvolvimento registraria o electron.exe
  system.loginItem.set(!!settings.startWithWindows);
}
function broadcastSettings() { for (const w of windows) if (!w.isDestroyed()) w.webContents.send('settings-changed', settings); }

const monitor = new Monitor(
  () => ({ disk: settings.notifyDisk, apps: settings.notifyApps, thresholdMB: settings.notifyThresholdMB }),
  (e) => showNotification(e),
);
function applyMonitor() {
  if (settings.notifyEnabled && (settings.notifyDisk || settings.notifyApps)) monitor.start(); else monitor.stop();
}

// popup próprio: canto inferior direito (Windows, acima do relógio) ou superior direito (macOS)
let notifyWin: BrowserWindow | null = null;
const notifyQueue: MonitorEvent[] = [];
function fmtBytes(n: number) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' ' + u[i];
}
function showNotification(e: MonitorEvent) {
  if (!settings.notifyEnabled) return;
  if (notifyWin && !notifyWin.isDestroyed()) { notifyQueue.push(e); return; }
  const W_ = 380, H_ = 134, M = 10;
  const area = screen.getPrimaryDisplay().workArea;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && nativeTheme.shouldUseDarkColors);
  // Windows: canto inferior direito (acima do relógio); macOS: superior direito (abaixo da barra de menus)
  const top = system.popupCorner === 'top-right';
  const yFor = (h: number) => (top ? area.y + M : area.y + area.height - h - M);
  const win = new BrowserWindow({
    width: W_, height: H_, x: area.x + area.width - W_ - M, y: yFor(H_),
    frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false, hasShadow: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  notifyWin = win;
  const query = {
    title: e.kind === 'app' ? `${e.title}: ${e.detail || ''}` : e.title, drive: e.drive, label: e.driveLabel || (e.drive === 'C:' ? tr("Disco local") : ''),
    amount: e.amount ? fmtBytes(e.amount) : '', amountNote: e.kind === 'app' && e.amount ? '(estimado)' : e.kind === 'disk' ? 'consumidos' : '',
    detail: e.kind === 'app' ? (e.amount ? '' : tr("O instalador ainda não informou o tamanho")) : (e.detail || ''),
    theme: dark ? 'dark' : 'light', ms: '10000', variant: e.kind === 'update' ? 'update' : 'growth', accent: accentHex(dark), corner: top ? 'top' : 'bottom',
  };
  if (e.kind === 'update' || e.kind === 'repair') Object.assign(query, { title: e.title, drive: '', amount: '', amountNote: '', detail: e.detail || '', variant: 'update' });
  win.loadFile(path.join(__dirname, '..', 'dist', 'notify.html'), { query });
  let shown = false;
  const reveal = () => { if (!shown && !win.isDestroyed()) { shown = true; win.showInactive(); } };
  win.once('ready-to-show', () => setTimeout(reveal, 150)); // espera a medida da altura
  win.webContents.on('did-navigate-in-page', (_ev, url) => {
    const m = /#h(\d+)$/.exec(url);
    if (m) {
      // ajusta a altura ao texto completo, mantendo o canto inferior acima do relógio
      const h = Math.min(Math.max(+m[1], 90), 360);
      win.setBounds({ x: area.x + area.width - W_ - M, y: yFor(h), width: W_, height: h });
      reveal();
      return;
    }
    if (url.endsWith('#open') && e.app) { openInstalledDossier(e.app); win.close(); return; }
    if (url.endsWith('#open')) { showMain(); if (e.page && mainWin) { const w = mainWin; setTimeout(() => { if (!w.isDestroyed()) w.webContents.send('navigate', e.page); }, 300); } }
    if (url.endsWith('#open') || url.endsWith('#close')) win.close();
  });
  win.on('closed', () => {
    notifyWin = null;
    const next = notifyQueue.shift();
    if (next) setTimeout(() => showNotification(next), 400);
  });
}
/** Clique na notificação de app instalado: relê a lista de programas e abre o dossiê dele na janela principal. */
async function openInstalledDossier(ref: { key: string; name: string }) {
  showMain();
  // macOS: o .app basta para o dossiê; abre na hora e atualiza a lista de programas em segundo plano
  if (process.platform === 'darwin' && ref.key.endsWith('.app')) {
    const entry = { id: 'app:' + ref.key, source: 'mac', name: ref.name, location: ref.key, icon: ref.key, canUninstall: !ref.key.startsWith('/System/'), installDate: Date.now() };
    const send = () => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('open-dossier', entry); };
    if (mainWin?.webContents.isLoading()) mainWin.webContents.once('did-finish-load', () => setTimeout(send, 600)); else setTimeout(send, 200);
    system.listApps().then((l) => { appsCache = l; }).catch(() => {});
    return;
  }
  try { appsCache = await system.listApps(); } catch { /* usa a lista anterior */ }
  const last = (ref.key.split(/[\\/]/).pop() || '').toLowerCase();
  const a = appsCache?.find((x) => x.id === 'app:' + ref.key || x.location === ref.key
    || (!!last && (x.regPath?.toLowerCase().endsWith('\\' + last) || x.packageFullName?.toLowerCase() === last)))
    || appsCache?.find((x) => x.name.toLowerCase() === ref.name.toLowerCase());
  const entry = a ? (({ exes, ...rest }) => rest)(a) : { id: 'app:' + ref.key, source: process.platform === 'darwin' ? 'mac' : 'win32', name: ref.name, location: ref.key.startsWith('/') ? ref.key : undefined, icon: ref.key.startsWith('/') ? ref.key : undefined, canUninstall: false };
  const send = () => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('open-dossier', entry); };
  // janela recém-criada: espera o app carregar
  if (mainWin?.webContents.isLoading()) mainWin.webContents.once('did-finish-load', () => setTimeout(send, 600)); else setTimeout(send, 300);
}
// ---------- atualizações ----------
type UpdStatus = 'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'installing' | 'restarting' | 'error';
let updateState: { status: UpdStatus; info?: UpdateInfo | null; error?: string; done?: number; total?: number; checkedAt?: number; source?: 'found' | 'searching' | 'missing'; steps?: string[]; step?: number } = { status: 'idle' };

/** Fonte de atualizações: usa o último local conhecido; se a pasta foi movida, encontra de novo pelo identificador. */
let resolving: Promise<string> | null = null;
function resolveSource(): Promise<string> {
  if (resolving) return resolving;
  resolving = (async () => {
    if (/^https?:/i.test(DEFAULT_UPDATE_SOURCE)) return DEFAULT_UPDATE_SOURCE; // distribuição por URL
    const hint = settings.updateSource || DEFAULT_UPDATE_SOURCE;
    const legacyOk = (d: string) => { try { return fs.existsSync(path.join(d, FEED_FILE)) && !fs.existsSync(path.join(d, 'cleancode-feed.json')); } catch { return false; } };
    if (hint && (isFeed(hint, FEED_ID) || legacyOk(hint))) { pushUpdate({ source: 'found' }); return hint; }
    pushUpdate({ source: 'searching' });
    const found = FEED_ID ? await locateFeed(FEED_ID, hint) : null;
    if (found) {
      if (found !== settings.updateSource) { settings.updateSource = found; saveSettings(); }
      pushUpdate({ source: 'found' });
      watchUpdateSource();
      return found;
    }
    pushUpdate({ source: 'missing' });
    return '';
  })().finally(() => { resolving = null; });
  return resolving;
}
let readyFile: string | null = null;   // instalador já baixado e verificado
let readyNotified = '';
function pushUpdate(patch: Partial<typeof updateState>) {
  updateState = { ...updateState, ...patch };
  for (const w of windows) if (!w.isDestroyed()) w.webContents.send('update:state', updateState);
}
const busyUpdating = () => ['checking', 'downloading', 'installing', 'restarting'].includes(updateState.status);
let availableNotified = '';   // versão já avisada no popup (as verificações automáticas não repetem o aviso)
let lastUpdateCheck = 0;
async function runUpdateCheck(silent: boolean) {
  if (busyUpdating()) return updateState;
  // já baixada? não baixa de novo, só reavalia se pode instalar
  if (updateState.status === 'ready' && readyFile) { maybeInstallReady(); return updateState; }
  lastUpdateCheck = Date.now();
  // as verificações automáticas são silenciosas: o botão do topo não fica piscando "verificando"
  if (!silent) pushUpdate({ status: 'checking', error: undefined });
  const src = await resolveSource();
  if (!src) { pushUpdate({ status: 'idle', info: null, checkedAt: Date.now() }); return updateState; }
  try {
    const info = await checkForUpdate(src);
    pushUpdate({ status: info ? 'available' : 'none', info, checkedAt: Date.now() });
    if (info && settings.autoInstallUpdates && app.isPackaged) {
      await downloadReady(info);          // baixa em segundo plano
      maybeInstallReady();
    } else if (info && silent && availableNotified !== info.version) {
      availableNotified = info.version;
      showNotification({ kind: 'update', title: tr("O CleanCode {0} está disponível", info.version), drive: '', amount: 0, detail: tr("Clique para abrir o app e atualizar com um clique, sem abrir o instalador.") });
    }
  } catch (err: any) {
    // sem internet numa verificação automática: só tenta de novo depois (sem mostrar erro)
    if (silent && updateState.status !== 'checking') pushUpdate({ checkedAt: Date.now() });
    else pushUpdate({ status: 'error', error: String(err?.message || err), checkedAt: Date.now() });
  }
  return updateState;
}
async function downloadReady(info: UpdateInfo) {
  pushUpdate({ status: 'downloading', done: 0, total: info.size });
  let last = 0;
  readyFile = await downloadUpdate(info, (done, total) => { if (Date.now() - last > 150) { last = Date.now(); pushUpdate({ done, total }); } });
  pushUpdate({ status: 'ready' });
}
function installReadyNow() {
  if (!readyFile) return false;
  pushUpdate({ status: 'installing' });
  try { system.installUpdate(readyFile, quitApp, true); }
  catch (err: any) { pushUpdate({ status: 'error', error: String(err?.message || err) }); return false; }
  readyFile = null;
  return true;
}
/** Instala na hora se o app estiver só na bandeja; com a janela aberta, avisa e instala ao fechar/sair. */
function maybeInstallReady() {
  if (!readyFile || !updateState.info) return;
  const visible = [...windows].some((w) => w !== panelWin && !w.isDestroyed() && w.isVisible());
  if (!visible) { installReadyNow(); return; }
  if (readyNotified !== updateState.info.version) {
    readyNotified = updateState.info.version;
    showNotification({ kind: 'update', title: tr("O CleanCode {0} está pronto para instalar", updateState.info.version), drive: '', amount: 0,
      detail: tr("Será instalado sozinho quando você fechar a janela. Para atualizar agora, use \"Reiniciar para atualizar\" no topo do app.") });
  }
}
ipcMain.handle('update:state', () => ({ ...updateState, defaultSource: DEFAULT_UPDATE_SOURCE }));
ipcMain.handle('update:check', () => runUpdateCheck(false));
ipcMain.handle('update:pickSource', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, { title: tr("Pasta com o {0} e o instalador", FEED_FILE), properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  settings.updateSource = r.filePaths[0]; saveSettings(); broadcastSettings();
  watchUpdateSource(); runUpdateCheck(false);
  return r.filePaths[0];
});
// demonstração do popup de atualização em desenvolvimento (CLEANCODE_DEMO_UPDATE=1): simula uma versão nova com as
// novidades reais e um download/instalação de mentira. Nunca roda no app instalado.
const DEMO_UPDATE = !app.isPackaged && !!process.env.CLEANCODE_DEMO_UPDATE;
if (DEMO_UPDATE) app.whenReady().then(() => setTimeout(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CHANGELOG } = require('../src/lib/changelog');
  pushUpdate({ status: 'available', info: { version: '1.5.0', file: 'demo', sha512: '', size: 152 * 1048576, source: 'demo', date: new Date().toISOString(), notes: CHANGELOG.slice(0, 2).map((n: any, i: number) => (i ? n : { ...n, version: '1.5.0' })) } });
}, 4000));
async function demoInstall() {
  const total = updateState.info!.size;
  for (let d = 0; d <= total; d += total / 40) { pushUpdate({ status: 'downloading', done: Math.min(total, d), total }); await new Promise((r) => setTimeout(r, 110)); }
  const steps = system.updateSteps || [];
  pushUpdate({ status: 'installing', steps, step: 0 });
  for (let i = 0; i < steps.length; i++) { pushUpdate({ step: i }); await new Promise((r) => setTimeout(r, 1300)); }
  pushUpdate({ status: 'restarting', step: steps.length });
  return true;
}

/**
 * Lê na tela do app as cores do tema e a posição do cartão do popup de atualização (no Windows, a janela de instalação
 * usa esses dados para abrir igual ao popup e no mesmo lugar). As cores viram hex: o navegador desenha cada cor num
 * pixel e lê o resultado, então valores como color-mix também funcionam.
 */
async function popupLook(wc: Electron.WebContents) {
  try {
    const win = BrowserWindow.fromWebContents(wc);
    const r = await wc.executeJavaScript(`(() => {
      const cs = getComputedStyle(document.documentElement), g = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const hex = (v) => { g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = v; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((x) => x.toString(16).padStart(2, '0')).join(''); };
      const v = (n) => hex(cs.getPropertyValue(n).trim() || '#000');
      const el = document.querySelector('[data-upd-card]'), b = el && el.getBoundingClientRect();
      const sub = el && el.querySelector('[data-upd-sub]');
      return { colors: { surface: v('--surface'), line: v('--line'), lineStrong: v('--line-strong'), fg: v('--fg'), muted: v('--muted'), faint: v('--faint'), track: v('--surface-2'), accent: v('--accent'), onAccent: v('--on-accent'), danger: v('--danger') },
        rect: b ? { x: b.left, y: b.top, w: b.width } : null, subtitle: sub ? sub.textContent : '' };
    })()`);
    const z = wc.getZoomFactor(), cb = win?.getContentBounds();
    const rect = r.rect && cb && win?.isVisible() ? { x: cb.x + r.rect.x * z, y: cb.y + r.rect.y * z, w: r.rect.w * z } : undefined;
    return { colors: r.colors, rect, subtitle: r.subtitle || undefined };
  } catch { return {}; }
}

// atualizar pelo popup central: baixa (se ainda não baixou), instala acompanhando as etapas e só reinicia no fim
ipcMain.handle('update:start', async (e) => {
  const info = updateState.info;
  if (!info) throw new Error(tr("Nenhuma atualização disponível"));
  if (DEMO_UPDATE) return demoInstall();
  if (!app.isPackaged) throw new Error(tr("A instalação automática só funciona na versão instalada."));
  try {
    // já baixando em segundo plano (instalação automática): espera terminar em vez de baixar de novo
    if (updateState.status === 'downloading') await new Promise<void>((res) => { const iv = setInterval(() => { if (updateState.status !== 'downloading') { clearInterval(iv); res(); } }, 300); });
    if (!readyFile) await downloadReady(info);
    const live = system.installUpdateLive;
    if (!live) { installReadyNow(); return true; }
    const steps = system.updateSteps || [];
    pushUpdate({ status: 'installing', steps, step: 0, error: undefined });
    const dark = isDarkTheme();
    const file = readyFile!;
    readyFile = null; // o arquivo agora é da instalação em andamento (não instalar de novo ao sair)
    const look = await popupLook(e.sender);
    const r = await live.call(system, file, (i) => pushUpdate({ step: i }), { accent: accentHex(dark), dark, version: info.version, ...look });
    if (r === 'relaunch') {
      pushUpdate({ status: 'restarting', step: steps.length });
      setTimeout(() => {
        app.relaunch({ args: [...process.argv.slice(1).filter((a) => a !== '--updated' && a !== '--hidden'), '--updated'] });
        quitApp();
      }, 1500);
    } else {
      // a janela de instalação já está na tela, no mesmo lugar e com o mesmo desenho do popup: o app some agora,
      // para as duas não aparecerem juntas, e fecha logo depois
      for (const w of BrowserWindow.getAllWindows()) { try { w.hide(); } catch { /* */ } }
      setTimeout(quitApp, 300);
    }
    return true;
  } catch (err: any) {
    pushUpdate({ status: 'error', error: String(err?.message || err) });
    throw err;
  }
});
ipcMain.handle('update:install', async () => {
  const info = updateState.info;
  if (!info) throw new Error(tr("Nenhuma atualização disponível"));
  if (!app.isPackaged) throw new Error(tr("A instalação automática só funciona na versão instalada."));
  try {
    if (!readyFile) await downloadReady(info);
    installReadyNow();
    return true;
  } catch (err: any) {
    pushUpdate({ status: 'error', error: String(err?.message || err) });
    throw err;
  }
});

// verificação: 15 s após abrir, a cada 3 min (o feed é um arquivo minúsculo) e também ao acordar o computador,
// ao abrir a janela e ao abrir o painel da barra de menus (no máximo uma vez a cada 2 min). Uma versão nova
// aparece no popup e no botão do topo poucos minutos depois de o Release sair.
setTimeout(() => { if (settings.autoCheckUpdates && !DEMO_UPDATE) runUpdateCheck(true); }, 15000);
setInterval(() => { if (settings.autoCheckUpdates && !DEMO_UPDATE) runUpdateCheck(true); }, 3 * 60000);
function checkUpdatesSoon(delay = 0) {
  if (!settings.autoCheckUpdates || DEMO_UPDATE || Date.now() - lastUpdateCheck < 2 * 60000) return;
  lastUpdateCheck = Date.now();
  setTimeout(() => runUpdateCheck(true), delay);
}
app.whenReady().then(() => {
  // a rede demora alguns segundos para voltar depois do repouso
  powerMonitor.on('resume', () => { lastUpdateCheck = 0; checkUpdatesSoon(8000); });
  powerMonitor.on('unlock-screen', () => checkUpdatesSoon(3000));
  app.on('browser-window-focus', (_e, w) => { if (w !== panelWin) checkUpdatesSoon(); });
});
let sourceWatcher: fs.FSWatcher | null = null;
let watchDebounce: NodeJS.Timeout | null = null;
function watchUpdateSource() {
  sourceWatcher?.close(); sourceWatcher = null;
  const src = settings.updateSource;
  if (!src || /^https?:/i.test(src) || !settings.autoCheckUpdates) return;
  const later = (ms: number) => { if (watchDebounce) clearTimeout(watchDebounce); watchDebounce = setTimeout(() => runUpdateCheck(true), ms); };
  try {
    sourceWatcher = fs.watch(src, (_ev, name) => {
      // a própria pasta sumiu (movida/renomeada): reencontra pelo identificador
      if (!fs.existsSync(src)) { sourceWatcher?.close(); sourceWatcher = null; later(3000); return; }
      if (name && !/latest(-mac)?\.yml$/i.test(String(name))) return;
      later(8000); // espera o build terminar de gravar
    });
    sourceWatcher.on('error', () => { sourceWatcher = null; later(3000); });
  } catch { /* pasta inexistente: a próxima verificação procura de novo */ }
}
app.whenReady().then(() => {
  watchUpdateSource();
  // apaga instaladores baixados em atualizações anteriores (já aplicadas)
  fs.promises.rm(path.join(app.getPath('temp'), 'cleancode-update'), { recursive: true, force: true }).catch(() => {});
});

ipcMain.handle('monitor:state', () => monitor.state());
ipcMain.handle('monitor:checkNow', async () => { await monitor.check(); return monitor.state(); });
ipcMain.handle('notify:test', () => {
  const d = drives()[0];
  const tag = d ? (/^[a-zA-Z]:/.test(d.root) ? d.root.slice(0, 2) : d.root) : 'C:';
  showNotification({ kind: 'disk', title: tr("O uso do disco aumentou"), drive: tag, driveLabel: d?.label || 'Disco local', amount: 2.4 * 1073741824, detail: d ? tr("Exemplo: agora com {0} livres de {1}", fmtBytes(d.free), fmtBytes(d.total)) : tr("Exemplo: agora com 228,3 GB livres de 952,6 GB") });
  return true;
});
ipcMain.handle('app:loginItemStatus', () => ({ packaged: app.isPackaged, openAtLogin: app.isPackaged ? system.loginItem.get() : false }));

const ACCENTS: Record<string, { l: string; d: string }> = {
  green: { l: '#0e9f6e', d: '#34d399' }, purple: { l: '#7c3aed', d: '#a78bfa' },
  blue: { l: '#2563eb', d: '#60a5fa' }, orange: { l: '#e5803f', d: '#fdba74' },
  white: { l: '#18181b', d: '#f4f4f5' },
};
function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * t + ((pb >> s) & 255) * (1 - t));
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}
const isDarkTheme = () => settings.theme === 'dark' || (settings.theme === 'system' && nativeTheme.shouldUseDarkColors);
const accentHex = (dark = isDarkTheme()) => (ACCENTS[settings.accent] || ACCENTS.green)[dark ? 'd' : 'l'];
/** fundo neutro (a cor de destaque não tinge o fundo) — igual ao CSS */
function themeColors(dark = isDarkTheme()) {
  void mixHex;
  return { color: dark ? '#121212' : '#fafafa', symbolColor: dark ? '#ededed' : '#1c1c1c' };
}
function applyWindowColors() {
  const c = themeColors();
  for (const w of windows) { if (w === panelWin) continue; system.setTitleBarColors(w, c); try { w.setBackgroundColor(c.color); } catch { /* */ } }
}
function createWindow(initialPath?: string | null) {
  const c = themeColors();
  const win = new BrowserWindow({
    width: 1400, height: 880, minWidth: 1280, minHeight: 720, show: false,
    backgroundColor: c.color, ...system.windowChrome(c),
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  windows.add(win);
  win.on('closed', () => { windows.delete(win); if (win === mainWin) mainWin = null; });
  // fechar a janela principal só esconde o app na bandeja (se "rodar em segundo plano" estiver ativo)
  win.on('close', (ev) => {
    if (win === mainWin && settings.runInBackground && !isQuitting) {
      ev.preventDefault();
      win.hide();
      if (![...windows].some((w) => w !== win && w !== panelWin && !w.isDestroyed() && w.isVisible())) system.setBackgroundMode(true);
      // atualização já baixada? instala agora que a janela foi fechada
      if (readyFile) { setTimeout(maybeInstallReady, 1200); return; }
      if (!trayHintShown && settings.notifyEnabled) {
        trayHintShown = true;
        tray?.displayBalloon?.({ title: tr("O CleanCode continua aberto"), content: tr("O monitor de discos continua ativo na bandeja. Para sair, clique com o botão direito no ícone."), iconType: 'info' });
      }
    }
  });
  // iniciado com o Windows (--hidden): a primeira janela fica escondida na bandeja
  win.once('ready-to-show', () => {
    const keepHidden = startHidden && !shownOnce && win === mainWin;
    shownOnce = true;
    if (!keepHidden) win.show(); else system.setBackgroundMode(true);
  });
  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  if (initialPath) win.webContents.once('did-finish-load', () => win.webContents.send('open-path', initialPath));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  // voltar/avançar entre telas: botões laterais do mouse e teclas de navegação (Windows) e gesto de deslizar (macOS)
  win.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') win.webContents.send('nav', 'back');
    else if (cmd === 'browser-forward') win.webContents.send('nav', 'forward');
  });
  // macOS: drivers de mouse (Logitech e outros) mandam os botões laterais como gesto de deslizar. No AppKit,
  // "left" (deltaX positivo) é voltar, como virar a página para trás no Safari
  win.on('swipe', (_e, dir) => {
    if (dir === 'left') win.webContents.send('nav', 'back');
    else if (dir === 'right') win.webContents.send('nav', 'forward');
  });
  return win;
}

let shownOnce = false;
app.whenReady().then(() => {
  fs.mkdirSync(historyDir, { recursive: true });
  startHidden = startHidden || (app.isPackaged && system.loginItem.launchedAtLogin());
  mainWin = createWindow(pathFromArgv(process.argv));
  createTray();
  // o widget é montado escondido alguns segundos depois da abertura; assim, o primeiro clique no ícone já mostra tudo carregado
  setTimeout(() => { if (!panelWin || panelWin.isDestroyed()) panelWin = createPanel(); }, 4000);
  // macOS: clicar no ícone do Dock reabre a janela escondida
  app.on('activate', showMain);
  applyLoginItem();
  applyMonitor();
});
app.whenReady().then(() => { try { system.cleanupUpdate?.(); } catch { /* */ } });
// varredura de hardware: se ela já foi feita e a atualização trouxe um programa dos sensores novo, refaz sozinha
app.whenReady().then(() => { if (!PREVIEW_FANS) system.metrics.advancedAuto?.().catch(() => {}); });
// ventoinhas: volta a aplicar as configurações salvas (velocidade fixa ou curva) quando o app abre
app.whenReady().then(() => { try { if (!PREVIEW_FANS) system.metrics.fanApply?.(settings.fans); } catch { /* */ } });
app.on('before-quit', () => {
  isQuitting = true;
  // saindo com uma atualização já baixada: instala em silêncio (sem reabrir o app depois)
  if (readyFile && updateState.status === 'ready') { try { system.installUpdate(readyFile, () => {}, false); } catch { /* */ } readyFile = null; }
});
app.on('window-all-closed', () => {
  if (settings.runInBackground && !isQuitting) return; // continua na bandeja
  for (const s of scans.values()) s.worker.terminate();
  app.quit();
});

// ---------- varreduras ----------
interface Scan { id: number; root: string; worker: Worker; pending: Map<number, { res: (v: any) => void; rej: (e: any) => void; onProgress?: (p: any) => void }>; last: any; done: boolean; owner: Electron.WebContents }
const scans = new Map<number, Scan>();
let scanSeq = 0, qSeq = 0;

function startScan(root: string, owner: Electron.WebContents): number {
  const id = ++scanSeq;
  const worker = new Worker(path.join(__dirname, 'scanWorker.js'), { workerData: { root } });
  const s: Scan = { id, root, worker, pending: new Map(), last: null, done: false, owner };
  scans.set(id, s);
  worker.on('message', (m: any) => {
    if (m.type === 'reply') {
      const p = s.pending.get(m.id); if (!p) return;
      s.pending.delete(m.id);
      m.error ? p.rej(new Error(m.error)) : p.res(m.result);
    } else if (m.type === 'taskProgress') {
      const p = s.pending.get(m.id);
      if (!owner.isDestroyed()) owner.send('task:progress', { scanId: id, method: m.method, progress: m.progress });
      p?.onProgress?.(m.progress);
    } else if (m.type === 'progress') {
      s.last = m;
      if (!owner.isDestroyed()) owner.send('scan:progress', { scanId: id, ...m });
    } else if (m.type === 'done') {
      s.done = true;
      if (!owner.isDestroyed()) owner.send('scan:done', { scanId: id, stopped: m.stopped });
      if (settings.autoSaveHistory && !m.stopped) saveHistory(s).catch(() => { /* */ });
    }
  });
  worker.on('error', (e) => { if (!owner.isDestroyed()) owner.send('scan:error', { scanId: id, error: String(e) }); });
  settings.recent = [root, ...settings.recent.filter((r) => r.toLowerCase() !== root.toLowerCase())].slice(0, 12);
  saveSettings();
  return id;
}
function query(scanId: number, method: string, args: any[] = []): Promise<any> {
  const s = scans.get(scanId);
  if (!s) return Promise.reject(new Error(tr("Varredura não encontrada")));
  const id = ++qSeq;
  return new Promise((res, rej) => { s.pending.set(id, { res, rej }); s.worker.postMessage({ type: 'query', id, method, args }); });
}

ipcMain.handle('scan:start', (e, root: string) => startScan(root, e.sender));
ipcMain.handle('scan:query', (_e, scanId: number, method: string, args: any[]) => query(scanId, method, args));
ipcMain.handle('scan:close', (_e, scanId: number) => { const s = scans.get(scanId); if (s) { s.worker.terminate(); scans.delete(scanId); } return true; });
ipcMain.handle('scan:list', () => [...scans.values()].map((s) => ({ id: s.id, root: s.root, done: s.done, last: s.last })));

// ---------- histórico ----------
const histIndexFile = path.join(historyDir, 'index.json');
function readHistIndex(): any[] { try { return JSON.parse(fs.readFileSync(histIndexFile, 'utf8')); } catch { return []; } }
async function saveHistory(s: Scan) {
  const snap = await query(s.id, 'snapshot');
  // evita registros repetidos: mesma pasta, mesmos totais, poucos minutos depois
  const last = readHistIndex().find((h) => h.root.toLowerCase() === String(snap.root).toLowerCase());
  if (last && last.size === snap.totalSize && last.files === snap.totalFiles && snap.date - last.date < 10 * 60000) return last.id;
  const id = `${Date.now()}`;
  fs.mkdirSync(historyDir, { recursive: true });
  fs.writeFileSync(path.join(historyDir, id + '.json.gz'), zlib.gzipSync(JSON.stringify(snap)));
  const idx = readHistIndex();
  idx.unshift({ id, root: snap.root, date: snap.date, size: snap.totalSize, files: snap.totalFiles, dirs: snap.names.length });
  fs.writeFileSync(histIndexFile, JSON.stringify(idx.slice(0, 200)));
  return id;
}
ipcMain.handle('history:list', () => readHistIndex());
ipcMain.handle('history:save', async (_e, scanId: number) => { const s = scans.get(scanId); return s ? saveHistory(s) : null; });
ipcMain.handle('history:delete', (_e, id: string) => {
  try { fs.unlinkSync(path.join(historyDir, id + '.json.gz')); } catch { /* */ }
  fs.writeFileSync(histIndexFile, JSON.stringify(readHistIndex().filter((h) => h.id !== id)));
  return true;
});
ipcMain.handle('history:compare', async (_e, scanId: number, id: string | null) => {
  if (!id) return query(scanId, 'loadCompare', [null]);
  const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(historyDir, id + '.json.gz'))).toString('utf8'));
  return query(scanId, 'loadCompare', [snap]);
});
ipcMain.handle('history:exportSnapshot', async (e, scanId: number) => {
  const win = BrowserWindow.fromWebContents(e.sender)!;
  const r = await dialog.showSaveDialog(win, { title: tr("Salvar varredura"), defaultPath: 'varredura.cleancode.json.gz', filters: [{ name: tr("Varredura CleanCode"), extensions: ['gz'] }] });
  if (r.canceled || !r.filePath) return null;
  const snap = await query(scanId, 'snapshot');
  fs.writeFileSync(r.filePath, zlib.gzipSync(JSON.stringify(snap)));
  return r.filePath;
});
ipcMain.handle('history:importSnapshot', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)!;
  const r = await dialog.showOpenDialog(win, { title: tr("Importar varredura salva"), filters: [{ name: tr("Varredura CleanCode"), extensions: ['gz', 'json'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const buf = fs.readFileSync(r.filePaths[0]);
  const snap = JSON.parse((buf[0] === 0x1f ? zlib.gunzipSync(buf) : buf).toString('utf8'));
  if (!snap.names || !snap.parents) throw new Error(tr("O arquivo não é válido"));
  const id = `${Date.now()}`;
  fs.writeFileSync(path.join(historyDir, id + '.json.gz'), zlib.gzipSync(JSON.stringify(snap)));
  const idx = readHistIndex();
  idx.unshift({ id, root: snap.root, date: snap.date, size: snap.totalSize, files: snap.totalFiles, dirs: snap.names.length, imported: true });
  fs.writeFileSync(histIndexFile, JSON.stringify(idx));
  return id;
});

// ---------- sistema / arquivos ----------
// idioma das janelas (lido de forma síncrona pelo preload)
ipcMain.on('app:lang', (e) => { e.returnValue = LANG; });
// prévia do popup de mapeamento dos sensores, só na versão de desenvolvimento (npm run preview:sensores)
ipcMain.on('app:previewSensors', (e) => { e.returnValue = app.isPackaged ? '' : String(process.env.CLEANCODE_PREVIEW_SENSORS || ''); });
ipcMain.handle('app:info', () => ({
  version: app.getVersion(), isAdmin: isAdmin(), electron: process.versions.electron, userData: userDir,
  platform: process.platform, osName: system.osName, fileManager: system.fileManager,
  canElevate: system.canElevate, contextMenu: system.contextMenu.supported, home: app.getPath('home'),
}));
ipcMain.handle('drives:list', () => drives());
ipcMain.handle('app:fullDiskAccess', () => system.fullDiskAccess());
ipcMain.handle('app:openFullDiskAccess', () => { system.openFullDiskAccessSettings(); return true; });
if (isMac) setupFdaAssistant({ isDev, mainWindow: () => mainWin });
ipcMain.handle('drives:hardware', (_e, force?: boolean) => system.driveHardware(!!force));
ipcMain.handle('dialog:pickFolder', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('fs:open', (_e, p: string) => shell.openPath(p));
ipcMain.handle('fs:showInFolder', (_e, p: string) => { shell.showItemInFolder(p); return true; });
ipcMain.handle('fs:copyText', (_e, t: string) => { clipboard.writeText(t); return true; });
ipcMain.handle('fs:trash', async (_e, paths: string[]) => {
  const out: { path: string; ok: boolean; error?: string }[] = [];
  for (const p of paths) {
    try { await shell.trashItem(p); out.push({ path: p, ok: true }); } catch (err: any) { out.push({ path: p, ok: false, error: String(err.message || err) }); }
  }
  const ok = out.filter((x) => x.ok);
  if (ok.length) logActivity({ kind: 'delete', mode: 'trash', removed: ok.length, sample: ok.slice(0, 3).map((x) => x.path) });
  return out;
});
ipcMain.handle('fs:deletePermanent', async (_e, paths: string[]) => {
  const out: { path: string; ok: boolean; error?: string }[] = [];
  for (const p of paths) {
    try { await fs.promises.rm(p, { recursive: true, force: false }); out.push({ path: p, ok: true }); } catch (err: any) { out.push({ path: p, ok: false, error: String(err.message || err) }); }
  }
  const ok = out.filter((x) => x.ok);
  if (ok.length) logActivity({ kind: 'delete', mode: 'delete', removed: ok.length, sample: ok.slice(0, 3).map((x) => x.path) });
  return out;
});
ipcMain.handle('fs:move', async (e, paths: string[]) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, { title: tr("Mover para…"), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dest = r.filePaths[0];
  const out: { path: string; ok: boolean; to?: string; error?: string }[] = [];
  for (const p of paths) {
    const to = path.join(dest, path.basename(p));
    try {
      if (fs.existsSync(to)) throw new Error(tr("Já existe um item com esse nome no destino"));
      try { await fs.promises.rename(p, to); }
      catch (err: any) {
        if (err.code !== 'EXDEV') throw err;
        await fs.promises.cp(p, to, { recursive: true, errorOnExist: true, preserveTimestamps: true });
        await fs.promises.rm(p, { recursive: true });
      }
      out.push({ path: p, ok: true, to });
    } catch (err: any) { out.push({ path: p, ok: false, error: String(err.message || err) }); }
  }
  return { dest, results: out };
});
ipcMain.handle('fs:newFolder', async (_e, parent: string, name: string) => {
  const p = path.join(parent, name.replace(/[<>:"/\\|?*]/g, '_'));
  await fs.promises.mkdir(p);
  return p;
});
ipcMain.handle('fs:properties', (_e, p: string) => { system.showProperties(p); return true; });

ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
  settings = { ...settings, ...patch };
  saveSettings();
  if ('startWithWindows' in patch) applyLoginItem();
  if ('notifyEnabled' in patch || 'notifyDisk' in patch || 'notifyApps' in patch) applyMonitor();
  if ('notifyThresholdMB' in patch) monitor.resetBaseline();
  if ('updateSource' in patch && !settings.updateSource) { settings.updateSource = DEFAULT_UPDATE_SOURCE; saveSettings(); }
  if ('updateSource' in patch || 'autoCheckUpdates' in patch) { watchUpdateSource(); if (settings.autoCheckUpdates) runUpdateCheck(false); }
  if ('theme' in patch) nativeTheme.themeSource = settings.theme as any;
  if ('theme' in patch || 'accent' in patch) applyWindowColors();
  if ('fans' in patch && !PREVIEW_FANS) system.metrics.fanApply?.(settings.fans);
  // outras janelas (painel da barra de menus, janelas extras) acompanham a mudança
  for (const w of windows) if (!w.isDestroyed() && w.webContents !== _e.sender) w.webContents.send('settings-changed', settings);
  return settings;
});
// reinicia o app (usado ao trocar o idioma, porque os textos são montados na abertura)
ipcMain.handle('app:relaunch', () => { app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--hidden' && a !== '--updated') }); setTimeout(quitApp, 150); return true; });
ipcMain.handle('app:restartAdmin', () => { if (system.canElevate) relaunchAsAdmin(); return system.canElevate; });
ipcMain.handle('window:new', () => { createWindow(); return true; });
ipcMain.handle('app:titlebar', (e, dark: boolean) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const c = themeColors(dark);
  if (w) { system.setTitleBarColors(w, c); try { w.setBackgroundColor(c.color); } catch { /* */ } }
  return true;
});
nativeTheme.themeSource = settings.theme as any;

// ---------- menu de contexto do Explorer / Finder ----------
ipcMain.handle('shell:contextMenuStatus', () => system.contextMenu.status());
ipcMain.handle('shell:contextMenu', (_e, enable: boolean) =>
  system.contextMenu.set(enable, { exe: process.execPath, packaged: app.isPackaged, appDir: path.join(__dirname, '..') }));

// ---------- jogos (lojas e qualquer pasta) ----------
// Os jogos das lojas vêm do Modo Jogo (Steam, Epic, GOG e as pastas escolhidas). Os outros vêm da busca em todos os
// discos (gameFinder.ts), que roda em segundo plano. Quando ela termina, o mapa e o Desinstalador recebem a lista nova.
let storeGamesCache: { at: number; dirs: string[] } | null = null;
async function storeGameDirs(): Promise<string[]> {
  if (storeGamesCache && Date.now() - storeGamesCache.at < 5 * 60000) return storeGamesCache.dirs;
  const dirs = (await system.game.games(settings.gameDirs).catch(() => [])).map((g) => g.dir || '').filter(Boolean);
  storeGamesCache = { at: Date.now(), dirs };
  return dirs;
}
/** Pastas de jogos agora: as das lojas e a última lista da busca (que começa em segundo plano, se precisar). */
async function gameDirsNow(): Promise<{ store: string[]; found: FoundGame[] }> {
  const store = await storeGameDirs();
  void foundGames(store);
  return { store, found: foundGamesCached() };
}
onGamesFound(() => {
  storageMapStale();
  for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.send('games:found'); } catch { /* */ } }
});
const lowPath = (p: string) => p.toLowerCase().replace(/[\\/]+$/, '');
const within = (p: string, dir: string) => { const a = lowPath(p), b = lowPath(dir); return a === b || a.startsWith(b + '\\') || a.startsWith(b + '/'); };
/**
 * Marca os programas que são jogos (pela pasta ou pelo desinstalador do Steam) e põe na lista os jogos sem desinstalador
 * (encontrados pela busca), como itens do tipo "folder". Desinstalar um desses itens manda a pasta para a Lixeira.
 */
function withGames(list: AppEntry[], g: { store: string[]; found: FoundGame[] }): AppEntry[] {
  const dirs = [...g.store, ...g.found.map((f) => f.dir)];
  const out: AppEntry[] = list.filter((a) => a.source !== 'folder').map((a) => ({ ...a, game: !!(a.location && dirs.some((d) => within(a.location!, d))) || /steam:\/\/uninstall/i.test(a.uninstall || '') }));
  for (const f of g.found) {
    if (out.some((a) => a.location && (within(a.location, f.dir) || within(f.dir, a.location)))) continue;
    // o tamanho já calculado numa leitura anterior continua valendo
    const old = list.find((a) => a.id === 'folder:' + f.dir);
    out.push({ id: 'folder:' + f.dir, source: 'folder', name: f.name, publisher: tr("Jogo sem desinstalador ({0})", f.kind), location: f.dir, canUninstall: true, game: true, size: old?.size, sizeSource: old?.sizeSource } as AppEntry);
  }
  return out;
}

// ---------- aplicativos ----------
let appsCache: AppEntry[] | null = null;
let sizeWorker: Worker | null = null;
const sizing = new Set<string>(); // itens com o tamanho sendo calculado agora
ipcMain.handle('apps:list', async (e, refresh: boolean) => {
  if (!appsCache || refresh) appsCache = await system.listApps();
  appsCache = withGames(appsCache, await gameDirsNow());
  // calcula tamanhos ausentes em segundo plano. Itens que chegam depois (por exemplo, os jogos que a busca encontrou
  // enquanto o cálculo anterior rodava) ganham um cálculo próprio, em vez de ficarem sem tamanho.
  const missing = appsCache.filter((a) => !a.size && !sizing.has(a.id) && a.location && fs.existsSync(a.location)).map((a) => ({ id: a.id, path: a.location! }));
  if (missing.length) {
    const sender = e.sender;
    for (const m of missing) sizing.add(m.id);
    const w = new Worker(path.join(__dirname, 'sizeWorker.js'), { workerData: { items: missing } });
    sizeWorker = w;
    const end = () => { w.terminate(); for (const m of missing) sizing.delete(m.id); if (sizeWorker === w) sizeWorker = null; };
    w.on('message', (m: any) => {
      if (m.done) return end();
      const a = appsCache?.find((x) => x.id === m.id);
      if (a) { a.size = m.size; a.sizeSource = 'calculado'; }
      if (!sender.isDestroyed()) sender.send('apps:size', m);
    });
    w.on('error', end);
  }
  return appsCache.map(({ exes, ...a }) => a);
});
const iconCache = new Map<string, string>();
ipcMain.handle('apps:icon', async (_e, p: string) => {
  if (!p) return null;
  if (iconCache.has(p)) return iconCache.get(p);
  // cache em disco por caminho + data de modificação: na próxima abertura os ícones aparecem na hora
  let mt = 0; try { mt = fs.statSync(p).mtimeMs; } catch { /* */ }
  const dir = path.join(app.getPath('userData'), 'icon-cache');
  const file = path.join(dir, crypto.createHash('sha1').update(p + '|' + mt).digest('hex') + '.txt');
  try { const u = fs.readFileSync(file, 'utf8'); iconCache.set(p, u); return u; } catch { /* ainda não */ }
  const url = await loadIcon(p).catch(() => '');
  iconCache.set(p, url);
  if (url) { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, url); } catch { /* */ } }
  return url;
});
/** Ícone do app. macOS: miniatura do Quick Look do .app (o getFileIcon devolve o ícone genérico para pacotes),
 *  senão o .icns do Info.plist. Windows: imagem (.png/.ico do pacote MSIX ou DisplayIcon) ou ícone do .exe. */
async function loadIcon(p: string): Promise<string> {
  const ok = (img: Electron.NativeImage | null | undefined) => (img && !img.isEmpty() ? img.resize({ width: 128, height: 128, quality: 'best' }).toDataURL() : '');
  if (process.platform === 'darwin' && /\.app\/?$/i.test(p)) {
    try { const u = ok(await nativeImage.createThumbnailFromPath(p, { width: 256, height: 256 })); if (u) return u; } catch { /* sem Quick Look */ }
    const png = await macIcnsPng(p);
    if (png) return png;
  }
  if (/\.(png|jpe?g|ico|bmp)$/i.test(p)) { const u = ok(nativeImage.createFromPath(p)); if (u) return u; }
  const img = await app.getFileIcon(p, { size: process.platform === 'win32' ? 'large' : 'normal' });
  return img.isEmpty() ? '' : img.toDataURL();
}
/** .icns do app convertido em PNG pelo sips (o nativeImage não lê .icns). */
async function macIcnsPng(appPath: string): Promise<string> {
  const res = path.join(appPath, 'Contents', 'Resources');
  let file = '';
  try {
    const info = JSON.parse((await execFileP('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(appPath, 'Contents', 'Info.plist')], { encoding: 'utf8', timeout: 4000 })).stdout);
    const name = String(info.CFBundleIconFile || info.CFBundleIconName || '');
    if (name) for (const c of [name, name + '.icns']) if (fs.existsSync(path.join(res, c)) && c.endsWith('.icns')) { file = path.join(res, c); break; }
  } catch { /* */ }
  if (!file) { try { const f = fs.readdirSync(res).find((n) => n.endsWith('.icns')); if (f) file = path.join(res, f); } catch { /* */ } }
  if (!file) return '';
  const out = path.join(app.getPath('temp'), `cc-icon-${process.pid}-${Math.random().toString(36).slice(2)}.png`);
  try {
    await execFileP('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '128', file, '--out', out], { timeout: 8000 });
    const img = nativeImage.createFromPath(out);
    return img.isEmpty() ? '' : img.toDataURL();
  } catch { return ''; } finally { try { fs.unlinkSync(out); } catch { /* */ } }
}
ipcMain.handle('apps:uninstall', async (e, ids: string[], silent: boolean) => {
  const results: any[] = [];
  for (const id of ids) {
    const a = appsCache?.find((x) => x.id === id);
    if (!a) { results.push({ id, ok: false, message: tr("Não encontrado") }); continue; }
    if (!e.sender.isDestroyed()) e.sender.send('apps:uninstallProgress', { id, status: 'running' });
    // jogo sem desinstalador: a pasta vai para a Lixeira (dá para recuperar até esvaziar a Lixeira)
    const r = a.source === 'folder' && a.location
      ? await shell.trashItem(a.location).then(() => { forgetFoundGame(a.location!); return { ok: true, message: tr("A pasta foi para a Lixeira") }; }, (err) => ({ ok: false, message: String(err?.message || err) }))
      : await system.uninstallApp(a, silent);
    results.push({ id, ...r });
    if (r.ok && appsCache) appsCache = appsCache.filter((x) => x.id !== id);
    if (r.ok) logActivity({ kind: 'uninstall', name: a.name, freed: a.size || 0 });
    if (!e.sender.isDestroyed()) e.sender.send('apps:uninstallProgress', { id, status: r.ok ? 'ok' : 'fail', message: r.message });
  }
  return results;
});
ipcMain.handle('apps:leftovers', async (_e, ids: string[]) => {
  const out: Record<string, { path: string; size: number; kind: string }[]> = {};
  for (const id of ids) { const a = appsCache?.find((x) => x.id === id); out[id] = a ? await system.appLeftovers(a) : []; }
  return out;
});
ipcMain.handle('apps:openLocation', (_e, p: string) => shell.openPath(p));
// dossiê: o app vem da lista já lida (o renderer só manda o id), o jogo pela própria descrição
// guardado por alguns minutos: voltar a um dossiê (ou abrir de novo) é instantâneo
const dossierCache = new Map<string, { at: number; p: Promise<any> }>();
ipcMain.handle('dossier:local', async (_e, t: { kind: 'app'; app: AppEntry } | { kind: 'game'; game: GameInfo }, refresh?: boolean) => {
  const key = t.kind === 'game' ? 'g:' + t.game.id : 'a:' + t.app.id;
  const hit = dossierCache.get(key);
  if (hit && !refresh && Date.now() - hit.at < 5 * 60000) return hit.p;
  const p = t.kind === 'game' ? gameDossier(t.game, appsCache) : appDossier(appsCache?.find((x) => x.id === t.app.id) || t.app);
  dossierCache.set(key, { at: Date.now(), p });
  p.catch(() => dossierCache.delete(key));
  return p;
});
// mapa do armazenamento da Visão geral (categorias medidas num worker; progresso por evento)
ipcMain.handle('storage:map', (e, refresh?: boolean) => {
  const sender = e.sender;
  // as pastas dos jogos: as das lojas (a mesma busca do Modo Jogo) e as encontradas em qualquer pasta dos discos
  const gameDirs = async () => { const g = await gameDirsNow(); return [...g.store, ...g.found.map((f) => f.dir)]; };
  return storageMap((m) => { if (!sender.isDestroyed()) sender.send('storage:progress', m); }, !!refresh, gameDirs);
});
// Gatekeeper do macOS (lento): o dossiê pede depois de aparecer
const gkCache = new Map<string, Promise<any>>();
ipcMain.handle('dossier:gatekeeper', (_e, p: string) => {
  if (process.platform !== 'darwin' || !/\.app\/?$/.test(p || '')) return null;
  if (!gkCache.has(p)) gkCache.set(p, require('./platform/darwin/dossier').gatekeeper(p).catch(() => null));
  return gkCache.get(p);
});
// tamanho das pastas de dados do dossiê, num worker (pastas como a do Chrome têm dezenas de milhares de arquivos)
const dirSizeCache = new Map<string, { at: number; size: number }>();
ipcMain.handle('dossier:sizes', (_e, paths: string[]) => new Promise<Record<string, number>>((resolve) => {
  const out: Record<string, number> = {};
  const dirs: { id: string; path: string }[] = [];
  for (const p of paths) {
    const c = dirSizeCache.get(p);
    if (c && Date.now() - c.at < 5 * 60000) { out[p] = c.size; continue; }
    try { const st = fs.lstatSync(p); if (st.isDirectory()) dirs.push({ id: p, path: p }); else out[p] = st.size; } catch { out[p] = 0; }
  }
  if (!dirs.length) return resolve(out);
  const w = new Worker(path.join(__dirname, 'sizeWorker.js'), { workerData: { items: dirs } });
  const finish = () => { w.terminate(); resolve(out); };
  w.on('message', (m: any) => { if (m.done) return finish(); out[m.id] = m.size; dirSizeCache.set(m.id, { at: Date.now(), size: m.size }); });
  w.on('error', finish);
}));
ipcMain.handle('dossier:online', (_e, q: DossierQuery, refresh?: boolean) => onlineDossier(q, !!refresh));
ipcMain.handle('apps:removeEntry', async (_e, id: string) => {
  const a = appsCache?.find((x) => x.id === id);
  if (!a) return { ok: false, message: tr("Não encontrado") };
  const r = await system.removeEntry(a);
  if (r.ok && appsCache) appsCache = appsCache.filter((x) => x.id !== id);
  return r;
});

// ---------- exportação ----------
async function renderHtmlWindow(html: string) {
  const tmp = path.join(app.getPath('temp'), `cleancode-report-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await w.loadFile(tmp);
  return { w, tmp };
}
ipcMain.handle('export:run', async (e, scanId: number, nodeId: number, format: string, opts: { depth?: number; files?: boolean } = {}) => {
  const win = BrowserWindow.fromWebContents(e.sender)!;
  const info = await query(scanId, 'nodeInfo', [nodeId]);
  const sum = await query(scanId, 'summary');
  const rows = await query(scanId, 'exportRows', [nodeId, opts.depth ?? 3, opts.files ?? false]);
  const meta = { root: sum.root, node: info.path, date: Date.now(), totalSize: info.size, totalFiles: info.files };
  const base = (info.name || 'raiz').replace(/[<>:"/\\|?*]/g, '_') || 'raiz';
  if (format === 'print') {
    const [ext, top] = await Promise.all([query(scanId, 'extStats', [nodeId]), query(scanId, 'topFiles', [nodeId, 20])]);
    const { w, tmp } = await renderHtmlWindow(toHTML(rows, meta, { ext, top }));
    w.webContents.print({}, () => { w.close(); fs.unlink(tmp, () => {}); });
    return 'print';
  }
  const filters: Record<string, Electron.FileFilter> = {
    csv: { name: tr("CSV (Excel, separador ;)"), extensions: ['csv'] }, xlsx: { name: tr("Pasta de trabalho do Excel"), extensions: ['xlsx'] },
    html: { name: tr("Página HTML"), extensions: ['html'] }, pdf: { name: 'PDF', extensions: ['pdf'] }, txt: { name: tr("Texto"), extensions: ['txt'] },
  };
  const r = await dialog.showSaveDialog(win, { title: tr("Exportar"), defaultPath: `CleanCode - ${base}.${format}`, filters: [filters[format]] });
  if (r.canceled || !r.filePath) return null;
  const file = r.filePath;
  if (format === 'csv') writeText(file, toCSV(rows));
  else if (format === 'xlsx') await toXLSX(rows, meta, file);
  else if (format === 'txt') writeText(file, rows.map((x: any) => `${'  '.repeat(x.level || 0)}${x.kind === 'file' ? x.name : x.level ? x.name : x.path}\t${x.size}\t${x.files}`).join('\r\n'));
  else {
    const [ext, top] = await Promise.all([query(scanId, 'extStats', [nodeId]), query(scanId, 'topFiles', [nodeId, 20])]);
    const html = toHTML(rows, meta, { ext, top });
    if (format === 'html') writeText(file, html);
    else {
      const { w, tmp } = await renderHtmlWindow(html);
      const pdf = await w.webContents.printToPDF({ printBackground: true, pageSize: 'A4', landscape: true });
      fs.writeFileSync(file, pdf);
      w.close(); fs.unlink(tmp, () => {});
    }
  }
  return file;
});
ipcMain.handle('export:list', async (e, rows: any[], format: string, name: string, cols?: { key: string; label: string }[]) => {
  // exporta listas genéricas (resultados de busca, duplicados, apps)
  const win = BrowserWindow.fromWebContents(e.sender)!;
  const r = await dialog.showSaveDialog(win, { title: tr("Exportar lista"), defaultPath: `CleanCode - ${name}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (r.canceled || !r.filePath) return null;
  if (format === 'csv') writeText(r.filePath, toCSV(rows, cols));
  else await toXLSX(rows, { root: '', node: name, date: Date.now(), totalSize: rows.reduce((s, x) => s + (x.size || 0), 0), totalFiles: rows.length }, r.filePath, cols);
  return r.filePath;
});

