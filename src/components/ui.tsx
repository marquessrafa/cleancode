import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2, X } from 'lucide-react';

export const cx = (...c: unknown[]) => c.filter((x) => typeof x === 'string' && x).join(' ');

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'outline'; size?: 'sm' | 'md'; icon?: React.ReactNode; loading?: boolean;
};
export function Button({ variant = 'default', size = 'md', icon, loading, className, children, disabled, ...p }: BtnProps) {
  const v = {
    default: 'bg-surface-2 hover:bg-hover border border-line text-fg',
    outline: 'bg-transparent hover:bg-hover border border-line text-fg',
    primary: 'bg-accent text-accent-fg hover:brightness-110 border border-transparent shadow-sm',
    ghost: 'bg-transparent hover:bg-hover text-muted hover:text-fg border border-transparent',
    danger: 'bg-danger text-white hover:brightness-110 border border-transparent',
  }[variant];
  return (
    <button
      {...p}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-all duration-150 active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]', v, className,
      )}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ title, children, className, active, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      title={title}
      {...p}
      className={cx('inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40 disabled:pointer-events-none', active && 'bg-hover text-fg', className)}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, title, actions, pad = true }: { className?: string; children: React.ReactNode; title?: React.ReactNode; actions?: React.ReactNode; pad?: boolean }) {
  return (
    <div className={cx('rounded-lg border border-line bg-surface', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="text-[13px] font-medium text-fg">{title}</div>
          <div className="flex items-center gap-1.5">{actions}</div>
        </div>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, icon, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; tone?: 'accent' | 'warn' | 'danger' }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {icon && <span className={cx(tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : 'text-accent')}>{icon}</span>}
      </div>
      <div className="mt-1.5 text-xl font-semibold tnum text-fg">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; title?: string }[]; size?: 'sm' | 'md' }) {
  return (
    <div className="seg-glass inline-flex rounded-md border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-[5px] px-2.5 font-medium transition-all duration-150 inline-flex items-center gap-1.5',
            size === 'sm' ? 'h-6 text-xs' : 'h-7 text-xs',
            value === o.value ? 'seg-on text-fg' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; hint?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex items-start justify-between gap-4 py-2', disabled ? 'opacity-50' : 'cursor-pointer')}>
      {label && (
        <span>
          <span className="block text-[13px] text-fg">{label}</span>
          {hint && <span className="block text-xs text-muted mt-0.5">{hint}</span>}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        className={cx('relative mt-0.5 block h-5 w-9 shrink-0 overflow-hidden rounded-full p-0 transition-colors duration-200', checked ? 'bg-accent' : 'bg-line-strong')}
      >
        <span className={cx('absolute left-0.5 top-0.5 block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out', checked ? 'translate-x-4' : 'translate-x-0')} />
      </button>
    </label>
  );
}

export function Checkbox({ checked, onChange, indeterminate, className }: { checked: boolean; onChange: (v: boolean, e: React.MouseEvent) => void; indeterminate?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(!checked, e); }}
      className={cx('flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors', checked || indeterminate ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong bg-surface hover:border-faint', className)}
    >
      {checked ? <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6.5l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
        : indeterminate ? <span className="h-0.5 w-2 rounded bg-current" /> : null}
    </button>
  );
}

export function Input({ className, icon, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) {
  return (
    <div className={cx('relative flex items-center', className)}>
      {icon && <span className="pointer-events-none absolute left-2.5 text-faint">{icon}</span>}
      <input
        {...p}
        className={cx('h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg placeholder:text-faint outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20', icon && 'pl-8')}
      />
    </div>
  );
}

export function Select({ value, onChange, options, className, title }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string; title?: string }) {
  return (
    <div className={cx('relative', className)} title={title}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full appearance-none rounded-md border border-line bg-surface pl-2.5 pr-7 text-[13px] text-fg outline-none transition-colors focus:border-accent"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-faint" />
    </div>
  );
}

export function Badge({ children, tone = 'default', className, title }: { children: React.ReactNode; tone?: 'default' | 'accent' | 'warn' | 'danger' | 'info'; className?: string; title?: string }) {
  const t = {
    default: 'bg-surface-2 text-muted border-line',
    accent: 'bg-accent-soft text-accent border-transparent',
    warn: 'bg-warn-soft text-warn border-transparent',
    danger: 'bg-danger-soft text-danger border-transparent',
    info: 'bg-surface-2 text-info border-line',
  }[tone];
  return <span title={title} className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', t, className)}>{children}</span>;
}

export function ProgressBar({ value, indeterminate, className, tone }: { value?: number; indeterminate?: boolean; className?: string; tone?: string }) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', indeterminate && 'indeterminate', className)}>
      {!indeterminate && <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${Math.max(0, Math.min(1, value || 0)) * 100}%`, background: tone || 'var(--accent)' }} />}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 p-8 text-center anim-fade">
      {icon && <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted">{icon}</div>}
      <div className="text-sm font-medium text-fg">{title}</div>
      {text && <div className="max-w-md text-xs text-muted leading-relaxed">{text}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) { return <Loader2 size={size} className="animate-spin text-muted" />; }

// ---------- menus ----------
export interface MenuItem { label?: string; icon?: React.ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean; separator?: boolean; hint?: string }

export function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  return (
    <div className="min-w-[200px] rounded-lg border border-line bg-surface p-1 shadow-xl shadow-black/10 anim-pop">
      {items.map((it, i) =>
        it.separator ? <div key={i} className="my-1 h-px bg-line" /> : (
          <button
            key={i}
            disabled={it.disabled}
            onClick={() => { onClose(); it.onClick?.(); }}
            className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors disabled:opacity-40', it.danger ? 'text-danger hover:bg-danger-soft' : 'text-fg hover:bg-hover')}
          >
            <span className="w-4 text-muted [&>svg]:w-4 [&>svg]:h-4">{it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {it.hint && <span className="text-[11px] text-faint">{it.hint}</span>}
          </button>
        ))}
    </div>
  );
}

export function Dropdown({ trigger, items, align = 'left' }: { trigger: React.ReactElement<any>; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    setTimeout(() => document.addEventListener('mousedown', h));
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <>
      {React.cloneElement(trigger, {
        onClick: (e: React.MouseEvent) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPos({ x: align === 'right' ? r.right : r.left, y: r.bottom + 4 });
          setOpen((o) => !o);
        },
      })}
      {open && createPortal(
        <div ref={ref} className="fixed z-50" style={{ top: pos.y, ...(align === 'right' ? { right: window.innerWidth - pos.x } : { left: pos.x }) }}>
          <MenuList items={items} onClose={() => setOpen(false)} />
        </div>, document.body)}
    </>
  );
}

let ctxSetter: ((s: { x: number; y: number; items: MenuItem[] } | null) => void) | null = null;
export function openContextMenu(e: React.MouseEvent, items: MenuItem[]) {
  e.preventDefault();
  ctxSetter?.({ x: e.clientX, y: e.clientY, items });
}
export function ContextMenuHost() {
  const [s, setS] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [adj, setAdj] = useState({ x: 0, y: 0 });
  ctxSetter = setS;
  useEffect(() => {
    if (!s) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setS(null); };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setS(null);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    window.addEventListener('blur', () => setS(null), { once: true });
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [s]);
  useLayoutEffect(() => {
    if (!s || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setAdj({ x: Math.min(s.x, window.innerWidth - r.width - 8), y: Math.min(s.y, window.innerHeight - r.height - 8) });
  }, [s]);
  if (!s) return null;
  return createPortal(
    <div ref={ref} className="fixed z-[60]" style={{ left: adj.x || s.x, top: adj.y || s.y }}>
      <MenuList items={s.items} onClose={() => setS(null)} />
    </div>, document.body);
}

export function Modal({ open, onClose, title, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] anim-fade p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-full w-full flex-col rounded-xl border border-line bg-surface shadow-2xl anim-pop" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="text-sm font-semibold text-fg">{title}</div>
          <IconButton title="Fechar" onClick={onClose}><X size={16} /></IconButton>
        </div>
        <div className="min-h-0 overflow-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>, document.body);
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: React.ReactNode; icon?: React.ReactNode }[] }) {
  return (
    <div className="flex items-center gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cx('relative flex items-center gap-1.5 px-3 py-2 text-[13px] transition-colors', value === t.value ? 'text-fg' : 'text-muted hover:text-fg')}
        >
          {t.icon}{t.label}
          <span className={cx('absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent transition-all duration-200', value === t.value ? 'opacity-100' : 'opacity-0 scale-x-50')} />
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, description, icon, actions }: { title: string; description?: React.ReactNode; icon?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 pb-5">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-accent">{icon}</div>}
        <div>
          <h1 className="text-lg font-semibold text-fg">{title}</h1>
          {description && <p className="mt-0.5 max-w-2xl text-[13px] text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
