// Discos: escolhe o disco (ou a pasta) que a aba aberta vai analisar.
// Cada aba do topo tem a própria análise. A aba nova (botão + do topo) abre esta tela, e o disco escolhido fica ligado
// a ela. As telas do grupo Análise de disco mostram a análise da aba aberta.
import React, { useEffect, useState } from 'react';
import { HardDrive, FolderOpen, ArrowRight, Usb, Network, Disc, MemoryStick, Layers } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, Drive } from '../lib/api';
import { fmtSize, fmtPct, driveTag, baseName } from '../lib/format';
import { Button, PageHeader, ProgressBar } from '../components/ui';
import { DriveBadges, PageBody, useDriveHardware } from './common';
import { t } from '../lib/i18n';

export default function Disks() {
  const { startScan, settings, go, active, scans, tabs, activeTab, activateTab } = useApp();
  const units = settings?.units || 'auto';
  const [drives, setDrives] = useState<Drive[] | null>(null);
  const hw = useDriveHardware();
  useEffect(() => { cc.drives().then((d) => setDrives(d.filter((x) => x.total > 0))).catch(() => setDrives([])); }, []);
  const pick = async () => { const p = await cc.pickFolder(); if (p) startScan(p, { here: true }); };
  const same = (a: string, b: string) => a.toLowerCase().replace(/\\+$/, '') === b.toLowerCase().replace(/\\+$/, '');
  // a aba (outra, não a aberta) que já analisa este disco
  const otherTab = (root: string) => tabs.find((tb) => tb.key !== activeTab && tb.scanId !== null && scans.some((s) => s.id === tb.scanId && same(s.root, root)));

  return (
    <PageBody>
      <PageHeader
        title={t("Discos")}
        description={t("Escolha o disco ou a pasta que esta aba vai analisar. Cada aba tem a própria análise, e o botão + do topo abre uma aba nova.")}
        actions={<Button icon={<FolderOpen size={14} />} onClick={pick}>{t("Analisar uma pasta…")}</Button>}
      />

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-[var(--line)] p-3.5 text-[13px]" style={{ background: 'linear-gradient(110deg, color-mix(in srgb, var(--accent) 10%, var(--surface)), var(--surface) 70%)' }}>
        <Layers size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        {active ? (
          <div><span className="font-semibold">{t("Esta aba analisa {0}.", baseName(active.root) || active.root)}</span> <span className="text-muted">{t("Se você escolher outro disco aqui, a análise desta aba troca para ele. Para analisar os dois ao mesmo tempo, abra uma aba nova pelo botão + do topo.")}</span></div>
        ) : (
          <div><span className="font-semibold">{t("Esta aba ainda não tem análise.")}</span> <span className="text-muted">{t("Escolha um disco abaixo. As telas de Análise de disco desta aba vão mostrar esse disco, e as outras abas continuam com as análises delas.")}</span></div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {drives === null && [0, 1, 2].map((i) => <div key={i} className="skeleton h-[160px] rounded-xl" />)}
        {(drives || []).map((d, i) => {
          const pct = d.total ? d.used / d.total : 0;
          const tone = pct > 0.9 ? 'var(--danger)' : pct > 0.75 ? 'var(--warn)' : 'var(--accent)';
          const h = hw.byRoot(d.root);
          const Icon = h?.bus === 'USB' || d.type === 'Removível' ? Usb : d.type === 'Rede' ? Network : d.type === 'CD/DVD' ? Disc : h?.media === 'SSD' ? MemoryStick : HardDrive;
          const here = !!active && same(active.root, d.root);
          const other = otherTab(d.root);
          return (
            <div key={d.root} className={`group relative overflow-hidden rounded-xl border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg ${here ? 'border-[var(--accent)]' : 'border-line hover:border-accent'}`}
              style={{ animation: `fade-up .3s ${i * 50}ms both`, background: 'linear-gradient(150deg, color-mix(in srgb, var(--accent) 9%, var(--surface)), var(--surface) 60%)' }}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--on-accent)] shadow-md" style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000))' }}><Icon size={20} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-fg">{d.label || t("Disco local")}</div>
                  <div className="text-[12px] text-muted">{driveTag(d.root)} · {d.fs}</div>
                </div>
                <div className="text-right"><div className="text-[18px] font-semibold tnum leading-none" style={{ color: tone }}>{fmtPct(pct, 0)}</div><div className="text-[11px] text-muted">{t("usado")}</div></div>
              </div>
              <div className="mt-2"><DriveBadges hw={h} loading={hw.loading} /></div>
              <ProgressBar value={pct} tone={tone} className="mt-2 h-2" />
              <div className="mt-1.5 text-[12px] text-muted tnum"><b className="font-medium text-fg">{fmtSize(d.free, units)}</b> {t("livres de")} {fmtSize(d.total, units)}</div>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {other && !here && <Button size="sm" variant="outline" onClick={() => activateTab(other.key)}>{t("Abrir a aba deste disco")}</Button>}
                {here
                  ? <Button size="sm" onClick={() => go('explorer')}>{t("Abrir a análise")} <ArrowRight size={12} /></Button>
                  : <Button size="sm" variant="primary" onClick={() => startScan(d.root, { here: true })}>{t("Analisar nesta aba")} <ArrowRight size={12} /></Button>}
              </div>
            </div>
          );
        })}
        <button onClick={pick} className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-[13px] text-muted transition-colors hover:border-accent hover:text-fg">
          <FolderOpen size={22} />{t("Escolher uma pasta para esta aba")}
        </button>
      </div>
    </PageBody>
  );
}
