// Painel da barra de menus (macOS) / bandeja (Windows): saúde do computador em tempo real.
// Cada cartão abre um painel de detalhe que desliza de trás do painel principal para a esquerda.
// Cores derivadas da cor de destaque escolhida no CleanCode.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  HardDrive, MemoryStick, Cpu, Wifi, Cable, Bluetooth, BatteryFull, BatteryMedium, BatteryLow, BatteryCharging, PlugZap,
  ShieldCheck, BellOff, Sparkles, Settings, AppWindow, ArrowUp, ArrowDown, Thermometer, ChevronRight,
  Heart, Clock, Trash2, Usb, ArrowUpRight, Gauge, Loader2, Gpu, Zap, Monitor,
} from 'lucide-react';
import { cc, MetricsSnapshot, SpeedProgress, Settings as AppSettings, isMac } from '../lib/api';
import { fmtSize } from '../lib/format';
import { t as tr, LOCALE } from '../lib/i18n';

type Detail = 'storage' | 'memory' | 'battery' | 'cpu' | 'gpu' | 'power' | 'network' | 'devices';
const PAD = 10, MAIN_W = 448, DETAIL_W = 436, GAP = 12;
const TOTAL_W = PAD * 2 + MAIN_W + GAP + DETAIL_W;

// ---------- utilidades ----------
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
/** Valor animado até o alvo (from0: começa do zero, para os números "contarem" ao abrir). */
function useTween(target: number, ms = 600, from0 = false) {
  const [v, setV] = useState(from0 ? 0 : target);
  const from = useRef(from0 ? 0 : target);
  useEffect(() => {
    const start = performance.now(), a = from.current, b = target;
    let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3), cur = a + (b - a) * e; setV(cur); from.current = cur; if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
/** true dois quadros depois de montar: dispara as transições de entrada (arcos, segmentos). */
function useMounted() {
  const [on, setOn] = useState(false);
  useEffect(() => { let r2 = 0; const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setOn(true)); }); return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); }; }, []);
  return on;
}
const rate = (bps: number) => (bps < 1024 ? `${Math.round(bps)} B/s` : bps < 1048576 ? `${(bps / 1024).toLocaleString(LOCALE, { maximumFractionDigits: 0 })} KB/s` : `${(bps / 1048576).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} MB/s`);
const mbps = (v?: number) => (v === undefined ? '—' : v.toLocaleString(LOCALE, { maximumFractionDigits: v < 10 ? 1 : 0 }));
const pct1 = (v: number) => v.toLocaleString(LOCALE, { maximumFractionDigits: 1 });
const tempTone = (t?: number) => (t === undefined ? 'text-[var(--p-muted)]' : t >= 90 ? 'text-[var(--p-danger)]' : t >= 75 ? 'text-[var(--p-warn)]' : 'text-[var(--p-ok)]');
const sizeParts = (n: number, dec = 2) => { const [num, unit] = fmtSize(n, 'auto', dec).split(' '); return { num, unit }; };
const days = (s: number) => { const d = Math.floor(s / 86400), h = Math.floor(s / 3600); return d >= 1 ? `${d} ${d === 1 ? 'dia' : 'dias'}` : h >= 1 ? `${h} h` : `${Math.max(1, Math.floor(s / 60))} min`; };

const TIPS: { title: string; text: string; action: string; page: string }[] = [
  { title: tr("Cuidados em um clique"), text: tr("Limpeza, proteção, desempenho e apps esquecidos numa análise só."), action: tr("Analisar"), page: 'smartcare' },
  { title: tr("Veja o que mais ocupa espaço"), text: tr("O treemap mostra num relance as pastas que cresceram demais."), action: tr("Abrir treemap"), page: 'visual' },
  { title: tr("Apps esquecidos"), text: tr("Descubra programas que você não abre há meses e quanto espaço liberam."), action: tr("Ver apps"), page: 'discover' },
  { title: tr("Fotos parecidas e duplicados"), text: tr("Cópias e sequências de fotos somam gigabytes sem você perceber."), action: tr("Ver acúmulos"), page: 'clutter' },
  { title: tr("Arquivos grandes e antigos"), text: tr("Os arquivos parados há mais de um ano costumam ser os primeiros a sair."), action: tr("Ver idade"), page: 'age' },
  { title: tr("Compare com o mês passado"), text: tr("O histórico mostra exatamente o que cresceu desde a última análise."), action: tr("Abrir histórico"), page: 'history' },
];

// ---------- peças da coluna principal ----------
function Card({ children, className, delay = 0, onClick, active }: { children: React.ReactNode; className?: string; delay?: number; onClick?: () => void; active?: boolean }) {
  return (
    <div onClick={onClick} style={{ animationDelay: `${delay}ms` }}
      className={cx('anim-rise relative rounded-2xl border px-4 py-3.5 backdrop-blur-xl transition-all duration-300',
        active ? 'border-[var(--p-accent)] bg-[var(--p-card-hover)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--p-accent)_22%,transparent)]' : 'border-[var(--p-line)] bg-[var(--p-card)]',
        onClick && 'cursor-pointer hover:bg-[var(--p-card-hover)]', className)}>
      {children}
    </div>
  );
}
function Action({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={(e) => { e.stopPropagation(); onClick(); }} className="text-[13px] font-semibold text-[var(--p-accent)] transition-opacity hover:opacity-80">{children}</button>;
}
function Bar({ value, tone, className }: { value: number; tone?: string; className?: string }) {
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-[var(--p-track)]', className)}>
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: tone || 'var(--p-accent)' }} />
    </div>
  );
}
function Spark({ data, w = 140, h = 30, max = 100 }: { data: number[]; w?: number; h?: number; max?: number }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const top = Math.max(max, ...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - (v / top) * (h - 3) - 1.5]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const id = `sp${w}${h}`;
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--p-accent)" stopOpacity=".35" /><stop offset="100%" stopColor="var(--p-accent)" stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="var(--p-accent)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
function HealthRing({ level }: { level: MetricsSnapshot['health']['level'] }) {
  const color = level === 'good' ? 'var(--p-accent)' : level === 'fair' ? 'var(--p-warn)' : 'var(--p-danger)';
  return (
    <div className="relative h-14 w-14 shrink-0">
      <div className="absolute inset-0 rounded-full opacity-40 blur-md anim-breathe" style={{ background: color }} />
      <svg viewBox="0 0 56 56" className="relative h-14 w-14 anim-spin-slow">
        <circle cx="28" cy="28" r="22" fill="none" stroke="var(--p-track)" strokeWidth="6" />
        <circle cx="28" cy="28" r="22" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${level === 'good' ? 100 : level === 'fair' ? 70 : 40} 200`} transform="rotate(-90 28 28)" />
        <circle cx="28" cy="28" r="22" fill="none" stroke={color} strokeOpacity=".45" strokeWidth="6" strokeLinecap="round" strokeDasharray="8 200" strokeDashoffset="-112" transform="rotate(-90 28 28)" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center"><div className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /></div>
    </div>
  );
}

// ---------- peças dos detalhes ----------
const glow = (c: string, a = 55) => `drop-shadow(0 0 6px color-mix(in srgb, ${c} ${a}%, transparent))`;

/** Anel em segmentos que se desenham um depois do outro ao abrir. */
function Donut({ parts, total, size = 196, stroke = 26, children }: { parts: { label: string; value: number; color: string }[]; total: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const on = useMounted();
  const r = (size - stroke) / 2 - 4, c = 2 * Math.PI * r, mid = size / 2;
  const visible = parts.filter((p) => p.value > 0);
  const gap = visible.length > 1 ? 3 : 0;
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle cx={mid} cy={mid} r={r - stroke / 2} fill="var(--p-disc)" />
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--p-track)" strokeWidth={stroke} />
        {parts.map((p, i) => {
          const len = total > 0 ? (Math.max(0, p.value) / total) * c : 0;
          const start = acc; acc += len;
          const draw = len > gap ? len - gap : len;
          return (
            <circle key={p.label} cx={mid} cy={mid} r={r} fill="none" stroke={p.color} strokeWidth={stroke}
              strokeDasharray={`${on ? draw : 0} ${c}`} strokeDashoffset={-start}
              style={{ transition: `stroke-dasharray .95s cubic-bezier(.22,1,.36,1) ${i * 120}ms, stroke-dashoffset .95s cubic-bezier(.22,1,.36,1)`, filter: glow(p.color) }} />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-9 text-center">{children}</div>
    </div>
  );
}

/** Anel da bateria: segmentos que acendem em sequência até a carga atual. */
function SegRing({ pct, size = 196, n = 40, color = 'var(--p-accent)', children }: { pct: number; size?: number; n?: number; color?: string; children?: React.ReactNode }) {
  const on = useMounted();
  const mid = size / 2, th = 26, r = mid - 4;
  const segW = (2 * Math.PI * (r - th / 2)) / n - 3.2;
  const lit = Math.round((Math.max(0, Math.min(100, pct)) / 100) * n);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="overflow-visible">
        <circle cx={mid} cy={mid} r={r - th - 2} fill="var(--p-disc)" />
        {Array.from({ length: n }, (_, i) => {
          const isLit = i < lit;
          return (
            <rect key={i} x={mid - segW / 2} y={mid - r} width={segW} height={th} rx={1.5} transform={`rotate(${(i * 360) / n} ${mid} ${mid})`}
              fill={on && isLit ? color : 'var(--p-track)'}
              style={{ transition: `fill .28s ease ${on ? i * 22 : 0}ms`, filter: on && isLit ? glow(color, 45) : undefined }} />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/** Pequeno anel de progresso (dispositivos e discos externos). */
function MiniRing({ value, size = 54, color = 'var(--p-accent)', children }: { value?: number; size?: number; color?: string; children?: React.ReactNode }) {
  const on = useMounted();
  const stroke = 4, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--p-track)" strokeWidth={stroke} />
        {value !== undefined && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${on ? (Math.max(0, Math.min(100, value)) / 100) * c : 0} ${c}`} style={{ transition: 'stroke-dasharray .9s cubic-bezier(.22,1,.36,1)' }} />}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/** Linha com área, grade opcional e marcador no último ponto; a linha se traça ao abrir. */
