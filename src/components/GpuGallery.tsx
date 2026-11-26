// Galeria das placas de vídeo com foto (só na prévia simulada da tela Ventoinhas, CLEANCODE_PREVIEW_FANS=1).
// Mostra todas as placas do catálogo com as ventoinhas girando, com o mesmo desenho dos cartões da tela Ventoinhas.
// Um controle de RPM vale para todas as placas ao mesmo tempo, e a placa escolhida aparece grande, como no painel.
import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { GpuHero, GpuTileArt, useGpuCatalog, type GpuCard } from './GpuArt';
import { Input, cx } from './ui';
import { t as tr, LOCALE } from '../lib/i18n';

const PRESETS = [0, 800, 1500, 2200, 3300];

export function GpuGallery() {
  const cards = useGpuCatalog();
  const [rpm, setRpm] = useState(1500);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<GpuCard | null>(null);
  const list = useMemo(() => (cards || []).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())), [cards, q]);
  const fmt = (n: number) => n.toLocaleString(LOCALE);
  if (!cards) return null;
  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{tr("Galeria das placas de vídeo")}</div>
          <div className="text-[12px] text-muted">{tr("A prévia mostra as {0} placas com foto. O controle de RPM vale para todas as placas ao mesmo tempo.", cards.length)}</div>
        </div>
        <Input className="w-60" icon={<Search size={14} />} placeholder={tr("Buscar placa")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input type="range" min={0} max={3500} step={10} value={rpm} onChange={(e) => setRpm(Number(e.target.value))} aria-label={tr("Rotação das ventoinhas")} className="w-72 accent-[var(--accent)]" />
        <span className="w-24 text-[15px] font-semibold tabular-nums">{fmt(rpm)} <span className="text-[11px] font-normal text-muted">RPM</span></span>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => setRpm(p)} className={cx('rounded-lg border px-2.5 py-1 text-[12px] tabular-nums transition-colors', rpm === p ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--line)] text-muted hover:text-[var(--fg)]')}>{fmt(p)}</button>
          ))}
        </div>
      </div>
      {sel && (
        <div className="relative mt-4 overflow-hidden rounded-xl border border-[var(--line)]" style={{ height: 230 }}>
          <GpuHero card={sel} rpm={rpm} height={230} />
          <div className="pointer-events-none absolute bottom-3 right-4 text-right">
            <div className="text-[15px] font-semibold">{sel.name}</div>
            <div className="text-[12px] text-muted">{tr("{0} ventoinha(s)", sel.fans.length)}</div>
          </div>
        </div>
      )}
      <div className="mt-4 grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
        {list.map((c) => (
          <button key={c.file} onClick={() => setSel(c)} className={cx('relative h-[84px] overflow-hidden rounded-xl border text-left transition-colors', sel?.file === c.file ? 'border-[color-mix(in_srgb,var(--accent)_60%,transparent)]' : 'border-[var(--line)] hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--line))]')}
            style={{ background: 'var(--surface)' }}>
            <GpuTileArt card={c} rpm={rpm} />
            <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(90deg, transparent 0%, transparent 34%, color-mix(in srgb, var(--surface) 88%, transparent) 50%, var(--surface) 60%)' }} />
            <div className="absolute bottom-2 left-[44%] right-2.5 top-2 flex flex-col">
              <span className="break-words text-[12px] font-semibold leading-tight">{c.name}</span>
              <span className="mt-auto text-[11px] text-muted">{tr("{0} ventoinha(s)", c.fans.length)}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
