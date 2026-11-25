// Acúmulos: duplicados, fotos parecidas, arquivos grandes e antigos e Transferências nas pastas pessoais.
// Tudo vai para a Lixeira e só depois de você marcar (as cópias de duplicados vêm marcadas, o original não).
import React, { useEffect, useMemo, useState } from 'react';
import { Layers, Copy, Images, FileBox, Download, Loader2, FolderOpen, RotateCcw, Trash2, Crown, Check } from 'lucide-react';
import { useApp, useRunning } from '../lib/store';
import { cc, ClutterReport, ClutterFile, FILE_MANAGER, isMac } from '../lib/api';
import { fmtSize, fmtNum, fmtRelative } from '../lib/format';
import { Badge, Button, Checkbox, cx, Empty } from '../components/ui';
import { Float3D } from './maint';
import { PageBody } from './common';
import { t as tr } from '../lib/i18n';

type Tab = 'duplicates' | 'similar' | 'large' | 'downloads';

function Stack({ size = 280, active }: { size?: number; active?: boolean }) {
  return <Float3D icon={<Layers />} active={active} size={size} />;
}

function Row({ f, on, toggle, badge }: { f: ClutterFile; on: boolean; toggle: (v: boolean) => void; badge?: React.ReactNode }) {
  return (
    <div className="group flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-hover">
      <Checkbox checked={on} onChange={toggle} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="truncate text-fg">{f.name}</span>{badge}</div>
        <div className="truncate text-[11px] text-faint" title={f.path}>{f.path}</div>
      </div>
      <span className="hidden shrink-0 text-[11px] text-faint sm:inline">{fmtRelative(f.mtime)}</span>
      <button title={tr("Mostrar no {0}", FILE_MANAGER)} onClick={() => cc.showInFolder(f.path)} className="shrink-0 rounded p-0.5 text-faint opacity-0 hover:text-fg group-hover:opacity-100"><FolderOpen size={13} /></button>
      <span className="w-20 shrink-0 text-right tabular-nums text-muted">{fmtSize(f.size, 'auto', 1)}</span>
    </div>
  );
}

