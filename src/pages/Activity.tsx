// Atividades: tudo o que o CleanCode fez no computador (limpezas, manutenções, itens de início,
// desinstalações e exclusões), com o espaço liberado ao longo do tempo.
import React, { useEffect, useMemo, useState } from 'react';
import { Activity as ActivityIcon, ShieldCheck, Sparkles, Wrench, Power, PackageX, Trash2, HardDrive, Trash, CheckCircle2, XCircle } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, ActivityEntry } from '../lib/api';
import { fmtSize, fmtNum } from '../lib/format';
import { Button, cx, Empty, Segmented } from '../components/ui';
import { PageBody } from './common';
import { t as tr, LOCALE } from '../lib/i18n';

type Filter = 'all' | 'cleanup' | 'maintenance' | 'apps' | 'files';
const TASK_NAMES: Record<string, string> = {
  'free-ram': tr("liberar memória"), 'flush-dns': tr("cache de DNS"), 'thin-snapshots': tr("instantâneos locais"), periodic: tr("scripts de manutenção"),
  'reindex-spotlight': 'reindexar Spotlight', 'reset-permissions': tr("permissões"), optimize: 'otimizar unidades', sfc: 'SFC', dism: 'DISM',
};

function describe(e: ActivityEntry, units: string): { icon: React.ReactNode; title: string; detail: string; ok: boolean } {
  switch (e.kind) {
    case 'cleanup': return { icon: <Sparkles size={15} />, title: tr("Limpeza: {0} liberados", fmtSize(e.freed || 0, units)), detail: tr("{0} itens · {1}{2}", fmtNum(e.removed || 0), e.mode === 'delete' ? tr("apagados definitivamente") : tr("enviados para a Lixeira"), e.failed ? tr(" · {0} não removidos", e.failed) : ''), ok: !e.failed };
    case 'maintenance': return { icon: <Wrench size={15} />, title: tr("Manutenção"), detail: (e.tasks || []).map((t) => TASK_NAMES[t] || t).join(', ') + (e.failed ? tr(" · {0} falharam", e.failed) : '') || tr("nenhuma tarefa concluída"), ok: !e.failed };
    case 'startup': return { icon: <Power size={15} />, title: tr("{0}: {1} no início", e.name, e.enabled ? tr("ativado") : tr("desativado")), detail: tr("Itens de início"), ok: true };
    case 'uninstall': return { icon: <PackageX size={15} />, title: tr("{0} desinstalado", e.name), detail: e.freed ? tr("{0} liberados", fmtSize(e.freed, units)) : tr("Desinstalador"), ok: true };
    case 'protection': return { icon: <ShieldCheck size={15} />, title: e.name === 'quickScan' ? tr("Verificação rápida de vírus") : tr("Verificação de proteção"), detail: e.name === 'quickScan' ? (e.failed ? tr("Não concluída") : tr("Concluída")) : tr("{0} itens analisados · {1}", fmtNum(e.removed || 0), e.failed ? tr("{0} pontos de atenção", e.failed) : tr("nenhum ponto de atenção")), ok: !e.failed };
    case 'delete': return { icon: <Trash2 size={15} />, title: e.mode === 'delete' ? tr("{0} item(ns) apagado(s) definitivamente", fmtNum(e.removed || 0)) : tr("{0} item(ns) enviado(s) para a Lixeira", fmtNum(e.removed || 0)), detail: (e.sample || []).map((p) => p.split(/[\\/]/).pop()).join(', ') + ((e.removed || 0) > (e.sample?.length || 0) ? '…' : ''), ok: true };
  }
}
const matches = (e: ActivityEntry, f: Filter) => f === 'all' || (f === 'cleanup' && e.kind === 'cleanup') || (f === 'maintenance' && (e.kind === 'maintenance' || e.kind === 'startup' || e.kind === 'protection')) || (f === 'apps' && e.kind === 'uninstall') || (f === 'files' && e.kind === 'delete');

