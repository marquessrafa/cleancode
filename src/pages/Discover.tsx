import React, { useMemo, useState } from 'react';
import { Radar, RefreshCw, Trash2, FolderOpen, HelpCircle, Clock, HardDrive, Info } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, AppEntry, isMac, OS_NAME } from '../lib/api';
import { fmtSize, fmtDate, fmtRelative, fmtNum } from '../lib/format';
import { Badge, Button, Card, Checkbox, cx, Empty, PageHeader, Segmented, Stat } from '../components/ui';
import { PageBody } from './common';
import { AppIcon, sourceLabel, useApps, useUninstall } from './appsShared';
import { t } from '../lib/i18n';

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
      <PageHeader title={t("Descoberta")} icon={<Radar size={18} />}
        description={isMac
          ? t("Mostra os apps que você não abre há meses e o espaço que eles ocupam. O CleanCode descobre o último uso de cada app pelo Spotlight, que guarda a data da última vez que o app foi aberto.")
          : t("Mostra os programas que você não abre há meses e o espaço que eles ocupam. O CleanCode descobre o último uso pelo histórico de execução do Windows (UserAssist) e pelo Prefetch. Para ler o Prefetch, o CleanCode precisa rodar como administrador.")}
        actions={<Button icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} disabled={loading} onClick={reload}>{t("Recarregar")}</Button>} />
      {un.panel}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <Clock size={16} className="text-accent" />
        <span className="text-[13px]">{t("Considerar sem uso há mais de")}</span>
        <Segmented value={String(months)} onChange={(v) => setSettings({ staleMonths: +v })} options={['3', '6', '12', '24'].map((m) => ({ value: m, label: `${m} meses` }))} />
        <div className="flex-1" />
        <span className="text-xs text-muted">{t("Ordenar:")}</span>
        <Segmented size="sm" value={order} onChange={setOrder} options={[{ value: 'size', label: t("Maior") }, { value: 'age', label: t("Mais antigo") }]} />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label={t("Sem uso há {0}+ meses", months)} value={apps ? fmtNum(stale.length) : '…'} sub={t("{0} recuperáveis", fmtSize(sum(stale), units))} icon={<Clock size={16} />} tone="warn" />
        <Stat label={t("Sem registro de uso")} value={apps ? fmtNum(unknown.length) : '…'} sub={t("Instalados antes de {0}, somando {1}", fmtDate(cutoff), fmtSize(sum(unknown), units))} icon={<HelpCircle size={16} />} />
        <Stat label={t("Total analisado")} value={apps ? fmtNum(apps.length) : '…'} sub={t("programas Win32 e Store")} icon={<HardDrive size={16} />} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={tab} onChange={(v) => { setTab(v); setSel(new Set()); }} options={[
          { value: 'stale', label: <>{t("Sem uso recente")} <Badge tone="warn">{stale.length}</Badge></> },
          { value: 'unknown', label: <>{t("Sem registro de uso")} <Badge>{unknown.length}</Badge></> },
        ]} />
        <div className="flex-1" />
        {list.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSel(sel.size === list.length ? new Set() : new Set(list.map((a) => a.id)))}>{sel.size === list.length ? t("Desmarcar todos") : t("Selecionar todos")}</Button>}
        <Button size="sm" variant="danger" icon={<Trash2 size={13} />} disabled={!sel.size || un.busy} onClick={() => un.start(selRows)}>{t("Desinstalar")} {sel.size || ''} {t("selecionado(s)")}</Button>
      </div>
      {tab === 'unknown' && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          <Info size={14} className="mt-px shrink-0 text-info" />
          O {OS_NAME} {t("não registrou nenhuma execução destes programas. Isso pode significar que você realmente não usa esses programas, ou que eles só rodam em segundo plano, como drivers, bibliotecas e serviços. Revise a lista antes de remover.")}
        </div>
      )}

      {loading && !apps ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-[78px] rounded-lg" />)}</div>
      ) : list.length === 0 ? (
        <Card><Empty icon={<Radar size={20} />} title={t("Nada por aqui")} text={tab === 'stale' ? t("Nenhum programa está sem uso há mais de {0} meses.", months) : t("Nenhum programa está sem registro de uso.")} /></Card>
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
                  <span title={a.lastUsedSource ? t("{0} · fonte: {1}", fmtDate(a.lastUsed, true), a.lastUsedSource) : ''}>{t("Último uso:")} <b className={cx('font-medium', a.lastUsed ? 'text-warn' : 'text-muted')}>{fmtRelative(a.lastUsed)}</b></span>
                  <span>{t("Instalado:")} {fmtDate(a.installDate)}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-fg tnum">{a.size ? fmtSize(a.size, units) : '—'}</div>
                <div className="mt-1 flex justify-end gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                  {a.location && <Button size="sm" variant="ghost" title={t("Abrir pasta")} onClick={(e) => { e.stopPropagation(); cc.openLocation(a.location!); }}><FolderOpen size={13} /></Button>}
                  <Button size="sm" variant="outline" disabled={un.busy} onClick={(e) => { e.stopPropagation(); un.start([a]); }}>{t("Desinstalar")}</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageBody>
  );
}
