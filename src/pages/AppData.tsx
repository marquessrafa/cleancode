// AppData (Windows) / Dados de apps (macOS): o que cada programa guarda no perfil, quanto ocupa e o que dá
// para apagar com segurança. Programas instalados: só caches, logs e atualizações antigas. Pastas sem
// programa instalado e paradas há mais de 30 dias aparecem como sobras e podem ir para a Lixeira.
import React, { useMemo, useState, useEffect } from 'react';
import { FolderCog, Sparkles, Trash2, ShieldCheck, FolderOpen, RotateCcw, ChevronRight, Archive, AlertTriangle, PackageX } from 'lucide-react';
import { useApp, useRunning } from '../lib/store';
import { cc, isMac, AppDataItem, AppDataStatus, FILE_MANAGER } from '../lib/api';
import { fmtNum, fmtRelative, fmtSize } from '../lib/format';
import { Badge, Button, Checkbox, Segmented, cx } from '../components/ui';
import { PageBody } from './common';
import { Hero } from './maint';
import { t as tr } from '../lib/i18n';

type Filter = 'all' | 'safe' | 'orphan' | 'installed' | 'system';
const STATUS: Record<AppDataStatus, { label: string; tone: 'accent' | 'warn' | 'default' | 'info' }> = {
  installed: { label: tr("Instalado"), tone: 'accent' },
  orphan: { label: tr("Sobra"), tone: 'warn' },
  unknown: { label: tr("Sem programa"), tone: 'default' },
  system: { label: isMac ? tr("Sistema") : tr("Windows"), tone: 'info' },
};

