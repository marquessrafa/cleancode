import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, PieChart, BarChart3, ArrowUp } from 'lucide-react';
import { useApp, useScanQuery } from '../lib/store';
import { cc, Drive, Row, SEP } from '../lib/api';
import { fmtSize, fmtPct, categoryOf, PALETTE, CATEGORIES, OTHER } from '../lib/format';
import { useFileActions } from '../lib/actions';
import { Button, Card, cx, openContextMenu, PageHeader, Segmented, Toggle } from '../components/ui';
import { BarList, Donut, Legend, PageBody, ScopeBar } from './common';
import { t as tr } from '../lib/i18n';

interface TNode { id: number; name: string; size: number; kind: string; ext?: string; children?: TNode[] }
interface Rect { x: number; y: number; w: number; h: number; node: TNode; depth: number; color: string; leaf: boolean }

function squarify(nodes: TNode[], x: number, y: number, w: number, h: number): { node: TNode; x: number; y: number; w: number; h: number }[] {
  const out: { node: TNode; x: number; y: number; w: number; h: number }[] = [];
  const items = nodes.filter((n) => n.size > 0).sort((a, b) => b.size - a.size);
  const total = items.reduce((s, n) => s + n.size, 0);
  if (!total || w <= 0 || h <= 0) return out;
  const scale = (w * h) / total;
  let i = 0;
  while (i < items.length) {
    const short = Math.min(w, h);
    const row: TNode[] = [];
    let rowSum = 0, worst = Infinity;
    while (i < items.length) {
      const n = items[i];
      const s = rowSum + n.size * scale;
      const rmax = Math.max(...row.map((r) => r.size * scale), n.size * scale);
      const rmin = Math.min(...row.map((r) => r.size * scale), n.size * scale);
      const wst = Math.max((short * short * rmax) / (s * s), (s * s) / (short * short * rmin));
      if (row.length && wst > worst) break;
      row.push(n); rowSum = s; worst = wst; i++;
    }
    const thick = rowSum / short;
    let off = 0;
    for (const n of row) {
      const len = (n.size * scale) / thick;
      if (w >= h) out.push({ node: n, x, y: y + off, w: thick, h: len });
      else out.push({ node: n, x: x + off, y, w: len, h: thick });
      off += len;
    }
    if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
  }
  return out;
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function Treemap({ root, opts, dark, onPick, onContext }: { root: TNode; opts: any; dark: boolean; onPick: (n: TNode) => void; onContext: (e: React.MouseEvent, n: TNode) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [hover, setHover] = useState<{ r: Rect; x: number; y: number } | null>(null);
  const rects = useRef<Rect[]>([]);

  useEffect(() => {
    const el = wrap.current!; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvas.current!; const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr; cv.height = size.h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.w, size.h);
    const out: Rect[] = [];
    const HEADER = opts.hierarchy && opts.labels ? 15 : 0;
    const layout = (nodes: TNode[], x: number, y: number, w: number, h: number, depth: number, color: string | null) => {
      squarify(nodes, x, y, w, h).forEach((p, i) => {
        const c = p.node.kind === 'file' ? categoryOf(p.node.ext || '').color : p.node.kind === 'rest' ? (dark ? '#3a3a3a' : '#c8c8cc') : p.node.kind === 'free' ? (dark ? '#1f2937' : '#e5e7eb') : color || PALETTE[i % PALETTE.length];
        const kids = p.node.children?.filter((k) => k.size > 0) || [];
        const canNest = kids.length > 0 && p.w > 24 && p.h > 24 + HEADER;
        if (canNest && opts.hierarchy) {
          out.push({ ...p, depth, color: c, leaf: false });
          layout(kids, p.x + 2, p.y + HEADER + 1, p.w - 4, p.h - HEADER - 3, depth + 1, c);
        } else if (canNest) {
          layout(kids, p.x, p.y, p.w, p.h, depth + 1, c);
        } else out.push({ ...p, depth, color: c, leaf: true });
      });
    };
    layout(root.children?.length ? root.children : [root], 0, 0, size.w, size.h, 0, null);
    rects.current = out;
    for (const r of out) {
      const lift = Math.min(0.5, r.depth * 0.12);
      const base = r.leaf ? shade(r.color, dark ? -0.15 + lift * 0.4 : lift) : shade(r.color, dark ? -0.55 : 0.55);
      if (r.leaf && opts.cushion && r.w > 3 && r.h > 3) {
        const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
        g.addColorStop(0, shade(r.color, dark ? 0.1 + lift * 0.3 : 0.35 + lift * 0.3));
        g.addColorStop(1, shade(r.color, dark ? -0.45 : -0.2));
        ctx.fillStyle = g;
      } else ctx.fillStyle = base;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = dark ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      if (opts.labels) {
        ctx.save();
        ctx.beginPath(); ctx.rect(r.x + 2, r.y, r.w - 4, r.h); ctx.clip();
        if (!r.leaf && r.w > 40) {
          ctx.fillStyle = dark ? '#e5e5e5' : '#1c1c1e';
          ctx.font = '600 11px Inter Variable, Segoe UI';
          ctx.fillText(`${r.node.name}  ${fmtSize(r.node.size, 'auto', 1)}`, r.x + 4, r.y + 11);
        } else if (r.leaf && r.w > 46 && r.h > 18) {
          ctx.fillStyle = 'rgba(255,255,255,.95)';
          ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 2;
          ctx.font = '500 11px Inter Variable, Segoe UI';
          ctx.fillText(r.node.name, r.x + 4, r.y + 14);
          if (r.h > 32) { ctx.font = '11px Inter Variable, Segoe UI'; ctx.fillText(fmtSize(r.node.size, 'auto', 1), r.x + 4, r.y + 28); }
        }
        ctx.restore();
      }
    }
  }, [root, size, opts, dark]);

  const hit = (e: React.MouseEvent) => {
    const b = canvas.current!.getBoundingClientRect();
    const x = e.clientX - b.left, y = e.clientY - b.top;
    let found: Rect | null = null;
    for (const r of rects.current) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) found = r; // o mais interno vence
    return found ? { r: found, x, y } : null;
  };
  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden rounded-md">
      <canvas
        ref={canvas} style={{ width: size.w, height: size.h }}
        onMouseMove={(e) => setHover(hit(e))} onMouseLeave={() => setHover(null)}
        onClick={(e) => { const h = hit(e); if (h) onPick(h.r.node); }}
        onContextMenu={(e) => { const h = hit(e); if (h) onContext(e, h.r.node); }}
      />
      {hover && (
        <div className="pointer-events-none absolute z-10 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-lg" style={{ left: Math.min(hover.x + 14, size.w - 230), top: Math.min(hover.y + 14, size.h - 60) }}>
          <div className="max-w-[220px] truncate font-medium text-fg">{hover.r.node.name}</div>
          <div className="text-muted tnum">{fmtSize(hover.r.node.size)} · {fmtPct(hover.r.node.size / (root.size || 1))}</div>
          <div className="text-faint">{hover.r.node.kind === 'file' ? tr("Arquivo") : hover.r.node.kind === 'dir' ? tr("Pasta (clique para entrar)") : hover.r.node.kind === 'free' ? tr("Espaço livre") : tr("Itens pequenos agrupados")}</div>
        </div>
      )}
    </div>
  );
}

