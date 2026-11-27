// Ventoinhas (Windows): velocidade fixa ou curva pela temperatura para cada ventoinha que aceita controle.
// Quem aplica é a tarefa de administrador do monitoramento avançado (helper cc-lhm). O app só grava o pedido e renova
// a cada 3 segundos (ver electron/platform/win32/fans.ts). Proteções: 100% a partir de 90 °C, modo automático quando o
// app fecha ou para de renovar o pedido, e modo automático quando a placa não obedece ao comando.
//
// Layout: topo com degradê e resumo; cartões pequenos (um por ventoinha, com o anel de velocidade); painel de edição
// da ventoinha escolhida (modo, velocidade fixa, curva, bomba e teste).
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ShieldCheck, AlertTriangle, Loader2, FlaskConical, Pencil, Check, Info, Thermometer, Cpu, Gpu, Droplets, Plus, Minus, ChevronDown, Sparkles, Wand2, Bot } from 'lucide-react';
import { FanWizard } from './FanWizard';
import { FanHelp } from './FanHelp';
import { cc, FanConfig, FanControlInfo, FanState, FanTempSource } from '../lib/api';
import { useApp } from '../lib/store';
import { PageBody } from './common';
import { Button, Select, cx } from '../components/ui';
import { OPEN_ADVANCED } from '../components/AdvancedSetupModal';
import { GpuHero, GpuTileArt, useGpuCard } from '../components/GpuArt';
import { FanSpinner, FanTrioHero } from '../components/FanArt';
import { PumpArt } from '../components/PumpArt';
import { t as tr, LOCALE } from '../lib/i18n';

type Points = [number, number][];
type Mode = FanConfig['mode'];
const PUMP_MIN = 60;
const PRESETS: { id: string; label: string; points: Points }[] = [
  { id: 'quiet', label: tr("Silenciosa"), points: [[30, 20], [50, 30], [70, 55], [85, 100]] },
  { id: 'balanced', label: tr("Equilibrada"), points: [[30, 30], [50, 45], [70, 70], [85, 100]] },
  { id: 'performance', label: tr("Desempenho"), points: [[30, 45], [50, 60], [65, 85], [80, 100]] },
];
const T_MIN = 20, T_MAX = 100;
// segunda cor dos degradês: a cor de destaque girada no círculo de cores (a mesma técnica do Monitor de hardware)
// segunda cor dos degradês: a própria cor de destaque, um pouco mais clara (mesmo tom e mesma saturação)
// (com uma cor de destaque cinza ou branca, o degradê fica no mesmo tom, em vez de virar rosa)
const ACC2 = 'oklch(from var(--accent) calc(l + 0.08) c h)';
const fmt = (v: number | undefined | null, d = 0) => (v === undefined || v === null || isNaN(v) ? '—' : v.toLocaleString(LOCALE, { maximumFractionDigits: d }));
function interp(pts: Points, t: number) {
  if (!pts.length) return 0;
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, pa] = pts[i - 1], [b, pb] = pts[i]; return b - a <= 0 ? pb : pa + ((pb - pa) * (t - a)) / (b - a); }
  return pts[pts.length - 1][1];
}
/** Temperatura que guia a curva quando você ainda não escolheu: a do processador para a placa-mãe, a da própria placa de vídeo para ela. */
function defaultSource(fan: FanControlInfo, temps: FanTempSource[]) {
  if (fan.kind === 'gpu') return (temps.find((t) => t.kind === 'gpu' && fan.hw.startsWith(t.hw) && t.name === 'GPU Core') || temps.find((t) => t.kind === 'gpu'))?.id;
  return (temps.find((t) => t.kind === 'cpu' && /package|tctl/i.test(t.name)) || temps.find((t) => t.kind === 'cpu') || temps[0])?.id;
}
/** Nome mostrado: o apelido que você deu ou o nome da biblioteca ("Fan #2"). Com apelido, o nome da biblioteca fica embaixo. */
const fanName = (fan: FanControlInfo, cfg?: FanConfig) => cfg?.label || fan.name;
const fanSub = (fan: FanControlInfo, cfg?: FanConfig) => (cfg?.label ? `${fan.name}, ${fan.hw}` : fan.hw);
const kindLabel =(k: FanControlInfo['kind']) => (k === 'gpu' ? tr("Placa de vídeo") : k === 'board' ? tr("Placa-mãe") : k === 'cooler' ? tr("Refrigeração") : tr("Outras ventoinhas"));

// ---------- estado das ventoinhas (consulta a cada 1,5 segundo enquanto a tela está aberta) ----------
function useFans(active: boolean) {
  const [state, setState] = useState<FanState | null>(null);
  const ref = useRef<FanState | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true, t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try { const s = await cc.fanState(); if (alive && s) { ref.current = s; setState(s); } } catch { /* próxima */ }
      if (alive) t = setTimeout(tick, 1500);
    };
    tick();
    return () => { alive = false; clearTimeout(t); };
  }, [active]);
  return { state, ref };
}

