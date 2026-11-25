// Guia "Como fazer esta ventoinha obedecer": aparece quando uma ventoinha não segue o comando da placa-mãe
// (o RPM não muda ou a placa recusa), no painel da ventoinha, no assistente e na ajuda da tela.
// As causas vêm de PCs reais: ventoinhas num hub de outra marca (por exemplo, 10 ventoinhas da Lian Li num CHA_FAN,
// que passaram a obedecer depois de sincronizar o hub com a placa-mãe), ventoinhas de 3 pinos em modo PWM, conectores
// ligados a outro chip ou que copiam o sinal de outro (o CPU_OPT de várias placas ASUS segue o CPU_FAN) e peças que só
// recebem a velocidade pelo USB (como a ventoinha embutida no bloco de alguns water coolers).
import React, { useState } from 'react';
import { HelpCircle, ChevronDown, Network, Plug, Usb, Cpu } from 'lucide-react';
import { cx } from '../components/ui';
import { t as tr } from '../lib/i18n';

export function FanHelp({ defaultOpen = false, compact = false, general = false }: { defaultOpen?: boolean; compact?: boolean; general?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cx('rounded-xl border border-[var(--line)] text-[12.5px]', compact ? 'bg-[var(--surface-2)]' : 'bg-[var(--surface)]')}>
      <button className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left font-semibold" onClick={() => setOpen((v) => !v)}>
        <HelpCircle size={15} className="text-[var(--accent)]" />{general ? tr("Quando uma ventoinha não obedece") : tr("Como fazer esta ventoinha obedecer")}
        <ChevronDown size={15} className={cx('ml-auto text-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 px-3.5 pb-3.5">
          <Cause icon={<Network size={15} />} title={tr("Ventoinhas num hub de outra marca")}>
            <p>{tr("Ventoinhas num hub da marca, como Lian Li, Corsair ou NZXT, seguem o programa da marca, e não a placa-mãe.")}</p>
            <p>{tr("No programa da marca, ative o modo que segue a placa-mãe, que costuma se chamar MB Sync.")}</p>
            <p>{tr("Na Lian Li, essa opção fica no L-Connect.")}</p>
            <p>{tr("Se o hub não tiver esse modo, ligue as ventoinhas direto na placa-mãe.")}</p>
          </Cause>
          <Cause icon={<Plug size={15} />} title={tr("Ventoinha de 3 pinos num conector em modo PWM")}>
            <p>{tr("Uma ventoinha de 3 pinos ignora o sinal PWM. Na BIOS, mude o modo desse conector para DC.")}</p>
          </Cause>
          <Cause icon={<Cpu size={15} />} title={tr("Conector ligado a outro chip, ou que copia outro conector")}>
            <p>{tr("Alguns conectores usam um chip sem suporte, ou copiam outro conector, como o CPU_OPT, que segue o CPU_FAN.")}</p>
            <p>{tr("Use o Testar em cada saída. Se nenhuma mexer na ventoinha, ligue ela em outro conector.")}</p>
          </Cause>
          <Cause icon={<Usb size={15} />} title={tr("Peças controladas pelo USB")}>
            <p>{tr("Peças controladas pelo cabo USB, como a ventoinha de alguns water coolers, só mudam pelo programa da marca.")}</p>
          </Cause>
          <p className="text-muted">{tr("Depois, use o Testar para conferir.")}</p>
        </div>
      )}
    </div>
  );
}

function Cause({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 shrink-0 text-[var(--accent)]">{icon}</div>
      <div className="space-y-1"><div className="font-semibold">{title}</div><div className="space-y-1 text-muted">{children}</div></div>
    </div>
  );
}
