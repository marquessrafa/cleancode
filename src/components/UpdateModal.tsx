// Popup central de atualização: aparece quando sai uma versão nova (e pelo botão do topo), mostra as novidades
// da versão (e das que a pessoa pulou), baixa com progresso, instala acompanhando as etapas e só reinicia no fim.
// As notificações do canto continuam servindo só para avisar com o app em segundo plano.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, CircuitBoard, Download, Gamepad2, Globe, Loader2, PanelTop, RotateCcw, Sparkles, Wrench, X, AlertTriangle } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, isMac } from '../lib/api';
import { fmtSize } from '../lib/format';
import { Button, cx } from './ui';

const OPEN = 'cc:update-modal';
const ICONS: Record<string, React.ReactNode> = {
  wrench: <Wrench size={14} />, globe: <Globe size={14} />, gamepad: <Gamepad2 size={14} />, panel: <PanelTop size={14} />,
  download: <Download size={14} />, sparkles: <Sparkles size={14} />, chip: <CircuitBoard size={14} />,
};
const seenKey = 'cc.update.prompted';
const fmtDay = (d?: string) => { if (!d) return ''; const t = Date.parse(d); return isNaN(t) ? '' : new Date(t).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }); };

export function UpdateModal() {
  const { update } = useApp();
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [err, setErr] = useState('');
  const speed = useRef<{ t: number; done: number; bps: number }>({ t: 0, done: 0, bps: 0 });
  const info = update.info;

  // abre sozinho uma vez por versão a cada sessão (e sempre pelo botão do topo)
  useEffect(() => {
    const h = () => { setOpen(true); setErr(''); };
    window.addEventListener(OPEN, h);
    return () => window.removeEventListener(OPEN, h);
  }, []);
  useEffect(() => {
    if (!info || (update.status !== 'available' && update.status !== 'ready')) return;
    let seen = ''; try { seen = sessionStorage.getItem(seenKey) || ''; } catch { /* */ }
    if (seen === info.version) return;
    try { sessionStorage.setItem(seenKey, info.version); } catch { /* */ }
    setOpen(true);
  }, [update.status, info?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  // velocidade do download
  if (update.status === 'downloading' && update.done !== undefined) {
    const now = performance.now(), s = speed.current;
    if (!s.t || update.done < s.done) { s.t = now; s.done = update.done; }
    else if (now - s.t > 700) { const bps = ((update.done - s.done) / (now - s.t)) * 1000; s.bps = s.bps ? s.bps * 0.6 + bps * 0.4 : bps; s.t = now; s.done = update.done; }
  }

  if (!open || !info) return null;
  const phase = update.status === 'error' || err ? 'error'
    : update.status === 'restarting' ? 'restart'
    : update.status === 'installing' ? 'install'
    : started && (update.status === 'downloading' || update.status === 'ready') ? 'download'
    : 'intro';
  const busy = phase === 'download' || phase === 'install' || phase === 'restart';
  const notes = info.notes || [];
  const top = notes[0];
  const start = async () => {
    setStarted(true); setErr('');
    try { await cc.updateStart(); } catch (e: any) { setErr(String(e?.message || e)); }
  };
  const close = () => { if (!busy) { setOpen(false); setStarted(false); setErr(''); } };
  const pct = update.total ? Math.min(1, (update.done || 0) / update.total) : 0;
  const steps = update.steps || [];
  const step = update.step ?? 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm anim-fade" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="relative flex max-h-[86vh] w-full max-w-[580px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl anim-pop">
        {/* brilho na cor de destaque no topo */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40" style={{ background: 'radial-gradient(70% 100% at 50% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%)' }} />
        {!busy && <button className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted hover:bg-[var(--hover)] hover:text-fg" onClick={close} title="Fechar"><X size={16} /></button>}

        {/* cabeçalho */}
        <div className="relative flex items-center gap-4 px-7 pb-4 pt-7">
          <div className={cx('relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg', phase === 'download' && 'upd-bob')}
            style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000))', boxShadow: '0 10px 30px -10px var(--accent)' }}>
            {phase === 'restart' ? <Check size={28} strokeWidth={2.6} /> : phase === 'error' ? <AlertTriangle size={26} /> : phase === 'install' ? <Loader2 size={26} className="animate-spin" /> : phase === 'download' ? <Download size={26} /> : <ArrowUp size={28} strokeWidth={2.6} />}
            {phase === 'intro' && <span className="absolute -right-1 -top-1 flex h-4 w-4"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative inline-flex h-4 w-4 rounded-full border-2 border-[var(--surface)] bg-accent" /></span>}
          </div>
          <div className="min-w-0">
            <div className="text-[11.5px] font-semibold uppercase tracking-wider text-accent">
              {phase === 'restart' ? 'Atualizado' : phase === 'install' ? 'Instalando' : phase === 'download' ? 'Baixando' : phase === 'error' ? 'Não deu certo' : 'Nova versão disponível'}
            </div>
            <div className="truncate text-[21px] font-semibold tracking-tight text-fg">CleanCode {info.version}</div>
            <div className="truncate text-[12.5px] text-muted">{top?.headline || 'Melhorias e correções'}{info.size ? ` · ${fmtSize(info.size)}` : ''}{top?.date || info.date ? ` · ${fmtDay(top?.date || info.date)}` : ''}</div>
          </div>
        </div>

        {/* corpo */}
        <div className="relative min-h-0 flex-1 overflow-y-auto px-7 pb-2">
          {phase === 'intro' && (
            notes.length ? notes.map((n, ni) => (
              <div key={n.version} className={ni ? 'mt-5 border-t border-line pt-4' : ''}>
                {notes.length > 1 && <div className="mb-2 text-[12px] font-semibold text-muted">Versão {n.version}{ni === 0 ? ' (nova)' : ''}</div>}
                {n.groups.map((g) => (
                  <div key={g.title} className="mb-3.5">
                    <div className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold text-fg"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-accent">{ICONS[g.icon] || <Sparkles size={14} />}</span>{g.title}</div>
                    <ul className="space-y-1.5 pl-8">
                      {g.items.map((it, k) => <li key={k} className="relative text-[13px] leading-relaxed text-muted before:absolute before:-left-3.5 before:top-[9px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-accent/70">{it}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )) : <p className="text-[13px] text-muted">Esta versão traz melhorias e correções. As novidades aparecem depois de atualizar.</p>
          )}

          {phase === 'download' && (
            <div className="py-4">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[28px] font-semibold tabular-nums text-fg">{Math.round(pct * 100)}%</span>
                <span className="text-[12.5px] tabular-nums text-muted">{fmtSize(update.done || 0)} de {fmtSize(update.total || info.size)}{speed.current.bps > 0 ? ` · ${fmtSize(speed.current.bps)}/s` : ''}</span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div className="upd-stripes relative h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${Math.max(3, pct * 100)}%`, background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 70%, #fff 0%), var(--accent))', boxShadow: '0 0 14px var(--accent)' }} />
              </div>
              <p className="mt-3 text-[12.5px] text-muted">Baixando e conferindo a integridade (SHA-512). Você pode continuar usando o app.</p>
            </div>
          )}

          {(phase === 'install' || phase === 'restart') && (
            <div className="py-3">
              <ol className="space-y-2.5">
                {steps.map((sname, i) => {
                  const done = phase === 'restart' || i < step, cur = phase === 'install' && i === step;
                  return (
                    <li key={sname} className={cx('flex items-center gap-3 text-[13.5px] transition-colors', done ? 'text-fg' : cur ? 'text-fg' : 'text-faint')}>
                      <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all', done ? 'upd-pop border-transparent bg-accent text-accent-fg' : cur ? 'border-accent text-accent' : 'border-line')}>
                        {done ? <Check size={13} strokeWidth={3} /> : cur ? <Loader2 size={13} className="animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-[var(--line-strong)]" />}
                      </span>
                      <span className={cx(cur && 'font-medium')}>{sname}</span>
                    </li>
                  );
                })}
              </ol>
              <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                {phase === 'restart'
                  ? <div className="h-full w-full rounded-full bg-accent" />
                  : <div className="upd-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-accent" />}
              </div>
              <p className="mt-3 text-[12.5px] text-muted">
                {phase === 'restart' ? `Tudo pronto: o CleanCode ${info.version} está instalado. Reiniciando…`
                  : isMac ? 'Instalando com o app aberto. Ele só reinicia quando terminar.'
                  : 'O CleanCode vai fechar e a instalação continua numa janelinha no centro da tela; ele reabre sozinho quando terminar.'}
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="py-3">
              <div className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-danger-soft px-3.5 py-3 text-[13px] text-fg">{err || update.error || 'Erro desconhecido'}</div>
              <p className="mt-3 text-[12.5px] text-muted">Nada foi alterado: o CleanCode continua na versão atual.</p>
            </div>
          )}
        </div>

        {/* rodapé */}
        <div className="relative flex items-center justify-end gap-2 border-t border-line px-7 py-4">
          {phase === 'intro' && <>
            <Button variant="ghost" onClick={close}>Depois</Button>
            <Button variant="primary" icon={update.status === 'ready' ? <RotateCcw size={14} /> : <Download size={14} />} onClick={start}>{update.status === 'ready' ? 'Reiniciar e atualizar' : 'Atualizar agora'}</Button>
          </>}
          {phase === 'download' && <Button variant="ghost" onClick={() => setOpen(false)}>Continuar em segundo plano</Button>}
          {phase === 'install' && <span className="text-[12px] text-muted">Não feche o CleanCode</span>}
          {phase === 'restart' && <span className="flex items-center gap-2 text-[12.5px] font-medium text-accent"><Loader2 size={14} className="animate-spin" /> Reiniciando</span>}
          {phase === 'error' && <>
            <Button variant="ghost" onClick={close}>Fechar</Button>
            <Button variant="primary" icon={<RotateCcw size={14} />} onClick={start}>Tentar de novo</Button>
          </>}
        </div>
      </div>
    </div>
  );
}
