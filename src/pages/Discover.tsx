import React, { useMemo, useState } from 'react';
import { Radar, RefreshCw, Trash2, FolderOpen, HelpCircle, Clock, HardDrive, Info } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, AppEntry, isMac, OS_NAME } from '../lib/api';
import { fmtSize, fmtDate, fmtRelative, fmtNum } from '../lib/format';
import { Badge, Button, Card, Checkbox, cx, Empty, PageHeader, Segmented, Stat } from '../components/ui';
import { PageBody } from './common';
import { AppIcon, sourceLabel, useApps, useUninstall } from './appsShared';

export default function Discover() {
  const { settings, setSettings } = useApp();
  const units = settings!.units;
  const months = settings!.staleMonths;
  const { apps, loading, reload, remove } = useApps();
  const [tab, setTab] = useState<'stale' | 'unknown'>('stale');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<'size' | 'age'>('size');
  const un = useUninstall((ids) => { remove(ids); setSel(new Set()); });

  const cutoff = Date.now() - months * 30.4 * 86400000;
  const { stale, unknown } = useMemo(() => {
    const s: AppEntry[] = [], u: AppEntry[] = [];
    for (const a of apps || []) {
      if (!a.canUninstall || a.background || a.orphan) continue; // órfãos são tratados no Desinstalador
      if (a.lastUsed) { if (a.lastUsed < cutoff) s.push(a); }
      else if (a.installDate && a.installDate < cutoff) u.push(a);
    }
    const by = (x: AppEntry, y: AppEntry) => (order === 'size' ? (y.size || 0) - (x.size || 0) : (x.lastUsed || x.installDate || 0) - (y.lastUsed || y.installDate || 0));
    return { stale: s.sort(by), unknown: u.sort(by) };
  }, [apps, cutoff, order]);
  const list = tab === 'stale' ? stale : unknown;
  const sum = (l: AppEntry[]) => l.reduce((s, a) => s + (a.size || 0), 0);
  const selRows = list.filter((a) => sel.has(a.id));

  return (
    <PageBody>
      <PageHeader title="Descoberta" icon={<Radar size={18} />}
        description={isMac
          ? 'Apps que você não abre há meses, com o espaço que ocupam. O último uso vem do Spotlight (data da última abertura de cada app).'
          : 'Programas que você não abre há meses, com o espaço que ocupam. O último uso vem do histórico de execução do Windows (UserAssist) e do Prefetch, que exige administrador.'}
        actions={<Button icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} disabled={loading} onClick={reload}>Recarregar</Button>} />
      {un.panel}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <Clock size={16} className="text-accent" />
        <span className="text-[13px]">Considerar sem uso há mais de</span>
        <Segmented value={String(months)} onChange={(v) => setSettings({ staleMonths: +v })} options={['3', '6', '12', '24'].map((m) => ({ value: m, label: `${m} meses` }))} />
        <div className="flex-1" />
        <span className="text-xs text-muted">Ordenar:</span>
        <Segmented size="sm" value={order} onChange={setOrder} options={[{ value: 'size', label: 'Maior' }, { value: 'age', label: 'Mais antigo' }]} />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label={`Sem uso há ${months}+ meses`} value={apps ? fmtNum(stale.length) : '…'} sub={`${fmtSize(sum(stale), units)} recuperáveis`} icon={<Clock size={16} />} tone="warn" />
        <Stat label="Sem registro de uso" value={apps ? fmtNum(unknown.length) : '…'} sub={`instalados antes de ${fmtDate(cutoff)} · ${fmtSize(sum(unknown), units)}`} icon={<HelpCircle size={16} />} />
        <Stat label="Total analisado" value={apps ? fmtNum(apps.length) : '…'} sub="programas Win32 e Store" icon={<HardDrive size={16} />} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={tab} onChange={(v) => { setTab(v); setSel(new Set()); }} options={[
          { value: 'stale', label: <>Sem uso recente <Badge tone="warn">{stale.length}</Badge></> },
          { value: 'unknown', label: <>Sem registro de uso <Badge>{unknown.length}</Badge></> },
        ]} />
        <div className="flex-1" />
        {list.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSel(sel.size === list.length ? new Set() : new Set(list.map((a) => a.id)))}>{sel.size === list.length ? 'Desmarcar todos' : 'Selecionar todos'}</Button>}
        <Button size="sm" variant="danger" icon={<Trash2 size={13} />} disabled={!sel.size || un.busy} onClick={() => un.start(selRows)}>Desinstalar {sel.size || ''} selecionado(s)</Button>
      </div>
      {tab === 'unknown' && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          <Info size={14} className="mt-px shrink-0 text-info" />
          O {OS_NAME} não registrou nenhuma execução destes programas. Isso pode ser falta de uso de verdade, ou programas que rodam só em segundo plano (drivers, runtimes, serviços). Revise antes de remover.
        </div>
      )}

      {loading && !apps ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-[78px] rounded-lg" />)}</div>
      ) : list.length === 0 ? (
        <Card><Empty icon={<Radar size={20} />} title="Nada por aqui" text={`Nenhum programa ${tab === 'stale' ? `sem uso há mais de ${months} meses` : 'sem registro de uso'}.`} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          {list.map((a, i) => (
            <div key={a.id} onClick={() => setSel((s) => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}
              className={cx('group flex cursor-pointer items-center gap-3 rounded-lg border bg-surface p-3 transition-all duration-150 hover:border-line-strong', sel.has(a.id) ? 'border-accent ring-1 ring-accent/30' : 'border-line')}
              style={{ animation: `fade-up .25s ${Math.min(i, 20) * 25}ms both` }}>
              <Checkbox checked={sel.has(a.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })} />
              <AppIcon app={a} size={38} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-fg">{a.name}</div>
                <div className="truncate text-xs text-muted">{a.publisher || sourceLabel(a)}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-faint">
                  <span title={a.lastUsedSource ? `${fmtDate(a.lastUsed, true)} · fonte: ${a.lastUsedSource}` : ''}>Último uso: <b className={cx('font-medium', a.lastUsed ? 'text-warn' : 'text-muted')}>{fmtRelative(a.lastUsed)}</b></span>
                  <span>Instalado: {fmtDate(a.installDate)}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-fg tnum">{a.size ? fmtSize(a.size, units) : '—'}</div>
                <div className="mt-1 flex justify-end gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                  {a.location && <Button size="sm" variant="ghost" title="Abrir pasta" onClick={(e) => { e.stopPropagation(); cc.openLocation(a.location!); }}><FolderOpen size={13} /></Button>}
                  <Button size="sm" variant="outline" disabled={un.busy} onClick={(e) => { e.stopPropagation(); un.start([a]); }}>Desinstalar</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageBody>
  );
}
