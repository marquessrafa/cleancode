// Peças comuns das telas de manutenção novas (Reparos, Navegadores, Modo Jogo): a tela de entrada
// com a esfera animada e o botão redondo, igual às de Limpeza e Proteção.
import React from 'react';
import { cx } from '../components/ui';

/** Objeto 3D solto (sem bloco): o ícone da tela extrudado em camadas, flutuando e girando, com anéis
 *  orbitais e partículas em profundidade. Inclina com o mouse; acelera quando há algo executando. */
export function Float3D({ icon, active, tone = 'var(--accent)', size = 260 }: { icon: React.ReactElement<any>; active?: boolean; tone?: string; size?: number }) {
  const [t, setT] = React.useState({ x: 0, y: 0 });
  const L = 14, isz = Math.round(size * 0.36);
  const parts = React.useMemo(() => Array.from({ length: 14 }, (_, i) => ({ l: 8 + ((i * 37) % 84), tp: 6 + ((i * 53) % 86), z: -90 + ((i * 41) % 180), s: 2 + (i % 3) * 1.5, d: (i * 0.37) % 3 })), []);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size, perspective: 900 }}
      onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setT({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 }); }}
      onMouseLeave={() => setT({ x: 0, y: 0 })}>
      <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d', transform: `rotateX(${14 - t.y * 18}deg) rotateY(${t.x * 26}deg)`, transition: 'transform .3s ease-out' }}>
        {/* brilho no "chão" */}
        <div className={active ? 'anim-breathe' : ''} style={{ position: 'absolute', left: '18%', right: '18%', top: '74%', height: size * 0.16, borderRadius: '50%', background: tone, opacity: 0.32, filter: 'blur(26px)', transform: 'rotateX(80deg) translateZ(-40px)' }} />
        {/* anéis orbitais inclinados */}
        <div className="f3d-ring absolute inset-[4%]" style={{ ['--rx' as any]: '74deg', ['--ry' as any]: '0deg', animationDuration: active ? '3s' : '9s' }}>
          <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: `color-mix(in srgb, ${tone} 45%, transparent)`, boxShadow: `0 0 18px color-mix(in srgb, ${tone} 35%, transparent)` }} />
          <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full" style={{ background: tone, boxShadow: `0 0 12px ${tone}` }} />
        </div>
        <div className="f3d-ring absolute inset-[14%]" style={{ ['--rx' as any]: '68deg', ['--ry' as any]: '38deg', animationDuration: active ? '4.5s' : '13s', animationDirection: 'reverse' }}>
          <div className="absolute inset-0 rounded-full border border-dashed" style={{ borderColor: `color-mix(in srgb, ${tone} 35%, transparent)` }} />
          <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full" style={{ background: `color-mix(in srgb, ${tone} 70%, #fff)` }} />
        </div>
        {/* ícone extrudado */}
        <div className="f3d-float absolute left-1/2 top-1/2" style={{ transformStyle: 'preserve-3d' }}>
          <div className="f3d-sway" style={{ transformStyle: 'preserve-3d', animationDuration: active ? '2.4s' : '7s' }}>
            {Array.from({ length: L }, (_, i) => {
              const front = i === L - 1;
              return (
                <div key={i} className="absolute" style={{ transform: `translate(-50%, -50%) translateZ(${(i - L / 2) * 2.2}px)` }}>
                  {React.cloneElement(icon, {
                    size: isz, strokeWidth: 2.3,
                    style: { display: 'block', color: front ? '#fff' : `color-mix(in srgb, ${tone} ${35 + (i / L) * 55}%, #000)`, filter: front ? `drop-shadow(0 0 ${active ? 22 : 14}px ${tone}) drop-shadow(0 0 2px ${tone})` : undefined },
                  })}
                </div>
              );
            })}
          </div>
        </div>
        {/* partículas em profundidade */}
        {parts.map((p, i) => <span key={i} className="f3d-particle absolute rounded-full" style={{ left: `${p.l}%`, top: `${p.tp}%`, width: p.s, height: p.s, background: tone, boxShadow: `0 0 6px ${tone}`, transform: `translateZ(${p.z}px)`, animationDelay: `${p.d}s`, animationDuration: active ? '1.6s' : '3.6s' }} />)}
      </div>
    </div>
  );
}
/** compatibilidade: telas que usavam a esfera */
export function Orb({ icon, active, tone, size = 220 }: { icon: React.ReactNode; active?: boolean; tone?: string; size?: number }) {
  return <Float3D icon={icon as React.ReactElement<any>} active={active} tone={tone} size={size} />;
}

export function Hero({ icon, title, text, bullets, action, busy, busyText, note }: {
  icon: React.ReactNode; title: string; text: React.ReactNode; bullets: { icon: React.ReactNode; text: React.ReactNode }[];
  action: { label: string; onClick: () => void }; busy?: boolean; busyText?: React.ReactNode; note?: React.ReactNode;
}) {
  return (
    <div className="flex h-full items-center justify-center gap-16 px-10">
      <Float3D icon={icon as React.ReactElement<any>} active={busy} size={280} />
      <div className="anim-rise max-w-md">
        <h1 className="text-[34px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{text}</p>
        <ul className="mt-5 space-y-2.5">
          {bullets.map((b, i) => <li key={i} className="flex items-center gap-3 text-[13px]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">{b.icon}</span>{b.text}</li>)}
        </ul>
        {note && <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[12px] text-muted">{note}</div>}
        <button disabled={busy} onClick={action.onClick}
          className="mt-7 flex h-[86px] w-[86px] items-center justify-center rounded-full text-[15px] font-semibold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-80"
          style={{ background: 'radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent) 70%, #fff), var(--accent))' }}>
          {busy ? <span className="text-[12px] leading-tight">{busyText || '…'}</span> : action.label}
        </button>
      </div>
    </div>
  );
}
