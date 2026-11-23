// Assistente de "Acesso Total ao Disco" (macOS): explica antes o que o acesso libera e os avisos padrão
// que o macOS mostra, abre os Ajustes com a janelinha de arrastar o ícone e detecta sozinho quando o
// acesso é liberado. A Apple não permite que um app ligue esse acesso por conta própria.
import React, { useEffect, useState } from 'react';
import { CheckCircle2, FolderLock, Hand, Loader2, Lock, MousePointer2, ShieldCheck, X } from 'lucide-react';
import { cc, isMac } from '../lib/api';
import { Button, Modal, cx } from './ui';

const OPEN_EVENT = 'cc:fda-assistant';
/** Abre o assistente de qualquer tela. */
export function openFdaAssistant() { window.dispatchEvent(new Event(OPEN_EVENT)); }

type Phase = 'intro' | 'waiting' | 'done';

function Step({ n, title, children, icon }: { n: number; title: string; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">{n}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-fg">{icon}{title}</div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-muted">{children}</div>
      </div>
    </div>
  );
}
/** Miniatura do botão que o usuário vai encontrar no aviso do macOS. */
const Key = ({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' }) => (
  <span className={cx('mx-0.5 inline-block rounded-md border px-1.5 py-px text-[11px] font-medium', tone === 'danger' ? 'border-transparent bg-danger-soft text-danger' : 'border-line bg-surface-2 text-fg')}>{children}</span>
);

export function FdaAssistantHost() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('intro');
  useEffect(() => {
    if (!isMac) return;
    const show = () => {
      cc.fullDiskAccess().then((ok) => { setPhase(ok ? 'done' : 'intro'); setOpen(true); }).catch(() => { setPhase('intro'); setOpen(true); });
    };
    window.addEventListener(OPEN_EVENT, show);
    const off = cc.onFdaGranted(() => { setPhase('done'); setOpen(true); window.dispatchEvent(new Event('focus')); });
    return () => { window.removeEventListener(OPEN_EVENT, show); off(); };
  }, []);
  const close = () => { if (phase === 'waiting') cc.fdaStop(); setOpen(false); };
  const start = () => { setPhase('waiting'); cc.fdaStart(); };
  if (!isMac) return null;

  return (
    <Modal open={open} onClose={close} width={560} title="Acesso Total ao Disco"
      footer={phase === 'intro' ? <>
        <Button onClick={close}>Agora não</Button>
        <Button variant="primary" icon={<ShieldCheck size={14} />} onClick={start}>Abrir Ajustes e liberar</Button>
      </> : phase === 'waiting' ? <>
        <Button onClick={close}>Cancelar</Button>
        <Button onClick={() => cc.fdaStart()}>Abrir Ajustes de novo</Button>
      </> : <>
        <Button onClick={() => cc.fdaRelaunch()}>Reabrir o CleanCode</Button>
        <Button variant="primary" onClick={() => setOpen(false)}>Concluir</Button>
      </>}>
      {phase === 'done' ? (
        <div className="flex flex-col items-center py-4 text-center">
          <CheckCircle2 size={44} className="text-accent" />
          <div className="mt-3 text-[15px] font-semibold">Acesso liberado</div>
          <p className="mt-1 max-w-[400px] text-[13px] text-muted">O CleanCode já consegue analisar e limpar caches, logs, anexos e dados de navegadores. Se alguma pasta continuar como “Acesso negado”, reabra o app.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg bg-surface-2 p-3.5">
            <FolderLock size={20} className="mt-0.5 shrink-0 text-accent" />
            <div className="text-[12.5px] leading-relaxed text-muted">
              <span className="font-medium text-fg">Para que serve:</span> o macOS protege pastas como caches e logs de outros apps, anexos do Mail e do Mensagens, dados do Safari e a Lixeira. Sem esse acesso, elas ficam fora da análise e da limpeza.
              <div className="mt-1.5"><span className="font-medium text-fg">O que o CleanCode faz com ele:</span> só lê para medir o espaço e só apaga o que você confirmar. Nenhum arquivo sai do seu Mac. Você pode desligar quando quiser nos Ajustes.</div>
            </div>
          </div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted">Como liberar</div>
          <div className="space-y-3.5">
            <Step n={1} title="Adicione o CleanCode à lista" icon={<Hand size={13} className="text-accent" />}>
              Os Ajustes abrem em Privacidade e Segurança: clique em <b className="font-medium text-fg">Acesso Total ao Disco</b> se ele não abrir sozinho. Ao lado aparece uma janelinha que copia o caminho do app: clique no + embaixo da lista, aperte ⌘⇧G, cole e clique em Abrir. Depois ligue a chave do CleanCode.
            </Step>
            <Step n={2} title="Confirme os avisos do macOS" icon={<MousePointer2 size={13} className="text-accent" />}>
              O macOS mostra dois avisos padrão, iguais para qualquer app com esse acesso (antivírus, backup, limpeza): em “Escolher pastas”, clique em <Key>Ignorar Proteções do Sistema</Key>; no alerta vermelho, clique em <Key tone="danger">Ativar Acesso Total ao Disco</Key>. Eles parecem assustadores, mas são o texto fixo da Apple.
            </Step>
            <Step n={3} title="Digite sua senha ou use o Touch ID" icon={<Lock size={13} className="text-accent" />}>
              Pronto: o CleanCode percebe sozinho e volta para a frente. Isso só precisa ser feito uma vez.
            </Step>
          </div>
          {phase === 'waiting' && (
            <div className="flex items-center gap-2.5 rounded-lg border border-line px-3.5 py-2.5 text-[13px]">
              <Loader2 size={15} className="animate-spin text-accent" />
              <span className="flex-1">Aguardando você liberar nos Ajustes do Sistema…</span>
              <button className="text-muted hover:text-fg" title="Cancelar" onClick={close}><X size={14} /></button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
