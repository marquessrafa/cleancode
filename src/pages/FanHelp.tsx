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
            <p>{tr("Muitas ventoinhas ficam ligadas num hub da própria marca, como os da Lian Li, da Corsair, da NZXT e da Thermaltake. Nesse caso, quem decide a velocidade é o programa da marca, e o cabo ligado na placa-mãe só informa o RPM.")}</p>
            <p>{tr("Para resolver, abra o programa da marca e ative o modo que segue a placa-mãe. Esse modo costuma se chamar algo como sincronizar com a placa-mãe, ou MB Sync.")}</p>
            <p>{tr("Nas ventoinhas da Lian Li, por exemplo, essa opção fica no L-Connect. Depois de ativar, o hub passa a seguir o conector da placa, e o CleanCode consegue controlar todas as ventoinhas ligadas nele.")}</p>
            <p>{tr("Se o hub não tiver esse modo, ligue as ventoinhas direto num conector da placa-mãe, ou controle a velocidade pelo programa da marca.")}</p>
          </Cause>
          <Cause icon={<Plug size={15} />} title={tr("Ventoinha de 3 pinos num conector em modo PWM")}>
            <p>{tr("Uma ventoinha de 3 pinos não entende o sinal PWM e gira sempre na mesma velocidade. Na BIOS, abra o controle de ventoinhas e mude o modo desse conector para DC.")}</p>
          </Cause>
          <Cause icon={<Cpu size={15} />} title={tr("Conector ligado a outro chip, ou que copia outro conector")}>
            <p>{tr("Em algumas placas-mãe, um conector é controlado por um chip que o LibreHardwareMonitor não consegue usar. Em outras, um conector não tem controle próprio e copia o sinal de outro, como o CPU_OPT, que costuma seguir o CPU_FAN.")}</p>
            <p>{tr("Para descobrir, use o Testar em cada saída, inclusive nas vazias. Se nenhuma saída mexer na ventoinha, ligue ela em outro conector. O conector que sobrar pode ficar com a bomba do water cooler, que normalmente gira sempre rápido.")}</p>
          </Cause>
          <Cause icon={<Usb size={15} />} title={tr("Peças controladas pelo USB")}>
            <p>{tr("Algumas peças recebem a velocidade só pelo cabo USB, como a ventoinha embutida no bloco de alguns water coolers. Essas peças não seguem a placa-mãe, então só o programa da marca consegue mudar a velocidade delas.")}</p>
          </Cause>
          <p className="text-muted">{tr("Depois de mudar alguma coisa, use o botão Testar ou o assistente para conferir se a ventoinha passou a obedecer.")}</p>
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
