// Tipos e constantes comuns a todas as plataformas.
// Cada sistema (win32/, darwin/) implementa as mesmas assinaturas; o resto do app
// só conversa com o SO através de ./fs (workers) e ./index (processo principal).

/** Atributos no formato do Windows; o macOS traduz o que tem equivalente. */
export const ATTR = {
  READONLY: 0x1, HIDDEN: 0x2, SYSTEM: 0x4, DIRECTORY: 0x10, ARCHIVE: 0x20, DEVICE: 0x40,
  NORMAL: 0x80, TEMPORARY: 0x100, SPARSE: 0x200, REPARSE: 0x400, COMPRESSED: 0x800,
  OFFLINE: 0x1000, NOT_INDEXED: 0x2000, ENCRYPTED: 0x4000,
  RECALL_ON_OPEN: 0x40000, RECALL_ON_DATA_ACCESS: 0x400000,
};

export interface RawEntry {
  name: string; attr: number; size: number; ctime: number; atime: number; mtime: number;
  /** espaço alocado em disco, quando o SO já informa na listagem (macOS: blocks * 512) */
  alloc?: number;
}

export interface DriveInfo {
  root: string; label: string; fs: string; type: string; total: number; free: number; used: number;
}

/** Primitivas de sistema de arquivos (usadas também pelos workers; sem dependência do Electron). */
export interface NativeFs {
  /** separador de caminho do SO */
  sep: string;
  /** Lista uma pasta. Retorna 0 ou um código de erro no padrão Win32 (5 acesso negado, 3 não encontrado, 32 em uso). */
  listDir(dir: string, cb: (e: RawEntry) => void): number;
  /** tamanho real em disco de um arquivo (compactado/esparso/nuvem), ou -1 */
  compressedSize(path: string): number;
  clusterSize(root: string): number;
  rootOf(p: string): string;
  drives(): DriveInfo[];
  ownerOf(path: string): string;
  isAdmin(): boolean;
}

export interface AppEntry {
  id: string;
  source: 'win32' | 'store' | 'mac';
  name: string;
  version?: string;
  publisher?: string;
  installDate?: number;
  size?: number;
  sizeSource?: 'registro' | 'calculado';
  location?: string;
  lastUsed?: number;
  lastUsedSource?: string;
  runCount?: number;
  uninstall?: string;
  quiet?: string;
  icon?: string;
  hive?: string;
  arch?: string;
  regPath?: string;
  packageFullName?: string;
  family?: string;
  msi?: boolean;
  bundleId?: string;
  /** macOS: pasta de origem (Aplicativos, Aplicativos do usuário, Sistema, App Store) */
  origin?: string;
  canUninstall: boolean;
  background?: boolean;
  /** entrada órfã: o desinstalador (ou a pasta) não existe mais no disco */
  orphan?: boolean;
  exes?: string[];
}

export interface DriveHardware {
  letter: string;            // "C" no Windows; raiz do volume no macOS
  media: 'SSD' | 'HD' | 'Desconhecido';
  bus: string;               // NVMe, SATA, USB, SAS, RAID, SD, Virtual…
  usb?: string;              // "USB 3.2 Gen 2 (10 Gbps)", "USB 2.0 (480 Mbps)"…
  usbNote?: string;          // ex.: "suporta USB 3.x, mas está numa porta 2.0"
  model: string;
  brand?: string;
  firmware?: string;
  health?: string;
  diskSize?: number;
  removable?: boolean;
}

export interface MonitorEvent {
  kind: 'disk' | 'app' | 'update' | 'repair';
  /** página do app aberta ao clicar */
  page?: string;
  title: string;
  drive: string;          // ex.: "C:" ou "/"
  driveLabel?: string;
  amount: number;         // bytes consumidos (0 se desconhecido)
  detail?: string;
}

// ---------- proteção ----------
export interface SecurityCheck {
  id: string; name: string;
  /** true = protegido, false = desprotegido, null = não foi possível verificar */
  ok: boolean | null;
  detail: string;
  /** "importante" desligado vira alerta; os demais, só recomendação */
  critical?: boolean;
  /** abre a tela do SO onde se liga a proteção */
  settingsUrl?: string;
}
export interface SignatureInfo { status: 'apple' | 'developer' | 'adhoc' | 'unsigned' | 'invalid' | 'missing' | 'unknown'; signer?: string }
export interface PersistenceExtra { id: string; name: string; path: string; kind: 'task'; detail: string }
export interface ProtectionApi {
  status(): Promise<SecurityCheck[]>;
  signature(file: string): Promise<SignatureInfo>;
  /** executável que um item de início roda */
  executableOf(item: StartupItem): string;
  /** pastas onde perfis de navegadores ficam: [navegador, pasta com perfis, tipo] */
  browserRoots(): { browser: string; root: string; type: 'chromium' | 'firefox' }[];
  /** extensões do Safari e afins, se o SO tiver um registro próprio */
  systemExtensions?(): Promise<{ id: string; name: string; browser: string; path: string }[]>;
  /** outras formas de iniciar sozinho (tarefas agendadas no Windows) */
  extraPersistence?(): Promise<PersistenceExtra[]>;
  /** verificação rápida do antivírus do SO, se houver um que dê para acionar */
  quickScan?(): Promise<{ ok: boolean; message: string }>;
  quickScanName?: string;
}

