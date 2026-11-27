// Painel da barra de menus (macOS) / bandeja (Windows): saúde do computador em tempo real.
// Cada cartão abre um painel de detalhe que desliza de trás do painel principal para a esquerda.
// Cores derivadas da cor de destaque escolhida no CleanCode.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  HardDrive, MemoryStick, Cpu, Wifi, Cable, Bluetooth, BatteryFull, BatteryMedium, BatteryLow, BatteryCharging, PlugZap,
  ShieldCheck, BellOff, Sparkles, Settings, AppWindow, ArrowUp, ArrowDown, Thermometer, ChevronRight,
  Heart, Clock, Trash2, Usb, ArrowUpRight, Gauge, Loader2, Gpu, Zap, Monitor, Fan,
} from 'lucide-react';
import { cc, MetricsSnapshot, SpeedProgress, Settings as AppSettings, isMac, type FanState, type FanControlInfo, type FanConfig, type StorageMap as StorageMapData } from '../lib/api';
import { COLORS as MAP_COLORS, ICONS as MAP_ICONS, HINTS as MAP_HINTS } from '../components/StorageMap';
import { GpuHero, useGpuCard, preloadGpuCatalog } from '../components/GpuArt';
import { loadFanProfiles } from '../components/GpuFan3D';
import { fanStatus, TONE, MODE_LABEL, ModeIcon } from '../pages/Fans';
import { FanSpinner, FanTrioHero } from '../components/FanArt';
import { PumpArt } from '../components/PumpArt';
import { fmtSize } from '../lib/format';
import { t as tr, LOCALE } from '../lib/i18n';

type Detail = 'storage' | 'memory' | 'battery' | 'cpu' | 'gpu' | 'power' | 'network' | 'devices' | 'fans';
const PAD = 10, MAIN_W = 640, DETAIL_W = 436, GAP = 12;
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
    <div onClick={onClick} style={{ animationDelay: `calc(var(--d0, 0ms) + ${delay}ms)` }}
      className={cx('anim-rise relative rounded-xl border px-2.5 py-2 backdrop-blur-xl transition-all duration-300',
        active ? 'border-[rgba(255,255,255,.16)] bg-[var(--p-card-hover)]' : 'border-[var(--p-line)] bg-[var(--p-card)]',
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
function Donut({ parts, total, size = 150, stroke = 20, children }: { parts: { label: string; value: number; color: string }[]; total: number; size?: number; stroke?: number; children?: React.ReactNode }) {
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
function SegRing({ pct, size = 150, n = 36, color = 'var(--p-accent)', children }: { pct: number; size?: number; n?: number; color?: string; children?: React.ReactNode }) {
  const on = useMounted();
  const mid = size / 2, th = 20, r = mid - 4;
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
    <div className="anim-rise flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--p-line)]" style={{ animationDelay: `calc(var(--d0, 0ms) + ${delay}ms)`, background: tint ? `linear-gradient(160deg, color-mix(in srgb, ${tint} 24%, transparent), var(--p-card) 75%)` : 'var(--p-card)' }}>
      {/* o título nunca encolhe por baixo do valor: quando os dois não cabem na mesma linha, o valor desce para a linha de baixo */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-[var(--p-line)] bg-[var(--p-card)] px-3 py-2">
        {icon}
        <span className="min-w-0 max-w-full shrink-0 grow break-words text-[13px] font-semibold leading-tight">{title}</span>
        {value !== undefined && <span className="ml-auto max-w-full shrink-0 break-all text-right text-[13px] font-semibold tabular-nums" style={{ color: tone }}>{value}</span>}
      </div>
      <div className="flex flex-1 flex-col px-3 pb-2 pt-1.5">
        <p className="flex-1 text-[11.5px] leading-snug text-[var(--p-soft)]">{text}</p>
        {onLink && <button onClick={onLink} className="mt-1.5 flex items-center gap-0.5 self-end text-[12px] font-semibold text-[var(--p-link)] transition-opacity hover:opacity-75">{link}<ArrowUpRight size={13} strokeWidth={2.4} /></button>}
      </div>
    </div>
  );
}
const SubTitle = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => <div className="anim-rise px-1 pb-1.5 pt-4 text-[14px] font-semibold text-[var(--p-soft)]" style={{ animationDelay: `calc(var(--d0, 0ms) + ${delay}ms)` }}>{children}</div>;
function Legend({ items, delay = 0 }: { items: { label: string; value: string; color: string }[]; delay?: number }) {
  return (
    <div className="min-w-0 flex-1 space-y-3">
      {items.map((it, i) => (
        <div key={it.label} className="anim-rise flex gap-2.5" style={{ animationDelay: `calc(var(--d0, 0ms) + ${delay + i * 70}ms)` }}>
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
      <div className="anim-rise flex px-1 pb-1 text-[11px] text-[var(--p-muted)]" style={{ animationDelay: `calc(var(--d0, 0ms) + ${delay + 40}ms)` }}><span className="flex-1">{tr("Nome do processo")}</span><span className="w-[72px] text-right">{unit}</span><span className="w-[70px]" /></div>
      {!list ? <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-[var(--p-muted)]" /></div> : list.filter((a) => !gone.has(a.name)).slice(0, 5).map((a, i) => {
        const heavy = by === 'mem' ? a.mem > 2 * 1073741824 : a.cpu > 50;
        // barra: quanto este app usa perto do que mais usa
        const share = ((by === 'mem' ? a.mem : a.cpu) / Math.max(1e-9, ...list.map((x) => (by === 'mem' ? x.mem : x.cpu)))) * 100;
        return (
          <div key={a.name} className="anim-rise relative flex items-center gap-2.5 overflow-hidden rounded-lg px-1 py-1" style={{ animationDelay: `calc(var(--d0, 0ms) + ${delay + 80 + i * 55}ms)` }}>
            {a.icon ? <img src={a.icon} alt="" className="h-6 w-6 shrink-0" /> : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-[var(--on-accent)]" style={{ background: 'linear-gradient(135deg, var(--p-accent), color-mix(in srgb, var(--p-accent) 45%, #000))' }}>{a.name.slice(0, 1).toUpperCase()}</span>}
            <div className="min-w-0 flex-1"><div className="truncate text-[13px]">{a.name}</div><Bar value={share} tone={heavy ? 'var(--p-warn)' : undefined} className="mt-1 !h-1" /></div>
            <span className={cx('w-[72px] text-right text-[13px] tabular-nums', heavy ? 'text-[var(--p-warn)]' : 'text-[var(--p-soft)]')}>{by === 'mem' ? fmtSize(a.mem, 'auto', 1) : pct1(a.cpu)}</span>
            <button onClick={async () => {
              if (confirm !== a.name) { setConfirm(a.name); setTimeout(() => setConfirm((c) => (c === a.name ? null : c)), 3000); return; }
              await cc.perfKill(a.pids); setGone((g) => new Set(g).add(a.name)); setConfirm(null);
            }} className={cx('w-[70px] text-right text-[12.5px] font-semibold transition-colors', confirm === a.name ? 'text-[var(--p-danger)]' : 'text-[var(--p-link)] hover:opacity-75')}>
              {confirm === a.name ? tr("Confirmar") : tr("Encerrar")}
            </button>
          </div>
        );
      })}
    </>
  );
}
const Title = ({ children }: { children: React.ReactNode }) => <h2 className="anim-rise truncate px-1 pb-2 text-[18px] font-semibold tracking-tight">{children}</h2>;
const BigValue = ({ num, unit, sub }: { num: string; unit?: string; sub?: string }) => (
  <>
    <div className="flex items-baseline gap-1.5"><span className="text-[24px] font-semibold leading-none tracking-tight tabular-nums">{num}</span>{unit && <span className="text-[13px] font-semibold">{unit}</span>}</div>
    {sub && <div className="mt-1.5 text-[12.5px] leading-tight text-[var(--p-soft)]">{sub}</div>}
  </>
);

// os detalhes de todos os cartões são lidos assim que o widget abre e ficam guardados; ao clicar num cartão, o detalhe
// aparece na hora com a última leitura e continua se atualizando enquanto fica aberto
type DetailKind = Exclude<Detail, 'fans'>;
const detailCache: Partial<Record<DetailKind, any>> = {};
const DETAIL_KINDS: DetailKind[] = ['storage', 'memory', 'cpu', 'gpu', 'power', 'network', 'devices', 'battery'];
// uma leitura de cada vez, com uma pausa entre elas: no Windows, cada leitura pode abrir o PowerShell, e pedir as oito
// juntas travava o computador por um instante
let preloading = false;
const preloadDetails = async () => {
  if (preloading) return; preloading = true;
  for (const k of DETAIL_KINDS) {
    try { detailCache[k] = await cc.metricsDetails(k); } catch { /* lê de novo ao abrir */ }
    await new Promise((ok) => setTimeout(ok, 400));
  }
  preloading = false;
};
function useDetails(kind: DetailKind, every: number) {
  const [d, setD] = useState<any>(detailCache[kind] ?? null);
  useEffect(() => {
    let alive = true, t: ReturnType<typeof setTimeout>;
    const tick = async () => { try { const r = await cc.metricsDetails(kind); detailCache[kind] = r; if (alive) setD(r); } catch { /* */ } if (alive) t = setTimeout(tick, every); };
    tick();
    return () => { alive = false; clearTimeout(t); };
  }, [kind, every]);
  return d;
}
const batterySettings = () => cc.openSystemSettings(isMac ? 'x-apple.systempreferences:com.apple.Battery-Settings.extension' : 'ms-settings:batterysaver');

// ---------- peças dos detalhes (versão nova) ----------
const dl = (ms: number) => ({ animationDelay: `calc(var(--d0, 0ms) + ${ms}ms)` });
/** Quadro de dado: rótulo pequeno, valor grande, uma linha de apoio e, se houver, uma barra ou um botão embaixo. */
function Stat({ icon, label, value, sub, tone, children, delay = 0 }: { icon?: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string; children?: React.ReactNode; delay?: number }) {
  return (
    <div className="anim-rise flex min-w-0 flex-col rounded-xl border border-[var(--p-line)] bg-[var(--p-card)] px-2.5 py-2" style={dl(delay)}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--p-muted)]">{icon}<span className="min-w-0 break-words leading-tight">{label}</span></div>
      <div className="mt-1 text-[18px] font-semibold leading-tight tabular-nums" style={{ color: tone }}>{value}</div>
      {sub !== undefined && <div className="mt-0.5 text-[11px] leading-snug text-[var(--p-soft)]">{sub}</div>}
      {children && <div className="mt-auto pt-1.5">{children}</div>}
    </div>
  );
}
const Stats = ({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 }) => <div className={cx('mt-2 grid gap-2', cols === 2 ? 'grid-cols-2' : 'grid-cols-3')}>{children}</div>;
/** Bloco principal do detalhe: um quadro largo com o desenho grande. */
const Hero = ({ children, className, delay = 40 }: { children: React.ReactNode; className?: string; delay?: number }) => (
  <div className={cx('anim-rise relative overflow-hidden rounded-2xl border border-[var(--p-line)] bg-[var(--p-card)]', className)} style={dl(delay)}>{children}</div>
);
/** Título de uma parte do detalhe, com um texto opcional à direita. */
const Section = ({ title, right, delay = 0 }: { title: string; right?: React.ReactNode; delay?: number }) => (
  <div className="anim-rise flex items-baseline gap-2 px-1 pb-1.5 pt-3.5" style={dl(delay)}>
    <span className="text-[13px] font-semibold text-[var(--p-soft)]">{title}</span>
    {right !== undefined && <span className="ml-auto text-[11px] text-[var(--p-muted)]">{right}</span>}
  </div>
);
/** Etiqueta de legenda com bolinha colorida, valor e nome. */
const Chip = ({ color, label, value }: { color: string; label: string; value: string }) => (
  <div className="flex min-w-0 items-center gap-1.5">
    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
    <span className="text-[11.5px] text-[var(--p-muted)]">{label}</span>
    <span className="text-[12px] font-semibold tabular-nums">{value}</span>
  </div>
);
/** Gráfico largo com o número grande por cima, à esquerda. */
function ChartHero({ big, unit, caption, series, max, delay = 40 }: { big: string; unit?: string; caption: string; series: { data: number[]; color: string }[]; max?: number; delay?: number }) {
  return (
    <Hero delay={delay}>
      <div className="absolute left-3 top-2.5 z-10">
        <div className="flex items-baseline gap-1"><span className="text-[30px] font-semibold leading-none tabular-nums">{big}</span>{unit && <span className="text-[13px] font-semibold">{unit}</span>}</div>
        <div className="mt-1 text-[11px] text-[var(--p-soft)]">{caption}</div>
      </div>
      <div className="pt-12"><LineChart w={DETAIL_W - 34} h={96} grid max={max} series={series} /></div>
    </Hero>
  );
}
/** Barra com vários pedaços coloridos lado a lado (o espaço do disco, por exemplo). */
function SplitBar({ parts, total }: { parts: { label: string; value: number; color: string }[]; total: number }) {
  const on = useMounted();
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--p-track)]">
      {parts.map((p, i) => <div key={p.label} className="h-full" style={{ width: on ? `${total > 0 ? (Math.max(0, p.value) / total) * 100 : 0}%` : 0, background: p.color, transition: `width .9s cubic-bezier(.22,1,.36,1) ${i * 90}ms`, marginRight: 1 }} />)}
    </div>
  );
}
/** Botão largo de ação no fim do detalhe. */
const BigAction = ({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) => (
  <button onClick={onClick} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--p-line)] bg-[var(--p-card)] px-3 py-2 text-[12.5px] font-semibold text-[var(--p-link)] transition-colors hover:bg-[var(--p-card-hover)]">{icon}{children}</button>
);

