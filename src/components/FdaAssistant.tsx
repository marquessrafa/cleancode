// Assistente de "Acesso Total ao Disco" (macOS): explica antes o que o acesso libera e os avisos padrão
// que o macOS mostra, abre os Ajustes com a janelinha de arrastar o ícone e detecta sozinho quando o
// acesso é liberado. A Apple não permite que um app ligue esse acesso por conta própria.
import React, { useEffect, useState } from 'react';
import { CheckCircle2, FolderLock, Hand, Loader2, Lock, MousePointer2, ShieldCheck, X } from 'lucide-react';
import { cc, isMac } from '../lib/api';
import { Button, Modal, cx } from './ui';
import { t } from '../lib/i18n';

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
    <Modal open={open} onClose={close} width={560} title={t("Acesso Total ao Disco")}
      footer={phase === 'intro' ? <>
        <Button onClick={close}>{t("Agora não")}</Button>
        <Button variant="primary" icon={<ShieldCheck size={14} />} onClick={start}>{t("Abrir Ajustes e liberar")}</Button>
      </> : phase === 'waiting' ? <>
        <Button onClick={close}>{t("Cancelar")}</Button>
        <Button onClick={() => cc.fdaStart()}>{t("Abrir Ajustes de novo")}</Button>
      </> : <>
        <Button onClick={() => cc.fdaRelaunch()}>{t("Reabrir o CleanCode")}</Button>
        <Button variant="primary" onClick={() => setOpen(false)}>{t("Concluir")}</Button>
      </>}>
      {phase === 'done' ? (
        <div className="flex flex-col items-center py-4 text-center">
          <CheckCircle2 size={44} className="text-accent" />
          <div className="mt-3 text-[15px] font-semibold">{t("Acesso liberado")}</div>
          <p className="mt-1 max-w-[400px] text-[13px] text-muted">{t("Agora o CleanCode consegue analisar e limpar as pastas protegidas. Se alguma continuar com acesso negado, abra o app de novo.")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg bg-surface-2 p-3.5">
            <FolderLock size={20} className="mt-0.5 shrink-0 text-accent" />
            <div className="text-[12.5px] leading-relaxed text-muted">
              <span className="font-medium text-fg">{t("Para que serve:")}</span> {t("o macOS protege algumas pastas, como os caches e os registros de atividade de outros apps, os anexos do Mail e do Mensagens, os dados do Safari e a Lixeira. Sem esse acesso, essas pastas ficam fora da análise e da limpeza.")}
              <div className="mt-1.5"><span className="font-medium text-fg">{t("O que o CleanCode faz com ele:")}</span> {t("o CleanCode só lê as pastas para medir o espaço e só apaga o que você confirmar. Nenhum arquivo sai do seu Mac, e você pode desligar o acesso quando quiser nos Ajustes.")}</div>
            </div>
          </div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted">{t("Como liberar")}</div>
          <div className="space-y-3.5">
            <Step n={1} title={t("Adicione o CleanCode pelo +")} icon={<Hand size={13} className="text-accent" />}>
              {t("Os Ajustes abrem em Privacidade e Segurança. Nessa tela, clique em")} <b className="font-medium text-fg">{t("Acesso Total ao Disco")}</b>{t(". Ao lado, aparece uma janela pequena com o caminho do app já copiado. Então, clique no")} <Key>+</Key> {t("embaixo da lista, aperte")} <Key>⌘⇧G</Key>{t(", cole o caminho e clique em")} <Key>{t("Abrir")}</Key>{t(". Depois, ligue a chave do CleanCode.")}
            </Step>
            <Step n={2} title={t("Confirme os avisos do macOS")} icon={<MousePointer2 size={13} className="text-accent" />}>
              {t("Em “Choose Folders”, clique em")} <Key>{t("Ignorar Proteções do Sistema")}</Key>{t(". No alerta vermelho, clique nos três")} <Key tone="danger">{t("OK")}</Key> {t("(cada um muda para “Desfazer”). Depois, clique em")} <Key tone="danger">{t("Ativar Acesso Total ao Disco")}</Key>{t(". Esses avisos são os textos padrão da Apple e aparecem para qualquer app que pede esse acesso, como antivírus e programas de backup.")}
            </Step>
            <Step n={3} title={t("Digite sua senha ou use o Touch ID")} icon={<Lock size={13} className="text-accent" />}>
              {t("Pronto. O CleanCode percebe a mudança sozinho e volta para a frente da tela. Você só precisa fazer isso uma vez.")}
            </Step>
          </div>
          {phase === 'waiting' && (
            <div className="flex items-center gap-2.5 rounded-lg border border-line px-3.5 py-2.5 text-[13px]">
              <Loader2 size={15} className="animate-spin text-accent" />
              <span className="flex-1">{t("Aguardando você liberar nos Ajustes do Sistema…")}</span>
              <button className="text-muted hover:text-fg" title={t("Cancelar")} onClick={close}><X size={14} /></button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
