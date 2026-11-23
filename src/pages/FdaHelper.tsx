// Janelinha flutuante do assistente de Acesso Total ao Disco: fica por cima dos Ajustes do Sistema com o
// ícone do CleanCode para arrastar direto para a lista (o macOS recebe o .app como se viesse do Finder).
import React, { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { cc } from '../lib/api';

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
  return (
    <div className="fda-helper m-2 overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-2xl backdrop-blur-xl" style={{ height: 'calc(100vh - 16px)' }}>
      <div className="flex items-center justify-between px-4 pt-3" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="text-[12px] font-semibold text-fg">CleanCode · Acesso Total ao Disco</div>
        <button className="text-muted hover:text-fg" style={{ WebkitAppRegion: 'no-drag' } as any} title="Fechar" onClick={() => cc.fdaStop()}><X size={14} /></button>
      </div>
      {done ? (
        <div className="flex flex-col items-center justify-center px-4 pt-6 text-center">
          <CheckCircle2 size={40} className="text-accent" />
          <div className="mt-2 text-[14px] font-semibold">Acesso liberado</div>
          <div className="text-[12px] text-muted">Pode fechar os Ajustes.</div>
        </div>
      ) : (
        <div className="flex items-center gap-4 px-4 pt-4">
          <div draggable onDragStart={(e) => { e.preventDefault(); cc.fdaDrag(); }}
            className="fda-drag flex h-[92px] w-[92px] shrink-0 cursor-grab items-center justify-center rounded-2xl border-2 border-dashed border-accent/60 bg-accent-soft active:cursor-grabbing"
            title="Arraste para a lista do Acesso Total ao Disco">
            {icon ? <img src={icon} alt="CleanCode" draggable={false} className="h-[70px] w-[70px] select-none" /> : <div className="h-[60px] w-[60px] rounded-xl bg-accent" />}
          </div>
          <div className="min-w-0 text-[12px] leading-relaxed text-muted">
            <div className="mb-1 text-[13px] font-semibold text-fg">Arraste este ícone</div>
            para a lista <b className="font-medium text-fg">Acesso Total ao Disco</b> e ligue a chave do CleanCode.
            <div className="mt-1.5">Nos avisos: <b className="font-medium text-fg">Ignorar Proteções do Sistema</b> → <b className="font-medium text-fg">Ativar Acesso Total ao Disco</b> → senha.</div>
          </div>
        </div>
      )}
    </div>
  );
}