// ---------- desenhos grandes dos detalhes (disco, memória e rede) ----------
/** Tanque de partículas: o "líquido" é feito de pontos ligados por linhas. Ao abrir, o nível sobe do zero até a
 *  porcentagem usada; a superfície ondula, os pontos se espalham até ela e gotas caem de cima, como se estivesse enchendo. */
function LiquidTank({ pct, tone, height = 132, children }: { pct: number; tone: string; height?: number; children?: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null), cvRef = useRef<HTMLCanvasElement>(null);
  const target = useRef(pct); target.current = Math.max(0, Math.min(100, pct));
  const W = DETAIL_W - 34, H = height;
  useEffect(() => {
    const cv = cvRef.current!, g = cv.getContext('2d')!;
    const dpr = Math.min(2, devicePixelRatio);
    cv.width = W * dpr; cv.height = H * dpr;
    // a cor de destaque (ou de alerta) em RGB, lida do próprio elemento
    host.current!.style.color = tone;
    const rgb = (getComputedStyle(host.current!).color.match(/\d+/g) || ['47', '214', '160']).slice(0, 3).join(',');
    let lvl = 0, raf = 0, t0 = performance.now(), last = t0;
    const surf = (x: number, t: number) => H - (H * lvl) / 100 + Math.sin(x * 0.028 + t * 1.5) * 3.5 + Math.sin(x * 0.071 - t * 1.05) * 1.8;
    // pontos do líquido: cada um guarda a posição na coluna de líquido (u = 0 na superfície, 1 no fundo); assim, quando o
    // nível sobe, todos sobem juntos e o líquido parece encher
    const P = Array.from({ length: 150 }, () => ({ x: Math.random() * W, u: Math.random(), vx: (Math.random() - 0.5) * 14, vu: 0, y: H }));
    // gotas que caem de cima e entram no líquido
    const drops: { x: number; y: number; v: number }[] = [];
    let nextDrop = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (document.hidden) return;
      const t = (now - t0) / 1000;
      lvl += (target.current - lvl) * Math.min(1, dt * 1.4);
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      // névoa do líquido, bem leve, embaixo da superfície
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, surf(x, t));
      g.lineTo(W, H); g.closePath();
      const fog = g.createLinearGradient(0, H - (H * lvl) / 100, 0, H);
      fog.addColorStop(0, `rgba(${rgb},.16)`); fog.addColorStop(1, `rgba(${rgb},.04)`);
      g.fillStyle = fog; g.fill();
      // movimento: cada ponto vaga devagar para os lados e na altura, sem sair do líquido
      for (const p of P) {
        p.vx += (Math.random() - 0.5) * 30 * dt; p.vu += (Math.random() - 0.5) * 0.25 * dt;
        p.vx *= 0.98; p.vu *= 0.97;
        p.x += p.vx * dt; p.u += p.vu * dt;
        if (p.x < 2) { p.x = 2; p.vx = Math.abs(p.vx); } if (p.x > W - 2) { p.x = W - 2; p.vx = -Math.abs(p.vx); }
        if (p.u < 0.02) { p.u = 0.02; p.vu = Math.abs(p.vu); } if (p.u > 0.99) { p.u = 0.99; p.vu = -Math.abs(p.vu); }
        const s0 = surf(p.x, t) + 2;
        p.y = s0 + (H - 2 - s0) * p.u;
      }
      // linhas entre pontos próximos
      g.lineWidth = 0.7;
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const a = P[i], b = P[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 1300) { g.strokeStyle = `rgba(${rgb},${(1 - d2 / 1300) * 0.55})`; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
      }
      // pontos, com brilho
      g.shadowColor = `rgba(${rgb},.9)`; g.shadowBlur = 6; g.fillStyle = `rgba(${rgb},.95)`;
      for (const p of P) { g.beginPath(); g.arc(p.x, p.y, 1.6, 0, Math.PI * 2); g.fill(); }
      // superfície: uma corrente de pontos ligados que ondula
      g.shadowBlur = 8; g.strokeStyle = `rgba(${rgb},.9)`; g.lineWidth = 1.2; g.beginPath();
      for (let x = 0; x <= W; x += 14) { const y = surf(x, t); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      g.fillStyle = '#fff';
      for (let x = 0; x <= W; x += 14) { g.beginPath(); g.arc(x, surf(x, t), 1.5, 0, Math.PI * 2); g.fill(); }
      // gotas: caem mais rápido enquanto o nível ainda está subindo
      const filling = Math.abs(target.current - lvl) > 0.5;
      if (t > nextDrop) { drops.push({ x: 20 + Math.random() * (W - 40), y: -4, v: 60 }); nextDrop = t + (filling ? 0.08 : 0.7 + Math.random() * 0.9); }
      g.shadowBlur = 6; g.fillStyle = `rgba(${rgb},.95)`; g.strokeStyle = `rgba(${rgb},.35)`; g.lineWidth = 1;
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]; d.v += 420 * dt; d.y += d.v * dt;
        g.beginPath(); g.moveTo(d.x, d.y - 9); g.lineTo(d.x, d.y); g.stroke();
        g.beginPath(); g.arc(d.x, d.y, 1.8, 0, Math.PI * 2); g.fill();
        // a gota que chega na superfície vira um ponto do líquido (o ponto mais antigo dá lugar a ela)
        if (d.y >= surf(d.x, t)) { const q = P[Math.floor(Math.random() * P.length)]; q.x = d.x; q.u = 0.03; q.vx = (Math.random() - 0.5) * 30; q.vu = 0.35; drops.splice(i, 1); }
      }
      g.shadowBlur = 0;
      // marcas de 25%, 50% e 75%
      g.strokeStyle = 'rgba(255,255,255,.08)'; g.setLineDash([2, 5]);
      for (const m of [25, 50, 75]) { g.beginPath(); g.moveTo(0, H - (H * m) / 100); g.lineTo(W, H - (H * m) / 100); g.stroke(); }
      g.setLineDash([]);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [tone, W, H]);
  return (
    <div ref={host} className="relative overflow-hidden rounded-xl border border-[var(--p-line)]" style={{ height: H, background: 'var(--p-disc-strong)' }}>
      <canvas ref={cvRef} className="absolute inset-0" style={{ width: W, height: H }} />
      <div className="relative flex h-full flex-col justify-between p-3 [text-shadow:0_1px_8px_rgb(0_0_0/.7)]">{children}</div>
    </div>
  );
}

/** Pente de memória: 8 chips com 8 células cada; as células acendem pela ordem dos tipos de uso, e os contatos dourados ficam embaixo. */
function RamStick({ parts, total }: { parts: { label: string; value: number; color: string }[]; total: number }) {
  const on = useMounted();
  const N = 64;
  const cells: (string | null)[] = [];
  for (const p of parts) { const n = Math.round((Math.max(0, p.value) / Math.max(1, total)) * N); for (let i = 0; i < n && cells.length < N; i++) cells.push(p.color); }
  while (cells.length < N) cells.push(null);
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--p-line)] px-2.5 pt-2.5" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--p-accent) 16%, #0c1411), #080c0b)' }}>
      {/* trilhas da placa */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[.12]"><defs><pattern id="ramtr" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 9 H9 V0 M9 18 V12 H18" fill="none" stroke="var(--p-accent)" strokeWidth=".8" /></pattern></defs><rect width="100%" height="100%" fill="url(#ramtr)" /></svg>
      <div className="relative grid grid-cols-8 gap-1.5">
        {Array.from({ length: 8 }, (_, chip) => (
          <div key={chip} className="grid grid-cols-2 gap-[2px] rounded-[4px] border border-white/10 bg-[#07090a] p-[3px] shadow-[0_2px_6px_rgb(0_0_0/.5)]">
            {cells.slice(chip * 8, chip * 8 + 8).map((c, i) => {
              const k = chip * 8 + i;
              return <span key={i} className="h-[13px] rounded-[2px]" style={{ background: on && c ? c : 'rgba(255,255,255,.06)', boxShadow: on && c ? `0 0 7px color-mix(in srgb, ${c} 70%, transparent)` : undefined, transition: `background .35s ease ${k * 16}ms, box-shadow .35s ease ${k * 16}ms` }} />;
            })}
          </div>
        ))}
      </div>
      <div className="relative mt-1.5 flex items-center justify-between text-[9.5px] font-semibold tracking-wider text-white/45">
        <span>{tr("MEMÓRIA")}</span><span className="tabular-nums">{fmtSize(total, 'auto', 0)}</span>
      </div>
      {/* contatos dourados, com o chanfro do encaixe */}
      <div className="relative mt-1.5 flex h-3 gap-[2px]">
        {Array.from({ length: 48 }, (_, i) => <span key={i} className="flex-1 rounded-t-[1px]" style={{ background: i === 20 ? 'transparent' : 'linear-gradient(180deg, #f1d27a, #b8892c)', opacity: i === 20 ? 0 : 0.9 }} />)}
      </div>
    </div>
  );
}

/** Gráfico espelhado da rede: o download sobe a partir do meio e o upload desce, cada um na própria escala. */
function MirrorChart({ rx, tx, w, h }: { rx: number[]; tx: number[]; w: number; h: number }) {
  const n = 60, mid = h / 2;
  const mr = Math.max(1024, ...rx) * 1.15, mt = Math.max(1024, ...tx) * 1.15;
  const X = (i: number, len: number) => ((i + n - len) / (n - 1)) * w;
  const path = (d: number[], up: boolean, m: number) => {
    const pts = d.slice(-n).map((v, i, a) => [X(i, a.length), up ? mid - (v / m) * (mid - 6) : mid + (v / m) * (mid - 6)] as [number, number]);
    if (pts.length < 2) return null;
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return { line, area: `${line} L${pts[pts.length - 1][0]},${mid} L${pts[0][0]},${mid} Z`, last: pts[pts.length - 1] };
  };
  const a = path(rx, true, mr), b = path(tx, false, mt);
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id="mcd" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--p-c4)" stopOpacity=".55" /><stop offset="1" stopColor="var(--p-c4)" stopOpacity=".04" /></linearGradient>
        <linearGradient id="mcu" x1="0" x2="0" y1="1" y2="0"><stop offset="0" stopColor="var(--p-c1)" stopOpacity=".55" /><stop offset="1" stopColor="var(--p-c1)" stopOpacity=".04" /></linearGradient>
      </defs>
      <g stroke="var(--p-grid)">{Array.from({ length: 13 }, (_, i) => <line key={i} x1={(i / 12) * w} x2={(i / 12) * w} y1={0} y2={h} />)}</g>
      <line x1="0" x2={w} y1={mid} y2={mid} stroke="var(--p-track-strong)" strokeDasharray="3 4" />
      {a && <><path d={a.area} fill="url(#mcd)" /><path d={a.line} fill="none" stroke="var(--p-c4)" strokeWidth="1.7" strokeLinejoin="round" style={{ filter: glow('var(--p-c4)', 45) }} /><circle cx={a.last[0]} cy={a.last[1]} r="3.5" fill="var(--p-c4)" className="anim-ping-soft" style={{ transformOrigin: `${a.last[0]}px ${a.last[1]}px` }} /><circle cx={a.last[0]} cy={a.last[1]} r="3" fill="var(--p-c4)" /></>}
      {b && <><path d={b.area} fill="url(#mcu)" /><path d={b.line} fill="none" stroke="var(--p-c1)" strokeWidth="1.7" strokeLinejoin="round" style={{ filter: glow('var(--p-c1)', 45) }} /><circle cx={b.last[0]} cy={b.last[1]} r="3" fill="var(--p-c1)" /></>}
    </svg>
  );
}

