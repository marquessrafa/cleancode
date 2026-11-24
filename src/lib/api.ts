export interface Row {
  id: number; kind: 'dir' | 'file'; name: string; depth: number; expanded: boolean;
  size: number; alloc: number; files: number; dirs: number; pct: number;
  mtime: number; atime: number; ctime: number; attr: number; err: number; link: number; level: number;
  hasChildren: boolean; prevSize?: number; prevFiles?: number; owner?: string; path?: string; dir?: string;
}
export interface Progress {
  scanId: number; scanning: boolean; files: number; dirs: number; size: number; alloc: number;
  current: string; errors: number; elapsed: number; pending: number;
}
export interface Drive { root: string; label: string; fs: string; type: string; total: number; free: number; used: number }
export interface DriveHardware {
  letter: string; media: 'SSD' | 'HD' | 'Desconhecido'; bus: string; usb?: string; usbNote?: string;
  model: string; brand?: string; firmware?: string; health?: string; diskSize?: number; removable?: boolean;
}
export interface AppEntry {
  id: string; source: 'win32' | 'store' | 'mac'; name: string; version?: string; publisher?: string; installDate?: number;
  size?: number; sizeSource?: string; location?: string; lastUsed?: number; lastUsedSource?: string; runCount?: number;
  uninstall?: string; quiet?: string; icon?: string; hive?: string; arch?: string; regPath?: string;
  packageFullName?: string; family?: string; msi?: boolean; canUninstall: boolean; background?: boolean; orphan?: boolean; exes?: string[];
  bundleId?: string; origin?: string;
}
export interface Settings {
  theme: 'system' | 'light' | 'dark'; accent: 'green' | 'purple' | 'blue' | 'orange' | 'white'; units: string; decimals: number; displayMode: 'size' | 'alloc' | 'files' | 'pct';
  showFilesInTree: boolean; hideEmpty: boolean; boldLarge: boolean; sizeBars: boolean; compressedBlue: boolean;
  datesWithTime: boolean; showErrorsAfterScan: boolean; autoSaveHistory: boolean; alwaysAdmin: boolean;
  staleMonths: number; sidebarCollapsed: boolean; silentUninstall: boolean; columns: string[]; recent: string[];
  treemap: { depth: number; showFiles: boolean; labels: boolean; hierarchy: boolean; freeSpace: boolean; cushion: boolean };
  runInBackground: boolean; startWithWindows: boolean; notifyEnabled: boolean; notifyDisk: boolean; notifyApps: boolean; notifyThresholdMB: number;
  updateSource: string; autoCheckUpdates: boolean; autoInstallUpdates: boolean;
  language: 'auto' | 'pt' | 'en' | 'es';
}
export interface UpdateNote { version: string; date: string; headline: string; groups: { title: string; icon: string; items: string[] }[] }
export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'installing' | 'restarting' | 'error';
  info?: { version: string; file: string; size: number; date?: string; source: string; notes?: UpdateNote[] } | null; error?: string; done?: number; total?: number; checkedAt?: number;
  /** etapas da instalação (popup de atualização) e a atual */
  steps?: string[]; step?: number;
  defaultSource?: string; source?: 'found' | 'searching' | 'missing';
}

export interface AppInfo {
  version: string; isAdmin: boolean; electron: string; userData: string;
  platform: string; osName: string; fileManager: string; canElevate: boolean; contextMenu: boolean; home: string;
}

