// Monitor de hardware: ficha técnica e leituras ao vivo de processador, placa de vídeo, memória,
// placa-mãe, energia e sensores, com cenas 3D (CSS 3D + SVG) que reagem aos dados reais:
// núcleos acendem com a carga, ventoinhas giram com o uso da GPU, pentes de RAM enchem,
// a energia corre do carregador para a placa e as trilhas aceleram com a atividade.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Cpu, Gpu, MemoryStick, CircuitBoard, Zap, Thermometer, LayoutGrid, Fan, HardDrive, Monitor } from 'lucide-react';
import { cc, isMac, HardwareInfo, HardwareLive } from '../lib/api';
import { fmtSize } from '../lib/format';
import { cx } from '../components/ui';
import { PageBody } from './common';

type Tab = 'overview' | 'cpu' | 'gpu' | 'ram' | 'board' | 'power' | 'sensors';
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Visão geral', icon: <LayoutGrid size={15} /> },
  { id: 'cpu', label: 'Processador', icon: <Cpu size={15} /> },
  { id: 'gpu', label: 'Placa de vídeo', icon: <Gpu size={15} /> },
  { id: 'ram', label: 'Memória RAM', icon: <MemoryStick size={15} /> },
  { id: 'board', label: isMac ? 'Placa lógica' : 'Placa-mãe', icon: <CircuitBoard size={15} /> },
  { id: 'power', label: 'Energia', icon: <Zap size={15} /> },
  { id: 'sensors', label: 'Sensores', icon: <Thermometer size={15} /> },
];
const C = { cpu: 'oklch(from var(--accent) .74 .17 calc(h + 220))', gpu: 'oklch(from var(--accent) .72 .19 calc(h + 300))', ram: 'oklch(from var(--accent) .8 .15 calc(h + 150))', pwr: 'oklch(from var(--accent) .82 .16 calc(h + 70))', acc: 'var(--accent)' };
const n1 = (v?: number, d = 1) => (v === undefined || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: d }));
const ghz = (mhz?: number) => (mhz ? `${(mhz / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GHz` : '—');

// ---------- 3D ----------
/** Cena com perspectiva; o plano inclina seguindo o mouse. */
function Scene({ children, height = 420, rx = 56, rz = -36, scale = 1 }: { children: React.ReactNode; height?: number; rx?: number; rz?: number; scale?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ x: 0, y: 0 });
  return (
    <div ref={ref} className="hw-scene relative overflow-hidden rounded-2xl border border-[var(--line)]" style={{ height, background: 'radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%), var(--surface)' }}
      onMouseMove={(e) => { const r = ref.current!.getBoundingClientRect(); setT({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 }); }}
      onMouseLeave={() => setT({ x: 0, y: 0 })}>
      <div className="hw-grid absolute inset-0 opacity-40" />
      <div className="absolute left-1/2 top-1/2" style={{ transformStyle: 'preserve-3d', transform: `translate(-50%,-50%) scale(${scale}) rotateX(${rx - t.y * 10}deg) rotateZ(${rz + t.x * 12}deg)`, transition: 'transform .25s ease-out' }}>
        {children}
      </div>
    </div>
  );
}
/** Caixa 3D sobre o plano (topo + frente + lateral). */
function Box({ x, y, w, h, d, color, top, children, onClick, title, glow, className }: { x: number; y: number; w: number; h: number; d: number; color: string; top?: string; children?: React.ReactNode; onClick?: () => void; title?: string; glow?: number; className?: string }) {
  const side = `color-mix(in srgb, ${color} 55%, #000)`, front = `color-mix(in srgb, ${color} 70%, #000)`;
  return (
    <div onClick={onClick} title={title} className={cx('hw-box absolute', onClick && 'cursor-pointer', className)} style={{ left: x, top: y, width: w, height: h }}>
      {glow ? <div className="absolute -inset-3 rounded-xl blur-xl" style={{ background: color, opacity: 0.25 + glow * 0.55 }} /> : null}
      <div className="absolute inset-x-0 overflow-hidden" style={{ top: h, height: d, background: front, transformOrigin: 'top', transform: 'rotateX(90deg)' }} />
      <div className="absolute inset-y-0" style={{ left: w, width: d, background: side, transformOrigin: 'left', transform: 'rotateY(-90deg)' }} />
      <div className="absolute inset-0 overflow-hidden rounded-[3px]" style={{ transform: `translateZ(${d}px)`, background: top || color, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 60%, #fff3)` }}>{children}</div>
    </div>
  );
}
function Fan3D({ size, speed, color }: { size: number; speed: number; color: string }) {
  return (
    <div className="relative rounded-full" style={{ width: size, height: size, background: '#0b0c10', boxShadow: `inset 0 0 0 3px color-mix(in srgb, ${color} 50%, #222)` }}>
      <div className="hw-spin absolute inset-[6%] rounded-full" style={{ animationDuration: `${speed}s`, background: `conic-gradient(from 0deg, ${color} 0 9%, transparent 9% 14%, ${color} 14% 23%, transparent 23% 28%, ${color} 28% 37%, transparent 37% 42%, ${color} 42% 51%, transparent 51% 56%, ${color} 56% 65%, transparent 65% 70%, ${color} 70% 79%, transparent 79% 84%, ${color} 84% 93%, transparent 93% 100%)`, opacity: 0.85, maskImage: 'radial-gradient(circle, transparent 18%, #000 20%)' }} />
      <div className="absolute inset-[38%] rounded-full" style={{ background: `radial-gradient(circle, color-mix(in srgb, ${color} 70%, #fff), #111)` }} />
    </div>
  );
}
/** Trilhas animadas com pacotes de dados correndo (velocidade conforme a atividade). */
function Traces({ paths, color, activity, w, h }: { paths: string[]; color: string; activity: number; w: number; h: number }) {
  const dur = Math.max(0.6, 3.2 - activity * 2.6);
  return (
    <svg width={w} height={h} className="absolute left-0 top-0" style={{ overflow: 'visible' }}>
      {paths.map((p, i) => (
        <g key={i}>
          <path d={p} fill="none" stroke={color} strokeOpacity=".22" strokeWidth="2" />
          <path d={p} fill="none" stroke={color} strokeWidth="2" className="hw-trace" style={{ animationDuration: `${dur * 1.4}s` }} />
          <circle r="3" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }}><animateMotion dur={`${dur + (i % 3) * 0.4}s`} repeatCount="indefinite" path={p} /></circle>
        </g>
      ))}
    </svg>
  );
}