/** Velocímetro do teste de velocidade: escala em Mbps que cresce devagar no começo, arco aceso até o valor e ponteiro. */
function SpeedGauge({ value, label, sub, active }: { value: number; label: string; sub: string; active: boolean }) {
  const W = 260, H = 196, cx = W / 2, cy = 124, r = 104;
  const A0 = 150, A1 = 390; // de baixo à esquerda até baixo à direita, passando por cima
  const f = (v: number) => Math.max(0, Math.min(1, Math.log10(1 + v) / Math.log10(1001)));
  const ang = (k: number) => ((A0 + (A1 - A0) * k) * Math.PI) / 180;
  const pt = (k: number, rr: number) => [cx + Math.cos(ang(k)) * rr, cy + Math.sin(ang(k)) * rr];
  const arc = (k0: number, k1: number, rr: number) => { const [x0, y0] = pt(k0, rr), [x1, y1] = pt(k1, rr); return `M${x0} ${y0} A${rr} ${rr} 0 ${(k1 - k0) * (A1 - A0) > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  const k = f(value);
  const marks = [0, 5, 10, 25, 50, 100, 250, 500, 1000];
  return (
    <svg width={W} height={H} className="overflow-visible">
      <defs><linearGradient id="sgg" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="var(--p-c1)" /><stop offset=".5" stopColor="var(--p-accent)" /><stop offset="1" stopColor="var(--p-c4)" /></linearGradient></defs>
      <path d={arc(0, 1, r)} fill="none" stroke="var(--p-track)" strokeWidth="12" strokeLinecap="round" />
      {k > 0.002 && <path d={arc(0, k, r)} fill="none" stroke="url(#sgg)" strokeWidth="12" strokeLinecap="round" style={{ filter: glow('var(--p-accent)', 60), transition: 'd .3s ease' }} />}
      {/* marcas da escala */}
      {Array.from({ length: 41 }, (_, i) => { const kk = i / 40, [x0, y0] = pt(kk, r - 14), [x1, y1] = pt(kk, r - (i % 5 === 0 ? 22 : 18)); return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--p-muted)" strokeOpacity={i % 5 === 0 ? 0.7 : 0.3} strokeWidth="1" />; })}
      {marks.map((m) => { const [x, y] = pt(f(m), r - 32); return <text key={m} x={x} y={y + 3} textAnchor="middle" fontSize="9" fill="var(--p-muted)">{m}</text>; })}
      {/* ponteiro */}
      <g style={{ transform: `rotate(${A0 + (A1 - A0) * k}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform .45s cubic-bezier(.22,1,.36,1)' }}>
        <path d={`M${cx} ${cy - 3} L${cx + r - 26} ${cy} L${cx} ${cy + 3} Z`} fill="var(--p-fg)" opacity={active ? 1 : 0.55} />
      </g>
      <circle cx={cx} cy={cy} r="7" fill="var(--p-disc-strong)" stroke="var(--p-accent)" strokeWidth="2" />
      <text x={cx} y={cy - 42} textAnchor="middle" fontSize="30" fontWeight="600" fill="var(--p-fg)" style={{ fontVariantNumeric: 'tabular-nums' }}>{label}</text>
      <text x={cx} y={cy - 24} textAnchor="middle" fontSize="11" fill="var(--p-soft)">{sub}</text>
    </svg>
  );
}

// ---------- detalhes ----------
type Open = (p?: string) => void;

function StorageDetail({ open }: { open: Open }) {
  const d = useDetails('storage', 3000);
  const disk = d?.disk, hw = d?.hardware;
  const freeT = useTween(disk?.free ?? 0, 900, true);
  const healthy = !hw?.health || /healthy|verified|ok/i.test(hw.health);
  const t: number | undefined = d?.ssd;
  const trash: number | null | undefined = d?.trash;
  const usedPct = disk ? (disk.used / disk.total) * 100 : 0;
  return (
    <>
      <Title>{disk?.label || tr("Disco")}</Title>
      <LiquidTank pct={usedPct} tone={usedPct >= 90 ? 'var(--p-danger)' : usedPct >= 80 ? 'var(--p-warn)' : 'var(--p-accent)'}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{tr("Livres")}</div>
            {disk ? <div className="flex items-baseline gap-1"><span className="text-[34px] font-semibold leading-none tabular-nums text-white">{sizeParts(freeT).num}</span><span className="text-[14px] font-semibold text-white">{sizeParts(freeT).unit}</span></div> : <Loader2 size={18} className="animate-spin text-white/70" />}
          </div>
          <div className="text-right">
            <div className="text-[26px] font-semibold leading-none tabular-nums text-white">{Math.round(usedPct)}%</div>
            <div className="mt-0.5 text-[11px] text-white/75">{tr("ocupado")}</div>
          </div>
        </div>
        {disk && <div className="flex justify-between text-[11.5px] tabular-nums text-white/85"><span>{tr("Em uso: {0}", fmtSize(disk.used, 'auto', 1))}</span><span>{tr("Total: {0}", fmtSize(disk.total, 'auto', 1))}</span></div>}
      </LiquidTank>
      <DiskMap disk={disk} open={open} />
      <Stats>
        <Stat delay={120} icon={<Heart size={12} fill="currentColor" />} label={tr("Saúde")} value={!hw ? '—' : healthy ? tr("Boa") : tr("Falha")} tone={healthy ? undefined : 'var(--p-danger)'}
          sub={!hw ? tr("O sistema não informou a saúde desta unidade.") : healthy ? tr("Esta unidade está em boas condições.") : tr("Faça uma cópia de segurança dos seus arquivos quanto antes.")} />
        {t !== undefined
          ? <Stat delay={160} icon={<Thermometer size={12} />} label={tr("Temperatura")} value={`${Math.round(t)}°C`} tone={t >= 70 ? 'var(--p-danger)' : t >= 55 ? 'var(--p-warn)' : undefined}
              sub={t >= 70 ? tr("A unidade está muito quente.") : t >= 55 ? tr("A unidade está aquecida pelo uso intenso.") : tr("Dentro do normal.")} />
          : <Stat delay={160} icon={<HardDrive size={12} />} label={tr("Tipo")} value={hw && hw.media !== 'Desconhecido' ? hw.media : '—'} sub={hw ? hw.bus : undefined} />}
        <Stat delay={200} icon={<Trash2 size={12} />} label={tr("Lixeira")} value={trash === null ? '—' : trash === undefined ? '…' : fmtSize(trash, 'auto', 1)}
          sub={trash === null ? tr("Sem acesso à Lixeira") : undefined}>
          {trash === null
            ? <button onClick={() => cc.openFullDiskAccess()} className="text-[12px] font-semibold text-[var(--p-link)]">{tr("Dar acesso")}</button>
            : <button onClick={() => open('cleanup')} className="text-[12px] font-semibold text-[var(--p-link)]">{tr("Liberar")}</button>}
        </Stat>
      </Stats>
      {hw?.model && <div className="anim-rise mt-2 px-1 text-[11px] text-[var(--p-muted)]" style={dl(230)}>{tr("Unidade: {0}", hw.model)}</div>}
      <Section title={tr("O que fazer agora")} delay={260} />
      <div className="anim-rise flex gap-2" style={dl(290)}>
        <BigAction icon={<Sparkles size={14} />} onClick={() => open('cleanup')}>{tr("Limpar o disco")}</BigAction>
        <BigAction icon={<HardDrive size={14} />} onClick={() => open('visual')}>{tr("Ver o que ocupa espaço")}</BigAction>
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
    <div className="mt-3 flex items-center gap-3">
      <button onClick={run} disabled={busy} className="flex shrink-0 items-center gap-2 rounded-full bg-[var(--p-accent)] px-4 py-1.5 text-[12.5px] font-semibold text-[var(--on-accent)] transition-opacity hover:opacity-90 disabled:opacity-60">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <MemoryStick size={14} />}{busy ? tr("Liberando…") : tr("Liberar memória")}
      </button>
      <span className="text-[11.5px] leading-snug text-[var(--p-muted)]">{msg || (isMac ? tr("O macOS pede a sua senha (purge).") : tr("Esvazia a memória parada dos programas."))}</span>
    </div>
  );
}

function MemoryDetail() {
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
  const lvlTone = lvl === 'critical' ? 'var(--p-danger)' : lvl === 'warn' ? 'var(--p-warn)' : undefined;
  return (
    <>
      <Title>{tr("Memória")}</Title>
      <Hero className="p-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--p-muted)]">{tr("Disponível")}</div>
            {m ? <div className="flex items-baseline gap-1"><span className="text-[34px] font-semibold leading-none tabular-nums">{sizeParts(availT).num}</span><span className="text-[14px] font-semibold">{sizeParts(availT).unit}</span><span className="ml-1 text-[12px] text-[var(--p-soft)]">{tr("de {0}", fmtSize(m.total, 'auto', 0))}</span></div> : <Loader2 size={18} className="animate-spin text-[var(--p-muted)]" />}
          </div>
          {m && <div className="text-right"><div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: lvlTone }}>{m.pressure}%</div><div className="mt-0.5 text-[11px] text-[var(--p-muted)]">{tr("de pressão")}</div></div>}
        </div>
        <div className="mt-2.5"><RamStick parts={parts} total={m?.total || 1} /></div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {parts.map((x) => <Chip key={x.label} color={x.color} label={x.label} value={fmtSize(x.value, 'auto', 1)} />)}
          {m && <Chip color="rgba(255,255,255,.25)" label={tr("Livre")} value={fmtSize(avail, 'auto', 1)} />}
        </div>
        <FreeMemory />
      </Hero>
      <Stats>
        <Stat delay={120} label={tr("Pressão")} value={m ? `${m.pressure}%` : '…'} tone={lvlTone}
          sub={lvl === 'critical' ? tr("A memória está no limite.") : lvl === 'warn' ? tr("A memória está ficando apertada.") : tr("Há folga para mais tarefas.")}>
          {m && <Bar value={m.pressure} tone={lvlTone} />}
        </Stat>
        <Stat delay={160} label={tr("Em uso")} value={m ? fmtSize(m.used, 'auto', 1) : '…'} sub={m ? tr("{0}% da memória", Math.round((m.used / m.total) * 100)) : undefined}>
          {m && <Bar value={(m.used / m.total) * 100} />}
        </Stat>
        <Stat delay={200} label={isMac ? tr("Arquivo de troca") : tr("Arquivo de paginação")} value={det && det.swapTotal > 0 ? fmtSize(det.swapUsed, 'auto', 1) : '—'}
          sub={det && det.swapTotal > 0 ? tr("de {0} no disco", fmtSize(det.swapTotal, 'auto', 1)) : undefined}>
          {det && det.swapTotal > 0 && <Bar value={(det.swapUsed / det.swapTotal) * 100} />}
        </Stat>
      </Stats>
      <Consumers list={d?.top} by="mem" unit={tr("Uso")} delay={240} />
    </>
  );
}

function BatteryDetail() {
  const d = useDetails('battery', 4000);
  const cpu = useDetails('cpu', 4000);
  const b = d?.battery, h = d?.health, t: number | undefined = d?.temperature;
  const pctT = useTween(b?.percent ?? 0, 900, true);
  const max: number | undefined = h?.maxCapacity;
  const status = !b ? '…' : b.charging ? tr("Carregando") : b.plugged ? tr("Não carregando") : tr("Na bateria");
  const sub = !b ? '' : b.plugged ? tr("Usando adaptador de energia") : b.minutesLeft ? tr("{0} h {1} min restantes", Math.floor(b.minutesLeft / 60), b.minutesLeft % 60) : tr("Usando a bateria");
  return (
    <>
      <Title>{tr("Bateria")}</Title>
      <Hero className="p-3">
        <div className="flex items-center gap-4">
          <SegRing pct={b?.percent ?? 0} size={164} color={b && b.percent <= 15 && !b.plugged ? 'var(--p-danger)' : 'var(--p-accent)'}>
            <div className="flex items-baseline gap-1"><span className="text-[36px] font-semibold leading-none tabular-nums">{b ? Math.round(pctT) : '…'}</span><span className="text-[15px] font-semibold">%</span></div>
          </SegRing>
          <div className="anim-rise min-w-0 flex-1" style={dl(120)}>
            <div className="text-[17px] font-semibold leading-tight">{status}</div>
            <div className="mt-1 text-[12px] leading-snug text-[var(--p-soft)]">{sub}</div>
          </div>
        </div>
      </Hero>
      <Stats>
        <Stat delay={120} icon={<Heart size={12} fill="currentColor" />} label={tr("Saúde")} value={max !== undefined ? `${max}%` : h?.condition || '—'} tone={max !== undefined && max < 80 ? 'var(--p-warn)' : undefined}
          sub={max === undefined ? undefined : max >= 95 ? tr("Em ótimas condições.") : max >= 80 ? tr("Já perdeu parte da capacidade.") : tr("Pense em trocar a bateria.")}>
          {max !== undefined && <Bar value={max} />}
        </Stat>
        <Stat delay={160} icon={<Clock size={12} />} label={tr("Ciclos de carga")} value={h?.cycles ?? '—'} sub={isMac && h?.cycles !== undefined ? tr("de 1000 previstos") : undefined} />
        <Stat delay={200} icon={<Thermometer size={12} />} label={tr("Temperatura")} value={t !== undefined ? `${Math.round(t)}°C` : '—'} tone={t === undefined ? undefined : t >= 45 ? 'var(--p-danger)' : t >= 35 ? 'var(--p-warn)' : undefined}
          sub={t === undefined ? undefined : t >= 45 ? tr("Quente demais.") : t >= 35 ? tr("Acima do ideal.") : tr("Ideal.")} />
      </Stats>
      <div className="anim-rise mt-2 flex" style={dl(230)}><BigAction icon={<Settings size={14} />} onClick={batterySettings}>{tr("Abrir as configurações de bateria")}</BigAction></div>
      <Consumers list={cpu?.top} by="cpu" unit={tr("Uso, %")} delay={260} />
    </>
  );
}

