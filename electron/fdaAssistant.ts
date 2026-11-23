// Assistente de "Acesso Total ao Disco" (macOS). A Apple não deixa nenhum app ligar esse acesso sozinho
// (nem com senha): só o usuário, em Ajustes do Sistema. O assistente deixa isso o mais simples possível:
// - abre a página certa dos Ajustes;
// - mostra uma janelinha flutuante com o ícone do CleanCode para arrastar direto para a lista
//   (sem procurar o app pelo botão "+");
// - confere o acesso a cada segundo e avisa a janela principal assim que for liberado.
import { app, BrowserWindow, ipcMain, nativeImage, screen } from 'electron';
import path from 'path';
import { system } from './platform';

const W = 460, H = 360;
let helper: BrowserWindow | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let iconCache: Electron.NativeImage | null = null;

/** Pacote .app em execução (no desenvolvimento, o Electron.app). */
function bundle(): string | null {
  return /^(.+?\.app)\/Contents\/MacOS\//.exec(process.execPath)?.[1] || null;
}
async function appIcon(): Promise<Electron.NativeImage> {
  if (iconCache) return iconCache;
  // (app.getFileIcon derruba o processo no macOS 27: lê o ícone direto do pacote)
  const b = bundle();
  // (o nativeImage do Electron não lê .icns no macOS 27: o PNG do ícone vai empacotado em build/icon-mac.png)
  const candidates = [path.join(app.getAppPath(), 'build', 'icon-mac.png'), b && path.join(b, 'Contents', 'Resources', 'icon.icns')].filter(Boolean) as string[];
  for (const c of candidates) { const img = nativeImage.createFromPath(c); if (!img.isEmpty()) { iconCache = img.resize({ width: 256, height: 256 }); return iconCache; } }
  iconCache = nativeImage.createEmpty();
  return iconCache;
}

function stopWatching() { if (timer) { clearInterval(timer); timer = null; } }
function closeHelper() { if (helper && !helper.isDestroyed()) helper.close(); helper = null; }

export function setupFdaAssistant(opts: { isDev: boolean; mainWindow: () => BrowserWindow | null }) {
  const broadcast = (ch: string, d?: unknown) => {
    for (const w of [opts.mainWindow(), helper]) if (w && !w.isDestroyed()) w.webContents.send(ch, d);
  };

  function openHelper() {
    void appIcon();
    if (helper && !helper.isDestroyed()) { helper.showInactive(); return; }
    // à direita da tela, na altura do meio: os Ajustes do Sistema abrem no centro e a lista fica livre à esquerda
    const area = screen.getPrimaryDisplay().workArea;
    helper = new BrowserWindow({
      width: W, height: H, x: Math.round(area.x + area.width - W - 24), y: Math.round(area.y + (area.height - H) / 2),
      frame: false, transparent: true, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    helper.setAlwaysOnTop(true, 'floating');
    helper.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (opts.isDev) helper.loadURL('http://localhost:5173/#fda-helper');
    else helper.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'fda-helper' });
    helper.once('ready-to-show', () => helper?.showInactive());
    helper.on('closed', () => { helper = null; });
  }

  ipcMain.handle('fda:start', () => {
    system.openFullDiskAccessSettings();
    // espera os Ajustes abrirem para a janelinha aparecer por cima deles
    setTimeout(openHelper, 700);
    stopWatching();
    timer = setInterval(() => {
      if (system.fullDiskAccess() !== true) return;
      stopWatching();
      broadcast('fda:granted');
      // a janelinha mostra o "pronto" e some; o CleanCode volta para a frente
      setTimeout(() => {
        closeHelper();
        const m = opts.mainWindow();
        if (m && !m.isDestroyed()) { if (m.isMinimized()) m.restore(); m.show(); app.focus({ steal: true }); }
      }, 1600);
    }, 1000);
    return true;
  });
  ipcMain.handle('fda:stop', () => { stopWatching(); closeHelper(); return true; });
  ipcMain.handle('fda:icon', async () => { const i = await appIcon(); return i.isEmpty() ? null : i.toDataURL(); });
  ipcMain.handle('fda:relaunch', () => { app.relaunch(); app.exit(0); });
  // arrastar o ícone: o macOS recebe o .app como se viesse do Finder
  // (startDrag precisa ser chamado na hora do dragstart: o ícone já fica carregado ao abrir a janelinha)
  ipcMain.on('fda:drag', (e) => {
    const b = bundle(); if (!b || !iconCache || iconCache.isEmpty()) return;
    e.sender.startDrag({ file: b, icon: iconCache.resize({ width: 72, height: 72 }) });
  });
  app.on('before-quit', () => { stopWatching(); closeHelper(); });
}
