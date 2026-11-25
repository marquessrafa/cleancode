// Monitor de hardware: modelos 3D (three.js) de cada componente e monitoramento no estilo AIDA64,
// com valor atual, mínimo, máximo, média e minigráfico de cada sensor Valores medidos desde que você abriu esta tela.
// Windows: LibreHardwareMonitor (com o driver PawnIO, quando ativado). Mac: IOReport + sensores do chip.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Cpu, Gpu, MemoryStick, CircuitBoard, Zap, Thermometer, LayoutGrid, HardDrive, Download, ShieldCheck, Loader2, Activity, Fan } from 'lucide-react';
import { cc, isMac, HardwareInfo, HardwareLive, DiskDetail } from '../lib/api';
import { fmtSize } from '../lib/format';
import { Button, cx } from '../components/ui';
import { useApp } from '../lib/store';
import { PageBody } from './common';
import Viewer3D, { LiveInput } from '../hw3d/Viewer';
import { gpuModel, cpuModel, ramModel, boardModel, ssdModel, powerModel, pcModel, laptopModel } from '../hw3d/models';
import { socModel, gpuChipModel, soDimmModel, solderedMemModel, macLogicBoardModel, laptopBoardModel, onboardFlashModel } from '../hw3d/mobile';
import { t as tr, LOCALE } from '../lib/i18n';
import { AdvancedSetupModal, OPEN_ADVANCED, needsAdvanced } from '../components/AdvancedSetupModal';

type Tab = 'overview' | 'cpu' | 'gpu' | 'ram' | 'board' | 'storage' | 'power' | 'sensors';
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: tr("Visão geral"), icon: <LayoutGrid size={15} /> },
  { id: 'cpu', label: tr("Processador"), icon: <Cpu size={15} /> },
  { id: 'gpu', label: isMac ? 'GPU' : tr("Placa de vídeo"), icon: <Gpu size={15} /> },
  { id: 'ram', label: tr("Memória"), icon: <MemoryStick size={15} /> },
  { id: 'board', label: isMac ? tr("Placa lógica") : tr("Placa-mãe"), icon: <CircuitBoard size={15} /> },
  { id: 'storage', label: tr("Armazenamento"), icon: <HardDrive size={15} /> },
  { id: 'power', label: tr("Energia"), icon: <Zap size={15} /> },
  { id: 'sensors', label: tr("Sensores"), icon: <Thermometer size={15} /> },
];
const GROUP_LABEL: Record<string, string> = { temp: tr("Temperaturas"), volt: tr("Tensões"), current: tr("Correntes"), power: tr("Consumo"), clock: tr("Frequências"), load: tr("Uso"), fan: tr("Ventoinhas"), control: tr("Controle das ventoinhas"), level: 'Níveis', data: tr("Dados"), throughput: tr("Transferência"), energy: tr("Energia"), factor: tr("Fatores"), time: tr("Tempo"), limit: tr("Limites (de fábrica)") };
const GROUP_ORDER = ['temp', 'power', 'volt', 'current', 'clock', 'load', 'fan', 'control', 'level', 'data', 'throughput', 'energy', 'factor', 'time', 'limit'];
const KIND_LABEL: Record<string, string> = { cpu: tr("Processador"), gpu: isMac ? 'GPU' : tr("Placa de vídeo"), ram: tr("Memória"), board: isMac ? tr("Placa lógica") : tr("Placa-mãe"), disk: tr("Armazenamento"), battery: tr("Bateria"), psu: tr("Energia") };
const n = (v?: number, d = 1) => (v === undefined || v === null || isNaN(v) ? '—' : v.toLocaleString(LOCALE, { maximumFractionDigits: d }));
const fmtVal = (v: number | undefined, unit = '') => {
  if (v === undefined) return '—';
  if (unit === 'B/s') return `${fmtSize(v, 'auto', 1)}/s`;
  if (unit === 'MHz' && v >= 1000) return `${n(v / 1000, 2)} GHz`;
  const d = unit === 'V' || unit === 'A' ? 3 : unit === 'W' ? 1 : unit === '°C' ? 0 : 1;
  return `${n(v, d)}${unit ? ` ${unit}` : ''}`;
};
const C = { cpu: 'oklch(from var(--accent) .74 .17 calc(h + 220))', gpu: 'oklch(from var(--accent) .72 .19 calc(h + 300))', ram: 'oklch(from var(--accent) .8 .15 calc(h + 150))', pwr: 'oklch(from var(--accent) .82 .16 calc(h + 70))' };

