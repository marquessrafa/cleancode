import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight, Folder, FolderOpen, File, RefreshCw, Square, ArrowUp, ArrowLeft, ArrowRight, ListTree, Filter, FilterX,
  Download, Search, Columns3, AlertTriangle, Link2, FolderPlus, ExternalLink, Loader2, Plus, Trash2, X, Save, Printer,
  FileSpreadsheet, FileText, FileCode, FileDown,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, Row, FILE_MANAGER, joinPath, isMac } from '../lib/api';
import { fmtSize, fmtNum, fmtPct, fmtDate, fmtDuration, attrString, typeLabel, extOf } from '../lib/format';
import { useFileActions, Target } from '../lib/actions';
import { DataTable, Column } from '../components/DataTable';
import { Button, Checkbox, cx, Dropdown, IconButton, Input, Modal, openContextMenu, Segmented, Select, Spinner, Toggle } from '../components/ui';

const ROW_H = 28;

export const ALL_COLUMNS: { key: string; label: string }[] = [
  { key: 'name', label: 'Nome' }, { key: 'path', label: 'Caminho completo' }, { key: 'size', label: 'Tamanho' },
  { key: 'alloc', label: 'Alocado' }, { key: 'wasted', label: 'Desperdiçado (alocado − tamanho)' }, { key: 'files', label: 'Arquivos' },
  { key: 'dirs', label: 'Pastas' }, { key: 'pct', label: '% do pai' }, { key: 'mtime', label: 'Última modificação' },
  { key: 'atime', label: 'Último acesso' }, { key: 'ctime', label: 'Data de criação' }, { key: 'attr', label: 'Atributos' },
  { key: 'type', label: 'Tipo' }, { key: 'owner', label: 'Proprietário' }, { key: 'avg', label: 'Tamanho médio de arquivo' },
  { key: 'compress', label: 'Compactação (%)' }, { key: 'optical', label: 'Tamanho em mídia óptica (ISO)' },
  { key: 'pathLen', label: 'Comprimento do caminho' }, { key: 'level', label: 'Nível' }, { key: 'parentPath', label: 'Pasta' },
  { key: 'prev', label: 'Tamanho anterior (comparação)' }, { key: 'delta', label: 'Variação (comparação)' },
];

/** histórico de pastas do Explorador por varredura (id) */
const dirHistory = new Map<number, { stack: number[]; pos: number }>();