// ---------- gráficos ----------
function Spark({ data, color, h = 54, max }: { data: number[]; color: string; h?: number; max?: number }) {
  const w = 300, top = max ?? Math.max(1, ...data) * 1.15;
  if (data.length < 2) return <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }} />;
  const pts = data.slice(-60).map((v, i, a) => `${(i / (a.length - 1)) * w},${h - (Math.min(v, top) / top) * (h - 4) - 2}`);
  const id = `g${color.length}${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }}>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`M${pts.join(' L')} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={`M${pts.join(' L')}`} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
function Gauge({ value, max = 100, label, unit, color, warn = 75, danger = 90 }: { value?: number; max?: number; label: string; unit: string; color: string; warn?: number; danger?: number }) {
  const r = 46, c = 2 * Math.PI * r * 0.75, v = Math.max(0, Math.min(1, (value ?? 0) / max));
  const tone = value === undefined ? 'var(--line)' : value >= danger ? 'var(--danger)' : value >= warn ? 'var(--warn)' : color;
  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="104" viewBox="0 0 120 104">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" strokeDasharray={`${c} 400`} transform="rotate(135 60 60)" strokeLinecap="round" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={tone} strokeWidth="10" strokeDasharray={`${c * v} 400`} transform="rotate(135 60 60)" strokeLinecap="round" style={{ transition: 'stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${tone})` }} />
        <text x="60" y="62" textAnchor="middle" className="fill-current text-[22px] font-semibold">{value === undefined ? '—' : Math.round(value)}</text>
        <text x="60" y="80" textAnchor="middle" className="fill-[var(--muted)] text-[11px]">{unit}</text>
      </svg>
      <div className="-mt-2 text-[12px] font-medium text-muted">{label}</div>
    </div>
  );
}
function Spec({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--surface)]">
      {rows.filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== '—').map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[13px]"><span className="text-muted">{k}</span><span className="text-right font-medium tabular-nums">{v}</span></div>)}
    </div>
  );
}
function Metric({ label, value, color, children }: { label: string; value: React.ReactNode; color: string; children?: React.ReactNode }) {
  return (
    <div className="anim-rise rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2 text-[12px] text-muted"><span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />{label}</div>
      <div className="mt-1 text-[26px] font-semibold tabular-nums tracking-tight">{value}</div>
      {children}
    </div>
  );
}

