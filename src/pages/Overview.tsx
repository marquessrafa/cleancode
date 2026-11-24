import React, { useEffect, useMemo, useState } from 'react';
import {
  HardDrive, FolderOpen, History, Radar, PackageX, ArrowRight, Usb, Network, Disc, Clock, Copy, ArrowDownWideNarrow,
  Database, PieChart, Gauge, Trash2, FileX2, FolderX, Archive, Sparkles, TrendingUp, TrendingDown, ShieldCheck, ShieldAlert,
  Loader2, Folder, File, CalendarClock, LayoutGrid, MemoryStick,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, Drive, Row, isMac, joinPath } from '../lib/api';
import { fmtSize, fmtPct, fmtNum, fmtDate, fmtRelative, categoryOf, baseName, driveTag, PALETTE } from '../lib/format';
import { Badge, Button, Card, cx, PageHeader, ProgressBar } from '../components/ui';
import { BarList, Donut, DriveBadges, FullDiskAccessBanner, Legend, PageBody, useDriveHardware } from './common';
import { StorageMapCard } from '../components/StorageMap';
import { AppIcon, cancelPrefetch, openUninstaller, prefetchDossier, RecentInstalls, useApps } from './appsShared';

const DAY = 86400000;

export default function Overview() {
  const { startScan, settings, go, active, info, select, tick, openDossier } = useApp();
  const units = settings?.units || 'auto';
  const [drives, setDrives] = useState<Drive[] | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const { apps } = useApps();
  const hw = useDriveHardware();
  useEffect(() => { cc.drives().then(setDrives); cc.historyList().then(setHistory); }, [active?.done]);
  const pick = async () => { const p = await cc.pickFolder(); if (p) startScan(p); };

  const real = (drives || []).filter((d) => d.total > 0);
  const total = real.reduce((s, d) => s + d.total, 0);
  const used = real.reduce((s, d) => s + d.used, 0);
  const free = total - used;

  const cutoff = Date.now() - (settings?.staleMonths || 6) * 30.4 * DAY;
  const stale = useMemo(() => (apps || []).filter((a) => a.canUninstall && !a.background && a.lastUsed && a.lastUsed < cutoff), [apps, cutoff]);
  const staleSize = stale.reduce((s, a) => s + (a.size || 0), 0);
  const bigApps = useMemo(() => [...(apps || [])].filter((a) => a.size).sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 5), [apps]);

  return (
    <PageBody>
      <PageHeader
        title="Visão geral"
        description="Mostra como está o armazenamento, o que ocupa espaço e o que você pode limpar."
        actions={<>
          {info?.canElevate && (info.isAdmin
            ? <Badge tone="accent"><ShieldCheck size={11} /> Administrador</Badge>
            : <Button variant="outline" icon={<ShieldAlert size={14} />} onClick={() => cc.restartAdmin()} title="Com essa permissão, o CleanCode lê as pastas protegidas e o Prefetch.">Reiniciar como admin</Button>)}
          <Button variant="primary" icon={<FolderOpen size={14} />} onClick={pick}>Analisar pasta…</Button>
        </>}
      />

      <FullDiskAccessBanner className="mb-4" />
      {/* Discos: escolha o que analisar */}
      <div className="mb-5">
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><HardDrive size={16} className="text-accent" />Escolha um disco para analisar</h2>
          <span className="text-[12px] text-muted">A análise mostra o que ocupa espaço. Depois dela, as telas de Análise de disco ficam disponíveis.</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {drives === null && [0, 1].map((i) => <div key={i} className="skeleton h-[148px] rounded-xl" />)}
          {real.map((d, i) => {
            const pct = d.total ? d.used / d.total : 0;
            const tone = pct > 0.9 ? 'var(--danger)' : pct > 0.75 ? 'var(--warn)' : 'var(--accent)';
            const h = hw.byRoot(d.root);
            const Icon = h?.bus === 'USB' || d.type === 'Removível' ? Usb : d.type === 'Rede' ? Network : d.type === 'CD/DVD' ? Disc : h?.media === 'SSD' ? MemoryStick : HardDrive;
            const scanning = active && active.root.toLowerCase() === d.root.toLowerCase();
            return (
              <div key={d.root} className="group relative overflow-hidden rounded-xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-lg" style={{ animation: `fade-up .3s ${i * 50}ms both`, background: 'linear-gradient(150deg, color-mix(in srgb, var(--accent) 9%, var(--surface)), var(--surface) 60%)' }}>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md" style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000))' }}><Icon size={20} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-fg">{d.label || 'Disco local'}</div>
                    <div className="truncate text-[12px] text-muted">{driveTag(d.root)} · {d.fs}</div>
                  </div>
                  <div className="text-right"><div className="text-[18px] font-semibold tnum leading-none" style={{ color: tone }}>{fmtPct(pct, 0)}</div><div className="text-[11px] text-muted">usado</div></div>
                </div>
                <div className="mt-2"><DriveBadges hw={h} loading={hw.loading} /></div>
                <ProgressBar value={pct} tone={tone} className="mt-2 h-2" />
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[12px] text-muted tnum"><b className="font-medium text-fg">{fmtSize(d.free, units)}</b> livres de {fmtSize(d.total, units)}</span>
                  <Button size="sm" variant={scanning ? 'default' : 'primary'} onClick={() => (scanning ? go('explorer') : startScan(d.root))}>{scanning ? 'Abrir análise' : 'Analisar'} <ArrowRight size={12} /></Button>
                </div>
              </div>
            );
          })}
          <button onClick={pick} className="flex min-h-[148px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-[13px] text-muted transition-colors hover:border-accent hover:text-fg">
            <FolderOpen size={22} />Analisar uma pasta…
          </button>
        </div>
      </div>


      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={<Database size={16} />} label="Armazenamento total" value={drives ? fmtSize(total, units) : null} sub={`${real.length} unidade(s)`} />
        <Kpi icon={<Gauge size={16} />} label="Espaço usado" value={drives ? fmtSize(used, units) : null} sub={drives ? `${fmtPct(total ? used / total : 0, 0)} da capacidade` : ''} bar={total ? used / total : 0} />
        <Kpi icon={<PieChart size={16} />} label="Espaço livre" value={drives ? fmtSize(free, units) : null} sub="somando todas as unidades" tone={total && free / total < 0.15 ? 'danger' : undefined} />
        <Kpi icon={<Radar size={16} />} label="Apps sem uso" value={apps ? fmtNum(stale.length) : null} sub={apps ? `${fmtSize(staleSize, units)} recuperáveis · ${settings?.staleMonths}+ meses` : 'lendo programas…'} tone="warn" onClick={() => go('discover')} />
      </div>

      {/* Mapa do armazenamento: o que ocupa o disco do sistema, por tipo de conteúdo */}
      <div className="mt-4">
        <StorageMapCard drives={drives} apps={apps} />
      </div>

      {/* Insights da varredura ativa */}
      {active ? <ScanInsights key={active.id} /> : (
        <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-lg border border-dashed border-line bg-surface p-6 text-center md:flex-row md:text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent"><Sparkles size={18} /></div>
            <div>
              <div className="text-[13px] font-medium text-fg">Analise um disco para ver as sugestões</div>
              <div className="text-xs text-muted">Depois da análise, esta área mostra os tipos de arquivo, as maiores pastas, os arquivos antigos e o que você pode limpar.</div>
            </div>
          </div>
          {real[0] && <Button variant="primary" onClick={() => startScan(real[0].root)}>Analisar {isMac ? real[0].label || real[0].root : driveTag(real[0].root)} agora</Button>}
        </div>
      )}

      {/* Tendência + apps + recentes */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <Trend history={history} root={active?.root || settings?.recent[0]} units={units} onOpen={() => go('history')} />
        <Card title={<span className="flex items-center gap-2"><PackageX size={14} /> Maiores programas</span>} actions={<Button size="sm" variant="ghost" onClick={() => openUninstaller(go, 'size:false')}>Ver todos <ArrowRight size={12} /></Button>}>
          {!apps ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-9 rounded-md" />)}</div> : (
            <div className="-mx-1 space-y-0.5">
              {bigApps.map((a) => (
                <button key={a.id} onClick={() => openDossier({ kind: 'app', app: a })} onMouseEnter={() => prefetchDossier(a)} onMouseLeave={cancelPrefetch} title="Ver o dossiê" className="flex w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-hover">
                  <AppIcon app={a} size={34} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] text-fg">{a.name}</span><span className="block truncate text-[11px] text-faint">Último uso: {fmtRelative(a.lastUsed)}</span></span>
                  <span className="text-xs font-medium text-fg tnum">{fmtSize(a.size, units)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-2"><Sparkles size={14} /> Instalados recentemente</span>} actions={<Button size="sm" variant="ghost" onClick={() => openUninstaller(go, 'installDate:false')}>Ver todos <ArrowRight size={12} /></Button>}>
          <RecentInstalls apps={apps} n={5} compact />
        </Card>
        <Card title={<span className="flex items-center gap-2"><Clock size={14} /> Varreduras recentes</span>}>
          {settings?.recent.length ? (
            <div className="-mx-2 space-y-0.5">
              {settings.recent.slice(0, 7).map((r) => (
                <button key={r} onClick={() => startScan(r)} className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-fg transition-colors hover:bg-hover">
                  <FolderOpen size={14} className="shrink-0 text-muted" /><span className="flex-1 truncate">{r}</span>
                  <ArrowRight size={12} className="text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          ) : <div className="text-xs text-muted">Nenhuma ainda.</div>}
        </Card>
      </div>
    </PageBody>
  );
}

function Kpi({ icon, label, value, sub, tone, bar, onClick }: { icon: React.ReactNode; label: string; value: React.ReactNode | null; sub?: React.ReactNode; tone?: 'warn' | 'danger'; bar?: number; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="group flex flex-col justify-start rounded-lg border border-line bg-surface p-4 text-left transition-all duration-200 hover:border-line-strong enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg enabled:hover:shadow-black/5 disabled:cursor-default">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className={cx('flex h-7 w-7 items-center justify-center rounded-md', tone === 'warn' ? 'bg-warn-soft text-warn' : tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent')}>{icon}</span>
      </div>
      {value === null ? <div className="skeleton mt-2 h-7 w-28 rounded" /> : <div className="mt-1 text-2xl font-semibold tracking-tight text-fg tnum">{value}</div>}
      {bar != null && <ProgressBar value={bar} className="mt-2 h-1" tone={bar > 0.9 ? 'var(--danger)' : bar > 0.75 ? 'var(--warn)' : undefined} />}
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </button>
  );
}

/** Lixeira(s) dentro da raiz varrida, em ordem de preferência. */
function trashPaths(root: string, home?: string): [string, string?] {
  if (!isMac) return [joinPath(root, '$Recycle.Bin')];
  return [home ? joinPath(home, '.Trash') : joinPath(root, '.Trash'), joinPath(root, '.Trashes')];
}

function ScanInsights() {
  const { active, settings, go, select, tick, info } = useApp();
  const units = settings?.units || 'auto';
  const id = active!.id;
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const q = (m: string, ...a: any[]) => cc.scanQuery<any>(id, m, ...a);
    const year = Date.now() - 365 * DAY;
    (async () => {
      const [summary, ext, kids, top, age] = await Promise.all([q('summary'), q('extStats', 0), q('children', 0, { sortBy: 'size' }), q('topFiles', 0, 6), q('ageStats', 0, 'mtime')]);
      void year;
      const [clean, recycleId] = await Promise.all([
        q('cleanupStats'),
        q('findPath', trashPaths(active!.root, info?.home)[0]),
      ]);
      // macOS: a Lixeira do usuário fica em ~/.Trash; a de discos externos em <volume>/.Trashes
      const alt = trashPaths(active!.root, info?.home)[1];
      const trashId = recycleId >= 0 ? recycleId : alt ? await q('findPath', alt) : -1;
      const recycle = trashId >= 0 ? await q('nodeInfo', trashId) : null;
      if (alive) setD({ summary, ext, kids, top, age, clean, recycle });
    })().catch(() => {});
    return () => { alive = false; };
  }, [id, active?.done, Math.floor(tick / 4)]); // eslint-disable-line -- durante a varredura, atualiza a cada ~5 s

  const cats = useMemo(() => {
    const m = new Map<string, { label: string; color: string; value: number }>();
    for (const e of d?.ext || []) { const c = categoryOf(e.ext); const r = m.get(c.key) || { label: c.label, color: c.color, value: 0 }; r.value += e.size; m.set(c.key, r); }
    return [...m.values()].sort((a, b) => b.value - a.value);
  }, [d?.ext]);
  const sum = (rows?: Row[]) => (rows || []).reduce((s, r) => s + r.size, 0);
  const AGE_COLORS = ['#10b981', '#34d399', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444'];
  const ageTotal = (d?.age?.buckets || []).reduce((s: number, b: any) => s + b.size, 0) || 1;
  const oldShare = d ? (d.age.buckets.slice(3).reduce((s: number, b: any) => s + b.size, 0)) / ageTotal : 0;

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-fg">Insights de {active!.root}</h2>
        {!active!.done ? <Badge tone="accent"><Loader2 size={11} className="animate-spin" /> varrendo · {fmtNum(active!.progress?.files)} arquivos</Badge>
          : <Badge>{fmtNum(d?.summary?.files)} arquivos · {fmtNum(d?.summary?.dirs)} pastas · {fmtSize(d?.summary?.size, units)}</Badge>}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" icon={<LayoutGrid size={13} />} onClick={() => { select(0); go('visual'); }}>Treemap</Button>
        <Button size="sm" variant="ghost" onClick={() => { select(0); go('explorer'); }}>Explorador <ArrowRight size={12} /></Button>
      </div>

      {/* Oportunidades de limpeza */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Opportunity icon={<Trash2 size={16} />} label="Lixeira" value={d ? (d.recycle?.err ? '—' : fmtSize(d.recycle?.size || 0, units)) : null} sub={d?.recycle ? (d.recycle.err ? 'sem acesso de leitura' : `${fmtNum(d.recycle.files)} itens`) : 'não encontrada'} action="Abrir" onClick={() => { if (d?.recycle) { select(d.recycle.id); go('explorer'); } }} />
        <Opportunity icon={<FileX2 size={16} />} label="Temporários e logs" value={d ? fmtSize(d.clean.tempSize, units) : null} sub={d ? `${fmtNum(d.clean.tempCount)} arquivos` : ''} action="Revisar" onClick={() => go('search')} />
        <Opportunity icon={<Archive size={16} />} label="Grandes, sem mudança há 1 ano" value={d ? fmtSize(d.clean.oldSize, units) : null} sub={d ? `${fmtNum(d.clean.oldCount)} arquivos > 100 MB` : ''} action="Ver" onClick={() => go('age')} />
        <Opportunity icon={<FolderX size={16} />} label="Pastas vazias" value={d ? fmtNum(d.clean.empty) : null} sub="sem nenhum arquivo dentro" action="Listar" onClick={() => go('search')} />
        <Opportunity icon={<Copy size={16} />} label="Duplicados" value="Procurar" sub="comparação por SHA-1" action="Abrir" onClick={() => go('duplicates')} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <Card title={<span className="flex items-center gap-2"><PieChart size={14} /> Por categoria</span>} actions={<Button size="sm" variant="ghost" onClick={() => go('types')}>Detalhes</Button>}>
          {d ? (
            <div className="flex flex-col items-center gap-3">
              <Donut size={160} thickness={26} data={cats.slice(0, 8)} center={<><div className="text-[11px] text-muted">Total</div><div className="text-sm font-semibold">{fmtSize(d.summary.size, units)}</div></>} />
              <div className="w-full"><Legend items={cats.slice(0, 6).map((c) => ({ label: c.label, color: c.color, value: fmtSize(c.value, units) }))} /></div>
            </div>
          ) : <Skel />}
        </Card>
        <Card title={<span className="flex items-center gap-2"><Folder size={14} /> Maiores pastas</span>} actions={<Button size="sm" variant="ghost" onClick={() => go('explorer')}>Explorar</Button>}>
          {d ? <BarList units={units} items={(d.kids as Row[]).filter((r) => r.kind === 'dir').slice(0, 7).map((r, i) => ({ key: r.id, label: r.name, value: r.size, sub: fmtPct(r.pct, 0), color: PALETTE[i % PALETTE.length] }))} onClick={(rid) => { select(rid); go('explorer'); }} /> : <Skel />}
        </Card>
        <Card title={<span className="flex items-center gap-2"><ArrowDownWideNarrow size={14} /> Maiores arquivos</span>} actions={<Button size="sm" variant="ghost" onClick={() => go('top')}>Top 100</Button>}>
          {d ? (
            <div className="-mx-1 space-y-0.5">
              {(d.top as Row[]).map((f) => (
                <button key={f.id} onClick={() => cc.showInFolder(f.path!)} title={f.path} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-hover">
                  <File size={14} className="shrink-0" style={{ color: categoryOf(f.name.split('.').pop()?.toLowerCase() || '').color }} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] text-fg">{f.name}</span><span className="block truncate text-[11px] text-faint">{baseName(f.dir || '')}</span></span>
                  <span className="text-xs font-medium text-fg tnum">{fmtSize(f.size, units)}</span>
                </button>
              ))}
            </div>
          ) : <Skel />}
        </Card>
        <Card title={<span className="flex items-center gap-2"><CalendarClock size={14} /> Idade dos dados</span>} actions={<Button size="sm" variant="ghost" onClick={() => go('age')}>Detalhes</Button>}>
          {d ? (<>
            <div className="mb-3 flex h-3 overflow-hidden rounded-full">
              {d.age.buckets.map((b: any, i: number) => <div key={b.key} title={`${b.label}: ${fmtPct(b.size / ageTotal)}`} style={{ width: `${(b.size / ageTotal) * 100}%`, background: AGE_COLORS[i] }} className="transition-[width] duration-700" />)}
            </div>
            <div className="mb-3 text-xs text-muted"><b className="text-fg">{fmtPct(oldShare, 0)}</b> do espaço está em arquivos que ninguém muda há mais de 6 meses.</div>
            <div className="space-y-1">
              {d.age.buckets.map((b: any, i: number) => (
                <div key={b.key} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: AGE_COLORS[i] }} />
                  <span className="flex-1 text-fg">{b.label}</span>
                  <span className="text-muted tnum">{fmtSize(b.size, units)}</span>
                </div>
              ))}
            </div>
          </>) : <Skel />}
        </Card>
      </div>
    </div>
  );
}

function Opportunity({ icon, label, value, sub, action, onClick }: { icon: React.ReactNode; label: string; value: React.ReactNode | null; sub?: string; action: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex flex-col justify-start rounded-lg border border-line bg-surface p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg hover:shadow-black/5">
      <div className="flex items-center gap-2 text-xs text-muted"><span className="text-accent">{icon}</span>{label}</div>
      {value === null ? <div className="skeleton mt-2 h-6 w-20 rounded" /> : <div className="mt-1.5 text-lg font-semibold text-fg tnum">{value}</div>}
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-faint">
        <span className="truncate">{sub}</span>
        <span className="flex shrink-0 items-center gap-0.5 text-accent opacity-0 transition-opacity group-hover:opacity-100">{action} <ArrowRight size={11} /></span>
      </div>
    </button>
  );
}

function Skel() { return <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-6 rounded" />)}</div>; }

function Trend({ history, root, units, onOpen }: { history: any[]; root?: string; units: string; onOpen: () => void }) {
  const pts = useMemo(() => history.filter((h) => root && h.root.toLowerCase() === root.toLowerCase()).sort((a, b) => a.date - b.date).slice(-20), [history, root]);
  const W = 420, H = 150, P = 8;
  const min = Math.min(...pts.map((p) => p.size)), max = Math.max(...pts.map((p) => p.size));
  const span = max - min || max * 0.05 || 1;
  const xy = pts.map((p, i) => [P + (pts.length === 1 ? (W - 2 * P) / 2 : (i / (pts.length - 1)) * (W - 2 * P)), H - P - ((p.size - (min - span * 0.15)) / (span * 1.3)) * (H - 2 * P)]);
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const delta = pts.length > 1 ? pts[pts.length - 1].size - pts[0].size : 0;
  return (
    <Card title={<span className="flex items-center gap-2"><History size={14} /> Tendência {root ? `· ${root}` : ''}</span>} actions={<Button size="sm" variant="ghost" onClick={onOpen}>Histórico</Button>}>
      {pts.length < 2 ? (
        <div className="flex h-[170px] flex-col items-center justify-center text-center text-xs text-muted">
          <TrendingUp size={20} className="mb-2 text-faint" />
          {pts.length === 1 ? 'Existe apenas uma análise salva desta pasta. Para ver a evolução, analise a pasta de novo mais tarde.' : 'Para acompanhar como o uso cresce com o tempo, salve as análises no histórico.'}
        </div>
      ) : (<>
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-xl font-semibold text-fg tnum">{fmtSize(pts[pts.length - 1].size, units)}</span>
          <span className={cx('flex items-center gap-1 text-xs tnum', delta > 0 ? 'text-danger' : 'text-accent')}>{delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{delta > 0 ? '+' : ''}{fmtSize(delta, units)} desde {fmtDate(pts[0].date)}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[140px] w-full overflow-visible">
          <defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".35" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
          <path d={`${line} L${xy[xy.length - 1][0]},${H} L${xy[0][0]},${H} Z`} fill="url(#trendFill)" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {xy.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2"><title>{`${fmtDate(pts[i].date, true)}: ${fmtSize(pts[i].size, units)}`}</title></circle>)}
        </svg>
      </>)}
    </Card>
  );
}
