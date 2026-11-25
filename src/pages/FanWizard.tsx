// Assistente "Identificar as ventoinhas": acelera uma saída por vez e pergunta qual ventoinha acelerou.
// - Funciona em qualquer placa: não depende de conhecer o modelo, só do RPM que cada saída informa.
// - Só acelera (100% por 8 segundos) e nunca desacelera, então não esquenta nada. Cada saída volta ao normal logo depois.
// - O que dá para medir, o assistente descobre sozinho: se a saída obedeceu (o RPM subiu) e se outra saída mudou junto
//   (como o CPU_OPT, que segue o CPU_FAN nas placas ASUS). Só pergunta o que só a pessoa sabe: onde fica a ventoinha.
import React, { useEffect, useRef, useState } from 'react';
import { Wand2, Ear, CheckCircle2, AlertTriangle, Droplets, Link2, Fan as FanIcon } from 'lucide-react';
import { cc, FanControlInfo, FanState } from '../lib/api';
import { Button, Modal, cx } from '../components/ui';
import { t as tr, LOCALE } from '../lib/i18n';
import { FanHelp } from './FanHelp';

const BOOST_MS = 8000;
const PUMP_RPM = 2400;
const fmt = (v?: number) => (v === undefined || isNaN(v) ? '—' : Math.round(v).toLocaleString(LOCALE));

type Outcome = 'named' | 'skipped' | 'norespond';
interface Result { id: string; outcome: Outcome; label?: string; pump?: boolean; base?: number; peak?: number; followers: string[] }
type Phase = 'intro' | 'boost' | 'ask' | 'norespond' | 'done';

// respostas prontas: o texto do botão e o nome que a ventoinha recebe
const CHOICES: { id: string; button: string; label: string; pump?: boolean }[] = [
  { id: 'cpu', button: tr("Water cooler ou cooler do processador"), label: tr("Cooler do processador") },
  { id: 'pump', button: tr("Bomba do water cooler"), label: tr("Bomba do water cooler"), pump: true },
  { id: 'front', button: tr("Gabinete, na frente"), label: tr("Gabinete, frente") },
  { id: 'rear', button: tr("Gabinete, atrás"), label: tr("Gabinete, atrás") },
  { id: 'top', button: tr("Gabinete, em cima"), label: tr("Gabinete, em cima") },
  { id: 'bottom', button: tr("Gabinete, embaixo"), label: tr("Gabinete, embaixo") },
];