export default function Visual() {
  const { active, settings, setSettings, select, dark } = useApp();
  const [tab, setTab] = useState<'treemap' | 'pie' | 'bar'>('treemap');
  const tm = settings!.treemap;
  const nodeId = active!.selected < 0 ? 0 : active!.selected;
  const detail = { 1: 0.02, 2: 0.008, 3: 0.003, 4: 0.001, 5: 0.0003 }[tm.depth >= 5 ? 5 : (tm.depth as 1 | 2 | 3 | 4)] ?? 0.002;
  const { data: tree } = useScanQuery<TNode>('treemap', [nodeId, { maxDepth: tm.depth + 1, minFrac: detail, showFiles: tm.showFiles }]);
  const { data: kids } = useScanQuery<Row[]>('children', [nodeId, { sortBy: 'size' }]);
  const [drives, setDrives] = useState<Drive[]>([]);
  useEffect(() => { cc.drives().then(setDrives); }, []);
  const actions = useFileActions();
  const setTm = (p: any) => setSettings({ treemap: { ...tm, ...p } });

  const root = useMemo(() => {
    if (!tree) return null;
    // junta cadeias de pastas com um único filho ("Steam\steamapps\common") para não empilhar cabeçalhos
    const squash = (n: TNode): TNode => {
      let cur = n, name = n.name;
      for (;;) {
        if (cur.kind !== 'dir' || !cur.children?.length) break;
        const big = [...cur.children].sort((a, b) => b.size - a.size)[0];
        // segue o filho dominante quando o resto é desprezível (< 2%)
        if (big.kind !== 'dir' || !big.children?.length || big.size < cur.size * 0.98) break;
        cur = big; name += SEP + cur.name;
      }
      return { ...cur, name: cur === n ? n.name : name, size: n.size, children: cur.children?.map(squash) };
    };
    const t: TNode = { ...tree, children: tree.children?.map(squash) };
    const d = drives.find((x) => x.root.toLowerCase() === active!.root.toLowerCase());
    const isDriveRoot = nodeId === 0 && !!d; // a varredura é de uma unidade inteira
    if (tm.freeSpace && isDriveRoot && d) return { ...t, size: t.size + d.free, children: [...(t.children || []), { id: -999999, name: tr("Espaço livre"), size: d.free, kind: 'free' }] };
    return t;
  }, [tree, tm.freeSpace, drives, nodeId, active]);

  const pick = (n: TNode) => { if (n.kind === 'dir' && n.id !== nodeId) select(n.id); };
  const ctx = async (e: React.MouseEvent, n: TNode) => {
    e.persist?.(); e.preventDefault();
    if (n.kind === 'free' || n.kind === 'rest') return;
    const path = await cc.scanQuery<string>(active!.id, 'pathOf', n.id);
    openContextMenu(e, actions.menu([{ id: n.id, path, name: n.name, size: n.size, kind: n.kind === 'file' ? 'file' : 'dir' }]));
  };

  const top = (kids || []).slice(0, 11);
  const rest = (kids || []).slice(11).reduce((s, r) => s + r.size, 0);
  const pieData = [...top.map((r, i) => ({ label: r.name, value: r.size, color: PALETTE[i % PALETTE.length], id: r.id, kind: r.kind })), ...(rest > 0 ? [{ label: tr("Outros"), value: rest, color: '#94a3b8', id: -1, kind: 'rest' }] : [])];
  const total = (kids || []).reduce((s, r) => s + r.size, 0);

  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col">
      <div className="px-6 pt-6">
        <PageHeader title={tr("Visualizações")} icon={<LayoutGrid size={18} />} description={tr("Mostra a pasta selecionada em blocos, em pizza ou em barras. Clique numa pasta para entrar nela.")}
          actions={<Segmented value={tab} onChange={setTab} options={[
            { value: 'treemap', label: <><LayoutGrid size={13} /> {tr("Treemap")}</> }, { value: 'pie', label: <><PieChart size={13} /> {tr("Pizza")}</> }, { value: 'bar', label: <><BarChart3 size={13} /> {tr("Barras")}</> },
          ]} />} />
        <ScopeBar right={nodeId > 0 && <Button size="sm" variant="ghost" icon={<ArrowUp size={13} />} onClick={async () => { const n: any = await cc.scanQuery(active!.id, 'nodeInfo', nodeId); select(n.parent); }}>{tr("Subir")}</Button>} />
      </div>
      {tab === 'treemap' ? (
        <div className="flex min-h-0 flex-1 gap-4 px-6 pb-6">
          <div className="min-w-0 flex-1 rounded-lg border border-line bg-surface p-1.5">
            {root ? <Treemap root={root} opts={tm} dark={dark} onPick={pick} onContext={ctx} /> : <div className="skeleton h-full rounded-md" />}
          </div>
          <div className="w-60 shrink-0 space-y-1 overflow-y-auto rounded-lg border border-line bg-surface p-4">
            <div className="mb-2 text-xs font-medium text-muted">{tr("Opções do treemap")}</div>
            <div className="text-xs text-muted">{tr("Nível de detalhe")}</div>
            <input type="range" min={1} max={5} value={tm.depth} onChange={(e) => setTm({ depth: +e.target.value })} className="w-full accent-[var(--accent)]" />
            <Toggle checked={tm.showFiles} onChange={(v) => setTm({ showFiles: v })} label={tr("Arquivos individuais")} />
            <Toggle checked={tm.hierarchy} onChange={(v) => setTm({ hierarchy: v })} label={tr("Mostrar hierarquia")} />
            <Toggle checked={tm.labels} onChange={(v) => setTm({ labels: v })} label={tr("Rótulos")} />
            <Toggle checked={tm.cushion} onChange={(v) => setTm({ cushion: v })} label={tr("Efeito 3D (relevo)")} />
            <Toggle checked={tm.freeSpace} onChange={(v) => setTm({ freeSpace: v })} label={tr("Espaço livre da unidade")} hint={tr("Funciona apenas quando você está na raiz de um disco")} />
            {tm.showFiles && (
              <div className="pt-3"><div className="mb-1.5 text-xs font-medium text-muted">{tr("Legenda")}</div>
                <Legend items={[...CATEGORIES, OTHER].map((c) => ({ label: c.label, color: c.color }))} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <PageBody className="pt-0">
          <div className="-mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr]">
            {tab === 'pie' ? (
              <>
                <Card className="flex items-center justify-center">
                  <Donut data={pieData} size={300} thickness={56} center={<><div className="text-xs text-muted">{tr("Total")}</div><div className="text-lg font-semibold">{fmtSize(total)}</div></>} />
                </Card>
                <Card title={tr("Legenda")}>
                  <Legend items={pieData.map((d) => ({ label: d.label, color: d.color, value: `${fmtSize(d.value)} · ${fmtPct(d.value / (total || 1))}` }))} />
                </Card>
              </>
            ) : (
              <Card title={tr("Subpastas e arquivos por tamanho")} className="lg:col-span-2">
                <BarList items={(kids || []).slice(0, 30).map((r, i) => ({ key: r.id, label: <span className={cx(r.kind === 'dir' && 'font-medium')}>{r.name}</span>, value: r.size, sub: fmtPct(r.pct), color: PALETTE[i % PALETTE.length] }))}
                  onClick={(id) => { const r = kids!.find((k) => k.id === id); if (r?.kind === 'dir') select(id); }} />
              </Card>
            )}
          </div>
        </PageBody>
      )}
    </div>
  );
}
