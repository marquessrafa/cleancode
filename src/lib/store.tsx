import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cc, Progress, Settings, AppEntry, UpdateState, AppInfo } from './api';

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
  | 'discover' | 'uninstall' | 'cleanup' | 'performance' | 'protection' | 'activity' | 'smartcare' | 'clutter' | 'settings' | 'repairs' | 'browsers' | 'game' | 'hardware';

export interface ScanState { id: number; root: string; progress: Progress | null; done: boolean; stopped?: boolean; selected: number; selectedPath: string; comparing?: string | null }
export interface Toast { id: number; kind: 'ok' | 'error' | 'info'; text: string }
export interface ConfirmOpts {
  title: string; message?: React.ReactNode; items?: { label: string; detail?: string }[]; danger?: boolean;
  confirmLabel?: string; requireCheck?: string; options?: { key: string; label: string; hint?: string }[]; defaultOption?: string;
}

interface Ctx {
  settings: Settings | null; setSettings: (p: Partial<Settings>) => void; dark: boolean;
  page: Page; go: (p: Page) => void;
  scans: ScanState[]; active: ScanState | null; activeId: number | null; setActive: (id: number) => void;
  startScan: (root: string) => Promise<number>; closeScan: (id: number) => void; stopScan: () => void; refreshScan: () => void;
  select: (id: number, path?: string) => void; tick: number; bump: () => void;
  toast: (text: string, kind?: Toast['kind']) => void; toasts: Toast[];
  confirm: (o: ConfirmOpts) => Promise<{ ok: boolean; option?: string }>; confirmState: (ConfirmOpts & { resolve: (r: { ok: boolean; option?: string }) => void }) | null;
  info: AppInfo | null;
  setComparing: (id: string | null) => void;
  tasks: BgTask[];
  findTask: (kind: BgTask['kind'], scanId?: number, nodeId?: number) => BgTask | undefined;
  startScanTask: (kind: 'owners' | 'duplicates', nodeId: number, args?: any[]) => void;
  cancelTask: (key: string) => void;
  updateTaskResult: (key: string, result: any) => void;
  clearFinishedTasks: () => void;
  startUninstall: (items: AppEntry[], silent: boolean) => Promise<string[]>;
  update: UpdateState;
  installUpdate: () => Promise<void>;
}
const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setS] = useState<Settings | null>(null);
  const [page, setPage] = useState<Page>('overview');
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
      ? { ...t, itemStatus: { ...t.itemStatus, [d.id]: { status: d.status, message: d.message } }, progress: { phase: 'Desinstalando', done: Object.values({ ...t.itemStatus, [d.id]: { status: d.status } }).filter((s: any) => s.status === 'ok' || s.status === 'fail').length, total: t.items!.length } }
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
    const label = `${kind === 'owners' ? 'Proprietários' : 'Duplicados'} · ${active.selected === nodeId ? active.selectedPath : active.root}`;
    setTasks((ts) => [...ts.filter((t) => !(t.kind === kind && t.scanId === scanId)), { key, kind, label, page: kind, scanId, nodeId, status: 'running', startedAt: Date.now() }]);
    cc.scanQuery(scanId, kind, nodeId, ...args)
      .then((result) => { patchTask(key, { status: 'done', result, finishedAt: Date.now() }); toast(`${kind === 'owners' ? 'Análise de proprietários' : 'Busca de duplicados'} concluída`); })
      .catch((e) => {
        const cancelled = String(e?.message || e).includes('Cancelado');
        patchTask(key, { status: cancelled ? 'cancelled' : 'error', error: String(e?.message || e), finishedAt: Date.now() });
        if (!cancelled) toast('Falha: ' + (e?.message || e), 'error');
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
      key, kind: 'uninstall', page: 'uninstall', label: items.length === 1 ? `Desinstalando ${items[0].name}` : `Desinstalando ${items.length} programas`,
      status: 'running', startedAt: Date.now(), items, itemStatus: Object.fromEntries(items.map((a) => [a.id, { status: 'pending' }])),
      progress: { phase: 'Desinstalando', done: 0, total: items.length },
    }]);
    const res = await cc.appsUninstall(items.map((a) => a.id), silent).catch(() => [] as { id: string; ok: boolean }[]);
    const ok = res.filter((x) => x.ok).map((x) => x.id);
    patchTask(key, { status: 'done', finishedAt: Date.now(), result: ok, label: `${ok.length} de ${items.length} programa(s) removido(s)` });
    toast(`${ok.length} de ${items.length} programa(s) removido(s)`, ok.length === items.length ? 'ok' : 'info');
    return ok;
  }, [patchTask, toast]);

  const installUpdate = useCallback(async () => {
    if (!update.info) return;
    const r = await confirm({
      title: `Atualizar para a versão ${update.info.version}?`,
      message: <>O CleanCode baixa a nova versão, confere a integridade e instala em segundo plano, sem abrir o instalador. O app fecha por alguns segundos e reabre sozinho já atualizado. Varreduras abertas serão perdidas.</>,
      confirmLabel: 'Atualizar agora',
    });
    if (!r.ok) return;
    try { await cc.updateInstall(); } catch (e: any) { toast('Falha ao atualizar: ' + (e?.message || e), 'error'); }
  }, [update, confirm, toast]);

  const value: Ctx = {
    update, installUpdate,
    tasks, findTask, startScanTask, cancelTask, updateTaskResult, clearFinishedTasks, startUninstall,
    settings, setSettings, dark, page, go: setPage, scans, active, activeId, setActive: setActiveId,
    startScan, closeScan, stopScan, refreshScan, select, tick: tickEff, bump: () => setTick((t) => t + 1),
    toast, toasts, confirm, confirmState, info, setComparing,
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
