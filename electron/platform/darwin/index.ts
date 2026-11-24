// Integração com o macOS (processo principal).
import { app, nativeImage, shell } from 'electron';
import { execFile, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { SystemApi } from '../types';
import { driveHardware } from './hardware';
import { metrics } from './metrics';
import { junk } from './junk';
import { perf } from './perf';
import { repairs } from './repairs';
import { game } from './game';
import { protection } from './protection';
import { listApps, uninstallApp, findLeftovers, installedAppKeys, describeInstalledApp, watchInstalls } from './apps';
import { t } from '../../i18n';

/** Arquivos que só abrem com "Acesso Total ao Disco" (TCC). */
const TCC_PROBES = ['/Library/Application Support/com.apple.TCC/TCC.db', path.join(os.homedir(), 'Library', 'Safari'), path.join(os.homedir(), 'Library', 'Mail')];
function canRead(p: string): boolean | null {
  try {
    const st = fs.statSync(p);
    if (st.isDirectory()) fs.readdirSync(p); else fs.closeSync(fs.openSync(p, 'r'));
    return true;
  } catch (e: any) {
    return e?.code === 'EPERM' || e?.code === 'EACCES' ? false : null; // null: não existe, não serve de prova
  }
}

/** Pacote .app em execução (…/CleanCode.app), ou null fora do app empacotado. */
function bundlePath(): string | null {
  const m = /^(.+?\.app)\/Contents\/MacOS\//.exec(process.execPath);
  return app.isPackaged && m ? m[1] : null;
}

// $1 = pid do app, $2 = .zip verificado, $3 = destino (.app), $4 = reabrir (1/0)
const UPDATE_SH = `#!/bin/sh
PID="$1"; ZIP="$2"; DEST="$3"; RELAUNCH="$4"
i=0; while kill -0 "$PID" 2>/dev/null && [ $i -lt 100 ]; do sleep 0.3; i=$((i+1)); done
TMP=$(mktemp -d /tmp/cleancode-update.XXXXXX) || exit 1
if /usr/bin/ditto -x -k "$ZIP" "$TMP"; then
  NEW=$(/usr/bin/find "$TMP" -maxdepth 1 -name '*.app' | /usr/bin/head -n 1)
  if [ -n "$NEW" ]; then
    /usr/bin/xattr -cr "$NEW"
    rm -rf "$DEST.old"
    if mv "$DEST" "$DEST.old"; then
      if mv "$NEW" "$DEST"; then rm -rf "$DEST.old"; else mv "$DEST.old" "$DEST"; fi
    fi
  fi
fi
rm -rf "$TMP" "$ZIP"
if [ "$RELAUNCH" = "1" ]; then /usr/bin/open -n "$DEST" --args --updated; fi
rm -f "$0"
`;

/** Texto para AppleScript entre aspas duplas. */
const asq = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

const darwin: SystemApi = {
  osName: 'macOS',
  fileManager: 'Finder',
  canElevate: false, // não há UAC; o acesso a pastas protegidas vem do "Acesso Total ao Disco"
  relaunchAsAdmin() { /* não se aplica */ },

  // botões de semáforo embutidos na barra superior do app (altura 40 px)
  windowChrome: () => ({ titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 } }),
  setTitleBarColors() { /* sem overlay: os botões são do próprio sistema */ },
  trayImage(baseDir) {
    // imagem "template" (preto + alfa, com @2x): o macOS a pinta conforme o tema da barra de menus
    const img = nativeImage.createFromPath(path.join(baseDir, 'build', 'trayTemplate.png'));
    if (img.isEmpty()) return nativeImage.createEmpty();
    img.setTemplateImage(true);
    return img;
  },
  popupCorner: 'top-right',

  fullDiskAccess() {
    for (const p of TCC_PROBES) { const r = canRead(p); if (r !== null) return r; }
    return true;
  },
  openFullDiskAccessSettings() {
    // macOS 13+ (Ajustes do Sistema): link novo. No macOS 27 a Apple ignora o atalho para Acesso Total ao Disco
    // (os outros itens de Privacidade abrem direto) e para em Privacidade e Segurança: o assistente avisa para
    // clicar no item. macOS 12 (Preferências do Sistema): link antigo.
    const darwinMajor = parseInt(os.release(), 10) || 0;
    shell.openExternal(darwinMajor >= 22
      ? 'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles'
      : 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
  },

  showProperties(p) {
    // janela "Obter Informações" do Finder
    const script = `tell application "Finder"\nactivate\nopen information window of (POSIX file ${asq(p)} as alias)\nend tell`;
    execFile('/usr/bin/osascript', ['-e', script], () => { /* */ });
  },

  contextMenu: {
    supported: false, // Quick Action do Finder: fase final do port
    status: async () => false,
    set: async () => false,
  },

  listApps,
  appLeftovers: async (a) => findLeftovers(a),
  uninstallApp,
  removeEntry: async () => ({ ok: false, message: t("Não se aplica no macOS") }),
  driveHardware,
  installedAppKeys,
  describeInstalledApp,
  watchInstalls,
  setBackgroundMode(background) {
    // só na barra de menus: sem ícone no Dock nem no Cmd+Tab, como os utilitários de barra de menus
    if (background) app.dock?.hide(); else app.dock?.show();
  },
  metrics,
  junk,
  perf,
  repairs,
  game,
  protection,

  loginItem: {
    // macOS 13+: item de início pelo SMAppService (Ajustes › Geral › Itens de Início)
    set: (open) => app.setLoginItemSettings({ openAtLogin: open }),
    get: () => app.getLoginItemSettings().openAtLogin,
    launchedAtLogin: () => {
      if (process.argv.includes('--hidden')) return true;
      try { return !!app.getLoginItemSettings().wasOpenedAtLogin; } catch { return false; }
    },
  },

  /**
   * Atualização: o .zip do .app (já conferido por SHA-512) é extraído com ditto, perde a quarentena
   * e substitui o pacote atual por um script sh destacado, que espera o app fechar e o reabre.
   */
  updateSteps: [t("Extraindo a nova versão"), t("Conferindo a assinatura"), t("Substituindo o app"), t("Concluindo")],
  // instala com o app aberto: extrai ao lado do app, confere, troca o pacote (com volta atrás se falhar) e só
  // depois o app reabre. O processo em execução continua usando o pacote antigo até reiniciar.
  async installUpdateLive(file, onStep) {
    const bundle = bundlePath();
    if (!bundle) throw new Error(t("A atualização automática só funciona no app instalado (CleanCode.app)."));
    if (bundle.includes('/AppTranslocation/')) throw new Error(t("Mova o CleanCode para a pasta Aplicativos antes de atualizar. Agora ele está rodando direto do download ou da imagem .dmg."));
    try { fs.accessSync(path.dirname(bundle), fs.constants.W_OK); fs.accessSync(bundle, fs.constants.W_OK); }
    catch { throw new Error(t("O CleanCode não tem permissão para substituir {0}. Baixe o .dmg novo e arraste o app para Aplicativos.", bundle)); }
    const run = (cmd: string, args: string[]) => new Promise<void>((res, rej) => execFile(cmd, args, { timeout: 180000 }, (e) => (e ? rej(e) : res())));
    onStep(0);
    const tmp = fs.mkdtempSync(path.join(path.dirname(bundle), '.cleancode-update-'));
    try {
      await run('/usr/bin/ditto', ['-x', '-k', file, tmp]);
      const name = fs.readdirSync(tmp).find((n) => n.endsWith('.app'));
      if (!name) throw new Error(t("O pacote baixado não contém o app"));
      const fresh = path.join(tmp, name);
      onStep(1);
      // o SHA-512 já foi conferido no download; a assinatura é uma segunda checagem (não bloqueia)
      await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', fresh]).catch(() => {});
      await run('/usr/bin/xattr', ['-cr', fresh]).catch(() => {});
      onStep(2);
      const old = bundle + '.old';
      fs.rmSync(old, { recursive: true, force: true });
      fs.renameSync(bundle, old);
      try { fs.renameSync(fresh, bundle); } catch (e) { fs.renameSync(old, bundle); throw e; }
      onStep(3);
      fs.rmSync(file, { force: true });
      await new Promise((r) => setTimeout(r, 600));
      return 'relaunch' as const;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  },
  cleanupUpdate() {
    const bundle = bundlePath();
    if (bundle && fs.existsSync(bundle + '.old')) fs.rm(bundle + '.old', { recursive: true, force: true }, () => {});
  },
  installUpdate(file, quit, relaunch) {
    const bundle = bundlePath();
    if (!bundle) throw new Error(t("A atualização automática só funciona no app instalado (CleanCode.app)."));
    if (bundle.includes('/AppTranslocation/')) throw new Error(t("Mova o CleanCode para a pasta Aplicativos antes de atualizar. Agora ele está rodando direto do download ou da imagem .dmg."));
    try { fs.accessSync(path.dirname(bundle), fs.constants.W_OK); fs.accessSync(bundle, fs.constants.W_OK); }
    catch { throw new Error(t("O CleanCode não tem permissão para substituir {0}. Baixe o .dmg novo e arraste o app para Aplicativos.", bundle)); }
    const script = path.join(os.tmpdir(), `cleancode-update-${Date.now()}.sh`);
    fs.writeFileSync(script, UPDATE_SH, { mode: 0o755 });
    const child = spawn('/bin/sh', [script, String(process.pid), file, bundle, relaunch ? '1' : '0'], { detached: true, stdio: 'ignore' });
    child.unref();
    setTimeout(quit, 400);
  },
};

export default darwin;
