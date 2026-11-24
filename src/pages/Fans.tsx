// Ventoinhas (Windows): velocidade fixa ou curva pela temperatura para cada ventoinha que aceita controle.
// Quem aplica é a tarefa de administrador do monitoramento avançado (helper cc-lhm). O app só grava o pedido e renova
// a cada 3 segundos (ver electron/platform/win32/fans.ts). Proteções: 100% a partir de 90 °C, modo automático quando o
// app fecha ou para de renovar o pedido.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Fan, ShieldCheck, AlertTriangle, Loader2, FlaskConical, Pencil, Check, Info } from 'lucide-react';
import { cc, FanConfig, FanControlInfo, FanState, FanTempSource } from '../lib/api';
import { useApp } from '../lib/store';
import { PageBody } from './common';
import { Button, Segmented, Select, cx } from '../components/ui';
import { OPEN_ADVANCED } from '../components/AdvancedSetupModal';
import { t as tr, LOCALE } from '../lib/i18n';

type Points = [number, number][];
const PRESETS: { id: string; label: string; points: Points }[] = [
  { id: 'quiet', label: tr("Silenciosa"), points: [[30, 20], [50, 30], [70, 55], [85, 100]] },
  { id: 'balanced', label: tr("Equilibrada"), points: [[30, 30], [50, 45], [70, 70], [85, 100]] },
  { id: 'performance', label: tr("Desempenho"), points: [[30, 45], [50, 60], [65, 85], [80, 100]] },
];
const T_MIN = 20, T_MAX = 100;
const fmt = (v: number | undefined, d = 0) => (v === undefined || v === null || isNaN(v) ? '—' : v.toLocaleString(LOCALE, { maximumFractionDigits: d }));
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

export default function FansPage() {
  const { page, go, settings, setSettings } = useApp();
  const { state, ref } = useFans(page === 'fans');
  const [draft, setDraft] = useState<Record<string, FanConfig>>(() => settings?.fans || {});
  const draftRef = useRef(draft);
  const [showEmpty, setShowEmpty] = useState(false);
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
  const groups = [
    { kind: 'board', title: tr("Placa-mãe") },
    { kind: 'gpu', title: tr("Placa de vídeo") },
    { kind: 'cooler', title: tr("Refrigeração") },
    { kind: 'other', title: tr("Outras ventoinhas") },
  ].map((g) => ({ ...g, items: visible.filter((c) => c.kind === g.kind) })).filter((g) => g.items.length);

  return (
    <PageBody>
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Fan size={22} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{tr("Ventoinhas")}</h1>
          <p className="text-[13px] text-muted">{tr("Escolha a velocidade de cada ventoinha da placa-mãe e da placa de vídeo. Você pode usar uma velocidade fixa ou uma curva que acompanha a temperatura.")}</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {!state ? (
          <div className="flex items-center gap-2 text-[13px] text-muted"><Loader2 size={15} className="animate-spin" />{tr("O CleanCode está lendo as ventoinhas.")}</div>
        ) : !state.active ? (
          <Notice icon={<ShieldCheck size={22} />} title={tr("Ative o monitoramento avançado primeiro")}
            text={tr("O controle das ventoinhas usa a tarefa de administrador do monitoramento avançado. Depois de ativar, o CleanCode muda a velocidade das ventoinhas sem pedir a sua permissão de novo.")}
            action={<Button variant="primary" icon={<ShieldCheck size={14} />} onClick={openActivation}>{tr("Ativar o monitoramento avançado")}</Button>} />
        ) : !state.helperReady ? (
          <Notice icon={<Loader2 size={22} className="animate-spin" />} title={tr("O CleanCode está esperando a tarefa de administrador")}
            text={tr("A tarefa de administrador ainda não respondeu com o controle das ventoinhas. Se este aviso continuar depois de alguns segundos, ative o monitoramento avançado de novo para instalar a versão nova do programa dos sensores.")}
            action={<Button icon={<ShieldCheck size={14} />} onClick={openActivation}>{tr("Ativar de novo")}</Button>} />
        ) : !controls.length ? (
          <Notice icon={<Info size={22} />} title={tr("Nenhuma ventoinha aceita controle neste PC")}
            text={tr("O LibreHardwareMonitor não encontrou nenhuma ventoinha que aceite comandos. Isso acontece quando a placa-mãe tem um chip de sensores que a biblioteca não sabe controlar.")} />
        ) : (
          <>
            {state.preview && (
              <div className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-4 text-[13px]">
                <FlaskConical size={20} className="mt-0.5 shrink-0 text-[var(--warn)]" />
                <div><div className="font-semibold">{tr("Esta é uma prévia com ventoinhas simuladas")}</div>
                  <div className="text-muted">{tr("Nesta prévia, nenhuma mudança chega às ventoinhas de verdade. Para controlar as ventoinhas do PC, use o app instalado com o monitoramento avançado ativo.")}</div></div>
              </div>
            )}
            {state.emergency && (
              <div className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-4 text-[13px]">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[var(--danger)]" />
                <div><div className="font-semibold">{tr("A proteção de temperatura está ativa")}</div>
                  <div className="text-muted">{tr("O processador ou a placa de vídeo chegou a 90 °C. Por isso, o CleanCode colocou as ventoinhas controladas em 100%. Elas voltam à sua configuração quando a temperatura cair para 85 °C.")}</div></div>
              </div>
            )}
            <HowItWorks />
            {groups.map((g) => (
              <section key={g.kind}>
                <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-faint">{g.title}</h2>
                <div className="grid gap-3 xl:grid-cols-2">
                  {g.items.map((f) => <FanCard key={f.id} fan={f} cfg={draft[f.id]} temps={state.temps} onChange={(p) => change(f.id, p)} live={ref} />)}
                </div>
              </section>
            ))}
            {hidden.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-muted">
                <span>{showEmpty ? tr("As saídas da placa-mãe sem ventoinha ligada também aparecem acima.") : tr("{0} saídas da placa-mãe estão sem ventoinha ligada (0 RPM), então o CleanCode escondeu essas saídas.", hidden.length)}</span>
                <Button size="sm" variant="outline" onClick={() => setShowEmpty((v) => !v)}>{showEmpty ? tr("Esconder as saídas vazias") : tr("Mostrar as saídas vazias")}</Button>
              </div>
            )}
          </>
        )}
      </div>
    </PageBody>
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

function HowItWorks() {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-[13px]">
      <button className="flex w-full items-center gap-2 text-left font-semibold" onClick={() => setOpen((v) => !v)}><Info size={15} className="text-[var(--accent)]" />{tr("Como o controle funciona")}</button>
      {open && (
        <ul className="mt-2 list-disc space-y-1 pl-6 text-muted">
          <li>{tr("O CleanCode só muda as ventoinhas que você tirar do modo Automático. As outras continuam com o controle da placa.")}</li>
          <li>{tr("Se o processador ou a placa de vídeo chegar a 90 °C, o CleanCode coloca as ventoinhas controladas em 100% até a temperatura cair para 85 °C.")}</li>
          <li>{tr("Quando você fecha o CleanCode, cada ventoinha volta ao modo automático da placa. Isso também acontece se o CleanCode travar por mais de 12 segundos.")}</li>
          <li>{tr("Se o programa dos sensores fechar de repente, uma ventoinha pode ficar na última velocidade até você reiniciar o Windows.")}</li>
          <li>{tr("Para desfazer uma mudança, escolha Automático na ventoinha.")}</li>
        </ul>
      )}
    </div>
  );
}

