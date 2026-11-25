import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, FolderTree, LayoutGrid, FileType2, CalendarClock, Users, ArrowDownWideNarrow, Copy, Search, History,
  Radar, PackageX, Settings as Cog, PanelLeftClose, PanelLeftOpen, Sun, Moon, Monitor, X, HardDrive, ShieldCheck, ShieldAlert,
  CheckCircle2, AlertCircle, Info, Plus, Loader2, ArrowUpCircle, Sparkles, Gauge, Activity, Shield, HeartPulse, Layers, Wrench, Globe, Gamepad2, CircuitBoard, FolderOpen, RefreshCw,
  FolderCog, ChevronLeft, ChevronRight, Fan,
} from 'lucide-react';
import { Page, useApp } from '../lib/store';
import { cc, isMac } from '../lib/api';
import { fmtSize, baseName } from '../lib/format';
import { Button, Checkbox, cx, Dropdown, Modal, ProgressBar } from './ui';
import { t as tr, LOCALE } from '../lib/i18n';

const NAV: { group: string; items: { page: Page; label: string; icon: React.ReactNode; needsScan?: boolean }[] }[] = [
  { group: '', items: [
    { page: 'overview', label: tr("Visão geral"), icon: <LayoutDashboard size={17} /> },
  ] },
  {
    group: 'Análise de disco', items: [
      { page: 'disks', label: tr("Discos"), icon: <HardDrive size={17} /> },
      { page: 'explorer', label: tr("Explorador"), icon: <FolderTree size={17} />, needsScan: true },
      { page: 'visual', label: tr("Visualizações"), icon: <LayoutGrid size={17} />, needsScan: true },
      { page: 'types', label: tr("Tipos de arquivo"), icon: <FileType2 size={17} />, needsScan: true },
      { page: 'age', label: tr("Idade dos arquivos"), icon: <CalendarClock size={17} />, needsScan: true },
      { page: 'owners', label: tr("Proprietários"), icon: <Users size={17} />, needsScan: true },
      { page: 'top', label: tr("Maiores arquivos"), icon: <ArrowDownWideNarrow size={17} />, needsScan: true },
      { page: 'duplicates', label: tr("Duplicados"), icon: <Copy size={17} />, needsScan: true },
      { page: 'search', label: tr("Pesquisa avançada"), icon: <Search size={17} />, needsScan: true },
      { page: 'history', label: tr("Histórico e comparação"), icon: <History size={17} /> },
    ],
  },
  {
    group: 'Manutenção', items: [
      { page: 'smartcare', label: tr("Cuidados Inteligentes"), icon: <HeartPulse size={17} /> },
      { page: 'cleanup', label: tr("Limpeza"), icon: <Sparkles size={17} /> },
      { page: 'clutter', label: tr("Acúmulos"), icon: <Layers size={17} /> },
      { page: 'performance', label: tr("Desempenho"), icon: <Gauge size={17} /> },
      { page: 'protection', label: tr("Proteção"), icon: <Shield size={17} /> },
      { page: 'repairs', label: isMac ? tr("Reparos") : tr("Registro"), icon: <Wrench size={17} /> },
      { page: 'browsers', label: tr("Navegadores"), icon: <Globe size={17} /> },
      { page: 'appdata', label: isMac ? tr("Dados de apps") : tr("AppData"), icon: <FolderCog size={17} /> },
      { page: 'game', label: tr("Modo Jogo"), icon: <Gamepad2 size={17} /> },
      { page: 'activity', label: tr("Atividades"), icon: <Activity size={17} /> },
    ],
  },
  {
    group: 'Hardware', items: [
      { page: 'hardware', label: tr("Monitor de hardware"), icon: <CircuitBoard size={17} /> },
      // o controle das ventoinhas usa o LibreHardwareMonitor, que só existe no Windows
      ...(isMac ? [] : [{ page: 'fans' as Page, label: tr("Ventoinhas"), icon: <Fan size={17} /> }]),
    ],
  },
  {
    group: 'Aplicativos', items: [
      { page: 'discover', label: tr("Descoberta"), icon: <Radar size={17} /> },
      { page: 'uninstall', label: tr("Desinstalador"), icon: <PackageX size={17} /> },
    ],
  },
];