// ---------- página ----------
export default function Hardware() {
  const [tab, setTab] = useState<Tab>('overview');
  const [info, setInfo] = useState<HardwareInfo | null>(null);
  const [live, setLive] = useState<HardwareLive | null>(null);
  const [hist, setHist] = useState<{ cpu: number[]; gpu: number[]; pwr: number[]; mem: number[]; temp: number[] }>({ cpu: [], gpu: [], pwr: [], mem: [], temp: [] });
  useEffect(() => { cc.hardwareInfo().then(setInfo).catch(() => null); }, []);
  useEffect(() => {
    let alive = true, t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const l = await cc.hardwareLive();
        if (!alive) return;
        setLive(l);
        const pw = l.live?.power.systemW ?? (l.live?.power.batteryW !== undefined ? Math.abs(l.live.power.batteryW) : undefined);
        setHist((h) => ({ cpu: [...h.cpu.slice(-59), l.load], gpu: l.live?.gpu.util !== undefined ? [...h.gpu.slice(-59), l.live.gpu.util] : h.gpu, pwr: pw !== undefined ? [...h.pwr.slice(-59), pw] : h.pwr, mem: [...h.mem.slice(-59), l.memory.pressure], temp: l.temps.cpu !== undefined ? [...h.temp.slice(-59), l.temps.cpu] : h.temp }));
      } catch { /* */ }
      if (alive) t = setTimeout(tick, 1500);
    };
    tick();
    return () => { alive = false; clearTimeout(t); };
  }, []);

  const L = live?.live;
  const watts = L?.power.systemW ?? (L?.power.batteryW !== undefined ? Math.abs(L.power.batteryW) : undefined);
  return (
    <PageBody>
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><CircuitBoard size={22} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">Monitor de hardware</h1>
          <p className="truncate text-[13px] text-muted">{info ? [info.board.system || info.board.model, info.cpu.name, fmtSize(info.memory.total, 'auto', 0) + ' de RAM'].filter(Boolean).join(' · ') : 'Lendo o hardware…'}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors', tab === t.id ? 'bg-[var(--accent)] text-white' : 'text-muted hover:bg-[var(--hover)] hover:text-[var(--fg)]')}>{t.icon}{t.label}</button>)}
      </div>
      <div key={tab} className="anim-fade-in mt-4">
        {tab === 'overview' && <Overview info={info} live={live} watts={watts} go={setTab} hist={hist} />}
        {tab === 'cpu' && <CpuTab info={info} live={live} hist={hist} />}
        {tab === 'gpu' && <GpuTab info={info} live={live} hist={hist} />}
        {tab === 'ram' && <RamTab info={info} live={live} hist={hist} />}
        {tab === 'board' && <BoardTab info={info} live={live} />}
        {tab === 'power' && <PowerTab live={live} watts={watts} hist={hist} />}
        {tab === 'sensors' && <SensorsTab live={live} hist={hist} />}
      </div>
    </PageBody>
  );
}

type P = { info: HardwareInfo | null; live: HardwareLive | null; hist: { cpu: number[]; gpu: number[]; pwr: number[]; mem: number[]; temp: number[] } };