// ---------- ícone da ventoinha: sete pás curvas em volta do eixo, dentro de um círculo com o anel de velocidade ----------
function FanGlyph({ size, spin, gid }: { size: number; spin: number; gid: string }) {
  const blades = Array.from({ length: 7 }, (_, i) => (i * 360) / 7);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={spin ? { animation: `spin ${spin}s linear infinite` } : undefined} aria-hidden>
      <defs>
        <linearGradient id={`${gid}-blade`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor={ACC2} />
        </linearGradient>
      </defs>
      {blades.map((a) => (
        <path key={a} transform={`rotate(${a} 50 50)`} fill={`url(#${gid}-blade)`} opacity={0.92}
          stroke="var(--surface)" strokeWidth="1.2" d="M46.3 38.6 C45 28 48 15 56.1 6.4 Q67 4 75.9 14.4 C69 24 61 31 53.7 38.6 Z" />
      ))}
      <circle cx="50" cy="50" r="13" fill="var(--surface)" stroke={`url(#${gid}-blade)`} strokeWidth="3" />
      <circle cx="50" cy="50" r="3.5" fill="var(--accent)" />
    </svg>
  );
}
function FanDial({ size, pct, rpm, tone = 'ok', dim }: { size: number; pct?: number; rpm?: number; tone?: 'ok' | 'warn' | 'danger'; dim?: boolean }) {
  const gid = useId().replace(/:/g, '');
  const r = 46, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct ?? 0));
  const spin = rpm && rpm > 0 ? Math.max(0.3, Math.min(3, 1400 / rpm)) : 0;
  const stroke = tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : `url(#${gid}-ring)`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id={`${gid}-ring`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={ACC2} /><stop offset="1" stopColor="var(--accent)" /></linearGradient>
          <radialGradient id={`${gid}-disc`} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="color-mix(in srgb, var(--accent) 22%, var(--surface))" /><stop offset="1" stopColor="var(--surface)" /></radialGradient>
        </defs>
        <circle cx="50" cy="50" r="40" fill={`url(#${gid}-disc)`} />
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(c * p) / 100} ${c}`} style={{ transition: 'stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div className={cx('absolute inset-0 flex items-center justify-center', dim && 'opacity-40')}><FanGlyph size={size * 0.56} spin={spin} gid={gid} /></div>
    </div>
  );
}

export default function FansPage() {
  const { page, go, settings, setSettings } = useApp();
  const { state, ref } = useFans(page === 'fans');
  const [draft, setDraft] = useState<Record<string, FanConfig>>(() => settings?.fans || {});
  const draftRef = useRef(draft);
  const [showEmpty, setShowEmpty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const save = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // as mudanças aparecem na hora e são salvas (e aplicadas) depois de uma pausa curta, para não gravar a cada passo do controle deslizante
  const change = (id: string, patch: Partial<FanConfig>) => {
    const next = { ...draftRef.current, [id]: { ...(draftRef.current[id] || { mode: 'auto' }), ...patch } as FanConfig };
    draftRef.current = next; setDraft(next);
    clearTimeout(save.current);
    save.current = setTimeout(() => setSettings({ fans: next }), 350);
  };
  const openActivation = () => { go('hardware'); setTimeout(() => window.dispatchEvent(new Event(OPEN_ADVANCED)), 400); };

  const controls = state?.controls || [];
  const hidden = controls.filter((c) => c.kind === 'board' && !c.rpm && (draft[c.id]?.mode || 'auto') === 'auto');
  const visible = showEmpty ? controls : controls.filter((c) => !hidden.includes(c));
  const sel = visible.find((c) => c.id === selected) || visible[0];
  // assistente: as saídas que podem ser controladas e têm uma ventoinha girando
  const [wizard, setWizard] = useState(false);
  const candidates = visible.filter((c) => !c.locked && (c.rpm || 0) > 0);
  const generic = candidates.some((c) => !draft[c.id]?.label);
  const ready = !!state && state.active && state.helperReady && controls.length > 0;

  return (
    <PageBody>
      <Hero state={state} draft={draft} ready={ready} onIdentify={candidates.length > 0 && !generic ? () => setWizard(true) : undefined} />
      <div className="mt-4 space-y-4">
        {!state ? (
          <div className="flex items-center gap-2 text-[13px] text-muted"><Loader2 size={15} className="animate-spin" />{tr("O CleanCode está lendo as ventoinhas.")}</div>
        ) : !state.active ? (
          <Notice icon={<ShieldCheck size={22} />} title={tr("Ative o monitoramento avançado primeiro")}
            text={tr("O controle das ventoinhas precisa do monitoramento avançado.")}
            action={<Button variant="primary" icon={<ShieldCheck size={14} />} onClick={openActivation}>{tr("Ativar o monitoramento avançado")}</Button>} />
        ) : !state.helperReady ? (
          <Notice icon={<Loader2 size={22} className="animate-spin" />} title={tr("O CleanCode está esperando a tarefa de administrador")}
            text={tr("Se este aviso continuar, ative o monitoramento avançado de novo.")}
            action={<Button icon={<ShieldCheck size={14} />} onClick={openActivation}>{tr("Ativar de novo")}</Button>} />
        ) : !controls.length ? (
          <Notice icon={<Info size={22} />} title={tr("Nenhuma ventoinha aceita controle neste PC")}
            text={tr("O chip de sensores desta placa-mãe não aceita comandos.")} />
        ) : (
          <>
            {state.preview && <Banner tone="warn" icon={<FlaskConical size={18} />} title={tr("Esta é uma prévia com ventoinhas simuladas")}
              text={tr("Nenhuma mudança chega às ventoinhas de verdade.")} />}
            {state.emergency && <Banner tone="danger" icon={<AlertTriangle size={18} />} title={tr("A proteção de temperatura está ativa")}
              text={tr("Uma peça chegou a 90 °C, então as ventoinhas ficam em 100% até a temperatura cair para 85 °C.")} />}

            {candidates.length > 0 && generic && <IdentifyCard onClick={() => setWizard(true)} />}
            <FanWizard open={wizard} onClose={() => setWizard(false)} candidates={candidates} live={ref} nameOf={(f) => fanName(f, draftRef.current[f.id])}
              onName={(id, patch) => change(id, patch)} />
            {/* as saídas sem ventoinha ligada ficam escondidas; o botão fica no canto direito, em cima dos cartões */}
            {hidden.length > 0 && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setShowEmpty((v) => !v)}>{showEmpty ? tr("Esconder as saídas vazias") : tr("Mostrar as saídas vazias")}</Button>
              </div>
            )}
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))' }}>
              {visible.map((f) => <FanTile key={f.id} fan={f} cfg={draft[f.id]} active={sel?.id === f.id} onClick={() => setSelected(f.id)} />)}
            </div>
            {showEmpty && hidden.length > 0 && <p className="-mt-2 text-[12px] text-muted">{tr("As saídas com 0 RPM estão sem ventoinha ligada.")}</p>}
            {sel && <SelectedGpu key={`foto-${sel.id}-${draft[sel.id]?.pump ? 'bomba' : 'fan'}`} fan={sel} cfg={draft[sel.id]} />}
            {sel && <Editor key={sel.id} fan={sel} cfg={draft[sel.id]} temps={state.temps} onChange={(p) => change(sel.id, p)} live={ref} />}
            <HowItWorks />
            <FanHelp general />
            <GpuCredit hw={controls.find((f) => f.kind === 'gpu')?.hw} />
            {/* só na prévia simulada: todas as placas com foto, girando, com um controle de RPM */}
          </>
        )}
      </div>
    </PageBody>
  );
}

// ---------- chamada do assistente "Identificar as ventoinhas" ----------
/** Cartão em destaque, quando alguma ventoinha ainda está com o nome genérico ("Fan #2"). */
function IdentifyCard({ onClick }: { onClick: () => void }) {
  const gid = useId().replace(/:/g, '');
  return (
    <button onClick={onClick} className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] p-4 text-left transition-all hover:border-[var(--accent)] hover:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
      style={{ background: `linear-gradient(110deg, color-mix(in srgb, var(--accent) 16%, var(--surface)) 0%, var(--surface) 55%, color-mix(in srgb, ${ACC2} 14%, var(--surface)) 100%)` }}>
      {/* brilho que atravessa o cartão quando o mouse passa por cima */}
      <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(from 0deg, var(--accent), ${ACC2}, var(--accent))` }}>
        <div className="flex h-[50px] w-[50px] items-center justify-center rounded-full bg-[var(--surface)]">
          <FanGlyph size={34} spin={1.6} gid={gid} />
        </div>
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[var(--on-accent)] shadow" style={{ background: `linear-gradient(135deg, var(--accent), ${ACC2})` }}><Wand2 size={11} /></span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">{tr("Descubra qual ventoinha é cada uma")}</div>
        <div className="mt-0.5 text-[12.5px] text-muted">{tr("O assistente acelera uma ventoinha por vez e pergunta onde ela fica.")}</div>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-[var(--on-accent)] shadow-sm transition-transform group-hover:scale-[1.03]" style={{ background: `linear-gradient(135deg, var(--accent), ${ACC2})` }}>
        <Wand2 size={14} />{tr("Identificar as ventoinhas")}
      </span>
    </button>
  );
}
/** Botão em destaque no topo, quando todas as ventoinhas já têm nome (para identificar de novo). */
function IdentifyButton({ onClick }: { onClick: () => void }) {
  const gid = useId().replace(/:/g, '');
  return (
    <button onClick={onClick} className="group relative flex items-center gap-2.5 overflow-hidden rounded-xl py-2 pl-2 pr-4 text-[13.5px] font-semibold text-[var(--on-accent)] transition-all hover:-translate-y-px hover:scale-[1.02]"
      style={{ background: `linear-gradient(135deg, var(--accent), ${ACC2})`, boxShadow: '0 8px 24px -6px color-mix(in srgb, var(--accent) 55%, transparent)' }}>
      <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent transition-all duration-700 group-hover:left-full" />
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)] shadow-inner"><FanGlyph size={24} spin={1.6} gid={gid} /></span>
      {tr("Identificar as ventoinhas")}
    </button>
  );
}