function LineChart({ series, w, h, grid, max }: { series: { data: number[]; color: string }[]; w: number; h: number; grid?: boolean; max?: number }) {
  const longest = Math.max(0, ...series.map((s) => s.data.length));
  const n = Math.min(60, Math.max(12, longest));
  const top = max ?? Math.max(1, ...series.flatMap((s) => s.data)) * 1.15;
  const X = (i: number, len: number) => ((i + n - len) / (n - 1)) * w;
  const Y = (v: number) => h - (Math.min(top, v) / top) * (h - 6) - 3;
  const uid = useMemo(() => Math.random().toString(36).slice(2), []);
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>{series.map((s, k) => <linearGradient key={k} id={`lc${uid}${k}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity=".38" /><stop offset="100%" stopColor={s.color} stopOpacity="0" /></linearGradient>)}</defs>
      {grid && (
        <g stroke="var(--p-grid)" strokeWidth="1">
          {Array.from({ length: 17 }, (_, i) => <line key={`v${i}`} x1={(i / 16) * w} x2={(i / 16) * w} y1={0} y2={h} />)}
          {Array.from({ length: 10 }, (_, i) => <line key={`h${i}`} x1={0} x2={w} y1={(i / 9) * h} y2={(i / 9) * h} />)}
        </g>
      )}
      {series.map((s, k) => {
        const d = s.data.slice(-n);
        if (d.length < 2) return null;
        const line = d.map((v, i) => `${i ? 'L' : 'M'}${X(i, d.length).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
        const lx = X(d.length - 1, d.length), ly = Y(d[d.length - 1]);
        return (
          <g key={k}>
            <path d={`${line} L${lx},${h} L${X(0, d.length)},${h} Z`} fill={`url(#lc${uid}${k})`} className="anim-fade-slow" />
            <path d={line} pathLength={1} className="anim-draw" fill="none" stroke={s.color} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" style={{ filter: glow(s.color, 40) }} />
            <rect x={lx - 3.5} y={ly - 3.5} width={7} height={7} fill={s.color} transform={`rotate(45 ${lx} ${ly})`} className="anim-fade-slow" />
          </g>
        );
      })}
    </svg>
  );
}

/** Quadro com cabeçalho (ícone, título, valor), texto e "Saiba mais". */
function InfoCard({ icon, title, value, tone, text, link = tr("Saiba mais"), onLink, tint, delay = 0 }: { icon?: React.ReactNode; title: string; value?: React.ReactNode; tone?: string; text: React.ReactNode; link?: string; onLink?: () => void; tint?: string; delay?: number }) {
  return (
    <div className="anim-rise flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--p-line)]" style={{ animationDelay: `${delay}ms`, background: tint ? `linear-gradient(160deg, color-mix(in srgb, ${tint} 24%, transparent), var(--p-card) 75%)` : 'var(--p-card)' }}>
      {/* o título nunca encolhe por baixo do valor: quando os dois não cabem na mesma linha, o valor desce para a linha de baixo */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-[var(--p-line)] bg-[var(--p-card)] px-3.5 py-3">
        {icon}
        <span className="min-w-0 max-w-full shrink-0 grow break-words text-[14px] font-semibold leading-tight">{title}</span>
        {value !== undefined && <span className="ml-auto max-w-full shrink-0 break-all text-right text-[14px] font-semibold tabular-nums" style={{ color: tone }}>{value}</span>}
      </div>
      <div className="flex flex-1 flex-col px-3.5 pb-3 pt-2.5">
        <p className="flex-1 text-[12.5px] leading-snug text-[var(--p-soft)]">{text}</p>
        {onLink && <button onClick={onLink} className="mt-3 flex items-center gap-0.5 self-end text-[13px] font-semibold text-[var(--p-link)] transition-opacity hover:opacity-75">{link}<ArrowUpRight size={14} strokeWidth={2.4} /></button>}
      </div>
    </div>
  );
}
const SubTitle = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => <div className="anim-rise px-1 pb-2 pt-6 text-[17px] font-semibold text-[var(--p-soft)]" style={{ animationDelay: `${delay}ms` }}>{children}</div>;
function Legend({ items, delay = 0 }: { items: { label: string; value: string; color: string }[]; delay?: number }) {
  return (
    <div className="min-w-0 flex-1 space-y-3">
      {items.map((it, i) => (
        <div key={it.label} className="anim-rise flex gap-2.5" style={{ animationDelay: `${delay + i * 70}ms` }}>
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: it.color, boxShadow: `0 0 8px color-mix(in srgb, ${it.color} 60%, transparent)` }} />
          <div className="min-w-0"><div className="truncate text-[13px] text-[var(--p-soft)]">{it.label}</div><div className="text-[13.5px] font-semibold tabular-nums">{it.value}</div></div>
        </div>
      ))}
    </div>
  );
}
type TopApp = { name: string; cpu: number; mem: number; pids: number[]; icon?: string };
/** Maiores consumidores, com "Encerrar" (o segundo clique confirma). */
function Consumers({ list, by, unit, delay = 0 }: { list?: TopApp[]; by: 'cpu' | 'mem'; unit: string; delay?: number }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  return (
    <>
      <SubTitle delay={delay}>{tr("Maiores consumidores")}</SubTitle>
      <div className="anim-rise flex px-1 pb-1.5 text-[12.5px] text-[var(--p-muted)]" style={{ animationDelay: `${delay + 40}ms` }}><span className="flex-1">{tr("Nome do processo")}</span><span className="w-[84px] text-right">{unit}</span><span className="w-[86px]" /></div>
      {!list ? <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-[var(--p-muted)]" /></div> : list.filter((a) => !gone.has(a.name)).map((a, i) => {
        const heavy = by === 'mem' ? a.mem > 2 * 1073741824 : a.cpu > 50;
        return (
          <div key={a.name} className="anim-rise flex items-center gap-3 rounded-lg px-1 py-1.5" style={{ animationDelay: `${delay + 80 + i * 55}ms` }}>
            {a.icon ? <img src={a.icon} alt="" className="h-7 w-7 shrink-0" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-[var(--on-accent)]" style={{ background: 'linear-gradient(135deg, var(--p-accent), color-mix(in srgb, var(--p-accent) 45%, #000))' }}>{a.name.slice(0, 1).toUpperCase()}</span>}
            <span className="min-w-0 flex-1 truncate text-[14px]">{a.name}</span>
            <span className={cx('w-[84px] text-right text-[14px] tabular-nums', heavy ? 'text-[var(--p-warn)]' : 'text-[var(--p-soft)]')}>{by === 'mem' ? fmtSize(a.mem, 'auto', 1) : pct1(a.cpu)}</span>
            <button onClick={async () => {
              if (confirm !== a.name) { setConfirm(a.name); setTimeout(() => setConfirm((c) => (c === a.name ? null : c)), 3000); return; }
              await cc.perfKill(a.pids); setGone((g) => new Set(g).add(a.name)); setConfirm(null);
            }} className={cx('w-[86px] text-right text-[14px] font-semibold transition-colors', confirm === a.name ? 'text-[var(--p-danger)]' : 'text-[var(--p-link)] hover:opacity-75')}>
              {confirm === a.name ? tr("Confirmar") : tr("Encerrar")}
            </button>
          </div>
        );
      })}
    </>
  );
}
const Title = ({ children }: { children: React.ReactNode }) => <h2 className="anim-rise truncate px-1 pb-3 text-[21px] font-semibold tracking-tight">{children}</h2>;
const BigValue = ({ num, unit, sub }: { num: string; unit?: string; sub?: string }) => (
  <>
    <div className="flex items-baseline gap-1.5"><span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">{num}</span>{unit && <span className="text-[13px] font-semibold">{unit}</span>}</div>
    {sub && <div className="mt-1.5 text-[12.5px] leading-tight text-[var(--p-soft)]">{sub}</div>}
  </>
);

