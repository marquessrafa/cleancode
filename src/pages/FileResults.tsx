import React, { useState } from 'react';
import { File, Folder, Trash2, FolderInput, Download } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, Row } from '../lib/api';
import { fmtSize, fmtDate, fmtPct } from '../lib/format';
import { useFileActions, Target } from '../lib/actions';
import { DataTable, Column } from '../components/DataTable';
import { Button, Dropdown, openContextMenu } from '../components/ui';
import { t as tr, LOCALE } from '../lib/i18n';

/** Lista de arquivos/pastas com seleção, ações (Lixeira/mover) e exportação. */
export function FileResults({ rows, name, className, extraCols = [], onChanged, height }: { rows: Row[]; name: string; className?: string; extraCols?: Column<Row>[]; onChanged?: () => void; height?: number }) {
  const { settings, go, select } = useApp();
  const units = settings!.units, dec = settings!.decimals;
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [sort, setSort] = useState({ key: 'size', asc: false });
  const actions = useFileActions(() => { setSel(new Set()); onChanged?.(); });
  const t = (r: Row): Target => ({ id: r.id, path: r.path!, name: r.name, size: r.size, kind: r.kind });
  const selRows = rows.filter((r) => sel.has(r.id));
  const cols: Column<Row>[] = [
    { key: 'name', label: tr("Nome"), width: 220, sortable: true, sortValue: (r) => r.name.toLowerCase(), title: (r) => r.name, render: (r) => (
      <span className="flex items-center gap-2">{r.kind === 'dir' ? <Folder size={14} className="shrink-0 text-accent" /> : <File size={14} className="shrink-0 text-faint" />}<span className="truncate">{r.name}</span></span>
    ) },
    { key: 'path', label: tr("Local"), width: 320, flex: true, sortable: true, sortValue: (r) => r.path, title: (r) => r.path || '', render: (r) => <span className="text-muted">{r.dir || r.path}</span> },
    { key: 'size', label: tr("Tamanho"), width: 110, align: 'right', sortable: true, sortValue: (r) => r.size, render: (r) => fmtSize(r.size, units, dec) },
    ...extraCols,
    { key: 'mtime', label: tr("Modificado"), width: 110, sortable: true, sortValue: (r) => r.mtime, render: (r) => <span className="text-muted">{fmtDate(r.mtime, settings!.datesWithTime)}</span> },
    { key: 'atime', label: tr("Último acesso"), width: 110, sortable: true, sortValue: (r) => r.atime, render: (r) => <span className="text-muted">{fmtDate(r.atime, settings!.datesWithTime)}</span> },
  ];
  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="text-muted">{rows.length.toLocaleString(LOCALE)} {tr("itens ·")} {fmtSize(rows.reduce((s, r) => s + r.size, 0), units, dec)}</span>
        {sel.size > 0 && <span className="text-accent">· {sel.size} {tr("selecionado(s) (")}{fmtSize(selRows.reduce((s, r) => s + r.size, 0), units, dec)})</span>}
        <div className="flex-1" />
        {sel.size > 0 && (<>
          <Button size="sm" variant="outline" icon={<FolderInput size={13} />} onClick={() => actions.move(selRows.map(t))}>{tr("Mover…")}</Button>
          <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => actions.del(selRows.map(t))}>{tr("Excluir…")}</Button>
        </>)}
        <Dropdown align="right" trigger={<Button size="sm" variant="ghost" icon={<Download size={13} />}>{tr("Exportar")}</Button>} items={[
          { label: tr("Excel (.xlsx)"), onClick: () => cc.exportList(rows, 'xlsx', name) },
          { label: 'CSV', onClick: () => cc.exportList(rows, 'csv', name) },
        ]} />
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface" style={{ height: height || 480 }}>
        <DataTable
          className="h-full"
          rows={rows} columns={cols} rowKey={(r) => r.id} selectable selected={sel} onSelect={setSel} sort={sort} onSort={setSort}
          onRowDoubleClick={(r) => cc.open(r.path!)}
          onRowContext={(e, r) => {
            const rs = sel.has(r.id) && sel.size > 1 ? selRows : [r];
            openContextMenu(e, actions.menu(rs.map(t), r.kind === 'dir' ? [{ label: tr("Abrir no Explorador do CleanCode"), icon: <Folder />, onClick: () => { select(r.id); go('explorer'); } }] : []));
          }}
          empty={tr("Nenhum resultado")}
        />
      </div>
    </div>
  );
}

export { fmtPct };