// ---------- dados ao vivo + estatísticas da sessão ----------
interface Stat { min: number; max: number; sum: number; count: number; hist: number[] }
function useHardware(active: boolean) {
  const [info, setInfo] = useState<HardwareInfo | null>(null);
  const [live, setLive] = useState<HardwareLive | null>(null);
  const stats = useRef(new Map<string, Stat>());
  const hist = useRef<{ cpu: number[]; gpu: number[]; mem: number[]; pwr: number[] }>({ cpu: [], gpu: [], mem: [], pwr: [] });
  useEffect(() => { cc.hardwareInfo().then(setInfo).catch(() => null); }, []);
  useEffect(() => {
    if (!active) return;
    let alive = true, t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const l = await cc.hardwareLive(); if (!alive) return;
        for (const s of l.live?.sensors || []) {
          const k = `${s.kind}|${s.hw || ''}|${s.group || 'temp'}|${s.name}`;
          const st = stats.current.get(k) || { min: s.value, max: s.value, sum: 0, count: 0, hist: [] };
          st.min = Math.min(st.min, s.value); st.max = Math.max(st.max, s.value); st.sum += s.value; st.count++; st.hist = [...st.hist.slice(-59), s.value];
          stats.current.set(k, st);
        }
        const h = hist.current; const pw = l.live?.power.systemW ?? (l.live?.power.batteryW !== undefined ? Math.abs(l.live.power.batteryW) : undefined);
        h.cpu = [...h.cpu.slice(-59), l.load]; if (l.live?.gpu.util !== undefined) h.gpu = [...h.gpu.slice(-59), l.live.gpu.util]; h.mem = [...h.mem.slice(-59), l.memory.pressure]; if (pw !== undefined) h.pwr = [...h.pwr.slice(-59), pw];
        setLive(l);
      } catch { /* próxima */ }
      if (alive) t = setTimeout(tick, 1500);
    };
    tick();
    return () => { alive = false; clearTimeout(t); };
  }, [active]);
  return { info, live, stats: stats.current, hist: hist.current };
}
const toLive = (live: HardwareLive | null): LiveInput => {
  const L = live?.live;
  return {
    load: (live?.load ?? 0) / 100, cores: (live?.cores || []).map((c) => c / 100), gpu: (L?.gpu.util ?? 0) / 100, fanRpm: L?.fans?.[0]?.rpm, mem: (live?.memory.pressure ?? 0) / 100,
    watts: L?.power.systemW ?? (L?.power.batteryW !== undefined ? Math.abs(L.power.batteryW) : undefined), battery: live?.battery ? live.battery.percent / 100 : undefined, charging: live?.battery?.charging,
    temps: { cpu: live?.temps.cpu ?? L?.sensors?.find((s) => s.kind === 'cpu' && (s.group || 'temp') === 'temp')?.value ?? 0, gpu: L?.gpu.temp ?? 0 },
  };
};