// ---------- topo: degradê, ícone grande e resumo ----------
function Hero({ state, draft, ready, onIdentify }: { state: FanState | null; draft: Record<string, FanConfig>; ready: boolean; onIdentify?: () => void }) {
  const cpu = state?.temps.find((t) => t.kind === 'cpu' && /package|tctl/i.test(t.name)) || state?.temps.find((t) => t.kind === 'cpu');
  const gpu = state?.temps.find((t) => t.kind === 'gpu' && t.name === 'GPU Core') || state?.temps.find((t) => t.kind === 'gpu');
  const controls = state?.controls || [];
  const managed = controls.filter((c) => !c.locked && (draft[c.id]?.mode || 'auto') !== 'auto').length;
  // conta só as saídas com ventoinha ligada (ou já controladas), e não as saídas vazias da placa-mãe
  const connected = controls.filter((c) => !c.locked).filter((c) => (c.rpm || 0) > 0 || c.kind !== 'board' || (draft[c.id]?.mode || 'auto') !== 'auto').length;
  const spinning = controls.filter((c) => (c.rpm || 0) > 0);
  const avgPct = spinning.length ? spinning.reduce((a, c) => a + (c.pct || 0), 0) / spinning.length : 0;
  const maxRpm = spinning.reduce((a, c) => Math.max(a, c.rpm || 0), 0);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--line)] p-5"
      style={{ background: `radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 24%, transparent) 0%, transparent 55%), radial-gradient(90% 120% at 100% 100%, color-mix(in srgb, ${ACC2} 18%, transparent) 0%, transparent 60%), var(--surface)` }}>
      <div className="flex flex-wrap items-center gap-5">
        <FanDial size={92} pct={avgPct} rpm={maxRpm} />
        <div className="min-w-[240px] flex-1">
          <h1 className="text-[22px] font-semibold tracking-tight">{tr("Ventoinhas")}</h1>
          <p className="mt-0.5 max-w-[620px] text-[13px] text-muted">{tr("Escolha a velocidade de cada ventoinha.")}</p>
          {ready && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {onIdentify && <IdentifyButton onClick={onIdentify} />}
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--accent)]">
                <ShieldCheck size={13} />{tr("A proteção de 90 °C está ligada")}
              </div>
            </div>
          )}
        </div>
        {ready && (
          <div className="grid grid-cols-3 gap-2">
            <HeroStat icon={<Cpu size={14} />} label={tr("Processador")} value={cpu ? `${fmt(cpu.value)} °C` : '—'} />
            <HeroStat icon={<Gpu size={14} />} label={tr("Placa de vídeo")} value={gpu ? `${fmt(gpu.value)} °C` : '—'} />
            <HeroStat icon={<Thermometer size={14} />} label={tr("No controle do CleanCode")} value={tr("{0} de {1}", managed, connected)} />
          </div>
        )}
      </div>
    </div>
  );
}
function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-[118px] rounded-xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-3 py-2 backdrop-blur-md">
      <div className="flex items-center gap-1.5 text-[11px] text-muted">{icon}{label}</div>
      <div className="mt-0.5 text-[18px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Notice({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="shrink-0 text-[var(--accent)]">{icon}</div>
      <div className="min-w-[260px] flex-1 text-[13px]"><div className="font-semibold">{title}</div><div className="mt-0.5 text-muted">{text}</div></div>
      {action}
    </div>
  );
}
function Banner({ tone, icon, title, text }: { tone: 'warn' | 'danger'; icon: React.ReactNode; title: string; text: string }) {
  const col = tone === 'danger' ? 'var(--danger)' : 'var(--warn)';
  return (
    <div className="flex items-start gap-3 rounded-xl border p-3.5 text-[13px]" style={{ borderColor: `color-mix(in srgb, ${col} 45%, transparent)`, background: `linear-gradient(90deg, color-mix(in srgb, ${col} 14%, transparent), transparent)` }}>
      <div className="mt-0.5 shrink-0" style={{ color: col }}>{icon}</div>
      <div><div className="font-semibold">{title}</div><div className="text-muted">{text}</div></div>
    </div>
  );
}