export function FanWizard({ open, onClose, candidates, live, nameOf, onName }: {
  open: boolean; onClose: () => void; candidates: FanControlInfo[]; live: React.MutableRefObject<FanState | null>;
  nameOf: (f: FanControlInfo) => string; onName: (id: string, patch: { label?: string; pump?: boolean }) => void;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [progress, setProgress] = useState(0);
  const [custom, setCustom] = useState('');
  const current = useRef<string | null>(null);
  const cancelled = useRef(false);
  const list = useRef<FanControlInfo[]>([]);
  const fan = list.current[index];

  // termina o teste em andamento (ao fechar, ao cancelar ou ao sair da tela)
  const stop = async () => { const id = current.current; current.current = null; if (id) await cc.fanTest(id, null).catch(() => {}); };
  useEffect(() => () => { cancelled.current = true; void stop(); }, []);
  useEffect(() => { if (open) { cancelled.current = false; list.current = candidates; setPhase('intro'); setIndex(0); setResults([]); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const rpmMap = () => new Map((live.current?.controls || []).map((c) => [c.id, c.rpm ?? 0]));
  const boost = async (i: number) => {
    const f = list.current[i]; if (!f) { setPhase('done'); return; }
    setIndex(i); setCustom(''); setPhase('boost'); setProgress(0);
    const before = rpmMap();
    const startPct = live.current?.controls.find((c) => c.id === f.id)?.pct ?? f.pct ?? 0;
    current.current = f.id;
    await cc.fanTest(f.id, 100);
    const t0 = Date.now();
    while (Date.now() - t0 < BOOST_MS) {
      if (cancelled.current) return;
      await new Promise((r) => setTimeout(r, 250));
      setProgress((Date.now() - t0) / BOOST_MS);
    }
    const after = rpmMap();
    await stop();
    if (cancelled.current) return;
    const base = before.get(f.id) ?? 0, peak = after.get(f.id) ?? 0;
    // obedeceu: o RPM subiu pelo menos 10% (e 150 RPM). Se a saída já estava perto do máximo, não dá para saber pelo RPM.
    const nearMax = startPct >= 90;
    const responded = peak >= base * 1.1 && peak - base >= 150;
    // outras saídas que subiram junto (pelo menos 15% e 150 RPM)
    const followers = list.current.concat(live.current?.controls || []).filter((c, k, arr) => arr.findIndex((x) => x.id === c.id) === k && c.id !== f.id)
      .filter((c) => { const a = before.get(c.id) ?? 0, b = after.get(c.id) ?? 0; return a > 0 && b >= a * 1.15 && b - a >= 150; })
      .map((c) => c.id);
    const r: Result = { id: f.id, outcome: 'skipped', base, peak, followers };
    setResults((rs) => [...rs.filter((x) => x.id !== f.id), r]);
    setPhase(!responded && !nearMax ? 'norespond' : 'ask');
  };
  const answer = (patch: { label?: string; pump?: boolean } | null) => {
    if (fan && patch) { onName(fan.id, patch); setResults((rs) => rs.map((x) => (x.id === fan.id ? { ...x, outcome: 'named', ...patch } : x))); }
    void boost(index + 1);
  };
  const noRespond = () => { if (fan) setResults((rs) => rs.map((x) => (x.id === fan.id ? { ...x, outcome: 'norespond' } : x))); void boost(index + 1); };
  const close = () => { cancelled.current = true; void stop(); onClose(); };

  const res = fan ? results.find((x) => x.id === fan.id) : undefined;
  const nameById = (id: string) => { const c = (live.current?.controls || []).find((x) => x.id === id); return c ? nameOf(c) : id; };
  const total = list.current.length;

  return (
    <Modal open={open} onClose={close} width={620} title={<span className="flex items-center gap-2"><Wand2 size={16} className="text-[var(--accent)]" />{tr("Identificar as ventoinhas")}</span>}
      footer={phase === 'done' ? <Button variant="primary" onClick={close}>{tr("Concluir")}</Button> : <Button variant="ghost" onClick={close}>{phase === 'intro' ? tr("Agora não") : tr("Cancelar")}</Button>}>
      {phase === 'intro' && (
        <div className="space-y-3 text-[13px]">
          <p>{tr("O CleanCode vai acelerar uma ventoinha por vez, por 8 segundos. Enquanto isso, olhe ou escute o PC.")}</p>
          <p className="text-muted">{tr("Depois de cada uma, você diz qual ventoinha acelerou. Se uma saída não obedecer, o CleanCode percebe sozinho pelo RPM e pula a pergunta.")}</p>
          <p className="text-muted">{tr("O assistente só acelera as ventoinhas, e nunca desacelera. Cada ventoinha volta ao normal logo depois.")}</p>
          <div className="rounded-lg bg-[var(--surface-2)] p-3 text-muted">{tr("{0} ventoinhas para identificar. Isso leva mais ou menos {1} segundos.", total, total * 12)}</div>
          <div className="flex justify-end"><Button variant="primary" icon={<Ear size={14} />} disabled={!total} onClick={() => void boost(0)}>{tr("Começar")}</Button></div>
        </div>
      )}

      {phase !== 'intro' && phase !== 'done' && fan && (
        <div className="space-y-4 text-[13px]">
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span>{tr("Ventoinha {0} de {1}", index + 1, total)}</span>
            <span>{nameOf(fan)}, {fan.hw}</span>
          </div>
          {phase === 'boost' && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <FanIcon size={46} className="text-[var(--accent)]" style={{ animation: 'spin .45s linear infinite' }} />
              <div className="text-[15px] font-semibold">{tr("Esta ventoinha está em 100% agora. Olhe ou escute o PC.")}</div>
              <div className="h-1.5 w-full max-w-[360px] overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: 'linear-gradient(90deg, oklch(from var(--accent) .78 .15 calc(h + 45)), var(--accent))' }} />
              </div>
              <div className="text-[12px] text-muted tabular-nums">{tr("{0} segundos", Math.max(0, Math.ceil((1 - progress) * BOOST_MS / 1000)))}</div>
            </div>
          )}
          {phase === 'ask' && res && (
            <div className="space-y-3">
              <div className="text-[15px] font-semibold">{tr("Qual ventoinha acelerou?")}</div>
              <div className="text-[12px] text-muted">{tr("O RPM foi de {0} para {1}.", fmt(res.base), fmt(res.peak))}</div>
              {(res.base ?? 0) >= PUMP_RPM && (
                <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-2.5 text-[12.5px]">
                  <Droplets size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" />{tr("Esta saída gira rápido no modo automático. Ela pode ser a bomba de um water cooler, ou ventoinhas de alta rotação. Escolha a bomba só se tiver certeza.")}
                </div>
              )}
              {res.followers.length > 0 && <Followers names={res.followers.map(nameById)} />}
              <div className="grid grid-cols-2 gap-2">
                {CHOICES.map((c) => (
                  <button key={c.id} onClick={() => answer({ label: c.label, pump: c.pump || undefined })}
                    className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-left text-[13px] font-medium transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                    {c.button}
                  </button>
                ))}
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) answer({ label: custom.trim() }); }}>
                <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={tr("Ou escreva um nome")} className="h-8 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 text-[13px] outline-none focus:border-[var(--accent)]" />
                <Button type="submit" disabled={!custom.trim()}>{tr("Usar este nome")}</Button>
              </form>
              <div className="flex justify-end"><Button variant="ghost" onClick={() => answer(null)}>{tr("Não percebi")}</Button></div>
            </div>
          )}
          {phase === 'norespond' && res && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 rounded-lg border border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-3">
                <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[var(--warn)]" />
                <div>
                  <div className="font-semibold">{tr("Esta saída não respondeu ao comando")}</div>
                  <div className="text-muted">{tr("O RPM ficou em {0} mesmo em 100%. Veja abaixo as causas mais comuns e como resolver.", fmt(res.peak))}</div>
                </div>
              </div>
              <FanHelp compact />
              <div className="flex justify-end"><Button variant="primary" onClick={noRespond}>{tr("Continuar")}</Button></div>
            </div>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-2 text-[13px]">
          <div className="mb-1 font-semibold">{tr("Pronto. Veja o que o CleanCode descobriu:")}</div>
          {results.map((r) => (
            <div key={r.id} className="flex items-start gap-2.5 rounded-lg border border-[var(--line)] p-2.5">
              {r.outcome === 'norespond' ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--warn)]" /> : <CheckCircle2 size={16} className={cx('mt-0.5 shrink-0', r.outcome === 'named' ? 'text-[var(--accent)]' : 'text-faint')} />}
              <div className="min-w-0">
                <div className="font-medium">
                  {r.outcome === 'named' ? tr("{0} agora se chama {1}.", list.current.find((x) => x.id === r.id)?.name || r.id, r.label || '')
                    : r.outcome === 'norespond' ? tr("{0} não responde ao comando da placa-mãe.", nameById(r.id))
                    : tr("{0} ficou com o nome de antes.", nameById(r.id))}
                </div>
                {r.pump && <div className="text-[12px] text-muted">{tr("Esta saída foi marcada como bomba. O CleanCode nunca deixa a velocidade dela abaixo de 60%.")}</div>}
                {r.followers.length > 0 && <div className="text-[12px] text-muted">{tr("Também mudaram junto: {0}.", r.followers.map(nameById).join(', '))}</div>}
              </div>
            </div>
          ))}
          <div className="pt-1 text-[12px] text-muted">{tr("Os nomes ficam salvos. Você pode mudar um nome com o lápis, ou rodar o assistente de novo quando trocar uma ventoinha de lugar.")}</div>
        </div>
      )}
    </Modal>
  );
}

function Followers({ names }: { names: string[] }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-[var(--surface-2)] p-2.5 text-[12.5px] text-muted">
      <Link2 size={15} className="mt-0.5 shrink-0" />{tr("Outra saída também acelerou: {0}. Ela segue esta saída e não tem controle próprio.", names.join(', '))}
    </div>
  );
}