function Overview({ info, live, watts, go, hist }: P & { watts?: number; go: (t: Tab) => void }) {
  const load = (live?.load ?? 0) / 100, gpu = (live?.live?.gpu.util ?? 0) / 100, mem = (live?.memory.pressure ?? 0) / 100;
  const sticks = Math.min(4, Math.max(2, info?.memory.modules.length || 2));
  const W = 560, H = 380;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <Scene height={470}>
        <div className="relative rounded-xl" style={{ width: W, height: H, transformStyle: 'preserve-3d', background: 'linear-gradient(135deg, #0d1a17, #0a0f14)', boxShadow: `0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent), 0 40px 80px -20px #000` }}>
          <div className="hw-pcb absolute inset-0 rounded-xl opacity-60" />
          <Traces w={W} h={H} activity={Math.max(load, gpu)} color={C.acc} paths={[
            'M200,150 L120,150 L120,60 L60,60', 'M300,150 L380,150 L380,70 L470,70', 'M250,230 L250,280 L180,280', 'M300,200 L420,200 L420,140', 'M200,200 L90,200 L90,300', 'M260,120 L260,40 L330,40',
          ]} />
          <Box x={190} y={110} w={130} h={120} d={14} color="#2a2f3a" title="Processador" onClick={() => go('cpu')} glow={load}>
            <div className="absolute inset-3 rounded-md" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${C.cpu} 55%, #ccc), #6b7280)` }}>
              <div className="flex h-full flex-col items-center justify-center text-center text-[10px] font-bold text-black/70"><Cpu size={20} />{(info?.cpu.name || 'CPU').replace(/\(R\)|\(TM\)|CPU|@.*$/gi, '').trim().slice(0, 18)}</div>
            </div>
          </Box>
          {Array.from({ length: sticks }, (_, i) => (
            <Box key={i} x={370 + i * 26} y={95} w={14} h={150} d={30} color="#1f2937" title="Memória RAM" onClick={() => go('ram')} glow={mem * 0.6}>
              <div className="absolute inset-x-0 bottom-0 transition-[height] duration-700" style={{ height: `${Math.max(8, mem * 100)}%`, background: `linear-gradient(to top, ${C.ram}, transparent)` }} />
            </Box>
          ))}
          <Box x={80} y={262} w={300} h={70} d={26} color="#161a22" title="Placa de vídeo" onClick={() => go('gpu')} glow={gpu}>
            <div className="flex h-full items-center justify-around px-4"><Fan3D size={52} speed={Math.max(0.25, 2.4 - gpu * 2.1)} color={C.gpu} /><Fan3D size={52} speed={Math.max(0.25, 2.4 - gpu * 2.1)} color={C.gpu} /><span className="text-[10px] font-bold tracking-widest" style={{ color: C.gpu }}>GPU</span></div>
          </Box>
          <Box x={40} y={40} w={70} h={46} d={18} color="#3b2f12" title="Energia" onClick={() => go('power')} glow={Math.min(1, (watts || 0) / 60)}>
            <div className="flex h-full items-center justify-center gap-1" style={{ color: C.pwr }}><Zap size={18} className="hw-glow" /><span className="text-[11px] font-bold">{watts !== undefined ? `${Math.round(watts)} W` : 'PWR'}</span></div>
          </Box>
          <Box x={410} y={290} w={110} h={34} d={6} color="#20262f" title="Armazenamento">
            <div className="flex h-full items-center justify-center gap-1 text-[10px] font-bold text-white/60"><HardDrive size={13} />SSD</div>
          </Box>
          <Box x={300} y={24} w={60} h={40} d={10} color="#1d2430" title={isMac ? 'Placa lógica' : 'Chipset'} onClick={() => go('board')}>
            <div className="flex h-full items-center justify-center text-[9px] font-bold text-white/50">{isMac ? 'SoC' : 'CHIPSET'}</div>
          </Box>
        </div>
      </Scene>
      <div className="space-y-3">
        <Metric label="Processador" value={`${live?.load ?? '—'} %`} color={C.cpu}><Spark data={hist.cpu} color={C.cpu} max={100} h={36} /></Metric>
        <Metric label="Placa de vídeo" value={live?.live?.gpu.util !== undefined ? `${live.live.gpu.util} %` : '—'} color={C.gpu}><Spark data={hist.gpu} color={C.gpu} max={100} h={36} /></Metric>
        <Metric label="Memória" value={`${live?.memory.pressure ?? '—'} %`} color={C.ram}><Spark data={hist.mem} color={C.ram} max={100} h={36} /></Metric>
        <Metric label="Energia" value={watts !== undefined ? `${n1(watts)} W` : '—'} color={C.pwr}><Spark data={hist.pwr} color={C.pwr} h={36} /></Metric>
      </div>
    </div>
  );
}

