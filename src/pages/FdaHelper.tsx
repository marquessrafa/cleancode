// Janelinha flutuante do assistente de Acesso Total ao Disco: fica ao lado dos Ajustes do Sistema com o
// ícone do CleanCode para arrastar direto para a lista (o macOS recebe o .app como se viesse do Finder).
import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Hand, MousePointerClick, X } from 'lucide-react';
import { cc } from '../lib/api';

const CSS = `
@keyframes fda-nudge { 0%,100% { transform: translateX(0) } 50% { transform: translateX(-10px) } }
@keyframes fda-pulse { 0%,100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent) } 50% { box-shadow: 0 0 0 10px color-mix(in srgb, var(--accent) 0%, transparent) } }
@keyframes fda-wiggle { 0%,100% { transform: rotate(0) } 25% { transform: rotate(-4deg) } 75% { transform: rotate(4deg) } }
.fda-arrow { animation: fda-nudge 1.2s ease-in-out infinite }
.fda-tile { animation: fda-pulse 1.8s ease-in-out infinite }
.fda-tile:hover img { animation: fda-wiggle .5s ease-in-out infinite }
`;

function Step({ n, children, icon }: { n: number; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{n}</span>
      <div className="min-w-0 flex-1 text-[12.5px] leading-snug text-muted"><span className="mr-1 inline-flex translate-y-[2px] text-accent">{icon}</span>{children}</div>
    </div>
  );
}

export default function FdaHelper() {
  const [icon, setIcon] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // tema e cor de destaque iguais aos do app
  useEffect(() => {
    cc.settingsGet().then((st: any) => {
      const dark = st?.theme === 'dark' || (st?.theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.dataset.accent = st?.accent || 'green';
    }).catch(() => {});
  }, []);
  useEffect(() => {
    cc.fdaIcon().then(setIcon).catch(() => {});
    return cc.onFdaGranted(() => setDone(true));
  }, []);
  const b = (t: string) => <b className="font-semibold text-fg">{t}</b>;
  return (
    <div className="fda-helper m-2 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-2xl backdrop-blur-xl" style={{ height: 'calc(100vh - 16px)' }}>
      <style>{CSS}</style>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="text-[12.5px] font-semibold text-fg">CleanCode · Acesso Total ao Disco</div>
        <button className="rounded p-0.5 text-muted hover:bg-[var(--hover)] hover:text-fg" style={{ WebkitAppRegion: 'no-drag' } as any} title="Fechar" onClick={() => cc.fdaStop()}><X size={15} /></button>
      </div>
      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <CheckCircle2 size={52} className="text-accent" />
          <div className="mt-3 text-[16px] font-semibold">Acesso liberado</div>
          <div className="text-[13px] text-muted">Pode fechar os Ajustes do Sistema.</div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 px-4 py-3">
          <Step n={1} icon={<MousePointerClick size={13} />}>Nos Ajustes, em {b('Privacidade e Segurança')}, clique em {b('Acesso Total ao Disco')} (se ainda não estiver aberto).</Step>
          <div className="relative flex items-center gap-3 rounded-xl border-2 border-dashed border-accent/60 bg-accent-soft/60 p-3 pl-4">
            <span className="absolute -left-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-fg">2</span>
            <div draggable onDragStart={(e) => { e.preventDefault(); cc.fdaDrag(); }}
              className="fda-tile flex h-[112px] w-[112px] shrink-0 cursor-grab flex-col items-center justify-center rounded-2xl bg-surface active:cursor-grabbing"
              title="Arraste este ícone para a lista do Acesso Total ao Disco">
              {icon ? <img src={icon} alt="CleanCode" draggable={false} className="pointer-events-none h-[84px] w-[84px] select-none" /> : <div className="h-[72px] w-[72px] rounded-2xl bg-accent" />}
              <span className="-mt-0.5 text-[10px] font-bold uppercase tracking-widest text-accent">Arraste</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[15px] font-bold text-fg"><ArrowLeft size={18} className="fda-arrow text-accent" />Arraste este ícone</div>
              <div className="mt-1 text-[12.5px] leading-snug text-muted">Clique e segure o ícone do CleanCode e solte-o {b('dentro da lista')} do Acesso Total ao Disco.</div>
              <div className="mt-1.5 flex items-center gap-1 text-[11.5px] text-faint"><Hand size={12} />Ou use o botão + da lista e escolha o CleanCode em Aplicativos.</div>
            </div>
          </div>
          <Step n={3} icon={<CheckCircle2 size={13} />}>Ligue a chave do CleanCode. Nos avisos do macOS: {b('Ignorar Proteções do Sistema')} → {b('Ativar Acesso Total ao Disco')} → senha ou Touch ID.</Step>
        </div>
      )}
    </div>
  );
}
