// Cuidados Inteligentes: uma análise que junta Limpeza, Proteção, Desempenho e Apps, e uma ação
// que executa só o que é seguro (lixo marcado por padrão e tarefas recomendadas). O resto fica para revisão.
import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, ShieldCheck, ShieldAlert, Gauge, Radar, Loader2, CheckCircle2, ChevronRight, RotateCcw, Lock, HeartPulse } from 'lucide-react';
import { useApp, useRunning } from '../lib/store';
import { cc, JunkCategoryInfo, JunkResult, ProtectionReport, MaintenanceTask, AppEntry, isMac } from '../lib/api';
import { fmtSize, fmtNum } from '../lib/format';
import { Button, Checkbox, cx } from '../components/ui';
import { Float3D } from './maint';
import { PageBody } from './common';
import { t as tr } from '../lib/i18n';
import { setAlert } from '../lib/alerts';

type Phase = 'intro' | 'scanning' | 'results' | 'running' | 'done';
type Mod = 'cleanup' | 'protection' | 'performance' | 'apps';
const MODS: { id: Mod; name: string; icon: React.ReactNode; page: string }[] = [
  { id: 'cleanup', name: tr("Limpeza"), icon: <Sparkles size={18} />, page: 'cleanup' },
  { id: 'protection', name: tr("Proteção"), icon: <ShieldCheck size={18} />, page: 'protection' },
  { id: 'performance', name: tr("Desempenho"), icon: <Gauge size={18} />, page: 'performance' },
  { id: 'apps', name: tr("Aplicativos"), icon: <Radar size={18} />, page: 'discover' },
];