function CpuTab({ info, live, hist }: P) {
  const cores = live?.cores || [];
  const p = info?.cpu.pCores || 0;
  const cols = Math.ceil(Math.sqrt(cores.length || 8));
  const S = 300, cell = (S - 40) / cols;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div>
        <Scene height={400} rx={52} rz={-30}>
          <div className="relative" style={{ width: S + 80, height: S + 80, transformStyle: 'preserve-3d' }}>
            <Box x={0} y={0} w={S + 80} h={S + 80} d={8} color="#0f1a17" top="linear-gradient(135deg,#10201c,#0b1210)">
              <div className="hw-pcb absolute inset-0 opacity-70" />
              {Array.from({ length: 22 }, (_, i) => <div key={i} className="absolute h-[3px] w-6 rounded bg-yellow-600/60" style={{ left: -2, top: 30 + i * 14 }} />)}
            </Box>
            <Box x={40} y={40} w={S} h={S} d={22} color="#3a3f4a" top="linear-gradient(135deg,#6b7280,#3f444f)" glow={(live?.load ?? 0) / 100}>
              <div className="absolute grid gap-1.5" style={{ left: 20, top: 20, gridTemplateColumns: `repeat(${cols}, ${cell - 6}px)` }}>
                {(cores.length ? cores : Array(8).fill(0)).map((v, i) => {
                  const col = p && i >= p ? C.ram : C.cpu;
                  return <div key={i} className="relative rounded-[4px] transition-all duration-500" style={{ height: cell - 6, background: `color-mix(in srgb, ${col} ${15 + v * 0.85}%, #1a1d24)`, boxShadow: v > 30 ? `0 0 ${v / 4}px ${col}` : 'none' }}><span className="absolute bottom-0.5 right-1 text-[9px] font-bold text-white/70">{v}%</span></div>;
                })}
              </div>
            </Box>
          </div>
        </Scene>
        <div className="mt-2 flex justify-center gap-4 text-[12px] text-muted">{p ? <><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: C.cpu }} />Desempenho ({p})</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: C.ram }} />Eficiência ({info?.cpu.eCores})</span></> : <span>Cada célula é um núcleo lógico</span>}</div>
      </div>
      <div className="space-y-3">
        <Metric label="Carga total" value={`${live?.load ?? '—'} %`} color={C.cpu}><Spark data={hist.cpu} color={C.cpu} max={100} /></Metric>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Usuário" value={`${live?.split.user ?? '—'} %`} color={C.cpu} />
          <Metric label="Sistema" value={`${live?.split.system ?? '—'} %`} color={C.gpu} />
        </div>
        <Spec rows={[
          ['Modelo', info?.cpu.name], ['Arquitetura', info?.cpu.arch], ['Núcleos / threads', info ? `${info.cpu.cores} / ${info.cpu.threads}` : undefined],
          ['Núcleos de desempenho', info?.cpu.pCores], ['Núcleos de eficiência', info?.cpu.eCores],
          ['Frequência atual', live?.live?.cpuMHz ? ghz(live.live.cpuMHz) : undefined], ['Frequência máxima', info?.cpu.maxMHz ? ghz(info.cpu.maxMHz) : isMac ? 'definida pelo macOS' : undefined],
          ['Cache L2', info?.cpu.l2 ? fmtSize(info.cpu.l2, 'auto', 0) : undefined], ['Cache L3', info?.cpu.l3 ? fmtSize(info.cpu.l3, 'auto', 0) : undefined],
          ['Temperatura', live?.temps.cpu !== undefined ? `${Math.round(live.temps.cpu)} °C` : undefined],
        ]} />
      </div>
    </div>
  );
}

function GpuTab({ info, live, hist }: P) {
  const g = info?.gpus[0], L = live?.live?.gpu;
  const u = (L?.util ?? 0) / 100, speed = Math.max(0.2, 2.6 - u * 2.3);
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Scene height={400} rx={58} rz={-24}>
        <div className="relative" style={{ width: 520, height: 200, transformStyle: 'preserve-3d' }}>
          <Box x={0} y={0} w={520} h={200} d={6} color="#0e3b2e" top="linear-gradient(135deg,#0f3d30,#0a261f)"><div className="hw-pcb absolute inset-0 opacity-70" /></Box>
          <div className="absolute" style={{ left: 30, top: 200, width: 300, height: 14, transform: 'translateZ(3px)', background: 'repeating-linear-gradient(90deg,#c9a227 0 6px,transparent 6px 9px)' }} />
          <Box x={14} y={14} w={492} h={172} d={34} color="#1b1f27" top="linear-gradient(160deg,#2a2f3a,#14171d)" glow={u}>
            <div className="flex h-full items-center justify-around px-6">
              <Fan3D size={120} speed={speed} color={C.gpu} />
              <Fan3D size={120} speed={speed} color={C.gpu} />
              <Fan3D size={120} speed={speed} color={C.gpu} />
            </div>
            <div className="absolute inset-x-6 bottom-2 h-1 rounded-full transition-all duration-700" style={{ background: C.gpu, opacity: 0.3 + u * 0.7, boxShadow: `0 0 ${8 + u * 20}px ${C.gpu}` }} />
          </Box>
        </div>
      </Scene>
      <div className="space-y-3">
        <Metric label="Uso da GPU" value={L?.util !== undefined ? `${L.util} %` : '—'} color={C.gpu}><Spark data={hist.gpu} color={C.gpu} max={100} /></Metric>
        <Spec rows={[
          ['Modelo', g?.name], ['Fabricante', g?.vendor], ['Núcleos', g?.cores], [isMac ? 'Gráficos' : 'API', g?.api], ['Driver', g?.driver],
          ['Memória de vídeo', g?.vram ? fmtSize(g.vram, 'auto', 0) : isMac ? 'unificada com a RAM' : undefined],
          ['Memória em uso', L?.memUsed ? fmtSize(L.memUsed, 'auto', 1) : undefined], ['Temperatura', L?.temp !== undefined ? `${Math.round(L.temp)} °C` : undefined],
          ...((info?.displays || []).map((d, i) => [`Tela ${i + 1}`, `${d.name}${d.resolution ? ` · ${d.resolution}` : ''}`] as [string, string])),
        ]} />
        {L?.procs?.length ? <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"><div className="mb-2 text-[13px] font-semibold">Mais usam a GPU</div>{L.procs.map((p) => <div key={p.pid} className="flex justify-between py-0.5 text-[13px]"><span className="truncate">{p.name}</span><span className="tabular-nums text-muted">{n1(p.util)} %</span></div>)}</div> : null}
      </div>
    </div>
  );
}