export function Sidebar() {
  const { page, go, settings, setSettings, active, tasks, scans, running } = useApp();
  const collapsed = !!settings?.sidebarCollapsed;
  // Menu recolhido: enquanto o mouse estiver sobre ele, o menu abre por cima do conteúdo, sem empurrar a tela.
  // Quando o mouse sai, ele fecha. O botão "Expandir menu" deixa o menu aberto de vez.
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number | undefined>(undefined);
  const open = !collapsed || peek;
  const enter = () => { window.clearTimeout(peekTimer.current); if (collapsed) peekTimer.current = window.setTimeout(() => setPeek(true), 60); };
  const leave = () => { window.clearTimeout(peekTimer.current); peekTimer.current = window.setTimeout(() => setPeek(false), 180); };
  useEffect(() => { if (!collapsed) setPeek(false); }, [collapsed]);
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);

  // Barra de rolagem fora do painel: a do sistema fica escondida dentro do menu, e esta, fina, acompanha o lado direito.
  const asideRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [bar, setBar] = useState({ can: false, top: 0, size: 0, trackTop: 0, trackH: 0 });
  const [barOn, setBarOn] = useState(false);
  // o painel terminou de deslizar? A barra só aparece depois disso, para não surgir no lugar antigo e pular
  const [settled, setSettled] = useState(true);
  const settleTimer = useRef<number | undefined>(undefined);
  const firstOpen = useRef(true);
  useEffect(() => {
    if (firstOpen.current) { firstOpen.current = false; return; }
    setSettled(false);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => { setSettled(true); measure(); }, 340); // reserva, se o transitionend não chegar
    return () => window.clearTimeout(settleTimer.current);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const measure = useCallback(() => {
    const a = asideRef.current, n = navRef.current; if (!a || !n) return;
    const { scrollTop, scrollHeight, clientHeight } = n;
    const trackTop = a.offsetTop + n.offsetTop + 10, trackH = Math.max(0, clientHeight - 20);
    const can = scrollHeight > clientHeight + 1;
    const size = can ? Math.max(28, (trackH * clientHeight) / scrollHeight) : 0;
    const top = can ? (scrollTop / (scrollHeight - clientHeight)) * (trackH - size) : 0;
    setBar({ can, top, size, trackTop, trackH });
  }, []);
  useEffect(() => {
    measure();
    const n = navRef.current; if (!n) return;
    const ro = new ResizeObserver(measure); ro.observe(n); if (n.firstElementChild) ro.observe(n.firstElementChild);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure]);
  const onScroll = () => measure();
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const n = navRef.current; if (!n || !bar.can) return;
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const y0 = e.clientY, s0 = n.scrollTop, ratio = (n.scrollHeight - n.clientHeight) / Math.max(1, bar.trackH - bar.size);
    const move = (ev: PointerEvent) => { n.scrollTop = s0 + (ev.clientY - y0) * ratio; };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const jump = (e: React.MouseEvent<HTMLDivElement>) => {
    const n = navRef.current; if (!n) return;
    const y = e.clientY - (e.currentTarget.getBoundingClientRect().top);
    n.scrollBy({ top: y < bar.top ? -n.clientHeight * 0.85 : n.clientHeight * 0.85, behavior: 'smooth' });
  };

  // páginas com trabalho em andamento ganham um indicador no menu
  const busyPages = new Set<string>(tasks.filter((t) => t.status === 'running').map((t) => t.page));
  Object.keys(running).forEach((p) => busyPages.add(p));
  if (scans.some((s) => !s.done)) busyPages.add('explorer');
  const width = open ? 232 : 60;
  return (
    <>
      <aside
        ref={asideRef}
        onMouseEnter={() => { enter(); setBarOn(true); }}
        onMouseLeave={() => { leave(); setBarOn(false); }}
        className={cx('side-panel absolute bottom-2.5 left-2.5 top-1.5 flex flex-col overflow-hidden', peek && collapsed ? 'side-peek z-40' : 'z-20', !open && 'side-collapsed')}
        style={{ width }}
        onTransitionEnd={(e) => { if (e.target === e.currentTarget && e.propertyName === 'width') { window.clearTimeout(settleTimer.current); setSettled(true); measure(); } }}
      >
        <nav ref={navRef} onScroll={onScroll} className="side-nav relative flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
          <div>
        {NAV.map((g, gi) => (
          <div key={gi} className={gi ? 'mt-4' : ''}>
            {g.group && (
              <div className="relative mb-1 h-5" aria-label={tr(g.group)}>
                <span className={cx('side-label absolute inset-y-0 left-0 flex items-center px-2.5 text-[11px] font-medium uppercase tracking-wide text-faint whitespace-nowrap', !open && 'opacity-0')}>{tr(g.group)}</span>
                <span className={cx('absolute left-1/2 top-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--line-strong)] transition-opacity duration-200', open && 'opacity-0')} />
              </div>
            )}
            {g.items.map((it) => {
              const on = page === it.page;
              return (
                <button
                  key={it.page}
                  title={!open ? it.label : undefined}
                  onClick={() => go(it.page)}
                  className={cx(
                    'side-item group mb-0.5 flex h-9 items-center overflow-hidden rounded-[10px] text-[13px]',
                    'side-row w-full gap-2.5',
                    on ? 'on text-fg font-medium' : 'text-muted hover:bg-[var(--hover)] hover:text-fg',
                  )}
                >
                  <span className="side-icon relative shrink-0 transition-[color,filter] duration-200">
                    {it.icon}
                    {busyPages.has(it.page) && !open && <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-accent ring-2 ring-surface" />}
                  </span>
                  <span className={cx('side-label truncate whitespace-nowrap', !open && 'opacity-0')}>{it.label}</span>
                  {busyPages.has(it.page) && open
                    ? <span className="ml-auto flex shrink-0 items-center" title={running[it.page]?.label || tr("Em andamento")}><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" /></span></span>
                    : it.needsScan && !active && open && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-line-strong" title={tr("Requer uma varredura")} />}
                </button>
              );
            })}
          </div>
        ))}
          </div>
        </nav>
        <div className="relative overflow-hidden border-t border-[color-mix(in_srgb,var(--line)_80%,transparent)] px-2 py-2">
          <button
            onClick={() => go('settings')}
            title={!open ? tr("Configurações") : undefined}
            className={cx('side-item mb-0.5 flex h-9 items-center overflow-hidden rounded-[10px] text-[13px]', 'side-row w-full gap-2.5', page === 'settings' ? 'on text-fg font-medium' : 'text-muted hover:bg-[var(--hover)] hover:text-fg')}
          >
            <Cog size={17} className="side-icon shrink-0" />
            <span className={cx('side-label truncate whitespace-nowrap', !open && 'opacity-0')}>{tr("Configurações")}</span>
          </button>
          <button
            onClick={() => { setPeek(false); setSettings({ sidebarCollapsed: !collapsed }); }}
            title={collapsed ? tr("Expandir menu") : tr("Recolher menu")}
            className={cx('side-item flex h-9 items-center overflow-hidden rounded-[10px] text-[13px] text-muted hover:bg-[var(--hover)] hover:text-fg', 'side-row w-full gap-2.5')}
          >
            {collapsed ? <PanelLeftOpen size={17} className="shrink-0" /> : <PanelLeftClose size={17} className="shrink-0" />}
            <span className={cx('side-label truncate whitespace-nowrap', !open && 'opacity-0')}>{collapsed ? tr("Expandir menu") : tr("Recolher menu")}</span>
          </button>
        </div>
      </aside>
      {bar.can && (
        <div
          className={cx('side-scrollbar absolute transition-opacity duration-150 ease-out', peek && collapsed ? 'z-40' : 'z-20', barOn && settled && open ? 'opacity-100' : 'pointer-events-none opacity-0')}
          style={{ left: 10 + width + 4, top: bar.trackTop, height: bar.trackH }}
          onMouseEnter={() => { enter(); setBarOn(true); }}
          onMouseLeave={() => { leave(); setBarOn(false); }}
          onMouseDown={jump}
        >
          <div className="side-thumb" style={{ top: bar.top, height: bar.size }} onPointerDown={drag} onMouseDown={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

export function TopBar() {
  const { scans, tabs, activeTab, activateTab, newTab, closeTab, settings, setSettings, info, toast, navBack, navForward, canBack, canForward } = useApp();
  const theme = settings?.theme || 'system';
  const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  return (
    // Windows: espaço à direita para os botões do overlay; macOS: à esquerda para os botões de semáforo
    <header className="drag relative z-10 flex h-10 shrink-0 items-center" style={isMac ? { paddingLeft: 84, paddingRight: 12 } : { paddingLeft: 12, paddingRight: 150 }}>
      <div className="flex items-center gap-2 pr-3">
        <img src="./icon.png" className="h-5 w-5" alt="" />
        <span className="text-[13px] font-semibold tracking-tight text-fg">{tr("CleanCode")}</span>
        <div className="no-drag ml-1 flex items-center">
          <button className="rounded p-1 text-muted hover:bg-[var(--hover)] hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent" disabled={!canBack} onClick={navBack} title={isMac ? tr("Voltar (⌘[)") : tr("Voltar (Alt+←)")}><ChevronLeft size={16} /></button>
          <button className="rounded p-1 text-muted hover:bg-[var(--hover)] hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent" disabled={!canForward} onClick={navForward} title={isMac ? tr("Avançar (⌘])") : tr("Avançar (Alt+→)")}><ChevronRight size={16} /></button>
        </div>
      </div>
      {/* o contêiner continua arrastável; só as abas e botões são "no-drag" */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <div className="no-drag flex min-w-0 shrink items-center gap-1 overflow-x-auto">
        {tabs.map((tb) => {
          const s = scans.find((x) => x.id === tb.scanId);
          const on = tb.key === activeTab;
          const scanning = !!s && !s.done;
          return (
            <div
              key={tb.key}
              onClick={() => activateTab(tb.key)}
              className={cx('group flex h-7 max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs transition-all duration-150', on ? 'border-line bg-surface text-fg shadow-sm' : 'border-transparent text-muted hover:bg-hover hover:text-fg')}
              title={s ? s.root : tr("Aba sem análise. Escolha um disco na tela Discos.")}
            >
              {scanning ? <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" /> : <HardDrive size={13} className="shrink-0" />}
              <span className="truncate">{s ? baseName(s.root) || s.root : tr("Nova aba")}</span>
              {s?.progress && <span className="text-faint tnum">{fmtSize(s.progress.size, 'auto', 0)}</span>}
              <button className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity hover:bg-line group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); closeTab(tb.key); }} title={tr("Fechar aba")}><X size={12} /></button>
            </div>
          );
        })}
        <button onClick={newTab} title={tr("Abrir uma aba nova e escolher um disco")} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg"><Plus size={15} /></button>
        </div>
        <div className="h-full min-w-[40px] flex-1" />
      </div>
      <div className="no-drag flex items-center gap-1 pl-2">
        <UpdatePill />
        <UpdateCheckButton />
        <ActivityCenter />
        {info?.canElevate && (info.isAdmin ? (
          <span title={tr("Executando como administrador")} className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-accent"><ShieldCheck size={14} /> {tr("Admin")}</span>
        ) : (
          <button title={tr("Abre o CleanCode de novo como administrador, para que ele consiga ler todas as pastas")} onClick={async () => { toast(tr("Pedindo permissão de administrador…"), 'info'); await cc.restartAdmin(); }} className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted transition-colors hover:bg-hover hover:text-fg"><ShieldAlert size={14} /> {tr("Usuário")}</button>
        ))}
        <button
          title={tr("Tema: {0}", theme === 'system' ? 'sistema' : theme === 'light' ? 'claro' : 'escuro')}
          onClick={() => setSettings({ theme: nextTheme as any })}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg"
        >
          {theme === 'system' ? <Monitor size={15} /> : theme === 'light' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}

/** Aviso de atualização no topo: um clique baixa e instala em segundo plano. */
/** Versão atual e botão de buscar atualização (canto superior direito). */
function UpdateCheckButton() {
  const { update, info, toast } = useApp();
  const [checking, setChecking] = useState(false);
  if (update.status === 'downloading' || update.status === 'installing') return null;
  const check = async () => {
    setChecking(true);
    try {
      const r = await cc.updateCheck();
      if ((r.status === 'available' || r.status === 'ready') && r.info) toast(tr("O CleanCode {0} está disponível", r.info.version), 'ok');
      else if (r.status === 'error') toast(tr("Não foi possível verificar: {0}", r.error || 'sem conexão'), 'error');
      else toast(tr("Você já está na versão mais recente ({0})", info?.version || ''), 'ok');
    } catch (e: any) { toast(tr("Não foi possível verificar: {0}", e?.message || e), 'error'); }
    finally { setChecking(false); }
  };
  const busy = checking || update.status === 'checking';
  return (
    <button onClick={check} disabled={busy} title={tr("Buscar atualização")}
      className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-xs text-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-80">
      <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
      <span className="tnum">v{info?.version || '…'}</span>
    </button>
  );
}

function UpdatePill() {
  const { update, installUpdate } = useApp();
  if (update.status === 'downloading') {
    const p = update.total ? (update.done || 0) / update.total : undefined;
    return <span className="flex h-7 items-center gap-1.5 rounded-md bg-accent-soft px-2 text-xs text-accent"><Loader2 size={14} className="animate-spin" /> {tr("Baixando atualização")}{p !== undefined ? ` ${Math.round(p * 100)}%` : '…'}</span>;
  }
  if (update.status === 'installing') return <span className="flex h-7 items-center gap-1.5 rounded-md bg-accent-soft px-2 text-xs text-accent"><Loader2 size={14} className="animate-spin" /> {tr("Instalando. O app vai abrir de novo sozinho.")}</span>;
  if ((update.status !== 'available' && update.status !== 'ready') || !update.info) return null;
  const ready = update.status === 'ready';
  return (
    <button onClick={installUpdate} title={ready ? tr("A versão nova já foi baixada. Clique para instalar agora. Se preferir, ela será instalada sozinha quando você fechar a janela.") : tr("Clique para ver as novidades e atualizar o app.")}
      className="flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-fg transition-all hover:brightness-110 anim-fade">
      <ArrowUpCircle size={14} /> {ready ? tr("Reiniciar para atualizar ({0})", update.info.version) : tr("Atualizar para {0}", update.info.version)}
    </button>
  );
}

/** Centro de atividades: mostra tarefas em segundo plano em qualquer tela. */
export function ActivityCenter() {
  const { tasks, scans, go, setActive, select, cancelTask, clearFinishedTasks, running: pageRuns } = useApp();
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const scanning = scans.filter((s) => !s.done);
  const running = tasks.filter((t) => t.status === 'running');
  const runs = Object.entries(pageRuns);
  const nRunning = running.length + scanning.length + runs.length;
  const finished = tasks.filter((t) => t.status !== 'running').slice(-6).reverse();
  if (!nRunning && !finished.length) return null;
  const pct = (p?: { done: number; total: number }) => (p && p.total ? p.done / p.total : undefined);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={tr("Atividades em segundo plano")}
        className={cx('flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors', nRunning ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg')}
      >
        {nRunning ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
        {nRunning ? tr("{0} em andamento", nRunning) : tr("Atividades")}
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-[380px] rounded-lg border border-line bg-surface p-2 shadow-2xl anim-pop">
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
            <span className="text-xs font-medium text-muted">{tr("Atividades")}</span>
            {finished.length > 0 && <button onClick={clearFinishedTasks} className="text-[11px] text-muted hover:text-fg">{tr("Limpar concluídas")}</button>}
          </div>
          {runs.map(([p, r]) => (
            <div key={'p' + p} className="rounded-md px-2 py-2 hover:bg-hover">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" /></span>
                <span className="flex-1 truncate" title={r.label}>{r.label}</span>
                <button className="text-xs text-accent hover:underline" onClick={() => { go(p as any); setOpen(false); }}>{tr("Abrir")}</button>
              </div>
              <div className="mt-1 pl-[18px] text-[11px] text-muted">{tr("em andamento há")} {Math.max(1, Math.round((Date.now() - r.since) / 1000))} s</div>
              <div className="mt-1.5 pl-[18px]"><ProgressBar indeterminate className="h-1" /></div>
            </div>
          ))}
          {scanning.map((s) => (
            <div key={'s' + s.id} className="rounded-md px-2 py-2 hover:bg-hover">
              <div className="flex items-center gap-2 text-[13px]">
                <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
                <span className="flex-1 truncate">{tr("Varrendo")} {s.root}</span>
                <button className="text-xs text-accent hover:underline" onClick={() => { setActive(s.id); go('explorer'); setOpen(false); }}>{tr("Abrir")}</button>
              </div>
              <div className="mt-1 pl-6 text-[11px] text-muted tnum">{(s.progress?.files || 0).toLocaleString(LOCALE)} {tr("arquivos ·")} {fmtSize(s.progress?.size)}</div>
              <div className="mt-1.5 pl-6"><ProgressBar indeterminate className="h-1" /></div>
            </div>
          ))}
          {running.map((t) => (
            <div key={t.key} className="rounded-md px-2 py-2 hover:bg-hover">
              <div className="flex items-center gap-2 text-[13px]">
                <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
                <span className="flex-1 truncate" title={t.label}>{t.label}</span>
                <button className="text-xs text-accent hover:underline" onClick={() => { if (t.scanId) setActive(t.scanId); if (t.nodeId !== undefined) select(t.nodeId); go(t.page); setOpen(false); }}>{tr("Abrir")}</button>
                {t.kind !== 'uninstall' && <button className="text-xs text-muted hover:text-danger" onClick={() => cancelTask(t.key)}>{tr("Cancelar")}</button>}
              </div>
              <div className="mt-1 pl-6 text-[11px] text-muted tnum">{t.progress ? tr("{0} · {1} de {2}", tr(t.progress.phase), t.progress.done.toLocaleString(LOCALE), t.progress.total.toLocaleString(LOCALE)) : tr("Iniciando…")}</div>
              <div className="mt-1.5 pl-6"><ProgressBar value={pct(t.progress)} indeterminate={pct(t.progress) === undefined} className="h-1" /></div>
            </div>
          ))}
          {finished.map((t) => (
            <button key={t.key} onClick={() => { if (t.scanId) setActive(t.scanId); if (t.nodeId !== undefined) select(t.nodeId); go(t.page); setOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] hover:bg-hover">
              {t.status === 'done' ? <CheckCircle2 size={14} className="shrink-0 text-accent" /> : <AlertCircle size={14} className={cx('shrink-0', t.status === 'cancelled' ? 'text-muted' : 'text-danger')} />}
              <span className="flex-1 truncate" title={t.label}>{t.label}</span>
              <span className="text-[11px] text-faint">{t.status === 'done' ? tr("concluída") : t.status === 'cancelled' ? 'cancelada' : 'falhou'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px] text-fg shadow-xl anim-toast">
          {t.kind === 'ok' ? <CheckCircle2 size={16} className="mt-px shrink-0 text-accent" /> : t.kind === 'error' ? <AlertCircle size={16} className="mt-px shrink-0 text-danger" /> : <Info size={16} className="mt-px shrink-0 text-info" />}
          <span className="break-words">{t.text}</span>
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog() {
  const { confirmState: s } = useApp();
  const [check, setCheck] = useState(false);
  const [opt, setOpt] = useState<string | undefined>();
  useEffect(() => { setCheck(false); setOpt(s?.defaultOption); }, [s]);
  if (!s) return null;
  const close = () => s.resolve({ ok: false });
  return (
    <Modal
      open
      onClose={close}
      title={s.title}
      width={560}
      footer={<>
        <Button variant="outline" onClick={close}>{tr("Cancelar")}</Button>
        <Button
          variant={s.danger ? 'danger' : 'primary'}
          disabled={!!s.requireCheck && !check}
          onClick={() => s.resolve({ ok: true, option: opt })}
        >{s.confirmLabel || tr("Confirmar")}</Button>
      </>}
    >
      {s.message && <div className="text-[13px] leading-relaxed text-muted">{s.message}</div>}
      {s.items && s.items.length > 0 && (
        <div className="mt-3 max-h-56 overflow-auto rounded-md border border-line bg-surface-2">
          {s.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-line/60 px-3 py-1.5 text-xs last:border-0">
              <span className="truncate text-fg" title={it.label}>{it.label}</span>
              {it.detail && <span className="shrink-0 text-muted tnum">{it.detail}</span>}
            </div>
          ))}
        </div>
      )}
      {s.options && (
        <div className="mt-3 space-y-1.5">
          {s.options.map((o) => (
            <label key={o.key} className={cx('flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 transition-colors', opt === o.key ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover')}>
              <input type="radio" className="mt-0.5 accent-[var(--accent)]" checked={opt === o.key} onChange={() => setOpt(o.key)} />
              <span>
                <span className={cx('block text-[13px]', o.key === 'permanent' ? 'text-danger' : 'text-fg')}>{o.label}</span>
                {o.hint && <span className="block text-xs text-muted">{o.hint}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
      {s.requireCheck && (
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-[13px] text-fg">
          <Checkbox checked={check} onChange={setCheck} /> {s.requireCheck}
        </label>
      )}
    </Modal>
  );
}

export { Dropdown };