export default function Activity() {
  const { settings, confirm, toast } = useApp();
  const units = settings?.units || 'auto';
  const [list, setList] = useState<ActivityEntry[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => { cc.activityList().then(setList); }, []);

  const stats = useMemo(() => {
    const l = list || [];
    return {
      freed: l.reduce((s, e) => s + ((e.kind === 'cleanup' || e.kind === 'uninstall') ? e.freed || 0 : 0), 0),
      cleanups: l.filter((e) => e.kind === 'cleanup').length,
      maint: l.filter((e) => e.kind === 'maintenance').length,
      apps: l.filter((e) => e.kind === 'uninstall').length,
    };
  }, [list]);
  // espaço liberado nos últimos 6 meses
  const months = useMemo(() => {
    const now = new Date();
    const arr = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1); return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(LOCALE, { month: 'short' }).replace('.', ''), value: 0 }; });
    for (const e of list || []) {
      if (e.kind !== 'cleanup' && e.kind !== 'uninstall') continue;
      const d = new Date(e.at); const m = arr.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (m) m.value += e.freed || 0;
    }
    return arr;
  }, [list]);
  const max = Math.max(1, ...months.map((m) => m.value));
  const days = useMemo(() => {
    const g = new Map<string, ActivityEntry[]>();
    for (const e of (list || []).filter((x) => matches(x, filter))) {
      const k = new Date(e.at).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      g.set(k, [...(g.get(k) || []), e]);
    }
    return [...g.entries()];
  }, [list, filter]);

  const clear = async () => {
    const r = await confirm({ title: tr("Apagar o histórico de atividades?"), message: tr("O CleanCode apaga apenas a lista de atividades. As limpezas e as mudanças que já foram feitas continuam como estão."), confirmLabel: tr("Apagar histórico"), danger: true });
    if (!r.ok) return;
    await cc.activityClear(); setList([]); toast(tr("Histórico apagado"));
  };

  return (
    <PageBody>
      <div className="mb-6 flex flex-wrap items-center gap-4 anim-page">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-[var(--on-accent)]" style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #ffffff))', boxShadow: '0 8px 28px color-mix(in srgb, var(--accent) 35%, transparent)' }}><ActivityIcon size={26} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold tracking-tight text-fg">{tr("Atividades")}</h1>
          <p className="text-sm text-muted">{tr("Aqui fica tudo o que o CleanCode já fez.")}</p>
        </div>
        {!!list?.length && <Button variant="ghost" icon={<Trash size={14} />} onClick={clear}>{tr("Apagar histórico")}</Button>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: tr("Espaço liberado"), value: fmtSize(stats.freed, units), icon: <HardDrive size={16} /> },
            { label: tr("Limpezas"), value: fmtNum(stats.cleanups), icon: <Sparkles size={16} /> },
            { label: tr("Manutenções"), value: fmtNum(stats.maint), icon: <Wrench size={16} /> },
            { label: tr("Apps removidos"), value: fmtNum(stats.apps), icon: <PackageX size={16} /> },
          ].map((k, i) => (
            <div key={k.label} className="rounded-xl border border-line bg-surface p-4 anim-page" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-center justify-between text-xs text-muted">{k.label}<span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">{k.icon}</span></div>
              <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-fg">{list ? k.value : '…'}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 anim-page" style={{ animationDelay: '120ms' }}>
          <div className="text-[13px] font-semibold text-fg">{tr("Espaço liberado por mês")}</div>
          <div className="mt-4 flex h-36 items-end gap-3">
            {months.map((m, i) => (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="text-[10px] tabular-nums text-faint">{m.value ? fmtSize(m.value, units, 0) : ''}</div>
                <div className="w-full max-w-12 rounded-t-md transition-[height] duration-700 ease-out" style={{ height: `${Math.max(3, (m.value / max) * 100)}px`, transitionDelay: `${i * 60}ms`, background: m.value ? 'linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 55%, transparent))' : 'var(--line)' }} />
                <div className="text-[11px] capitalize text-muted">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-3 mt-7 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-fg">{tr("Linha do tempo")}</h2>
        <div className="flex-1" />
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: tr("Tudo") }, { value: 'cleanup', label: tr("Limpeza") }, { value: 'maintenance', label: tr("Desempenho") }, { value: 'apps', label: tr("Apps") }, { value: 'files', label: tr("Arquivos") }]} />
      </div>
      {list && !days.length ? (
        <Empty icon={<ActivityIcon size={20} />} title={tr("Nada registrado ainda")} text={tr("As limpezas, manutenções e desinstalações aparecem aqui.")} />
      ) : days.map(([day, items], di) => (
        <div key={day} className="mb-5 anim-page" style={{ animationDelay: `${Math.min(di, 6) * 40}ms` }}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">{day}</div>
          <div className="relative ml-3 border-l border-line pl-6">
            {items.map((e, i) => {
              const d = describe(e, units);
              return (
                <div key={`${e.at}-${i}`} className="relative pb-4 last:pb-0">
                  <span className="absolute -left-[37px] top-0.5 flex h-[26px] w-[26px] items-center justify-center rounded-full border border-line bg-surface text-accent">{d.icon}</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13.5px] font-medium text-fg">{d.title}</span>
                    {d.ok ? <CheckCircle2 size={12} className="text-accent" /> : <XCircle size={12} className="text-warn" />}
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-faint">{new Date(e.at).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className={cx('truncate text-xs text-muted')}>{d.detail}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </PageBody>
  );
}
