// Limpeza: encontra caches, logs, lixeiras, sobras de desenvolvimento e downloads esquecidos,
// mostra tudo para revisão e remove só o que estiver marcado (Lixeira por padrão).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, ChevronRight, Loader2, CheckCircle2, AlertTriangle, RotateCcw, FolderOpen, Trash2, ShieldCheck, Layers, Zap } from 'lucide-react';
import { useApp, useRunning } from '../lib/store';
import { cc, JunkCategoryInfo, JunkResult, FILE_MANAGER, isMac } from '../lib/api';
import { fmtSize, fmtNum, fmtRelative } from '../lib/format';
import { Badge, Button, Checkbox, Toggle, cx } from '../components/ui';
import { Float3D } from './maint';
import { PageBody } from './common';
import { t as tr } from '../lib/i18n';

type Phase = 'intro' | 'scanning' | 'results' | 'cleaning' | 'done';

function useTween(target: number, ms = 700) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3), cur = a + (target - a) * e;
      setV(cur); from.current = cur;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Ilustração do módulo: anéis em órbita ao redor de um núcleo na cor de destaque. */
function Orb({ active, size = 260 }: { active?: boolean; size?: number }) {
  return <Float3D icon={<Sparkles />} active={active} size={size} />;
}

export default function Cleanup() {
  const { confirm, toast, settings } = useApp();
  const units = settings?.units || 'auto';
  const [phase, setPhase] = useState<Phase>('intro');
  useRunning('cleanup', phase === 'scanning' ? 'Limpeza: analisando' : phase === 'cleaning' ? 'Limpeza: limpando' : null);
  const [cats, setCats] = useState<JunkCategoryInfo[]>([]);
  const [results, setResults] = useState<Record<string, JunkResult>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [selCats, setSelCats] = useState<Set<string>>(new Set());
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [cleanProg, setCleanProg] = useState({ done: 0, total: 0, freed: 0, current: '' });
  const [summary, setSummary] = useState<{ freed: number; removed: number; failed: { path: string; error: string }[] } | null>(null);
  const [last, setLast] = useState<{ at: number; freed: number } | null>(null);
  // modo agressivo: temporários com mais de 1 hora (em vez de 1 dia); a escolha fica salva neste computador
  const [aggressive, setAggressive] = useState(() => { try { return localStorage.getItem('cc.cleanup.aggressive') === '1'; } catch { return false; } });
  const toggleAggressive = (v: boolean) => { setAggressive(v); try { localStorage.setItem('cc.cleanup.aggressive', v ? '1' : '0'); } catch { /* */ } };

  useEffect(() => {
    cc.cleanupCategories().then((c) => { setCats(c); setSelCats(new Set(c.filter((x) => x.selected).map((x) => x.id))); });
    cc.activityList().then((l) => { const a = l.find((x) => x.kind === 'cleanup'); if (a) setLast({ at: a.at, freed: a.freed || 0 }); });
  }, []);
  useEffect(() => cc.on.cleanupProgress((d) => {
    if (d.type === 'start') setCurrent(d.id || null);
    else if (d.type === 'category' && d.id) setResults((r) => ({ ...r, [d.id!]: d as JunkResult }));
    else if (d.type === 'done') { setCurrent(null); setPhase('results'); }
  }), []);
  useEffect(() => cc.on.cleanProgress(setCleanProg), []);

  const start = async () => {
    setResults({}); setDeselected(new Set()); setOpen(new Set()); setSummary(null);
    setSelCats(new Set(cats.filter((x) => x.selected).map((x) => x.id)));
    setPhase('scanning');
    await cc.cleanupScan({ aggressive: !isMac && aggressive });
  };

  const found = useMemo(() => Object.values(results).reduce((s, r) => s + r.size, 0), [results]);
  const isOn = (catId: string, path: string) => selCats.has(catId) && !deselected.has(path);
  const selection = useMemo(() => {
    let size = 0, count = 0;
    const paths: string[] = [], specials: string[] = [];
    for (const c of cats) {
      const r = results[c.id];
      if (!r || !selCats.has(c.id) || r.size === 0) continue;
      if (c.special) { specials.push(c.id); size += r.size; count += r.count; continue; }
      for (const i of r.items) if (!deselected.has(i.path)) { paths.push(i.path); size += i.size; count++; }
    }
    return { size, count, paths, specials };
  }, [cats, results, selCats, deselected]);

  const toggleCat = (id: string, on: boolean) => {
    setSelCats((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });
    const r = results[id];
    if (r && on) setDeselected((d) => { const n = new Set(d); for (const i of r.items) n.delete(i.path); return n; });
  };
  const toggleItem = (catId: string, path: string, on: boolean) => {
    if (on && !selCats.has(catId)) {
      // marcar um item de uma categoria desmarcada: liga a categoria só com ele
      const r = results[catId];
      setSelCats((s) => new Set(s).add(catId));
      setDeselected((d) => { const n = new Set(d); for (const i of r?.items || []) if (i.path !== path) n.add(i.path); n.delete(path); return n; });
      return;
    }
    setDeselected((d) => { const n = new Set(d); on ? n.delete(path) : n.add(path); return n; });
  };

  const runClean = async () => {
    const chosen = cats.filter((c) => selCats.has(c.id) && results[c.id]?.size);
    const review = chosen.filter((c) => c.risk === 'review');
    const r = await confirm({
      title: tr("Limpar {0}?", fmtSize(selection.size, units)),
      message: <>{fmtNum(selection.count)} {tr("itens em")} {chosen.length} {tr("categorias.")}{review.length ? <> {tr("Inclui itens para revisar (")}{review.map((c) => c.name).join(', ')}).</> : null} {tr("A Lixeira é sempre esvaziada de vez.")}</>,
      items: chosen.map((c) => ({ label: c.name, detail: fmtSize(c.special ? results[c.id].size : results[c.id].items.filter((i) => !deselected.has(i.path)).reduce((s, i) => s + i.size, 0), units) })),
      options: [
        { key: 'trash', label: tr("Mover para a Lixeira"), hint: tr("Você consegue recuperar os itens até esvaziar a Lixeira. Por isso, o espaço só fica livre depois que a Lixeira é esvaziada.") },
        { key: 'delete', label: tr("Apagar definitivamente"), hint: tr("O espaço fica livre na hora, mas não dá para desfazer.") },
      ],
      defaultOption: 'trash', danger: true, confirmLabel: tr("Limpar"),
      requireCheck: review.length ? tr("Revisei os itens marcados para revisão.") : undefined,
    });
    if (!r.ok) return;
    setPhase('cleaning');
    setCleanProg({ done: 0, total: selection.paths.length + selection.specials.length, freed: 0, current: '' });
    const res = await cc.cleanupClean(selection.paths, selection.specials, r.option === 'delete' ? 'delete' : 'trash');
    setSummary(res);
    setLast({ at: Date.now(), freed: res.freed });
    setPhase('done');
    toast(`${fmtSize(res.freed, units)} liberados`);
  };

  const foundT = useTween(found);
  const freedT = useTween(phase === 'done' ? summary?.freed || 0 : cleanProg.freed);
  const groups = useMemo(() => [...new Set(cats.map((c) => c.group))], [cats]);

  // ---------- telas ----------
  if (phase === 'intro' || phase === 'scanning') {
    const scanned = Object.keys(results).length;
    return (
      <PageBody>
        <div className="flex min-h-[calc(100vh-140px)] flex-col items-center justify-center gap-10 py-6 lg:flex-row lg:gap-16">
          <div className="anim-pop"><Orb active={phase === 'scanning'} size={300} /></div>
          <div className="max-w-md anim-page">
            <h1 className="text-[40px] font-semibold leading-tight tracking-tight text-fg">{tr("Limpeza")}</h1>
            <p className="mt-2 text-[15px] text-muted">{tr("Encontra o que só ocupa espaço no")} {isMac ? tr("Mac") : 'PC'}{tr(": caches, registros de atividade (logs), lixeiras, sobras de ferramentas de desenvolvimento e downloads esquecidos. Você revisa tudo antes de apagar.")}</p>
            {phase === 'intro' ? (
              <>
                <div className="mt-6 space-y-3">
                  {[
                    { icon: <Layers size={16} />, t: tr("{0} categorias analisadas", cats.length) },
                    { icon: <ShieldCheck size={16} />, t: tr("Os itens sensíveis começam desmarcados.") },
                    { icon: <Trash2 size={16} />, t: tr("Por padrão, tudo vai para a Lixeira.") },
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-3 text-[14px] font-medium text-fg anim-page" style={{ animationDelay: `${80 + i * 60}ms` }}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">{f.icon}</span>{f.t}
                    </div>
                  ))}
                </div>
                {last && <div className="mt-5 text-xs text-faint">{tr("Última limpeza")} {fmtRelative(last.at)} · {fmtSize(last.freed, units)} {tr("liberados")}</div>}
                <button onClick={start} className="group relative mt-8 flex h-28 w-28 items-center justify-center rounded-full text-[17px] font-semibold text-accent-fg transition-transform hover:scale-105 active:scale-95"
                  style={{ background: 'radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent) 55%, #ffffff), var(--accent) 60%)', boxShadow: '0 10px 40px color-mix(in srgb, var(--accent) 45%, transparent)' }}>
                  <span className="absolute inset-0 rounded-full anim-ping-soft" style={{ boxShadow: '0 0 0 2px var(--accent)' }} />
                  {tr("Analisar")}
                </button>
                {!isMac && <div className="mt-6 max-w-[340px] text-left">
                  <Toggle checked={aggressive} onChange={toggleAggressive} label={tr("Modo agressivo")}
                    hint={tr("Inclui os arquivos temporários com mais de 1 hora, em vez de apenas os que têm mais de 1 dia. Os arquivos que estão em uso ficam de fora da limpeza.")} />
                </div>}
              </>
            ) : (
              <div className="mt-6">
                <div className="flex items-baseline gap-2"><span className="text-3xl font-semibold tabular-nums text-fg">{fmtSize(foundT, units)}</span><span className="text-sm text-muted">{tr("encontrados até agora")}</span></div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${cats.length ? (scanned / cats.length) * 100 : 0}%` }} /></div>
                <div className="mt-4 space-y-1.5">
                  {cats.map((c) => {
                    const r = results[c.id];
                    return (
                      <div key={c.id} className="flex items-center gap-2 text-[13px]">
                        {r ? <CheckCircle2 size={14} className="text-accent" /> : current === c.id ? <Loader2 size={14} className="animate-spin text-accent" /> : <span className="h-3.5 w-3.5 rounded-full border border-line-strong" />}
                        <span className={cx('flex-1 truncate', r || current === c.id ? 'text-fg' : 'text-faint')}>{c.name}</span>
                        {r && <span className="tabular-nums text-muted">{fmtSize(r.size, units)}</span>}
                      </div>
                    );
                  })}
                </div>
                <Button className="mt-5" variant="ghost" onClick={() => { cc.cleanupCancel(); setPhase('intro'); }}>{tr("Parar")}</Button>
              </div>
            )}
          </div>
        </div>
      </PageBody>
    );
  }

  if (phase === 'cleaning' || phase === 'done') {
    const pct = cleanProg.total ? (cleanProg.done / cleanProg.total) * 100 : 0;
    return (
      <PageBody>
        <div className="flex min-h-[calc(100vh-140px)] flex-col items-center justify-center gap-10 py-6 lg:flex-row lg:gap-16">
          <div className="anim-pop"><Orb active={phase === 'cleaning'} size={260} /></div>
          <div className="w-full max-w-md anim-page">
            <div className="text-sm font-medium text-muted">{phase === 'cleaning' ? tr("Limpando…") : tr("Limpeza concluída")}</div>
            <div className="mt-1 flex items-baseline gap-2"><span className="text-[44px] font-semibold tabular-nums tracking-tight text-fg">{fmtSize(freedT, units)}</span><span className="text-sm text-muted">{tr("liberados")}</span></div>
            {phase === 'cleaning' ? (
              <>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
                <div className="mt-2 truncate text-xs text-faint">{cleanProg.current}</div>
              </>
            ) : summary && (
              <>
                <div className="mt-2 text-sm text-muted">{fmtNum(summary.removed)} {tr("itens removidos")}{summary.failed.length ? tr(" · {0} não puderam ser removidos, porque estavam em uso ou protegidos", summary.failed.length) : ''}.</div>
                {summary.failed.length > 0 && (
                  <details className="mt-3 rounded-lg border border-line bg-surface p-3 text-xs">
                    <summary className="cursor-pointer text-muted"><AlertTriangle size={12} className="mr-1 inline text-warn" />{tr("Ver itens que ficaram")}</summary>
                    <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                      {summary.failed.slice(0, 200).map((f) => <div key={f.path} className="flex gap-2"><span className="min-w-0 flex-1 truncate text-fg" title={f.path}>{f.path}</span><span className="shrink-0 text-faint">{f.error}</span></div>)}
                    </div>
                  </details>
                )}
                <Button className="mt-6" variant="primary" icon={<RotateCcw size={14} />} onClick={start}>{tr("Analisar de novo")}</Button>
              </>
            )}
          </div>
        </div>
      </PageBody>
    );
  }

  // resultados
  const visible = cats.filter((c) => results[c.id]);
  return (
    <div className="flex h-full flex-col">
      <PageBody className="flex-1">
        <div className="mb-6 flex flex-wrap items-end gap-4 anim-page">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-[var(--on-accent)]" style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #ffffff))' }}><Sparkles size={26} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-muted">{tr("Encontrados")}</div>
            <div className="text-[34px] font-semibold leading-none tracking-tight text-fg tabular-nums">{fmtSize(foundT, units)}</div>
          </div>
          <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={start}>{tr("Analisar de novo")}</Button>
        </div>
        {groups.map((g) => {
          const list = visible.filter((c) => c.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="mb-5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">{tr(g)}</div>
              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                {list.map((c, idx) => {
                  const r = results[c.id];
                  const selItems = c.special ? (selCats.has(c.id) ? r.count : 0) : r.items.filter((i) => isOn(c.id, i.path)).length;
                  const all = c.special ? r.count : r.items.length;
                  const empty = r.size === 0;
                  const expanded = open.has(c.id);
                  return (
                    <div key={c.id} className={cx(idx > 0 && 'border-t border-line', 'anim-page')} style={{ animationDelay: `${idx * 30}ms` }}>
                      <div className={cx('flex items-center gap-3 px-4 py-3', empty && 'opacity-55')}>
                        <Checkbox checked={!empty && selCats.has(c.id) && selItems > 0} indeterminate={!empty && selCats.has(c.id) && selItems > 0 && selItems < all} onChange={(v) => !empty && toggleCat(c.id, v)} />
                        <button disabled={empty || c.special} onClick={() => setOpen((o) => { const n = new Set(o); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          {!c.special && <ChevronRight size={14} className={cx('shrink-0 text-faint transition-transform', expanded && 'rotate-90', empty && 'invisible')} />}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-[14px] font-medium text-fg">{c.name}{c.risk === 'review' && <Badge tone="warn">{tr("revise")}</Badge>}{c.removal === 'delete' && <Badge>{tr("apaga de vez")}</Badge>}</div>
                            <div className="truncate text-xs text-muted">{c.description}</div>
                          </div>
                        </button>
                        <div className="shrink-0 text-right">
                          <div className="text-[14px] font-semibold tabular-nums text-fg">{fmtSize(r.size, units)}</div>
                          <div className="text-[11px] text-faint">{empty ? (r.denied ? tr("sem acesso") : tr("nada encontrado")) : tr("{0} itens", fmtNum(r.count))}</div>
                          {r.denied && isMac && <button onClick={() => cc.openFullDiskAccess()} className="text-[11px] font-medium text-accent hover:underline">{tr("Dar acesso")}</button>}
                        </div>
                      </div>
                      {expanded && (
                        <div className="max-h-80 overflow-y-auto border-t border-line bg-surface-2/60 py-1 anim-fade">
                          {r.items.slice(0, 300).map((i) => (
                            <div key={i.path} className="group flex items-center gap-3 px-4 py-1.5 pl-11 text-[13px] hover:bg-hover">
                              <Checkbox checked={isOn(c.id, i.path)} onChange={(v) => toggleItem(c.id, i.path, v)} />
                              <span className="min-w-0 flex-1 truncate text-fg" title={i.path}>{i.name}</span>
                              {i.mtime > 0 && <span className="hidden shrink-0 text-[11px] text-faint sm:inline">{fmtRelative(i.mtime)}</span>}
                              <button title={tr("Mostrar no {0}", FILE_MANAGER)} onClick={() => cc.showInFolder(i.path)} className="shrink-0 rounded p-0.5 text-faint opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"><FolderOpen size={13} /></button>
                              <span className="w-20 shrink-0 text-right tabular-nums text-muted">{fmtSize(i.size, units)}</span>
                            </div>
                          ))}
                          {r.items.length > 300 && <div className="px-11 py-1.5 text-xs text-faint">{tr("e mais")} {fmtNum(r.items.length - 300)} {tr("itens menores (incluídos na seleção)")}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </PageBody>
      {/* barra de ação */}
      <div className="flex shrink-0 items-center gap-4 border-t border-line bg-bg/90 px-6 py-3 backdrop-blur anim-page">
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-semibold tabular-nums text-fg">{fmtSize(selection.size, units)}</span>
          <span className="text-muted"> {tr("selecionados ·")} {fmtNum(selection.count)} {tr("itens")}</span>
        </div>
        <Button variant="primary" icon={<Zap size={14} />} disabled={!selection.count} onClick={runClean}>{tr("Limpar")}</Button>
      </div>
    </div>
  );
}
