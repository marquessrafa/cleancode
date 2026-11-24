// Popup de ativação do monitoramento avançado no Windows (LibreHardwareMonitor e driver PawnIO).
// Ele abre sozinho quando você entra no Monitor de hardware e os sensores avançados não estão ativos (por exemplo,
// depois de uma atualização que trocou o programa dos sensores). Ao ativar, ele mostra cada etapa da instalação,
// no mesmo estilo do popup de atualização, e fecha sozinho quando os sensores começam a responder.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, AlertTriangle, Check, CircuitBoard, Cpu, Fan, Gauge, Gpu, HardDrive, Loader2, MemoryStick, Send, ShieldCheck, Thermometer, X, Zap } from 'lucide-react';
import { cc, isMac, type HardwareLive, type HwCheck } from '../lib/api';
import { useApp } from '../lib/store';
import { Button, cx } from './ui';
import { t as tr } from '../lib/i18n';

export const OPEN_ADVANCED = 'cc:advanced-modal';
const seenKey = 'cc.advanced.prompted';
// tempo mínimo de cada etapa na tela, para dar para ler cada passo
const MIN_STEP_MS = 700;

/** O monitoramento avançado precisa ser ativado (ou ativado de novo)? */
export function needsAdvanced(live: HardwareLive | null): boolean {
  const adv = live?.live?.advanced;
  if (isMac || !adv?.available) return false;
  return !adv.active || adv.cpuBlocked === 'admin' || adv.cpuBlocked === 'nodata' || adv.cpuBlocked === 'driver';
}

