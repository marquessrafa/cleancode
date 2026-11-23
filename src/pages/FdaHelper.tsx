// Janelinha flutuante do assistente de Acesso Total ao Disco: fica ao lado dos Ajustes do Sistema com o
// passo a passo do macOS (incluindo os avisos do macOS 27) e o botão que copia o caminho do app para o "+"
// da lista. No macOS 27 a lista não aceita arrastar (nem do app, nem do Finder): o caminho é o "+".
import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy, X } from 'lucide-react';
import { cc } from '../lib/api';

/** Miniatura de um botão do macOS, para a pessoa reconhecer na tela. */
const Btn = ({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' | 'blue' }) => (
  <span className={
    'mx-0.5 inline-block whitespace-nowrap rounded-md px-1.5 py-px text-[11.5px] font-semibold ' +
    (tone === 'danger' ? 'bg-[#3a1d1d] text-[#ff6b6b]' : tone === 'blue' ? 'bg-[#0a66d8] text-white' : 'border border-line bg-surface-2 text-fg')
  }>{children}</span>
);
const Key = ({ children }: { children: React.ReactNode }) => <kbd className="mx-px inline-block min-w-[20px] rounded border border-line bg-surface-2 px-1 text-center font-sans text-[11.5px] font-semibold text-fg">{children}</kbd>;

function Step({ n, title, children }: { n: number; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-accent text-[11.5px] font-bold text-accent-fg">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-snug text-fg">{title}</div>
        {children && <div className="mt-1 text-[12px] leading-snug text-muted">{children}</div>}
      </div>
    </div>
  );
}

export default function FdaHelper() {
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [path, setPath] = useState('');
  const copy = async () => { const p = await cc.fdaCopyPath(); if (p) setPath(p); setCopied(true); setTimeout(() => setCopied(false), 2500); };
  // tema e cor de destaque iguais aos do app
  useEffect(() => {
    cc.settingsGet().then((st: any) => {
      const dark = st?.theme === 'dark' || (st?.theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.dataset.accent = st?.accent || 'green';
    }).catch(() => {});
    // já deixa o caminho copiado ao abrir
    copy();
    return cc.onFdaGranted(() => setDone(true));
  }, []);
  return (
    <div className="fda-helper m-2 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-2xl backdrop-blur-xl" style={{ height: 'calc(100vh - 16px)' }}>
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
        <div className="flex flex-1 flex-col gap-3.5 overflow-auto px-4 py-3.5">
          <Step n={1} title={<>Abra <span className="text-accent">Acesso Total ao Disco</span></>}>
            Em Privacidade e Segurança, se ainda não estiver aberto.
          </Step>
          <Step n={2} title={<>Clique no <Btn>+</Btn> embaixo da lista</>}>
            <div>Na janela que abrir, aperte <Key>⌘</Key><Key>⇧</Key><Key>G</Key>, cole com <Key>⌘</Key><Key>V</Key> e clique em <Btn tone="blue">Abrir</Btn>.</div>
            <button onClick={copy} className="mt-2 flex w-full items-center gap-2 rounded-lg border border-accent/50 bg-accent-soft px-2.5 py-1.5 text-left hover:opacity-90">
              <Copy size={13} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg">{path || 'Copiar o caminho do CleanCode'}</span>
              <span className="shrink-0 text-[11.5px] font-semibold text-accent">{copied ? 'Copiado ✓' : 'Copiar'}</span>
            </button>
          </Step>
          <Step n={3} title={<>Ligue a chave do CleanCode</>}>
            Se o CleanCode já estiver na lista, é só ligar a chave ao lado dele.
          </Step>
          <Step n={4} title={<>Em “Choose Folders…”, clique em <Btn>Ignorar Proteções do Sistema</Btn></>}>
            O CleanCode precisa do acesso total para ler caches, logs e dados dos apps.
          </Step>
          <Step n={5} title={<>No alerta vermelho, clique nos três <Btn tone="danger">OK</Btn></>}>
            Um em cada item; cada um vira <Btn>Desfazer</Btn>. É o aviso padrão da Apple para qualquer app com esse acesso.
          </Step>
          <Step n={6} title={<>Clique em <Btn tone="danger">Ativar Acesso Total ao Disco</Btn></>}>
            Fica disponível depois dos três OK. Confirme com senha ou Touch ID: o CleanCode percebe sozinho.
          </Step>
        </div>
      )}
    </div>
  );
}