function useTween(target: number, ms = 800) {
  const [v, setV] = useState(target);
  useEffect(() => {
    const from = v, start = performance.now();
    let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3); setV(from + (target - from) * e); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/** Marca do módulo: coração pulsando dentro de anéis concêntricos na cor de destaque. */
function Pulse({ size = 280, active }: { size?: number; active?: boolean }) {
  return <Float3D icon={<HeartPulse />} active={active} size={size} />;
}

export default function SmartCare() {
  const { go, settings, toast } = useApp();
  const units = settings?.units || 'auto';
  const [phase, setPhase] = useState<Phase>('intro');
  const [status, setStatus] = useState<Record<Mod, 'idle' | 'busy' | 'done'>>({ cleanup: 'idle', protection: 'idle', performance: 'idle', apps: 'idle' });
  useEffect(() => {
    if (phase === 'done') setAlert('smartcare', null);
    else if (phase === 'results') setAlert('smartcare', safe.size > 100 * 1048576 ? tr("Há {0} de lixo seguro para limpar.", fmtSize(safe.size, 'auto', 1)) : null);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useRunning('smartcare', phase === 'scanning' ? 'Cuidados Inteligentes: analisando' : phase === 'running' ? 'Cuidados Inteligentes: aplicando' : null);
  const [cats, setCats] = useState<JunkCategoryInfo[]>([]);
  const [junk, setJunk] = useState<JunkResult[]>([]);
  const [prot, setProt] = useState<ProtectionReport | null>(null);
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [incl, setIncl] = useState({ cleanup: true, maintenance: false });
  const [result, setResult] = useState<{ freed: number; removed: number; failed: number; tasksOk: number; tasksTotal: number } | null>(null);

  const scan = async () => {
    setPhase('scanning'); setResult(null);
    setStatus({ cleanup: 'busy', protection: 'busy', performance: 'busy', apps: 'busy' });
    const mark = (m: Mod) => setStatus((s) => ({ ...s, [m]: 'done' }));
    const c = await cc.cleanupCategories(); setCats(c);
    await Promise.all([
      cc.cleanupScan().then((r) => { setJunk(r); mark('cleanup'); }),
      cc.protectionScan().then((r) => { setProt(r); mark('protection'); }).catch(() => mark('protection')),
      cc.perfTasks().then((t) => { setTasks(t); mark('performance'); }),
      cc.appsList(false).then((a) => { setApps(a); mark('apps'); }).catch(() => mark('apps')),
    ]);
    setPhase('results');
  };

  // só o que é seguro: categorias marcadas por padrão e sem "revise"
  const safe = useMemo(() => {
    const ids = new Set(cats.filter((c) => c.selected && c.risk === 'safe').map((c) => c.id));
    const chosen = junk.filter((r) => ids.has(r.id) && r.size > 0);
    const special = new Set(cats.filter((c) => c.special).map((c) => c.id));
    return {
      size: chosen.reduce((s, r) => s + r.size, 0),
      count: chosen.reduce((s, r) => s + r.count, 0),
      paths: chosen.filter((r) => !special.has(r.id)).flatMap((r) => r.items.map((i) => i.path)),
      specials: chosen.filter((r) => special.has(r.id)).map((r) => r.id),
      review: junk.filter((r) => !ids.has(r.id)).reduce((s, r) => s + r.size, 0),
    };
  }, [cats, junk]);
  const protIssues = prot ? prot.checks.filter((c) => c.ok === false).length + prot.persistence.filter((p) => p.level === 'risk').length : 0;
  const protWarn = prot ? prot.persistence.filter((p) => p.level === 'warn').length : 0;
  const recommended = tasks.filter((t) => t.recommended);
  const staleCutoff = Date.now() - (settings?.staleMonths || 6) * 30.4 * 86400000;
  const stale = apps.filter((a) => a.canUninstall && !a.background && a.lastUsed && a.lastUsed < staleCutoff);
  const staleSize = stale.reduce((s, a) => s + (a.size || 0), 0);

  const run = async () => {
    setPhase('running');
    let freed = 0, removed = 0, failed = 0, tasksOk = 0;
    if (incl.cleanup && (safe.paths.length || safe.specials.length)) {
      const r = await cc.cleanupClean(safe.paths, safe.specials, 'trash');
      freed = r.freed; removed = r.removed; failed = r.failed.length;
    }
    let tasksTotal = 0;
    if (incl.maintenance && recommended.length) {
      const r = await cc.perfRunTasks(recommended.map((t) => t.id));
      tasksTotal = r.length; tasksOk = r.filter((x) => x.ok).length;
    }
    setResult({ freed, removed, failed, tasksOk, tasksTotal });
    setPhase('done');
    toast(freed ? `${fmtSize(freed, units)} liberados` : tr("Cuidados concluídos"));
  };

  const foundT = useTween(phase === 'intro' ? 0 : safe.size);
  const freedT = useTween(result?.freed || 0);

  if (phase === 'intro' || phase === 'scanning') {
    return (
      <PageBody>
        <div className="flex min-h-[calc(100vh-140px)] flex-col items-center justify-center gap-10 py-6 lg:flex-row lg:gap-16">
          <div className="anim-pop"><Pulse active={phase === 'scanning'} /></div>
          <div className="w-full max-w-md anim-page">
            <h1 className="text-[40px] font-semibold leading-tight tracking-tight text-fg">{tr("Cuidados Inteligentes")}</h1>
            <p className="mt-2 text-[15px] text-muted">{tr("Uma análise completa do")} {isMac ? tr("Mac") : 'PC'} {tr("em um clique: lixo para limpar, proteção, desempenho e apps esquecidos. Só o que é seguro é feito automaticamente.")}</p>
            <div className="mt-6 space-y-2.5">
              {MODS.map((m, i) => (
                <div key={m.id} className="flex items-center gap-3 text-[14px] font-medium text-fg anim-page" style={{ animationDelay: `${60 + i * 50}ms` }}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">{m.icon}</span>
                  <span className="flex-1">{m.name}</span>
                  {status[m.id] === 'busy' ? <Loader2 size={15} className="animate-spin text-accent" /> : status[m.id] === 'done' ? <CheckCircle2 size={15} className="text-accent" /> : null}
                </div>
              ))}
            </div>
            {phase === 'intro' && (
              <button onClick={scan} className="relative mt-8 flex h-28 w-28 items-center justify-center rounded-full text-[17px] font-semibold text-accent-fg transition-transform hover:scale-105 active:scale-95"
                style={{ background: 'radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent) 55%, #ffffff), var(--accent) 60%)', boxShadow: '0 10px 40px color-mix(in srgb, var(--accent) 45%, transparent)' }}>
                <span className="absolute inset-0 rounded-full anim-ping-soft" style={{ boxShadow: '0 0 0 2px var(--accent)' }} />
                {tr("Analisar")}
              </button>
            )}
          </div>
        </div>
      </PageBody>
    );
  }

  const cards: { id: Mod; value: string; sub: string; tone: 'ok' | 'warn' | 'risk'; action?: React.ReactNode }[] = [
    { id: 'cleanup', value: fmtSize(safe.size, units), sub: tr("{0} itens seguros para limpar{1}", fmtNum(safe.count), safe.review ? tr(", e mais {0} para revisar", fmtSize(safe.review, units)) : ''), tone: safe.size ? 'warn' : 'ok',
      action: <label className="flex items-center gap-2 text-xs text-muted"><Checkbox checked={incl.cleanup} onChange={(v) => setIncl((x) => ({ ...x, cleanup: v }))} />{tr("Limpar (vai para a Lixeira)")}</label> },
    { id: 'protection', value: protIssues ? tr("{0} ponto(s)", protIssues) : tr("Protegido"), sub: prot ? tr("{0} de {1} defesas ligadas{2}", prot.checks.filter((c) => c.ok).length, prot.checks.length, protWarn ? tr(", e {0} item(ns) para revisar", protWarn) : '') : tr("Não verificado"), tone: protIssues ? 'risk' : protWarn ? 'warn' : 'ok' },
    { id: 'performance', value: tr("{0} tarefa(s)", recommended.length), sub: recommended.map((t) => t.name.toLowerCase()).join(', ') || tr("Nada recomendado"), tone: 'ok',
      action: <label className="flex items-center gap-2 text-xs text-muted"><Checkbox checked={incl.maintenance} onChange={(v) => setIncl((x) => ({ ...x, maintenance: v }))} />{tr("Executar")}{recommended.some((t) => t.admin) && <Lock size={11} />}</label> },
    { id: 'apps', value: tr("{0} sem uso", stale.length), sub: stale.length ? tr("há mais de {0} meses · {1}", settings?.staleMonths || 6, fmtSize(staleSize, units)) : tr("Nenhum app esquecido"), tone: stale.length ? 'warn' : 'ok' },
  ];
  const nothing = !(incl.cleanup && safe.size) && !(incl.maintenance && recommended.length);

  return (
    <PageBody>
      <div className="mb-7 flex flex-wrap items-center gap-6 anim-page">
        <Pulse size={120} active={phase === 'running'} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-muted">{phase === 'done' ? tr("Cuidados concluídos") : phase === 'running' ? tr("Executando…") : tr("Pronto para cuidar do seu ") + (isMac ? tr("Mac") : 'PC')}</div>
          <div className="text-[38px] font-semibold leading-none tracking-tight text-fg tabular-nums">{phase === 'done' ? fmtSize(freedT, units) : fmtSize(foundT, units)}</div>
          <div className="mt-1 text-sm text-muted">{phase === 'done' && result ? tr("liberados · {0} itens{1}{2}", fmtNum(result.removed), result.failed ? ` · ${result.failed} ficaram` : '', result.tasksTotal ? ` · ${result.tasksOk}/${result.tasksTotal} tarefas` : '') : tr("de lixo seguro encontrado")}</div>
        </div>
        {phase === 'results' && (
          <button disabled={nothing} onClick={run} className="relative flex h-24 w-24 items-center justify-center rounded-full text-[16px] font-semibold text-accent-fg transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
            style={{ background: 'radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent) 55%, #ffffff), var(--accent) 60%)', boxShadow: '0 10px 36px color-mix(in srgb, var(--accent) 45%, transparent)' }}>
            {!nothing && <span className="absolute inset-0 rounded-full anim-ping-soft" style={{ boxShadow: '0 0 0 2px var(--accent)' }} />}
            {tr("Executar")}
          </button>
        )}
        {phase === 'running' && <Loader2 size={28} className="animate-spin text-accent" />}
        {phase === 'done' && <Button variant="primary" icon={<RotateCcw size={14} />} onClick={scan}>{tr("Analisar de novo")}</Button>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((c, i) => {
          const m = MODS.find((x) => x.id === c.id)!;
          return (
            <div key={c.id} className="flex flex-col rounded-2xl border border-line bg-surface p-5 anim-page" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center gap-3">
                <span className={cx('flex h-10 w-10 items-center justify-center rounded-xl', c.tone === 'risk' ? 'bg-danger-soft text-danger' : c.tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent')}>{c.id === 'protection' && c.tone !== 'ok' ? <ShieldAlert size={18} /> : m.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted">{m.name}</div>
                  <div className="text-xl font-semibold tracking-tight text-fg tabular-nums">{c.value}</div>
                </div>
                <button onClick={() => go(m.page as any)} className="flex items-center gap-0.5 text-xs font-medium text-accent hover:underline">{tr("Revisar")} <ChevronRight size={13} /></button>
              </div>
              <div className="mt-2 flex-1 text-xs text-muted">{c.sub}</div>
              {c.action && phase === 'results' && <div className="mt-3 border-t border-line pt-3">{c.action}</div>}
            </div>
          );
        })}
      </div>
      {phase === 'results' && incl.maintenance && recommended.some((t) => t.admin) && <div className="mt-4 flex items-center gap-1.5 text-xs text-muted"><Lock size={12} />{isMac ? tr("As tarefas pedem sua senha de administrador uma vez.") : tr("As tarefas pedem permissão de administrador (UAC).")}</div>}
    </PageBody>
  );
}
