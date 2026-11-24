// Janela "Novidades": aparece uma vez na primeira abertura depois de uma atualização.
import React, { useEffect, useState } from 'react';
import { Wrench, Globe, Gamepad2, PanelTop, Download, Sparkles, X, CircuitBoard } from 'lucide-react';
import { cc } from '../lib/api';
import { CHANGELOG, Release } from '../lib/changelog';
import { t as tr } from '../lib/i18n';

const ICON = { wrench: Wrench, globe: Globe, gamepad: Gamepad2, panel: PanelTop, download: Download, sparkles: Sparkles, chip: CircuitBoard };
const newer = (a: string, b: string) => { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); return false; };

export default function WhatsNew() {
  const [rel, setRel] = useState<Release[] | null>(null);
  useEffect(() => {
    cc.whatsNew().then((r) => {
      if (!r.show) return;
      // tudo o que mudou desde a versão anterior instalada (ou só a atual, se não souber)
      const list = CHANGELOG.filter((c) => !newer(c.version, r.version) && (!r.previous || newer(c.version, r.previous)));
      if (list.length) setRel(list); else cc.whatsNewSeen();
    }).catch(() => null);
  }, []);
  if (!rel) return null;
  const close = () => { cc.whatsNewSeen(); setRel(null); };
  const top = rel[0];
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm" onClick={close}>
      <div className="anim-pop flex max-h-[86vh] w-[640px] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative px-7 pb-5 pt-7" style={{ background: 'linear-gradient(160deg, color-mix(in srgb, var(--accent) 28%, transparent), transparent 70%)' }}>
          <button onClick={close} className="absolute right-4 top-4 rounded-lg p-1.5 text-muted hover:bg-[var(--hover)]"><X size={16} /></button>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--on-accent)]" style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #000))' }}><Sparkles size={22} /></span>
            <div><div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--accent)]">{tr("Novidades da versão")} {top.version}</div><div className="text-[22px] font-semibold tracking-tight">{tr(top.headline)}</div></div>
          </div>
        </div>
        <div className="overflow-y-auto px-7 pb-2">
          {rel.map((r) => (
            <div key={r.version}>
              {rel.length > 1 && <div className="mb-2 mt-4 text-[12px] font-semibold text-muted">{tr("Versão")} {r.version}</div>}
              {r.groups.map((g, i) => {
                const Icon = ICON[g.icon];
                return (
                  <div key={g.title} className="anim-rise flex gap-3.5 border-b border-[var(--line)] py-4 last:border-0" style={{ animationDelay: `${i * 60}ms` }}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]"><Icon size={18} /></span>
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold">{tr(g.title)}</div>
                      <ul className="mt-1.5 space-y-1">{g.items.map((t, k) => <li key={k} className="flex gap-2 text-[13px] leading-snug text-muted"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />{tr(t)}</li>)}</ul>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t border-[var(--line)] px-7 py-4">
          <button onClick={close} className="rounded-lg px-5 py-2 text-[13px] font-semibold text-[var(--on-accent)]" style={{ background: 'var(--accent)' }}>{tr("Começar a usar")}</button>
        </div>
      </div>
    </div>
  );
}
