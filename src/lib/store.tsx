import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cc, Progress, Settings, AppEntry, UpdateState, AppInfo, DossierTarget } from './api';
import { t as tr } from './i18n';

/** Tarefa em segundo plano que sobrevive à troca de tela. */
export interface BgTask {
  key: string; kind: 'owners' | 'duplicates' | 'uninstall'; label: string; page: Page;
  scanId?: number; nodeId?: number; status: 'running' | 'done' | 'error' | 'cancelled';
  progress?: { phase: string; done: number; total: number }; result?: any; error?: string;
  startedAt: number; finishedAt?: number;
  // desinstalação
  items?: AppEntry[]; itemStatus?: Record<string, { status: string; message?: string }>;
}

export type Page =
  | 'overview' | 'explorer' | 'visual' | 'types' | 'age' | 'owners' | 'top' | 'duplicates' | 'search' | 'history'
  | 'discover' | 'uninstall' | 'cleanup' | 'performance' | 'protection' | 'activity' | 'smartcare' | 'clutter' | 'settings' | 'repairs' | 'browsers' | 'game' | 'hardware' | 'appdata' | 'dossier';

export interface ScanState { id: number; root: string; progress: Progress | null; done: boolean; stopped?: boolean; selected: number; selectedPath: string; comparing?: string | null }
export interface Toast { id: number; kind: 'ok' | 'error' | 'info'; text: string }
export interface ConfirmOpts {
  title: string; message?: React.ReactNode; items?: { label: string; detail?: string }[]; danger?: boolean;
  confirmLabel?: string; requireCheck?: string; options?: { key: string; label: string; hint?: string }[]; defaultOption?: string;
}