function useDetails(kind: Detail, every: number) {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    let alive = true, t: ReturnType<typeof setTimeout>;
    const tick = async () => { try { const r = await cc.metricsDetails(kind); if (alive) setD(r); } catch { /* */ } if (alive) t = setTimeout(tick, every); };
    tick();
    return () => { alive = false; clearTimeout(t); };
  }, [kind, every]);
  return d;
}
const batterySettings = () => cc.openSystemSettings(isMac ? 'x-apple.systempreferences:com.apple.Battery-Settings.extension' : 'ms-settings:batterysaver');

// ---------- detalhes ----------
type Open = (p?: string) => void;

function StorageDetail({ open }: { open: Open }) {
  const d = useDetails('storage', 3000);
  const disk = d?.disk, hw = d?.hardware;
  const cats = Object.entries((d?.categories || {}) as Record<string, number>).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const known = cats.reduce((s, [, v]) => s + v, 0);
  const colors = ['var(--p-c1)', 'var(--p-c2)', 'var(--p-c3)', 'var(--p-c4)'];
  const parts = cats.map(([k, v], i) => ({ label: k, value: v, color: colors[i % 4] }));
  if (disk) parts.push({ label: tr("Outros"), value: Math.max(0, disk.used - known), color: 'var(--p-others)' });
  const freeT = useTween(disk?.free ?? 0, 900, true);
  const healthy = !hw?.health || /healthy|verified|ok/i.test(hw.health);
  const t: number | undefined = d?.ssd;
  const trash: number | null | undefined = d?.trash;
  return (
    <>
      <Title>{disk?.label || tr("Disco")}</Title>
      <div className="flex items-center gap-5">
        <Donut parts={parts} total={disk?.total || 1}>
          {disk ? <BigValue {...sizeParts(freeT)} sub={tr("de {0} disponíveis", fmtSize(disk.total, 'auto', 2))} /> : <Loader2 size={18} className="animate-spin text-[var(--p-muted)]" />}
        </Donut>
        {parts.length > 1 || !d?.computing
          ? <Legend items={parts.map((p) => ({ label: p.label, value: fmtSize(p.value, 'auto', 2), color: p.color }))} delay={120} />
          : <div className="flex flex-1 items-center gap-2 text-[12.5px] text-[var(--p-soft)]"><Loader2 size={13} className="animate-spin" />{tr("Medindo as pastas…")}</div>}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <InfoCard delay={200} icon={<Heart size={18} className="text-[var(--p-soft)]" fill="currentColor" />} title={tr("Saúde")} value={!hw ? '—' : healthy ? tr("Boa") : tr("Falha")} tone={healthy ? undefined : 'var(--p-danger)'} tint={healthy ? undefined : 'var(--p-danger)'}
          text={!hw ? tr("O sistema não informou a saúde desta unidade.") : healthy ? tr("Esta unidade está em boas condições.") : tr("O disco relatou: {0}. Faça uma cópia de segurança dos seus arquivos quanto antes.", hw.health)} onLink={() => open('overview')} />
        {t !== undefined
          ? <InfoCard delay={260} icon={<Thermometer size={18} className="text-[var(--p-soft)]" />} title={tr("Temperatura")} value={`${Math.round(t)}°C`} tone={t >= 70 ? 'var(--p-danger)' : t >= 55 ? 'var(--p-warn)' : undefined} tint={t >= 70 ? 'var(--p-danger)' : undefined}
              text={t >= 70 ? tr("A unidade está muito quente. Deixe o computador esfriar.") : t >= 55 ? tr("A unidade está aquecida pelo uso intenso.") : tr("A temperatura está no intervalo perfeito de funcionamento.")} onLink={() => open('performance')} />
          : <InfoCard delay={260} icon={<HardDrive size={18} className="text-[var(--p-soft)]" />} title={tr("Tipo")} value={hw && hw.media !== 'Desconhecido' ? hw.media : '—'} text={hw ? `${hw.bus} · ${hw.model}` : tr("Sem informações da unidade.")} onLink={() => open('overview')} />}
      </div>
      <SubTitle delay={320}>{tr("Componentes")}</SubTitle>
      <div className="grid grid-cols-2 gap-3">
        <div className="anim-rise rounded-2xl border border-[var(--p-line)] bg-[var(--p-card)] px-3.5 py-3" style={{ animationDelay: '380ms' }}>
          <div className="flex items-center gap-2.5"><Trash2 size={18} className="text-[var(--p-soft)]" /><span className="text-[14px] font-semibold">{tr("Lixeira")}</span></div>
          {trash !== null && <Bar value={trash ? Math.min(100, (trash / 2147483648) * 100) : 0} className="mt-4" />}
          <div className={cx('text-[12.5px] text-[var(--p-soft)]', trash === null ? 'mt-4' : 'mt-2')}>{trash === null ? tr("Sem acesso à Lixeira") : tr("Em uso: {0}", trash === undefined ? '…' : fmtSize(trash, 'auto', 1))}</div>
          <div className="mt-2.5 text-right">
            {trash === null ? <button onClick={() => cc.openFullDiskAccess()} className="text-[13px] font-semibold text-[var(--p-link)]">{tr("Dar acesso")}</button> : <button onClick={() => open('cleanup')} className="text-[13px] font-semibold text-[var(--p-link)]">{tr("Liberar")}</button>}
          </div>
        </div>
      </div>
    </>
  );
}

/** "Liberar" direto no quadrado da Memória, sem abrir o detalhe; mostra o resultado por alguns segundos. */
function QuickFreeMemory() {
  const [state, setState] = useState<'idle' | 'busy' | string>('idle');
  const run = async () => {
    if (state === 'busy') return;
    setState('busy');
    let msg = tr("Não liberou");
    try { const r = await cc.freeMemory(false); msg = r.ok ? `${fmtSize(r.freed, 'auto', 0)} livres` : tr("Cancelado"); } catch { /* */ }
    setState(msg);
    setTimeout(() => setState('idle'), 4000);
  };
  if (state === 'busy') return <span className="flex items-center gap-1 text-[13px] font-semibold text-[var(--p-accent)]"><Loader2 size={12} className="animate-spin" />{tr("Liberando")}</span>;
  if (state !== 'idle') return <span className="text-[12px] font-semibold text-[var(--p-accent)]">{state}</span>;
  return <Action onClick={run}>{tr("Liberar")}</Action>;
}

/** Botão de liberar memória (como o "Liberar RAM" do CleanMyMac). */
function FreeMemory() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async () => {
    setBusy(true); setMsg('');
    try { const r = await cc.freeMemory(false); setMsg(r.message); } catch { setMsg(tr("Não foi possível liberar a memória")); }
    setBusy(false);
  };
  return (
    <div className="mt-4 flex items-center gap-3">
      <button onClick={run} disabled={busy} className="flex items-center gap-2 rounded-full bg-[var(--p-accent)] px-4 py-1.5 text-[13px] font-semibold text-[var(--on-accent)] transition-opacity hover:opacity-90 disabled:opacity-60">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <MemoryStick size={14} />}{busy ? tr("Liberando…") : tr("Liberar memória")}
      </button>
      <span className="text-[12px] text-[var(--p-muted)]">{msg || (isMac ? tr("O macOS pede a sua senha (purge).") : tr("Esvazia a memória parada dos programas."))}</span>
    </div>
  );
}

function MemoryDetail({ open }: { open: Open }) {
  const d = useDetails('memory', 2500);
  const m = d?.memory, det = d?.detail;
  const avail = det?.available ?? (m ? m.total - m.used : 0);
  const availT = useTween(avail, 900, true);
  const parts = det ? [
    { label: tr("Ativa"), value: det.active, color: 'var(--p-s1)' },
    { label: tr("Fixa"), value: det.wired, color: 'var(--p-s2)' },
    { label: tr("Comprimida"), value: det.compressed, color: 'var(--p-s3)' },
  ].filter((p) => p.value > 0) : m ? [{ label: tr("Em uso"), value: m.used, color: 'var(--p-s2)' }] : [];
  const lvl = m?.level;
  return (
    <>
      <Title>{tr("Memória")}</Title>
      <div className="flex items-center gap-5">
        <Donut parts={parts} total={m?.total || 1}>
          {m ? <BigValue {...sizeParts(availT)} sub={tr("de {0} disponíveis", fmtSize(m.total, 'auto', 0))} /> : <Loader2 size={18} className="animate-spin text-[var(--p-muted)]" />}
        </Donut>
        <Legend items={parts.map((p) => ({ label: p.label, value: fmtSize(p.value, 'auto', 2), color: p.color }))} delay={120} />
      </div>
      <FreeMemory />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <InfoCard delay={200} title={tr("Pressão")} value={m ? `${m.pressure}%` : '…'} tone={lvl === 'critical' ? 'var(--p-danger)' : lvl === 'warn' ? 'var(--p-warn)' : undefined} tint={lvl === 'critical' ? 'var(--p-danger)' : undefined}
          text={lvl === 'critical' ? tr("A memória está no limite. Feche apps que você não está usando.") : lvl === 'warn' ? tr("A memória está ficando apertada.") : tr("O {0} está pronto para aceitar mais tarefas.", isMac ? 'Mac' : 'PC')} onLink={() => open('performance')} />
        <InfoCard delay={260} title={isMac ? tr("Arquivo de troca") : tr("Arquivo de paginação")} value={det && det.swapTotal > 0 ? fmtSize(det.swapUsed, 'auto', 2) : '—'}
          text={tr("Uma área do disco que ajuda a memória do {0} quando a RAM acaba.", isMac ? 'Mac' : 'PC')} onLink={() => open('performance')} />
      </div>
      <Consumers list={d?.top} by="mem" unit={tr("Uso")} delay={320} />
    </>
  );
}