export default function AppDataPage() {
  const { toast, confirm, settings } = useApp();
  const units = settings?.units || 'auto';
  const [items, setItems] = useState<AppDataItem[] | null>(null);
  const [busy, setBusy] = useState<'' | 'scan' | 'clean'>('');
  const [prog, setProg] = useState<{ label?: string; name?: string; count?: number }>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [trashSel, setTrashSel] = useState<Set<string>>(new Set());
  useRunning('appdata', busy === 'scan' ? (isMac ? tr("Dados de apps: medindo") : 'AppData: medindo') : busy === 'clean' ? (isMac ? tr("Dados de apps: limpando") : 'AppData: limpando') : null);
  useEffect(() => cc.onAppdataProgress((d) => d.type === 'progress' && setProg(d)), []);

  const scan = async () => {
    setBusy('scan'); setProg({}); setTrashSel(new Set());
    try { setItems(await cc.appdataScan()); } finally { setBusy(''); }
  };
  const totals = useMemo(() => {
    const t = { size: 0, safe: 0, orphan: 0, orphanCount: 0 };
    for (const i of items || []) { t.size += i.size; t.safe += i.safe; if (i.status === 'orphan') { t.orphan += i.size; t.orphanCount++; } }
    return t;
  }, [items]);
  const list = useMemo(() => (items || []).filter((i) => filter === 'all' ? true : filter === 'safe' ? i.safe > 0 : filter === 'orphan' ? i.status === 'orphan' : filter === 'installed' ? i.status === 'installed' : i.status === 'system' || i.status === 'unknown'), [items, filter]);
  const trashSize = useMemo(() => (items || []).filter((i) => trashSel.has(i.path)).reduce((s, i) => s + i.size, 0), [items, trashSel]);

  const doClean = async (safe: string[], trash: string[], label: string) => {
    setBusy('clean');
    try {
      const r = await cc.appdataClean({ safe, trash });
      toast(tr("{0}: {1} liberados", label, fmtSize(r.freed, units)) + (r.failed ? tr(". {0} item(ns) em uso ficaram para trás.", fmtNum(r.failed)) : ''), r.failed ? 'info' : 'ok');
      setTrashSel(new Set());
      setItems(await cc.appdataScan());
    } finally { setBusy(''); }
  };
  const cleanAllSafe = async () => {
    const paths = (items || []).flatMap((i) => i.safePaths.map((s) => s.path));
    const r = await confirm({ title: tr("Limpar caches, logs e atualizações antigas?"), message: tr("{0} em {1} pastas. Os programas criam esses arquivos de novo quando precisarem. O CleanCode não mexe nas configurações, nos logins nem nos jogos salvos. Para limpar mais, feche os programas que estão abertos.", fmtSize(totals.safe, units), fmtNum(paths.length)), confirmLabel: tr("Limpar") });
    if (r.ok) doClean(paths, [], tr("Limpeza segura"));
  };
  const cleanOne = async (i: AppDataItem) => {
    const r = await confirm({ title: tr("Limpar {0}?", i.name), message: tr("Apaga {0} item(ns) seguro(s): {1}. {2}.", i.safePaths.length, [...new Set(i.safePaths.map((s) => s.reason))].join(', '), fmtSize(i.safe, units)), confirmLabel: tr("Limpar") });
    if (r.ok) doClean(i.safePaths.map((s) => s.path), [], i.name);
  };
  const trashSelected = async () => {
    const r = await confirm({ title: tr("Mover as sobras para a Lixeira?"), message: tr("{0} pasta(s), {1}. Nenhum programa instalado usa essas pastas. Mesmo assim, confira a lista, porque essas pastas podem guardar jogos salvos ou dados de programas portáteis. Se precisar, você restaura tudo pela Lixeira.", fmtNum(trashSel.size), fmtSize(trashSize, units)), confirmLabel: tr("Mover para a Lixeira"), danger: true });
    if (r.ok) doClean([], [...trashSel], tr("Sobras"));
  };

  if (!items) {
    return (
      <Hero icon={<FolderCog size={46} />} title={isMac ? tr("Dados de apps") : tr("AppData")}
        text={isMac
          ? tr("Os apps guardam caches, registros de atividade (logs) e dados na pasta ~/Library. Nesta tela, você vê quanto cada app ocupa e limpa apenas o que é seguro.")
          : 'Os programas acumulam gigabytes nas pastas AppData\\Local, Roaming e LocalLow. Lá ficam caches, registros de atividade (logs), atualizações antigas e sobras de programas que já foram desinstalados. Nesta tela, você vê o que é cada pasta e limpa apenas o que é seguro.'}
        bullets={[
          { icon: <Sparkles size={15} />, text: tr("Mostra os caches, os logs e os relatórios de travamento de cada programa.") },
          { icon: <Archive size={15} />, text: tr("Encontra as versões antigas que as atualizações deixam para trás, como as do Discord, do Slack e do Teams.") },
          { icon: <PackageX size={15} />, text: tr("Encontra as sobras de programas desinstalados e manda essas sobras para a Lixeira.") },
          { icon: <ShieldCheck size={15} />, text: tr("A limpeza segura nunca apaga configurações, logins ou jogos salvos.") },
        ]}
        action={{ label: tr("Analisar"), onClick: scan }} busy={busy === 'scan'}
        busyText={prog.name ? <>{tr("Medindo")} <b className="font-medium text-fg">{prog.label}</b> › {prog.name} · {fmtNum(prog.count || 0)} {tr("pastas")}</> : 'Medindo…'} />
    );
  }

  return (
    <PageBody>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><FolderCog size={22} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{isMac ? tr("Dados de apps") : tr("AppData")}</h1>
          <p className="text-[13px] text-muted">{fmtSize(totals.size, units)} {tr("em")} {fmtNum(items.length)} {tr("pastas ·")} {fmtSize(totals.safe, units)} {tr("seguros para limpar ·")} {fmtNum(totals.orphanCount)} {tr("sobras (")}{fmtSize(totals.orphan, units)})</p>
        </div>
        <Button icon={<RotateCcw size={14} />} onClick={scan} loading={busy === 'scan'} disabled={!!busy}>{tr("Analisar de novo")}</Button>
        <Button variant="primary" icon={<Sparkles size={14} />} onClick={cleanAllSafe} disabled={!!busy || totals.safe === 0} loading={busy === 'clean'}>{tr("Limpar o seguro (")}{fmtSize(totals.safe, units)})</Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Segmented value={filter} onChange={setFilter} size="sm" options={[
          { value: 'all', label: tr("Todas") }, { value: 'safe', label: tr("Com limpeza segura") }, { value: 'orphan', label: tr("Sobras ({0})", totals.orphanCount) },
          { value: 'installed', label: tr("Programas instalados") }, { value: 'system', label: tr("Sistema e outras") },
        ]} />
        {trashSel.size > 0 && <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={trashSelected} disabled={!!busy}>{tr("Mover")} {fmtNum(trashSel.size)} {tr("sobra(s) para a Lixeira (")}{fmtSize(trashSize, units)})</Button>}
      </div>
      {filter === 'orphan' && totals.orphanCount > 0 && (
        <div className="mt-3 flex gap-2.5 rounded-lg bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-muted"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
          {tr("As sobras são pastas que não têm um programa instalado correspondente e que ninguém usa há mais de 30 dias. Normalmente, elas vêm de programas desinstalados. Mesmo assim, confira antes, porque essas pastas podem ter jogos salvos ou dados de programas portáteis. As sobras vão para a Lixeira, e você pode restaurar tudo de lá.")}</div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="grid grid-cols-[28px_1fr_120px_96px_110px_100px_150px] items-center gap-2 border-b border-[var(--line)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <span /><span>{tr("Pasta")}</span><span>{tr("Situação")}</span><span className="text-right">{tr("Tamanho")}</span><span className="text-right">{tr("Seguro limpar")}</span><span className="text-right">{tr("Uso")}</span><span />
        </div>
        {list.slice(0, 400).map((i) => {
          const st = STATUS[i.status]; const isOpen = open.has(i.path);
          return (
            <div key={i.path} className="border-b border-[var(--line)] last:border-0">
              <div className="grid grid-cols-[28px_1fr_120px_96px_110px_100px_150px] items-center gap-2 px-3 py-2 text-[13px] hover:bg-[var(--hover)]">
                <span>{i.status === 'orphan' && <Checkbox checked={trashSel.has(i.path)} onChange={(v) => setTrashSel((s) => { const n = new Set(s); v ? n.add(i.path) : n.delete(i.path); return n; })} />}</span>
                <button className="flex min-w-0 items-center gap-1.5 text-left" onClick={() => setOpen((s) => { const n = new Set(s); isOpen ? n.delete(i.path) : n.add(i.path); return n; })}>
                  <ChevronRight size={13} className={cx('shrink-0 text-muted transition-transform', isOpen && 'rotate-90', !i.safePaths.length && 'opacity-0')} />
                  <span className="min-w-0"><span className="block truncate font-medium">{i.parent ? <span className="text-muted">{i.parent} › </span> : null}{i.name}</span>
                    <span className="block truncate text-[11px] text-muted">{i.root}{i.program ? ` · ${i.program}` : ''}</span></span>
                </button>
                <span><Badge tone={st.tone as any}>{st.label}</Badge></span>
                <span className="text-right tabular-nums">{fmtSize(i.size, units)}</span>
                <span className={cx('text-right tabular-nums', i.safe ? 'text-accent' : 'text-muted')}>{i.safe ? fmtSize(i.safe, units) : '—'}</span>
                <span className="text-right text-[12px] text-muted">{i.mtime ? fmtRelative(i.mtime) : '—'}</span>
                <span className="flex justify-end gap-1">
                  {i.safe > 0 && <Button size="sm" variant="ghost" icon={<Sparkles size={13} />} onClick={() => cleanOne(i)} disabled={!!busy}>{tr("Limpar")}</Button>}
                  <Button size="sm" variant="ghost" icon={<FolderOpen size={13} />} title={tr("Mostrar no {0}", FILE_MANAGER)} onClick={() => cc.showInFolder(i.path)} />
                </span>
              </div>
              {isOpen && i.safePaths.length > 0 && (
                <div className="bg-[var(--surface-2)] px-12 py-2 text-[12px]">
                  {i.safePaths.slice(0, 40).map((s) => (
                    <div key={s.path} className="flex items-center gap-3 py-0.5"><span className="min-w-0 flex-1 truncate text-muted" title={s.path}>{s.path.slice(i.path.length + 1) || s.path}</span><span className="text-faint">{s.reason}</span><span className="w-20 text-right tabular-nums">{fmtSize(s.size, units)}</span></div>
                  ))}
                  {i.safePaths.length > 40 && <div className="py-0.5 text-faint">+ {fmtNum(i.safePaths.length - 40)} {tr("itens")}</div>}
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && <div className="p-6 text-center text-[13px] text-muted">{tr("Nada aqui.")}</div>}
        {list.length > 400 && <div className="p-3 text-center text-[12px] text-muted">{tr("Mostrando as 400 maiores de")} {fmtNum(list.length)}.</div>}
      </div>
    </PageBody>
  );
}
