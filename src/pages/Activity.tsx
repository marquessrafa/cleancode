// Atividades: tudo o que o CleanCode fez no computador (limpezas, manutenções, itens de início,
// desinstalações e exclusões), com o espaço liberado ao longo do tempo.
import React, { useEffect, useMemo, useState } from 'react';
import { Activity as ActivityIcon, ShieldCheck, Sparkles, Wrench, Power, PackageX, Trash2, HardDrive, Trash, CheckCircle2, XCircle } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, ActivityEntry } from '../lib/api';
import { fmtSize, fmtNum } from '../lib/format';
import { Button, cx, Empty, Segmented } from '../components/ui';
import { PageBody } from './common';

type Filter = 'all' | 'cleanup' | 'maintenance' | 'apps' | 'files';
const TASK_NAMES: Record<string, string> = {
  'free-ram': 'liberar memória', 'flush-dns': 'cache de DNS', 'thin-snapshots': 'instantâneos locais', periodic: 'scripts de manutenção',
  'reindex-spotlight': 'reindexar Spotlight', 'reset-permissions': 'permissões', optimize: 'otimizar unidades', sfc: 'SFC', dism: 'DISM',
};

function describe(e: ActivityEntry, units: string): { icon: React.ReactNode; title: string; detail: string; ok: boolean } {
  switch (e.kind) {
    case 'cleanup': return { icon: <Sparkles size={15} />, title: `Limpeza: ${fmtSize(e.freed || 0, units)} liberados`, detail: `${fmtNum(e.removed || 0)} itens · ${e.mode === 'delete' ? 'apagados definitivamente' : 'enviados para a Lixeira'}${e.failed ? ` · ${e.failed} não removidos` : ''}`, ok: !e.failed };
    case 'maintenance': return { icon: <Wrench size={15} />, title: 'Manutenção', detail: (e.tasks || []).map((t) => TASK_NAMES[t] || t).join(', ') + (e.failed ? ` · ${e.failed} falharam` : '') || 'nenhuma tarefa concluída', ok: !e.failed };
    case 'startup': return { icon: <Power size={15} />, title: `${e.name}: ${e.enabled ? 'ativado' : 'desativado'} no início`, detail: 'Itens de início', ok: true };
    case 'uninstall': return { icon: <PackageX size={15} />, title: `${e.name} desinstalado`, detail: e.freed ? `${fmtSize(e.freed, units)} liberados` : 'Desinstalador', ok: true };
    case 'protection': return { icon: <ShieldCheck size={15} />, title: e.name === 'quickScan' ? 'Verificação rápida de vírus' : 'Verificação de proteção', detail: e.name === 'quickScan' ? (e.failed ? 'Não concluída' : 'Concluída') : `${fmtNum(e.removed || 0)} itens analisados · ${e.failed ? `${e.failed} pontos de atenção` : 'nenhum ponto de atenção'}`, ok: !e.failed };
    case 'delete': return { icon: <Trash2 size={15} />, title: `${fmtNum(e.removed || 0)} ${e.removed === 1 ? 'item' : 'itens'} ${e.mode === 'delete' ? 'apagados definitivamente' : 'enviados para a Lixeira'}`, detail: (e.sample || []).map((p) => p.split(/[\\/]/).pop()).join(', ') + ((e.removed || 0) > (e.sample?.length || 0) ? '…' : ''), ok: true };
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
    const arr = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1); return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), value: 0 }; });
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
      const k = new Date(e.at).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      g.set(k, [...(g.get(k) || []), e]);
    }
    return [...g.entries()];
  }, [list, filter]);

  const clear = async () => {
    const r = await confirm({ title: 'Apagar o histórico de atividades?', message: 'O CleanCode apaga apenas a lista de atividades. As limpezas e as mudanças que já foram feitas continuam como estão.', confirmLabel: 'Apagar histórico', danger: true });
    if (!r.ok) return;
    await cc.activityClear(); setList([]); toast('Histórico apagado');
  };

  return (
    <PageBody>
      <div className="mb-6 flex flex-wrap items-center gap-4 anim-page">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-white" style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #ffffff))', boxShadow: '0 8px 28px color-mix(in srgb, var(--accent) 35%, transparent)' }}><ActivityIcon size={26} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold tracking-tight text-fg">Atividades</h1>
          <p className="text-sm text-muted">Esta tela mostra tudo o que o CleanCode já fez, como limpezas, manutenções, mudanças nos itens de início, desinstalações e exclusões.</p>
        </div>
        {!!list?.length && <Button variant="ghost" icon={<Trash size={14} />} onClick={clear}>Apagar histórico</Button>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Espaço liberado', value: fmtSize(stats.freed, units), icon: <HardDrive size={16} /> },
            { label: 'Limpezas', value: fmtNum(stats.cleanups), icon: <Sparkles size={16} /> },
            { label: 'Manutenções', value: fmtNum(stats.maint), icon: <Wrench size={16} /> },
            { label: 'Apps removidos', value: fmtNum(stats.apps), icon: <PackageX size={16} /> },
          ].map((k, i) => (
            <div key={k.label} className="rounded-xl border border-line bg-surface p-4 anim-page" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-center justify-between text-xs text-muted">{k.label}<span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">{k.icon}</span></div>
              <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-fg">{list ? k.value : '…'}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 anim-page" style={{ animationDelay: '120ms' }}>
          <div className="text-[13px] font-semibold text-fg">Espaço liberado por mês</div>
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
        <h2 className="text-sm font-semibold text-fg">Linha do tempo</h2>
        <div className="flex-1" />
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Tudo' }, { value: 'cleanup', label: 'Limpeza' }, { value: 'maintenance', label: 'Desempenho' }, { value: 'apps', label: 'Apps' }, { value: 'files', label: 'Arquivos' }]} />
      </div>
      {list && !days.length ? (
        <Empty icon={<ActivityIcon size={20} />} title="Nada registrado ainda" text="Quando o CleanCode fizer uma limpeza, uma manutenção ou uma desinstalação, a ação vai aparecer aqui." />
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
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-faint">{new Date(e.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
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