// ---------- cartão de uma ventoinha ----------
type TestStep = { phase: 'low' | 'high' | 'done'; low?: number; high?: number };
function FanCard({ fan, cfg, temps, onChange, live }: { fan: FanControlInfo; cfg?: FanConfig; temps: FanTempSource[]; onChange: (p: Partial<FanConfig>) => void; live: React.MutableRefObject<FanState | null> }) {
  const mode = cfg?.mode || 'auto';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cfg?.label || '');
  const [test, setTest] = useState<TestStep | null>(null);
  const testing = !!test && test.phase !== 'done';
  const source = cfg?.source && temps.some((t) => t.id === cfg.source) ? cfg.source : defaultSource(fan, temps);
  const points: Points = cfg?.points?.length ? cfg.points : PRESETS[1].points;
  const temp = temps.find((t) => t.id === source)?.value;
  const rpm = fan.rpm;
  const spin = rpm && rpm > 0 ? Math.max(0.25, Math.min(3, 1200 / rpm)) : 0;

  const setMode = (m: FanConfig['mode']) => {
    if (m === 'fixed') onChange({ mode: m, value: cfg?.value ?? Math.round(fan.pct ?? 50) });
    else if (m === 'curve') onChange({ mode: m, source, points });
    else onChange({ mode: m });
  };
  const runTest = async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const read = () => live.current?.controls.find((c) => c.id === fan.id)?.rpm;
    try {
      setTest({ phase: 'low' }); await cc.fanTest(fan.id, 30); await wait(8000); const low = read();
      setTest({ phase: 'high', low }); await cc.fanTest(fan.id, 100); await wait(8000); const high = read();
      setTest({ phase: 'done', low, high });
    } finally { await cc.fanTest(fan.id, null); }
  };

  const st = fan.status;
  const statusText = mode === 'auto' ? tr("A placa controla esta ventoinha.")
    : !st ? tr("O CleanCode está aplicando a configuração.")
    : st.error === 'notfound' ? tr("A tarefa de administrador não encontrou esta ventoinha.")
    : st.error === 'nosource' ? tr("A temperatura escolhida está sem leitura agora. Por isso, a ventoinha ficou no modo automático.")
    : st.error ? tr("A placa recusou o comando: {0}", st.error.replace(/^error:\s*/, ''))
    : st.mode === 'emergency' ? tr("A proteção de temperatura colocou esta ventoinha em 100%.")
    : tr("O CleanCode está aplicando {0}%.", fmt(st.pct ?? undefined));

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-start gap-3">
        <Fan size={30} className="mt-0.5 shrink-0 text-[var(--accent)]" style={spin ? { animation: `spin ${spin}s linear infinite` } : undefined} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); onChange({ label: name.trim() || undefined }); setEditing(false); }}>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={fan.name} className="h-7 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 text-[13px] outline-none focus:border-[var(--accent)]" />
              <Button size="sm" type="submit" icon={<Check size={13} />}>{tr("Salvar")}</Button>
            </form>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold">{cfg?.label || fan.name}</span>
              <button title={tr("Dar um nome para esta ventoinha")} onClick={() => { setName(cfg?.label || ''); setEditing(true); }} className="rounded p-0.5 text-faint hover:bg-[var(--hover)] hover:text-[var(--fg)]"><Pencil size={12} /></button>
            </div>
          )}
          <div className="text-[12px] text-muted">{cfg?.label ? `${fan.name}, ${fan.hw}` : fan.hw}</div>
        </div>
        <div className="text-right">
          <div className="text-[20px] font-semibold tabular-nums">{rpm === undefined ? '—' : `${fmt(rpm)} RPM`}</div>
          <div className="text-[12px] text-muted tabular-nums">{fan.pct === undefined ? '' : tr("{0}% da velocidade", fmt(fan.pct))}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Segmented value={mode} onChange={setMode} options={[
          { value: 'auto', label: tr("Automático") },
          { value: 'fixed', label: tr("Velocidade fixa") },
          { value: 'curve', label: tr("Curva") },
        ]} />
        <Button size="sm" variant="outline" icon={testing ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />} disabled={testing} onClick={runTest}>{tr("Testar")}</Button>
      </div>
      <div className={cx('mt-2 text-[12.5px]', st?.error ? 'text-[var(--warn)]' : st?.mode === 'emergency' ? 'text-[var(--danger)]' : 'text-muted')}>{statusText}</div>

      {mode === 'fixed' && (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={100} step={1} value={cfg?.value ?? 50} onChange={(e) => onChange({ value: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" aria-label={tr("Velocidade fixa")} />
            <span className="w-12 text-right font-semibold tabular-nums">{fmt(cfg?.value ?? 50)}%</span>
          </div>
          {(cfg?.value ?? 50) < 30 && <div className="mt-1 text-[12px] text-[var(--warn)]">{tr("Abaixo de 30%, algumas ventoinhas param de girar. A proteção de temperatura continua ligada.")}</div>}
        </div>
      )}

      {mode === 'curve' && (
        <div className="mt-3 space-y-2">
          <div>
            <div className="mb-1 text-[12.5px] text-muted">{tr("Temperatura que guia a curva")}</div>
            <Select className="w-full" value={source || ''} onChange={(v) => onChange({ source: v })}
              options={temps.map((t) => ({ value: t.id, label: `${t.name}, ${t.hw}: ${fmt(t.value)} °C` }))} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] text-muted">{tr("Começar de um modelo")}</span>
            {PRESETS.map((p) => <Button key={p.id} size="sm" variant="outline" onClick={() => onChange({ points: p.points, source })}>{p.label}</Button>)}
          </div>
          <CurveEditor points={points} temp={temp} onChange={(pts) => onChange({ points: pts, source })} />
          <div className="text-[12px] text-muted">{tr("Arraste os pontos para mudar a curva. A linha tracejada mostra a temperatura de agora e a velocidade que a curva pede.")}</div>
        </div>
      )}

      {test && (
        <div className="mt-3 rounded-lg bg-[var(--surface-2)] p-3 text-[12.5px]">
          {test.phase === 'low' ? tr("Teste em andamento: a ventoinha está em 30% por 8 segundos.")
            : test.phase === 'high' ? tr("Teste em andamento: a ventoinha está em 100% por 8 segundos.")
            : testResult(test.low, test.high)}
        </div>
      )}
    </div>
  );
}
function testResult(low?: number, high?: number) {
  if (low === undefined || high === undefined) return tr("Esta saída não informa o RPM. Por isso, o teste não consegue conferir se a ventoinha obedeceu. Depois do teste, a ventoinha voltou à configuração anterior.");
  if (!low && !high) return tr("A ventoinha não girou no teste. Talvez não exista uma ventoinha ligada nesta saída. Depois do teste, a ventoinha voltou à configuração anterior.");
  if (high - low > Math.max(150, high * 0.15)) return tr("A ventoinha obedeceu ao comando: ela girou a {0} RPM em 30% e a {1} RPM em 100%. Depois do teste, a ventoinha voltou à configuração anterior.", fmt(low), fmt(high));
  return tr("O RPM quase não mudou: {0} RPM em 30% e {1} RPM em 100%. A placa pode estar ignorando o comando. Depois do teste, a ventoinha voltou à configuração anterior.", fmt(low), fmt(high));
}