// ---------- peças ----------
function Spark({ data, color = 'var(--accent)', h = 28 }: { data: number[]; color?: string; h?: number }) {
  if (data.length < 2) return <svg className="w-full" style={{ height: h }} />;
  const w = 120, top = Math.max(...data), bot = Math.min(...data), span = top - bot || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - bot) / span) * (h - 4) - 2}`).join(' L');
  return <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }}><path d={`M${pts}`} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg>;
}
function Metric({ label, value, sub, data, color = 'var(--accent)' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; data?: number[]; color?: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3.5">
      <div className="flex items-center gap-2 text-[12px] text-muted"><span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="text-[11.5px] text-muted">{sub}</div>}
      {data && <div className="mt-1.5"><Spark data={data} color={color} /></div>}
    </div>
  );
}
function Spec({ title, rows }: { title?: string; rows: [string, React.ReactNode][] }) {
  const r = rows.filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== '—');
  if (!r.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
      {title && <div className="border-b border-[var(--line)] px-4 py-2.5 text-[13px] font-semibold">{title}</div>}
      <div className="divide-y divide-[var(--line)]">{r.map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2 text-[13px]"><span className="text-muted">{k}</span><span className="text-right font-medium tabular-nums">{v}</span></div>)}</div>
    </div>
  );
}
/** Tabela de sensores no estilo AIDA64: agrupada, com atual/mín/máx/média e minigráfico. */
function SensorTable({ live, stats, kinds, title = 'Sensores' }: { live: HardwareLive | null; stats: Map<string, Stat>; kinds?: string[]; title?: string }) {
  const list = (live?.live?.sensors || []).filter((s) => !kinds || kinds.includes(s.kind));
  const groups = useMemo(() => {
    const g = new Map<string, typeof list>();
    for (const s of list) { const k = s.group || 'temp'; const a = g.get(k); a ? a.push(s) : g.set(k, [s]); }
    return [...g.entries()].sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]));
  }, [list]);
  if (!list.length) return <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 text-center text-[13px] text-muted">{tr("Nenhum sensor disponível para este componente")}{!isMac ? tr(" sem o monitoramento avançado") : ''}.</div>;
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5"><span className="text-[13px] font-semibold">{title}</span><span className="text-[11px] text-muted">{tr("Valores medidos desde que você abriu esta tela")}</span></div>
      <table className="w-full table-fixed text-[12.5px]">
        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted"><th className="px-4 py-1.5 font-medium">{tr("Sensor")}</th><th className="w-[92px] px-2 text-right font-medium">{tr("Atual")}</th><th className="w-[84px] px-2 text-right font-medium">{tr("Mín.")}</th><th className="w-[84px] px-2 text-right font-medium">{tr("Máx.")}</th><th className="w-[84px] px-2 text-right font-medium">{tr("Média")}</th><th className="w-[130px] px-4 font-medium">{tr("Histórico")}</th></tr></thead>
        <tbody>
          {groups.map(([g, rows]) => (
            <React.Fragment key={g}>
              <tr><td colSpan={6} className="bg-[var(--surface-2)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">{GROUP_LABEL[g] || g}</td></tr>
              {rows.map((s) => {
                const st = stats.get(`${s.kind}|${s.hw || ''}|${s.group || 'temp'}|${s.name}`);
                const unit = s.unit ?? '°C';
                const hot = (s.group || 'temp') === 'temp' && s.value >= 85;
                return (
                  <tr key={`${s.hw}|${s.name}|${g}`} className="border-t border-[var(--line)] hover:bg-[var(--hover)]">
                    <td className="px-4 py-1.5"><div className="truncate font-medium">{s.name}</div>{s.hw && <div className="truncate text-[11px] text-muted">{s.hw}</div>}</td>
                    <td className={cx('px-2 text-right font-semibold tabular-nums', hot && 'text-[var(--danger)]')}>{fmtVal(s.value, unit)}</td>
                    <td className="px-2 text-right tabular-nums text-muted">{fmtVal(st?.min ?? s.min, unit)}</td>
                    <td className="px-2 text-right tabular-nums text-muted">{fmtVal(st?.max ?? s.max, unit)}</td>
                    <td className="px-2 text-right tabular-nums text-muted">{fmtVal(st ? st.sum / st.count : undefined, unit)}</td>
                    <td className="px-4"><Spark data={st?.hist || []} color={hot ? 'var(--danger)' : 'var(--accent)'} h={22} /></td>
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function AdvancedBanner({ live }: { live: HardwareLive | null }) {
  const adv = live?.live?.advanced;
  // a ativação (e a reativação) é feita pelo popup de ativação; este aviso fica só para a leitura que travou
  if (isMac || !adv || adv.cpuBlocked !== 'crash') return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-4">
      <ShieldCheck size={22} className="shrink-0 text-[var(--accent)]" />
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="font-semibold">{tr("A leitura do processador travou neste PC")}</div>
        <div className="text-muted">{tr("Os sensores do processador ficaram de fora para não travar as outras leituras. O CleanCode tenta de novo amanhã.")}</div>
      </div>
      <button onClick={() => cc.hardwareReport()} className="flex shrink-0 items-center gap-2 rounded-lg border border-[var(--line)] px-3.5 py-2 text-[13px] font-semibold hover:bg-[var(--hover)]">{tr("Enviar relatório")}</button>
    </div>
  );
}
function Stage({ build, buildKey, live, height = 400, children }: { build: () => any; buildKey: string; live: LiveInput; height?: number; children?: React.ReactNode }) {
  // sem moldura: o 3D vaza por trás das abas e dos blocos vizinhos e some em fade (ver OVERFLOW em hw3d/core)
  return (
    <div className="relative">
      <Viewer3D build={build} buildKey={buildKey} live={live} height={height} />
      {children && <div className="pointer-events-none absolute left-1 top-0">{children}</div>}
    </div>
  );
}

/** Liberar memória. Windows: rápido (programas do usuário) ou completo (também a memória em espera, com administrador). */
function FreeMemoryCard() {
  const [busy, setBusy] = useState<'' | 'quick' | 'deep'>('');
  const [msg, setMsg] = useState('');
  const run = async (deep: boolean) => {
    setBusy(deep ? 'deep' : 'quick'); setMsg('');
    try { setMsg((await cc.freeMemory(deep)).message); } catch { setMsg(tr("Não foi possível liberar a memória")); }
    setBusy('');
  };
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" loading={busy === 'quick'} disabled={!!busy} icon={<MemoryStick size={14} />} onClick={() => run(false)}>{tr("Liberar memória")}</Button>
        {!isMac && <Button size="sm" loading={busy === 'deep'} disabled={!!busy} onClick={() => run(true)}>{tr("Completa (administrador)")}</Button>}
      </div>
      <div className="mt-2 text-[12px] text-muted">{msg || (isMac ? tr("Libera a memória que os apps não estão usando. O macOS pede a sua senha.") : tr("Libera a memória que os programas reservaram e não estão usando."))}</div>
    </div>
  );
}

// ---------- modelo 3D de cada peça conforme a máquina ----------
// Mac (Apple Silicon): CPU, GPU e memória ficam no mesmo chip; a placa é a placa lógica do MacBook.
// Notebook Windows: processador soldado (BGA) com GPU integrada, GPU dedicada como chip na placa,
// memória SO-DIMM ou soldada, placa-mãe de notebook. Desktop Windows: peças de PC (soquete, placa de vídeo, DIMM).
const DGPU = /nvidia|geforce|quadro|rtx|gtx|radeon\s*(rx|pro)|radeon\s*\d{3,4}m|arc\s*a\d/i;
function machineProfile(info: HardwareInfo | null, laptop: boolean) {
  const appleSi = isMac && !/intel/i.test(info?.cpu.arch || '');
  const vendor: 'intel' | 'amd' = /amd|ryzen/i.test(info?.cpu.name || '') ? 'amd' : 'intel';
  const mods = info?.memory.modules || [];
  const dg = info?.gpus.find((g) => DGPU.test(g.name || ''));
  const dgpu = !isMac && !!dg;
  const soldered = laptop && !isMac && (mods.some((x) => x.formFactor === 'onboard') || /^LP/i.test(info?.memory.type || '')) && !mods.some((x) => x.formFactor === 'sodimm');
  const memChips = /max|ultra/i.test(info?.board.chip || info?.cpu.name || '') ? 4 : 2;
  const total = info?.memory.total || 0;
  const memLabel = total ? fmtSize(total / memChips, 'auto', 0) : '';
  const gddr = dg?.vram ? Math.max(2, Math.min(8, Math.round(dg.vram / 2 ** 31))) : 4;
  const apple = (highlight: 'cpu' | 'gpu' | 'mem') => socModel({ vendor: 'apple', pCores: info?.cpu.pCores, eCores: info?.cpu.eCores, gpuCores: info?.gpus[0]?.cores, memChips, memLabel, highlight });
  const x86 = (highlight: 'cpu' | 'gpu') => socModel({ vendor, cores: info?.cpu.cores, highlight });
  // o processador do soquete da placa-mãe é o mesmo da aba Processador
  const cpuInfo = { name: (info?.cpu.name || 'Processador').replace(/\(R\)|\(TM\)|CPU|@.*$/gi, '').replace(/\s+/g, ' ').trim(), sub: info?.cpu.arch, cores: info?.cpu.cores };
  return {
    key: `${appleSi ? 'asi' : isMac ? 'imac' : laptop ? 'nb' : 'pc'}-${dgpu}-${soldered}-${mods.length}-${info?.cpu.cores || 0}-${info?.gpus[0]?.cores || 0}`,
    cpu: (name: string) => (appleSi ? apple('cpu') : laptop || isMac ? x86('cpu') : cpuModel({ name, sub: info?.cpu.arch, cores: info?.cpu.cores })),
    gpu: () => (appleSi ? apple('gpu') : dgpu ? (laptop ? gpuChipModel({ memChips: gddr }) : gpuModel()) : x86('gpu')),
    ram: () => (appleSi ? apple('mem') : laptop || isMac ? (soldered || isMac ? solderedMemModel({ chips: 4, label: total ? fmtSize(total / 4, 'auto', 0) : '' }) : soDimmModel({ count: Math.max(1, mods.length) })) : ramModel({ count: Math.max(1, mods.length || 2) })),
    board: () => (appleSi ? macLogicBoardModel({ pro: /pro|max/i.test(`${info?.board.system || ''} ${info?.board.chip || ''}`), pCores: info?.cpu.pCores, eCores: info?.cpu.eCores, gpuCores: info?.gpus[0]?.cores, memChips, memLabel })
      : laptop || isMac ? laptopBoardModel({ vendor, cores: info?.cpu.cores, dgpu, sodimm: mods.length, soldered: soldered || isMac })
      : boardModel({ sticks: mods.length || 2, dimms: Math.max(2, info?.memory.slots || 4), cpu: cpuInfo })),
  };
}

// ---------- página ----------
export default function Hardware() {
  const { page } = useApp();
  const [tab, setTab] = useState<Tab>('overview');
  const { info, live, stats, hist } = useHardware(page === 'hardware');
  const L = live?.live;
  const lv = toLive(live);
  const laptop = isMac ? info?.board.chassis !== 'desktop' : info?.board.chassis === 'laptop' || !!live?.battery;
  const watts = lv.watts;
  const m = machineProfile(info, laptop);
  const cpuShort = (info?.cpu.name || 'Processador').replace(/\(R\)|\(TM\)|CPU|@.*$/gi, '').replace(/\s+/g, ' ').trim();
  return (
    <PageBody>
      <div className="relative z-10 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><CircuitBoard size={22} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{tr("Monitor de hardware")}</h1>
          <p className="truncate text-[13px] text-muted">{info ? [info.board.system || info.board.model, cpuShort, tr("{0} de RAM", fmtSize(info.memory.total, 'auto', 0)), info.gpus[0]?.name].filter(Boolean).join(' · ') : tr("Lendo o hardware…")}</p>
        </div>
        {needsAdvanced(live)
          ? <button onClick={() => window.dispatchEvent(new Event(OPEN_ADVANCED))} className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1 text-[12px] font-semibold text-[var(--on-accent)] hover:brightness-110"><ShieldCheck size={13} />{tr("Mapear os sensores")}</button>
          : L?.advanced?.active && <span className="flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[12px] font-semibold text-[var(--accent)]"><Activity size={13} />{L.advanced.source}</span>}
        <AdvancedSetupModal live={live} />
      </div>
      {/* abas e aviso ficam por cima do 3D, que vaza para cima delas em fade */}
      <div className="relative z-10 mt-4 inline-flex flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] p-1 backdrop-blur-md">
        {TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors', tab === t.id ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-muted hover:bg-[var(--hover)] hover:text-[var(--fg)]')}>{t.icon}{t.label}</button>)}
      </div>
      <div className="relative z-10 mt-4"><AdvancedBanner live={live} /></div>
      <div key={tab} className="anim-fade-in mt-4 space-y-4">
        {tab === 'overview' && (
          <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
            <Stage build={() => (isMac ? laptopModel({ mac: true }) : laptop ? laptopModel({}) : pcModel({ sticks: info?.memory.modules.length || 2, cpu: { name: cpuShort, sub: info?.cpu.arch, cores: info?.cpu.cores } }))} buildKey={`dev-${isMac}-${laptop}-${info?.memory.modules.length || 0}`} live={lv} height={520}>
              <div className="text-[12px] font-semibold uppercase tracking-wider text-muted">{isMac ? info?.board.system || tr("Mac") : laptop ? tr("Notebook") : tr("Computador")}</div>
              <div className="text-[18px] font-semibold">{info?.board.model || ''}</div>
            </Stage>
            <div className="space-y-3">
              <Metric label={tr("Processador")} value={`${live?.load ?? '—'} %`} sub={[L?.cpuMHz ? fmtVal(L.cpuMHz, 'MHz') : '', live?.temps.cpu !== undefined ? `${Math.round(live.temps.cpu)} °C` : ''].filter(Boolean).join(' · ')} data={hist.cpu} color={C.cpu} />
              <Metric label={tr("Placa de vídeo")} value={L?.gpu.util !== undefined ? `${L.gpu.util} %` : '—'} sub={L?.gpu.temp !== undefined ? `${Math.round(L.gpu.temp)} °C` : info?.gpus[0]?.name} data={hist.gpu} color={C.gpu} />
              <Metric label={tr("Memória")} value={`${live?.memory.pressure ?? '—'} %`} sub={live ? tr("{0} de {1}", fmtSize(live.memory.used, 'auto', 1), fmtSize(live.memory.total, 'auto', 0)) : ''} data={hist.mem} color={C.ram} />
              <Metric label={tr("Energia")} value={watts !== undefined ? `${n(watts)} W` : '—'} sub={live?.battery ? tr("Bateria {0}%{1}", live.battery.percent, live.battery.charging ? ' · carregando' : '') : tr("Na tomada")} data={hist.pwr} color={C.pwr} />
            </div>
          </div>
        )}
        {tab === 'cpu' && (
          <>
            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <Stage build={() => m.cpu(cpuShort)} buildKey={`cpu-${m.key}-${cpuShort}`} live={lv} />
              <div className="space-y-3">
                <Metric label={tr("Carga total")} value={`${live?.load ?? '—'} %`} sub={live ? tr("Usuário {0}% · Sistema {1}%", live.split.user, live.split.system) : ''} data={hist.cpu} color={C.cpu} />
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3.5">
                  <div className="mb-2 text-[12px] text-muted">{tr("Carga por núcleo")}</div>
                  <div className="grid grid-cols-4 gap-1.5">{(live?.cores || []).map((c, i) => <div key={i} className="rounded-md p-1.5 text-center" style={{ background: `color-mix(in srgb, var(--accent) ${8 + c * 0.8}%, var(--surface-2))` }}><div className="text-[10px] text-muted">{info?.cpu.pCores ? (i >= (info.cpu.eCores || 0) ? 'P' : 'E') : 'N'}{i}</div><div className="text-[12px] font-semibold tabular-nums">{c}%</div></div>)}</div>
                </div>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
              <Spec title={tr("Especificações")} rows={[[tr("Modelo"), info?.cpu.name], [tr("Arquitetura"), info?.cpu.arch], [tr("Núcleos e threads"), info ? `${info.cpu.cores} / ${info.cpu.threads}` : undefined], [tr("Núcleos de desempenho"), info?.cpu.pCores], [tr("Núcleos de eficiência"), info?.cpu.eCores], [tr("Frequência atual"), L?.cpuMHz ? fmtVal(L.cpuMHz, 'MHz') : undefined], [tr("Frequência máxima"), info?.cpu.maxMHz ? fmtVal(info.cpu.maxMHz, 'MHz') : undefined], ['Cache L2', info?.cpu.l2 ? fmtSize(info.cpu.l2, 'auto', 0) : undefined], ['Cache L3', info?.cpu.l3 ? fmtSize(info.cpu.l3, 'auto', 0) : undefined], [tr("Ligado há"), live ? `${Math.floor(live.uptime / 86400)} d ${Math.floor((live.uptime % 86400) / 3600)} h` : undefined]]} />
              <SensorTable live={live} stats={stats} kinds={['cpu']} title={tr("Sensores do processador")} />
            </div>
          </>
        )}
        {tab === 'gpu' && (
          <>
            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <Stage build={m.gpu} buildKey={`gpu-${m.key}`} live={lv} />
              <div className="space-y-3">
                <Metric label={tr("Uso da GPU")} value={L?.gpu.util !== undefined ? `${L.gpu.util} %` : '—'} sub={L?.gpu.temp !== undefined ? `${Math.round(L.gpu.temp)} °C` : undefined} data={hist.gpu} color={C.gpu} />
                <Metric label={tr("Memória de vídeo em uso")} value={L?.gpu.memUsed ? fmtSize(L.gpu.memUsed, 'auto', 1) : '—'} sub={L?.gpu.memTotal ? tr("de {0}", fmtSize(L.gpu.memTotal, 'auto', 0)) : undefined} />
                {L?.gpu.procs?.length ? <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3.5"><div className="mb-1.5 text-[12px] text-muted">{tr("Apps que mais usam a placa de vídeo")}</div>{L.gpu.procs.map((p) => <div key={p.pid} className="flex justify-between py-0.5 text-[13px]"><span className="truncate">{p.name}</span><span className="tabular-nums text-muted">{n(p.util)} %</span></div>)}</div> : null}
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
              <Spec title={tr("Especificações")} rows={[...((info?.gpus || []).flatMap((g, i) => [[`GPU ${i + 1}`, g.name], [tr("Fabricante"), g.vendor], [tr("Núcleos"), g.cores], [isMac ? tr("Gráficos") : 'API', g.api], ['Driver', g.driver], [tr("Memória de vídeo"), g.vram ? fmtSize(g.vram, 'auto', 0) : isMac ? tr("unificada com a RAM") : undefined]] as [string, any][])), ...((info?.displays || []).map((d, i) => [`Tela ${i + 1}`, `${d.name}${d.resolution ? ` · ${d.resolution}` : ''}`] as [string, string]))]} />
              <SensorTable live={live} stats={stats} kinds={['gpu']} title={isMac ? tr("Sensores da GPU") : tr("Sensores da placa de vídeo")} />
            </div>
          </>
        )}
        {tab === 'ram' && (
          <>
            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <Stage build={m.ram} buildKey={`ram-${m.key}`} live={lv} />
              <div className="space-y-3">
                <Metric label={tr("Em uso")} value={live ? `${fmtSize(live.memory.used, 'auto', 1)}` : '—'} sub={live ? tr("de {0} · pressão {1}%", fmtSize(live.memory.total, 'auto', 0), live.memory.pressure) : ''} data={hist.mem} color={C.ram} />
                <FreeMemoryCard />
                {live?.memoryDetail && <Spec rows={[['Apps (ativa)', fmtSize(live.memoryDetail.active, 'auto', 1)], [tr("Fixa"), fmtSize(live.memoryDetail.wired, 'auto', 1)], [tr("Comprimida"), live.memoryDetail.compressed ? fmtSize(live.memoryDetail.compressed, 'auto', 1) : undefined], [tr("Disponível"), fmtSize(live.memoryDetail.available, 'auto', 1)], ['Swap', live.memoryDetail.swapTotal ? tr("{0} de {1}", fmtSize(live.memoryDetail.swapUsed, 'auto', 1), fmtSize(live.memoryDetail.swapTotal, 'auto', 1)) : undefined]]} />}
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
              <Spec title={tr("Módulos")} rows={[[tr("Tipo"), info?.memory.type], [tr("Velocidade"), info?.memory.speed ? `${info.memory.speed} MT/s` : undefined], [tr("Fabricante"), info?.memory.manufacturer], ['Slots', info ? (isMac ? tr("memória unificada no chip") : `${info.memory.modules.length}${info.memory.slots ? ` de ${info.memory.slots}` : ''} ocupados`) : undefined], ...(!isMac ? (info?.memory.modules || []).map((m, i) => [m.slot || `Slot ${i + 1}`, `${fmtSize(m.size, 'auto', 0)}${m.speed ? ` · ${m.speed} MT/s` : ''}${m.manufacturer ? ` · ${m.manufacturer}` : ''}${m.part ? ` · ${m.part}` : ''}`] as [string, string]) : [])]} />
              <SensorTable live={live} stats={stats} kinds={['ram']} title={tr("Sensores da memória")} />
            </div>
          </>
        )}
        {tab === 'board' && (
          <>
            <Stage build={m.board} buildKey={`board-${m.key}`} live={lv} height={460} />
            <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
              <Spec title={tr("Placa")} rows={[[tr("Computador"), info?.board.system], [tr("Fabricante"), info?.board.manufacturer], [isMac ? tr("Identificador do modelo") : tr("Modelo da placa"), info?.board.model], [isMac ? tr("Número do modelo") : tr("Revisão"), info?.board.version], [isMac ? 'Chip' : tr("Processador"), info?.board.chip || info?.cpu.name], [isMac ? 'Firmware (iBoot)' : 'BIOS', info?.board.firmware], [tr("Data do firmware"), info?.board.firmwareDate], [tr("Memória"), info ? `${fmtSize(info.memory.total, 'auto', 0)}${info.memory.type ? ` ${info.memory.type}` : ''}` : undefined], [tr("Slots de memória"), !isMac && info?.memory.slots ? info.memory.slots : undefined]]} />
              <SensorTable live={live} stats={stats} kinds={['board']} title={isMac ? tr("Sensores da placa") : tr("Sensores da placa-mãe (tensões e ventoinhas)")} />
            </div>
          </>
        )}
        {tab === 'storage' && <StorageTab live={live} stats={stats} />}
        {tab === 'power' && (
          <>
            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <Stage build={() => powerModel({ laptop })} buildKey={`power-${laptop}`} live={lv} />
              <div className="space-y-3">
                <Metric label={L?.power.systemW !== undefined ? tr("Consumo do sistema") : tr("Potência da bateria")} value={watts !== undefined ? `${n(watts)} W` : '—'} data={hist.pwr} color={C.pwr} />
                <Spec rows={[[tr("Carregador"), L?.power.adapterW ? `${L.power.adapterW} W` : live?.battery ? (live.battery.plugged ? 'conectado' : 'desconectado') : tr("fonte de alimentação")], [L?.power.batteryW !== undefined && L.power.batteryW < 0 ? tr("Saindo da bateria") : tr("Entrando na bateria"), L?.power.batteryW !== undefined ? `${n(Math.abs(L.power.batteryW))} W` : undefined], [tr("Tensão da bateria"), L?.power.voltage ? `${n(L.power.voltage, 2)} V` : undefined], [tr("Corrente"), L?.power.current !== undefined ? `${n(L.power.current, 2)} A` : undefined], [tr("Carga"), live?.battery ? `${live.battery.percent}%` : undefined], [tr("Capacidade máxima"), live?.batteryHealth?.maxCapacity !== undefined ? `${live.batteryHealth.maxCapacity}%` : undefined], [tr("Ciclos"), live?.batteryHealth?.cycles], [tr("Plano de energia"), L?.power.plan]]} />
              </div>
            </div>
            <SensorTable live={live} stats={stats} kinds={['psu', 'battery', 'cpu', 'gpu']} title={tr("Consumo, tensões e correntes")} />
          </>
        )}
        {tab === 'sensors' && <SensorsTab live={live} stats={stats} />}
      </div>
    </PageBody>
  );
}

function StorageTab({ live, stats }: { live: HardwareLive | null; stats: Map<string, Stat> }) {
  const [disks, setDisks] = useState<DiskDetail[] | null>(null);
  const [sel, setSel] = useState(0);
  useEffect(() => { let alive = true; const load = () => cc.hardwareDisks().then((d) => alive && setDisks(d)).catch(() => alive && setDisks([])); load(); const t = setInterval(load, 15000); return () => { alive = false; clearInterval(t); }; }, []);
  const d = disks?.[sel];
  const kind = !d ? 'nvme' : d.bus === 'USB' ? 'usb' : d.media === 'HD' || d.media === 'HDD' ? 'hdd' : d.bus === 'NVMe' ? (isMac ? 'onboard' : 'nvme') : 'sata';
  if (!disks) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted" /></div>;
  if (!disks.length) return <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center text-[13px] text-muted">{tr("Nenhum disco encontrado.")}</div>;
  return (
    <>
      <div className="flex flex-wrap gap-2">{disks.map((x, i) => <button key={x.id + i} onClick={() => setSel(i)} className={cx('flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px]', i === sel ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--hover)]')}><HardDrive size={15} /><span><span className="block font-medium">{x.name}</span><span className="block text-[11px] text-muted">{[x.bus, x.size ? fmtSize(x.size, 'auto', 0) : ''].filter(Boolean).join(' · ')}</span></span></button>)}</div>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Stage build={() => (kind === 'onboard' ? onboardFlashModel({ label: d?.size ? fmtSize(d.size / 2, 'auto', 0) : '', chips: 2 }) : ssdModel({ kind, label: d?.model || d?.name }))} buildKey={`ssd-${sel}-${kind}`} live={{ disk: 0.4 }} />
        <div className="space-y-3">
          <Metric label={tr("Saúde")} value={d?.healthPct !== undefined ? `${d.healthPct} %` : d?.health || '—'} sub={d?.health && d.healthPct !== undefined ? d.health : undefined} />
          <Metric label={tr("Temperatura")} value={d?.temp !== undefined ? `${Math.round(d.temp)} °C` : '—'} sub={d?.needsAdmin && !isMac ? tr("Para ver a saúde do disco (SMART), ative o monitoramento avançado.") : undefined} />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Spec title={tr("Unidade")} rows={[[tr("Modelo"), d?.model], ['Firmware', d?.firmware], ['Interface', d?.bus], [tr("Tipo"), d?.media], [tr("Capacidade"), d?.size ? fmtSize(d.size, 'auto', 1) : undefined], ['Link', d?.link], ['TRIM', d?.trim === undefined ? undefined : d.trim ? tr("Ativado") : tr("Desativado")]]} />
        <Spec title="SMART" rows={[[tr("Estado"), d?.health], [tr("Vida útil restante"), d?.healthPct !== undefined ? `${d.healthPct}%` : undefined], [tr("Horas ligado"), d?.powerOnHours !== undefined ? `${n(d.powerOnHours, 0)} h` : undefined], [tr("Ciclos de energia"), d?.powerCycles], [tr("Dados gravados"), d?.written ? fmtSize(d.written, 'auto', 1) : undefined], [tr("Dados lidos"), d?.read ? fmtSize(d.read, 'auto', 1) : undefined], [tr("Desligamentos inesperados"), d?.unsafeShutdowns], [tr("Erros de mídia"), d?.mediaErrors], [tr("Reserva disponível"), d?.spare !== undefined ? `${d.spare}%` : undefined]]} />
      </div>
      {d?.partitions?.length ? <Spec title={tr("Partições e volumes")} rows={d.partitions.map((p) => [`${p.name}${p.mount && !p.mount.startsWith('/') ? ` · ${p.mount}` : ''}`, `${fmtSize(p.size, 'auto', 1)}${p.fs ? ` · ${p.fs}` : ''}${p.mount?.startsWith('/') ? ` · ${p.mount}` : ''}`] as [string, string])} /> : null}
      <SensorTable live={live} stats={stats} kinds={['disk']} title={tr("Sensores dos discos")} />
    </>
  );
}

function SensorsTab({ live, stats }: { live: HardwareLive | null; stats: Map<string, Stat> }) {
  const temps = (live?.live?.sensors || []).filter((s) => (s.group || 'temp') === 'temp');
  const byKind = new Map<string, number>();
  for (const s of temps) byKind.set(s.kind, Math.max(byKind.get(s.kind) ?? -Infinity, s.value));
  const fans = live?.live?.fans || [];
  const exportCsv = () => {
    const rows = [[tr("Componente"), 'Hardware', tr("Grupo"), 'Sensor', tr("Atual"), tr("Mínimo"), tr("Máximo"), tr("Média"), tr("Unidade")]];
    for (const s of live?.live?.sensors || []) { const st = stats.get(`${s.kind}|${s.hw || ''}|${s.group || 'temp'}|${s.name}`); rows.push([KIND_LABEL[s.kind] || s.kind, s.hw || '', GROUP_LABEL[s.group || 'temp'] || s.group || '', s.name, String(s.value), String(st?.min ?? ''), String(st?.max ?? ''), st ? String(st.sum / st.count) : '', s.unit ?? '°C']); }
    const blob = new Blob(['﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `cleancode-sensores-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const tile = (k: string, label: string, icon: React.ReactNode) => {
    const v = byKind.get(k); const has = v !== undefined && isFinite(v);
    const hue = has ? Math.max(0, Math.min(1, (v! - 30) / 65)) : 0;
    const col = has ? `hsl(${(1 - hue) * 220}, 90%, 55%)` : 'var(--line)';
    return (
      <div className="relative overflow-hidden rounded-xl border border-[var(--line)] p-4" style={{ background: has ? `radial-gradient(120% 120% at 50% 100%, color-mix(in srgb, ${col} 35%, transparent), var(--surface) 70%)` : 'var(--surface)' }}>
        <div className="flex items-center gap-2 text-[12px] text-muted">{icon}{label}</div>
        <div className="mt-1 text-[26px] font-semibold tabular-nums" style={{ color: has ? col : undefined }}>{has ? `${Math.round(v!)} °C` : '—'}</div>
        {!has && k === 'cpu' && live?.live?.advanced?.cpuBlocked && <div className="mt-1 text-[11.5px] leading-snug text-muted">{live.live.advanced.cpuBlocked === 'crash' ? tr("A leitura travou neste PC.") : live.live.advanced.cpuBlocked === 'nodata' ? tr("Os sensores avançados não estão respondendo.") : tr("Precisa do monitoramento avançado.")}</div>}
      </div>
    );
  };
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-semibold">{tr("Mapa térmico")}</div>
        <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--hover)]"><Download size={13} />{tr("Exportar CSV")}</button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tile('cpu', tr("Processador"), <Cpu size={14} />)}{tile('gpu', tr("Placa de vídeo"), <Gpu size={14} />)}{tile('ram', tr("Memória"), <MemoryStick size={14} />)}
        {tile('board', isMac ? tr("Placa lógica") : tr("Placa-mãe"), <CircuitBoard size={14} />)}{tile('disk', tr("Armazenamento"), <HardDrive size={14} />)}{tile('battery', tr("Bateria"), <Zap size={14} />)}
      </div>
      <AdvancedBanner live={live} />
      {live?.live?.needsAdmin && !live.live.advanced?.active && <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-[12.5px] text-muted">{live.live.needsAdmin}</div>}
      {fans.length > 0 && <div className="flex flex-wrap gap-2">{fans.map((f) => <span key={f.name} className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px]"><Fan size={13} className="text-[var(--accent)]" />{f.name}<b className="tabular-nums">{f.rpm} {tr("RPM")}</b></span>)}</div>}
      <SensorTable live={live} stats={stats} title={tr("Todos os sensores")} />
    </>
  );
}