interface Ctx {
  settings: Settings | null; setSettings: (p: Partial<Settings>) => void; dark: boolean;
  page: Page; go: (p: Page) => void;
  /** dossiê aberto e a tela de onde veio (para o Voltar) */
  dossier: { target: DossierTarget; from: Page } | null; openDossier: (t: DossierTarget) => void;
  /** histórico de telas: voltar/avançar (botões laterais do mouse, ⌘[ ⌘], Alt+←/→, gesto) */
  navBack: () => void; navForward: () => void; canBack: boolean; canForward: boolean;
  /** histórico interno de uma tela (Explorador: pastas): voltar/avançar usa ele primeiro, depois o de telas */
  registerNav: (page: Page, n: PageNav | null) => void;
  scans: ScanState[]; active: ScanState | null; activeId: number | null; setActive: (id: number) => void;
  startScan: (root: string) => Promise<number>; closeScan: (id: number) => void; stopScan: () => void; refreshScan: () => void;
  select: (id: number, path?: string) => void; tick: number; bump: () => void;
  toast: (text: string, kind?: Toast['kind']) => void; toasts: Toast[];
  confirm: (o: ConfirmOpts) => Promise<{ ok: boolean; option?: string }>; confirmState: (ConfirmOpts & { resolve: (r: { ok: boolean; option?: string }) => void }) | null;
  info: AppInfo | null;
  setComparing: (id: string | null) => void;
  tasks: BgTask[];
  /** execuções em andamento nas telas (Limpeza, Proteção…), por página: aparecem no menu e na central do topo */
  running: Record<string, { label: string; since: number }>;
  setRunning: (page: string, label: string | null) => void;
  findTask: (kind: BgTask['kind'], scanId?: number, nodeId?: number) => BgTask | undefined;
  startScanTask: (kind: 'owners' | 'duplicates', nodeId: number, args?: any[]) => void;
  cancelTask: (key: string) => void;
  updateTaskResult: (key: string, result: any) => void;
  clearFinishedTasks: () => void;
  startUninstall: (items: AppEntry[], silent: boolean) => Promise<string[]>;
  update: UpdateState;
  installUpdate: () => Promise<void>;
}
export interface PageNav { canBack: boolean; canForward: boolean; back: () => void; forward: () => void }
const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setS] = useState<Settings | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [dossier, setDossier] = useState<Ctx['dossier']>(null);
  const pageRef = useRef<Page>(page);
  pageRef.current = page;
  // histórico: cada troca de tela (ou de dossiê) vira uma entrada; voltar/avançar só move o ponteiro
  const hist = useRef<{ list: { page: Page; dossier: Ctx['dossier'] }[]; i: number; moving: boolean }>({ list: [], i: -1, moving: false });
  const [navTick, setNavTick] = useState(0);
  useEffect(() => {
    const h = hist.current;
    if (h.moving) { h.moving = false; return; }
    const cur = h.list[h.i];
    if (cur && cur.page === page && (page !== 'dossier' || cur.dossier?.target === dossier?.target)) return;
    h.list = [...h.list.slice(0, h.i + 1), { page, dossier }].slice(-60);
    h.i = h.list.length - 1;
    setNavTick((t) => t + 1);
  }, [page, dossier]);
  const moveNav = useCallback((d: number) => {
    const h = hist.current;
    const j = h.i + d;
    if (j < 0 || j >= h.list.length) return;
    h.i = j; h.moving = true;
    const e = h.list[j];
    if (e.page === 'dossier') setDossier(e.dossier);
    setPage(e.page);
    setNavTick((t) => t + 1);
  }, []);
  const [pageNav, setPageNav] = useState<Partial<Record<Page, PageNav>>>({});
  const pageNavRef = useRef(pageNav);
  pageNavRef.current = pageNav;
  const registerNav = useCallback((p: Page, n: PageNav | null) => setPageNav((m) => {
    const x = { ...m };
    if (n) x[p] = n; else delete x[p];
    return x;
  }), []);
  // primeiro o histórico da tela (pastas do Explorador); quando ele acaba, o de telas
  const step = useCallback((d: number) => {
    const h = pageNavRef.current[pageRef.current];
    if (h && (d < 0 ? h.canBack : h.canForward)) { if (d < 0) h.back(); else h.forward(); return; }
    moveNav(d);
  }, [moveNav]);
  const navBack = useCallback(() => step(-1), [step]);
  const navForward = useCallback(() => step(1), [step]);
  void navTick;
  const inner = pageNav[page];
  const canBack = hist.current.i > 0 || !!inner?.canBack, canForward = hist.current.i < hist.current.list.length - 1 || !!inner?.canForward;
  // botões laterais do mouse, teclado e comandos nativos (Windows: app-command; macOS: gesto de deslizar)
  useEffect(() => {
    let last = 0;
    const nav = (d: number) => { const t = Date.now(); if (t - last < 300) return; last = t; step(d); };
    const down = (e: MouseEvent) => { if (e.button === 3 || e.button === 4) e.preventDefault(); };
    const up = (e: MouseEvent) => { if (e.button === 3) { e.preventDefault(); nav(-1); } else if (e.button === 4) { e.preventDefault(); nav(1); } };
    const key = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === 'BrowserBack') { e.preventDefault(); nav(-1); return; }
      if (e.key === 'BrowserForward') { e.preventDefault(); nav(1); return; }
      const mac = navigator.platform.startsWith('Mac');
      if (mac ? e.metaKey && !e.shiftKey && !e.altKey : e.altKey && !e.ctrlKey) {
        if (mac ? e.key === '[' : e.key === 'ArrowLeft' && !typing) { e.preventDefault(); nav(-1); }
        else if (mac ? e.key === ']' : e.key === 'ArrowRight' && !typing) { e.preventDefault(); nav(1); }
      }
    };
    // trackpad: deslizar dois dedos na horizontal (onde nada rola na horizontal)
    let acc = 0, accAt = 0, fired = 0;
    const canScrollX = (el: Element | null, dx: number) => {
      for (; el && el !== document.body; el = el.parentElement) {
        const st = getComputedStyle(el);
        if (!/(auto|scroll)/.test(st.overflowX) || el.scrollWidth <= el.clientWidth + 1) continue;
        if (dx < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
      }
      return false;
    };
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 2 || e.ctrlKey) { acc = 0; return; }
      const t = Date.now();
      if (t - fired < 900) return; // um gesto por vez (o trackpad continua mandando a inércia)
      if (t - accAt > 250) acc = 0;
      accAt = t;
      if (canScrollX(e.target as Element, e.deltaX)) { acc = 0; return; }
      acc += e.deltaX;
      if (Math.abs(acc) > 160) { fired = t; const d = acc < 0 ? -1 : 1; acc = 0; nav(d); }
    };
    window.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('mousedown', down, true);
    window.addEventListener('mouseup', up, true);
    window.addEventListener('keydown', key);
    const off = cc.on.nav((d: 'back' | 'forward') => nav(d === 'back' ? -1 : 1));
    return () => { window.removeEventListener('mousedown', down, true); window.removeEventListener('mouseup', up, true); window.removeEventListener('keydown', key); window.removeEventListener('wheel', wheel); off(); };
  }, [step]);

  const openDossier = useCallback((target: DossierTarget) => {
    const from = pageRef.current;
    setDossier((d) => ({ target, from: from === 'dossier' ? d?.from || 'uninstall' : from }));
    setPage('dossier');
  }, []);
  const [scans, setScans] = useState<ScanState[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirm] = useState<Ctx['confirmState']>(null);
  const [info, setInfo] = useState<Ctx['info']>(null);
  const [sysDark, setSysDark] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches);
  const progressBuf = useRef(new Map<number, Progress>());
  const scanningRef = useRef(false);
  const [tasks, setTasks] = useState<BgTask[]>([]);
  const [running, setRunningState] = useState<Record<string, { label: string; since: number }>>({});
  const setRunning = useCallback((page: string, label: string | null) => setRunningState((r) => {
    if (!label) { if (!(page in r)) return r; const n = { ...r }; delete n[page]; return n; }
    if (r[page]?.label === label) return r;
    return { ...r, [page]: { label, since: r[page]?.since || Date.now() } };
  }), []);
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' });
  const patchTask = useCallback((key: string, p: Partial<BgTask> | ((t: BgTask) => Partial<BgTask>)) =>
    setTasks((ts) => ts.map((t) => (t.key === key ? { ...t, ...(typeof p === 'function' ? p(t) : p) } : t))), []);

  // progresso das tarefas do worker (identificadas por varredura + método)
  useEffect(() => cc.on.task((d) => {
    setTasks((ts) => ts.map((t) => (t.status === 'running' && t.scanId === d.scanId && t.kind === d.method ? { ...t, progress: d.progress } : t)));
  }), []);
  // progresso da desinstalação em lote
  useEffect(() => cc.on.uninstallProgress((d) => {
    setTasks((ts) => ts.map((t) => (t.kind === 'uninstall' && t.status === 'running' && t.itemStatus && d.id in t.itemStatus
      ? { ...t, itemStatus: { ...t.itemStatus, [d.id]: { status: d.status, message: d.message } }, progress: { phase: tr("Desinstalando"), done: Object.values({ ...t.itemStatus, [d.id]: { status: d.status } }).filter((s: any) => s.status === 'ok' || s.status === 'fail').length, total: t.items!.length } }
      : t)));
  }), []);

  useEffect(() => {
    cc.settingsGet().then(setS);
    cc.info().then(setInfo);
    // após recarregar a janela, recupera as varreduras que continuam no processo principal
    cc.scanList().then((list) => {
      if (!list.length) return;
      setScans((ss) => (ss.length ? ss : list.map((s) => ({ id: s.id, root: s.root, progress: s.last, done: s.done, selected: 0, selectedPath: s.root }))));
      setActiveId((a) => a ?? list[list.length - 1].id);
    });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => setSysDark(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const dark = settings ? settings.theme === 'dark' || (settings.theme === 'system' && sysDark) : sysDark;
  const accent = settings?.accent || 'green';
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.dataset.accent = accent;
    cc.titlebar(dark);
  }, [dark, accent]);

  const setSettings = useCallback((p: Partial<Settings>) => {
    setS((s) => (s ? { ...s, ...p } : s));
    cc.settingsSet(p);
  }, []);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const confirm = useCallback((o: ConfirmOpts) => new Promise<{ ok: boolean; option?: string }>((resolve) => {
    setConfirm({ ...o, resolve: (r) => { setConfirm(null); resolve(r); } });
  }), []);

  // progresso: buffer + flush 4x/s para não sobrecarregar a renderização
  useEffect(() => {
    const off1 = cc.on.progress((p) => progressBuf.current.set(p.scanId, p));
    const off2 = cc.on.done(({ scanId, stopped }) => {
      setScans((ss) => ss.map((s) => (s.id === scanId ? { ...s, done: true, stopped } : s)));
      setTick((t) => t + 1);
    });
    const iv = setInterval(() => {
      if (!progressBuf.current.size) return;
      const buf = new Map(progressBuf.current);
      progressBuf.current.clear();
      setScans((ss) => ss.map((s) => (buf.has(s.id) ? { ...s, progress: buf.get(s.id)! } : s)));
    }, 250);
    // durante a varredura, pede para as telas recarregarem a cada ~1,2 s
    const iv2 = setInterval(() => { if (scanningRef.current) setTick((t) => t + 1); }, 1200);
    return () => { off1(); off2(); clearInterval(iv); clearInterval(iv2); };
  }, []);

  scanningRef.current = scans.some((s) => !s.done);
  const tickEff = tick;

  const startScan = useCallback(async (root: string) => {
    const id = await cc.scanStart(root);
    setScans((ss) => [...ss, { id, root, progress: null, done: false, selected: 0, selectedPath: root }]);
    setActiveId(id);
    setPage((p) => (p === 'overview' || p === 'discover' || p === 'uninstall' || p === 'settings' ? 'explorer' : p));
    setS((s) => (s ? { ...s, recent: [root, ...s.recent.filter((r) => r.toLowerCase() !== root.toLowerCase())].slice(0, 12) } : s));
    return id;
  }, []);

  useEffect(() => cc.on.openPath((p) => { startScan(p); }), [startScan]);
  // painel da barra de menus pede para abrir uma tela específica
  useEffect(() => cc.on.navigate((p) => setPage(p as Page)), []);
  // clique na notificação de app instalado: abre o dossiê dele
  useEffect(() => cc.on.openDossier((app: AppEntry) => openDossier({ kind: 'app', app })), [openDossier]);
  // mudanças feitas pelo menu da bandeja
  useEffect(() => cc.on.settingsChanged((s) => setS(s)), []);
  // estado do atualizador
  useEffect(() => {
    cc.updateState().then(setUpdate);
    return cc.on.updateState((s) => setUpdate((old) => ({ ...s, defaultSource: s.defaultSource ?? old.defaultSource })));
  }, []);

  const closeScan = useCallback((id: number) => {
    cc.scanClose(id);
    setScans((ss) => {
      const rest = ss.filter((s) => s.id !== id);
      setActiveId((a) => (a === id ? (rest.length ? rest[rest.length - 1].id : null) : a));
      return rest;
    });
  }, []);

  const active = scans.find((s) => s.id === activeId) || null;
  const stopScan = useCallback(() => { if (active) cc.scanQuery(active.id, 'stop'); }, [active]);
  const refreshScan = useCallback(async () => {
    if (!active) return;
    const root = active.root;
    closeScan(active.id);
    await startScan(root);
  }, [active, closeScan, startScan]);
  const select = useCallback((id: number, path?: string) => {
    setScans((ss) => ss.map((s) => (s.id === activeId ? { ...s, selected: id, selectedPath: path ?? s.selectedPath } : s)));
  }, [activeId]);
  const setComparing = useCallback((cid: string | null) => {
    setScans((ss) => ss.map((s) => (s.id === activeId ? { ...s, comparing: cid } : s)));
  }, [activeId]);

  const findTask = useCallback((kind: BgTask['kind'], scanId?: number, nodeId?: number) =>
    [...tasks].reverse().find((t) => t.kind === kind && (scanId === undefined || t.scanId === scanId) && (nodeId === undefined || t.nodeId === nodeId)), [tasks]);

  const startScanTask = useCallback((kind: 'owners' | 'duplicates', nodeId: number, args: any[] = []) => {
    if (!active) return;
    const scanId = active.id;
    const key = `${kind}:${scanId}:${nodeId}:${Date.now()}`;
    const label = `${kind === 'owners' ? tr("Proprietários") : tr("Duplicados")} · ${active.selected === nodeId ? active.selectedPath : active.root}`;
    setTasks((ts) => [...ts.filter((t) => !(t.kind === kind && t.scanId === scanId)), { key, kind, label, page: kind, scanId, nodeId, status: 'running', startedAt: Date.now() }]);
    cc.scanQuery(scanId, kind, nodeId, ...args)
      .then((result) => { patchTask(key, { status: 'done', result, finishedAt: Date.now() }); toast(tr("{0} concluída", kind === 'owners' ? tr("Análise de proprietários") : tr("Busca de duplicados"))); })
      .catch((e) => {
        const cancelled = String(e?.message || e).includes('Cancelado');
        patchTask(key, { status: cancelled ? 'cancelled' : 'error', error: String(e?.message || e), finishedAt: Date.now() });
        if (!cancelled) toast(tr("Falha: ") + (e?.message || e), 'error');
      });
  }, [active, patchTask, toast]);

  const cancelTask = useCallback((key: string) => {
    const t = tasks.find((x) => x.key === key);
    if (t?.scanId && t.status === 'running' && t.kind !== 'uninstall') cc.scanQuery(t.scanId, 'cancelTask', t.kind);
  }, [tasks]);
  const updateTaskResult = useCallback((key: string, result: any) => patchTask(key, { result }), [patchTask]);
  const clearFinishedTasks = useCallback(() => setTasks((ts) => ts.filter((t) => t.status === 'running')), []);

  const startUninstall = useCallback(async (items: AppEntry[], silent: boolean) => {
    const key = `uninstall:${Date.now()}`;
    setTasks((ts) => [...ts, {
      key, kind: 'uninstall', page: 'uninstall', label: items.length === 1 ? tr("Desinstalando {0}", items[0].name) : tr("Desinstalando {0} programas", items.length),
      status: 'running', startedAt: Date.now(), items, itemStatus: Object.fromEntries(items.map((a) => [a.id, { status: 'pending' }])),
      progress: { phase: tr("Desinstalando"), done: 0, total: items.length },
    }]);
    const res = await cc.appsUninstall(items.map((a) => a.id), silent).catch(() => [] as { id: string; ok: boolean }[]);
    const ok = res.filter((x) => x.ok).map((x) => x.id);
    patchTask(key, { status: 'done', finishedAt: Date.now(), result: ok, label: tr("{0} de {1} programa(s) removido(s)", ok.length, items.length) });
    toast(tr("{0} de {1} programa(s) removido(s)", ok.length, items.length), ok.length === items.length ? 'ok' : 'info');
    return ok;
  }, [patchTask, toast]);

  // o botão de atualizar do topo abre o popup central (novidades, download e instalação acompanhados)
  const installUpdate = useCallback(async () => { window.dispatchEvent(new Event('cc:update-modal')); }, []);

  const value: Ctx = {
    update, installUpdate,
    tasks, findTask, startScanTask, cancelTask, updateTaskResult, clearFinishedTasks, startUninstall,
    settings, setSettings, dark, page, go: setPage, dossier, openDossier, navBack, navForward, canBack, canForward, registerNav, scans, active, activeId, setActive: setActiveId,
    startScan, closeScan, stopScan, refreshScan, select, tick: tickEff, bump: () => setTick((t) => t + 1),
    toast, toasts, confirm, confirmState, info, setComparing, running, setRunning,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

/** Hook utilitário: consulta o worker e recarrega quando a varredura avança. */
export function useScanQuery<T>(method: string | null, args: any[], deps: any[] = []): { data: T | null; loading: boolean; reload: () => void } {
  const { active, tick } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [n, setN] = useState(0);
  const key = JSON.stringify(args);
  useEffect(() => {
    if (!active || !method) { setData(null); return; }
    let alive = true;
    setLoading(true);
    cc.scanQuery<T>(active.id, method, ...args).then((d) => { if (alive) { setData(d); setLoading(false); } }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [active?.id, method, key, tick, n, ...deps]); // eslint-disable-line
  return { data, loading, reload: () => setN((x) => x + 1) };
}

/** A tela informa que está executando algo (label) ou que terminou (null). */
export function useRunning(page: Page, label: string | null | false) {
  const { setRunning } = useApp();
  useEffect(() => { setRunning(page, label || null); }, [page, label, setRunning]);
}