export function AdvancedSetupModal({ live }: { live: HardwareLive | null }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'intro' | 'work' | 'done' | 'error'>('intro');
  const [target, setTarget] = useState(0); // etapa que o processo principal informou
  const [shown, setShown] = useState(0); // etapa mostrada na tela (anda no máximo uma a cada MIN_STEP_MS)
  const [driverPresent, setDriverPresent] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; checks?: HwCheck[] } | null>(null);
  const [sent, setSent] = useState(false);
  const { toast } = useApp();
  const need = needsAdvanced(live);
  const redo = live?.live?.advanced?.active || live?.live?.advanced?.cpuBlocked === 'admin' || live?.live?.advanced?.cpuBlocked === 'nodata';
  const busyRef = useRef(false);

  // abre sozinho uma vez por sessão, quando a tela de hardware percebe que os sensores avançados não estão ativos
  useEffect(() => {
    if (!need || open) return;
    let seen = ''; try { seen = sessionStorage.getItem(seenKey) || ''; } catch { /* */ }
    if (seen) return;
    try { sessionStorage.setItem(seenKey, '1'); } catch { /* */ }
    setPhase('intro'); setOpen(true);
  }, [need]); // eslint-disable-line react-hooks/exhaustive-deps
  // e sempre pelo botão do topo da tela
  useEffect(() => {
    const h = () => { if (!busyRef.current) { setPhase('intro'); setResult(null); } setOpen(true); };
    window.addEventListener(OPEN_ADVANCED, h);
    return () => window.removeEventListener(OPEN_ADVANCED, h);
  }, []);
  useEffect(() => cc.on.advancedStep((d) => { setTarget((t) => Math.max(t, d.step)); if (d.driverPresent !== undefined) setDriverPresent(d.driverPresent); }), []);

  // anda uma etapa por vez na tela; quando o resultado chega e todas as etapas já apareceram, conclui
  const total = 5;
  useEffect(() => {
    if (phase !== 'work') return;
    const goal = result?.ok ? total : target;
    if (shown < goal) { const id = setTimeout(() => setShown((s) => s + 1), MIN_STEP_MS); return () => clearTimeout(id); }
    if (result?.ok && shown >= total) { const id = setTimeout(() => setPhase('done'), 250); return () => clearTimeout(id); }
  }, [phase, shown, target, result]);
  // tudo pronto e todas as peças passaram: fecha sozinho (com aviso ou falha, fica aberto para você ver)
  const allOk = !!result?.checks?.length && result.checks.every((c) => c.status === 'ok');
  useEffect(() => {
    if (phase !== 'done' || !allOk) return;
    const id = setTimeout(() => setOpen(false), 2200);
    return () => clearTimeout(id);
  }, [phase, allOk]);

  if (!open || isMac) return null;
  const start = async () => {
    busyRef.current = true;
    setPhase('work'); setTarget(0); setShown(0); setResult(null); setSent(false);
    let r: { ok: boolean; message: string };
    try { r = await cc.hardwareAdvanced(true); } catch (e: any) { r = { ok: false, message: String(e?.message || e) }; }
    busyRef.current = false;
    setResult(r);
    if (!r.ok) setPhase('error');
  };
  const busy = phase === 'work';
  const close = () => { if (!busy) setOpen(false); };
  const steps = [
    tr("Conferindo o que já está instalado"),
    driverPresent ? tr("O driver PawnIO já está instalado") : tr("Baixando o driver PawnIO e conferindo a assinatura digital"),
    tr("Instalando o programa dos sensores (o Windows pede a sua permissão)"),
    tr("Lendo os sensores pela primeira vez"),
    tr("Mapeando cada peça"),
  ];
  const CHECK_LABEL: Record<HwCheck['id'], [string, React.ReactNode]> = {
    cpu: [tr("Processador"), <Cpu size={14} />], gpu: [tr("Placa de vídeo"), <Gpu size={14} />], ram: [tr("Memória"), <MemoryStick size={14} />],
    board: [tr("Placa-mãe"), <CircuitBoard size={14} />], disk: [tr("Armazenamento"), <HardDrive size={14} />], power: [tr("Energia"), <Zap size={14} />],
  };
  const checks = result?.checks || [];
  const anyFail = checks.some((c) => c.status === 'fail');
  const sendReport = async () => {
    const r = await cc.hardwareReport(checks);
    setSent(true);
    toast(r.truncated ? tr("A página da issue abriu no navegador. O relatório completo também foi copiado, e você pode colar na issue.") : tr("A página da issue abriu no navegador. Revise o texto e clique em Submit new issue para enviar."), 'ok');
  };
  const benefits = [
    { icon: <Thermometer size={14} />, text: tr("A temperatura do processador, de cada núcleo e da placa-mãe.") },
    { icon: <Gauge size={14} />, text: tr("O consumo de energia do processador e da placa de vídeo.") },
    { icon: <Fan size={14} />, text: tr("A velocidade das ventoinhas e as tensões da placa-mãe.") },
    { icon: <Cpu size={14} />, text: tr("A frequência de cada núcleo e os sensores da memória.") },
  ];

  // portal no body: a tela de hardware tem animação (transform), e um "fixed" dentro dela ficaria preso à tela
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm anim-fade" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={cx('relative flex max-h-[86vh] w-full flex-col', phase === 'done' && checks.length ? 'max-w-[680px]' : 'max-w-[560px]', 'overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl anim-pop transition-[max-width] duration-300')}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40" style={{ background: 'radial-gradient(70% 100% at 50% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%)' }} />
        {!busy && <button className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted hover:bg-[var(--hover)] hover:text-fg" onClick={close} title={tr("Fechar")}><X size={16} /></button>}

        {/* cabeçalho */}
        <div className="relative flex items-center gap-4 px-7 pb-4 pt-7">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[var(--on-accent)] shadow-lg"
            style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000))', boxShadow: '0 10px 30px -10px var(--accent)' }}>
            {phase === 'done' && !anyFail ? <Check size={28} strokeWidth={2.6} /> : phase === 'error' || anyFail ? <AlertTriangle size={26} /> : phase === 'work' ? <Loader2 size={26} className="animate-spin" /> : <Activity size={26} />}
            {phase === 'intro' && <span className="absolute -right-1 -top-1 flex h-4 w-4"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative inline-flex h-4 w-4 rounded-full border-2 border-[var(--surface)] bg-accent" /></span>}
          </div>
          <div className="min-w-0">
            <div className="text-[11.5px] font-semibold uppercase tracking-wider text-accent">
              {phase === 'done' ? (anyFail ? tr("Algumas leituras falharam") : allOk || !checks.length ? tr("Tudo pronto") : tr("Ativado")) : phase === 'work' ? tr("Mapeando") : phase === 'error' ? tr("Não deu certo") : redo ? tr("Mapeie os sensores de novo") : tr("Antes de começar")}
            </div>
            <div className="text-[21px] font-semibold tracking-tight text-fg">{tr("Mapeamento dos sensores")}</div>
            <div className="text-[12.5px] text-muted">{tr("LibreHardwareMonitor com o driver assinado PawnIO")}</div>
          </div>
        </div>

        {/* corpo */}
        <div className="relative min-h-0 flex-1 overflow-y-auto px-7 pb-2">
          {phase === 'intro' && (
            <div className="pb-2">
              <p className="text-[13px] leading-relaxed text-muted">
                {redo
                  ? tr("O programa que lê os sensores mudou nesta versão do CleanCode. Por isso, ele precisa mapear os sensores deste PC de novo para voltar a ler o processador, a placa-mãe e a energia.")
                  : tr("Para ler os sensores deste PC, o CleanCode precisa mapear cada peça. No mapeamento, ele instala o driver assinado PawnIO e um programa que lê os sensores como administrador. Depois, ele confere o que cada peça informa.")}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{tr("Nada é instalado antes de você clicar em Iniciar mapeamento.")}</p>
              <ul className="mt-4 space-y-2.5">
                {benefits.map((b, i) => <li key={i} className="flex items-center gap-3 text-[13px] text-fg"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{b.icon}</span>{b.text}</li>)}
              </ul>
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-[var(--surface-2)] px-3.5 py-3 text-[12.5px] text-muted">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-accent" />
                <span>{tr("O Windows pede a sua permissão de administrador uma única vez. Depois disso, o CleanCode lê os sensores sem pedir de novo. Você pode desligar o monitoramento avançado quando quiser.")}</span>
              </div>
              <div className="mt-2.5 flex items-start gap-2.5 rounded-lg border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-warn-soft px-3.5 py-3 text-[12.5px] text-fg">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
                <span>{tr("Sem o mapeamento, o widget da barra de tarefas e o Monitor de hardware não funcionam direito. Eles ficam sem a temperatura e o consumo do processador, sem os sensores da placa-mãe e sem as ventoinhas.")}</span>
              </div>
            </div>
          )}

          {(phase === 'work' || phase === 'done') && (
            <div className="py-3">
              {!(phase === 'done' && checks.length > 0) && <ol className="space-y-2.5">
                {steps.map((sname, i) => {
                  const done = phase === 'done' || i < shown, cur = phase === 'work' && i === shown;
                  return (
                    <li key={i} className={cx('flex items-center gap-3 text-[13.5px] transition-colors', done || cur ? 'text-fg' : 'text-faint')}>
                      <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all', done ? 'upd-pop border-transparent bg-accent text-accent-fg' : cur ? 'border-accent text-accent' : 'border-line')}>
                        {done ? <Check size={13} strokeWidth={3} /> : cur ? <Loader2 size={13} className="animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-[var(--line-strong)]" />}
                      </span>
                      <span className={cx(cur && 'font-medium')}>{sname}</span>
                    </li>
                  );
                })}
              </ol>}
              {phase === 'done' && checks.length > 0 && (
                <div className="space-y-2">
                  <div className="chk-in text-[12px] font-semibold text-muted">{tr("Resultado do mapeamento")}</div>
                  {checks.map((c, i) => (
                    <div key={c.id + i} className="chk-in rounded-xl border border-line bg-[var(--surface-2)] px-3.5 py-3" style={{ animationDelay: `${120 + i * 110}ms` }}>
                      <div className="flex items-center gap-2.5">
                        <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', c.status === 'ok' ? 'bg-accent text-accent-fg' : c.status === 'warn' ? 'bg-warn-soft text-warn' : 'bg-danger-soft text-danger')}>
                          {c.status === 'ok' ? <Check size={11} strokeWidth={3} /> : c.status === 'warn' ? <AlertTriangle size={11} /> : <X size={11} strokeWidth={3} />}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-fg">{CHECK_LABEL[c.id][1]}{CHECK_LABEL[c.id][0]}</span>
                        {c.name && <span className="min-w-0 truncate text-[12px] text-muted">{c.name}</span>}
                        <span className="ml-auto shrink-0 text-[11.5px] text-muted">{c.detail}</span>
                      </div>
                      {c.found.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5 pl-[30px]">
                          {c.found.map((f) => (
                            <span key={f.what} className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[11.5px] text-fg">
                              <Check size={10} strokeWidth={3} className="text-accent" />{f.what}{f.value && <span className="font-semibold tabular-nums">{f.value}</span>}
                            </span>
                          ))}
                        </div>
                      )}
                      {c.missing.length > 0 && (
                        <ul className="mt-2 space-y-1.5 pl-[30px]">
                          {c.missing.map((m) => (
                            <li key={m.what} className="text-[12px] leading-snug">
                              <span className={cx('font-medium', c.status === 'fail' ? 'text-danger' : 'text-warn')}>{tr("Não mapeado:")} {m.what}.</span>{' '}
                              <span className="text-muted">{m.why}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                {phase === 'done' ? <div className="h-full w-full rounded-full bg-accent" /> : <div className="upd-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-accent" />}
              </div>
              <p className="mt-3 text-[12.5px] text-muted">
                {phase === 'done'
                  ? (anyFail ? tr("Os sensores avançados estão ativos, mas a leitura de algumas peças falhou. Você pode enviar um relatório para o GitHub, para que o problema seja corrigido.")
                    : !allOk ? tr("Os sensores avançados estão ativos. Os itens não mapeados mostram o motivo. Na maioria dos casos, a peça não informa aquele dado neste PC.")
                    : (result?.message || tr("Os sensores avançados estão ativos.")))
                  : shown === 2 ? tr("Se o Windows mostrar uma janela pedindo permissão, clique em Sim para continuar.") : tr("Você pode continuar usando o app enquanto o CleanCode termina.")}
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="py-3">
              <div className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-danger-soft px-3.5 py-3 text-[13px] text-fg">{result?.message || tr("Erro desconhecido")}</div>
              <p className="mt-3 text-[12.5px] text-muted">{tr("Nada foi alterado. O Monitor de hardware continua mostrando o que o Windows informa sem o driver.")}</p>
            </div>
          )}
        </div>

        {/* rodapé */}
        <div className="relative flex items-center justify-end gap-2 border-t border-line px-7 py-4">
          {phase === 'intro' && <>
            <Button variant="ghost" onClick={close}>{tr("Mapear depois")}</Button>
            <Button variant="primary" icon={<ShieldCheck size={14} />} onClick={start}>{tr("Iniciar mapeamento")}</Button>
          </>}
          {phase === 'work' && <span className="text-[12px] text-muted">{tr("Não feche o CleanCode")}</span>}
          {phase === 'done' && allOk && <span className="flex items-center gap-2 text-[12.5px] font-medium text-accent"><Check size={14} /> {tr("Fechando")}</span>}
          {phase === 'done' && !allOk && <>
            <Button variant="ghost" icon={<Send size={14} />} onClick={sendReport} disabled={sent}>{sent ? tr("Relatório aberto") : tr("Enviar relatório ao GitHub")}</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>{tr("Fechar")}</Button>
          </>}
          {phase === 'error' && <>
            <Button variant="ghost" icon={<Send size={14} />} onClick={sendReport} disabled={sent}>{sent ? tr("Relatório aberto") : tr("Enviar relatório")}</Button>
            <Button variant="ghost" onClick={close}>{tr("Fechar")}</Button>
            <Button variant="primary" icon={<ShieldCheck size={14} />} onClick={start}>{tr("Tentar de novo")}</Button>
          </>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
