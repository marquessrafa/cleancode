import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Checkbox, cx } from './ui';

export interface Column<T> {
  key: string; label: string; width?: number; align?: 'left' | 'right'; sortable?: boolean; flex?: boolean;
  render: (row: T, i: number) => React.ReactNode; sortValue?: (row: T) => any; title?: (row: T) => string;
}

/** Tabela virtualizada com ordenação, seleção múltipla (Ctrl/Shift) e menu de contexto. */
export function DataTable<T>({
  rows, columns, rowKey, rowHeight = 32, selectable, selected, onSelect, onRowDoubleClick, onRowContext,
  sort, onSort, empty, className, rowClass, onHeaderContext, activeKey, onRowClick,
}: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string | number; rowHeight?: number; selectable?: boolean;
  selected?: Set<string | number>; onSelect?: (s: Set<string | number>) => void; onRowDoubleClick?: (r: T) => void;
  onRowContext?: (e: React.MouseEvent, r: T) => void; sort?: { key: string; asc: boolean }; onSort?: (s: { key: string; asc: boolean }) => void;
  empty?: React.ReactNode; className?: string; rowClass?: (r: T) => string; onHeaderContext?: (e: React.MouseEvent) => void;
  activeKey?: string | number; onRowClick?: (r: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(400);
  const anchor = useRef<number>(-1);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el); setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const sorted = useMemo(() => {
    if (!sort || onSort === undefined) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    const copy = [...rows];
    copy.sort((a, b) => {
      const x = sv(a), y = sv(b);
      const r = typeof x === 'string' ? x.localeCompare(y, 'pt-BR', { numeric: true }) : (x ?? 0) - (y ?? 0);
      return sort.asc ? r : -r;
    });
    return copy;
  }, [rows, sort, columns, onSort]);

  const start = Math.max(0, Math.floor(scroll / rowHeight) - 8);
  const end = Math.min(sorted.length, Math.ceil((scroll + height) / rowHeight) + 8);
  const allSel = selectable && selected && sorted.length > 0 && sorted.every((r) => selected.has(rowKey(r)));
  const someSel = selectable && selected && selected.size > 0 && !allSel;

  const click = useCallback((e: React.MouseEvent, r: T, i: number) => {
    onRowClick?.(r);
    if (!selectable || !onSelect || !selected) return;
    const k = rowKey(r);
    const next = new Set(e.ctrlKey || e.metaKey ? selected : []);
    if (e.shiftKey && anchor.current >= 0) {
      const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)];
      for (let j = a; j <= b; j++) next.add(rowKey(sorted[j]));
    } else if (e.ctrlKey || e.metaKey) {
      next.has(k) ? next.delete(k) : next.add(k);
      anchor.current = i;
    } else { next.add(k); anchor.current = i; }
    onSelect(next);
  }, [selectable, onSelect, selected, rowKey, sorted, onRowClick]);

  const gridCols = (selectable ? '36px ' : '') + columns.map((c) => (c.flex ? `minmax(${c.width || 200}px, 1fr)` : `${c.width || 120}px`)).join(' ');

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-auto" ref={ref} onScroll={(e) => setScroll((e.target as HTMLDivElement).scrollTop)}>
        <div style={{ minWidth: 'fit-content' }}>
          <div
            className="sticky top-0 z-10 grid border-b border-line bg-surface-2/95 backdrop-blur text-xs font-medium text-muted"
            style={{ gridTemplateColumns: gridCols, height: 32 }}
            onContextMenu={onHeaderContext}
          >
            {selectable && (
              <div className="flex items-center justify-center">
                <Checkbox checked={!!allSel} indeterminate={!!someSel} onChange={(v) => onSelect?.(v ? new Set(sorted.map(rowKey)) : new Set())} />
              </div>
            )}
            {columns.map((c) => (
              <button
                key={c.key}
                disabled={!c.sortable || !onSort}
                onClick={() => onSort?.({ key: c.key, asc: sort?.key === c.key ? !sort.asc : c.align !== 'right' })}
                className={cx('flex items-center gap-1 truncate px-3 transition-colors', c.align === 'right' ? 'justify-end text-right' : 'text-left', c.sortable && onSort && 'hover:text-fg')}
              >
                {c.align === 'right' && sort?.key === c.key && (sort.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                <span className="truncate">{c.label}</span>
                {c.align !== 'right' && sort?.key === c.key && (sort.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
              </button>
            ))}
          </div>
          {sorted.length === 0 ? (
            <div className="sticky left-0 py-10 text-center text-xs text-muted">{empty || 'Nada para mostrar'}</div>
          ) : (
            <div style={{ height: sorted.length * rowHeight, position: 'relative' }}>
              {sorted.slice(start, end).map((r, k) => {
                const i = start + k;
                const key = rowKey(r);
                const sel = selected?.has(key);
                return (
                  <div
                    key={key}
                    onClick={(e) => click(e, r, i)}
                    onDoubleClick={() => onRowDoubleClick?.(r)}
                    onContextMenu={(e) => {
                      if (selectable && onSelect && selected && !selected.has(key)) { onSelect(new Set([key])); anchor.current = i; }
                      onRowContext?.(e, r);
                    }}
                    className={cx(
                      'absolute left-0 right-0 grid items-center border-b border-line/60 text-[13px] transition-colors duration-100',
                      sel ? 'bg-accent-soft' : activeKey === key ? 'bg-hover' : 'hover:bg-hover',
                      rowClass?.(r),
                    )}
                    style={{ top: i * rowHeight, height: rowHeight, gridTemplateColumns: gridCols }}
                  >
                    {selectable && (
                      <div className="flex items-center justify-center">
                        <Checkbox checked={!!sel} onChange={(v) => { const n = new Set(selected); v ? n.add(key) : n.delete(key); onSelect?.(n); anchor.current = i; }} />
                      </div>
                    )}
                    {columns.map((c) => (
                      <div key={c.key} title={c.title?.(r)} className={cx('truncate px-3', c.align === 'right' && 'text-right tnum')}>{c.render(r, i)}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