// ---------- editor da curva (temperatura no eixo horizontal, velocidade no vertical) ----------
const W = 420, H = 190, PL = 34, PR = 22, PT = 10, PB = 24;
const sx = (t: number) => PL + ((t - T_MIN) / (T_MAX - T_MIN)) * (W - PL - PR);
const sy = (p: number) => PT + (1 - p / 100) * (H - PT - PB);
function CurveEditor({ points, temp, onChange }: { points: Points; temp?: number; onChange: (p: Points) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [local, setLocalState] = useState<Points>(points);
  // a última posição fica também numa referência: o fim do arrasto pode chegar antes de a tela redesenhar o último movimento
  const localRef = useRef<Points>(points);
  const setLocal = (f: (p: Points) => Points) => { localRef.current = f(localRef.current); setLocalState(localRef.current); };
  const drag = useRef<number | null>(null);
  useEffect(() => { if (drag.current === null) { localRef.current = points; setLocalState(points); } }, [points]);
  const move = (e: React.PointerEvent) => {
    const i = drag.current; if (i === null || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    const cur = localRef.current;
    const lo = i > 0 ? cur[i - 1][0] + 1 : T_MIN, hi = i < cur.length - 1 ? cur[i + 1][0] - 1 : T_MAX;
    const t = Math.round(Math.max(lo, Math.min(hi, T_MIN + ((x - PL) / (W - PL - PR)) * (T_MAX - T_MIN))));
    const p = Math.round(Math.max(0, Math.min(100, (1 - (y - PT) / (H - PT - PB)) * 100)));
    setLocal((pts) => pts.map((q, k) => (k === i ? [t, p] : q)) as Points);
  };
  const end = () => { if (drag.current !== null) { drag.current = null; onChange(localRef.current); } };
  const path = useMemo(() => {
    const pts = [[T_MIN, local[0][1]] as [number, number], ...local, [T_MAX, local[local.length - 1][1]] as [number, number]];
    return pts.map(([t, p], k) => `${k ? 'L' : 'M'}${sx(t).toFixed(1)},${sy(p).toFixed(1)}`).join(' ');
  }, [local]);
  const now = temp !== undefined ? Math.max(T_MIN, Math.min(T_MAX, temp)) : undefined;
  return (
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" onPointerMove={move} onPointerUp={end} onPointerLeave={end} role="img" aria-label={tr("Curva de velocidade pela temperatura")}>
      {[0, 25, 50, 75, 100].map((p) => <g key={p}><line x1={PL} x2={W - PR} y1={sy(p)} y2={sy(p)} stroke="var(--line)" /><text x={PL - 5} y={sy(p) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--faint)">{p}%</text></g>)}
      {[20, 40, 60, 80, 100].map((t) => <text key={t} x={sx(t)} y={H - 7} textAnchor="middle" fontSize="9.5" fill="var(--faint)">{t} °C</text>)}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2.2} />
      {now !== undefined && (
        <g>
          <line x1={sx(now)} x2={sx(now)} y1={PT} y2={H - PB} stroke="var(--fg)" strokeOpacity={0.5} strokeDasharray="3 3" />
          <circle cx={sx(now)} cy={sy(interp(local, now))} r={3.5} fill="var(--fg)" />
          <text x={sx(now) + 5} y={PT + 9} fontSize="9.5" fill="var(--fg)">{`${fmt(temp)} °C: ${fmt(interp(local, now))}%`}</text>
        </g>
      )}
      {local.map(([t, p], i) => (
        <circle key={i} cx={sx(t)} cy={sy(p)} r={6.5} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2.2} className="cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => { drag.current = i; try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* sem captura: o arrasto continua pela área do gráfico */ } }}>
          <title>{tr("{0} °C: {1}%", t, p)}</title>
        </circle>
      ))}
    </svg>
  );
}
