// Navegadores: o que cada perfil de cada navegador guarda (cache, histórico, downloads, cookies,
// sessões, preenchimento) e quanto ocupa; limpeza por item e otimização dos bancos internos.
import React, { useMemo, useState } from 'react';
import { Globe, Sparkles, Zap, Lock, Loader2, RotateCcw, XCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useApp, useRunning } from '../lib/store';
import { cc, isMac, BrowserProfile, BrowserItemId } from '../lib/api';
import { fmtNum, fmtSize } from '../lib/format';
import { Badge, Button, Checkbox, cx } from '../components/ui';
import { PageBody, FullDiskAccessBanner } from './common';
import { Hero } from './maint';

const LOGO: Record<string, string> = { chrome: '#4285F4', edge: '#0C8CE9', brave: '#FB542B', vivaldi: '#EF3939', chromium: '#5B8DEF', opera: '#FF1B2D', operagx: '#FA1E4E', firefox: '#FF7139', safari: '#1E90FF' };

export default function Browsers() {
  const { toast, confirm } = useApp();
  const [data, setData] = useState<{ profiles: BrowserProfile[]; denied: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useRunning('browsers', busy === 'scan' ? 'Navegadores: medindo' : busy === 'clean' ? 'Navegadores: limpando' : busy === 'opt' ? 'Navegadores: otimizando' : null);
  const [sel, setSel] = useState<Record<string, Set<BrowserItemId>>>({});
  const [result, setResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  const scan = async () => {
    setBusy('scan');
    try {
      const r = await cc.browsersScan();
      setData(r);
      // só o que é seguro vem marcado: cache e shaders
      setSel(Object.fromEntries(r.profiles.map((p) => [p.id, new Set(p.items.filter((i) => i.safe).map((i) => i.id))])));
    } finally { setBusy(null); }
  };
  const total = useMemo(() => (data?.profiles || []).reduce((s, p) => s + p.items.reduce((t, i) => t + (sel[p.id]?.has(i.id) ? i.size : 0), 0), 0), [data, sel]);
  const all = useMemo(() => (data?.profiles || []).reduce((s, p) => s + p.items.reduce((t, i) => t + i.size, 0), 0), [data]);
  const picked = Object.entries(sel).filter(([, s]) => s.size).map(([profileId, s]) => ({ profileId, items: [...s] }));

  const clean = async () => {
    const risky = picked.flatMap((p) => p.items.filter((i) => i !== 'cache' && i !== 'gpu').map((i) => ({ p: p.profileId, i })));
    const r0 = await confirm({
      title: 'Limpar os dados selecionados?',
      message: risky.length ? 'Histórico, cookies e sessões apagados não voltam. Com cookies limpos, você vai precisar entrar de novo nos sites. Senhas e favoritos não são tocados.' : 'Só cache: os navegadores baixam de novo o que precisarem.',
      confirmLabel: 'Limpar', danger: risky.length > 0,
    });
    if (!r0.ok) return;
    setBusy('clean');
    try {
      const r = await cc.browsersClean(picked);
      setResult(Object.fromEntries(r.map((x) => [x.profileId, { ok: x.ok, message: x.ok ? `${fmtSize(x.freed)} liberados` : x.message }])));
      toast(`${fmtSize(r.reduce((s, x) => s + x.freed, 0))} liberados`, r.every((x) => x.ok) ? 'ok' : 'info');
      const fresh = await cc.browsersScan(); setData(fresh);
    } finally { setBusy(null); }
  };
  const optimize = async () => {
    setBusy('opt');
    try {
      const r = await cc.browsersOptimize((data?.profiles || []).map((p) => p.id));
      setResult(Object.fromEntries(r.map((x) => [x.profileId, { ok: x.ok, message: x.ok ? `${x.message} · ${fmtSize(x.freed)}` : x.message }])));
      toast(`Bancos compactados: ${fmtSize(r.reduce((s, x) => s + x.freed, 0))} liberados`, 'ok');
    } finally { setBusy(null); }
  };
  const close = async (p: BrowserProfile) => {
    setBusy(`close:${p.browserId}`);
    const ok = await cc.browsersClose(p.browserId);
    toast(ok ? `${p.browser} fechado` : `${p.browser} não fechou (pode estar pedindo para salvar algo)`, ok ? 'ok' : 'error');
    const fresh = await cc.browsersScan(); setData(fresh); setBusy(null);
  };
  const toggle = (pid: string, id: BrowserItemId, v: boolean) => setSel((s) => { const n = new Set(s[pid]); v ? n.add(id) : n.delete(id); return { ...s, [pid]: n }; });

  if (!data) {
    return (
      <Hero icon={<Globe size={46} />} title="Navegadores"
        text="Navegadores acumulam gigabytes em cache, histórico, cookies e dados de sites. Veja quanto cada perfil ocupa e limpe só o que quiser."
        bullets={[
          { icon: <Sparkles size={15} />, text: 'Chrome, Edge, Brave, Opera, Vivaldi, Firefox' + (isMac ? ' e Safari' : '') },
          { icon: <Zap size={15} />, text: 'Otimização: compacta os bancos internos' },
          { icon: <Lock size={15} />, text: 'Senhas e favoritos nunca são apagados' },
        ]}
        action={{ label: 'Analisar', onClick: scan }} busy={busy === 'scan'} busyText="Medindo…" />
    );
  }

  return (
    <PageBody>
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Globe size={22} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">Navegadores</h1>
          <p className="text-[13px] text-muted">{fmtNum(data.profiles.length)} perfil(is) · {fmtSize(all)} no total · {fmtSize(total)} selecionados</p>
        </div>
        <Button variant="ghost" icon={busy === 'scan' ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} onClick={scan} disabled={!!busy}>Analisar de novo</Button>
        <Button variant="ghost" icon={<Zap size={15} />} onClick={optimize} disabled={!!busy} loading={busy === 'opt'}>Otimizar</Button>
        <Button variant="primary" icon={<Sparkles size={15} />} onClick={clean} disabled={!picked.length || !!busy} loading={busy === 'clean'}>Limpar {total ? fmtSize(total) : ''}</Button>
      </div>
      {data.denied.length > 0 && <div className="mt-4"><div className="mb-2 text-[13px] text-muted">Sem acesso aos dados de: {data.denied.join(', ')}.</div><FullDiskAccessBanner /></div>}
      {!data.profiles.length && <div className="mt-8 text-center text-[13px] text-muted">Nenhum navegador compatível encontrado.</div>}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {data.profiles.map((p) => {
          const s = sel[p.id] || new Set();
          const size = p.items.reduce((t, i) => t + i.size, 0);
          return (
            <div key={p.id} className="anim-rise overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
              <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: LOGO[p.browserId] || 'var(--accent)' }}>{p.browser.slice(0, 1)}</span>
                <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-semibold">{p.browser} <span className="font-normal text-muted">· {p.name}</span></div><div className="text-[12px] text-muted">{fmtSize(size)}</div></div>
                {p.running && <Badge tone="warn">aberto</Badge>}
                {p.running && <Button size="sm" variant="ghost" icon={<XCircle size={14} />} onClick={() => close(p)} loading={busy === `close:${p.browserId}`}>Fechar</Button>}
              </div>
              {p.running && <div className="flex items-center gap-2 bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-4 py-2 text-[12px]"><ShieldAlert size={13} className="text-[var(--warn)]" />Aberto: só o cache pode ser limpo agora. Feche para limpar o resto e otimizar.</div>}
              <div>
                {p.items.map((it) => {
                  const blocked = p.running && !it.safe;
                  return (
                    <label key={it.id} className={cx('flex cursor-pointer items-start gap-3 border-b border-[var(--line)] px-4 py-2.5 last:border-0 hover:bg-[var(--hover)]', blocked && 'cursor-not-allowed opacity-50')}>
                      <Checkbox className="mt-0.5" checked={s.has(it.id) && !blocked} onChange={(v) => !blocked && toggle(p.id, it.id, v)} />
                      <div className="min-w-0 flex-1"><div className="text-[13px] font-medium">{it.label}</div><div className="text-[12px] text-muted">{it.detail}</div></div>
                      <span className="shrink-0 text-right text-[13px] tabular-nums">{it.size ? fmtSize(it.size) : ''}{it.count !== undefined && <span className="block text-[11px] text-muted">{fmtNum(it.count)} itens</span>}</span>
                    </label>
                  );
                })}
              </div>
              {result[p.id] && <div className={cx('flex items-center gap-1.5 px-4 py-2 text-[12px]', result[p.id].ok ? 'text-[var(--accent)]' : 'text-[var(--danger)]')}>{result[p.id].ok && <CheckCircle2 size={13} />}{result[p.id].message}</div>}
            </div>
          );
        })}
      </div>
    </PageBody>
  );
}