function BatteryDetail() {
  const d = useDetails('battery', 4000);
  const cpu = useDetails('cpu', 4000);
  const b = d?.battery, h = d?.health, t: number | undefined = d?.temperature;
  const pctT = useTween(b?.percent ?? 0, 900, true);
  if (d && !b) {
    return (<><Title>{tr("Energia")}</Title><InfoCard icon={<PlugZap size={18} className="text-[var(--p-accent)]" />} title={tr("Ligado na tomada")} text={tr("Este computador não tem bateria.")} /></>);
  }
  const max: number | undefined = h?.maxCapacity;
  const status = !b ? '…' : b.charging ? tr("Carregando") : b.plugged ? tr("Não carregando") : tr("Na bateria");
  const sub = !b ? '' : b.plugged ? tr("Usando adaptador de energia") : b.minutesLeft ? `${Math.floor(b.minutesLeft / 60)} h ${b.minutesLeft % 60} min restantes` : tr("Usando a bateria");
  return (
    <>
      <Title>{tr("Bateria")}</Title>
      <div className="flex items-center gap-5">
        <SegRing pct={b?.percent ?? 0} color={b && b.percent <= 15 && !b.plugged ? 'var(--p-danger)' : 'var(--p-accent)'}>
          <div className="flex items-baseline gap-1"><span className="text-[44px] font-semibold leading-none tabular-nums">{b ? Math.round(pctT) : '…'}</span><span className="text-[17px] font-semibold">%</span></div>
        </SegRing>
        <div className="anim-rise min-w-0 flex-1" style={{ animationDelay: '120ms' }}>
          <div className="text-[18px] font-semibold leading-tight">{status}</div>
          <div className="mt-1 text-[13px] leading-snug text-[var(--p-soft)]">{sub}</div>
          {h?.cycles !== undefined && <><div className="mt-4 text-[20px] font-semibold tabular-nums">{h.cycles}{isMac ? ' / 1000' : ''}</div><div className="text-[13px] text-[var(--p-soft)]">{tr("ciclos de carga")}</div></>}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <InfoCard delay={200} icon={<Heart size={18} className="text-[var(--p-soft)]" fill="currentColor" />} title={tr("Saúde")} value={max !== undefined ? `${max}%` : h?.condition || '—'} tone={max !== undefined && max < 80 ? 'var(--p-warn)' : undefined}
          text={max === undefined ? tr("O sistema não informou a capacidade da bateria.") : max >= 95 ? tr("A bateria está em ótimas condições.") : max >= 80 ? tr("A bateria está em boas condições, mas já perdeu parte da capacidade.") : tr("A bateria perdeu bastante capacidade. Por isso, pense em trocar a bateria.")}
          onLink={batterySettings} />
        <InfoCard delay={260} icon={<Thermometer size={18} className="text-[var(--p-soft)]" />} title={tr("Temperatura")} value={t !== undefined ? `${Math.round(t)}°C` : '—'} tone={t === undefined ? undefined : t >= 45 ? 'var(--p-danger)' : t >= 35 ? 'var(--p-warn)' : undefined} tint={t !== undefined && t >= 45 ? 'var(--p-danger)' : undefined}
          text={t === undefined ? tr("Sensor de temperatura da bateria indisponível.") : t >= 45 ? tr("A bateria está quente demais. Feche apps pesados e deixe esfriar.") : t >= 35 ? tr("A temperatura da bateria não é a ideal.") : tr("A temperatura da bateria está ideal.")}
          onLink={batterySettings} />
      </div>
      <Consumers list={cpu?.top} by="cpu" unit={tr("Uso")} delay={320} />
    </>
  );
}