// ---------- desempenho ----------
export interface StartupItem {
  id: string;
  name: string;
  /** comando ou caminho que roda */
  detail: string;
  /** login = item de início visível; agent/daemon = launchd (macOS); run/folder = registro/pasta Inicializar (Windows) */
  kind: 'login' | 'agent' | 'daemon' | 'run' | 'folder';
  scope: 'user' | 'system';
  enabled: boolean;
  /** "toggle": liga/desliga; "remove": só remover (itens de login do macOS); "none": só leitura */
  control: 'toggle' | 'remove' | 'none';
  /** precisa de senha de administrador / UAC para mudar */
  admin?: boolean;
  location?: string;
  publisher?: string;
}
export interface MaintenanceTask { id: string; name: string; description: string; admin: boolean; duration: string; recommended?: boolean }
export interface ProcInfo { pid: number; name: string; cpu: number; mem: number; path?: string }
export interface PerfApi {
  startupItems(): Promise<StartupItem[]>;
  setStartupItem(item: StartupItem, enabled: boolean): Promise<{ ok: boolean; message: string }>;
  tasks(): MaintenanceTask[];
  runTasks(ids: string[]): Promise<{ id: string; ok: boolean; message: string }[]>;
  processes(): Promise<ProcInfo[]>;
  /** abre o painel do SO com os itens de início que o app não consegue mudar */
  openStartupSettings(): void;
}

// ---------- limpeza ----------
/** Onde procurar lixo. "children": cada item dentro da pasta vira uma linha; "self": a pasta inteira. */
export interface JunkTarget {
  path: string;
  mode: 'children' | 'self';
  /** só itens sem modificação há N dias */
  minAgeDays?: number;
  /** no modo agressivo, usa esta idade mínima (dias; 0.04 ≈ 1 hora) no lugar de minAgeDays */
  aggressiveMinAgeDays?: number;
  /** só arquivos com estas extensões (minúsculas, sem ponto) */
  exts?: string[];
  /** nomes ignorados; aceita prefixo com * no fim ("com.apple.*") */
  exclude?: string[];
  /** em vez dos filhos diretos, pega as subpastas com este nome em qualquer nível até maxDepth (caches de navegadores) */
  findDirs?: string[];
  maxDepth?: number;
}
export interface JunkCategory {
  id: string;
  name: string;
  description: string;
  group: string;
  /** marcada por padrão */
  selected: boolean;
  /** "review": pode conter coisa que o usuário quer manter */
  risk: 'safe' | 'review';
  /** "delete": sempre apaga definitivamente (ex.: esvaziar a Lixeira) */
  removal?: 'delete';
  /** categoria tratada pelo SO (ex.: Lixeira do Windows) em vez de listar arquivos */
  special?: boolean;
  targets: JunkTarget[];
}
export interface JunkApi {
  categories(): JunkCategory[];
  /** tamanho e quantidade de uma categoria especial */
  specialScan?(id: string): Promise<{ size: number; count: number } | null>;
  specialClean?(id: string): Promise<void>;
}