export interface MetricsSnapshot {
  machine: string; os: string; at: number;
  cpu: { load: number; cores: number; temperature?: number; user: number; system: number };
  memory: { total: number; used: number; pressure: number; level: 'normal' | 'warn' | 'critical' };
  disk: { root: string; label: string; total: number; free: number } | null;
  battery: { percent: number; charging: boolean; plugged: boolean; minutesLeft?: number } | null;
  temperatures: { cpu?: number; gpu?: number; battery?: number; ssd?: number };
  network: { kind: string; iface: string; rxRate: number; txRate: number; rxTotal: number; txTotal: number } | null;
  devices: { name: string; kind: string; battery?: number }[];
  gpu: { util?: number; temp?: number } | null;
  power: { systemW?: number; batteryW?: number; adapterW?: number } | null;
  health: { level: 'good' | 'fair' | 'attention'; issues: string[] };
}
export interface JunkCategoryInfo { id: string; name: string; description: string; group: string; selected: boolean; risk: 'safe' | 'review'; removal?: 'delete'; special?: boolean; paths: string[] }
export interface JunkItem { path: string; name: string; size: number; mtime: number; dir: boolean }
export interface JunkResult { id: string; size: number; count: number; items: JunkItem[]; truncated?: boolean; denied?: boolean }
export interface StartupItem { id: string; name: string; detail: string; kind: 'login' | 'agent' | 'daemon' | 'run' | 'folder'; scope: 'user' | 'system'; enabled: boolean; control: 'toggle' | 'remove' | 'none'; admin?: boolean; location?: string; publisher?: string }
export interface MaintenanceTask { id: string; name: string; description: string; admin: boolean; duration: string; recommended?: boolean }
export interface ProcInfo { pid: number; name: string; cpu: number; mem: number; path?: string }
export interface ActivityEntry {
  at: number; kind: 'cleanup' | 'maintenance' | 'startup' | 'uninstall' | 'delete' | 'protection';
  freed?: number; removed?: number; failed?: number; mode?: string; tasks?: string[]; name?: string; enabled?: boolean; sample?: string[];
}
export interface SecurityCheck { id: string; name: string; ok: boolean | null; detail: string; critical?: boolean; settingsUrl?: string }
export interface SignatureInfo { status: 'apple' | 'developer' | 'adhoc' | 'unsigned' | 'invalid' | 'missing' | 'unknown'; signer?: string }
export interface PersistenceFinding { id: string; name: string; kind: string; executable: string; detail: string; signature: SignatureInfo; level: 'ok' | 'warn' | 'risk'; reasons: string[]; startupId?: string; enabled: boolean; control?: 'toggle' | 'remove' | 'none' }
export interface ExtensionInfo { id: string; name: string; browser: string; version?: string; path: string; allSites?: boolean; profile?: string }
export interface ProtectionReport { at: number; checks: SecurityCheck[]; persistence: PersistenceFinding[]; extensions: ExtensionInfo[]; quickScanName?: string }
export interface ClutterFile { path: string; name: string; size: number; mtime: number; atime: number; thumb?: string; width?: number; height?: number }
export interface HardwareInfo {
  cpu: { name: string; cores: number; threads: number; pCores?: number; eCores?: number; baseMHz?: number; maxMHz?: number; l2?: number; l3?: number; arch: string };
  gpus: { name: string; cores?: number; vram?: number; driver?: string; api?: string; vendor?: string }[];
  memory: { total: number; type?: string; speed?: number; manufacturer?: string; slots?: number; modules: { size: number; speed?: number; manufacturer?: string; part?: string; slot?: string; formFactor?: 'dimm' | 'sodimm' | 'onboard' }[] };
  board: { system?: string; manufacturer?: string; model?: string; version?: string; firmware?: string; firmwareDate?: string; chip?: string; chassis?: 'desktop' | 'laptop' };
  displays: { name: string; resolution?: string; builtin?: boolean }[];
}
export interface HwLive {
  gpu: { util?: number; memUsed?: number; memTotal?: number; temp?: number; procs?: { name: string; pid: number; util: number }[] };
  power: { systemW?: number; batteryW?: number; adapterW?: number; voltage?: number; current?: number; plan?: string };
  cpuMHz?: number; fans: { name: string; rpm: number }[];
  sensors?: { kind: 'cpu' | 'gpu' | 'disk' | 'battery' | 'board' | 'ram' | 'psu'; group?: string; hw?: string; name: string; value: number; min?: number; max?: number; unit?: string }[];
  advanced?: { available: boolean; active: boolean; source?: string; cpuBlocked?: 'driver' | 'admin' | 'crash' | 'nodata'; logPath?: string };
  needsAdmin?: string;
}
export interface HardwareLive {
  live: HwLive | null; temps: { cpu?: number; gpu?: number; battery?: number; ssd?: number }; memory: { total: number; used: number; pressure: number; level: string };
  memoryDetail: { active: number; wired: number; compressed: number; available: number; swapUsed: number; swapTotal: number } | null;
  battery: { percent: number; charging: boolean; plugged: boolean; minutesLeft?: number } | null; batteryHealth: { cycles?: number; condition?: string; maxCapacity?: number } | null;
  cores: number[]; load: number; split: { user: number; system: number; idle: number }; uptime: number;
}
export interface DiskDetail {
  id: string; name: string; model?: string; firmware?: string; bus?: string; media?: string; size?: number; link?: string; trim?: boolean;
  health?: string; healthPct?: number; temp?: number; powerOnHours?: number; powerCycles?: number; written?: number; read?: number;
  unsafeShutdowns?: number; mediaErrors?: number; spare?: number; partitions?: { name: string; size: number; fs?: string; mount?: string }[]; needsAdmin?: boolean;
}
export interface RepairItem { id: string; category: string; title: string; detail: string; target?: string; fixable: boolean; needsAdmin?: boolean; optional?: boolean }
export type BrowserItemId = 'cache' | 'gpu' | 'history' | 'downloads' | 'cookies' | 'sessions' | 'autofill';
export interface BrowserProfile { id: string; browserId: string; browser: string; name: string; path: string; running: boolean; items: { id: BrowserItemId; label: string; detail: string; safe: boolean; size: number; count?: number }[] }
export type AppDataStatus = 'installed' | 'orphan' | 'unknown' | 'system';
export interface AppDataItem { path: string; name: string; root: string; parent?: string; size: number; files: number; mtime: number; safe: number; safePaths: { path: string; size: number; reason: string }[]; status: AppDataStatus; program?: string }
export type DossierGroup = 'about' | 'install' | 'usage' | 'tech' | 'security';
export interface DossierFact { group: DossierGroup; label: string; value: string | number; kind?: 'text' | 'date' | 'size' | 'path' | 'url' | 'mono'; tone?: 'ok' | 'warn' | 'danger'; hint?: string }
export interface DossierFile { path: string; size: number; kind: string }
export interface DossierQuery { name: string; bundleId?: string; adamId?: string; steamId?: string; publisher?: string; kind: 'app' | 'game'; mas?: boolean }
export interface DossierLocal { facts: DossierFact[]; badges: { label: string; tone?: 'ok' | 'warn' | 'danger'; hint?: string }[]; tech: string[]; licenses: DossierFile[]; data: DossierFile[]; folder?: string; running?: boolean; query: DossierQuery }
export interface DossierOnline { summary?: string; summarySource?: { label: string; url: string }; facts: DossierFact[]; sources: { label: string; url: string }[]; latest?: string; error?: string }
export interface StorageCat { id: string; label: string; paths: string[]; size: number; done: boolean; partial?: boolean }
export interface StorageMap { root: string; at: number; done: boolean; cats: StorageCat[] }
export type DossierTarget = { kind: 'app'; app: AppEntry } | { kind: 'game'; game: GameInfo };
export interface GameInfo { id: string; name: string; store: 'steam' | 'epic' | 'gog' | 'app' | 'custom'; dir?: string; size?: number; launch: string }
export interface GameToggle { id: string; label: string; detail: string; on: boolean; needsAdmin?: boolean; needsRestart?: boolean; recommended: boolean }
export interface GameSessionOptions { close: { pids: number[]; name: string }[]; power: boolean; freeMemory: boolean; boostDir?: string }
export interface GameStatus { toggles: GameToggle[]; powerPlan?: string; shaderCache: number; memory: { total: number; free: number }; session: { at: number; options: GameSessionOptions } | null }
export interface GameStep { label: string; ok: boolean; message: string }
export interface ClutterReport { scanned: number; large: ClutterFile[]; old: ClutterFile[]; duplicates: { size: number; files: ClutterFile[] }[]; similar: { files: ClutterFile[] }[]; downloads: ClutterFile[]; roots: string[] }
export interface SpeedProgress { phase: 'ping' | 'download' | 'upload' | 'done' | 'error'; mbps?: number; ping?: number; download?: number; upload?: number; error?: string }