function CpuDetail({ hist, open }: { hist: { u: number; s: number }[]; open: Open }) {
  const d = useDetails('cpu', 2000);
  const t: number | undefined = d?.temperature;
  const user = d?.split.user ?? 0, sys = d?.split.system ?? 0, idle = d ? Math.max(0, 100 - user - sys) : 0;
  const top = Math.max(25, Math.ceil(Math.max(0, ...hist.map((p) => p.u + p.s)) / 25) * 25);
  const model = String(d?.model || 'Processador').replace(/\(R\)|\(TM\)|CPU|@.*$/gi, '').replace(/\s+/g, ' ').trim();
  const items = [{ label: tr("Disponíveis"), value: idle, color: 'var(--p-track-strong)' }, { label: tr("Usuário"), value: user, color: 'var(--p-c4)' }, { label: tr("Sistema"), value: sys, color: 'var(--p-c1)' }];
  return (
    <>
      <Title>{model}</Title>
      <div className="flex items-center gap-5">
        <div className="shrink-0"><LineChart w={236} h={150} grid max={top} series={[{ data: hist.map((p) => p.u + p.s), color: 'var(--p-c4)' }, { data: hist.map((p) => p.s), color: 'var(--p-c1)' }]} /></div>
        <div className="min-w-0 flex-1 space-y-4">
          {items.map((it, i) => (
            <div key={it.label} className="anim-rise flex gap-3" style={{ animationDelay: `${120 + i * 70}ms` }}>
              <span className="w-1 shrink-0 rounded-full" style={{ background: it.color }} />
              <div><div className="text-[19px] font-semibold leading-tight tabular-nums">{d ? `${pct1(it.value)} %` : '…'}</div><div className="text-[13px] text-[var(--p-soft)]">{it.label}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <InfoCard delay={200} icon={<Clock size={18} className="text-[var(--p-soft)]" />} title={tr("Ligado há")} value={d ? days(d.uptime) : '…'}
          text={!d ? '' : d.uptime < 86400 * 2 ? tr("Você iniciou o sistema há pouco tempo.") : d.uptime < 86400 * 7 ? tr("Tudo certo. Reinicie de vez em quando para aplicar atualizações.") : tr("O computador está ligado há muitos dias. Reiniciar libera memória e aplica as atualizações.")} onLink={() => open('performance')} />
        <InfoCard delay={260} icon={<Thermometer size={18} className="text-[var(--p-soft)]" />} title={tr("Temperatura")} value={t !== undefined ? `${Math.round(t)}°C` : '—'} tone={t === undefined ? undefined : t >= 90 ? 'var(--p-danger)' : t >= 75 ? 'var(--p-warn)' : undefined} tint={t !== undefined && t >= 90 ? 'var(--p-danger)' : t !== undefined && t >= 75 ? 'var(--p-warn)' : undefined}
          text={t === undefined ? (isMac ? tr("Sensor indisponível.") : tr("O Windows só informa a temperatura com permissão de administrador ou suporte do fabricante.")) : t >= 90 ? tr("A temperatura do {0} está muito acima da recomendada. Feche apps pesados.", isMac ? 'Mac' : 'PC') : t >= 75 ? tr("O processador está aquecido pelo uso intenso.") : tr("A temperatura está no intervalo normal.")}
          onLink={() => open('performance')} />
      </div>
      <Consumers list={d?.top} by="cpu" unit={tr("Uso, %")} delay={320} />
    </>
  );
}

function SpeedCircle() {
  const [p, setP] = useState<SpeedProgress | null>(null);
  const [started, setStarted] = useState(false);
  useEffect(() => cc.on.speedProgress(setP), []);
  const live = useTween(p?.mbps ?? 0, 300);
  const run = () => { setStarted(true); setP(null); cc.speedTest(); };
  const phase = p?.phase;
  const running = started && phase !== 'done' && phase !== 'error';
  return (
    <div className="anim-rise flex items-center gap-5" style={{ animationDelay: '300ms' }}>
      <button onClick={run} disabled={running} className="group relative h-[156px] w-[156px] shrink-0 rounded-full">
        <span className="absolute inset-0 rounded-full border border-[var(--p-line)]" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--p-accent) 8%, transparent) 55%, transparent 72%)' }} />
        {running && <><span className="anim-ring-pulse absolute inset-5 rounded-full border-2 border-[var(--p-accent)]" /><span className="anim-ring-pulse absolute inset-5 rounded-full border-2 border-[var(--p-accent)]" style={{ animationDelay: '.8s' }} /></>}
        {running && <svg className="anim-spin-fast absolute inset-[18px]" viewBox="0 0 120 120"><circle cx="60" cy="60" r="57" fill="none" stroke="var(--p-accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="60 400" style={{ filter: glow('var(--p-accent)') }} /></svg>}
        <span className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full border border-[var(--p-line)] bg-[var(--p-disc-strong)] transition-transform group-hover:scale-[1.03] group-active:scale-[.98]">
          {!started || phase === 'error' ? <span className="px-3 text-[15px] font-semibold leading-tight text-[var(--p-soft)]">{phase === 'error' ? tr("Tentar de novo") : <>{tr("Testar")}<br />{tr("velocidade")}</>}</span>
            : phase === 'done' ? <><span className="text-[30px] font-semibold leading-none tabular-nums">{mbps(p?.download)}</span><span className="mt-1 text-[11px] text-[var(--p-soft)]">{tr("Mbps. Clique para testar de novo.")}</span></>
              : <><span className="text-[30px] font-semibold leading-none tabular-nums">{phase === 'ping' || !p ? '…' : mbps(live)}</span><span className="mt-1 text-[11px] text-[var(--p-soft)]">{phase === 'upload' ? tr("Mbps envio") : phase === 'download' ? tr("Mbps download") : tr("medindo latência")}</span></>}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        {phase === 'done' ? (
          <div className="space-y-2.5">
            {[[tr("Latência"), `${p?.ping ?? '—'} ms`], ['Download', `${mbps(p?.download)} Mbps`], ['Upload', `${mbps(p?.upload)} Mbps`]].map(([k, v]) => <div key={k}><div className="text-[12.5px] text-[var(--p-soft)]">{k}</div><div className="text-[16px] font-semibold tabular-nums">{v}</div></div>)}
          </div>
        ) : phase === 'error' ? <div className="text-[12.5px] text-[var(--p-danger)]">{tr("Não foi possível testar:")} {p?.error}</div> : (
          <><div className="text-[15px] font-semibold">{tr("Como funciona")}</div><div className="mt-1 text-[12.5px] leading-snug text-[var(--p-soft)]">{tr("Para medir a velocidade, o CleanCode baixa e envia um pequeno arquivo de teste.")}</div></>
        )}
      </div>
    </div>
  );
}

function NetworkDetail({ s, hist }: { s: MetricsSnapshot | null; hist: { rx: number[]; tx: number[] } }) {
  const d = useDetails('network', 10000);
  const info = d?.info || {};
  const wifi = s?.network && /wi-?fi/i.test(s.network.kind);
  const lvl = info.securityLevel as string | undefined;
  const secText = !d ? null : !info.security ? (wifi ? 'Conectado.' : tr("Conectado por cabo, então os dados até o roteador não passam pelo ar."))
    : lvl === 'open' ? tr("Esta rede é aberta. Por isso, qualquer pessoa por perto pode ver o que não estiver criptografado. Evite digitar senhas e usar bancos nessa rede.")
      : lvl === 'weak' ? tr("Esta rede usa uma criptografia antiga ({0}), que é fácil de quebrar. Se a rede for sua, troque a segurança do roteador para WPA2 ou WPA3.", info.security)
        : tr("Esta rede é protegida com {0}, então os dados entre o computador e o roteador são criptografados.", info.security);
  const cards: [string, number | undefined, number | undefined, number[], string][] = [
    ['Download', s?.network?.rxTotal, s?.network?.rxRate, hist.rx, 'var(--p-c4)'],
    ['Upload', s?.network?.txTotal, s?.network?.txRate, hist.tx, 'var(--p-c1)'],
  ];
  return (
    <>
      <Title>{tr("Rede")}</Title>
      <div className="anim-rise overflow-hidden rounded-2xl border border-[var(--p-line)] bg-[var(--p-card)]" style={{ animationDelay: '60ms' }}>
        <div className="flex items-center gap-3.5 border-b border-[var(--p-line)] bg-[var(--p-card)] px-4 py-3">
          {wifi ? <Wifi size={26} className="text-[var(--p-soft)]" /> : <Cable size={26} className="text-[var(--p-soft)]" />}
          <div className="min-w-0"><div className="truncate text-[15px] font-semibold">{info.ssid || s?.network?.kind || tr("Sem conexão")}</div><div className="text-[12.5px] text-[var(--p-soft)]">{wifi ? tr("Conexão Wi-Fi") : s?.network ? tr("Conexão cabeada") : tr("Desconectado")}</div></div>
          {lvl && <span className={cx('ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold', lvl === 'open' || lvl === 'weak' ? 'bg-[color-mix(in_srgb,var(--p-warn)_22%,transparent)] text-[var(--p-warn)]' : 'bg-[color-mix(in_srgb,var(--p-accent)_20%,transparent)] text-[var(--p-link)]')}>{lvl === 'open' ? tr("Aberta") : lvl === 'weak' ? tr("Fraca") : lvl === 'strong' ? tr("Forte") : tr("Segura")}</span>}
        </div>
        <div className="px-4 py-3">
          {secText === null ? <div className="flex items-center gap-1.5 text-[12.5px] text-[var(--p-soft)]"><Loader2 size={12} className="animate-spin" />{tr("Lendo detalhes da rede…")}</div> : <p className="text-[12.5px] leading-snug text-[var(--p-soft)]">{secText}</p>}
          {(info.ip || info.router || info.channel) && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--p-muted)]">{info.ip && <span>{tr("IP")} {info.ip}</span>}{info.router && <span>{tr("Roteador")} {info.router}</span>}{info.channel && <span>{tr("Canal")} {info.channel}</span>}{info.phy && <span>{info.phy}</span>}</div>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {cards.map(([label, total, r, data, color], i) => (
          <div key={label} className="anim-rise overflow-hidden rounded-2xl border border-[var(--p-line)] bg-[var(--p-card)] pt-3" style={{ animationDelay: `${140 + i * 60}ms` }}>
            <div className="px-3.5 text-[14px] font-semibold">{label}</div>
            <div className="flex justify-between px-3.5 pt-0.5 text-[12.5px] tabular-nums text-[var(--p-soft)]"><span>{total !== undefined ? fmtSize(total, 'auto', 1) : '—'}</span><span>{r !== undefined ? rate(r) : '—'}</span></div>
            <div className="mt-2"><LineChart w={DETAIL_W / 2 - 26} h={58} series={[{ data, color }]} /></div>
          </div>
        ))}
      </div>
      <SubTitle delay={240}>{tr("Teste a sua conexão")}</SubTitle>
      <SpeedCircle />
    </>
  );
}