function RamTab({ info, live, hist }: P) {
  const mods = info?.memory.modules.length ? info.memory.modules : [{ size: info?.memory.total || 0 } as any];
  const used = live?.memory.used ?? 0, total = live?.memory.total || info?.memory.total || 1;
  const fill = used / total;
  const d = live?.memoryDetail;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Scene height={400} rx={60} rz={-32}>
        <div className="relative" style={{ width: 120 + mods.length * 90, height: 300, transformStyle: 'preserve-3d' }}>
          <Box x={0} y={0} w={120 + mods.length * 90} h={300} d={6} color="#0f1a17" top="linear-gradient(135deg,#10201c,#0b1210)"><div className="hw-pcb absolute inset-0 opacity-60" /></Box>
          {mods.map((m, i) => (
            <Box key={i} x={60 + i * 90} y={30} w={28} h={240} d={70} color="#1f2a37" top="linear-gradient(180deg,#263241,#151c26)" glow={fill * 0.7}>
              {Array.from({ length: 6 }, (_, k) => <div key={k} className="absolute inset-x-1 h-7 rounded-sm bg-black/60" style={{ top: 12 + k * 37 }} />)}
              <div className="absolute inset-x-0 bottom-0 transition-[height] duration-700" style={{ height: `${fill * 100}%`, background: `linear-gradient(to top, color-mix(in srgb, ${C.ram} 70%, transparent), transparent)` }} />
              <div className="hw-scan absolute inset-x-0 h-6" style={{ background: `linear-gradient(to bottom, transparent, ${C.ram}, transparent)`, opacity: 0.5 }} />
            </Box>
          ))}
        </div>
      </Scene>
      <div className="space-y-3">
        <Metric label="Em uso" value={`${fmtSize(used, 'auto', 1)} de ${fmtSize(total, 'auto', 0)}`} color={C.ram}><Spark data={hist.mem} color={C.ram} max={100} /></Metric>
        <Spec rows={[
          ['Tipo', info?.memory.type], ['Velocidade', info?.memory.speed ? `${info.memory.speed} MT/s` : undefined], ['Fabricante', info?.memory.manufacturer],
          ['Pentes', info ? (isMac ? 'memória unificada no chip' : `${info.memory.modules.length}${info.memory.slots ? ` de ${info.memory.slots} slots` : ''}`) : undefined],
          ['Pressão', live ? `${live.memory.pressure} %` : undefined], ['Apps (ativa)', d ? fmtSize(d.active, 'auto', 1) : undefined], ['Fixa', d ? fmtSize(d.wired, 'auto', 1) : undefined],
          ['Comprimida', d?.compressed ? fmtSize(d.compressed, 'auto', 1) : undefined], ['Swap', d?.swapTotal ? `${fmtSize(d.swapUsed, 'auto', 1)} de ${fmtSize(d.swapTotal, 'auto', 1)}` : undefined],
          ...(!isMac ? mods.map((m: any, i: number) => [`Slot ${m.slot || i + 1}`, `${fmtSize(m.size, 'auto', 0)}${m.speed ? ` · ${m.speed} MT/s` : ''}${m.part ? ` · ${m.part}` : ''}`] as [string, string]) : []),
        ]} />
      </div>
    </div>
  );
}