export default function Explorer() {
  const { active, settings, setSettings, select, stopScan, refreshScan, toast, tick, bump, startScan, registerNav } = useApp();
  const units = settings!.units, dec = settings!.decimals, mode = settings!.displayMode;
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));
  const [tree, setTree] = useState<Row[]>([]);
  const [details, setDetails] = useState<Row[]>([]);
  const [selPath, setSelPath] = useState('');
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [sort, setSort] = useState({ key: 'size', asc: false });
  const [treeW, setTreeW] = useState(440);
  const [filterOpen, setFilterOpen] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState<string | null>(null);
  const [newFolderFor, setNewFolderFor] = useState<{ id: number; path: string } | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [nav, setNav] = useState<{ stack: number[]; pos: number }>(() => dirHistory.get(active!.id) || { stack: [0], pos: 0 });
  const treeRef = useRef<HTMLDivElement>(null);
  const [treeScroll, setTreeScroll] = useState(0);
  const [treeH, setTreeH] = useState(600);
  const scanId = active!.id;
  const selected = active!.selected;
  const rootSize = tree[0]?.size || 1;

  const opts = { sortBy: mode === 'pct' ? 'size' : mode, showFiles: settings!.showFilesInTree, hideEmpty: settings!.hideEmpty };

  // árvore
  useEffect(() => {
    let alive = true;
    cc.scanQuery(scanId, 'flatTree', [...expanded], opts).then((r: any) => alive && setTree(r.rows));
    cc.scanQuery(scanId, 'summary').then((s) => alive && setSummary(s));
    return () => { alive = false; };
  }, [scanId, expanded, tick, mode, settings!.showFilesInTree, settings!.hideEmpty]); // eslint-disable-line

  // detalhes da seleção
  useEffect(() => {
    let alive = true;
    (async () => {
      let dirId = selected;
      if (selected < 0) { const f: any = await cc.scanQuery(scanId, 'nodeInfo', selected); dirId = f.crumbs[f.crumbs.length - 1].id; } // arquivo: mostra a pasta dele
      const [rows, n]: any = await Promise.all([
        cc.scanQuery(scanId, 'children', dirId, { sortBy: 'size', hideEmpty: settings!.hideEmpty }),
        cc.scanQuery(scanId, 'nodeInfo', dirId),
      ]);
      if (alive) { setDetails(rows); setSelPath(n.path); }
    })().catch(() => {});
    return () => { alive = false; };
  }, [scanId, selected, tick, settings!.hideEmpty]); // eslint-disable-line

  useEffect(() => {
    const el = treeRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setTreeH(el.clientHeight));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const reloadAll = () => bump();
  const actions = useFileActions(reloadAll);

  const goTo = useCallback(async (id: number, push = true) => {
    let n: any = await cc.scanQuery(scanId, 'nodeInfo', id);
    if (!n) return;
    if (id < 0) {
      // arquivo: abre a pasta que o contém
      const dir = n.crumbs[n.crumbs.length - 1].id;
      if (!settings!.showFilesInTree) { id = dir; n = await cc.scanQuery(scanId, 'nodeInfo', dir); }
      else n = { ...n, crumbs: [...n.crumbs, { id, name: n.name }] };
    }
    setExpanded((e) => { const x = new Set(e); for (const c of n.crumbs.slice(0, -1)) x.add(c.id); return x; });
    select(id, n.path);
    if (push) setNav((s) => { const stack = [...s.stack.slice(0, s.pos + 1), id]; return { stack, pos: stack.length - 1 }; });
    // rola até a linha
    setTimeout(() => {
      setTree((t) => {
        const idx = t.findIndex((r) => r.id === id);
        const el = treeRef.current;
        if (idx >= 0 && el && (idx * ROW_H < el.scrollTop || idx * ROW_H > el.scrollTop + el.clientHeight - ROW_H)) el.scrollTop = idx * ROW_H - el.clientHeight / 3;
        return t;
      });
    }, 120);
  }, [scanId, select]);
  // voltar/avançar entre pastas; os botões laterais do mouse, ⌘[ ⌘] e o gesto usam isto antes de trocar de tela
  const navRef = useRef(nav);
  navRef.current = nav;
  // o histórico de pastas fica guardado por varredura: sobrevive à troca de tela e de aba
  const navScan = useRef(scanId);
  useEffect(() => {
    if (navScan.current !== scanId) { navScan.current = scanId; setNav(dirHistory.get(scanId) || { stack: [0], pos: 0 }); return; }
    dirHistory.set(scanId, nav);
  }, [scanId, nav]);
  const moveDir = useCallback((d: number) => {
    const s = navRef.current, pos = s.pos + d;
    if (pos < 0 || pos >= s.stack.length) return;
    const next = { ...s, pos };
    navRef.current = next; // dois cliques rápidos não repetem a mesma pasta
    setNav(next);
    goTo(s.stack[pos], false);
  }, [goTo]);
  const navBackDir = useCallback(() => moveDir(-1), [moveDir]);
  const navForwardDir = useCallback(() => moveDir(1), [moveDir]);
  useEffect(() => { registerNav('explorer', { canBack: nav.pos > 0, canForward: nav.pos < nav.stack.length - 1, back: navBackDir, forward: navForwardDir }); }, [nav, navBackDir, navForwardDir, registerNav]);
  useEffect(() => () => registerNav('explorer', null), [registerNav]);

  const toggle = (id: number) => setExpanded((e) => { const x = new Set(e); x.has(id) ? x.delete(id) : x.add(id); return x; });
  const expandTo = async (depth: number) => {
    if (depth === 0) { setExpanded(new Set([0])); return; }
    const ids: number[] = await cc.scanQuery(scanId, 'idsToDepth', 0, depth);
    setExpanded(new Set([0, ...ids]));
  };
  const expandBelow = async (id: number) => {
    const ids: number[] = await cc.scanQuery(scanId, 'idsToDepth', id, 99, 5000);
    setExpanded((e) => new Set([...e, ...ids]));
  };

  const rowPath = (r: Row, parent: string) => (r.path ? r.path : joinPath(parent, r.name));
  const treePath = async (r: Row) => (await cc.scanQuery<string>(scanId, 'pathOf', r.id));
  const toTarget = (r: Row, path: string): Target => ({ id: r.id, path, name: r.name, size: r.size, kind: r.kind });

  const treeMenu = async (e: React.MouseEvent, r: Row) => {
    e.persist?.();
    const path = await treePath(r);
    openContextMenu(e, actions.menu([toTarget(r, path)], r.kind === 'dir' ? [
      { separator: true },
      { label: 'Atualizar esta pasta', icon: <RefreshCw />, onClick: async () => { const ok = await cc.scanQuery(scanId, 'rescan', r.id); ok ? toast('Atualizando pasta…', 'info') : toast('Aguarde a varredura atual terminar', 'error'); } },
      { label: 'Expandir tudo abaixo', icon: <ListTree />, onClick: () => expandBelow(r.id) },
      { label: 'Nova pasta…', icon: <FolderPlus />, onClick: () => setNewFolderFor({ id: r.id, path }) },
      { label: 'Analisar em nova aba', icon: <Plus />, onClick: () => startScan(path) },
    ] : []));
  };

  // teclado na árvore
  const onTreeKey = (e: React.KeyboardEvent) => {
    const idx = tree.findIndex((r) => r.id === selected);
    if (idx < 0) return;
    const r = tree[idx];
    if (e.key === 'ArrowDown' && idx < tree.length - 1) { e.preventDefault(); goTo(tree[idx + 1].id); }
    else if (e.key === 'ArrowUp' && idx > 0) { e.preventDefault(); goTo(tree[idx - 1].id); }
    else if (e.key === 'ArrowRight' && r.hasChildren && !r.expanded) toggle(r.id);
    else if (e.key === 'ArrowLeft') {
      if (r.expanded) toggle(r.id);
      else { for (let j = idx - 1; j >= 0; j--) if (tree[j].depth < r.depth) { goTo(tree[j].id); break; } }
    } else if (e.key === 'Delete') treePath(r).then((p) => actions.del([toTarget(r, p)]));
  };

  const valueOf = (r: Row) =>
    mode === 'alloc' ? fmtSize(r.alloc, units, dec) : mode === 'files' ? fmtNum(r.files) : mode === 'pct' ? fmtPct(r.pct) : fmtSize(r.size, units, dec);

  const start = Math.max(0, Math.floor(treeScroll / ROW_H) - 10);
  const end = Math.min(tree.length, Math.ceil((treeScroll + treeH) / ROW_H) + 10);
  const p = active!.progress;
  const comparing = !!summary?.comparing;

  // colunas dos detalhes
  const columns = useMemo<Column<Row>[]>(() => {
    const all: Record<string, Column<Row>> = {
      name: { key: 'name', label: 'Nome', width: 260, flex: true, sortable: true, sortValue: (r) => r.name.toLowerCase(), title: (r) => r.name,
        render: (r) => (
          <span className={cx('flex items-center gap-2', settings!.compressedBlue && r.attr & 0x800 && 'text-info', settings!.boldLarge && r.size > rootSize * 0.15 && 'font-semibold')}>
            {r.kind === 'dir' ? <Folder size={15} className="shrink-0 text-accent" /> : <File size={15} className="shrink-0 text-faint" />}
            <span className="truncate">{r.name}</span>
            {r.err ? <AlertTriangle size={12} className="text-warn" /> : null}
          </span>
        ) },
      path: { key: 'path', label: 'Caminho completo', width: 320, sortable: true, sortValue: (r) => r.name, render: (r) => <span className="text-muted">{rowPath(r, selPath)}</span>, title: (r) => rowPath(r, selPath) },
      parentPath: { key: 'parentPath', label: 'Pasta', width: 260, render: () => <span className="text-muted">{selPath}</span> },
      size: { key: 'size', label: 'Tamanho', width: 110, align: 'right', sortable: true, sortValue: (r) => r.size, render: (r) => fmtSize(r.size, units, dec) },
      alloc: { key: 'alloc', label: 'Alocado', width: 110, align: 'right', sortable: true, sortValue: (r) => r.alloc, render: (r) => fmtSize(r.alloc, units, dec) },
      wasted: { key: 'wasted', label: 'Desperdiçado', width: 110, align: 'right', sortable: true, sortValue: (r) => r.alloc - r.size, render: (r) => fmtSize(Math.max(0, r.alloc - r.size), units, dec) },
      files: { key: 'files', label: 'Arquivos', width: 90, align: 'right', sortable: true, sortValue: (r) => r.files, render: (r) => (r.kind === 'dir' ? fmtNum(r.files) : '') },
      dirs: { key: 'dirs', label: 'Pastas', width: 80, align: 'right', sortable: true, sortValue: (r) => r.dirs, render: (r) => (r.kind === 'dir' ? fmtNum(r.dirs) : '') },
      pct: { key: 'pct', label: '% do pai', width: 130, sortable: true, sortValue: (r) => r.pct, render: (r) => (
        <span className="flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${r.pct * 100}%` }} /></span><span className="w-11 text-right text-xs text-muted tnum">{fmtPct(r.pct)}</span></span>
      ) },
      mtime: { key: 'mtime', label: 'Modificado', width: 130, sortable: true, sortValue: (r) => r.mtime, render: (r) => <span className="text-muted">{fmtDate(r.mtime, settings!.datesWithTime)}</span> },
      atime: { key: 'atime', label: 'Último acesso', width: 130, sortable: true, sortValue: (r) => r.atime, render: (r) => <span className="text-muted">{fmtDate(r.atime, settings!.datesWithTime)}</span> },
      ctime: { key: 'ctime', label: 'Criação', width: 130, sortable: true, sortValue: (r) => r.ctime, render: (r) => <span className="text-muted">{fmtDate(r.ctime, settings!.datesWithTime)}</span> },
      attr: { key: 'attr', label: 'Atributos', width: 90, sortable: true, sortValue: (r) => attrString(r.attr), render: (r) => <span className="font-mono text-xs text-muted">{attrString(r.attr)}</span> },
      type: { key: 'type', label: 'Tipo', width: 120, sortable: true, sortValue: (r) => (r.kind === 'dir' ? '' : extOf(r.name)), render: (r) => <span className="text-muted">{typeLabel(r.name, r.kind)}</span> },
      owner: { key: 'owner', label: 'Proprietário', width: 160, sortable: true, sortValue: (r) => r.owner || '', render: (r) => <span className="text-muted">{r.owner || (r.kind === 'file' ? '—' : '')}</span> },
      avg: { key: 'avg', label: 'Tam. médio', width: 100, align: 'right', sortable: true, sortValue: (r) => (r.files ? r.size / r.files : 0), render: (r) => (r.kind === 'dir' && r.files ? fmtSize(r.size / r.files, units, dec) : '') },
      compress: { key: 'compress', label: 'Compactação', width: 100, align: 'right', sortable: true, sortValue: (r) => (r.size ? 1 - r.alloc / r.size : 0), render: (r) => (r.attr & 0x800 && r.size ? fmtPct(Math.max(0, 1 - r.alloc / r.size)) : '') },
      optical: { key: 'optical', label: 'Mídia óptica', width: 110, align: 'right', sortable: true, sortValue: (r) => r.size, render: (r) => fmtSize(r.kind === 'file' ? Math.ceil(r.size / 2048) * 2048 : r.size + r.files * 1024, units, dec), title: () => 'Espaço que o arquivo ocuparia em um CD ou DVD, que guarda os dados em blocos de 2 KB' },
      pathLen: { key: 'pathLen', label: 'Compr. caminho', width: 110, align: 'right', sortable: true, sortValue: (r) => r.name.length, render: (r) => rowPath(r, selPath).length },
      level: { key: 'level', label: 'Nível', width: 60, align: 'right', sortable: true, sortValue: (r) => r.level, render: (r) => r.level },
      prev: { key: 'prev', label: 'Anterior', width: 110, align: 'right', sortable: true, sortValue: (r) => r.prevSize ?? -1, render: (r) => (r.prevSize == null ? '' : r.prevSize < 0 ? <span className="text-accent text-xs">novo</span> : fmtSize(r.prevSize, units, dec)) },
      delta: { key: 'delta', label: 'Variação', width: 110, align: 'right', sortable: true, sortValue: (r) => (r.prevSize == null ? 0 : r.size - Math.max(0, r.prevSize)), render: (r) => {
        if (r.prevSize == null) return '';
        const d = r.size - Math.max(0, r.prevSize);
        return <span className={d > 0 ? 'text-danger' : d < 0 ? 'text-accent' : 'text-muted'}>{d > 0 ? '+' : ''}{fmtSize(d, units, dec)}</span>;
      } },
    };
    const keys = [...settings!.columns];
    if (comparing) { if (!keys.includes('prev')) keys.push('prev'); if (!keys.includes('delta')) keys.push('delta'); }
    return keys.filter((k) => all[k]).map((k) => all[k]);
  }, [settings!.columns, units, dec, selPath, comparing, rootSize, settings!.datesWithTime, settings!.boldLarge, settings!.compressedBlue]); // eslint-disable-line

  const selectedRows = details.filter((r) => sel.has(r.id));
  const detailMenu = (e: React.MouseEvent, r: Row) => {
    const rows = sel.has(r.id) && sel.size > 1 ? selectedRows : [r];
    const targets = rows.map((x) => toTarget(x, rowPath(x, selPath)));
    openContextMenu(e, actions.menu(targets, r.kind === 'dir' && rows.length === 1 ? [
      { separator: true },
      { label: 'Ir para esta pasta', icon: <FolderOpen />, onClick: () => goTo(r.id) },
      { label: 'Analisar em nova aba', icon: <Plus />, onClick: () => startScan(rowPath(r, selPath)) },
    ] : []));
  };

  return (
    // centralizado com a mesma largura máxima das outras telas, numa moldura transparente
    <div className="h-full px-6 py-6">
    <div className="mx-auto flex h-full max-w-[1400px] flex-col rounded-xl border border-line"><div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]">
      {/* barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        <IconButton title="Voltar" disabled={nav.pos === 0} onClick={navBackDir}><ArrowLeft size={16} /></IconButton>
        <IconButton title="Avançar" disabled={nav.pos >= nav.stack.length - 1} onClick={navForwardDir}><ArrowRight size={16} /></IconButton>
        <IconButton title="Pasta pai" disabled={selected <= 0} onClick={async () => { const n: any = await cc.scanQuery(scanId, 'nodeInfo', selected); if (n.parent >= 0) goTo(n.parent); }}><ArrowUp size={16} /></IconButton>
        <div className="mx-1 h-5 w-px bg-line" />
        {active!.done
          ? <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={refreshScan}>Atualizar</Button>
          : <Button size="sm" variant="ghost" icon={<Square size={13} />} onClick={stopScan} className="text-danger">Parar</Button>}
        <Dropdown trigger={<Button size="sm" variant="ghost" icon={<ListTree size={14} />} title="Expandir árvore"><span className="hidden xl:inline">Expandir</span></Button>} items={[
          { label: 'Recolher tudo', onClick: () => expandTo(0) },
          { label: 'Nível 1', onClick: () => expandTo(1) }, { label: 'Nível 2', onClick: () => expandTo(2) },
          { label: 'Nível 3', onClick: () => expandTo(3) }, { label: 'Nível 4', onClick: () => expandTo(4) },
          { label: 'Nível 5', onClick: () => expandTo(5) }, { separator: true }, { label: 'Expansão total', onClick: () => expandTo(99) },
        ]} />
        <div className="mx-1 h-5 w-px bg-line" />
        <Segmented size="sm" value={mode} onChange={(v) => setSettings({ displayMode: v })} options={[
          { value: 'size', label: 'Tamanho' }, { value: 'alloc', label: 'Alocado', title: 'Espaço ocupado no disco' },
          { value: 'files', label: 'Arquivos' }, { value: 'pct', label: '%' },
        ]} />
        <Select className="w-[92px]" title="Unidade" value={units} onChange={(v) => setSettings({ units: v })} options={[
          { value: 'auto', label: 'Auto' }, { value: 'TB', label: 'TB' }, { value: 'GB', label: 'GB' }, { value: 'MB', label: 'MB' }, { value: 'KB', label: 'KB' }, { value: 'B', label: 'Bytes' },
        ]} />
        <div className="mx-1 h-5 w-px bg-line" />
        <Button size="sm" variant={summary?.filter ? 'default' : 'ghost'} icon={<Filter size={14} />} onClick={() => setFilterOpen(true)} className={summary?.filter ? 'text-accent' : ''}>Filtro{summary?.filter ? ' ativo' : ''}</Button>
        {summary?.filter && <IconButton title="Limpar filtro" onClick={async () => { await cc.scanQuery(scanId, 'setFilter', null); bump(); }}><FilterX size={15} /></IconButton>}
        <TreeSearch scanId={scanId} onPick={(id) => goTo(id)} />
        <div className="flex-1" />
        <IconButton title="Colunas" onClick={() => setColsOpen(true)}><Columns3 size={16} /></IconButton>
        <IconButton title={`Abrir no ${FILE_MANAGER}`} onClick={() => selPath && cc.open(selPath)}><ExternalLink size={15} /></IconButton>
        <Dropdown align="right" trigger={<Button size="sm" icon={<Download size={14} />} title="Exportar / imprimir"><span className="hidden xl:inline">Exportar</span></Button>} items={[
          { label: 'Excel (.xlsx)', icon: <FileSpreadsheet />, onClick: () => setExportOpen('xlsx') },
          { label: 'CSV', icon: <FileText />, onClick: () => setExportOpen('csv') },
          { label: 'HTML', icon: <FileCode />, onClick: () => setExportOpen('html') },
          { label: 'PDF', icon: <FileDown />, onClick: () => setExportOpen('pdf') },
          { label: 'Texto (.txt)', icon: <FileText />, onClick: () => setExportOpen('txt') },
          { label: 'Imprimir relatório…', icon: <Printer />, onClick: () => setExportOpen('print') },
          { separator: true },
          { label: 'Salvar varredura (.gz)…', icon: <Save />, onClick: async () => { const f = await cc.historyExport(scanId); if (f) toast('Varredura salva em ' + f); } },
        ]} />
      </div>

      {/* painéis */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-[260px] flex-col border-r border-line" style={{ width: treeW }}>
          <div
            ref={treeRef}
            tabIndex={0}
            onKeyDown={onTreeKey}
            onScroll={(e) => setTreeScroll((e.target as HTMLDivElement).scrollTop)}
            className="min-h-0 flex-1 overflow-auto outline-none"
          >
            <div style={{ height: tree.length * ROW_H, position: 'relative', minWidth: 'fit-content' }}>
              {tree.slice(start, end).map((r, k) => {
                const i = start + k;
                const on = r.id === selected;
                const isFile = r.kind === 'file';
                const large = settings!.boldLarge && r.size > rootSize * 0.15 && r.depth > 0;
                return (
                  <div
                    key={r.id}
                    onClick={() => goTo(r.id)}
                    onDoubleClick={() => r.hasChildren && toggle(r.id)}
                    onContextMenu={(e) => { goTo(r.id); treeMenu(e, r); }}
                    className={cx('group absolute left-0 right-0 flex cursor-default items-center pr-3 text-[13px] transition-colors duration-100', on ? 'bg-accent-soft' : 'hover:bg-hover')}
                    style={{ top: i * ROW_H, height: ROW_H, paddingLeft: 6 + r.depth * 16 }}
                  >
                    {settings!.sizeBars && r.depth > 0 && (
                      <span className="pointer-events-none absolute inset-y-[5px] left-0 rounded-r-sm bg-accent/10 transition-[width] duration-500" style={{ width: `${Math.min(100, r.pct * 100)}%` }} />
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); r.hasChildren && toggle(r.id); }}
                      className={cx('relative z-[1] flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint hover:text-fg', !r.hasChildren && 'invisible')}
                    >
                      <ChevronRight size={14} className={cx('transition-transform duration-200', r.expanded && 'rotate-90')} />
                    </button>
                    <span className="relative z-[1] mr-1.5 shrink-0">
                      {isFile ? <File size={14} className="text-faint" /> : r.expanded ? <FolderOpen size={15} className="text-accent" /> : <Folder size={15} className="text-accent" />}
                    </span>
                    <span className={cx('relative z-[1] min-w-0 flex-1 truncate', large && 'font-semibold', settings!.compressedBlue && r.attr & 0x800 && 'text-info', r.link && 'italic text-muted')} title={r.name}>
                      {r.depth === 0 ? active!.root : r.name}
                    </span>
                    {r.err ? <AlertTriangle size={12} className="relative z-[1] ml-1 shrink-0 text-warn"><title>Sem acesso a parte desta pasta</title></AlertTriangle> : null}
                    {r.link ? <Link2 size={12} className="relative z-[1] ml-1 shrink-0 text-faint"><title>Atalho do sistema para outra pasta (o CleanCode não entra nele)</title></Link2> : null}
                    <span className="relative z-[1] ml-3 shrink-0 text-xs text-muted tnum">{valueOf(r)}</span>
                    {r.prevSize != null && r.prevSize >= 0 && r.size !== r.prevSize && (
                      <span className={cx('relative z-[1] ml-2 shrink-0 text-[11px] tnum', r.size > r.prevSize ? 'text-danger' : 'text-accent')}>{r.size > r.prevSize ? '+' : ''}{fmtSize(r.size - r.prevSize, 'auto', 0)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div
          className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-accent/40"
          onMouseDown={(e) => {
            const sx = e.clientX, sw = treeW;
            const mv = (ev: MouseEvent) => setTreeW(Math.max(260, Math.min(window.innerWidth - 400, sw + ev.clientX - sx)));
            const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
            document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <SelectionSummary row={tree.find((r) => r.id === selected) || tree[0]} path={selPath} units={units} dec={dec} datesWithTime={settings!.datesWithTime} />
          <DataTable
            className="min-h-0 flex-1"
            rows={details}
            columns={columns}
            rowKey={(r) => r.id}
            rowHeight={30}
            selectable
            selected={sel}
            onSelect={setSel}
            sort={sort}
            onSort={setSort}
            onRowDoubleClick={(r) => (r.kind === 'dir' ? goTo(r.id) : cc.open(rowPath(r, selPath)))}
            onRowContext={detailMenu}
            onHeaderContext={(e) => { e.preventDefault(); setColsOpen(true); }}
            empty={active!.done ? 'Pasta vazia' : 'Carregando…'}
          />
          {sel.size > 0 && (
            <div className="flex items-center gap-2 border-t border-line bg-[color-mix(in_srgb,var(--surface)_60%,transparent)] px-3 py-1.5 text-xs backdrop-blur anim-fade">
              <span className="text-muted">{sel.size} selecionado(s) · {fmtSize(selectedRows.reduce((s, r) => s + r.size, 0), units, dec)}</span>
              <div className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Limpar seleção</Button>
              <Button size="sm" variant="outline" onClick={() => actions.move(selectedRows.map((r) => toTarget(r, rowPath(r, selPath))))}>Mover…</Button>
              <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={async () => { await actions.del(selectedRows.map((r) => toTarget(r, rowPath(r, selPath)))); setSel(new Set()); }}>Excluir…</Button>
            </div>
          )}
        </div>
      </div>

      {/* barra de status */}
      <div className="flex h-7 shrink-0 items-center gap-4 overflow-hidden whitespace-nowrap border-t border-line px-3 text-xs text-muted">
        {!active!.done ? (
          <span className="flex min-w-0 items-center gap-2 text-accent"><Loader2 size={12} className="animate-spin" /> Varrendo <span className="truncate text-muted">{p?.current}</span></span>
        ) : (
          <span>{active!.stopped ? 'Varredura interrompida' : 'Varredura concluída'} em {fmtDuration(p?.elapsed || 0)}</span>
        )}
        <div className="flex-1" />
        <span className="tnum">{fmtNum(p?.files)} arquivos · {fmtNum(p?.dirs)} pastas</span>
        <span className="tnum">{fmtSize(p?.size, units, dec)} <span className="text-faint">({fmtSize(p?.alloc, units, dec)} alocados)</span></span>
        {summary && <span className="text-faint">cluster {fmtSize(summary.cluster)}</span>}
        {!!p?.errors && <button className="flex items-center gap-1 text-warn hover:underline" onClick={() => setErrorsOpen(true)}><AlertTriangle size={12} /> {fmtNum(p.errors)} erro(s)</button>}
      </div>

      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} scanId={scanId} current={summary?.filter} />
      <ColumnsModal open={colsOpen} onClose={() => setColsOpen(false)} />
      <ErrorsModal open={errorsOpen} onClose={() => setErrorsOpen(false)} scanId={scanId} />
      <ExportModal format={exportOpen} onClose={() => setExportOpen(null)} scanId={scanId} nodeId={selected < 0 ? 0 : selected} />
      <NewFolderModal target={newFolderFor} onClose={() => setNewFolderFor(null)} scanId={scanId} />
      <ErrorsAfterScan scanId={scanId} open={() => setErrorsOpen(true)} />
    </div>
    </div>
    </div>
  );
}

function SelectionSummary({ row, path, units, dec, datesWithTime }: { row?: Row; path: string; units: string; dec: number; datesWithTime: boolean }) {
  if (!row) return <div className="h-[62px] border-b border-line" />;
  const items = [
    ['Tamanho', fmtSize(row.size, units, dec)], ['Alocado', fmtSize(row.alloc, units, dec)],
    ['Arquivos', fmtNum(row.files)], ['Pastas', fmtNum(row.dirs)], ['Modificado', fmtDate(row.mtime, datesWithTime)],
  ];
  return (
    <div className="flex items-center gap-6 border-b border-line px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-fg" title={path}>{path}</div>
        <div className="text-xs text-muted">{fmtPct(row.pct)} da pasta pai</div>
      </div>
      {items.map(([k, v]) => (
        <div key={k} className="hidden text-right lg:block">
          <div className="text-[11px] text-muted">{k}</div>
          <div className="text-[13px] font-medium text-fg tnum">{v}</div>
        </div>
      ))}
    </div>
  );
}

function TreeSearch({ scanId, onPick }: { scanId: number; onPick: (id: number) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!q.trim()) { setRes([]); return; }
    const t = setTimeout(() => cc.scanQuery(scanId, 'search', q, 60).then((r: any) => { setRes(r); setOpen(true); }), 250);
    return () => clearTimeout(t);
  }, [q, scanId]);
  return (
    <div className="relative">
      <Input className="w-44 2xl:w-56" icon={<Search size={14} />} placeholder="Pesquisar na árvore" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => res.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)} />
      {open && res.length > 0 && (
        <div className="absolute left-0 top-9 z-40 max-h-80 w-[460px] overflow-auto rounded-lg border border-line bg-surface p-1 shadow-xl anim-pop">
          {res.map((r) => (
            <button key={r.id} onMouseDown={() => { onPick(r.id); setOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-hover">
              {r.kind === 'dir' ? <Folder size={13} className="shrink-0 text-accent" /> : <File size={13} className="shrink-0 text-faint" />}
              <span className="min-w-0 flex-1"><span className="block truncate text-fg">{r.name}</span><span className="block truncate text-faint">{r.path}</span></span>
              <span className="text-muted tnum">{fmtSize(r.size)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterModal({ open, onClose, scanId, current }: { open: boolean; onClose: () => void; scanId: number; current: any }) {
  const { bump, settings, setSettings, toast } = useApp();
  const [rules, setRules] = useState<any[]>([]);
  const [minMB, setMin] = useState('');
  const [maxMB, setMax] = useState('');
  useEffect(() => {
    if (!open) return;
    setRules(current?.rules || []);
    setMin(current?.minSize ? String(current.minSize / 1048576) : '');
    setMax(current?.maxSize ? String(current.maxSize / 1048576) : '');
  }, [open, current]);
  const apply = async () => {
    const valid = rules.filter((r) => r.pattern.trim());
    try { for (const r of valid) if (r.kind === 'regex') new RegExp(r.pattern); } catch { toast('Expressão regular inválida', 'error'); return; }
    await cc.scanQuery(scanId, 'setFilter', { rules: valid, minSize: minMB ? +minMB * 1048576 : 0, maxSize: maxMB ? +maxMB * 1048576 : 0 });
    bump(); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Filtro" width={720} footer={<>
      <Button variant="outline" onClick={async () => { await cc.scanQuery(scanId, 'setFilter', null); bump(); onClose(); }}>Limpar filtro</Button>
      <Button variant="primary" onClick={apply}>Aplicar</Button>
    </>}>
      <p className="mb-3 text-xs text-muted">As regras de <b>inclusão</b> mostram apenas os itens que combinam com pelo menos uma delas. As regras de <b>exclusão</b> escondem os itens que combinam com elas. Os totais das pastas são recalculados na hora, sem precisar analisar o disco de novo.</p>
      <div className="space-y-2">
        {rules.map((r, i) => (
          <div key={i} className="flex items-center gap-2 anim-fade">
            <Select className="w-36" value={r.field} onChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, field: v } : x)))} options={[
              { value: 'name', label: 'Nome do arquivo' }, { value: 'ext', label: 'Extensão' }, { value: 'path', label: 'Caminho completo' }, { value: 'folder', label: 'Nome da pasta' },
            ]} />
            <Select className="w-40" value={r.op} onChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, op: v } : x)))} options={[
              { value: 'match', label: 'Incluir se corresponde' }, { value: 'notmatch', label: 'Excluir se corresponde' },
            ]} />
            <Select className="w-32" value={r.kind} onChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, kind: v } : x)))} options={[
              { value: 'wildcard', label: 'Curinga' }, { value: 'regex', label: 'Regex' }, { value: 'exact', label: 'Nome exato' },
            ]} />
            <Input className="flex-1" value={r.pattern} placeholder={r.kind === 'regex' ? '.+\\.exe$' : r.field === 'ext' ? 'mp4' : '*.exe'} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, pattern: e.target.value } : x)))} />
            <IconButton title="Remover regra" onClick={() => setRules(rules.filter((_, j) => j !== i))}><X size={15} /></IconButton>
          </div>
        ))}
        <Button size="sm" variant="outline" icon={<Plus size={13} />} onClick={() => setRules([...rules, { field: 'name', op: 'match', kind: 'wildcard', pattern: '' }])}>Adicionar regra</Button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-xs text-muted">Tamanho mínimo do arquivo (MB)<Input className="mt-1" type="number" min="0" value={minMB} onChange={(e) => setMin(e.target.value)} /></label>
        <label className="text-xs text-muted">Tamanho máximo do arquivo (MB)<Input className="mt-1" type="number" min="0" value={maxMB} onChange={(e) => setMax(e.target.value)} /></label>
      </div>
      <div className="mt-3 border-t border-line pt-2">
        <Toggle checked={settings!.hideEmpty} onChange={(v) => setSettings({ hideEmpty: v })} label="Ocultar pastas vazias" hint="Depois de aplicar o filtro, esconde as pastas que ficaram sem nenhum arquivo." />
      </div>
    </Modal>
  );
}

function ColumnsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, setSettings } = useApp();
  const cols = settings!.columns;
  const toggle = (k: string) => setSettings({ columns: cols.includes(k) ? cols.filter((c) => c !== k) : [...cols, k] });
  const move = (k: string, d: number) => {
    const i = cols.indexOf(k), j = i + d;
    if (i < 0 || j < 0 || j >= cols.length) return;
    const c = [...cols]; [c[i], c[j]] = [c[j], c[i]]; setSettings({ columns: c });
  };
  return (
    <Modal open={open} onClose={onClose} title="Colunas da visão de detalhes" width={520} footer={<>
      <Button variant="outline" onClick={() => setSettings({ columns: ['name', 'size', 'alloc', 'files', 'pct', 'mtime'] })}>Restaurar padrão</Button>
      <Button variant="primary" onClick={onClose}>Concluir</Button>
    </>}>
      <div className="grid grid-cols-1 gap-0.5">
        {ALL_COLUMNS.map((c) => (
          <div key={c.key} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-hover">
            <Checkbox checked={cols.includes(c.key)} onChange={() => toggle(c.key)} />
            <span className="flex-1 text-[13px]">{c.label}</span>
            {cols.includes(c.key) && (<>
              <IconButton title="Mover para cima" className="h-6 w-6" onClick={() => move(c.key, -1)}><ArrowUp size={13} /></IconButton>
              <IconButton title="Mover para baixo" className="h-6 w-6" onClick={() => move(c.key, 1)}><ArrowUp size={13} className="rotate-180" /></IconButton>
            </>)}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ErrorsModal({ open, onClose, scanId }: { open: boolean; onClose: () => void; scanId: number }) {
  const [errs, setErrs] = useState<any[] | null>(null);
  useEffect(() => { if (open) cc.scanQuery(scanId, 'errors').then(setErrs); }, [open, scanId]);
  const msg = (c: number) => (c === 5 ? 'Acesso negado' : c === 3 ? 'Caminho não encontrado' : c === 32 ? 'Em uso por outro processo' : `Erro ${c}`);
  return (
    <Modal open={open} onClose={onClose} title={`Erros da varredura (${errs?.length ?? 0})`} width={760}>
      <p className="mb-2 text-xs text-muted">
        {isMac
          ? <>O CleanCode não conseguiu ler estas pastas. Na maioria dos casos, isso se resolve quando você ativa o CleanCode em Ajustes do Sistema, depois em Privacidade e Segurança, e depois em Acesso Total ao Disco. <button className="text-accent hover:underline" onClick={() => cc.openFullDiskAccess()}>Abrir Ajustes</button></>
          : 'O CleanCode não conseguiu ler estas pastas. Na maioria dos casos, isso se resolve quando você abre o CleanCode como administrador.'}
      </p>
      {!errs ? <Spinner /> : (
        <div className="max-h-[50vh] overflow-auto rounded-md border border-line">
          {errs.map((e, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line/60 px-3 py-1.5 text-xs last:border-0">
              <span className="w-40 shrink-0 text-warn">{msg(e.code)}</span><span className="truncate text-fg" title={e.path}>{e.path}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ExportModal({ format, onClose, scanId, nodeId }: { format: string | null; onClose: () => void; scanId: number; nodeId: number }) {
  const { toast } = useApp();
  const [depth, setDepth] = useState('3');
  const [files, setFiles] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (format) setDepth(format === 'csv' || format === 'xlsx' ? '20' : '3'); }, [format]);
  const run = async () => {
    setBusy(true);
    try {
      const r = await cc.exportRun(scanId, nodeId, format!, { depth: +depth, files });
      if (r && r !== 'print') toast('Exportado: ' + r);
    } catch (e: any) { toast('Falha na exportação: ' + e.message, 'error'); }
    setBusy(false); onClose();
  };
  const label: Record<string, string> = { xlsx: 'Excel', csv: 'CSV', html: 'HTML', pdf: 'PDF', txt: 'texto', print: 'impressão' };
  return (
    <Modal open={!!format} onClose={onClose} title={`Exportar para ${label[format || ''] || ''}`} width={460} footer={<>
      <Button variant="outline" onClick={onClose}>Cancelar</Button>
      <Button variant="primary" loading={busy} onClick={run}>{format === 'print' ? 'Imprimir…' : 'Salvar…'}</Button>
    </>}>
      <p className="mb-3 text-xs text-muted">Exporta a pasta que está selecionada no Explorador, junto com as subpastas dela.</p>
      <label className="block text-xs text-muted">Profundidade de subpastas
        <Select className="mt-1" value={depth} onChange={setDepth} options={[1, 2, 3, 4, 5, 8, 10, 20, 99].map((d) => ({ value: String(d), label: d === 99 ? 'Todas' : `${d} nível(is)` }))} />
      </label>
      <div className="mt-2"><Toggle checked={files} onChange={setFiles} label="Incluir os arquivos da pasta selecionada" /></div>
    </Modal>
  );
}

function NewFolderModal({ target, onClose, scanId }: { target: { id: number; path: string } | null; onClose: () => void; scanId: number }) {
  const { toast } = useApp();
  const [name, setName] = useState('Nova pasta');
  useEffect(() => { if (target) setName('Nova pasta'); }, [target]);
  const create = async () => {
    try {
      await cc.newFolder(target!.path, name);
      await cc.scanQuery(scanId, 'rescan', target!.id);
      toast('Pasta criada');
      onClose();
    } catch (e: any) { toast('Não foi possível criar: ' + e.message, 'error'); }
  };
  return (
    <Modal open={!!target} onClose={onClose} title="Nova pasta" width={440} footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={create}>Criar</Button></>}>
      <div className="mb-2 truncate text-xs text-muted">Em: {target?.path}</div>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
    </Modal>
  );
}

function ErrorsAfterScan({ scanId, open }: { scanId: number; open: () => void }) {
  const { active, settings } = useApp();
  const shown = useRef(false);
  useEffect(() => {
    if (active?.done && !shown.current && settings!.showErrorsAfterScan && (active.progress?.errors || 0) > 0) { shown.current = true; open(); }
  }, [active?.done]); // eslint-disable-line
  return null;
}
