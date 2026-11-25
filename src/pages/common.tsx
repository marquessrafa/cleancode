import React, { useEffect, useState } from 'react';
import { HardDrive, FolderOpen, ChevronRight, Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, Drive, DriveHardware, isMac } from '../lib/api';
import { fmtSize, fmtNum, fmtPct, PALETTE, driveTag } from '../lib/format';
import { Button, Empty, ProgressBar, cx } from '../components/ui';
import { openFdaAssistant } from '../components/FdaAssistant';
import { t } from '../lib/i18n';

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx('h-full overflow-y-auto', className)}><div className="mx-auto max-w-[1400px] px-6 py-6">{children}</div></div>;
}

export function NeedsScan() {
  const { startScan } = useApp();
  const [drives, setDrives] = useState<Drive[]>([]);
  useEffect(() => { cc.drives().then(setDrives); }, []);
  return (
    <Empty
      icon={<HardDrive size={22} />}
      title={t("Nenhuma varredura ativa")}
      text={t("Escolha um disco ou uma pasta para analisar.")}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {drives.filter((d) => d.total > 0).map((d) => (
            <Button key={d.root} icon={<HardDrive size={14} />} onClick={() => startScan(d.root)}>{driveTag(d.root)} {d.label && <span className="text-muted">{d.label}</span>}</Button>
          ))}
          <Button variant="primary" icon={<FolderOpen size={14} />} onClick={async () => { const p = await cc.pickFolder(); if (p) startScan(p); }}>{t("Escolher pasta…")}</Button>
        </div>
      }
    />
  );
}

/** Mostra a pasta atual da análise (selecionada no Explorador) com trilha de navegação. */
export function ScopeBar({ right }: { right?: React.ReactNode }) {
  const { active, select, go } = useApp();
  const [crumbs, setCrumbs] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    if (!active) return;
    cc.scanQuery(active.id, 'nodeInfo', active.selected).then((n: any) => setCrumbs(n?.crumbs || [])).catch(() => setCrumbs([]));
  }, [active?.id, active?.selected]);
  if (!active) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-0.5 text-xs">
        <span className="mr-1 text-muted">{t("Escopo:")}</span>
        {crumbs.map((c, i) => (
          <React.Fragment key={c.id}>
            {i > 0 && <ChevronRight size={12} className="text-faint" />}
            <button onClick={() => select(c.id)} className={cx('rounded px-1.5 py-0.5 transition-colors hover:bg-hover', i === crumbs.length - 1 ? 'font-medium text-fg' : 'text-muted')}>{c.name}</button>
          </React.Fragment>
        ))}
        <button onClick={() => go('explorer')} className="ml-2 text-accent hover:underline">{t("alterar no Explorador")}</button>
      </div>
      <div className="flex items-center gap-2">
        <ScanBadge />
        {right}
      </div>
    </div>
  );
}

export function ScanBadge() {
  const { active } = useApp();
  if (!active || active.done) return null;
  return <span className="flex items-center gap-1.5 text-xs text-accent"><Loader2 size={12} className="animate-spin" /> {t("Varrendo…")} {fmtNum(active.progress?.files)} {t("arquivos")}</span>;
}