export default function Clutter() {
  const { confirm, toast } = useApp();
  const [phase, setPhase] = useState<'intro' | 'scanning' | 'results'>('intro');
  const [prog, setProg] = useState<{ phase: string; scanned?: number; done?: number; total?: number }>({ phase: '' });
  const [rep, setRep] = useState<ClutterReport | null>(null);
  const [tab, setTab] = useState<Tab>('duplicates');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useRunning('clutter', phase === 'scanning' ? tr("Acúmulos: analisando") : busy ? tr("Acúmulos: movendo para a Lixeira") : null);
  useEffect(() => cc.on.clutterProgress(setProg), []);

  const scan = async () => {
    setPhase('scanning'); setProg({ phase: tr("Lendo pastas") });
    const r = await cc.clutterScan();
    setRep(r);
    // duplicados: mantém o mais antigo de cada grupo e marca as cópias
    setSel(new Set(r.duplicates.flatMap((g) => g.files.slice(1).map((f) => f.path))));
    setPhase('results');
  };
  const toggle = (p: string, v: boolean) => setSel((s) => { const n = new Set(s); v ? n.add(p) : n.delete(p); return n; });

  const all = useMemo(() => {
    const m = new Map<string, ClutterFile>();
    if (rep) for (const f of [...rep.large, ...rep.old, ...rep.duplicates.flatMap((g) => g.files), ...rep.similar.flatMap((g) => g.files), ...rep.downloads]) m.set(f.path, f);
    return m;
  }, [rep]);
  const selSize = [...sel].reduce((s, p) => s + (all.get(p)?.size || 0), 0);
  const bigOld = useMemo(() => {
    if (!rep) return [];
    const m = new Map<string, ClutterFile & { tags: string[] }>();
    for (const f of rep.large) m.set(f.path, { ...f, tags: ['grande'] });
    for (const f of rep.old) { const x = m.get(f.path); x ? x.tags.push('antigo') : m.set(f.path, { ...f, tags: ['antigo'] }); }
    return [...m.values()].sort((a, b) => b.size - a.size);
  }, [rep]);
  const counts = rep ? {
    duplicates: rep.duplicates.reduce((s, g) => s + g.size * (g.files.length - 1), 0),
    similar: rep.similar.reduce((s, g) => s + g.files.reduce((t, f) => t + f.size, 0), 0),
    large: bigOld.reduce((s, f) => s + f.size, 0),
    downloads: rep.downloads.reduce((s, f) => s + f.size, 0),
  } : { duplicates: 0, similar: 0, large: 0, downloads: 0 };

  const trash = async () => {
    const r = await confirm({ title: tr("Mover {0} arquivos para a Lixeira?", fmtNum(sel.size)), message: <>{tr("Libera")} {fmtSize(selSize)} {tr("quando a Lixeira for esvaziada. Até lá, você consegue recuperar os itens.")}</>, confirmLabel: tr("Mover para a Lixeira"), danger: true,
      items: [...sel].slice(0, 40).map((p) => ({ label: all.get(p)?.name || p, detail: fmtSize(all.get(p)?.size || 0) })) });
    if (!r.ok) return;
    setBusy(true);
    const res = await cc.clutterTrash([...sel]);
    setBusy(false);
    toast(tr("{0} arquivos na Lixeira · {1}{2}", fmtNum(res.removed), fmtSize(res.freed), res.failed.length ? ` · ${res.failed.length} falharam` : ''), res.failed.length ? 'error' : 'ok');
    const gone = new Set([...sel].filter((p) => !res.failed.some((f) => f.path === p)));
    setRep((x) => x && {
      ...x,
      large: x.large.filter((f) => !gone.has(f.path)), old: x.old.filter((f) => !gone.has(f.path)), downloads: x.downloads.filter((f) => !gone.has(f.path)),
      duplicates: x.duplicates.map((g) => ({ ...g, files: g.files.filter((f) => !gone.has(f.path)) })).filter((g) => g.files.length > 1),
      similar: x.similar.map((g) => ({ files: g.files.filter((f) => !gone.has(f.path)) })).filter((g) => g.files.length > 1),
    });
    setSel(new Set());
  };

  if (phase !== 'results' || !rep) {
    return (
      <PageBody>
        <div className="flex min-h-[calc(100vh-140px)] flex-col items-center justify-center gap-10 py-6 lg:flex-row lg:gap-16">
          <div className="anim-pop"><Stack active={phase === 'scanning'} /></div>
          <div className="w-full max-w-md anim-page">
            <h1 className="text-[40px] font-semibold leading-tight tracking-tight text-fg">{tr("Acúmulos")}</h1>
            <p className="mt-2 text-[15px] text-muted">{tr("Encontra duplicados, fotos parecidas, arquivos grandes esquecidos e arquivos antigos em Transferências.")}</p>
            <div className="mt-6 space-y-3">
              {[{ i: <Copy size={16} />, t: tr("Encontra arquivos com o conteúdo idêntico.") }, { i: <Images size={16} />, t: tr("Encontra fotos parecidas, como sequências, edições e capturas de tela.") }, { i: <FileBox size={16} />, t: tr("Encontra arquivos com mais de 100 MB e arquivos que ninguém muda há 1 ano.") }].map((f, k) => (
                <div key={k} className="flex items-center gap-3 text-[14px] font-medium text-fg anim-page" style={{ animationDelay: `${80 + k * 60}ms` }}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">{f.i}</span>{f.t}</div>
              ))}
            </div>
            {phase === 'scanning' ? (
              <div className="mt-8">
                <div className="flex items-center gap-2 text-sm text-fg"><Loader2 size={15} className="animate-spin text-accent" />{prog.phase}…</div>
                <div className="mt-1 text-xs text-faint tabular-nums">{prog.scanned ? tr("{0} arquivos lidos", fmtNum(prog.scanned)) : ''}{prog.total ? tr(" · {0} de {1}", fmtNum(prog.done || 0), fmtNum(prog.total)) : ''}</div>
                {prog.total ? <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${((prog.done || 0) / prog.total) * 100}%` }} /></div> : null}
                <Button className="mt-4" variant="ghost" onClick={() => { cc.clutterCancel(); setPhase('intro'); }}>{tr("Parar")}</Button>
              </div>
            ) : (
              <button onClick={scan} className="relative mt-8 flex h-28 w-28 items-center justify-center rounded-full text-[17px] font-semibold text-accent-fg transition-transform hover:scale-105 active:scale-95"
                style={{ background: 'radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent) 55%, #ffffff), var(--accent) 60%)', boxShadow: '0 10px 40px color-mix(in srgb, var(--accent) 45%, transparent)' }}>
                <span className="absolute inset-0 rounded-full anim-ping-soft" style={{ boxShadow: '0 0 0 2px var(--accent)' }} />{tr("Analisar")}
              </button>
            )}
          </div>
        </div>
      </PageBody>
    );
  }

  const tabs: { v: Tab; label: string; icon: React.ReactNode; size: number; n: number }[] = [
    { v: 'duplicates', label: tr("Duplicados"), icon: <Copy size={14} />, size: counts.duplicates, n: rep.duplicates.length },
    { v: 'similar', label: tr("Fotos parecidas"), icon: <Images size={14} />, size: counts.similar, n: rep.similar.length },
    { v: 'large', label: tr("Grandes e antigos"), icon: <FileBox size={14} />, size: counts.large, n: bigOld.length },
    { v: 'downloads', label: isMac ? tr("Transferências") : tr("Downloads"), icon: <Download size={14} />, size: counts.downloads, n: rep.downloads.length },
  ];
  return (
    <div className="flex h-full flex-col">
      <PageBody className="flex-1">
        <div className="mb-5 flex flex-wrap items-center gap-4 anim-page">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-[var(--on-accent)]" style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #ffffff))' }}><Layers size={26} /></div>
          <div className="min-w-0 flex-1"><div className="text-[26px] font-semibold tracking-tight text-fg">{tr("Acúmulos")}</div><div className="text-sm text-muted">{fmtNum(rep.scanned)} {tr("arquivos em")} {rep.roots.length} {tr("pastas pessoais")}</div></div>
          <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={scan}>{tr("Analisar de novo")}</Button>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {tabs.map((t) => (
            <button key={t.v} onClick={() => setTab(t.v)} className={cx('rounded-xl border p-3 text-left transition-colors', tab === t.v ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-hover')}>
              <div className="flex items-center gap-2 text-xs text-muted">{t.icon}{t.label}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-fg">{fmtSize(t.size)}</div>
              <div className="text-[11px] text-faint">{t.v === 'duplicates' || t.v === 'similar' ? tr("{0} grupos", fmtNum(t.n)) : tr("{0} arquivos", fmtNum(t.n))}</div>
            </button>
          ))}
        </div>

        <div key={tab} className="anim-page">
          {tab === 'duplicates' && (!rep.duplicates.length ? <Empty icon={<Copy size={20} />} title={tr("Nenhum duplicado")} text={tr("O CleanCode não encontrou arquivos com o conteúdo idêntico nas suas pastas pessoais.")} /> : (
            <div className="space-y-3">
              {rep.duplicates.slice(0, 200).map((g) => (
                <div key={g.files[0].path} className="overflow-hidden rounded-xl border border-line bg-surface">
                  <div className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2 text-xs text-muted"><Copy size={12} /><span className="truncate font-medium text-fg">{g.files[0].name}</span><span className="ml-auto shrink-0">{g.files.length} {tr("cópias ·")} {fmtSize(g.size)} {tr("cada")}</span></div>
                  {g.files.map((f, i) => <Row key={f.path} f={f} on={sel.has(f.path)} toggle={(v) => toggle(f.path, v)} badge={i === 0 ? <Badge tone="accent"><Crown size={10} className="mr-1 inline" />{tr("original")}</Badge> : undefined} />)}
                </div>
              ))}
            </div>
          ))}
          {tab === 'similar' && (!rep.similar.length ? <Empty icon={<Images size={20} />} title={tr("Nenhuma foto parecida")} text={tr("O CleanCode não encontrou fotos quase iguais.")} /> : (
            <>
              <div className="mb-3 flex items-center gap-2"><Button size="sm" variant="outline" icon={<Check size={13} />} onClick={() => setSel((s) => {
                const n = new Set(s);
                for (const g of rep.similar) { const best = [...g.files].sort((a, b) => ((b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0)) || b.size - a.size)[0]; for (const f of g.files) if (f !== best) n.add(f.path); }
                return n;
              })}>{tr("Marcar todas menos a melhor de cada grupo")}</Button><span className="text-xs text-faint">{tr("A melhor é a de maior resolução")}</span></div>
              <div className="space-y-4">
                {rep.similar.map((g, gi) => (
                  <div key={gi} className="rounded-xl border border-line bg-surface p-3">
                    <div className="mb-2 text-xs text-muted">{g.files.length} {tr("fotos parecidas ·")} {fmtSize(g.files.reduce((s, f) => s + f.size, 0))}</div>
                    <div className="flex flex-wrap gap-3">
                      {g.files.map((f) => {
                        const on = sel.has(f.path);
                        return (
                          <button key={f.path} onClick={() => toggle(f.path, !on)} title={f.path} className={cx('group relative w-36 overflow-hidden rounded-lg border-2 text-left transition-all', on ? 'border-danger' : 'border-transparent hover:border-line-strong')}>
                            {f.thumb ? <img src={f.thumb} className={cx('h-28 w-full object-cover transition-opacity', on && 'opacity-60')} alt="" /> : <div className="flex h-28 items-center justify-center bg-surface-2"><Images size={20} className="text-faint" /></div>}
                            <span className={cx('absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border text-white', on ? 'border-danger bg-danger' : 'border-white/70 bg-black/30')}>{on && <Trash2 size={11} />}</span>
                            <div className="px-1.5 py-1"><div className="truncate text-[11px] text-fg">{f.name}</div><div className="text-[10px] text-faint">{f.width ? `${f.width}×${f.height} · ` : ''}{fmtSize(f.size, 'auto', 1)}</div></div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ))}
          {tab === 'large' && (!bigOld.length ? <Empty icon={<FileBox size={20} />} title={tr("Nada grande ou antigo")} text={tr("O CleanCode não encontrou arquivos com mais de 100 MB nem arquivos parados há mais de 1 ano.")} /> : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {bigOld.slice(0, 500).map((f) => <Row key={f.path} f={f} on={sel.has(f.path)} toggle={(v) => toggle(f.path, v)} badge={<>{f.tags.map((t) => <Badge key={t} tone={t === 'grande' ? 'info' : 'warn'}>{t}</Badge>)}</>} />)}
            </div>
          ))}
          {tab === 'downloads' && (!rep.downloads.length ? <Empty icon={<Download size={20} />} title={tr("Pasta vazia")} text={tr("A pasta de Transferências não tem nada que mereça atenção.")} /> : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {rep.downloads.slice(0, 500).map((f) => <Row key={f.path} f={f} on={sel.has(f.path)} toggle={(v) => toggle(f.path, v)} />)}
            </div>
          ))}
        </div>
      </PageBody>
      <div className="flex shrink-0 items-center gap-4 border-t border-line bg-bg/90 px-6 py-3 backdrop-blur">
        <div className="min-w-0 flex-1 text-sm"><span className="font-semibold tabular-nums text-fg">{fmtSize(selSize)}</span><span className="text-muted"> {tr("selecionados ·")} {fmtNum(sel.size)} {tr("arquivos")}</span></div>
        {sel.size > 0 && <Button variant="ghost" onClick={() => setSel(new Set())}>{tr("Desmarcar tudo")}</Button>}
        <Button variant="primary" icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} disabled={!sel.size || busy} onClick={trash}>{tr("Mover para a Lixeira")}</Button>
      </div>
    </div>
  );
}