interface CC {
  /** process.platform, disponível já no carregamento (sem IPC) */
  platform: string;
  /** idioma da interface, decidido pelo processo principal (configuração ou idioma do computador) */
  lang: 'pt' | 'en' | 'es';
  /** reinicia o CleanCode */
  relaunch(): Promise<boolean>;
  info(): Promise<AppInfo>;
  drives(): Promise<Drive[]>;
  metricsSnapshot(): Promise<MetricsSnapshot>;
  metricsDetails(kind: 'cpu' | 'memory' | 'battery' | 'storage' | 'network' | 'devices' | 'gpu' | 'power'): Promise<any>;
  metricsEject(root: string): Promise<{ ok: boolean; message: string }>;
  cleanupCategories(): Promise<JunkCategoryInfo[]>;
  cleanupScan(opts?: { aggressive?: boolean }): Promise<JunkResult[]>;
  cleanupCancel(): Promise<boolean>;
  cleanupClean(paths: string[], specials: string[], mode: 'trash' | 'delete'): Promise<{ freed: number; removed: number; failed: { path: string; error: string }[] }>;
  perfStartup(): Promise<StartupItem[]>;
  perfSetStartup(id: string, enabled: boolean): Promise<{ ok: boolean; message: string }>;
  perfTasks(): Promise<MaintenanceTask[]>;
  perfRunTasks(ids: string[]): Promise<{ id: string; ok: boolean; message: string }[]>;
  perfProcesses(): Promise<ProcInfo[]>;
  perfKill(pids: number[]): Promise<number>;
  perfOpenStartupSettings(): Promise<boolean>;
  protectionScan(): Promise<ProtectionReport>;
  repairsScan(): Promise<RepairItem[]>;
  repairsFix(ids: string[]): Promise<{ results: { id: string; ok: boolean; message: string }[]; backup: string | null }>;
  repairsBackups(): Promise<{ id: string; files: number; at: number }[]>;
  repairsRestore(id: string): Promise<{ ok: boolean; message: string }>;
  repairsErrors(): Promise<{ app: string; message: string; at: number }[]>;
  browsersScan(): Promise<{ profiles: BrowserProfile[]; denied: string[] }>;
  browsersClean(sel: { profileId: string; items: BrowserItemId[] }[]): Promise<{ profileId: string; ok: boolean; freed: number; message: string }[]>;
  browsersOptimize(ids: string[]): Promise<{ profileId: string; ok: boolean; freed: number; message: string }[]>;
  browsersClose(id: string): Promise<boolean>;
  gameStatus(): Promise<GameStatus>;
  gameToggle(id: string, on: boolean): Promise<{ ok: boolean; message: string }>;
  gameGames(): Promise<GameInfo[]>;
  gameDirs(): Promise<string[]>;
  gameAddDir(): Promise<string[]>;
  gameRemoveDir(dir: string): Promise<string[]>;
  freeMemory(deep?: boolean): Promise<{ ok: boolean; freed: number; message: string }>;
  appdataScan(): Promise<AppDataItem[]>;
  appdataCancel(): Promise<boolean>;
  appdataClean(req: { safe: string[]; trash: string[] }): Promise<{ freed: number; removed: number; failed: number }>;
  onAppdataProgress(cb: (d: { type: string; label?: string; name?: string; count?: number; total?: number }) => void): () => void;
  gameStart(o: GameSessionOptions): Promise<{ steps: GameStep[] }>;
  gameStop(): Promise<{ steps: GameStep[] }>;
  gameShaders(): Promise<{ freed: number; message: string }>;
  gameLaunch(target: string): Promise<boolean>;
  whatsNew(): Promise<{ show: boolean; version: string; previous?: string }>;
  hardwareInfo(): Promise<HardwareInfo>;
  hardwareLive(): Promise<HardwareLive>;
  hardwareDisks(): Promise<DiskDetail[]>;
  hardwareAdvanced(on: boolean): Promise<{ ok: boolean; message: string }>;
  whatsNewSeen(): Promise<boolean>;
  clutterScan(): Promise<ClutterReport>;
  clutterCancel(): Promise<boolean>;
  clutterTrash(paths: string[]): Promise<{ freed: number; removed: number; failed: { path: string; error: string }[] }>;
  protectionQuickScan(): Promise<{ ok: boolean; message: string }>;
  /** abre uma tela de ajustes do SO (só esquemas de ajustes do sistema) */
  openSystemSettings(url: string): Promise<boolean>;
  activityList(): Promise<ActivityEntry[]>;
  activityClear(): Promise<boolean>;
  speedTest(): Promise<SpeedProgress>;
  panelResize(h: number, w?: number): Promise<boolean>;
  panelReady(): Promise<boolean>;
  panelMouse(ignore: boolean): Promise<boolean>;
  panelHide(): Promise<boolean>;
  panelToggle(): Promise<boolean>;
  panelOpenMain(page?: string): Promise<boolean>;
  /** macOS: tem "Acesso Total ao Disco"? null no Windows */
  fullDiskAccess(): Promise<boolean | null>;
  fdaStart(): Promise<boolean>;
  fdaStop(): Promise<boolean>;
  fdaIcon(): Promise<string | null>;
  fdaRelaunch(): Promise<void>;
  fdaCopyPath(): Promise<string | null>;
  onFdaGranted(cb: () => void): () => void;
  openFullDiskAccess(): Promise<boolean>;
  drivesHardware(force?: boolean): Promise<DriveHardware[]>;
  pickFolder(): Promise<string | null>;
  scanStart(root: string): Promise<number>;
  scanQuery<T = any>(id: number, method: string, ...args: any[]): Promise<T>;
  scanClose(id: number): Promise<boolean>;
  scanList(): Promise<{ id: number; root: string; done: boolean; last: Progress | null }[]>;
  open(p: string): Promise<string>;
  showInFolder(p: string): Promise<boolean>;
  copyText(t: string): Promise<boolean>;
  trash(paths: string[]): Promise<{ path: string; ok: boolean; error?: string }[]>;
  deletePermanent(paths: string[]): Promise<{ path: string; ok: boolean; error?: string }[]>;
  move(paths: string[]): Promise<{ dest: string; results: { path: string; ok: boolean; error?: string }[] } | null>;
  newFolder(parent: string, name: string): Promise<string>;
  properties(p: string): Promise<boolean>;
  settingsGet(): Promise<Settings>;
  settingsSet(patch: Partial<Settings>): Promise<Settings>;
  restartAdmin(): Promise<boolean>;
  newWindow(): Promise<boolean>;
  titlebar(dark: boolean): Promise<boolean>;
  notifyTest(): Promise<boolean>;
  updateState(): Promise<UpdateState>;
  updateCheck(): Promise<UpdateState>;
  updatePickSource(): Promise<string | null>;
  updateInstall(): Promise<boolean>;
  updateStart(): Promise<boolean>;
  loginItemStatus(): Promise<{ packaged: boolean; openAtLogin: boolean }>;
  contextMenuStatus(): Promise<boolean>;
  contextMenu(enable: boolean): Promise<boolean>;
  historyList(): Promise<any[]>;
  historySave(scanId: number): Promise<string>;
  historyDelete(id: string): Promise<boolean>;
  historyCompare(scanId: number, id: string | null): Promise<boolean>;
  historyExport(scanId: number): Promise<string | null>;
  historyImport(): Promise<string | null>;
  appsList(refresh: boolean): Promise<AppEntry[]>;
  appIcon(p: string): Promise<string | null>;
  /** macOS: restos em ~/Library de cada app (por id) */
  appLeftovers(ids: string[]): Promise<Record<string, { path: string; size: number; kind: string }[]>>;
  appsUninstall(ids: string[], silent: boolean): Promise<{ id: string; ok: boolean; code?: number; message: string }[]>;
  openLocation(p: string): Promise<string>;
  appRemoveEntry(id: string): Promise<{ ok: boolean; message: string }>;
  openLink(url: string): Promise<boolean>;
  dossierLocal(t: DossierTarget, refresh?: boolean): Promise<DossierLocal>;
  dossierSizes(paths: string[]): Promise<Record<string, number>>;
  storageMap(refresh?: boolean): Promise<StorageMap>;
  dossierGatekeeper(p: string): Promise<{ fact: DossierFact; badge: { label: string; tone?: 'ok' | 'warn' | 'danger'; hint?: string } } | null>;
  dossierOnline(q: DossierQuery, refresh?: boolean): Promise<DossierOnline>;
  exportRun(scanId: number, nodeId: number, format: string, opts?: any): Promise<string | null>;
  exportList(rows: any[], format: string, name: string, cols?: { key: string; label: string }[]): Promise<string | null>;
  on: {
    progress(cb: (d: Progress) => void): () => void;
    done(cb: (d: { scanId: number; stopped: boolean }) => void): () => void;
    scanError(cb: (d: any) => void): () => void;
    task(cb: (d: { scanId: number; method: string; progress: { phase: string; done: number; total: number } }) => void): () => void;
    openPath(cb: (p: string) => void): () => void;
    navigate(cb: (page: string) => void): () => void;
    nav(cb: (d: 'back' | 'forward') => void): () => void;
    storageProgress(cb: (m: StorageMap) => void): () => void;
    openDossier(cb: (app: AppEntry) => void): () => void;
    cleanupProgress(cb: (d: { type: 'start' | 'category' | 'done' | 'error'; id?: string; error?: string } & Partial<JunkResult>) => void): () => void;
    clutterProgress(cb: (d: { phase: string; scanned?: number; done?: number; total?: number; current?: string; error?: string }) => void): () => void;
    cleanProgress(cb: (d: { done: number; total: number; freed: number; current: string }) => void): () => void;
    speedProgress(cb: (p: SpeedProgress) => void): () => void;
    panelShown(cb: () => void): () => void;
    settingsChanged(cb: (s: Settings) => void): () => void;
    updateState(cb: (s: UpdateState) => void): () => void;
    appSize(cb: (d: { id: string; size: number }) => void): () => void;
    uninstallProgress(cb: (d: { id: string; status: string; message?: string }) => void): () => void;
  };
}

declare global { interface Window { cc: CC } }
export const cc = window.cc;
export const isMac = cc.platform === 'darwin';
/** nome do SO e do gerenciador de arquivos, para textos da interface */
export const OS_NAME = isMac ? 'macOS' : 'Windows';
export const FILE_MANAGER = isMac ? 'Finder' : 'Explorer';
/** separador de caminho do SO */
export const SEP = isMac ? '/' : '\\';
export const joinPath = (dir: string, name: string) => (dir.endsWith(SEP) ? dir + name : dir + SEP + name);
