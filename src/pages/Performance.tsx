// Desempenho: tarefas de manutenção, itens que abrem com o sistema e apps que mais consomem.
import React, { useEffect, useMemo, useState } from 'react';
import { Gauge, Wrench, Power, Flame, Lock, CheckCircle2, XCircle, Loader2, RefreshCw, ExternalLink, FolderOpen, Search, X, Cpu, MemoryStick } from 'lucide-react';
import { useApp, useRunning } from '../lib/store';
import { cc, MaintenanceTask, StartupItem, ProcInfo, isMac, OS_NAME, FILE_MANAGER } from '../lib/api';
import { fmtSize } from '../lib/format';
import { Badge, Button, Checkbox, cx, Empty, Input, Segmented } from '../components/ui';
import { PageBody } from './common';

type Tab = 'maintenance' | 'startup' | 'heavy';

function Switch({ on, onChange, disabled, busy }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; busy?: boolean }) {
  return (
    <button disabled={disabled || busy} onClick={() => onChange(!on)} role="switch" aria-checked={on}
      className={cx('relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50', on ? 'bg-accent' : 'bg-line-strong')}>
      <span className={cx('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-[left] duration-200', on ? 'left-[19px]' : 'left-[3px]')} />
      {busy && <Loader2 size={12} className="absolute -right-5 top-[5px] animate-spin text-muted" />}
    </button>
  );
}

