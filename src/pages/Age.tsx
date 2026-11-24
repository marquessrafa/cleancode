import React, { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useApp, useScanQuery } from '../lib/store';
import { cc, Row } from '../lib/api';
import { fmtSize, fmtNum, fmtPct } from '../lib/format';
import { Card, PageHeader, Segmented, Select } from '../components/ui';
import { BarList, PageBody, ScopeBar } from './common';
import { FileResults } from './FileResults';
import { t as tr } from '../lib/i18n';

const COLORS = ['#10b981', '#34d399', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444'];

export default function Age() {
  const { active, settings } = useApp();
  const units = settings!.units;
  const nodeId = active!.selected < 0 ? 0 : active!.selected;
  const [field, setField] = useState<'mtime' | 'atime' | 'ctime'>('mtime');
  const [metric, setMetric] = useState<'size' | 'files'>('size');
  const { data } = useScanQuery<{ buckets: any[]; years: any[] }>('ageStats', [nodeId, field]);
  const [olderThan, setOlder] = useState('365');
  const [minMB, setMinMB] = useState('50');
  const [old, setOld] = useState<Row[]>([]);
  const loadOld = () => {
    const t = Date.now() - +olderThan * 86400000;
    cc.scanQuery<Row[]>(active!.id, 'customSearch', { under: nodeId, minSize: +minMB * 1048576, ...(field === 'atime' ? { accBefore: t } : field === 'ctime' ? { createdBefore: t } : { modBefore: t }), limit: 1000 }).then(setOld);
  };
  useEffect(loadOld, [active!.id, nodeId, field, olderThan, minMB, active!.done]); // eslint-disable-line
  const total = (data?.buckets || []).reduce((s, b) => s + b[metric], 0);
  const maxYear = Math.max(1, ...(data?.years || []).map((y) => y[metric]));
  const fieldLabel = field === 'mtime' ? tr("última modificação") : field === 'atime' ? tr("último acesso") : tr("criação");

  return (
    <PageBody>
      <PageHeader title={tr("Idade dos arquivos")} icon={<CalendarClock size={18} />} description={tr("Mostra quanto espaço os arquivos ocupam de acordo com a data de cada um. Assim, você encontra arquivos antigos que pode guardar em outro lugar ou apagar.")}
        actions={<>
          <Segmented value={field} onChange={setField} options={[{ value: 'mtime', label: tr("Modificação") }, { value: 'atime', label: tr("Acesso") }, { value: 'ctime', label: tr("Criação") }]} />
          <Segmented value={metric} onChange={setMetric} options={[{ value: 'size', label: tr("Tamanho") }, { value: 'files', label: tr("Quantidade") }]} />
        </>} />
      <ScopeBar />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={tr("Por faixa de idade ({0})", fieldLabel)}>
          <div className="mb-4 flex h-3 overflow-hidden rounded-full">
            {(data?.buckets || []).map((b, i) => <div key={b.key} title={`${b.label}: ${fmtPct(b[metric] / (total || 1))}`} style={{ width: `${(b[metric] / (total || 1)) * 100}%`, background: COLORS[i] }} className="transition-[width] duration-500" />)}
          </div>
          <BarList items={(data?.buckets || []).map((b, i) => ({ key: b.key, label: b.label, value: b[metric], color: COLORS[i], sub: metric === 'size' ? `${fmtNum(b.files)} arq.` : fmtSize(b.size, units) }))}
            valueLabel={metric === 'files' ? (v) => fmtNum(v) : undefined} units={units} />
        </Card>
        <Card title={tr("Por ano")}>
          <div className="flex h-[260px] items-end gap-1 overflow-x-auto pb-6">
            {(data?.years || []).filter((y) => y.year > 1980).map((y) => (
              <div key={y.year} className="group relative flex min-w-[22px] flex-1 flex-col items-center justify-end" style={{ height: '100%' }}>
                <div className="w-full rounded-t bg-accent/80 transition-all duration-500 group-hover:bg-accent" style={{ height: `${(y[metric] / maxYear) * 100}%`, minHeight: 2 }} title={tr("{0}: {1} · {2} arquivos", y.year, fmtSize(y.size, units), fmtNum(y.files))} />
                <span className="absolute -bottom-5 text-[10px] text-muted">{String(y.year).slice(2)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card className="mt-4" title={tr("Arquivos antigos e grandes")} actions={<>
        <span className="text-xs text-muted">{tr("sem")} {fieldLabel} {tr("há mais de")}</span>
        <Select className="w-32" value={olderThan} onChange={setOlder} options={[{ value: '90', label: tr("3 meses") }, { value: '180', label: tr("6 meses") }, { value: '365', label: tr("1 ano") }, { value: '730', label: tr("2 anos") }, { value: '1825', label: tr("5 anos") }]} />
        <span className="text-xs text-muted">{tr("e maiores que")}</span>
        <Select className="w-28" value={minMB} onChange={setMinMB} options={[{ value: '1', label: tr("1 MB") }, { value: '10', label: tr("10 MB") }, { value: '50', label: tr("50 MB") }, { value: '100', label: tr("100 MB") }, { value: '500', label: tr("500 MB") }, { value: '1024', label: tr("1 GB") }]} />
      </>}>
        <FileResults rows={old} name="arquivos antigos" onChanged={loadOld} height={380} />
      </Card>
    </PageBody>
  );
}