/** Chip do processador: o encapsulamento com os pinos nos quatro lados e o núcleo no meio. O núcleo brilha mais forte e
 *  pulsa mais rápido conforme a carga, e uma linha de leitura passa por ele. A carga de agora fica no centro. */
function CpuChip({ load, size = 150 }: { load: number; size?: number }) {
  const k = Math.max(0, Math.min(100, load)) / 100;
  const S = size, pad = 16, inner = S - pad * 2, die = inner * 0.62, d0 = (S - die) / 2;
  const pins = 11;
  const pulse = `${(2.6 - k * 1.9).toFixed(2)}s`;
  const heat = k >= 0.9 ? 'var(--p-danger)' : k >= 0.7 ? 'var(--p-warn)' : 'var(--p-accent)';
  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="shrink-0 overflow-visible">
      <defs>
        <radialGradient id="cpuglow" cx=".5" cy=".5" r=".6"><stop offset="0" stopColor={heat} stopOpacity={0.25 + k * 0.7} /><stop offset="1" stopColor={heat} stopOpacity="0" /></radialGradient>
        <linearGradient id="cpudie" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#1b2422" /><stop offset="1" stopColor="#0b0f0e" /></linearGradient>
        <linearGradient id="cpuscan" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={heat} stopOpacity="0" /><stop offset=".5" stopColor={heat} stopOpacity=".55" /><stop offset="1" stopColor={heat} stopOpacity="0" /></linearGradient>
        <clipPath id="cpuclip"><rect x={d0} y={d0} width={die} height={die} rx="6" /></clipPath>
      </defs>
      {/* pinos */}
      {Array.from({ length: pins }, (_, i) => {
        const p = pad + 8 + (i * (inner - 16)) / (pins - 1);
        return (
          <g key={i} fill="#d9b25c" opacity=".85">
            <rect x={p - 1.5} y={2} width="3" height={pad - 2} rx="1" /><rect x={p - 1.5} y={S - pad} width="3" height={pad - 2} rx="1" />
            <rect x={2} y={p - 1.5} width={pad - 2} height="3" rx="1" /><rect x={S - pad} y={p - 1.5} width={pad - 2} height="3" rx="1" />
          </g>
        );
      })}
      {/* encapsulamento */}
      <rect x={pad} y={pad} width={inner} height={inner} rx="10" fill="#141a19" stroke="var(--p-line)" strokeWidth="1.5" />
      <rect x={pad + 5} y={pad + 5} width={inner - 10} height={inner - 10} rx="7" fill="none" stroke="#fff" strokeOpacity=".06" />
      {/* brilho do núcleo, pulsando conforme a carga */}
      <circle cx={S / 2} cy={S / 2} r={die * 0.85} fill="url(#cpuglow)" style={{ animation: `breathe ${pulse} ease-in-out infinite`, transformOrigin: 'center', transformBox: 'fill-box' }} />
      <rect x={d0} y={d0} width={die} height={die} rx="6" fill="url(#cpudie)" stroke={heat} strokeOpacity={0.35 + k * 0.6} strokeWidth="1.5" style={{ filter: glow(heat, 30 + k * 50) }} />
      {/* trilhas dentro do núcleo e a linha de leitura */}
      <g clipPath="url(#cpuclip)">
        {Array.from({ length: 6 }, (_, i) => <line key={i} x1={d0} x2={d0 + die} y1={d0 + ((i + 1) * die) / 7} y2={d0 + ((i + 1) * die) / 7} stroke={heat} strokeOpacity=".08" />)}
        <rect x={d0} y={d0 - die} width={die} height={die * 0.5} fill="url(#cpuscan)" className="cpu-scan" style={{ animationDuration: pulse }} />
      </g>
      <text x={S / 2} y={S / 2 + 6} textAnchor="middle" fontSize="22" fontWeight="600" fill="var(--p-fg)" style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(load)}%</text>
    </svg>
  );
}

function CpuDetail({ hist, open }: { hist: { u: number; s: number }[]; open: Open }) {
  const d = useDetails('cpu', 2000);
  const t: number | undefined = d?.temperature;
  const user = d?.split.user ?? 0, sys = d?.split.system ?? 0, idle = d ? Math.max(0, 100 - user - sys) : 0;
  const top = Math.max(25, Math.ceil(Math.max(0, ...hist.map((p) => p.u + p.s)) / 25) * 25);
  const model = String(d?.model || 'Processador').replace(/\(R\)|\(TM\)|CPU|@.*$/gi, '').replace(/\s+/g, ' ').trim();
  const loadT = useTween(user + sys, 500, true);
  const threads = navigator.hardwareConcurrency || 0;
  const peak = Math.max(0, ...hist.map((p) => p.u + p.s));
  const avg = hist.length ? hist.reduce((a, p) => a + p.u + p.s, 0) / hist.length : 0;
  return (
    <>
      <Title>{model}</Title>
      <Hero className="flex items-center gap-4 p-3">
        <CpuChip load={loadT} />
        <div className="min-w-0 flex-1 space-y-2.5">
          <MeterRow delay={100} icon={<span className="inline-block h-2 w-2 rounded-full bg-[var(--p-c4)]" />} label={tr("Usuário")} value={`${pct1(user)}%`} pct={user} />
          <MeterRow delay={140} icon={<span className="inline-block h-2 w-2 rounded-full bg-[var(--p-c1)]" />} label={tr("Sistema")} value={`${pct1(sys)}%`} pct={sys} />
          <MeterRow delay={180} icon={<span className="inline-block h-2 w-2 rounded-full bg-[var(--p-track-strong)]" />} label={tr("Disponíveis")} value={`${pct1(idle)}%`} pct={idle} calm />
        </div>
      </Hero>
      <Stats>
        <Stat delay={200} label={tr("Média")} value={`${pct1(avg)}%`} sub={tr("desde que o widget abriu")} />
        <Stat delay={230} label={tr("Pico")} value={`${pct1(peak)}%`} sub={tr("maior carga medida")} />
        <Stat delay={260} icon={<Clock size={12} />} label={tr("Ligado há")} value={d ? days(d.uptime) : '…'} sub={threads ? tr("{0} linhas de execução", threads) : undefined} />
      </Stats>
      <Section title={tr("Carga nos últimos minutos")} right={t !== undefined ? tr("Temperatura: {0}°C", Math.round(t)) : undefined} delay={280} />
      <Hero delay={300} className="px-2 pt-2">
        <LineChart w={DETAIL_W - 50} h={78} grid max={top} series={[{ data: hist.map((p) => p.u + p.s), color: 'var(--p-c4)' }, { data: hist.map((p) => p.s), color: 'var(--p-c1)' }]} />
      </Hero>
      {t === undefined && !isMac && <p className="anim-rise mt-1.5 px-1 text-[11px] leading-snug text-[var(--p-muted)]" style={dl(320)}>{tr("O Windows só informa a temperatura com permissão de administrador.")}</p>}
      <Consumers list={d?.top} by="cpu" unit={tr("Uso, %")} delay={340} />
      <div className="anim-rise mt-2 flex" style={dl(460)}><BigAction icon={<Gauge size={14} />} onClick={() => open('performance')}>{tr("Abrir o desempenho")}</BigAction></div>
    </>
  );
}

/** Teste de velocidade: o velocímetro acompanha a medição ao vivo; no fim, mostra a latência, o download e o upload. */
function SpeedTest() {
  const [p, setP] = useState<SpeedProgress | null>(null);
  const [started, setStarted] = useState(false);
  useEffect(() => cc.on.speedProgress(setP), []);
  const live = useTween(p?.mbps ?? 0, 300);
  const run = () => { setStarted(true); setP(null); cc.speedTest(); };
  const phase = p?.phase;
  const running = started && phase !== 'done' && phase !== 'error';
  const value = phase === 'done' ? p?.download ?? 0 : running && (phase === 'download' || phase === 'upload') ? live : 0;
  const label = !started ? '—' : phase === 'done' ? mbps(p?.download) : running && phase !== 'ping' && p ? mbps(live) : '…';
  const sub = !started ? tr("Pronto para testar") : phase === 'done' ? tr("Mbps de download") : phase === 'upload' ? tr("Mbps envio") : phase === 'download' ? tr("Mbps download") : phase === 'error' ? tr("Não foi possível testar") : tr("medindo latência");
  return (
    <Hero delay={260} className="px-3 pb-3 pt-2">
      <div className="flex justify-center"><SpeedGauge value={value} label={label} sub={sub} active={running || phase === 'done'} /></div>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {[[tr("Latência"), p?.ping !== undefined ? `${p.ping} ms` : '—', <Clock key="l" size={12} />], ['Download', p?.download !== undefined ? `${mbps(p.download)}` : '—', <ArrowDown key="d" size={12} />], ['Upload', p?.upload !== undefined ? `${mbps(p.upload)}` : '—', <ArrowUp key="u" size={12} />]].map(([k, v, ic]) => (
          <div key={k as string} className="rounded-lg border border-[var(--p-line)] bg-[var(--p-card)] px-2 py-1.5 text-center">
            <div className="flex items-center justify-center gap-1 text-[10.5px] font-semibold text-[var(--p-muted)]">{ic}{k}</div>
            <div className="text-[15px] font-semibold tabular-nums">{v}{k !== tr("Latência") && v !== '—' ? <span className="ml-0.5 text-[10px] font-normal text-[var(--p-muted)]">Mbps</span> : null}</div>
          </div>
        ))}
      </div>
      {phase === 'error' && <div className="mt-2 text-center text-[11.5px] text-[var(--p-danger)]">{tr("Não foi possível testar:")} {p?.error}</div>}
      <button onClick={run} disabled={running} className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--p-accent)] py-2 text-[13px] font-semibold text-[var(--on-accent)] transition-opacity hover:opacity-90 disabled:opacity-60">
        {running ? <Loader2 size={14} className="animate-spin" /> : <Gauge size={14} />}{running ? tr("Testando…") : phase === 'done' || phase === 'error' ? tr("Testar de novo") : tr("Testar velocidade")}
      </button>
      <p className="mt-1.5 text-center text-[11px] text-[var(--p-muted)]">{tr("Para medir a velocidade, o CleanCode baixa e envia um pequeno arquivo de teste.")}</p>
    </Hero>
  );
}