// ---------- estado de cada ventoinha (texto e cor) ----------
export function fanStatus(fan: FanControlInfo, mode: Mode): { tone: 'ok' | 'warn' | 'danger' | 'idle'; short: string; long: string } {
  const st = fan.status;
  if (fan.locked) return { tone: 'ok', short: tr("Em breve"), long: tr("Por enquanto, o CleanCode só mostra a velocidade desta ventoinha.") };
  if (mode === 'auto') return { tone: 'idle', short: tr("Automático"), long: tr("A placa decide a velocidade desta ventoinha, pelo perfil do BIOS.") };
  if (!st) return { tone: 'ok', short: tr("Aplicando"), long: tr("O CleanCode está aplicando a configuração.") };
  if (st.error === 'refused') return { tone: 'warn', short: tr("A placa recusou"), long: tr("A placa não obedeceu, então a ventoinha voltou ao modo automático.") };
  if (st.error === 'norpm') return { tone: 'warn', short: tr("Não responde"), long: tr("O RPM não mudou, então a ventoinha voltou ao modo automático. Veja abaixo como resolver.") };
  if (st.error === 'notfound') return { tone: 'warn', short: tr("Não encontrada"), long: tr("A tarefa de administrador não encontrou esta ventoinha.") };
  if (st.error === 'nosource') return { tone: 'warn', short: tr("Sem temperatura"), long: tr("A temperatura escolhida está sem leitura agora. Por isso, a ventoinha ficou no modo automático.") };
  if (st.error) return { tone: 'warn', short: tr("Erro"), long: tr("A placa recusou o comando: {0}", st.error.replace(/^error:\s*/, '')) };
  if (st.mode === 'emergency') return { tone: 'danger', short: tr("Proteção"), long: tr("A proteção de temperatura colocou esta ventoinha em 100%.") };
  const long = typeof st.read === 'number' ? tr("O CleanCode está aplicando {0}%, e a placa informa {1}%.", fmt(st.pct), fmt(st.read)) : tr("O CleanCode está aplicando {0}%.", fmt(st.pct));
  return { tone: 'ok', short: `${fmt(st.pct)}%`, long };
}
export const TONE: Record<string, string> = { ok: 'var(--accent)', warn: 'var(--warn)', danger: 'var(--danger)', idle: 'var(--faint)' };
export const MODE_LABEL: Record<Mode, string> = { auto: tr("Automático"), fixed: tr("Velocidade fixa"), curve: tr("Curva") };

// ---------- desenho do modo no canto do cartão ----------
// Robô para o modo automático, uma linha reta para a velocidade fixa e uma linha ondulada para a curva. Os desenhos se
// movem devagar: na linha reta, as bolinhas andam sobre a linha; na curva, a onda anda para o lado com as bolinhas nos
// picos e nos vales. A onda só desliza, sem mudar de forma, e as duas linhas têm a mesma espessura. As pontas somem num
// degradê, para as bolinhas entrarem e saírem da linha sem cortes. O nome do modo aparece ao passar o mouse.
export function ModeIcon({ mode, color }: { mode: Mode; color: string }) {
  const id = useId().replace(/:/g, '');
  const label = MODE_LABEL[mode];
  if (mode === 'auto') return <span title={label} aria-label={label} className="flex h-4 items-center" style={{ color }}><Bot size={16} strokeWidth={1.9} /></span>;
  const W = 30, H = 14, mid = H / 2, x0 = 2, x1 = W - 2;
  // período do movimento: a distância entre duas bolinhas iguais. Ao andar um período, o desenho fica igual ao do começo
  // e a animação recomeça sem salto.
  let period: number, line: string, dots: [number, number][];
  if (mode === 'curve') {
    // 4 ondulações (dois picos e dois vales) dentro da largura. Cada ondulação é um meio círculo, então os picos e os
    // vales têm um raio redondo, sem ponta. A onda é desenhada um período a mais para a esquerda, para deslizar.
    const half = (x1 - x0) / 4, R = half / 2;
    period = half * 2;
    let d = `M${x0 - period} ${mid}`;
    dots = [];
    for (let k = -2; k < 4; k++) {
      const up = k % 2 === 0; // par: pico (meio círculo para cima); ímpar: vale
      d += ` A${R} ${R} 0 0 ${up ? 1 : 0} ${x0 + half * (k + 1)} ${mid}`;
      dots.push([x0 + half * (k + 0.5), up ? mid - R : mid + R]);
    }
    line = d;
  } else {
    period = (x1 - x0) / 2;
    line = `M${x0} ${mid} L${x1} ${mid}`;
    dots = [-1, 0, 1, 2].map((k) => [x0 + period * k, mid]);
  }
  const move = { animation: 'mode-slide 1.8s linear infinite', ['--d' as any]: `${period}px` } as React.CSSProperties;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="mode-icon shrink-0" style={{ color }}>
      <title>{label}</title>
      <defs>
        <linearGradient id={`f${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.14" stopColor="#fff" /><stop offset="0.86" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}><rect x="0" y="0" width={W} height={H} fill={`url(#f${id})`} /></mask>
      </defs>
      <g mask={`url(#m${id})`}>
        {mode === 'curve'
          ? <g style={move}><path d={line} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />{dots.map(([x, yy], i) => <circle key={i} cx={x} cy={yy} r={1.9} fill="currentColor" />)}</g>
          : <><path d={line} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" /><g style={move}>{dots.map(([x, yy], i) => <circle key={i} cx={x} cy={yy} r={1.9} fill="currentColor" />)}</g></>}
      </g>
    </svg>
  );
}
/** Etiqueta do cartão: o desenho do modo, ou um texto quando a ventoinha tem um aviso (erro, proteção ou "Em breve"). */
function TileBadge({ fan, mode, s }: { fan: FanControlInfo; mode: Mode; s: ReturnType<typeof fanStatus> }) {
  // "Aplicando" não vira texto no cartão: o estado da ventoinha chega vazio por um instante em várias leituras, e o
  // texto ficava aparecendo e sumindo. Nesse caso, o cartão continua mostrando o desenho do modo.
  const text = fan.locked || s.tone === 'warn' || s.tone === 'danger';
  if (text) return <span title={s.long} className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: TONE[s.tone], background: `color-mix(in srgb, ${TONE[s.tone]} 14%, transparent)` }}>{s.short}</span>;
  return <ModeIcon mode={mode} color={mode === 'auto' ? 'var(--muted)' : 'var(--accent)'} />;
}

