import React, { useMemo, useState } from 'react';
import { FileType2, X } from 'lucide-react';
import { useApp, useScanQuery } from '../lib/store';
import { cc, Row } from '../lib/api';
import { fmtSize, fmtNum, fmtPct, categoryOf, CATEGORIES, OTHER } from '../lib/format';
import { DataTable } from '../components/DataTable';
import { Button, Card, cx, PageHeader, Segmented } from '../components/ui';
import { BarList, Donut, PageBody, ScopeBar } from './common';
import { FileResults } from './FileResults';

interface Ext { ext: string; size: number; alloc: number; files: number }

export default function Types() {
  const { active, settings } = useApp();
  const units = settings!.units;
  const nodeId = active!.selected < 0 ? 0 : active!.selected;
  const { data } = useScanQuery<Ext[]>('extStats', [nodeId]);
  const [cat, setCat] = useState<string | null>(null);
  const [metric, setMetric] = useState<'size' | 'files'>('size');
  const [sort, setSort] = useState({ key: 'size', asc: false });
  const [drill, setDrill] = useState<{ ext: string; rows: Row[] } | null>(null);

  const cats = useMemo(() => {
    const m = new Map<string, { key: string; label: string; color: string; size: number; files: number }>();
    for (const e of data || []) {
      const c = categoryOf(e.ext);
      const r = m.get(c.key) || { key: c.key, label: c.label, color: c.color, size: 0, files: 0 };
      r.size += e.size; r.files += e.files; m.set(c.key, r);
    }
    return [...m.values()].sort((a, b) => b[metric] - a[metric]);
  }, [data, metric]);
  const total = cats.reduce((s, c) => s + c[metric], 0);
  const rows = (data || []).filter((e) => !cat || categoryOf(e.ext).key === cat);

  const openExt = async (ext: string) => {
    const r = await cc.scanQuery<Row[]>(active!.id, 'customSearch', { name: ext ? `*.${ext}` : '*', under: nodeId, limit: 2000 });
    setDrill({ ext, rows: ext ? r : r.filter((x) => !x.name.includes('.') || x.name.lastIndexOf('.') === 0) });
  };

  return (
    <PageBody>
      <PageHeader title="Tipos de arquivo" icon={<FileType2 size={18} />} description="Quanto espaço cada extensão e categoria ocupa. Clique numa extensão para ver os arquivos."
        actions={<Segmented value={metric} onChange={setMetric} options={[{ value: 'size', label: 'Por tamanho' }, { value: 'files', label: 'Por quantidade' }]} />} />
      <ScopeBar />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <Card title="Categorias">
          <div className="flex justify-center pb-4">
            <Donut data={cats.map((c) => ({ label: c.label, value: c[metric], color: c.color }))} size={220} thickness={34}
              center={<><div className="text-xs text-muted">Total</div><div className="text-base font-semibold">{metric === 'size' ? fmtSize(total, units) : fmtNum(total)}</div></>} />
          </div>
          <div className="space-y-0.5">
            {cats.map((c) => (
              <button key={c.key} onClick={() => setCat(cat === c.key ? null : c.key)} className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors', cat === c.key ? 'bg-accent-soft' : 'hover:bg-hover')}>
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
                <span className="flex-1 truncate text-left text-fg">{c.label}</span>
                <span className="text-muted tnum">{metric === 'size' ? fmtSize(c.size, units) : fmtNum(c.files)}</span>
                <span className="w-12 text-right text-faint tnum">{fmtPct(c[metric] / (total || 1))}</span>
              </button>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Maiores extensões" actions={cat && <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={() => setCat(null)}>{[...CATEGORIES, OTHER].find((c) => c.key === cat)?.label}</Button>}>
            <BarList items={rows.slice().sort((a, b) => b[metric] - a[metric]).slice(0, 12).map((e) => ({ key: e.ext, label: e.ext ? `.${e.ext}` : '(sem extensão)', value: e[metric], color: categoryOf(e.ext).color, sub: metric === 'size' ? `${fmtNum(e.files)} arq.` : fmtSize(e.size, units) }))}
              valueLabel={metric === 'files' ? (v) => fmtNum(v) : undefined} units={units} onClick={openExt} />
          </Card>
          <Card title={`Todas as extensões (${rows.length})`} pad={false}>
            <div className="h-[420px]">
              <DataTable className="h-full" rows={rows} rowKey={(r) => r.ext || '(none)'} sort={sort} onSort={setSort} onRowDoubleClick={(r) => openExt(r.ext)}
                columns={[
                  { key: 'ext', label: 'Extensão', width: 160, sortable: true, sortValue: (r) => r.ext, render: (r) => <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: categoryOf(r.ext).color }} />{r.ext ? `.${r.ext}` : '(sem extensão)'}</span> },
                  { key: 'cat', label: 'Categoria', width: 200, flex: true, sortable: true, sortValue: (r) => categoryOf(r.ext).label, render: (r) => <span className="text-muted">{categoryOf(r.ext).label}</span> },
                  { key: 'size', label: 'Tamanho', width: 110, align: 'right', sortable: true, sortValue: (r) => r.size, render: (r) => fmtSize(r.size, units) },
                  { key: 'alloc', label: 'Alocado', width: 110, align: 'right', sortable: true, sortValue: (r) => r.alloc, render: (r) => fmtSize(r.alloc, units) },
                  { key: 'files', label: 'Arquivos', width: 100, align: 'right', sortable: true, sortValue: (r) => r.files, render: (r) => fmtNum(r.files) },
                  { key: 'pct', label: '% do total', width: 90, align: 'right', sortable: true, sortValue: (r) => r.size, render: (r) => fmtPct(r.size / ((data || []).reduce((s, x) => s + x.size, 0) || 1)) },
                ]} />
            </div>
          </Card>
        </div>
      </div>
      {drill && (
        <Card className="mt-4 anim-fade" title={`Arquivos ${drill.ext ? '.' + drill.ext : 'sem extensão'} (até 2.000 maiores)`} actions={<Button size="sm" variant="ghost" icon={<X size={12} />} onClick={() => setDrill(null)}>Fechar</Button>}>
          <FileResults rows={drill.rows} name={`arquivos .${drill.ext}`} onChanged={() => openExt(drill.ext)} height={400} />
        </Card>
      )}
    </PageBody>
  );
}
