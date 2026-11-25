import React, { useMemo, useState } from 'react';
import { PackageX, RefreshCw, Search, Trash2, FolderOpen, Download, Copy, Eraser, Unlink, FileSearch, FolderTree, Sparkles } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, AppEntry, isMac, OS_NAME, FILE_MANAGER } from '../lib/api';
import { fmtSize, fmtDate, fmtRelative, fmtNum } from '../lib/format';
import { DataTable } from '../components/DataTable';
import { Badge, Button, Card, Input, openContextMenu, PageHeader, Segmented, Select, Stat } from '../components/ui';
import { PageBody } from './common';
import { AppIcon, appFolder, RecentInstalls, sourceLabel, useApps, useRemoveEntry, useUninstall, useUninstallSort, prefetchDossier, cancelPrefetch } from './appsShared';
import { t } from '../lib/i18n';

export default function Uninstaller() {
  const { settings, toast, openDossier, startScan, go } = useApp();
  const units = settings!.units;
  const { apps, loading, reload, remove } = useApps();
  const [q, setQ] = useState('');
  const [src, setSrc] = useState<'all' | 'win32' | 'store' | 'mac'>('all');
  const [sort, setSort] = useUninstallSort();
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const un = useUninstall((ids) => { remove(ids); setSel(new Set()); });
  const removeEntry = useRemoveEntry((ids) => { remove(ids); setSel(new Set()); });
  const orphanCount = (apps || []).filter((a) => a.orphan).length;

  const rows = useMemo(() => (apps || []).filter((a) =>
    (src === 'all' || a.source === src) &&
    (!q || `${a.name} ${a.publisher || ''}`.toLowerCase().includes(q.toLowerCase()))), [apps, q, src]);
  const selRows = rows.filter((a) => sel.has(a.id));
  const totalSize = (apps || []).reduce((s, a) => s + (a.size || 0), 0);

  const menu = (e: React.MouseEvent, a: AppEntry) => {
    const rs = sel.has(a.id) && sel.size > 1 ? selRows : [a];
    const dir = appFolder(a);
    openContextMenu(e, [
      { label: t("Ver dossiê"), icon: <FileSearch />, onClick: () => openDossier({ kind: 'app', app: a }) },
      { label: t("Abrir a pasta na árvore"), icon: <FolderTree />, disabled: !dir, onClick: async () => { if (dir) { await startScan(dir); go('explorer'); } } },
      { separator: true },
      { label: rs.length > 1 ? t("Desinstalar {0} programas…", rs.length) : t("Desinstalar…"), icon: <Trash2 />, danger: true, onClick: () => un.start(rs), disabled: !rs.some((x) => x.canUninstall && !x.orphan) },
      ...(isMac ? [
        { separator: true },
        // no macOS "abrir" o .app executaria o app: mostra no Finder
        { label: t("Mostrar no {0}", FILE_MANAGER), icon: <FolderOpen />, disabled: !a.location, onClick: () => a.location && cc.showInFolder(a.location) },
        { label: t("Copiar identificador do pacote"), icon: <Copy />, disabled: !a.bundleId, onClick: () => { cc.copyText(a.bundleId || ''); toast(t("Copiado")); } },
      ] : [
        { label: t("Remover da lista (entrada órfã)…"), icon: <Eraser />, onClick: () => removeEntry(rs), disabled: !rs.some((x) => x.orphan) },
        { separator: true },
        { label: t("Abrir pasta de instalação"), icon: <FolderOpen />, disabled: !a.location, onClick: () => a.location && cc.openLocation(a.location) },
        { label: t("Copiar comando de desinstalação"), icon: <Copy />, disabled: !a.uninstall && !a.packageFullName, onClick: () => { cc.copyText(a.uninstall || `Remove-AppxPackage ${a.packageFullName}`); toast(t("Copiado")); } },
      ]),
    ]);
  };

  return (
    <PageBody>
      <PageHeader title={t("Desinstalador")} icon={<PackageX size={18} />}
        description={isMac
          ? t("Selecione um ou vários apps para desinstalar. Tudo vai para a Lixeira.")
          : t("Selecione um ou vários programas para desinstalar. Você confirma cada item antes.")}
        actions={<>
          <Button icon={<Download size={14} />} onClick={() => cc.exportList(
            rows.map((a) => ({ name: a.name, publisher: a.publisher || '', version: a.version || '', source: sourceLabel(a), mtime: a.installDate, atime: a.lastUsed, usedFrom: a.lastUsedSource || '', size: a.size || 0, path: a.location || '' })),
            'xlsx', 'programas instalados',
            [{ key: 'name', label: t("Programa") }, { key: 'publisher', label: t("Fabricante") }, { key: 'version', label: t("Versão") }, { key: 'source', label: t("Origem") },
              { key: 'mtime', label: t("Instalado em") }, { key: 'atime', label: t("Último uso") }, { key: 'usedFrom', label: t("Fonte do último uso") }, { key: 'size', label: t("Tamanho (bytes)") }, { key: 'path', label: t("Pasta de instalação") }],
          ).then((f) => f && toast(t("Exportado: ") + f))}>{t("Exportar")}</Button>
          <Button icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} onClick={reload} disabled={loading}>{t("Recarregar")}</Button>
        </>} />
      {un.panel}
      {orphanCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 anim-fade">
          <Unlink size={16} className="shrink-0 text-danger" />
          <div className="min-w-0 flex-1 text-[13px]">
            <b>{orphanCount} {t("entrada(s) órfã(s)")}</b><span className="text-muted">{t(". O desinstalador e a pasta desses programas não existem mais. Os arquivos já foram apagados, e só sobrou a entrada no registro.")}</span>
          </div>
          <Button size="sm" icon={<Eraser size={13} />} onClick={() => removeEntry((apps || []).filter((a) => a.orphan))}>{t("Limpar entradas órfãs")}</Button>
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("Programas")} value={apps ? fmtNum(apps.length) : '…'} />
        <Stat label={isMac ? t("Apps") : t("Win32")} value={apps ? fmtNum(apps.filter((a) => a.source === (isMac ? 'mac' : 'win32')).length) : '…'} />
        <Stat label={isMac ? t("App Store") : t("Store / MSIX")} value={apps ? fmtNum(apps.filter((a) => a.source === 'store').length) : '…'} />
        <Stat label={t("Espaço conhecido")} value={fmtSize(totalSize, units)} sub={isMac ? t("tamanho dos pacotes .app") : t("registro e cálculo da pasta")} />
      </div>
      <Card className="mb-4" title={<span className="flex items-center gap-2"><Sparkles size={14} /> {t("Instalados recentemente")}</span>}>
        <RecentInstalls apps={apps} n={8} />
      </Card>
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <Input className="w-72" icon={<Search size={14} />} placeholder={t("Buscar por nome ou fabricante")} value={q} onChange={(e) => setQ(e.target.value)} />
          <Segmented value={src} onChange={setSrc} options={isMac ? [{ value: 'all', label: t("Todos") }, { value: 'mac', label: t("Apps") }, { value: 'store', label: t("App Store") }] : [{ value: 'all', label: t("Todos") }, { value: 'win32', label: t("Win32") }, { value: 'store', label: t("Store") }]} />
          <Select className="w-52" value={`${sort.key}:${sort.asc}`} onChange={(v) => { const [k, a] = v.split(':'); setSort({ key: k, asc: a === 'true' }); }} options={[
            { value: 'size:false', label: t("Maiores primeiro") }, { value: 'installDate:false', label: t("Instalados mais recentes") }, { value: 'installDate:true', label: t("Mais antigos primeiro") },
            { value: 'lastUsed:true', label: t("Menos usados primeiro") }, { value: 'name:true', label: t("Nome (A–Z)") },
          ]} />
          <div className="flex-1" />
          {sel.size > 0 && <span className="text-xs text-muted">{sel.size} {t("selecionado(s) ·")} {fmtSize(selRows.reduce((s, a) => s + (a.size || 0), 0), units)}</span>}
          <Button variant="danger" size="sm" icon={<Trash2 size={13} />} disabled={!sel.size || un.busy} onClick={() => un.start(selRows)}>{t("Desinstalar selecionados")}</Button>
        </div>
        <div style={{ height: Math.max(380, window.innerHeight - 360) }}>
          <DataTable className="h-full" rows={rows} rowKey={(a) => a.id} rowHeight={54} selectable selected={sel} onSelect={setSel} sort={sort} onSort={setSort}
            onRowContext={menu} onRowDoubleClick={(a) => openDossier({ kind: 'app', app: a })} empty={loading ? t("Lendo programas instalados…") : t("Nenhum programa encontrado")}
            columns={[
              { key: 'name', label: t("Programa"), width: 300, flex: true, sortable: true, sortValue: (a) => a.name.toLowerCase(), render: (a) => (
                <span className="flex items-center gap-3"><AppIcon app={a} size={38} /><span className="min-w-0"><button className="block max-w-full truncate text-left font-medium text-fg hover:text-accent hover:underline" title={t("Ver o dossiê")} onMouseEnter={() => prefetchDossier(a)} onMouseLeave={cancelPrefetch} onClick={(e) => { e.stopPropagation(); openDossier({ kind: 'app', app: a }); }}>{a.name}</button><span className="block truncate text-xs text-muted">{a.publisher || '—'}{a.version ? ` · ${a.version}` : ''}</span></span></span>
              ), title: (a) => a.name },
              { key: 'source', label: t("Origem"), width: 190, sortable: true, sortValue: (a) => sourceLabel(a), render: (a) => <span className="flex items-center gap-1 text-xs text-muted">{sourceLabel(a)}{a.orphan && <Badge tone="danger" title={t("O desinstalador e a pasta não existem mais. Só sobrou a entrada no registro.")}>{t("órfão")}</Badge>}{!a.canUninstall && <Badge tone="warn">{t("protegido")}</Badge>}{a.background && a.canUninstall && <Badge title={t("Este pacote não tem atalho no menu Iniciar, porque é um componente, uma extensão ou uma biblioteca.")}>{t("componente")}</Badge>}</span> },
              { key: 'installDate', label: t("Instalado em"), width: 110, sortable: true, sortValue: (a) => a.installDate || 0, render: (a) => <span className="text-muted">{fmtDate(a.installDate)}</span> },
              { key: 'lastUsed', label: t("Último uso"), width: 140, sortable: true, sortValue: (a) => a.lastUsed || 0, render: (a) => <span className={a.lastUsed ? 'text-muted' : 'text-faint'}>{fmtRelative(a.lastUsed)}</span>, title: (a) => (a.lastUsedSource ? t("{0} · fonte: {1}", fmtDate(a.lastUsed, true), t(a.lastUsedSource)) + (a.runCount ? t(" · {0} execuções", a.runCount) : '') : t("O {0} não registrou quando este app foi usado", OS_NAME)) },
              { key: 'size', label: t("Tamanho"), width: 100, align: 'right', sortable: true, sortValue: (a) => a.size || 0, render: (a) => (a.size ? <span title={a.sizeSource === 'calculado' ? t("Calculado pela pasta") : t("Informado pelo instalador")}>{fmtSize(a.size, units)}</span> : <span className="text-faint">—</span>) },
              { key: 'act', label: '', width: 150, render: (a) => <span className="flex justify-end">{a.orphan
                ? <Button size="sm" variant="outline" icon={<Eraser size={12} />} onClick={(e) => { e.stopPropagation(); removeEntry([a]); }}>{t("Remover da lista")}</Button>
                : <Button size="sm" variant="outline" disabled={!a.canUninstall || un.busy} onClick={(e) => { e.stopPropagation(); un.start([a]); }}>{t("Desinstalar")}</Button>}</span> },
            ]} />
        </div>
      </Card>
    </PageBody>
  );
}