function BoardTab({ info, live }: Omit<P, 'hist'>) {
  const b = info?.board;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Scene height={400} rx={56} rz={-40}>
        <div className="relative" style={{ width: 460, height: 320, transformStyle: 'preserve-3d' }}>
          <Box x={0} y={0} w={460} h={320} d={8} color="#0d1a17" top="linear-gradient(135deg,#0f231e,#0a1210)"><div className="hw-pcb absolute inset-0 opacity-80" /></Box>
          <Traces w={460} h={320} activity={(live?.load ?? 20) / 100} color={C.acc} paths={['M230,160 L80,160 L80,60', 'M230,160 L380,160 L380,260', 'M230,160 L230,280 L120,280', 'M230,160 L230,50 L360,50']} />
          <Box x={175} y={110} w={110} h={100} d={16} color="#2b313c" top="linear-gradient(135deg,#9aa1ad,#4b5260)" glow={0.5}><div className="flex h-full items-center justify-center text-[11px] font-bold text-black/70">{b?.chip || (isMac ? 'SoC' : 'CPU')}</div></Box>
          <Box x={50} y={40} w={60} h={40} d={10} color="#1d2430"><div className="flex h-full items-center justify-center text-[9px] font-bold text-white/60">{isMac ? 'SEP' : 'BIOS'}</div></Box>
          <Box x={340} y={240} w={80} h={36} d={8} color="#20262f"><div className="flex h-full items-center justify-center text-[9px] font-bold text-white/60">NVMe</div></Box>
          <Box x={330} y={30} w={70} h={40} d={10} color="#1d2430"><div className="flex h-full items-center justify-center text-[9px] font-bold text-white/60">{isMac ? 'PMU' : 'CHIPSET'}</div></Box>
          <Box x={90} y={262} w={60} h={34} d={12} color="#3b2f12"><div className="flex h-full items-center justify-center" style={{ color: C.pwr }}><Zap size={14} className="hw-glow" /></div></Box>
        </div>
      </Scene>
      <Spec rows={[
        ['Computador', b?.system], ['Fabricante', b?.manufacturer], [isMac ? 'Identificador do modelo' : 'Modelo da placa', b?.model], [isMac ? 'Número do modelo' : 'Revisão', b?.version],
        [isMac ? 'Chip' : 'Processador', b?.chip || info?.cpu.name], [isMac ? 'Firmware (iBoot)' : 'BIOS', b?.firmware], ['Data do firmware', b?.firmwareDate],
        ['Memória', info ? `${fmtSize(info.memory.total, 'auto', 0)}${info.memory.type ? ` ${info.memory.type}` : ''}` : undefined],
        ['Placa de vídeo', info?.gpus.map((g) => g.name).join(', ')], ['Telas', info?.displays.length ? String(info.displays.length) : undefined],
        ['Ligado há', live ? `${Math.floor(live.uptime / 86400)} d ${Math.floor((live.uptime % 86400) / 3600)} h` : undefined],
      ]} />
    </div>
  );
}