function GpuDetail({ hist, open }: { hist: number[]; open: Open }) {
  const d = useDetails('gpu', 2000);
  const g = d?.info?.[0], live = d?.live || {};
  const util = live.util ?? 0;
  const memPct = live.memUsed && live.memTotal ? (live.memUsed / live.memTotal) * 100 : undefined;
  const t: number | undefined = live.temp;
  return (
    <>
      <Title>{g?.name || tr("Placa de vídeo")}</Title>
      <div className="flex items-center gap-5">
        <div className="shrink-0"><LineChart w={236} h={150} grid max={100} series={[{ data: hist, color: 'var(--p-c4)' }]} /></div>
        <div className="min-w-0 flex-1 space-y-4">
          {[{ l: tr("Em uso"), v: d ? `${util} %` : '…', c: 'var(--p-c4)' }, { l: tr("Núcleos"), v: g?.cores ?? '—', c: 'var(--p-c2)' }, { l: isMac ? tr("Memória da GPU") : tr("Memória de vídeo"), v: live.memUsed ? fmtSize(live.memUsed, 'auto', 1) : '—', c: 'var(--p-c3)' }].map((it, i) => (
            <div key={it.l} className="anim-rise flex gap-3" style={{ animationDelay: `${120 + i * 70}ms` }}>
              <span className="w-1 shrink-0 rounded-full" style={{ background: it.c }} />
              <div><div className="text-[19px] font-semibold leading-tight tabular-nums">{it.v}</div><div className="text-[13px] text-[var(--p-soft)]">{it.l}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <InfoCard delay={200} icon={<Monitor size={18} className="text-[var(--p-soft)]" />} title={isMac ? tr("Gráficos") : tr("Driver")} value={isMac ? g?.api || 'Metal' : g?.driver || '—'}
          text={(d?.displays || []).length ? `${d.displays.length} tela(s): ${d.displays.map((x: any) => `${x.name}${x.resolution ? ` (${String(x.resolution).replace(/ @.*/, '')})` : ''}`).join(', ')}` : tr("Nenhuma tela externa conectada.")} onLink={() => open('hardware')} link={tr("Monitor de hardware")} />
        <InfoCard delay={260} icon={<Thermometer size={18} className="text-[var(--p-soft)]" />} title={tr("Temperatura")} value={t !== undefined ? `${Math.round(t)}°C` : '—'} tone={t !== undefined && t >= 85 ? 'var(--p-danger)' : t !== undefined && t >= 75 ? 'var(--p-warn)' : undefined}
          text={t === undefined ? (isMac ? tr("Nos chips da Apple, a placa de vídeo usa o mesmo sensor do processador.") : tr("O Windows só informa a temperatura da GPU em placas NVIDIA.")) : t >= 85 ? tr("Muito quente. Confira a ventilação.") : tr("Dentro do normal.")} onLink={() => open('hardware')} link={tr("Ver sensores")} />
      </div>
      {memPct !== undefined && (
        <div className="anim-rise mt-3 rounded-2xl border border-[var(--p-line)] bg-[var(--p-card)] px-3.5 py-3" style={{ animationDelay: '300ms' }}>
          <div className="flex justify-between text-[13px]"><span className="font-semibold">{isMac ? tr("Memória unificada usada pela GPU") : tr("Memória de vídeo em uso")}</span><span className="tabular-nums text-[var(--p-soft)]">{fmtSize(live.memUsed, 'auto', 1)} {tr("de")} {fmtSize(live.memTotal, 'auto', 0)}</span></div>
          <Bar value={memPct} className="mt-2" />
        </div>
      )}
      {live.procs?.length ? (
        <>
          <SubTitle delay={340}>{tr("Apps que mais usam a placa de vídeo")}</SubTitle>
          {live.procs.map((p: any, i: number) => <div key={p.pid} className="anim-rise flex items-center gap-3 px-1 py-1.5 text-[14px]" style={{ animationDelay: `${380 + i * 50}ms` }}><span className="min-w-0 flex-1 truncate">{p.name}</span><span className="tabular-nums text-[var(--p-soft)]">{pct1(p.util)} %</span></div>)}
        </>
      ) : null}
    </>
  );
}

function PowerDetail({ hist }: { hist: number[] }) {
  const d = useDetails('power', 2000);
  const p = d?.power || {}, b = d?.battery, h = d?.health;
  const w: number | undefined = p.systemW ?? (p.batteryW !== undefined ? Math.abs(p.batteryW) : undefined);
  const wT = useTween(w ?? 0, 700, true);
  return (
    <>
      <Title>{tr("Energia")}</Title>
      <div className="flex items-center gap-5">
        <div className="relative flex h-[150px] w-[236px] shrink-0 items-end overflow-hidden rounded-2xl border border-[var(--p-line)] bg-[var(--p-card)]">
          <div className="absolute left-4 top-3"><div className="text-[34px] font-semibold leading-none tabular-nums">{w !== undefined ? wT.toLocaleString(LOCALE, { maximumFractionDigits: 1 }) : '—'}<span className="ml-1 text-[15px]">W</span></div><div className="mt-1 text-[12px] text-[var(--p-soft)]">{p.systemW !== undefined ? tr("consumo do sistema") : tr("potência da bateria")}</div></div>
          <LineChart w={236} h={80} series={[{ data: hist, color: 'var(--p-c2)' }]} />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          {[{ l: tr("Carregador"), v: p.adapterW ? `${p.adapterW} W` : b?.plugged ? tr("Conectado") : tr("Desconectado"), c: 'var(--p-accent)' },
            { l: p.batteryW !== undefined && p.batteryW >= 0 ? tr("Entrando na bateria") : tr("Saindo da bateria"), v: p.batteryW !== undefined ? `${Math.abs(p.batteryW).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} W` : '—', c: 'var(--p-c3)' },
            { l: tr("Tensão"), v: p.voltage ? `${p.voltage.toLocaleString(LOCALE, { maximumFractionDigits: 2 })} V` : '—', c: 'var(--p-c1)' }].map((it, i) => (
            <div key={it.l} className="anim-rise flex gap-3" style={{ animationDelay: `${120 + i * 70}ms` }}>
              <span className="w-1 shrink-0 rounded-full" style={{ background: it.c }} />
              <div><div className="text-[19px] font-semibold leading-tight tabular-nums">{it.v}</div><div className="text-[13px] text-[var(--p-soft)]">{it.l}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <InfoCard delay={200} icon={<Zap size={18} className="text-[var(--p-soft)]" />} title={b ? tr("Bateria") : tr("Alimentação")} value={b ? `${b.percent}%` : tr("Tomada")}
          text={!b ? tr("Ligado direto na tomada.") : b.charging ? tr("Carregando.") : b.plugged ? tr("Na tomada, com a carga pausada para proteger a bateria.") : b.minutesLeft ? tr("{0} h {1} min restantes.", Math.floor(b.minutesLeft / 60), b.minutesLeft % 60) : tr("Usando a bateria.")} />
        <InfoCard delay={260} icon={<Heart size={18} className="text-[var(--p-soft)]" fill="currentColor" />} title={tr("Saúde")} value={h?.maxCapacity !== undefined ? `${h.maxCapacity}%` : '—'}
          text={h?.cycles !== undefined ? tr("{0} ciclos de carga{1}.", h.cycles, p.plan ? ` · plano ${p.plan}` : '') : p.plan ? tr("Plano de energia: {0}.", p.plan) : tr("Sem dados de saúde.")} />
      </div>
    </>
  );
}

function DevicesDetail() {
  const d = useDetails('devices', 6000);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const eject = async (root: string) => { setMsg((m) => ({ ...m, [root]: 'Ejetando…' })); const r = await cc.metricsEject(root); setMsg((m) => ({ ...m, [root]: r.message })); };
  const tile = 'anim-rise rounded-2xl border border-[var(--p-line)] bg-[var(--p-card)] p-3.5';
  const badge = (icon: React.ReactNode) => <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--on-accent)]" style={{ background: 'linear-gradient(135deg, var(--p-accent), color-mix(in srgb, var(--p-accent) 50%, #000))' }}>{icon}</span>;
  return (
    <>
      <Title>{tr("Dispositivos conectados")}</Title>
      {!d ? <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-[var(--p-muted)]" /></div> : !d.devices.length ? <p className="anim-rise px-1 py-4 text-center text-[13px] text-[var(--p-soft)]">{tr("Nenhum dispositivo Bluetooth conectado.")}</p> : (
        <div className="grid grid-cols-2 gap-3">
          {d.devices.map((x: any, i: number) => (
            <div key={x.name} className={tile} style={{ animationDelay: `${60 + i * 60}ms` }}>
              <div className="flex items-center gap-3">
                <MiniRing value={x.battery} color={x.battery !== undefined && x.battery <= 15 ? 'var(--p-danger)' : 'var(--p-accent)'}>{badge(<Bluetooth size={16} />)}</MiniRing>
                <span className="text-[12.5px] font-semibold text-[var(--p-soft)]">{x.battery !== undefined ? `${x.battery}%` : tr("Sem dados da bateria")}</span>
              </div>
              <div className="mt-4 truncate text-[14.5px] font-semibold">{x.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-[var(--p-soft)]"><Bluetooth size={13} />{tr("Bluetooth")}</div>
            </div>
          ))}
        </div>
      )}
      <SubTitle delay={160}>{tr("Discos externos")}</SubTitle>
      {!d ? null : !d.external.length ? <p className="anim-rise px-4 py-5 text-center text-[13px] leading-snug text-[var(--p-soft)]" style={{ animationDelay: '200ms' }}>{tr("Quando você conectar um disco externo ou um pendrive, ele vai aparecer aqui.")}</p> : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {d.external.map((x: any, i: number) => (
              <div key={x.root} className={tile} style={{ animationDelay: `${200 + i * 60}ms` }}>
                <div className="flex items-center gap-3">
                  <MiniRing value={x.total ? ((x.total - x.free) / x.total) * 100 : 0}>{badge(isMac ? <HardDrive size={16} /> : <Usb size={16} />)}</MiniRing>
                  <span className="text-[12.5px] font-semibold text-[var(--p-soft)]">{fmtSize(x.free, 'auto', 1)} {tr("livres")}</span>
                </div>
                <div className="mt-4 truncate text-[14.5px] font-semibold">{x.label}</div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[12.5px] text-[var(--p-soft)]"><span className="truncate">{msg[x.root] || tr("de {0}", fmtSize(x.total, 'auto', 0))}</span><button onClick={() => eject(x.root)} className="shrink-0 font-semibold text-[var(--p-link)]">{tr("Ejetar")}</button></div>
              </div>
            ))}
          </div>
          {d.external.length > 1 && <div className="mt-2 text-right"><button onClick={() => d.external.forEach((x: any) => eject(x.root))} className="text-[13px] font-semibold text-[var(--p-link)]">{tr("Ejetar todos")}</button></div>}
        </>
      )}
    </>
  );
}

// ---------- painel ----------
export default function Panel() {
  const [s, setS] = useState<MetricsSnapshot | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [cpuHist, setCpuHist] = useState<number[]>([]);
  const [splitHist, setSplitHist] = useState<{ u: number; s: number }[]>([]);
  const [netHist, setNetHist] = useState<{ rx: number[]; tx: number[] }>({ rx: [], tx: [] });
  const [gpuHist, setGpuHist] = useState<number[]>([]);
  const [powerHist, setPowerHist] = useState<number[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [shownKey, setShownKey] = useState(0);

  useEffect(() => { cc.settingsGet().then(setSettings); return cc.on.settingsChanged(setSettings); }, []);
  const [sysDark, setSysDark] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => { const mq = window.matchMedia('(prefers-color-scheme: dark)'); const h = (e: MediaQueryListEvent) => setSysDark(e.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, []);
  const dark = settings ? settings.theme === 'dark' || (settings.theme === 'system' && sysDark) : sysDark;
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.dataset.accent = settings?.accent || 'green';
  }, [dark, settings?.accent]);

  // a janela tem tamanho fixo (as duas colunas); as partes transparentes deixam o clique passar
  useEffect(() => {
    cc.panelResize(0, TOTAL_W);
    let ignoring = false;
    const set = (v: boolean) => { if (v !== ignoring) { ignoring = v; cc.panelMouse(v); } };
    const move = (e: MouseEvent) => set(!(e.target as Element | null)?.closest?.('.panel-root'));
    const leave = () => set(true);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseleave', leave);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseleave', leave); };
  }, []);

  // a cada abertura o conteúdo remonta (animação de entrada); dois quadros depois a janela pode aparecer
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => { cc.panelReady(); }); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [shownKey]);

  const openDetail = (k: Detail) => { clearTimeout(closeTimer.current); setClosing(false); setDetail(k); };
  const closeDetail = () => {
    if (!detail || closing) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => { setDetail(null); setClosing(false); }, 260);
  };
  const toggle = (k: Detail) => (detail === k && !closing ? closeDetail() : openDetail(k));
  const closeRef = useRef(closeDetail); closeRef.current = closeDetail;
  const detailRef = useRef(detail); detailRef.current = detail;

  // leituras a cada 2 s, um único ciclo (cada reabertura invalida o anterior)
  useEffect(() => {
    let alive = true, gen = 0, timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async (my = gen) => {
      if (!alive || my !== gen) return;
      if (!document.hidden) {
        try {
          const snap = await cc.metricsSnapshot();
          if (!alive || my !== gen) return;
          setS(snap);
          setCpuHist((h) => [...h.slice(-59), snap.cpu.load]);
          setSplitHist((h) => [...h.slice(-59), { u: snap.cpu.user, s: snap.cpu.system }]);
          if (snap.gpu?.util !== undefined) setGpuHist((h) => [...h.slice(-59), snap.gpu!.util!]);
          const pw = snap.power?.systemW ?? (snap.power?.batteryW !== undefined ? Math.abs(snap.power.batteryW) : undefined);
          if (pw !== undefined) setPowerHist((h) => [...h.slice(-59), pw]);
          if (snap.network) setNetHist((h) => ({ rx: [...h.rx.slice(-59), snap.network!.rxRate], tx: [...h.tx.slice(-59), snap.network!.txRate] }));
        } catch { /* próxima leitura */ }
      }
      if (my === gen) timer = setTimeout(() => tick(my), 2000);
    };
    tick();
    const offShown = cc.on.panelShown(() => { clearTimeout(closeTimer.current); setClosing(false); setDetail(null); setShownKey((k) => k + 1); cc.settingsGet().then(setSettings); if (timer) clearTimeout(timer); gen++; tick(gen); });
    const esc = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (detailRef.current) closeRef.current(); else cc.panelHide(); };
    window.addEventListener('keydown', esc);
    return () => { alive = false; if (timer) clearTimeout(timer); offShown(); window.removeEventListener('keydown', esc); };
  }, []);

  const tip = useMemo(() => TIPS[Math.floor(Date.now() / 86400000) % TIPS.length], []);
  const open = (page?: string) => cc.panelOpenMain(page);
  const device = isMac ? 'Mac' : 'PC';
  const freeT = useTween(s?.disk?.free ?? 0);
  const pressT = useTween(s?.memory.pressure ?? 0);
  const loadT = useTween(s?.cpu.load ?? 0, 400);
  const battT = useTween(s?.battery?.percent ?? 0);
  const gpuT = useTween(s?.gpu?.util ?? 0, 400);
  const powerNow = s?.power?.systemW ?? (s?.power?.batteryW !== undefined ? Math.abs(s.power.batteryW) : undefined);
  const level = s?.health.level || 'good';
  const levelText = level === 'good' ? tr("Boa") : level === 'fair' ? tr("Regular") : tr("Atenção");
  const levelColor = level === 'good' ? 'var(--p-accent)' : level === 'fair' ? 'var(--p-warn)' : 'var(--p-danger)';
  const b = s?.battery;
  const BattIcon = !b ? PlugZap : b.charging ? BatteryCharging : b.percent > 60 ? BatteryFull : b.percent > 20 ? BatteryMedium : BatteryLow;
  const battText = !b ? tr("Na tomada") : b.charging ? tr("Carregando") : b.plugged ? tr("Na tomada") : b.minutesLeft ? `${Math.floor(b.minutesLeft / 60)} h ${b.minutesLeft % 60} min restantes` : tr("Não está carregando");
  const NetIcon = s?.network && /wi-?fi/i.test(s.network.kind) ? Wifi : Cable;
  const more = <ChevronRight size={15} className="absolute right-3 top-4 text-[var(--p-muted)] opacity-60" />;
  const active = (k: Detail) => detail === k && !closing;
  const colH = `calc(100vh - ${PAD * 2}px)`;

  return (
    // ancorado à direita (e embaixo no Windows); o detalhe sai de trás do painel principal para a esquerda
    <div style={{ padding: PAD, height: '100vh' }} className={cx('flex select-none justify-end overflow-hidden text-[var(--p-fg)]', isMac ? 'items-start' : 'items-end')}>
      <div key={shownKey} className={cx('anim-panel-in flex shrink-0', isMac ? 'items-start' : 'items-end')} style={{ gap: GAP }}>
        {detail ? (
          <div className={cx('panel-root no-scrollbar relative z-0 shrink-0 overflow-y-auto p-5', closing ? 'anim-detail-out' : 'anim-detail-in')} style={{ width: DETAIL_W, maxHeight: colH }}>
            <div key={detail} className="anim-fade-in">
              {detail === 'storage' && <StorageDetail open={open} />}
              {detail === 'memory' && <MemoryDetail open={open} />}
              {detail === 'battery' && <BatteryDetail />}
              {detail === 'cpu' && <CpuDetail hist={splitHist} open={open} />}
              {detail === 'gpu' && <GpuDetail hist={gpuHist} open={open} />}
              {detail === 'power' && <PowerDetail hist={powerHist} />}
              {detail === 'network' && <NetworkDetail s={s} hist={netHist} />}
              {detail === 'devices' && <DevicesDetail />}
            </div>
          </div>
        ) : <div className="shrink-0" style={{ width: DETAIL_W }} />}

        {/* coluna principal */}
        <div className="panel-root no-scrollbar relative z-10 shrink-0 overflow-y-auto p-5" style={{ width: MAIN_W, maxHeight: colH }}>
          <div className="anim-rise flex items-center gap-3 px-1 pb-3">
            <div className="min-w-0 flex-1">
              <div className="text-[20px] font-semibold tracking-tight">{tr("Saúde do")} {device}: <span style={{ color: levelColor }}>{s ? levelText : '…'}</span></div>
              <div className="truncate text-[13px] text-[var(--p-muted)]">{s?.machine || ' '}{s && s.health.issues.length ? ` · ${s.health.issues.join(', ')}` : ''}</div>
            </div>
            <HealthRing level={level} />
          </div>

          <Card delay={40} className="mb-3" onClick={() => open('protection')}>
            <div className="flex items-center gap-3">
              {settings?.notifyEnabled ? <ShieldCheck size={22} className="text-[var(--p-accent)]" /> : <BellOff size={22} className="text-[var(--p-muted)]" />}
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{tr("Monitoramento")} {settings?.notifyEnabled ? 'ativo' : 'pausado'}</div>
                <div className="text-xs leading-snug text-[var(--p-muted)]">{settings?.notifyEnabled ? tr("O CleanCode avisa quando um disco cresce mais de {0}{1}.", fmtSize((settings?.notifyThresholdMB || 1024) * 1048576, 'auto', 0), settings?.notifyApps ? ' ou quando você instala um app' : '') : tr("Para receber avisos, ative as notificações nas Configurações.")}</div>
              </div>
              <ChevronRight size={15} className="text-[var(--p-muted)] opacity-60" />
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card delay={80} onClick={() => toggle('storage')} active={active('storage')}>
              {more}
              <div className="flex items-start gap-3 pr-4">
                <HardDrive size={20} className="mt-0.5 shrink-0 text-[var(--p-muted)]" />
                <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-semibold">{s?.disk?.label || tr("Disco")}</div><div className="whitespace-nowrap text-xs text-[var(--p-muted)]">{tr("Livres:")} <span className="tabular-nums text-[var(--p-fg)]">{s?.disk ? fmtSize(freeT, 'auto', 1) : '…'}</span></div></div>
              </div>
              {s?.disk && <Bar value={(1 - s.disk.free / s.disk.total) * 100} tone={s.disk.free / s.disk.total < 0.1 ? 'var(--p-danger)' : undefined} className="mt-3" />}
              <div className="mt-2.5 text-right"><Action onClick={() => open('cleanup')}>{tr("Liberar")}</Action></div>
            </Card>

            <Card delay={120} onClick={() => toggle('memory')} active={active('memory')}>
              {more}
              <div className="flex items-start gap-3 pr-4">
                <MemoryStick size={20} className="mt-0.5 shrink-0 text-[var(--p-muted)]" />
                <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold">{tr("Memória")}</div><div className="text-xs text-[var(--p-muted)]">{tr("Pressão:")} <span className="tabular-nums text-[var(--p-fg)]">{s ? `${Math.round(pressT)}%` : '…'}</span></div></div>
              </div>
              {s && <Bar value={s.memory.pressure} tone={s.memory.level === 'critical' ? 'var(--p-danger)' : s.memory.level === 'warn' ? 'var(--p-warn)' : undefined} className="mt-3" />}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <QuickFreeMemory />
                <span className="text-[11px] tabular-nums text-[var(--p-muted)]">{s ? tr("{0} de {1}", fmtSize(s.memory.used, 'auto', 1), fmtSize(s.memory.total, 'auto', 0)) : ''}</span>
              </div>
            </Card>

            <Card delay={160} onClick={() => toggle('battery')} active={active('battery')}>
              {more}
              <div className="flex items-start gap-3 pr-4">
                <BattIcon size={20} className={cx('mt-0.5 shrink-0', b?.charging ? 'text-[var(--p-accent)]' : 'text-[var(--p-muted)]')} />
                <div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-1"><span className="text-[14px] font-semibold">{b ? tr("Bateria") : tr("Energia")}</span>{b && <span className="text-[13px] font-semibold tabular-nums">{Math.round(battT)}%</span>}</div><div className="truncate text-xs text-[var(--p-muted)]">{battText}</div></div>
              </div>
              {b && <Bar value={b.percent} tone={b.percent <= 15 && !b.plugged ? 'var(--p-danger)' : undefined} className="mt-3" />}
              {s?.temperatures.battery !== undefined && <div className="mt-2.5 text-right text-[11px] text-[var(--p-muted)]">{s.temperatures.battery.toFixed(0)} °C</div>}
            </Card>

            <Card delay={200} onClick={() => toggle('cpu')} active={active('cpu')}>
              <div className="flex items-start gap-3">
                <Cpu size={20} className="mt-0.5 shrink-0 text-[var(--p-muted)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-1"><span className="text-[14px] font-semibold">{tr("CPU")}</span>{s?.cpu.temperature !== undefined && <span className={cx('flex items-center gap-0.5 text-[13px] font-semibold tabular-nums', tempTone(s.cpu.temperature))}><Thermometer size={12} />{Math.round(s.cpu.temperature)}°C</span>}</div>
                  <div className="text-xs text-[var(--p-muted)]">{tr("Carga:")} <span className="tabular-nums text-[var(--p-fg)]">{s ? `${Math.round(loadT)}%` : '…'}</span></div>
                </div>
              </div>
              <div className="mt-2"><Spark data={cpuHist} w={168} h={30} /></div>
            </Card>

            <Card delay={220} onClick={() => toggle('gpu')} active={active('gpu')}>
              <div className="flex items-start gap-3">
                <Gpu size={20} className="mt-0.5 shrink-0 text-[var(--p-muted)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-1"><span className="text-[14px] font-semibold">{tr("GPU")}</span>{s?.gpu?.temp !== undefined && <span className={cx('flex items-center gap-0.5 text-[13px] font-semibold tabular-nums', tempTone(s.gpu.temp))}><Thermometer size={12} />{Math.round(s.gpu.temp)}°C</span>}</div>
                  <div className="text-xs text-[var(--p-muted)]">{tr("Uso:")} <span className="tabular-nums text-[var(--p-fg)]">{s?.gpu?.util !== undefined ? `${Math.round(gpuT)}%` : '—'}</span></div>
                </div>
              </div>
              <div className="mt-2"><Spark data={gpuHist} w={168} h={30} /></div>
            </Card>

            <Card delay={230} onClick={() => toggle('power')} active={active('power')}>
              {more}
              <div className="flex items-start gap-3 pr-4">
                <Zap size={20} className="mt-0.5 shrink-0 text-[var(--p-muted)]" />
                <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold">{tr("Energia")}</div><div className="text-xs text-[var(--p-muted)]">{powerNow !== undefined ? <><span className="tabular-nums text-[var(--p-fg)]">{powerNow.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} W</span> {tr("agora")}</> : tr("Sem leitura")}</div></div>
              </div>
              <div className="mt-2"><Spark data={powerHist} w={168} h={30} max={1} /></div>
            </Card>

            <Card delay={240} onClick={() => toggle('network')} active={active('network')}>
              {more}
              <div className="flex items-center gap-3 pr-4"><NetIcon size={20} className="shrink-0 text-[var(--p-muted)]" /><div className="truncate text-[14px] font-semibold">{s?.network?.kind || tr("Rede")}</div></div>
              <div className="mt-2.5 space-y-1 text-[13px] tabular-nums">
                <div className="flex items-center gap-1.5"><ArrowUp size={13} className="text-[var(--p-muted)]" />{s?.network ? rate(s.network.txRate) : '—'}</div>
                <div className="flex items-center gap-1.5"><ArrowDown size={13} className="text-[var(--p-muted)]" />{s?.network ? rate(s.network.rxRate) : '—'}</div>
              </div>
              <div className="mt-2.5 text-right"><Action onClick={() => openDetail('network')}><span className="inline-flex items-center gap-1"><Gauge size={13} />{tr("Testar velocidade")}</span></Action></div>
            </Card>

            <Card delay={280} onClick={() => toggle('devices')} active={active('devices')}>
              {more}
              <div className="pr-4 text-[14px] font-semibold">{tr("Dispositivos conectados")}</div>
              <div className="mt-2.5 space-y-1.5">
                {!s ? <div className="text-xs text-[var(--p-muted)]">…</div> : s.devices.length === 0 ? <div className="text-xs text-[var(--p-muted)]">{tr("Nenhum dispositivo Bluetooth")}</div> : s.devices.slice(0, 3).map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-[13px]"><Bluetooth size={13} className="shrink-0 text-[var(--p-muted)]" /><span className="min-w-0 flex-1 truncate">{d.name}</span>{d.battery !== undefined && <span className="text-[11px] tabular-nums text-[var(--p-muted)]">{d.battery}%</span>}</div>
                ))}
                {s && s.devices.length > 3 && <div className="text-[11px] text-[var(--p-muted)]">+{s.devices.length - 3} {tr("outros")}</div>}
              </div>
            </Card>
          </div>

          <div className="anim-rise px-1 pb-2 pt-4 text-[15px] font-semibold text-[var(--p-muted)]" style={{ animationDelay: '320ms' }}>{tr("Recomendação de hoje")}</div>
          <Card delay={340}>
            <div className="flex gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, var(--p-accent), color-mix(in srgb, var(--p-accent) 45%, #ffffff))' }}><Sparkles size={21} className="text-[var(--on-accent)]" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{tip.title}</div>
                <div className="mt-0.5 text-xs leading-snug text-[var(--p-muted)]">{tip.text}</div>
                <div className="mt-2.5 text-right"><button onClick={() => open(tip.page)} className="rounded-lg border border-[var(--p-line)] bg-[var(--p-track)] px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--p-card-hover)]">{tip.action}</button></div>
              </div>
            </div>
          </Card>

          <div className="anim-rise mt-3 flex items-center gap-2 border-t border-[var(--p-line)] px-1 pt-3" style={{ animationDelay: '380ms' }}>
            <button title={tr("Abrir o CleanCode")} onClick={() => open()} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--p-line)] bg-[var(--p-track)] hover:bg-[var(--p-card-hover)]"><AppWindow size={16} /></button>
            <button onClick={() => open()} className="flex-1 text-center text-[14px] font-medium hover:text-[var(--p-accent)]">{tr("Abrir CleanCode")}</button>
            <button title={tr("Configurações")} onClick={() => open('settings')} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--p-line)] bg-[var(--p-track)] hover:bg-[var(--p-card-hover)]"><Settings size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