function NetworkDetail({ s, hist }: { s: MetricsSnapshot | null; hist: { rx: number[]; tx: number[] } }) {
  const d = useDetails('network', 10000);
  const info = d?.info || {};
  const wifi = s?.network && /wi-?fi/i.test(s.network.kind);
  const lvl = info.securityLevel as string | undefined;
  const secText = !d ? null : !info.security ? (wifi ? tr("Conectado.") : tr("Conectado por cabo, então os dados até o roteador não passam pelo ar."))
    : lvl === 'open' ? tr("Esta rede é aberta. Por isso, qualquer pessoa por perto pode ver o que não estiver criptografado. Evite digitar senhas e usar bancos nessa rede.")
      : lvl === 'weak' ? tr("Esta rede usa uma criptografia antiga ({0}), que é fácil de quebrar. Se a rede for sua, troque a segurança do roteador para WPA2 ou WPA3.", info.security)
        : tr("Esta rede é protegida com {0}, então os dados entre o computador e o roteador são criptografados.", info.security);
  const n = s?.network;
  const peakR = Math.max(0, ...hist.rx), peakT = Math.max(0, ...hist.tx);
  const chips = [info.ip && [tr("IP"), info.ip], info.router && [tr("Roteador"), info.router], info.channel && [tr("Canal"), info.channel], info.phy && [tr("Padrão"), info.phy]].filter(Boolean) as [string, string][];
  return (
    <>
      <Title>{tr("Rede")}</Title>
      {/* conexão */}
      <Hero className="p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--on-accent)]" style={{ background: 'linear-gradient(135deg, var(--p-accent), color-mix(in srgb, var(--p-accent) 45%, #000))', boxShadow: '0 0 18px color-mix(in srgb, var(--p-accent) 45%, transparent)' }}>
            {wifi ? <Wifi size={22} /> : <Cable size={22} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">{info.ssid || n?.kind || tr("Sem conexão")}</div>
            <div className="text-[11.5px] text-[var(--p-soft)]">{wifi ? tr("Conexão Wi-Fi") : n ? tr("Conexão cabeada") : tr("Desconectado")}</div>
          </div>
          {lvl && <span className={cx('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', lvl === 'open' || lvl === 'weak' ? 'bg-[color-mix(in_srgb,var(--p-warn)_22%,transparent)] text-[var(--p-warn)]' : 'bg-[color-mix(in_srgb,var(--p-accent)_20%,transparent)] text-[var(--p-link)]')}>{lvl === 'open' ? tr("Aberta") : lvl === 'weak' ? tr("Fraca") : lvl === 'strong' ? tr("Forte") : tr("Segura")}</span>}
          {!lvl && n && <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[var(--p-link)]"><span className="h-2 w-2 rounded-full bg-[var(--p-accent)] anim-breathe" />{tr("Conectado")}</span>}
        </div>
        {secText === null ? <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--p-soft)]"><Loader2 size={12} className="animate-spin" />{tr("Lendo detalhes da rede…")}</div> : <p className="mt-2 text-[11.5px] leading-snug text-[var(--p-soft)]">{secText}</p>}
        {chips.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{chips.map(([k, v]) => <span key={k} className="rounded-md border border-[var(--p-line)] bg-[var(--p-track)] px-1.5 py-0.5 text-[10.5px] tabular-nums text-[var(--p-soft)]"><span className="text-[var(--p-muted)]">{k}</span> {v}</span>)}</div>}
      </Hero>
      {/* tráfego ao vivo */}
      <Section title={tr("Tráfego ao vivo")} right={tr("últimos 2 minutos")} delay={120} />
      <Hero delay={140}>
        <div className="flex items-start justify-between px-3 pt-2.5">
          <div><div className="flex items-center gap-1 text-[10.5px] font-semibold text-[var(--p-c4)]"><ArrowDown size={11} />Download</div><div className="text-[20px] font-semibold leading-tight tabular-nums">{n ? rate(n.rxRate) : '—'}</div></div>
          <div className="text-right text-[10.5px] leading-snug text-[var(--p-muted)]"><div>{tr("Total recebido")} <span className="font-semibold text-[var(--p-fg)] tabular-nums">{n?.rxTotal !== undefined ? fmtSize(n.rxTotal, 'auto', 1) : '—'}</span></div><div>{tr("Pico")} <span className="tabular-nums">{rate(peakR)}</span></div></div>
        </div>
        <MirrorChart rx={hist.rx} tx={hist.tx} w={DETAIL_W - 34} h={118} />
        <div className="flex items-end justify-between px-3 pb-2.5">
          <div><div className="text-[20px] font-semibold leading-tight tabular-nums">{n ? rate(n.txRate) : '—'}</div><div className="flex items-center gap-1 text-[10.5px] font-semibold text-[var(--p-c1)]"><ArrowUp size={11} />Upload</div></div>
          <div className="text-right text-[10.5px] leading-snug text-[var(--p-muted)]"><div>{tr("Pico")} <span className="tabular-nums">{rate(peakT)}</span></div><div>{tr("Total enviado")} <span className="font-semibold text-[var(--p-fg)] tabular-nums">{n?.txTotal !== undefined ? fmtSize(n.txTotal, 'auto', 1) : '—'}</span></div></div>
        </div>
      </Hero>
      <Section title={tr("Teste a sua conexão")} delay={240} />
      <SpeedTest />
    </>
  );
}

/** Chip da placa de vídeo: o núcleo com uma grade de unidades de cálculo que acendem conforme o uso, e os módulos de
 *  memória de vídeo em volta, que acendem conforme a memória usada. As unidades acesas mudam de lugar devagar. */
function GpuDie({ util, mem }: { util: number; mem?: number }) {
  const W = DETAIL_W - 34, H = 150;
  const cols = 16, rows = 6, N = cols * rows;
  const dieW = W * 0.54, dieH = 86, dx = (W - dieW) / 2, dy = (H - dieH) / 2;
  const cw = (dieW - 14) / cols, ch = (dieH - 14) / rows;
  const [tick, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick((v) => v + 1), 900); return () => clearInterval(i); }, []);
  // ordem das unidades: embaralhada e trocada um pouco a cada passo, para o brilho andar pela grade
  const order = useMemo(() => { const a = Array.from({ length: N }, (_, i) => i); let seed = tick * 9301 + 49297; for (let i = a.length - 1; i > 0; i--) { seed = (seed * 9301 + 49297) % 233280; const j = Math.floor((seed / 233280) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }, [tick, N]);
  const lit = new Set(order.slice(0, Math.round((Math.max(0, Math.min(100, util)) / 100) * N)));
  const memLit = Math.round(((mem ?? 0) / 100) * 8);
  const heat = util >= 90 ? 'var(--p-warn)' : 'var(--p-accent)';
  const mods = [0, 1, 2, 3].flatMap((i) => [{ x: dx + 8 + i * ((dieW - 16) / 4) + 4, y: dy - 30 }, { x: dx + 8 + i * ((dieW - 16) / 4) + 4, y: dy + dieH + 8 }]);
  return (
    <svg width={W} height={H} className="overflow-visible">
      <defs>
        <radialGradient id="gdglow" cx=".5" cy=".5" r=".6"><stop offset="0" stopColor={heat} stopOpacity={0.15 + (util / 100) * 0.45} /><stop offset="1" stopColor={heat} stopOpacity="0" /></radialGradient>
        <pattern id="gdtr" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0 8 H8 V0 M8 16 V11 H16" fill="none" stroke="var(--p-accent)" strokeWidth=".7" /></pattern>
      </defs>
      {/* placa: trilhas e o brilho em volta do núcleo */}
      <rect x="0" y="0" width={W} height={H} rx="12" fill="url(#gdtr)" opacity=".1" />
      <ellipse cx={W / 2} cy={H / 2} rx={dieW * 0.75} ry={H * 0.6} fill="url(#gdglow)" />
      {/* módulos de memória de vídeo */}
      {mods.map((m, i) => {
        const on = i < memLit;
        return <g key={i}><rect x={m.x} y={m.y} width={(dieW - 16) / 4 - 8} height="22" rx="3" fill="#0b0f0e" stroke={on ? 'var(--p-c3)' : 'rgba(255,255,255,.12)'} strokeWidth="1.2" style={{ filter: on ? glow('var(--p-c3)', 45) : undefined, transition: 'stroke .4s' }} /><rect x={m.x + 5} y={m.y + 8} width={(dieW - 16) / 4 - 18} height="6" rx="1.5" fill={on ? 'var(--p-c3)' : 'rgba(255,255,255,.08)'} opacity={on ? 0.8 : 1} /></g>;
      })}
      {/* núcleo */}
      <rect x={dx} y={dy} width={dieW} height={dieH} rx="8" fill="#0c1110" stroke={heat} strokeOpacity={0.3 + (util / 100) * 0.6} strokeWidth="1.5" style={{ filter: glow(heat, 25 + util * 0.4) }} />
      {Array.from({ length: N }, (_, i) => {
        const on = lit.has(i), c = i % cols, r = Math.floor(i / cols);
        return <rect key={i} x={dx + 7 + c * cw + 1} y={dy + 7 + r * ch + 1} width={cw - 2} height={ch - 2} rx="1.5" fill={on ? heat : 'rgba(255,255,255,.05)'} opacity={on ? 0.85 : 1} style={{ transition: 'fill .5s ease, opacity .5s ease' }} />;
      })}
    </svg>
  );
}

/** Medidor de LEDs: uma fileira de segmentos que acendem até o valor, do verde ao vermelho no fim. */
function LedMeter({ value, segs = 28, warnAt = 0.75, dangerAt = 0.9 }: { value: number; segs?: number; warnAt?: number; dangerAt?: number }) {
  // warnAt e dangerAt acima de 1: a fileira fica toda na cor de destaque (por exemplo, no que está livre)
  const on = useMounted();
  const lit = Math.round((Math.max(0, Math.min(100, value)) / 100) * segs);
  return (
    <div className="flex h-3 gap-[2px]">
      {Array.from({ length: segs }, (_, i) => {
        const k = i / segs, c = k >= dangerAt ? 'var(--p-danger)' : k >= warnAt ? 'var(--p-warn)' : 'var(--p-accent)', isOn = on && i < lit;
        return <span key={i} className="flex-1 rounded-[2px]" style={{ background: isOn ? c : 'var(--p-track)', boxShadow: isOn ? `0 0 6px color-mix(in srgb, ${c} 70%, transparent)` : undefined, transition: `background .25s ease ${i * 14}ms` }} />;
      })}
    </div>
  );
}
/** Linha de medidor: ícone, nome, valor à direita e os LEDs embaixo. */
function MeterRow({ icon, label, value, pct, sub, delay = 0, calm = false }: { icon: React.ReactNode; label: string; value: string; pct: number; sub?: string; delay?: number; calm?: boolean }) {
  return (
    <div className="anim-rise" style={dl(delay)}>
      <div className="mb-1 flex items-baseline gap-1.5 text-[11.5px]">
        <span className="text-[var(--p-muted)]">{icon}</span><span className="font-semibold text-[var(--p-soft)]">{label}</span>
        {sub && <span className="text-[10.5px] text-[var(--p-muted)]">{sub}</span>}
        <span className="ml-auto text-[14px] font-semibold tabular-nums">{value}</span>
      </div>
      <LedMeter value={pct} warnAt={calm ? 2 : 0.75} dangerAt={calm ? 2 : 0.9} />
    </div>
  );
}

function GpuDetail({ hist, open, fans }: { hist: number[]; open: Open; fans: FanState | null }) {
  const d = useDetails('gpu', 2000);
  const g = d?.info?.[0], live = d?.live || {};
  const util = live.util ?? 0;
  const utilT = useTween(util, 500, true);
  const memPct = live.memUsed && live.memTotal ? (live.memUsed / live.memTotal) * 100 : undefined;
  const t: number | undefined = live.temp;
  const displays: any[] = d?.displays || [];
  const procs: any[] = live.procs || [];
  const topP = Math.max(1, ...procs.map((p) => p.util || 0));
  const gf = fans?.controls.find((f) => f.kind === 'gpu');
  return (
    <>
      <Title>{g?.name || tr("Placa de vídeo")}</Title>
      {/* o chip da placa: as unidades de cálculo acendem conforme o uso, e a memória de vídeo em volta */}
      <Hero className="px-2 pb-2 pt-2">
        <div className="relative flex justify-center"><GpuDie util={utilT} mem={memPct} /></div>
        <div className="absolute left-3 top-1/2 -translate-y-[70%]">
          <div className="flex items-baseline gap-0.5"><span className="text-[28px] font-semibold leading-none tabular-nums">{d ? Math.round(utilT) : '…'}</span><span className="text-[12px] font-semibold">%</span></div>
          <div className="text-[10.5px] text-[var(--p-soft)]">{tr("em uso agora")}</div>
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-[70%] text-right">
          {t !== undefined && <div className="text-[18px] font-semibold leading-tight tabular-nums">{Math.round(t)}°C</div>}
          {gf?.rpm !== undefined && <div className="text-[11px] tabular-nums text-[var(--p-soft)]">{fanRpm(gf.rpm)} RPM</div>}
        </div>
        <div className="mt-1"><LineChart w={DETAIL_W - 50} h={40} max={100} series={[{ data: hist, color: 'var(--p-accent)' }]} /></div>
      </Hero>
      {/* medidores */}
      <div className="anim-rise mt-2 space-y-2.5 rounded-2xl border border-[var(--p-line)] bg-[var(--p-card)] p-3" style={dl(100)}>
        <MeterRow delay={120} icon={<Gauge size={12} />} label={tr("Uso")} value={d ? `${Math.round(utilT)}%` : '…'} pct={util} />
        {t !== undefined && <MeterRow delay={160} icon={<Thermometer size={12} />} label={tr("Temperatura")} value={`${Math.round(t)}°C`} pct={t} sub={t >= 85 ? tr("Muito quente.") : tr("Dentro do normal.")} />}
        {memPct !== undefined && <MeterRow delay={200} icon={<MemoryStick size={12} />} label={isMac ? tr("Memória da GPU") : tr("Memória de vídeo")} value={`${fmtSize(live.memUsed, 'auto', 1)} / ${fmtSize(live.memTotal, 'auto', 0)}`} pct={memPct} />}
        {gf?.pct !== undefined && <MeterRow delay={240} icon={<Fan size={12} />} label={tr("Ventoinha")} value={`${Math.round(gf.pct)}%`} pct={gf.pct} />}
      </div>
      <div className="anim-rise mt-2 flex flex-wrap gap-1.5 px-0.5" style={dl(260)}>
        <span className="rounded-md border border-[var(--p-line)] bg-[var(--p-track)] px-2 py-0.5 text-[10.5px] text-[var(--p-soft)]"><span className="text-[var(--p-muted)]">{isMac ? tr("Gráficos") : tr("Driver")}</span> {isMac ? g?.api || 'Metal' : g?.driver || '—'}</span>
        {g?.cores ? <span className="rounded-md border border-[var(--p-line)] bg-[var(--p-track)] px-2 py-0.5 text-[10.5px] text-[var(--p-soft)]">{tr("{0} núcleos", g.cores)}</span> : null}
        {live.memTotal ? <span className="rounded-md border border-[var(--p-line)] bg-[var(--p-track)] px-2 py-0.5 text-[10.5px] text-[var(--p-soft)]">{fmtSize(live.memTotal, 'auto', 0)} {isMac ? tr("de memória unificada") : tr("de memória de vídeo")}</span> : null}
      </div>
      {/* telas: um monitor desenhado para cada uma, com a resolução na tela */}
      {displays.length > 0 && (
        <>
          <Section title={tr("Telas conectadas")} right={String(displays.length)} delay={280} />
          <div className="grid grid-cols-2 gap-2">
            {displays.map((x, i) => {
              const res = x.resolution ? String(x.resolution).replace(/ @.*/, '') : '', hz = /@ ?(\d+)/.exec(String(x.resolution || ''))?.[1];
              return (
                <div key={`${x.name}${i}`} className="anim-rise flex flex-col items-center rounded-xl border border-[var(--p-line)] bg-[var(--p-card)] px-2 pb-2 pt-2.5" style={dl(300 + i * 40)}>
                  <div className="relative flex h-[54px] w-[92px] items-center justify-center rounded-md border-2 border-[var(--p-soft)]/40 text-[11px] font-semibold tabular-nums" style={{ background: 'radial-gradient(120% 120% at 30% 20%, color-mix(in srgb, var(--p-accent) 35%, transparent), transparent 70%), #07090a' }}>{res || '—'}</div>
                  <div className="h-2 w-3 bg-[var(--p-soft)]/40" /><div className="h-1 w-10 rounded-full bg-[var(--p-soft)]/40" />
                  <div className="mt-1.5 w-full break-words text-center text-[11.5px] font-semibold leading-tight">{x.name}</div>
                  <div className="text-[10.5px] tabular-nums text-[var(--p-muted)]">{[hz && `${hz} Hz`, x.primary && tr("Principal")].filter(Boolean).join(', ')}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {procs.length > 0 && (
        <>
          <Section title={tr("Apps que mais usam a placa de vídeo")} delay={340} />
          <div className="anim-rise space-y-2 rounded-2xl border border-[var(--p-line)] bg-[var(--p-card)] p-3" style={dl(360)}>
            {procs.slice(0, 5).map((p) => (
              <div key={p.pid} className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-[var(--on-accent)]" style={{ background: 'linear-gradient(135deg, var(--p-accent), color-mix(in srgb, var(--p-accent) 45%, #000))' }}>{String(p.name).slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-[12.5px]"><span className="min-w-0 flex-1 truncate">{p.name}</span><span className="tabular-nums text-[var(--p-soft)]">{pct1(p.util)} %</span></div>
                  <Bar value={(p.util / topP) * 100} className="mt-1 !h-1" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="anim-rise mt-3 flex" style={dl(420)}><BigAction icon={<Gpu size={14} />} onClick={() => open('hardware')}>{tr("Monitor de hardware")}</BigAction></div>
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
      <ChartHero big={w !== undefined ? wT.toLocaleString(LOCALE, { maximumFractionDigits: 1 }) : '—'} unit="W" caption={p.systemW !== undefined ? tr("consumo do sistema") : tr("potência da bateria")} series={[{ data: hist, color: 'var(--p-c2)' }]} />
      <Stats>
        <Stat delay={120} icon={<PlugZap size={12} />} label={tr("Carregador")} value={p.adapterW ? `${p.adapterW} W` : b?.plugged ? tr("Conectado") : tr("Desconectado")} />
        <Stat delay={160} icon={<Zap size={12} />} label={p.batteryW !== undefined && p.batteryW >= 0 ? tr("Entrando na bateria") : tr("Saindo da bateria")}
          value={p.batteryW !== undefined ? `${Math.abs(p.batteryW).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} W` : '—'} />
        <Stat delay={200} label={tr("Tensão")} value={p.voltage ? `${p.voltage.toLocaleString(LOCALE, { maximumFractionDigits: 2 })} V` : '—'} />
      </Stats>
      <Stats cols={2}>
        <Stat delay={240} icon={<BatteryFull size={12} />} label={b ? tr("Bateria") : tr("Alimentação")} value={b ? `${b.percent}%` : tr("Tomada")}
          sub={!b ? tr("Ligado direto na tomada.") : b.charging ? tr("Carregando.") : b.plugged ? tr("Na tomada, com a carga pausada para proteger a bateria.") : b.minutesLeft ? tr("{0} h {1} min restantes.", Math.floor(b.minutesLeft / 60), b.minutesLeft % 60) : tr("Usando a bateria.")}>
          {b && <Bar value={b.percent} />}
        </Stat>
        <Stat delay={280} icon={<Heart size={12} fill="currentColor" />} label={tr("Saúde")} value={h?.maxCapacity !== undefined ? `${h.maxCapacity}%` : '—'}
          sub={h?.cycles !== undefined ? tr("{0} ciclos de carga.", h.cycles) : p.plan ? tr("Plano de energia: {0}.", p.plan) : undefined} />
      </Stats>
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
            <div key={x.name} className={tile} style={{ animationDelay: `calc(var(--d0, 0ms) + ${60 + i * 60}ms)` }}>
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
      {!d ? null : !d.external.length ? <p className="anim-rise px-4 py-5 text-center text-[13px] leading-snug text-[var(--p-soft)]" style={{ animationDelay: 'calc(var(--d0, 0ms) + 200ms)' }}>{tr("Quando você conectar um disco externo ou um pendrive, ele vai aparecer aqui.")}</p> : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {d.external.map((x: any, i: number) => (
              <div key={x.root} className={tile} style={{ animationDelay: `calc(var(--d0, 0ms) + ${200 + i * 60}ms)` }}>
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

/** Texto numa linha só. Quando não cabe, ele desliza devagar para o lado e volta, sem quebrar a linha. */
function Slide({ children, className }: { children?: React.ReactNode; className?: string }) {
  const box = useRef<HTMLSpanElement>(null), inner = useRef<HTMLSpanElement>(null);
  const [d, setD] = useState(0);
  useEffect(() => {
    const m = () => { if (box.current && inner.current) setD(Math.max(0, Math.ceil(inner.current.scrollWidth - box.current.clientWidth))); };
    m();
    const ro = new ResizeObserver(m); ro.observe(box.current!); ro.observe(inner.current!);
    return () => ro.disconnect();
  }, [children]);
  // cerca de 8 pixels por segundo, com uma pausa em cada ponta
  const style = d > 0 ? ({ '--slide': `-${d}px`, animation: `panel-slide ${(4 + d / 8).toFixed(1)}s ease-in-out infinite alternate` } as React.CSSProperties) : undefined;
  return <span ref={box} className={cx('block overflow-hidden whitespace-nowrap', className)}><span ref={inner} className="inline-block" style={style}>{children}</span></span>;
}

/** Cartão pequeno de uma métrica (três por linha): ícone e título, o valor, uma linha de apoio e a barra ou o gráfico. */
function Mini({ icon, title, value, sub, action, temp, aside, children, delay, onClick, active }: { icon: React.ReactNode; title: string; value?: React.ReactNode; sub?: React.ReactNode; aside?: React.ReactNode; action?: React.ReactNode; temp?: number; children?: React.ReactNode; delay: number; onClick?: () => void; active: boolean }) {
  return (
    <Card delay={delay} onClick={onClick} active={active} className="!px-2.5 !py-1.5">
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="shrink-0 text-[var(--p-muted)]">{icon}</span>
        <Slide className="min-w-0 flex-1 text-[12.5px] font-semibold">{title}</Slide>
        {aside !== undefined && <span className="shrink-0 text-[11px] tabular-nums text-[var(--p-muted)]">{aside}</span>}
        {temp !== undefined && <span className={cx('shrink-0 text-[11.5px] font-semibold tabular-nums', tempTone(temp))}>{Math.round(temp)}°C</span>}
      </div>
      {(value !== undefined || sub !== undefined || action) && (
        <div className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] leading-tight">
          <Slide className="min-w-0 flex-1 text-[var(--p-muted)]"><span className="tabular-nums text-[var(--p-fg)]">{value}</span>{value !== undefined && sub !== undefined ? '  ' : ''}{sub}</Slide>
          {action && <span className="shrink-0 [&_button]:text-[11.5px]">{action}</span>}
        </div>
      )}
      {children && <div className="mt-1">{children}</div>}
    </Card>
  );
}

// ---------- ventoinhas ----------
/** Estado das ventoinhas a cada 2 segundos (null quando o sistema não informa as ventoinhas). */
function useFanState() {
  const [st, setSt] = useState<FanState | null>(null);
  useEffect(() => {
    let alive = true, t: ReturnType<typeof setTimeout>;
    let first = true;
    const tick = async () => {
      clearTimeout(t);
      if (first || !document.hidden) { first = false; try { const r = await cc.fanState(); if (alive) setSt(r); } catch { /* próxima leitura */ } }
      if (alive) t = setTimeout(tick, 2000);
    };
    tick();
    const off = cc.on.panelShown(() => tick());
    return () => { alive = false; clearTimeout(t); off(); };
  }, []);
  return st;
}
const fanRpm = (v?: number) => (v === undefined ? '—' : Math.round(v).toLocaleString(LOCALE));
const fanKind = (k: FanControlInfo['kind']) => (k === 'gpu' ? tr("Placa de vídeo") : k === 'board' ? tr("Placa-mãe") : k === 'cooler' ? tr("Refrigeração") : tr("Outras ventoinhas"));
/** A ventoinha da placa de vídeo, que aparece em 3D quando a placa tem foto no catálogo. */
const gpuFan = (fans: FanState) => fans.controls.find((f) => f.kind === 'gpu');

/** Modo da ventoinha como no app: o desenho animado do modo (robô, linha reta ou curva) e o nome, ou o aviso quando há um problema. */
function FanMode({ fan, cfg, big }: { fan: FanControlInfo; cfg?: FanConfig; big?: boolean }) {
  const mode = fan.locked ? 'auto' : cfg?.mode || 'auto';
  const st = fanStatus(fan, mode);
  if (fan.locked || st.tone === 'warn' || st.tone === 'danger') return <span className="font-semibold" style={{ color: TONE[st.tone] }}>{st.short}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('inline-flex shrink-0', big && 'origin-left scale-[1.35]')}><ModeIcon mode={mode} color={mode === 'auto' ? 'var(--p-soft)' : 'var(--p-accent)'} /></span>
      <span className={big ? 'ml-2' : undefined}>{MODE_LABEL[mode]}{mode !== 'auto' && st.tone === 'ok' && /%$/.test(st.short) ? `, ${st.short}` : ''}</span>
    </span>
  );
}
/** Ventoinhas que aparecem no widget: só as que estão ligadas. Uma saída da placa-mãe sem RPM e no modo automático está vazia. */
const activeFans = (fans: FanState, cfg?: Record<string, FanConfig>) => fans.controls.filter((f) => f.kind === 'gpu' || cfg?.[f.id]?.pump || (f.rpm ?? 0) > 0 || (cfg?.[f.id]?.mode || 'auto') !== 'auto');

/** Bloco das ventoinhas: a placa de vídeo num cartão largo, com a placa grande à esquerda e os dados à direita, e embaixo
 *  um cartão para cada uma das outras ventoinhas ligadas. Cada cartão abre o detalhe da própria ventoinha. */
function FansCard({ fans, cfg, delay, onOpen, activeId }: { fans: FanState; cfg?: Record<string, FanConfig>; delay: number; onOpen: (id: string) => void; activeId: string | null }) {
  const list = activeFans(fans, cfg);
  // os desenhos (placa 3D, ventoinhas e bomba) entram depois da animação de entrada, para ela não engasgar
  const [art, setArt] = useState(false);
  useEffect(() => { const t = setTimeout(() => setArt(true), 650); return () => clearTimeout(t); }, []);
  const g = list.find((f) => f.kind === 'gpu'), card = useGpuCard(g?.hw);
  const rest = list.filter((f) => !(card && f === g));
  const row = useRef<HTMLDivElement>(null);
  // a rodinha do mouse também rola os cartões para o lado, até chegar ao fim deles
  useEffect(() => {
    const el = row.current; if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0 || (e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return;
      e.preventDefault(); el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const tone = (id: string) => (activeId === id ? 'border-[rgba(255,255,255,.16)] bg-[var(--p-card-hover)]' : 'border-[var(--p-line)] bg-[var(--p-card)] hover:bg-[var(--p-card-hover)]');
  if (!list.length) return null;
  return (
    <>
      <div className="anim-rise flex items-center gap-2 px-1 pb-1.5 pt-3" style={dl(delay)}>
        <Fan size={15} className="text-[var(--p-muted)]" />
        <span className="text-[14px] font-semibold text-[var(--p-muted)]">{tr("Ventoinhas")}</span>
        <span className="ml-auto text-xs text-[var(--p-muted)]">{tr("{0} ligadas", list.length)}</span>
      </div>
      {card && g && (
        <div onClick={() => onOpen(g.id)} className={cx('anim-rise flex cursor-pointer items-center gap-3 rounded-xl border py-1.5 pl-0 pr-3 backdrop-blur-xl transition-colors', tone(g.id))} style={dl(delay + 20)}>
          <div className="w-[60%] shrink-0" style={{ height: 168 }}>{art && <div className="anim-fade-in"><GpuHero card={card} rpm={g.rpm} height={168} whole align="left" /></div>}</div>
          <div className="min-w-0 flex-1 whitespace-nowrap">
            <Slide className="text-[13.5px] font-semibold">{cfg?.[g.id]?.label || g.hw}</Slide>
            <div className="text-[11px] text-[var(--p-muted)]">{tr("Placa de vídeo")}</div>
            <div className="mt-2 flex items-baseline gap-1"><span className="text-[26px] font-semibold leading-none tabular-nums">{fanRpm(g.rpm)}</span><span className="text-[11px] text-[var(--p-muted)]">RPM</span></div>
            <div className="mt-2.5 text-[12px] text-[var(--p-soft)]"><FanMode fan={g} cfg={cfg?.[g.id]} big /></div>
            {g.pct !== undefined && (
              <>
                <div className="mt-2.5 flex justify-between text-[11px] text-[var(--p-muted)]"><span>{tr("Força")}</span><span className="tabular-nums">{Math.round(g.pct)}%</span></div>
                <Bar value={g.pct} className="mt-1" />
              </>
            )}
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <div ref={row} className="no-scrollbar mt-1.5 flex snap-x gap-1.5 overflow-x-auto">
          {rest.map((f, i) => {
            const c = cfg?.[f.id];
            return (
              <div key={f.id} onClick={() => onOpen(f.id)} className={cx('anim-rise relative flex w-[184px] shrink-0 snap-start cursor-pointer items-center gap-2 rounded-xl border px-2 py-1.5 backdrop-blur-xl transition-colors', tone(f.id))} style={dl(delay + 40 + i * 25)}>
                <span className="block h-10 w-10 shrink-0">{art && (c?.pump ? <PumpArt compact rpm={f.rpm} size={40} /> : <FanSpinner rpm={f.rpm} size={40} />)}</span>
                <div className="min-w-0 flex-1 whitespace-nowrap leading-tight">
                  <Slide className="text-[11.5px] font-semibold">{c?.label || f.name}</Slide>
                  <div className="text-[13px] font-semibold tabular-nums">{fanRpm(f.rpm)} <span className="text-[10px] font-normal text-[var(--p-muted)]">RPM</span></div>
                  <Slide className="mt-0.5 text-[10.5px] text-[var(--p-soft)]"><FanMode fan={f} cfg={c} /></Slide>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Curva da ventoinha: a temperatura embaixo, a força na lateral e um ponto na temperatura de agora. */
function CurveChart({ points, temp }: { points: [number, number][]; temp?: number }) {
  const W = DETAIL_W - 62, H = 110, x0 = 28, y0 = 6, x1 = W - 14, y1 = H - 18;
  const X = (t: number) => x0 + ((Math.max(20, Math.min(100, t)) - 20) / 80) * (x1 - x0);
  const Y = (p: number) => y1 - (Math.max(0, Math.min(100, p)) / 100) * (y1 - y0);
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const line = pts.map(([t, p], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(p).toFixed(1)}`).join(' ');
  const now = temp !== undefined && pts.length ? curveAt(pts, temp) : undefined;
  return (
    <svg width={W} height={H} className="overflow-visible">
      <g stroke="var(--p-grid)">{[0, 25, 50, 75, 100].map((p) => <line key={p} x1={x0} x2={x1} y1={Y(p)} y2={Y(p)} />)}</g>
      <g fill="var(--p-muted)" fontSize="9">{[0, 50, 100].map((p) => <text key={p} x={x0 - 4} y={Y(p) + 3} textAnchor="end">{p}%</text>)}{[20, 40, 60, 80, 100].map((t) => <text key={t} x={X(t)} y={H - 4} textAnchor="middle">{t}°C</text>)}</g>
      {pts.length > 1 && <path d={`${line} L${X(pts[pts.length - 1][0])},${y1} L${X(pts[0][0])},${y1} Z`} fill="color-mix(in srgb, var(--p-accent) 18%, transparent)" />}
      <path d={line} pathLength={1} className="anim-draw" fill="none" stroke="var(--p-accent)" strokeWidth="2" strokeLinejoin="round" />
      {pts.map(([t, p], i) => <circle key={i} cx={X(t)} cy={Y(p)} r="2.6" fill="var(--p-accent)" />)}
      {now !== undefined && temp !== undefined && <><line x1={X(temp)} x2={X(temp)} y1={y0} y2={y1} stroke="var(--p-warn)" strokeDasharray="3 3" /><circle cx={X(temp)} cy={Y(now)} r="4.5" fill="var(--p-warn)" style={{ filter: glow('var(--p-warn)') }} /></>}
    </svg>
  );
}
function curveAt(pts: [number, number][], t: number) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, pa] = pts[i - 1], [b, pb] = pts[i]; return b - a <= 0 ? pb : pa + ((pb - pa) * (t - a)) / (b - a); }
  return pts[pts.length - 1][1];
}

/** Detalhe de uma ventoinha: o desenho grande girando, o RPM, o modo, a temperatura que guia a ventoinha e o histórico. */
function FanDetail({ fans, id, cfg, hist, open }: { fans: FanState | null; id: string | null; cfg?: Record<string, FanConfig>; hist: number[]; open: Open }) {
  const f = fans?.controls.find((x) => x.id === id);
  const c = f ? cfg?.[f.id] : undefined;
  const card = useGpuCard(f?.kind === 'gpu' ? f.hw : undefined);
  if (!fans || !f) return <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-[var(--p-muted)]" /></div>;
  const mode = f.locked ? 'auto' : c?.mode || 'auto';
  const st = fanStatus(f, mode);
  // temperatura que guia a ventoinha: a escolhida na curva; sem escolha, a da placa de vídeo ou a do processador
  const src = (c?.source && fans.temps.find((t) => t.id === c.source)) || (f.kind === 'gpu' ? fans.temps.find((t) => t.kind === 'gpu') : fans.temps.find((t) => t.kind === 'cpu' && /package|tctl/i.test(t.name)) || fans.temps.find((t) => t.kind === 'cpu'));
  const tTone = src ? (src.value >= 85 ? 'var(--p-danger)' : src.value >= 75 ? 'var(--p-warn)' : undefined) : undefined;
  const maxRpm = Math.max(0, ...hist);
  return (
    <>
      <Title>{c?.label || (f.kind === 'gpu' ? f.hw : f.name)}</Title>
      <Hero>
        {card ? <div className="py-2"><GpuHero card={card} rpm={f.rpm} height={190} whole /></div>
          : c?.pump ? <div className="flex justify-center py-4"><PumpArt compact rpm={f.rpm} size={170} /></div> : <div className="px-1 py-2"><FanTrioHero rpm={f.rpm} height={140} plain /></div>}
        <div className="flex items-end justify-between gap-3 border-t border-[var(--p-line)] px-3 py-2.5">
          <div>
            <div className="flex items-baseline gap-1"><span className="text-[30px] font-semibold leading-none tabular-nums">{fanRpm(f.rpm)}</span><span className="text-[12px] text-[var(--p-muted)]">RPM</span></div>
            <div className="mt-1 text-[11px] text-[var(--p-muted)]">{c?.pump ? tr("Bomba") : fanKind(f.kind)}{c?.label ? `, ${f.name}` : ''}</div>
          </div>
          <div className="text-right text-[12.5px] text-[var(--p-soft)]"><FanMode fan={f} cfg={c} big /></div>
        </div>
      </Hero>
      <Stats>
        <Stat delay={120} icon={<Gauge size={12} />} label={tr("Força")} value={f.pct !== undefined ? `${Math.round(f.pct)}%` : '—'}>{f.pct !== undefined && <Bar value={f.pct} />}</Stat>
        <Stat delay={160} icon={<Thermometer size={12} />} label={tr("Temperatura")} value={src ? `${Math.round(src.value)}°C` : '—'} tone={tTone} sub={src ? src.name : undefined} />
        <Stat delay={200} icon={<Fan size={12} />} label={tr("Maior RPM")} value={maxRpm ? fanRpm(maxRpm) : '—'} sub={tr("desde que o widget abriu")} />
      </Stats>
      <Section title={tr("Velocidade nos últimos minutos")} delay={230} />
      <Hero delay={250} className="px-2 pt-2"><LineChart w={DETAIL_W - 50} h={70} series={[{ data: hist, color: 'var(--p-c4)' }]} /></Hero>
      <Section title={MODE_LABEL[mode]} delay={280} />
      <div className="anim-rise rounded-xl border border-[var(--p-line)] bg-[var(--p-card)] px-3 py-2.5" style={dl(300)}>
        {mode === 'curve' && c?.points?.length ? <CurveChart points={c.points} temp={src?.value} /> : null}
        {mode === 'fixed' && <><div className="flex justify-between text-[12px]"><span className="text-[var(--p-soft)]">{tr("A ventoinha fica sempre nesta força.")}</span><span className="font-semibold tabular-nums">{c?.value ?? 0}%</span></div><Bar value={c?.value ?? 0} className="mt-1.5" /></>}
        <p className={cx('text-[11.5px] leading-snug text-[var(--p-soft)]', mode !== 'auto' && 'mt-2')}>{st.long}</p>
      </div>
      <div className="anim-rise mt-3 flex" style={dl(340)}><BigAction icon={<Fan size={14} />} onClick={() => open('fans')}>{tr("Abrir a tela Ventoinhas")}</BigAction></div>
    </>
  );
}

/** Mapa do disco do sistema (o mesmo da Visão geral): o que ocupa o espaço, por tipo de conteúdo. */
function DiskMap({ disk, open }: { disk?: { used: number; total: number }; open: Open }) {
  const [map, setMap] = useState<StorageMapData | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    cc.storageMap().then((m) => alive && setMap(m)).catch(() => {});
    const off = cc.on.storageProgress((m) => alive && setMap({ ...m, cats: m.cats.map((x) => ({ ...x })) }));
    return () => { alive = false; off(); };
  }, []);
  if (!disk) return null;
  const segs = (map?.cats || []).map((x) => ({ id: x.id, label: x.label, size: x.size, done: x.done, color: MAP_COLORS[x.id] || '#94a3b8', icon: MAP_ICONS[x.id], hint: MAP_HINTS[x.id] || '' }));
  const known = segs.reduce((s, x) => s + x.size, 0);
  segs.push({ id: 'system', label: tr("Sistema e outros"), size: Math.max(0, disk.used - known), done: !!map?.done, color: MAP_COLORS.system, icon: MAP_ICONS.system, hint: MAP_HINTS.system });
  const list = segs.filter((x) => x.size > 0 || !x.done).sort((a, b) => (a.id === 'system' ? 1 : b.id === 'system' ? -1 : b.size - a.size));
  const page: Record<string, string> = { apps: 'uninstaller', games: 'uninstaller', docs: 'clutter', media: 'clutter', downloads: 'visual', dev: 'cleanup', caches: 'cleanup', trash: 'cleanup', appdata: 'appdata', mail: 'visual', system: 'visual' };
  return (
    <>
      <Section title={tr("Mapa do armazenamento")} right={!map || !map.done ? tr("medindo pastas…") : tr("{0} de {1} em uso", fmtSize(disk.used, 'auto', 1), fmtSize(disk.total, 'auto', 0))} delay={60} />
      <Hero className="p-3">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-[var(--p-track)] p-[2px]" onMouseLeave={() => setHover(null)}>
          {list.map((x) => (
            <div key={x.id} onMouseEnter={() => setHover(x.id)} className={cx('h-full transition-[width,opacity] duration-700', !x.done && 'animate-pulse', hover && hover !== x.id && 'opacity-40')}
              style={{ width: `${Math.max(x.size > 0 ? 0.6 : 0, (x.size / disk.total) * 100)}%`, marginRight: 2, background: x.color, borderRadius: 999 }} />
          ))}
        </div>
        <div className="no-scrollbar mt-2.5 max-h-[230px] space-y-0.5 overflow-y-auto pr-0.5">
          {list.map((x) => (
            <button key={x.id} onMouseEnter={() => setHover(x.id)} onMouseLeave={() => setHover(null)} onClick={() => open(page[x.id] || 'visual')}
              className={cx('flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--p-card-hover)]', hover === x.id && 'bg-[var(--p-card-hover)]')}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: x.color }}>{x.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{tr(x.label)}</span><span className="shrink-0 text-[12px] font-semibold tabular-nums">{x.done ? fmtSize(x.size, 'auto', 1) : '…'}</span></div>
                <div className="flex items-center gap-2"><Bar value={(x.size / disk.total) * 100} tone={x.color} className="!h-1 flex-1" /><span className="w-9 shrink-0 text-right text-[10.5px] tabular-nums text-[var(--p-muted)]">{Math.round((x.size / disk.total) * 100)}%</span></div>
              </div>
            </button>
          ))}
        </div>
      </Hero>
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
  const fans = useFanState();
  const [fanSel, setFanSel] = useState<string | null>(null);
  // RPM de cada ventoinha nas últimas leituras, para o gráfico do detalhe
  const [fanHist, setFanHist] = useState<Record<string, number[]>>({});
  useEffect(() => { if (fans) setFanHist((h) => { const n: Record<string, number[]> = {}; for (const f of fans.controls) n[f.id] = [...(h[f.id] || []).slice(-59), f.rpm ?? 0]; return n; }); }, [fans]);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [shownKey, setShownKey] = useState(0);

  useEffect(() => { cc.settingsGet().then(setSettings); return cc.on.settingsChanged(setSettings); }, []);
  // tudo o que os detalhes e as ventoinhas mostram é carregado logo que o widget é montado
  // os detalhes são lidos uma vez, logo depois de o widget ser montado; ao abrir, cada detalhe mostra a última leitura e
  // se atualiza sozinho enquanto fica aberto. Abrir o widget não dispara mais nenhuma leitura pesada
  useEffect(() => { const t = setTimeout(preloadDetails, 1500); preloadGpuCatalog(); loadFanProfiles(); return () => clearTimeout(t); }, []);
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
  // cada ventoinha abre o próprio detalhe; clicar de novo na mesma fecha
  const openFan = (id: string) => { if (detail === 'fans' && fanSel === id && !closing) closeDetail(); else { setFanSel(id); openDetail('fans'); } };
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
    const offShown = cc.on.panelShown(() => { document.body.style.visibility = ''; clearTimeout(closeTimer.current); setClosing(false); setDetail(null); setShownKey((k) => k + 1); cc.settingsGet().then(setSettings); if (timer) clearTimeout(timer); gen++; tick(gen); });
    // antes de a janela sumir, o conteúdo some e um quadro vazio é desenhado (assim, a próxima abertura não pisca)
    const offHiding = cc.on.panelHiding(() => { document.body.style.visibility = 'hidden'; requestAnimationFrame(() => requestAnimationFrame(() => { cc.panelBlanked(); })); });
    const esc = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (detailRef.current) closeRef.current(); else cc.panelHide(); };
    window.addEventListener('keydown', esc);
    return () => { alive = false; if (timer) clearTimeout(timer); offShown(); window.removeEventListener('keydown', esc); offHiding(); };
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
  const more = <ChevronRight size={14} className="absolute right-2.5 top-3 text-[var(--p-muted)] opacity-60" />;
  const active = (k: Detail) => detail === k && !closing;
  const colH = `calc(100vh - ${PAD * 2}px)`;
  const mainRef = useRef<HTMLDivElement>(null);
  const [mainH, setMainH] = useState(0);
  useEffect(() => { const el = mainRef.current; if (!el) return; const ro = new ResizeObserver(() => setMainH(el.offsetHeight)); ro.observe(el); return () => ro.disconnect(); }, [shownKey]);

  return (
    // ancorado à direita (e embaixo no Windows); o detalhe sai de trás do painel principal para a esquerda
    <div style={{ padding: PAD, height: '100vh' }} className={cx('flex select-none justify-end overflow-hidden text-[var(--p-fg)]', isMac ? 'items-start' : 'items-end')}>
      <div key={shownKey} className={cx('anim-panel-in flex shrink-0', isMac ? 'items-start' : 'items-end')} style={{ gap: GAP }}>
        {detail ? (
          <div className={cx('panel-root no-scrollbar relative z-0 shrink-0 overflow-y-auto p-4', closing ? 'anim-detail-out' : 'anim-detail-in')} style={{ width: DETAIL_W, height: mainH || undefined, maxHeight: colH }}>
            <div key={detail === 'fans' ? `fans:${fanSel}` : detail} className="anim-fade-in">
              {detail === 'storage' && <StorageDetail open={open} />}
              {detail === 'memory' && <MemoryDetail />}
              {detail === 'battery' && <BatteryDetail />}
              {detail === 'cpu' && <CpuDetail hist={splitHist} open={open} />}
              {detail === 'gpu' && <GpuDetail hist={gpuHist} open={open} fans={fans} />}
              {detail === 'power' && <PowerDetail hist={powerHist} />}
              {detail === 'network' && <NetworkDetail s={s} hist={netHist} />}
              {detail === 'devices' && <DevicesDetail />}
              {detail === 'fans' && <FanDetail fans={fans} id={fanSel} cfg={settings?.fans} hist={(fanSel && fanHist[fanSel]) || []} open={open} />}
            </div>
          </div>
        ) : <div className="shrink-0" style={{ width: DETAIL_W }} />}

        {/* coluna principal */}
        <div ref={mainRef} className="panel-root no-scrollbar relative z-10 shrink-0 overflow-y-auto p-4" style={{ width: MAIN_W, maxHeight: colH, ['--d0' as string]: '260ms' }}>
          <div className="anim-rise flex items-center gap-3 px-1 pb-3">
            <div className="min-w-0 flex-1">
              <div className="text-[18px] font-semibold tracking-tight">{tr("Saúde do")} {device}: <span style={{ color: levelColor }}>{s ? levelText : '…'}</span></div>
              <div className="truncate text-[13px] text-[var(--p-muted)]">{s?.machine || ' '}{s && s.health.issues.length ? ` · ${s.health.issues.join(', ')}` : ''}</div>
            </div>
            <HealthRing level={level} />
          </div>

          <Card delay={40} className="mb-2" onClick={() => open('protection')}>
            <div className="flex items-center gap-3">
              {settings?.notifyEnabled ? <ShieldCheck size={22} className="text-[var(--p-accent)]" /> : <BellOff size={22} className="text-[var(--p-muted)]" />}
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{tr("Monitoramento")} {settings?.notifyEnabled ? 'ativo' : 'pausado'}</div>
                <Slide className="text-xs leading-snug text-[var(--p-muted)]">{settings?.notifyEnabled ? tr("O CleanCode avisa quando um disco cresce mais de {0}{1}.", fmtSize((settings?.notifyThresholdMB || 1024) * 1048576, 'auto', 0), settings?.notifyApps ? ' ou quando você instala um app' : '') : tr("Para receber avisos, ative as notificações nas Configurações.")}</Slide>
              </div>
              <ChevronRight size={15} className="text-[var(--p-muted)] opacity-60" />
            </div>
          </Card>

          <div className="grid grid-cols-3 gap-1.5">
            <Mini delay={80} onClick={() => toggle('storage')} active={active('storage')} icon={<HardDrive size={14} />} title={s?.disk?.label || tr("Disco")}
              value={<>{tr("Livres:")} {s?.disk ? fmtSize(freeT, 'auto', 1) : '…'}</>} action={<Action onClick={() => open('cleanup')}>{tr("Liberar")}</Action>}>
              {s?.disk && <Bar value={(1 - s.disk.free / s.disk.total) * 100} tone={s.disk.free / s.disk.total < 0.1 ? 'var(--p-danger)' : undefined} />}
            </Mini>
            <Mini delay={110} onClick={() => toggle('memory')} active={active('memory')} icon={<MemoryStick size={14} />} title={tr("Memória")}
              value={<>{tr("Pressão:")} {s ? `${Math.round(pressT)}%` : '…'}</>} aside={s ? tr("{0} de {1}", fmtSize(s.memory.used, 'auto', 1), fmtSize(s.memory.total, 'auto', 0)) : undefined} action={<QuickFreeMemory />}>
              {s && <Bar value={s.memory.pressure} tone={s.memory.level === 'critical' ? 'var(--p-danger)' : s.memory.level === 'warn' ? 'var(--p-warn)' : undefined} />}
            </Mini>
            <Mini delay={140} onClick={b ? () => toggle('battery') : undefined} active={active('battery')} icon={<BattIcon size={14} className={b?.charging ? 'text-[var(--p-accent)]' : undefined} />} title={b ? tr("Bateria") : tr("Energia")}
              value={b ? `${Math.round(battT)}%` : undefined} sub={battText} temp={s?.temperatures.battery}>
              {b && <Bar value={b.percent} tone={b.percent <= 15 && !b.plugged ? 'var(--p-danger)' : undefined} />}
            </Mini>
            <Mini delay={170} onClick={() => toggle('cpu')} active={active('cpu')} icon={<Cpu size={14} />} title={tr("CPU")}
              value={<>{tr("Carga:")} {s ? `${Math.round(loadT)}%` : '…'}</>} temp={s?.cpu.temperature}>
              <Spark data={cpuHist} w={160} h={16} />
            </Mini>
            <Mini delay={200} onClick={() => toggle('gpu')} active={active('gpu')} icon={<Gpu size={14} />} title={tr("GPU")}
              value={<>{tr("Uso:")} {s?.gpu?.util !== undefined ? `${Math.round(gpuT)}%` : '—'}</>} temp={s?.gpu?.temp}>
              <Spark data={gpuHist} w={160} h={16} />
            </Mini>
            <Mini delay={230} onClick={powerNow !== undefined || b ? () => toggle('power') : undefined} active={active('power')} icon={<Zap size={14} />} title={tr("Energia")}
              value={powerNow !== undefined ? <>{powerNow.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} W {tr("agora")}</> : tr("Sem leitura")}>
              <Spark data={powerHist} w={160} h={16} max={1} />
            </Mini>
            <Mini delay={260} onClick={() => toggle('network')} active={active('network')} icon={<NetIcon size={14} />} title={s?.network?.kind || tr("Rede")}
              aside={<span className="inline-flex items-center gap-0.5 [&_button]:text-[11.5px]"><Action onClick={() => openDetail('network')}><span className="inline-flex items-center gap-1"><Gauge size={12} />{tr("Testar velocidade")}</span></Action></span>}
              value={<span className="inline-flex items-center gap-2"><span className="inline-flex items-center gap-0.5"><ArrowDown size={12} className="text-[var(--p-muted)]" />{s?.network ? rate(s.network.rxRate) : '—'}</span><span className="inline-flex items-center gap-0.5"><ArrowUp size={12} className="text-[var(--p-muted)]" />{s?.network ? rate(s.network.txRate) : '—'}</span></span>} />
            <Mini delay={290} onClick={() => toggle('devices')} active={active('devices')} icon={<Bluetooth size={14} />} title={tr("Dispositivos conectados")}
              sub={!s ? '…' : s.devices.length === 0 ? tr("Nenhum dispositivo Bluetooth") : s.devices.map((d) => (d.battery !== undefined ? `${d.name} (${d.battery}%)` : d.name)).join(', ')} />
          </div>

          {fans && fans.controls.length > 0 && <FansCard fans={fans} cfg={settings?.fans} delay={300} onOpen={openFan} activeId={active('fans') ? fanSel : null} />}

          <div className="anim-rise px-1 pb-1.5 pt-3 text-[14px] font-semibold text-[var(--p-muted)]" style={{ animationDelay: 'calc(var(--d0, 0ms) + 320ms)' }}>{tr("Recomendação de hoje")}</div>
          <Card delay={340}>
            <div className="flex gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, var(--p-accent), color-mix(in srgb, var(--p-accent) 45%, #ffffff))' }}><Sparkles size={18} className="text-[var(--on-accent)]" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{tip.title}</div>
                <Slide className="mt-0.5 text-xs leading-snug text-[var(--p-muted)]">{tip.text}</Slide>
              </div>
              <div className="shrink-0 self-center"><button onClick={() => open(tip.page)} className="rounded-lg border border-[var(--p-line)] bg-[var(--p-track)] px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--p-card-hover)]">{tip.action}</button></div>
            </div>
          </Card>

          <div className="anim-rise mt-3 flex items-center gap-2 border-t border-[var(--p-line)] px-1 pt-3" style={{ animationDelay: 'calc(var(--d0, 0ms) + 380ms)' }}>
            <button title={tr("Abrir o CleanCode")} onClick={() => open()} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--p-line)] bg-[var(--p-track)] hover:bg-[var(--p-card-hover)]"><AppWindow size={16} /></button>
            <button onClick={() => open()} className="flex-1 text-center text-[14px] font-medium hover:text-[var(--p-accent)]">{tr("Abrir CleanCode")}</button>
            <button title={tr("Configurações")} onClick={() => open('settings')} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--p-line)] bg-[var(--p-track)] hover:bg-[var(--p-card-hover)]"><Settings size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
