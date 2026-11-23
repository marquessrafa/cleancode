// Peças comuns das telas de manutenção novas (Reparos, Navegadores, Modo Jogo): a tela de entrada
// com a esfera animada e o botão redondo, igual às de Limpeza e Proteção.
import React from 'react';
import { cx } from '../components/ui';

export function Orb({ icon, active, tone = 'var(--accent)', size = 220 }: { icon: React.ReactNode; active?: boolean; tone?: string; size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className={cx('absolute inset-[14%] rounded-full blur-3xl', active && 'anim-breathe')} style={{ background: `color-mix(in srgb, ${tone} 40%, transparent)` }} />
      <svg viewBox="0 0 200 200" className="absolute inset-0">
        <g className={active ? 'anim-spin-fast' : 'anim-spin-slow'} style={{ transformOrigin: '100px 100px' }}>
          <circle cx="100" cy="100" r="88" fill="none" stroke={tone} strokeOpacity=".22" strokeWidth="1.5" strokeDasharray="2 8" />
          <circle cx="100" cy="12" r="4" fill={tone} />
        </g>
        <g className="anim-spin-rev" style={{ transformOrigin: '100px 100px' }}>
          <circle cx="100" cy="100" r="74" fill="none" stroke={tone} strokeOpacity=".35" strokeWidth="2" strokeDasharray="60 400" strokeLinecap="round" />
        </g>
      </svg>
      <div className="absolute inset-[27%] flex items-center justify-center rounded-full text-white shadow-2xl" style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${tone} 65%, #fff), ${tone} 55%, color-mix(in srgb, ${tone} 60%, #000))` }}>
        {icon}
      </div>
    </div>
  );
}

export function Hero({ icon, title, text, bullets, action, busy, busyText, note }: {
  icon: React.ReactNode; title: string; text: React.ReactNode; bullets: { icon: React.ReactNode; text: React.ReactNode }[];
  action: { label: string; onClick: () => void }; busy?: boolean; busyText?: React.ReactNode; note?: React.ReactNode;
}) {
  return (
    <div className="flex h-full items-center justify-center gap-16 px-10">
      <Orb icon={icon} active={busy} />
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