export function Donut({ data, size = 180, thickness = 26, center }: { data: { label: string; value: number; color?: string }[]; size?: number; thickness?: number; center?: React.ReactNode }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2, c = 2 * Math.PI * r;
  let acc = 0;
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const el = (
            <circle
              key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color || PALETTE[i % PALETTE.length]}
              strokeWidth={hover === i ? thickness + 4 : thickness} strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`} strokeDashoffset={-acc}
              style={{ transition: 'stroke-width .15s, stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)' }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            ><title>{`${d.label}: ${fmtPct(d.value / total)}`}</title></circle>
          );
          acc += len;
          return el;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {hover != null ? (<><div className="max-w-[70%] truncate text-xs text-muted">{data[hover].label}</div><div className="text-sm font-semibold text-fg">{fmtPct(data[hover].value / total)}</div></>) : center}
      </div>
    </div>
  );
}

export function BarList({ items, units, onClick, valueLabel }: { items: { key: string | number; label: React.ReactNode; value: number; sub?: string; color?: string }[]; units?: string; onClick?: (k: any) => void; valueLabel?: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <button key={it.key} onClick={() => onClick?.(it.key)} disabled={!onClick} className="group block w-full text-left">
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-fg">{it.label}</span>
            <span className="shrink-0 text-muted tnum">{valueLabel ? valueLabel(it.value) : fmtSize(it.value, units)}{it.sub && <span className="ml-2 text-faint">{it.sub}</span>}</span>
          </div>
          <ProgressBar value={it.value / max} tone={it.color || PALETTE[i % PALETTE.length]} className="h-2 group-hover:brightness-110" />
        </button>
      ))}
    </div>
  );
}

/** Identificadores de hardware de uma unidade: tipo, barramento, USB, marca e modelo. */
export function DriveBadges({ hw, loading, compact }: { hw?: DriveHardware; loading?: boolean; compact?: boolean }) {
  if (loading && !hw) return <div className="mt-1 flex gap-1.5">{[56, 48, 120].map((w, i) => <span key={i} className="skeleton h-[18px] rounded-full" style={{ width: w }} />)}</div>;
  if (!hw) return null;
  const chip = 'inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[11px] font-medium whitespace-nowrap';
  const mediaCls = hw.media === 'SSD' ? 'border-transparent bg-accent-soft text-accent' : hw.media === 'HD' ? 'border-line-strong bg-surface-2 text-fg' : 'border-line bg-surface-2 text-muted';
  const usb2 = hw.usb && /2\.0|1\.\d/.test(hw.usb);
  const details = [
    hw.brand && t("Fabricante: {0}", hw.brand), t("Modelo: {0}", hw.model), hw.firmware && t("Firmware: {0}", hw.firmware),
    hw.health && t("Saúde: {0}", hw.health === 'Healthy' ? t("boa") : t(hw.health)), hw.diskSize && t("Disco físico: {0}", fmtSize(hw.diskSize)), hw.usbNote && t(hw.usbNote),
  ].filter(Boolean).join('\n');
  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5" title={details}>
      <span className={chip + ' ' + mediaCls}>{hw.media === 'Desconhecido' ? t("Tipo desconhecido") : hw.media}</span>
      <span className={chip + ' border-line bg-surface-2 text-fg'}>{hw.bus}</span>
      {hw.usb && <span className={chip + ' ' + (usb2 ? 'border-transparent bg-warn-soft text-warn' : 'border-transparent bg-accent-soft text-accent')}>{hw.usb}</span>}
      {hw.usbNote && <AlertTriangle size={13} className="text-warn"><title>{hw.usbNote}</title></AlertTriangle>}
      {!compact && <span className="min-w-0 truncate text-[11px] text-muted">{hw.brand && !hw.model.toLowerCase().includes(hw.brand.split(' ')[0].toLowerCase()) ? `${hw.brand} · ` : ''}{hw.model}</span>}
    </div>
  );
}

/** macOS: aviso quando o app não tem "Acesso Total ao Disco" (pastas como ~/Library e a Lixeira ficam sem leitura). */
export function FullDiskAccessBanner({ className }: { className?: string }) {
  const [ok, setOk] = useState<boolean | null>(true);
  useEffect(() => {
    if (!isMac) return;
    const check = () => cc.fullDiskAccess().then(setOk).catch(() => {});
    check();
    // volta dos Ajustes do Sistema: confere de novo
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);
  if (!isMac || ok !== false) return null;
  return (
    <div className={cx('flex flex-wrap items-center gap-3 rounded-lg border border-transparent bg-warn-soft px-4 py-3', className)}>
      <ShieldAlert size={18} className="shrink-0 text-warn" />
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="font-medium text-fg">{t("O CleanCode não tem Acesso Total ao Disco")}</div>
        <div className="text-xs text-muted">{t("Sem esse acesso, pastas como ~/Library, Mail e a Lixeira ficam fora dos totais.")}</div>
      </div>
      <Button size="sm" variant="primary" icon={<ShieldAlert size={13} />} onClick={openFdaAssistant}>{t("Liberar acesso")}</Button>
    </div>
  );
}

export function useDriveHardware() {
  const [hw, setHw] = useState<DriveHardware[] | null>(null);
  useEffect(() => { let alive = true; cc.drivesHardware().then((h) => alive && setHw(h)).catch(() => alive && setHw([])); return () => { alive = false; }; }, []);
  // Windows: letra da unidade; macOS: ponto de montagem completo
  const byRoot = (root: string) => hw?.find((h) => (h.letter.length > 1 ? h.letter === root : h.letter.toUpperCase() === root.slice(0, 1).toUpperCase()));
  return { hw, loading: hw === null, byRoot };
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <div className="space-y-1">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: it.color }} />
          <span className="flex-1 truncate text-fg">{it.label}</span>
          {it.value && <span className="text-muted tnum">{it.value}</span>}
        </div>
      ))}
    </div>
  );
}
