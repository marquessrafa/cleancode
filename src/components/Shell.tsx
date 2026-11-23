import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard, FolderTree, LayoutGrid, FileType2, CalendarClock, Users, ArrowDownWideNarrow, Copy, Search, History,
  Radar, PackageX, Settings as Cog, PanelLeftClose, PanelLeftOpen, Sun, Moon, Monitor, X, HardDrive, ShieldCheck, ShieldAlert,
  CheckCircle2, AlertCircle, Info, Plus, Loader2, ArrowUpCircle, Sparkles, Gauge, Activity, Shield, HeartPulse, Layers, Wrench, Globe, Gamepad2, CircuitBoard, FolderOpen, RefreshCw,
  FolderCog,
} from 'lucide-react';
import { Page, useApp } from '../lib/store';
import { cc, isMac } from '../lib/api';
import { fmtSize, baseName } from '../lib/format';
import { Button, Checkbox, cx, Dropdown, Modal, ProgressBar } from './ui';

const NAV: { group: string; items: { page: Page; label: string; icon: React.ReactNode; needsScan?: boolean }[] }[] = [
  { group: '', items: [
    { page: 'overview', label: 'Visão geral', icon: <LayoutDashboard size={17} /> },
  ] },
  {
    group: 'Análise de disco', items: [
      { page: 'explorer', label: 'Explorador', icon: <FolderTree size={17} />, needsScan: true },
      { page: 'visual', label: 'Visualizações', icon: <LayoutGrid size={17} />, needsScan: true },
      { page: 'types', label: 'Tipos de arquivo', icon: <FileType2 size={17} />, needsScan: true },
      { page: 'age', label: 'Idade dos arquivos', icon: <CalendarClock size={17} />, needsScan: true },
      { page: 'owners', label: 'Proprietários', icon: <Users size={17} />, needsScan: true },
      { page: 'top', label: 'Maiores arquivos', icon: <ArrowDownWideNarrow size={17} />, needsScan: true },
      { page: 'duplicates', label: 'Duplicados', icon: <Copy size={17} />, needsScan: true },
      { page: 'search', label: 'Pesquisa avançada', icon: <Search size={17} />, needsScan: true },
      { page: 'history', label: 'Histórico e comparação', icon: <History size={17} /> },
    ],
  },
  {
    group: 'Manutenção', items: [
      { page: 'smartcare', label: 'Cuidados Inteligentes', icon: <HeartPulse size={17} /> },
      { page: 'cleanup', label: 'Limpeza', icon: <Sparkles size={17} /> },
      { page: 'clutter', label: 'Acúmulos', icon: <Layers size={17} /> },
      { page: 'performance', label: 'Desempenho', icon: <Gauge size={17} /> },
      { page: 'protection', label: 'Proteção', icon: <Shield size={17} /> },
      { page: 'repairs', label: isMac ? 'Reparos' : 'Registro', icon: <Wrench size={17} /> },
      { page: 'browsers', label: 'Navegadores', icon: <Globe size={17} /> },
      { page: 'appdata', label: isMac ? 'Dados de apps' : 'AppData', icon: <FolderCog size={17} /> },
      { page: 'game', label: 'Modo Jogo', icon: <Gamepad2 size={17} /> },
      { page: 'activity', label: 'Atividades', icon: <Activity size={17} /> },
    ],
  },
  {
    group: 'Hardware', items: [
      { page: 'hardware', label: 'Monitor de hardware', icon: <CircuitBoard size={17} /> },
    ],
  },
  {
    group: 'Aplicativos', items: [
      { page: 'discover', label: 'Descoberta', icon: <Radar size={17} /> },
      { page: 'uninstall', label: 'Desinstalador', icon: <PackageX size={17} /> },
    ],
  },
];