// ---------- métricas do painel da barra de menus / bandeja ----------
export interface MemoryInfo {
  total: number; used: number;
  /** 0–100: quanto da memória o sistema considera ocupada (macOS: 100 − "free percentage" do memory_pressure) */
  pressure: number;
  level: 'normal' | 'warn' | 'critical';
}
export interface BatteryInfo { percent: number; charging: boolean; plugged: boolean; minutesLeft?: number }
export interface Temperatures { cpu?: number; gpu?: number; battery?: number; ssd?: number }
/** contadores acumulados de bytes da interface principal */
export interface NetCounters { rx: number; tx: number; iface: string; kind: string }
export interface ConnectedDevice { name: string; kind: string; battery?: number }
export interface MemoryDetail { active: number; wired: number; compressed: number; available: number; swapUsed: number; swapTotal: number }
export interface BatteryHealth { cycles?: number; condition?: string; maxCapacity?: number }
export interface NetworkInfo { ssid?: string; security?: string; securityLevel?: 'open' | 'weak' | 'good' | 'strong'; phy?: string; channel?: string; signal?: string; ip?: string; router?: string }
export interface MetricsApi {
  machineName(): Promise<string>;
  memory(): Promise<MemoryInfo>;
  battery(): Promise<BatteryInfo | null>;
  temperatures(): Promise<Temperatures>;
  network(): Promise<NetCounters | null>;
  devices(): Promise<ConnectedDevice[]>;
  memoryDetail(): Promise<MemoryDetail | null>;
  batteryHealth(): Promise<BatteryHealth | null>;
  networkInfo(): Promise<NetworkInfo>;
  /** ejeta um volume removível */
  eject(root: string): Promise<{ ok: boolean; message: string }>;
  /** ficha técnica (lida uma vez e guardada) */
  hardware(): Promise<HardwareInfo>;
  /** leituras ao vivo de GPU, energia, frequência e ventoinhas */
  hwLive(): Promise<HwLive>;
  /** ativa/desativa o monitoramento avançado (só Windows; no Mac já é automático) */
  advancedActivate?(): Promise<{ ok: boolean; message: string }>;
  advancedDeactivate?(): Promise<{ ok: boolean; message: string }>;
  /** discos físicos com detalhes (modelo, firmware, saúde, SMART) */
  disks(): Promise<DiskDetail[]>;
}

export interface DiskDetail {
  id: string; name: string; model?: string; firmware?: string; serialHidden?: boolean; bus?: string; media?: string; size?: number;
  link?: string; trim?: boolean; health?: string; healthPct?: number; temp?: number; powerOnHours?: number; powerCycles?: number;
  written?: number; read?: number; unsafeShutdowns?: number; mediaErrors?: number; spare?: number; partitions?: { name: string; size: number; fs?: string; mount?: string }[];
  needsAdmin?: boolean;
}

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
  cpuMHz?: number;
  fans: { name: string; rpm: number }[];
  /** todos os sensores de temperatura disponíveis (um por disco, por GPU, zonas térmicas…) */
  sensors?: { kind: 'cpu' | 'gpu' | 'disk' | 'battery' | 'board' | 'ram' | 'psu'; group?: string; hw?: string; name: string; value: number; min?: number; max?: number; unit?: string }[];
  /** monitoramento avançado (Windows: LibreHardwareMonitor + driver PawnIO; Mac: IOReport) */
  advanced?: { available: boolean; active: boolean; source?: string };
  /** o que só aparece com o app aberto como administrador */
  needsAdmin?: string;
}

export type UninstallResult = { ok: boolean; code: number; message: string };
export interface Leftover { path: string; size: number; kind: string }

/** Integração com o SO usada só pelo processo principal. */
// ---------- reparos (registro do Windows / preferências do macOS) ----------
/** Item comprovadamente quebrado: aponta para um arquivo que não existe mais, ou não abre. */
export interface RepairItem {
  id: string;
  category: string;          // ex.: 'startup', 'uninstall', 'prefs'
  title: string;
  detail: string;            // o que está quebrado e para onde aponta
  target?: string;           // chave do registro, valor ou arquivo afetado
  fixable: boolean;          // false: só avisa (ex.: serviço do sistema)
  needsAdmin?: boolean;
  optional?: boolean;        // ação de manutenção, não um problema (ex.: reconstruir o "Abrir com")
  /** dados internos para corrigir (tipo da correção, caminho, nome do valor) */
  fix?: { kind: 'key' | 'value' | 'file' | 'command'; path: string; name?: string };
}
export interface AppErrorEvent { app: string; message: string; at: number }
export interface RepairsApi {
  scan(): Promise<RepairItem[]>;
  /** corrige com backup em backupDir (.reg no Windows; no macOS os arquivos vão para a Lixeira) */
  fix(items: RepairItem[], backupDir: string): Promise<{ id: string; ok: boolean; message: string }[]>;
  restore(backupDir: string): Promise<{ ok: boolean; message: string }>;
  recentErrors(): Promise<AppErrorEvent[]>;
}