// ---------- manutenção ----------
function Maintenance() {
  const { toast } = useApp();
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  useRunning('performance', running ? 'Desempenho: executando manutenção' : null);
  const [res, setRes] = useState<Record<string, { ok: boolean; message: string }>>({});
  useEffect(() => { cc.perfTasks().then((t) => { setTasks(t); setSel(new Set(t.filter((x) => x.recommended).map((x) => x.id))); }); }, []);
  const needsAdmin = tasks.some((t) => sel.has(t.id) && t.admin);
  const run = async () => {
    setRunning(true); setRes({});
    const r = await cc.perfRunTasks([...sel]);
    setRes(Object.fromEntries(r.map((x) => [x.id, x])));
    setRunning(false);
    const ok = r.filter((x) => x.ok).length;
    toast(ok === r.length ? 'Manutenção concluída' : `${ok} de ${r.length} tarefas concluídas`, ok === r.length ? 'ok' : 'error');
  };
  return (
    <>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {tasks.map((t, i) => {
          const r = res[t.id];
          return (
            <label key={t.id} className={cx('flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-hover anim-page', i > 0 && 'border-t border-line')} style={{ animationDelay: `${i * 35}ms` }}>
              <Checkbox checked={sel.has(t.id)} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(t.id) : n.delete(t.id); return n; })} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-fg">{t.name}{t.recommended && <Badge tone="accent">recomendado</Badge>}{t.admin && <span title="O sistema pede a senha de administrador." className="text-faint"><Lock size={12} /></span>}</div>
                <div className="text-xs text-muted">{t.description}</div>
              </div>
              <div className="w-36 shrink-0 text-right text-xs">
                {running && sel.has(t.id) ? <span className="inline-flex items-center gap-1 text-accent"><Loader2 size={13} className="animate-spin" /> Executando</span>
                  : r ? <span className={cx('inline-flex items-center gap-1', r.ok ? 'text-accent' : 'text-danger')} title={r.message}>{r.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{r.ok ? 'Concluído' : 'Falhou'}</span>
                  : <span className="text-faint">{t.duration}</span>}
              </div>
            </label>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" icon={running ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />} disabled={!sel.size || running} onClick={run}>Executar {sel.size || ''} tarefa(s)</Button>
        {needsAdmin && <span className="flex items-center gap-1.5 text-xs text-muted"><Lock size={12} />{isMac ? 'O macOS vai pedir sua senha uma vez.' : 'O Windows vai pedir permissão de administrador (UAC).'}</span>}
      </div>
    </>
  );
}

// ---------- itens de início ----------
const KIND_LABEL: Record<StartupItem['kind'], { title: string; hint: string }> = {
  login: { title: 'Itens de login', hint: 'Apps que abrem quando você entra na sua conta.' },
  agent: { title: 'Agentes em segundo plano', hint: 'São programas dos apps que rodam escondidos, como os atualizadores e os ajudantes.' },
  daemon: { title: 'Serviços do sistema', hint: 'Rodam para todos os usuários, antes de alguém entrar na conta. Para mudar esses itens, o macOS pede a sua senha.' },
  run: { title: 'Programas de inicialização', hint: 'São programas registrados no Windows para abrir junto com o sistema.' },
  folder: { title: 'Pasta Inicializar', hint: 'São atalhos que ficam na pasta Inicializar do menu Iniciar.' },
};
function Startup() {
  const { toast, confirm } = useApp();
  const [items, setItems] = useState<StartupItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const load = () => { setItems(null); cc.perfStartup().then(setItems).catch(() => setItems([])); };
  useEffect(load, []);
  const set = async (it: StartupItem, enabled: boolean) => {
    if (it.control === 'remove') {
      const r = await confirm({ title: `Remover "${it.name}" dos itens de login?`, message: 'O app deixa de abrir sozinho quando você entra na sua conta, mas continua instalado.', confirmLabel: 'Remover' });
      if (!r.ok) return;
    }
    setBusy(it.id);
    const r = await cc.perfSetStartup(it.id, enabled);
    setBusy(null);
    toast(`${it.name}: ${r.message}`, r.ok ? 'ok' : 'error');
    if (r.ok) setItems((l) => (it.control === 'remove' ? l?.filter((x) => x.id !== it.id) : l?.map((x) => (x.id === it.id ? { ...x, enabled } : x))) || null);
  };
  const shown = (items || []).filter((x) => !q || `${x.name} ${x.detail} ${x.publisher || ''}`.toLowerCase().includes(q.toLowerCase()));
  const kinds = [...new Set(shown.map((x) => x.kind))];
  const active = (items || []).filter((x) => x.enabled).length;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="w-72" icon={<Search size={14} />} placeholder="Filtrar por nome ou caminho" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex-1 text-xs text-muted">{items ? `${active} de ${items.length} ativos` : ''}</div>
        <Button variant="ghost" icon={<ExternalLink size={14} />} onClick={() => cc.perfOpenStartupSettings()}>{isMac ? 'Ajustes de itens de início' : 'Configurações de inicialização'}</Button>
        <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={load}>Recarregar</Button>
      </div>
      {!items ? <div className="flex items-center gap-2 py-10 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Lendo itens de início…</div>
        : !shown.length ? <Empty icon={<Power size={20} />} title="Nenhum item" text={q ? 'Nenhum item combina com o filtro.' : `Nenhum item está configurado para abrir junto com o ${OS_NAME}.`} />
        : kinds.map((k) => (
          <div key={k} className="mb-5">
            <div className="mb-2 flex items-baseline gap-2"><span className="text-[11px] font-semibold uppercase tracking-wider text-faint">{KIND_LABEL[k].title}</span><span className="text-xs text-faint">· {KIND_LABEL[k].hint}</span></div>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {shown.filter((x) => x.kind === k).map((it, i) => (
                <div key={it.id} className={cx('group flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line')}>
                  <div className={cx('h-2 w-2 shrink-0 rounded-full', it.enabled ? 'bg-accent' : 'bg-line-strong')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13.5px] font-medium text-fg"><span className="truncate">{it.name}</span>{it.publisher && <Badge>{it.publisher}</Badge>}{it.scope === 'system' && <Badge>todos os usuários</Badge>}{it.admin && <Lock size={11} className="shrink-0 text-faint" />}</div>
                    <div className="truncate text-xs text-faint" title={it.detail}>{it.detail || it.location}</div>
                  </div>
                  {it.location && it.location.startsWith('/') && <button title={`Mostrar no ${FILE_MANAGER}`} onClick={() => cc.showInFolder(it.location!)} className="rounded p-1 text-faint opacity-0 hover:text-fg group-hover:opacity-100"><FolderOpen size={14} /></button>}
                  {it.control === 'remove'
                    ? <Button size="sm" variant="outline" icon={busy === it.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} disabled={busy === it.id} onClick={() => set(it, false)}>Remover</Button>
                    : <Switch on={it.enabled} busy={busy === it.id} disabled={it.control === 'none'} onChange={(v) => set(it, v)} />}
                </div>
              ))}
            </div>
          </div>
        ))}
    </>
  );
}

// ---------- apps pesados ----------
function Heavy() {
  const { confirm, toast } = useApp();
  const [procs, setProcs] = useState<ProcInfo[] | null>(null);
  const [order, setOrder] = useState<'cpu' | 'mem'>('cpu');
  useEffect(() => {
    let alive = true, t: ReturnType<typeof setTimeout>;
    const tick = async () => { try { const p = await cc.perfProcesses(); if (alive) setProcs(p); } catch { /* */ } if (alive) t = setTimeout(tick, 3000); };
    tick();
    return () => { alive = false; clearTimeout(t); };
  }, []);
  // agrupa por app (todos os processos auxiliares de um navegador viram uma linha)
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; cpu: number; mem: number; pids: number[] }>();
    for (const p of procs || []) {
      const g = m.get(p.name) || { name: p.name, cpu: 0, mem: 0, pids: [] };
      g.cpu += p.cpu; g.mem += p.mem; g.pids.push(p.pid); m.set(p.name, g);
    }
    return [...m.values()].filter((g) => !/^(CleanCode|Electron)$/i.test(g.name)).sort((a, b) => (order === 'cpu' ? b.cpu - a.cpu : b.mem - a.mem)).slice(0, 20);
  }, [procs, order]);
  const max = Math.max(1, ...groups.map((g) => (order === 'cpu' ? g.cpu : g.mem)));
  const kill = async (g: { name: string; pids: number[] }) => {
    const r = await confirm({ title: `Encerrar ${g.name}?`, message: <>Fecha {g.pids.length > 1 ? `os ${g.pids.length} processos` : 'o processo'} do app. Trabalho não salvo pode ser perdido.</>, danger: true, confirmLabel: 'Encerrar' });
    if (!r.ok) return;
    const n = await cc.perfKill(g.pids);
    toast(n ? `${g.name} encerrado` : `Não foi possível encerrar ${g.name}`, n ? 'ok' : 'error');
  };
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <Segmented value={order} onChange={setOrder} options={[{ value: 'cpu', label: <span className="flex items-center gap-1.5"><Cpu size={13} /> Processador</span> }, { value: 'mem', label: <span className="flex items-center gap-1.5"><MemoryStick size={13} /> Memória</span> }]} />
        <span className="text-xs text-faint">A lista se atualiza a cada 3 segundos e mostra apenas os apps da sua conta.</span>
      </div>
      {!procs ? <div className="flex items-center gap-2 py-10 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Lendo processos…</div> : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {groups.map((g, i) => {
            const v = order === 'cpu' ? g.cpu : g.mem;
            return (
              <div key={g.name} className={cx('group flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t border-line')}>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2"><span className="truncate text-[13.5px] font-medium text-fg">{g.name}</span>{g.pids.length > 1 && <span className="text-[11px] text-faint">{g.pids.length} processos</span>}</div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(v / max) * 100}%` }} /></div>
                </div>
                <div className="w-20 shrink-0 text-right text-[13px] tabular-nums text-fg">{g.cpu.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</div>
                <div className="w-20 shrink-0 text-right text-[13px] tabular-nums text-muted">{fmtSize(g.mem, 'auto', 0)}</div>
                <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => kill(g)}>Encerrar</Button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function Performance() {
  const [tab, setTab] = useState<Tab>('maintenance');
  const tabs: { value: Tab; label: string; icon: React.ReactNode }[] = [
    { value: 'maintenance', label: 'Manutenção', icon: <Wrench size={14} /> },
    { value: 'startup', label: 'Itens de início', icon: <Power size={14} /> },
    { value: 'heavy', label: 'Apps pesados', icon: <Flame size={14} /> },
  ];
  return (
    <PageBody>
      <div className="mb-6 flex flex-wrap items-center gap-4 anim-page">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl text-white" style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #ffffff))', boxShadow: '0 8px 28px color-mix(in srgb, var(--accent) 35%, transparent)' }}><Gauge size={26} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold tracking-tight text-fg">Desempenho</h1>
          <p className="text-sm text-muted">Rotinas de manutenção, o que abre junto com o {OS_NAME} e os apps que mais pesam agora.</p>
        </div>
      </div>
      <div className="mb-5 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)} className={cx('-mb-px flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-[13.5px] font-medium transition-colors', tab === t.value ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>{t.icon}{t.label}</button>
        ))}
      </div>
      <div key={tab} className="anim-page">
        {tab === 'maintenance' ? <Maintenance /> : tab === 'startup' ? <Startup /> : <Heavy />}
      </div>
    </PageBody>
  );
}