// ---------- cartão pequeno de uma ventoinha ----------
function FanTile({ fan, cfg, active, onClick }: { fan: FanControlInfo; cfg?: FanConfig; active: boolean; onClick: () => void }) {
  const mode = fan.locked ? 'auto' : cfg?.mode || 'auto';
  const s = fanStatus(fan, mode);
  const card = useGpuCard(fan.kind === 'gpu' ? fan.hw : undefined);
  if (card) {
    // placa de vídeo com foto: a placa em 3D no lado esquerdo, sumindo num degradê antes do nome e do RPM
    const fill = active ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)';
    return (
      <button onClick={onClick} className={cx('group relative min-h-[84px] overflow-hidden rounded-xl border text-left transition-all duration-200', active ? 'border-[color-mix(in_srgb,var(--accent)_60%,transparent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)]' : 'border-[var(--line)] hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--line))]')}
        style={{ background: fill }}>
        <GpuTileArt card={card} rpm={fan.rpm} />
        <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(90deg, transparent 0%, transparent 34%, color-mix(in srgb, ${fill} 88%, transparent) 50%, ${fill} 60%)` }} />
        <div className="absolute bottom-2 left-[44%] right-2.5 top-2 flex flex-col">
          <div className="flex items-start gap-1.5">
            <span className="min-w-0 flex-1 break-words text-[12.5px] font-semibold leading-tight">{fanName(fan, cfg)}</span>
            <TileBadge fan={fan} mode={mode} s={s} />
          </div>
          <div className="text-[10.5px] text-muted">{cfg?.label ? fan.name : kindLabel(fan.kind)}</div>
          <div className="mt-auto flex items-baseline gap-1.5">
            <span className="text-[17px] font-semibold tabular-nums leading-none">{fmt(fan.rpm)}</span>
            <span className="text-[10.5px] text-muted">RPM</span>
            <span className="ml-auto text-[11px] tabular-nums text-muted">{fmt(fan.pct)}%</span>
          </div>
        </div>
      </button>
    );
  }
  return (
    <button onClick={onClick} className={cx('group relative flex items-center gap-3 overflow-hidden rounded-xl border p-3 text-left transition-all duration-200', active ? 'border-[color-mix(in_srgb,var(--accent)_60%,transparent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)]' : 'border-[var(--line)] hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--line))]')}
      style={{ background: active ? `linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--surface)), var(--surface) 70%)` : 'var(--surface)' }}>
      {fan.kind === 'gpu' ? <FanDial size={54} pct={fan.pct} rpm={fan.rpm} tone={s.tone === 'warn' ? 'warn' : s.tone === 'danger' ? 'danger' : 'ok'} dim={!fan.rpm} /> : cfg?.pump ? <PumpArt compact rpm={fan.rpm} size={56} /> : <FanSpinner rpm={fan.rpm} size={56} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {cfg?.pump && <Droplets size={12} className="shrink-0 text-[var(--accent)]" />}
          <span className="break-words text-[13px] font-semibold leading-tight">{fanName(fan, cfg)}</span>
        </div>
        <div className="text-[11px] text-muted">{cfg?.label ? fan.name : kindLabel(fan.kind)}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[17px] font-semibold tabular-nums leading-none">{fmt(fan.rpm)}</span>
          <span className="text-[10.5px] text-muted">RPM</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 self-start">
        <TileBadge fan={fan} mode={mode} s={s} />
        <span className="text-[11px] tabular-nums text-muted">{fmt(fan.pct)}%</span>
      </div>
    </button>
  );
}

// crédito das fotos das placas de vídeo e aviso de marcas (só aparece quando a tela mostra uma dessas fotos)
function GpuCredit({ hw }: { hw?: string }) {
  const card = useGpuCard(hw);
  if (!card) return null;
  return <p className="text-[11.5px] text-faint">{tr("A TechPowerUp cedeu as fotos das placas de vídeo. AMD, Radeon, NVIDIA, GeForce, Intel e Arc são marcas das empresas donas delas.")}</p>;
}

// ventoinha escolhida: a foto da placa de vídeo, ou três ventoinhas unidas (nas outras saídas), soltas acima do painel
function SelectedGpu({ fan, cfg }: { fan: FanControlInfo; cfg?: FanConfig }) {
  const card = useGpuCard(fan.kind === 'gpu' ? fan.hw : undefined);
  if (card) return <div className="rise-in"><GpuHero card={card} rpm={fan.rpm} height={300} /></div>;
  if (fan.kind === 'gpu') return null;
  // saída marcada como bomba do water cooler: a bomba em 3D; nas outras, as três ventoinhas unidas
  return <div className="rise-in">{cfg?.pump ? <PumpArt rpm={fan.rpm} height={300} /> : <FanTrioHero rpm={fan.rpm} height={300} />}</div>;
}

// ---------- painel de edição da ventoinha escolhida ----------
type TestStep = { phase: 'low' | 'high' | 'done'; lowPct: number; low?: number; high?: number };
function Editor({ fan, cfg, temps, onChange, live }: { fan: FanControlInfo; cfg?: FanConfig; temps: FanTempSource[]; onChange: (p: Partial<FanConfig>) => void; live: React.MutableRefObject<FanState | null> }) {
  const locked = !!fan.locked;
  const mode = locked ? 'auto' : cfg?.mode || 'auto';
  const pump = !!cfg?.pump;
  const floor = pump ? PUMP_MIN : 0;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cfg?.label || '');
  const [test, setTest] = useState<TestStep | null>(null);
  const testing = !!test && test.phase !== 'done';
  const source = cfg?.source && temps.some((t) => t.id === cfg.source) ? cfg.source : defaultSource(fan, temps);
  const points: Points = (cfg?.points?.length ? cfg.points : PRESETS[1].points).map(([t, p]) => [t, Math.max(floor, p)]) as Points;
  const temp = temps.find((t) => t.id === source)?.value;
  const s = fanStatus(fan, mode);
  const value = Math.max(floor, cfg?.value ?? Math.round(fan.pct ?? 50));
  const gpuCard = useGpuCard(fan.kind === 'gpu' ? fan.hw : undefined);
  // com arte em cima (a foto da placa de vídeo ou as ventoinhas desenhadas), o cabeçalho sobe para dentro dela
  const card = !!gpuCard || fan.kind !== 'gpu';

  const setMode = (m: Mode) => {
    if (m === 'fixed') onChange({ mode: m, value });
    else if (m === 'curve') onChange({ mode: m, source, points });
    else onChange({ mode: m });
  };
  const runTest = async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const read = () => live.current?.controls.find((c) => c.id === fan.id)?.rpm;
    const lowPct = pump ? PUMP_MIN : 30;
    try {
      setTest({ phase: 'low', lowPct }); await cc.fanTest(fan.id, lowPct); await wait(8000); const low = read();
      setTest({ phase: 'high', lowPct, low }); await cc.fanTest(fan.id, 100); await wait(8000); const high = read();
      setTest({ phase: 'done', lowPct, low, high });
    } finally { await cc.fanTest(fan.id, null); }
  };

  return (
    // os controles ficam soltos na página, sem caixa em volta, logo abaixo da placa. Com a foto da placa de vídeo, o
    // cabeçalho sobe para dentro do degradê da foto e fica no centro
    <div className={cx('relative', card && 'z-10 -mt-16 min-[1500px]:-mt-[300px]')}>
      <div className="rise-stagger py-1">
        {/* cabeçalho: anel grande, nome, peça, RPM e ações */}
        <div className={cx('flex flex-wrap items-center gap-4', card && 'flex-col justify-center text-center min-[1500px]:min-h-[300px] min-[1500px]:!items-start min-[1500px]:pl-[50%] min-[1500px]:text-left')}>
          {!card && <FanDial size={76} pct={fan.pct} rpm={fan.rpm} tone={s.tone === 'warn' ? 'warn' : s.tone === 'danger' ? 'danger' : 'ok'} dim={!fan.rpm} />}
          <div className={cx('min-w-[220px]', card ? 'flex-none' : 'flex-1')}>
            {editing ? (
              <form className={cx('flex items-center gap-1.5', card && 'justify-center min-[1500px]:justify-start')} onSubmit={(e) => { e.preventDefault(); onChange({ label: name.trim() || undefined }); setEditing(false); }}>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={fan.name} className="h-8 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 text-[14px] outline-none focus:border-[var(--accent)]" />
                <Button size="sm" type="submit" icon={<Check size={13} />}>{tr("Salvar")}</Button>
              </form>
            ) : (
              <div className={cx('flex items-center gap-1.5', card && 'justify-center min-[1500px]:justify-start')}>
                {/* com arte atrás: sombra escura no tema escuro e brilho branco suave no claro, para o nome se destacar da imagem */}
                <span className={cx('font-semibold text-[var(--accent)]', card ? 'text-[26px] leading-tight [text-shadow:0_1px_10px_rgba(255,255,255,.85)] dark:[text-shadow:0_2px_12px_rgba(0,0,0,.85)]' : 'text-[17px]')}>{fanName(fan, cfg)}</span>
                <button title={tr("Dar um nome para esta ventoinha")} onClick={() => { setName(cfg?.label || ''); setEditing(true); }} className="rounded p-1 text-faint hover:bg-[var(--hover)] hover:text-[var(--fg)]"><Pencil size={13} /></button>
              </div>
            )}
            <div className="text-[12px] text-muted">{fanSub(fan, cfg)}</div>
            <div className={cx('mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]', card && 'justify-center min-[1500px]:justify-start')}>
              <span><span className="text-[20px] font-semibold tabular-nums">{fmt(fan.rpm)}</span> <span className="text-muted">RPM</span></span>
              <span className="text-muted">{tr("{0}% da velocidade", fmt(fan.pct))}</span>
            </div>
          </div>
          {!locked && <div className="flex flex-wrap items-center gap-2">
            {fan.kind === 'board' && (
              <button onClick={() => onChange(pump ? { pump: false } : { pump: true, value: Math.max(PUMP_MIN, value), points: points.map(([t, p]) => [t, Math.max(PUMP_MIN, p)]) as Points })} title={tr("Marque esta opção se a saída for a bomba do water cooler. Assim, o CleanCode nunca deixa a velocidade abaixo de {0}%.", PUMP_MIN)}
                className={cx('flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium transition-colors', pump ? 'border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]' : 'border-[var(--line)] text-muted hover:bg-[var(--hover)] hover:text-[var(--fg)]')}>
                <Droplets size={14} />{tr("Bomba do water cooler")}
              </button>
            )}
            <Button variant="outline" icon={testing ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />} disabled={testing} onClick={runTest}>{tr("Testar")}</Button>
          </div>}
        </div>

        {locked ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--line)] p-4 text-[13px]" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${ACC2} 12%, var(--surface)), var(--surface) 70%)` }}>
            <Sparkles size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold">{tr("Controle da placa de vídeo")}<span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-[var(--on-accent)]" style={{ background: `linear-gradient(135deg, var(--accent), ${ACC2})` }}>{tr("Em breve")}</span></div>
              <div className="text-muted">{tr("O CleanCode ainda não controla a ventoinha desta placa de vídeo.")}</div>
              <div className="text-muted">{tr("Até lá, use o programa da fabricante da placa.")}</div>
            </div>
          </div>
        ) : (<>
        {/* controles: as abas de modo em cima e, separado delas, o bloco com o status e o controle do modo escolhido.
            O conjunto ocupa a largura de três cartões da grade de cima */}
        {/* com arte em cima, na tela larga, o bloco sobe até ficar a 80 pixels dos botões ao lado da imagem */}
        <div className={cx('mt-4 grid gap-2.5', card && 'min-[1500px]:-mt-1')} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))' }}>
        <div className="col-span-3 min-w-0">
        <div className="flex w-fit gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1">
          {(['auto', 'fixed', 'curve'] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cx('rounded-lg px-4 py-1.5 text-[12.5px] font-semibold transition-all', mode === m ? 'text-[var(--on-accent)] shadow-sm' : 'text-muted hover:text-[var(--fg)]')}
              style={mode === m ? { background: `linear-gradient(135deg, var(--accent), ${ACC2})` } : undefined}>{MODE_LABEL[m]}</button>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex items-start gap-2 text-[12.5px]" style={{ color: s.tone === 'idle' ? undefined : TONE[s.tone] }}>
          <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: TONE[s.tone] }} />
          <span className={s.tone === 'idle' || s.tone === 'ok' ? 'text-muted' : ''}>{s.long}</span>
        </div>
        {!locked && (fan.status?.error === 'norpm' || fan.status?.error === 'refused') && <div className="mt-2"><FanHelp defaultOpen compact /></div>}
        {pump && <div className="mt-1 text-[12px] text-muted">{tr("Como bomba do water cooler, esta saída nunca fica abaixo de {0}%.", PUMP_MIN)}</div>}
        {/* placa AMD: o 0% liga o Zero RPM do driver */}
        {fan.id.startsWith("/gpu-amd/") && mode !== "auto" && <div className="mt-1 text-[12px] text-muted">{tr("Em 0%, a ventoinha para enquanto a placa está fria e volta a girar quando ela esquenta (Zero RPM).")}</div>}

        {mode === 'fixed' && (
          <div className="mt-4">
            <GradientSlider value={value} min={floor} onChange={(v) => onChange({ value: v })} />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {[30, 50, 75, 100].filter((v) => v >= floor).map((v) => (
                <button key={v} onClick={() => onChange({ value: v })} className={cx('rounded-full border px-3 py-1 text-[12px] font-medium tabular-nums transition-colors', value === v ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--line)] text-muted hover:text-[var(--fg)]')}>{v}%</button>
              ))}
              {value < 30 && <span className="text-[12px] text-[var(--warn)]">{tr("Abaixo de 30%, algumas ventoinhas param de girar. A proteção de temperatura continua ligada.")}</span>}
            </div>
          </div>
        )}

        {mode === 'curve' && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-[12.5px] text-muted">{tr("Temperatura que guia a curva")}</span>
              <Select className="min-w-[260px] flex-1" value={source || ''} onChange={(v) => onChange({ source: v })} options={temps.map((t) => ({ value: t.id, label: `${t.name}, ${t.hw}: ${fmt(t.value)} °C` }))} />
            </div>
            <CurveEditor points={points} temp={temp} floor={floor} onChange={(pts) => onChange({ points: pts, source })} />
            {/* embaixo do gráfico: os modelos, a leitura de agora e a dica */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[12px] text-muted">{tr("Começar de um modelo")}</span>
                {PRESETS.map((p) => <button key={p.id} onClick={() => onChange({ points: p.points.map(([t, v]) => [t, Math.max(floor, v)]) as Points, source })} className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[12px] font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]">{p.label}</button>)}
              </div>
              <div className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-[12px] text-muted">
                {temp !== undefined ? tr("Agora: {0} °C. A curva pede {1}%.", fmt(temp), fmt(Math.max(floor, interp(points, temp)))) : tr("A temperatura escolhida está sem leitura agora.")}
              </div>
            </div>
            <div className="text-[11.5px] text-muted">{tr("Arraste os pontos. Clique duas vezes para criar um ponto e use o botão direito para apagar.")}</div>
          </div>
        )}
        </div>
        </div>
        </div>
        </>)}

        {test && (
          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[12.5px]">
            {test.phase === 'low' ? tr("Teste em andamento: a ventoinha está em {0}% por 8 segundos.", test.lowPct)
              : test.phase === 'high' ? tr("Teste em andamento: a ventoinha está em 100% por 8 segundos.")
              : testResult(test.lowPct, test.low, test.high)}
          </div>
        )}
      </div>
    </div>
  );
}
function testResult(lowPct: number, low?: number, high?: number) {
  if (low === undefined || high === undefined) return tr("Esta saída não informa o RPM, então o teste não consegue conferir a ventoinha.");
  if (!low && !high) return tr("A ventoinha não girou no teste. Talvez não exista uma ventoinha nesta saída.");
  if (high - low > Math.max(150, high * 0.15)) return tr("A ventoinha obedeceu: {0} RPM em {1}% e {2} RPM em 100%.", fmt(low), lowPct, fmt(high));
  return tr("O RPM quase não mudou: {0} RPM em {1}% e {2} RPM em 100%.", fmt(low), lowPct, fmt(high));
}