// ---------- modo jogo ----------
export interface GameInfo { id: string; name: string; store: 'steam' | 'epic' | 'gog' | 'app' | 'custom'; dir?: string; size?: number; launch: string; icon?: string }
export interface GameToggle { id: string; label: string; detail: string; on: boolean; needsAdmin?: boolean; needsRestart?: boolean; recommended: boolean }
export interface GameStatus { toggles: GameToggle[]; powerPlan?: string; shaderCache: number; memory: { total: number; free: number } }
export interface GameSessionOptions { close: { pids: number[]; name: string }[]; power: boolean; freeMemory: boolean; boostDir?: string }
export interface GameApi {
  status(): Promise<GameStatus>;
  setToggle(id: string, on: boolean): Promise<{ ok: boolean; message: string }>;
  /** jogos das lojas e das pastas escolhidas pelo usuário */
  games(extraDirs?: string[]): Promise<GameInfo[]>;
  start(o: GameSessionOptions): Promise<{ steps: { label: string; ok: boolean; message: string }[] }>;
  stop(): Promise<{ steps: { label: string; ok: boolean; message: string }[] }>;
  /** prioridade alta para os processos do jogo (pasta de instalação) */
  boost(dir: string): Promise<number>;
  cleanShaders(): Promise<{ freed: number; message: string }>;
  /** libera RAM. Windows: rápido = memória dos programas do usuário, sem administrador; completo = também
   *  a memória em espera (administrador). macOS: purge (pede a senha) */
  freeMemory(deep: boolean): Promise<{ ok: boolean; freed: number; message: string }>;
}

export interface SystemApi {
  /** nome exibido do sistema ("Windows", "macOS") */
  osName: string;
  /** gerenciador de arquivos ("Explorer", "Finder") */
  fileManager: string;
  /** pode reiniciar como administrador (UAC) */
  canElevate: boolean;
  relaunchAsAdmin(args: string[]): void;
  /** opções da janela principal ligadas à barra de título do SO */
  windowChrome(c: { color: string; symbolColor: string }): Partial<Electron.BrowserWindowConstructorOptions>;
  /** atualiza as cores da barra de título (só onde há overlay) */
  setTitleBarColors(win: Electron.BrowserWindow, c: { color: string; symbolColor: string }): void;
  trayImage(baseDir: string): Electron.NativeImage;
  /** canto do popup de notificação */
  popupCorner: 'bottom-right' | 'top-right';
  /** macOS: o app tem "Acesso Total ao Disco"? null onde não se aplica */
  fullDiskAccess(): boolean | null;
  openFullDiskAccessSettings(): void;
  /** caixa de propriedades / "Obter informações" */
  showProperties(p: string): void;
  contextMenu: {
    supported: boolean;
    status(): Promise<boolean>;
    set(enable: boolean, o: { exe: string; packaged: boolean; appDir: string }): Promise<boolean>;
  };
  listApps(): Promise<AppEntry[]>;
  /** restos que o app deixa fora da pasta de instalação (macOS: ~/Library); [] onde não se aplica */
  appLeftovers(a: AppEntry): Promise<Leftover[]>;
  /** Windows: flag = modo silencioso do desinstalador; macOS: flag = levar também os restos para a Lixeira */
  uninstallApp(a: AppEntry, flag: boolean): Promise<UninstallResult>;
  removeEntry(a: AppEntry): Promise<{ ok: boolean; message: string }>;
  driveHardware(force: boolean): Promise<DriveHardware[]>;
  /** chaves que identificam os apps instalados (o monitor compara snapshots) */
  installedAppKeys(): Promise<Set<string>>;
  describeInstalledApp(key: string): Promise<MonitorEvent>;
  /** avisa quando algo muda nas pastas de apps (opcional; sem isto o monitor só confere a cada ~60 s). Retorna o cancelamento. */
  watchInstalls?(onChange: () => void): () => void;
  /** app só na barra de menus/bandeja (true) ou com janela (false): no macOS esconde/mostra o ícone do Dock */
  setBackgroundMode(background: boolean): void;
  /** abrir com o sistema (só na versão instalada) */
  loginItem: {
    set(open: boolean): void;
    get(): boolean;
    /** esta execução foi aberta pelo login (deve começar escondida na bandeja/barra de menus) */
    launchedAtLogin(): boolean;
  };
  /** Proteção: estado da segurança do SO, assinaturas e extensões */
  protection: ProtectionApi;
  /** Desempenho: itens de início, manutenção e processos */
  perf: PerfApi;
  repairs: RepairsApi;
  game: GameApi;
  /** categorias da Limpeza */
  junk: JunkApi;
  /** leituras do sistema para o painel (CPU vem de os.cpus, comum aos dois) */
  metrics: MetricsApi;
  /** instala uma atualização já baixada e verificada e encerra o app */
  installUpdate(file: string, quit: () => void, relaunch: boolean): void;
}