function PowerTab({ live, watts, hist }: Omit<P, 'info'> & { watts?: number }) {
  const p = live?.live?.power, b = live?.battery, h = live?.batteryHealth;
  const flow = Math.min(1, (watts || 5) / 50);
  const W = 520, H = 260;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Scene height={400} rx={54} rz={-28}>
        <div className="relative" style={{ width: W, height: H, transformStyle: 'preserve-3d' }}>
          <Box x={0} y={0} w={W} h={H} d={4} color="#0b1110" top="linear-gradient(135deg,#0e1714,#090d0c)"><div className="hw-grid absolute inset-0 opacity-50" /></Box>
          <Traces w={W} h={H} activity={flow} color={C.pwr} paths={['M90,130 L230,130', 'M290,130 L430,130', 'M260,160 L260,215 L430,215']} />
          <Box x={30} y={95} w={60} h={70} d={34} color="#2d2a20" title="Carregador" glow={b?.plugged ? 0.8 : 0}><div className="flex h-full flex-col items-center justify-center text-[10px] font-bold" style={{ color: C.pwr }}><Zap size={18} />{p?.adapterW ? `${p.adapterW} W` : b?.plugged ? 'AC' : '—'}</div></Box>
          <Box x={225} y={95} w={70} h={70} d={18} color="#2b313c" title="Sistema" glow={flow}><div className="flex h-full flex-col items-center justify-center text-[10px] font-bold text-white/80"><CircuitBoard size={18} />{watts !== undefined ? `${n1(watts)} W` : '—'}</div></Box>
          <Box x={430} y={80} w={60} h={100} d={22} color="#1c2b22" title="Bateria" glow={0.4}>
            <div className="absolute inset-x-1.5 bottom-1.5 rounded-sm transition-[height] duration-700" style={{ height: `${(b?.percent ?? 0) * 0.85}%`, background: `linear-gradient(to top, ${C.acc}, color-mix(in srgb, ${C.acc} 40%, transparent))` }} />
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white">{b ? `${b.percent}%` : '—'}</div>
          </Box>
          <Box x={430} y={195} w={60} h={40} d={8} color="#20262f" title="Componentes"><div className="flex h-full items-center justify-center text-[9px] font-bold text-white/60">CPU·GPU</div></Box>
        </div>
      </Scene>
      <div className="space-y-3">
        <Metric label={p?.systemW !== undefined ? 'Consumo do sistema' : 'Potência da bateria'} value={watts !== undefined ? `${n1(watts)} W` : '—'} color={C.pwr}><Spark data={hist.pwr} color={C.pwr} /></Metric>
        <Spec rows={[
          ['Carregador', p?.adapterW ? `${p.adapterW} W` : b ? (b.plugged ? 'conectado' : 'desconectado') : 'tomada'],
          [p?.batteryW !== undefined && p.batteryW < 0 ? 'Saindo da bateria' : 'Entrando na bateria', p?.batteryW !== undefined ? `${n1(Math.abs(p.batteryW))} W` : undefined],
          ['Tensão da bateria', p?.voltage ? `${n1(p.voltage, 2)} V` : undefined], ['Corrente', p?.current !== undefined ? `${n1(p.current, 2)} A` : undefined],
          ['Carga', b ? `${b.percent}%` : undefined], ['Estado', b ? (b.charging ? 'carregando' : b.plugged ? 'na tomada' : 'na bateria') : undefined],
          ['Capacidade máxima', h?.maxCapacity !== undefined ? `${h.maxCapacity}%` : undefined], ['Ciclos', h?.cycles], ['Condição', h?.condition],
          ['Temperatura da bateria', live?.temps.battery !== undefined ? `${Math.round(live.temps.battery)} °C` : undefined], ['Plano de energia', p?.plan],
        ]} />
      </div>
    </div>
  );
}

function SensorsTab({ live, hist }: Omit<P, 'info'>) {
  const t = live?.temps || {};
  const fans = live?.live?.fans || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:grid-cols-4">
        <Gauge value={t.cpu} max={110} label="Processador" unit="°C" color={C.cpu} warn={80} danger={95} />
        <Gauge value={t.gpu ?? live?.live?.gpu.temp} max={110} label="Placa de vídeo" unit="°C" color={C.gpu} warn={80} danger={95} />
        <Gauge value={t.ssd} max={90} label="SSD" unit="°C" color={C.ram} warn={60} danger={75} />
        <Gauge value={t.battery} max={60} label="Bateria" unit="°C" color={C.pwr} warn={38} danger={45} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Metric label="Temperatura do processador" value={t.cpu !== undefined ? `${Math.round(t.cpu)} °C` : '—'} color={C.cpu}><Spark data={hist.temp} color={C.cpu} /></Metric>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><Fan size={15} />Ventoinhas</div>
          {fans.length ? fans.map((f) => <div key={f.name} className="flex justify-between text-[13px]"><span>{f.name}</span><span className="tabular-nums">{f.rpm} RPM</span></div>)
            : <div className="text-[13px] text-muted">{isMac ? 'Este Mac não tem ventoinha ou o macOS não informa a rotação.' : 'O Windows não informa a rotação das ventoinhas sem um driver do fabricante.'}</div>}
          <div className="mt-3 text-[12px] text-muted">{isMac ? 'Leituras dos sensores térmicos do chip (IOHID).' : 'No Windows, a temperatura da CPU depende de suporte do fabricante e a da GPU aparece em placas NVIDIA.'}</div>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-[13px]"><Monitor size={16} className="text-muted" />As leituras são atualizadas a cada 1,5 segundo enquanto esta tela está aberta.</div>
    </div>
  );
}