export function Sidebar() {
  const { page, go, settings, setSettings, active, tasks, scans, running } = useApp();
  const collapsed = !!settings?.sidebarCollapsed;
  // páginas com trabalho em andamento ganham um indicador no menu
  const busyPages = new Set<string>(tasks.filter((t) => t.status === 'running').map((t) => t.page));
  Object.keys(running).forEach((p) => busyPages.add(p));
  if (scans.some((s) => !s.done)) busyPages.add('explorer');
  return (
    <aside className={cx('flex shrink-0 flex-col overflow-hidden border-r border-line bg-surface transition-[width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]', collapsed ? 'w-[56px]' : 'w-[228px]')}>
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        {NAV.map((g, gi) => (
          <div key={gi} className={gi ? 'mt-4' : ''}>
            {g.group && (
              <div className={cx('mb-1 h-5 px-2.5 text-[11px] font-medium uppercase tracking-wide text-faint transition-opacity duration-200 whitespace-nowrap', collapsed && 'opacity-0')}>{g.group}</div>
            )}
            {g.items.map((it) => {
              const on = page === it.page;
              return (
                <button
                  key={it.page}
                  title={collapsed ? it.label : undefined}
                  onClick={() => go(it.page)}
                  className={cx(
                    'group relative mb-0.5 flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-md px-2.5 text-[13px] transition-colors duration-150',
                    on ? 'bg-hover text-fg font-medium' : 'text-muted hover:bg-hover hover:text-fg',
                  )}
                >
                  <span className={cx('relative shrink-0 transition-colors', on ? 'text-accent' : '')}>
                    {it.icon}
                    {busyPages.has(it.page) && collapsed && <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-accent ring-2 ring-surface" />}
                  </span>
                  <span className={cx('truncate whitespace-nowrap transition-opacity duration-200', collapsed && 'opacity-0')}>{it.label}</span>
                  {busyPages.has(it.page) && !collapsed
                    ? <span className="ml-auto flex shrink-0 items-center" title={running[it.page]?.label || 'Em andamento'}><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" /></span></span>
                    : it.needsScan && !active && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-line-strong" title="Requer uma varredura" />}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="overflow-hidden border-t border-line px-2 py-2">
        <button
          onClick={() => go('settings')}
          title={collapsed ? 'Configurações' : undefined}
          className={cx('mb-0.5 flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-md px-2.5 text-[13px] transition-colors', page === 'settings' ? 'bg-hover text-fg font-medium' : 'text-muted hover:bg-hover hover:text-fg')}
        >
          <Cog size={17} className={cx('shrink-0', page === 'settings' && 'text-accent')} />
          <span className={cx('truncate whitespace-nowrap transition-opacity duration-200', collapsed && 'opacity-0')}>Configurações</span>
        </button>
        <button
          onClick={() => setSettings({ sidebarCollapsed: !collapsed })}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-md px-2.5 text-[13px] text-muted transition-colors hover:bg-hover hover:text-fg"
        >
          {collapsed ? <PanelLeftOpen size={17} className="shrink-0" /> : <PanelLeftClose size={17} className="shrink-0" />}
          <span className={cx('truncate whitespace-nowrap transition-opacity duration-200', collapsed && 'opacity-0')}>Recolher menu</span>
        </button>
      </div>
    </aside>
  );
}

export function TopBar() {
  const { scans, active, setActive, closeScan, settings, setSettings, info, startScan, toast } = useApp();
  const theme = settings?.theme || 'system';
  const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const pick = async () => { const p = await cc.pickFolder(); if (p) startScan(p); };
  const [addOpen, setAddOpen] = useState(false);
  const [drives, setDrives] = useState<import('../lib/api').Drive[] | null>(null);
  const addRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!addOpen) return;
    cc.drives().then((d) => setDrives(d.filter((x) => x.total > 0))).catch(() => setDrives([]));
    const h = (e: MouseEvent) => { if (!addRef.current?.contains(e.target as Node)) setAddOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [addOpen]);
  // disco: o mesmo que o "Analisar" da Visão geral
  const scanDrive = (root: string) => { setAddOpen(false); startScan(root); };
  return (
    // Windows: espaço à direita para os botões do overlay; macOS: à esquerda para os botões de semáforo
    <header className="drag flex h-10 shrink-0 items-center border-b border-line bg-bg" style={isMac ? { paddingLeft: 84, paddingRight: 12 } : { paddingLeft: 12, paddingRight: 150 }}>
      <div className="flex items-center gap-2 pr-3">
        <img src="./icon.png" className="h-5 w-5" alt="" />
        <span className="text-[13px] font-semibold tracking-tight text-fg">CleanCode</span>
      </div>
      {/* o contêiner continua arrastável; só as abas e botões são "no-drag" */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <div className="no-drag flex min-w-0 shrink items-center gap-1 overflow-x-auto">
        {scans.map((s) => {
          const on = s.id === active?.id;
          const scanning = !s.done;
          return (
            <div
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cx('group flex h-7 max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs transition-all duration-150', on ? 'border-line bg-surface text-fg shadow-sm' : 'border-transparent text-muted hover:bg-hover hover:text-fg')}
              title={s.root}
            >
              {scanning ? <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" /> : <HardDrive size={13} className="shrink-0" />}
              <span className="truncate">{baseName(s.root) || s.root}</span>
              {s.progress && <span className="text-faint tnum">{fmtSize(s.progress.size, 'auto', 0)}</span>}
              <button className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity hover:bg-line group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); closeScan(s.id); }} title="Fechar varredura"><X size={12} /></button>
            </div>
          );
        })}
        <div ref={addRef} className="relative shrink-0">
          <button onClick={() => setAddOpen((o) => !o)} title="Analisar um disco ou uma pasta" className={cx('flex h-7 w-7 items-center justify-center rounded-md transition-colors', addOpen ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg')}><Plus size={15} /></button>
        </div>
        </div>
        <div className="h-full min-w-[40px] flex-1" />
      </div>
      {addOpen && addRef.current && (() => {
        const r = addRef.current!.getBoundingClientRect();
        return (
          <div className="no-drag anim-pop fixed z-[70] w-[300px] rounded-xl border border-line bg-surface p-1.5 shadow-2xl" style={{ left: Math.max(8, r.left - 8), top: r.bottom + 6 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Analisar um disco</div>
            {drives === null ? <div className="flex items-center gap-2 px-2 py-2 text-[12px] text-muted"><Loader2 size={13} className="animate-spin" />Lendo unidades…</div> : drives.map((d) => (
              <button key={d.root} onClick={() => scanDrive(d.root)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-hover">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><HardDrive size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{d.label || d.root} <span className="font-normal text-muted">{d.root}</span></span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round((d.used / d.total) * 100)}%` }} /></span>
                  <span className="mt-0.5 block text-[11px] text-muted tnum">{fmtSize(d.free, 'auto', 0)} livres de {fmtSize(d.total, 'auto', 0)}</span>
                </span>
              </button>
            ))}
            <div className="my-1 h-px bg-line" />
            <button onClick={() => { setAddOpen(false); pick(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] font-medium hover:bg-hover">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-hover text-muted"><FolderOpen size={15} /></span>Escolher uma pasta…
            </button>
          </div>
        );
      })()}
      <div className="no-drag flex items-center gap-1 pl-2">
        <UpdatePill />
        <UpdateCheckButton />
        <ActivityCenter />
        {info?.canElevate && (info.isAdmin ? (
          <span title="Executando como administrador" className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-accent"><ShieldCheck size={14} /> Admin</span>
        ) : (
          <button title="Reinicia com privilégios de administrador para ler todas as pastas" onClick={async () => { toast('Solicitando elevação…', 'info'); await cc.restartAdmin(); }} className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted transition-colors hover:bg-hover hover:text-fg"><ShieldAlert size={14} /> Usuário</button>
        ))}
        <button
          title={`Tema: ${theme === 'system' ? 'sistema' : theme === 'light' ? 'claro' : 'escuro'}`}
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
      if ((r.status === 'available' || r.status === 'ready') && r.info) toast(`CleanCode ${r.info.version} disponível`, 'ok');
      else if (r.status === 'error') toast(`Não foi possível verificar: ${r.error || 'sem conexão'}`, 'error');
      else toast(`Você já está na versão mais recente (${info?.version || ''})`, 'ok');
    } catch (e: any) { toast(`Não foi possível verificar: ${e?.message || e}`, 'error'); }
    finally { setChecking(false); }
  };
  const busy = checking || update.status === 'checking';
  return (
    <button onClick={check} disabled={busy} title="Buscar atualização"
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
    return <span className="flex h-7 items-center gap-1.5 rounded-md bg-accent-soft px-2 text-xs text-accent"><Loader2 size={14} className="animate-spin" /> Baixando atualização{p !== undefined ? ` ${Math.round(p * 100)}%` : '…'}</span>;
  }
  if (update.status === 'installing') return <span className="flex h-7 items-center gap-1.5 rounded-md bg-accent-soft px-2 text-xs text-accent"><Loader2 size={14} className="animate-spin" /> Instalando… o app vai reabrir</span>;
  if ((update.status !== 'available' && update.status !== 'ready') || !update.info) return null;
  const ready = update.status === 'ready';
  return (
    <button onClick={installUpdate} title={ready ? 'Já baixada: instala agora e reabre o app (ou será instalada sozinha quando você fechar a janela)' : 'Baixa, instala em segundo plano e reabre o app'}
      className="flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-fg transition-all hover:brightness-110 anim-fade">
      <ArrowUpCircle size={14} /> {ready ? `Reiniciar para atualizar (${update.info.version})` : `Atualizar para ${update.info.version}`}
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
        title="Atividades em segundo plano"
        className={cx('flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors', nRunning ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg')}
      >
        {nRunning ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
        {nRunning ? `${nRunning} em andamento` : 'Atividades'}
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-[380px] rounded-lg border border-line bg-surface p-2 shadow-2xl anim-pop">
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
            <span className="text-xs font-medium text-muted">Atividades</span>
            {finished.length > 0 && <button onClick={clearFinishedTasks} className="text-[11px] text-muted hover:text-fg">Limpar concluídas</button>}
          </div>
          {runs.map(([p, r]) => (
            <div key={'p' + p} className="rounded-md px-2 py-2 hover:bg-hover">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" /></span>
                <span className="flex-1 truncate" title={r.label}>{r.label}</span>
                <button className="text-xs text-accent hover:underline" onClick={() => { go(p as any); setOpen(false); }}>Abrir</button>
              </div>
              <div className="mt-1 pl-[18px] text-[11px] text-muted">em andamento há {Math.max(1, Math.round((Date.now() - r.since) / 1000))} s</div>
              <div className="mt-1.5 pl-[18px]"><ProgressBar indeterminate className="h-1" /></div>
            </div>
          ))}
          {scanning.map((s) => (
            <div key={'s' + s.id} className="rounded-md px-2 py-2 hover:bg-hover">
              <div className="flex items-center gap-2 text-[13px]">
                <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
                <span className="flex-1 truncate">Varrendo {s.root}</span>
                <button className="text-xs text-accent hover:underline" onClick={() => { setActive(s.id); go('explorer'); setOpen(false); }}>Abrir</button>
              </div>
              <div className="mt-1 pl-6 text-[11px] text-muted tnum">{(s.progress?.files || 0).toLocaleString('pt-BR')} arquivos · {fmtSize(s.progress?.size)}</div>
              <div className="mt-1.5 pl-6"><ProgressBar indeterminate className="h-1" /></div>
            </div>
          ))}
          {running.map((t) => (
            <div key={t.key} className="rounded-md px-2 py-2 hover:bg-hover">
              <div className="flex items-center gap-2 text-[13px]">
                <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
                <span className="flex-1 truncate" title={t.label}>{t.label}</span>
                <button className="text-xs text-accent hover:underline" onClick={() => { if (t.scanId) setActive(t.scanId); if (t.nodeId !== undefined) select(t.nodeId); go(t.page); setOpen(false); }}>Abrir</button>
                {t.kind !== 'uninstall' && <button className="text-xs text-muted hover:text-danger" onClick={() => cancelTask(t.key)}>Cancelar</button>}
              </div>
              <div className="mt-1 pl-6 text-[11px] text-muted tnum">{t.progress ? `${t.progress.phase} · ${t.progress.done.toLocaleString('pt-BR')} de ${t.progress.total.toLocaleString('pt-BR')}` : 'Iniciando…'}</div>
              <div className="mt-1.5 pl-6"><ProgressBar value={pct(t.progress)} indeterminate={pct(t.progress) === undefined} className="h-1" /></div>
            </div>
          ))}
          {finished.map((t) => (
            <button key={t.key} onClick={() => { if (t.scanId) setActive(t.scanId); if (t.nodeId !== undefined) select(t.nodeId); go(t.page); setOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] hover:bg-hover">
              {t.status === 'done' ? <CheckCircle2 size={14} className="shrink-0 text-accent" /> : <AlertCircle size={14} className={cx('shrink-0', t.status === 'cancelled' ? 'text-muted' : 'text-danger')} />}
              <span className="flex-1 truncate" title={t.label}>{t.label}</span>
              <span className="text-[11px] text-faint">{t.status === 'done' ? 'concluída' : t.status === 'cancelled' ? 'cancelada' : 'falhou'}</span>
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
        <Button variant="outline" onClick={close}>Cancelar</Button>
        <Button
          variant={s.danger ? 'danger' : 'primary'}
          disabled={!!s.requireCheck && !check}
          onClick={() => s.resolve({ ok: true, option: opt })}
        >{s.confirmLabel || 'Confirmar'}</Button>
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