// ---------- controle deslizante com degradê (o campo nativo fica por cima, invisível, para o teclado e o leitor de tela) ----------
function GradientSlider({ value, min, onChange }: { value: number; min: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-7 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--line)]" />
        <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ width: `${value}%`, background: `linear-gradient(90deg, ${ACC2}, var(--accent))`, boxShadow: '0 0 14px color-mix(in srgb, var(--accent) 45%, transparent)' }} />
        <div className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[var(--accent)] bg-[var(--surface)] shadow" style={{ left: `${value}%` }} />
        <input type="range" min={0} max={100} step={1} value={value} onChange={(e) => onChange(Math.max(min, Number(e.target.value)))} aria-label={tr("Velocidade fixa")} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </div>
      <span className="w-14 text-right text-[17px] font-semibold tabular-nums">{fmt(value)}%</span>
    </div>
  );
}

// ---------- editor da curva (temperatura no eixo horizontal, velocidade no vertical) ----------
// proporção larga e baixa: o gráfico ocupa a largura de três cartões sem ficar alto
const W = 900, H = 230, PL = 36, PR = 24, PT = 14, PB = 26;
const sx = (t: number) => PL + ((t - T_MIN) / (T_MAX - T_MIN)) * (W - PL - PR);
const sy = (p: number) => PT + (1 - p / 100) * (H - PT - PB);
function CurveEditor({ points, temp, floor, onChange }: { points: Points; temp?: number; floor: number; onChange: (p: Points) => void }) {
  const gid = useId().replace(/:/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const [local, setLocalState] = useState<Points>(points);
  // a última posição fica também numa referência: o fim do arrasto pode chegar antes de a tela redesenhar o último movimento
  const localRef = useRef<Points>(points);
  const setLocal = (f: (p: Points) => Points) => { localRef.current = f(localRef.current); setLocalState(localRef.current); };
  const drag = useRef<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { if (drag.current === null) { localRef.current = points; setLocalState(points); } }, [points]);
  const toData = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    return [T_MIN + ((x - PL) / (W - PL - PR)) * (T_MAX - T_MIN), (1 - (y - PT) / (H - PT - PB)) * 100];
  };
  const move = (e: React.PointerEvent) => {
    const i = drag.current; if (i === null || !svg.current) return;
    const [tx, py] = toData(e); const cur = localRef.current;
    const lo = i > 0 ? cur[i - 1][0] + 1 : T_MIN, hi = i < cur.length - 1 ? cur[i + 1][0] - 1 : T_MAX;
    const t = Math.round(Math.max(lo, Math.min(hi, tx))), p = Math.round(Math.max(floor, Math.min(100, py)));
    setLocal((pts) => pts.map((q, k) => (k === i ? [t, p] : q)) as Points);
  };
  const end = () => { if (drag.current !== null) { drag.current = null; onChange(localRef.current); } };
  const add = (e: React.MouseEvent) => {
    if (!svg.current || localRef.current.length >= 8) return;
    const [tx, py] = toData(e); const t = Math.round(Math.max(T_MIN, Math.min(T_MAX, tx)));
    if (localRef.current.some(([q]) => Math.abs(q - t) < 2)) return;
    const next = [...localRef.current, [t, Math.round(Math.max(floor, Math.min(100, py)))] as [number, number]].sort((a, b) => a[0] - b[0]) as Points;
    localRef.current = next; setLocalState(next); onChange(next);
  };
  const remove = (i: number) => {
    if (localRef.current.length <= 2) return;
    const next = localRef.current.filter((_, k) => k !== i) as Points;
    localRef.current = next; setLocalState(next); onChange(next);
  };
  const line = useMemo(() => {
    const pts = [[T_MIN, local[0][1]] as [number, number], ...local, [T_MAX, local[local.length - 1][1]] as [number, number]];
    return pts.map(([t, p], k) => `${k ? 'L' : 'M'}${sx(t).toFixed(1)},${sy(p).toFixed(1)}`).join(' ');
  }, [local]);
  const area = `${line} L${sx(T_MAX)},${sy(0)} L${sx(T_MIN)},${sy(0)} Z`;
  const now = temp !== undefined ? Math.max(T_MIN, Math.min(T_MAX, temp)) : undefined;
  return (
    <div className="rounded-xl border border-[var(--line)] p-2" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 5%, var(--surface)), var(--surface))' }}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" onPointerMove={move} onPointerUp={end} onPointerLeave={end} onDoubleClick={add} role="img" aria-label={tr("Curva de velocidade pela temperatura")}>
        <defs>
          <linearGradient id={`${gid}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".38" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient>
          <linearGradient id={`${gid}-line`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={ACC2} /><stop offset="1" stopColor="var(--accent)" /></linearGradient>
          <linearGradient id={`${gid}-hot`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="var(--danger)" stopOpacity="0" /><stop offset="1" stopColor="var(--danger)" stopOpacity=".14" /></linearGradient>
        </defs>
        {/* faixa quente: a partir de 80 °C, e a linha da proteção em 90 °C */}
        <rect x={sx(80)} y={PT} width={sx(T_MAX) - sx(80)} height={H - PT - PB} fill={`url(#${gid}-hot)`} />
        <line x1={sx(90)} x2={sx(90)} y1={PT} y2={H - PB} stroke="var(--danger)" strokeOpacity=".5" strokeDasharray="2 4" />
        <text x={sx(90) - 4} y={H - PB - 6} textAnchor="end" fontSize="9.5" fill="var(--danger)" fillOpacity=".8">{tr("proteção")}</text>
        {floor > 0 && <rect x={PL} y={sy(floor)} width={W - PL - PR} height={sy(0) - sy(floor)} fill="var(--line)" opacity=".35" />}
        {[0, 25, 50, 75, 100].map((p) => <g key={p}><line x1={PL} x2={W - PR} y1={sy(p)} y2={sy(p)} stroke="var(--line)" strokeOpacity=".7" /><text x={PL - 6} y={sy(p) + 3.5} textAnchor="end" fontSize="10" fill="var(--faint)">{p}%</text></g>)}
        {[20, 30, 40, 50, 60, 70, 80, 90, 100].map((t) => <text key={t} x={sx(t)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--faint)">{t}°</text>)}
        <path d={area} fill={`url(#${gid}-area)`} />
        <path d={line} fill="none" stroke={`url(#${gid}-line)`} strokeWidth={2.6} strokeLinejoin="round" />
        {now !== undefined && (
          <g>
            <line x1={sx(now)} x2={sx(now)} y1={PT} y2={H - PB} stroke="var(--fg)" strokeOpacity={0.45} strokeDasharray="3 3" />
            <circle cx={sx(now)} cy={sy(Math.max(floor, interp(local, now)))} r={5} fill="var(--fg)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
        {local.map(([t, p], i) => (
          <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover((h) => (h === i ? null : h))}>
            <circle cx={sx(t)} cy={sy(p)} r={13} fill="var(--accent)" opacity={hover === i ? 0.18 : 0} />
            <circle cx={sx(t)} cy={sy(p)} r={6.5} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2.6} className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => { drag.current = i; try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* sem captura: o arrasto continua pela área do gráfico */ } }}
              onContextMenu={(e) => { e.preventDefault(); remove(i); }} />
            {/* o valor fica sempre dentro do gráfico: abaixo do ponto quando ele está perto do topo, e alinhado para dentro perto das bordas */}
            {hover === i && <text x={sx(t)} y={sy(p) < 34 ? sy(p) + 26 : sy(p) - 14} textAnchor={sx(t) > W - PR - 50 ? "end" : sx(t) < PL + 50 ? "start" : "middle"} fontSize="10.5" fontWeight={600} fill="var(--fg)">{tr("{0} °C: {1}%", t, p)}</text>}
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-end gap-1.5 px-1 pb-0.5">
        <Button size="sm" variant="ghost" icon={<Plus size={13} />} disabled={local.length >= 8} onClick={() => {
          // novo ponto no meio do maior intervalo entre dois pontos
          const pts = localRef.current; let best = 0;
          for (let i = 1; i < pts.length - 1; i++) if (pts[i + 1][0] - pts[i][0] > pts[best + 1][0] - pts[best][0]) best = i;
          const a = pts[best], b = pts[best + 1]; if (!b || b[0] - a[0] < 3) return;
          const t = Math.round((a[0] + b[0]) / 2), next = [...pts.slice(0, best + 1), [t, Math.round((a[1] + b[1]) / 2)] as [number, number], ...pts.slice(best + 1)] as Points;
          localRef.current = next; setLocalState(next); onChange(next);
        }}>{tr("Adicionar ponto")}</Button>
        <Button size="sm" variant="ghost" icon={<Minus size={13} />} disabled={local.length <= 2} onClick={() => remove(hover ?? local.length - 2)}>{tr("Remover ponto")}</Button>
      </div>
    </div>
  );
}

function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px]">
      <button className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold" onClick={() => setOpen((v) => !v)}>
        <Info size={15} className="text-[var(--accent)]" />{tr("Como o controle funciona")}
        <ChevronDown size={15} className={cx('ml-auto text-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="list-disc space-y-1 px-4 pb-3 pl-9 text-muted">
          <li>{tr("O CleanCode só muda as ventoinhas que saem do modo Automático.")}</li>
          <li>{tr("Se a placa não obedecer, a ventoinha volta ao modo automático.")}</li>
          <li>{tr("A 90 °C, o CleanCode coloca as ventoinhas em 100% até a temperatura cair para 85 °C.")}</li>
          <li>{tr("Quando você fecha o CleanCode, as ventoinhas voltam ao modo automático.")}</li>
          <li>{tr("Se o programa dos sensores fechar de repente, uma ventoinha pode ficar na última velocidade até você reiniciar o Windows.")}</li>
          <li>{tr("Para desfazer uma mudança, escolha Automático na ventoinha.")}</li>
        </ul>
      )}
    </div>
  );
}
