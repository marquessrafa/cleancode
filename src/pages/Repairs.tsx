// Reparos: no Windows, entradas do registro que apontam para programas e arquivos que não existem mais
// (inicialização, desinstalação, "Abrir com", menu de contexto, atalhos, serviços); no macOS,
// preferências corrompidas e agentes de inicialização órfãos. Backup automático antes de corrigir.
import React, { useMemo, useState } from 'react';
import { Wrench, ShieldCheck, Archive, AlertTriangle, RotateCcw, CheckCircle2, Info, Loader2, Bug } from 'lucide-react';
import { useApp, useRunning } from '../lib/store';
import { cc, isMac, RepairItem } from '../lib/api';
import { fmtNum, fmtRelative } from '../lib/format';
import { Badge, Button, Checkbox, cx } from '../components/ui';
import { PageBody } from './common';
import { Hero } from './maint';

const CAT: Record<string, { label: string; text: string }> = isMac ? {
  prefs: { label: 'Preferências corrompidas', text: 'Arquivos .plist que o app não consegue ler. Ele recria um novo ao abrir.' },
  launchagents: { label: 'Inicialização órfã', text: 'Agentes que tentam abrir um programa que já foi apagado.' },
  shortcuts: { label: 'Links quebrados', text: 'Links na Mesa para arquivos que sumiram.' },
  launchservices: { label: 'Manutenção', text: 'Ações opcionais para quando algo se comporta de forma estranha.' },
} : {
  startup: { label: 'Inicialização', text: 'Programas que o Windows tenta abrir ao ligar, mas que não existem mais (podem gerar erro na inicialização).' },
  uninstall: { label: 'Programas fantasmas', text: 'Aparecem como instalados em Configurações, mas já foram removidos.' },
  apppaths: { label: 'Caminhos de apps', text: 'Atalhos de execução (Win+R) para programas apagados.' },
  fileassoc: { label: '"Abrir com"', text: 'Programas removidos que continuam na lista "Abrir com".' },
  contextmenu: { label: 'Menu do botão direito', text: 'Itens do menu de contexto que apontam para programas removidos.' },
  muicache: { label: 'Cache de nomes', text: 'Nomes guardados de programas que foram apagados.' },
  shortcuts: { label: 'Atalhos quebrados', text: 'Atalhos na Área de Trabalho e no Menu Iniciar para arquivos que sumiram.' },
  services: { label: 'Serviços (só aviso)', text: 'Serviços configurados para programas que não existem mais. Reinstale ou desinstale o programa.' },
};

export default function Repairs() {
  const { toast, confirm } = useApp();
  const [items, setItems] = useState<RepairItem[] | null>(null);
  const [busy, setBusy] = useState<'scan' | 'fix' | null>(null);
  useRunning('repairs', busy === 'scan' ? `${isMac ? 'Reparos' : 'Registro'}: analisando` : busy === 'fix' ? `${isMac ? 'Reparos' : 'Registro'}: corrigindo` : null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [errors, setErrors] = useState<{ app: string; message: string; at: number }[]>([]);
  const [backups, setBackups] = useState<{ id: string; files: number; at: number }[]>([]);

  const scan = async () => {
    setBusy('scan'); setDone({});
    try {
      const [r, e, b] = await Promise.all([cc.repairsScan(), cc.repairsErrors().catch(() => []), cc.repairsBackups().catch(() => [])]);
      setItems(r); setErrors(e); setBackups(b);
      setSel(new Set(r.filter((x) => x.fixable && !x.optional).map((x) => x.id)));
    } finally { setBusy(null); }
  };
  const groups = useMemo(() => {
    const g = new Map<string, RepairItem[]>();
    for (const it of items || []) { const l = g.get(it.category); l ? l.push(it) : g.set(it.category, [it]); }
    return [...g.entries()].sort((a, b) => Number(a[0] === 'launchservices' || a[0] === 'services') - Number(b[0] === 'launchservices' || b[0] === 'services'));
  }, [items]);
  const problems = (items || []).filter((x) => !x.optional);

  const fix = async () => {
    const ids = [...sel];
    if (!ids.length) return;
    const chosen = (items || []).filter((x) => sel.has(x.id));
    const r0 = await confirm({
      title: `Corrigir ${ids.length} item(ns)?`,
      message: isMac ? 'Os arquivos vão para a Lixeira: dá para colocar de volta se precisar.' : 'Antes de mudar, cada chave é salva num arquivo .reg. Você pode restaurar tudo aqui mesmo, em "Backups".',
      items: chosen.slice(0, 8).map((x) => ({ label: x.title, detail: CAT[x.category]?.label })),
      confirmLabel: 'Corrigir',
    });
    if (!r0.ok) return;
    setBusy('fix');
    try {
      const r = await cc.repairsFix(ids);
      setDone(Object.fromEntries(r.results.map((x) => [x.id, x])));
      const ok = r.results.filter((x) => x.ok).length;
      toast(`${ok} de ${ids.length} corrigido(s)${r.backup ? ' · backup salvo' : ''}`, ok === ids.length ? 'ok' : 'info');
      setSel(new Set());
      cc.repairsBackups().then(setBackups).catch(() => null);
    } finally { setBusy(null); }
  };
  const restore = async (id: string) => {
    const r0 = await confirm({ title: 'Restaurar este backup?', message: 'As chaves do registro voltam exatamente como estavam antes da correção.', confirmLabel: 'Restaurar' });
    if (!r0.ok) return;
    const r = await cc.repairsRestore(id);
    toast(r.message, r.ok ? 'ok' : 'error');
  };

  if (!items) {
    return (
      <Hero icon={<Wrench size={46} />} title={isMac ? 'Reparos do sistema' : 'Registro do Windows'}
        text={isMac ? 'Encontra preferências corrompidas e restos de programas que tentam abrir sozinhos, a causa comum de apps que travam ao abrir.' : 'Encontra entradas do registro que apontam para programas e arquivos que não existem mais: a causa comum de erros ao ligar o PC, itens fantasmas e menus quebrados.'}
        bullets={isMac ? [
          { icon: <Bug size={15} />, text: 'Preferências corrompidas e inicialização órfã' },
          { icon: <Archive size={15} />, text: 'Tudo vai para a Lixeira' },
          { icon: <AlertTriangle size={15} />, text: 'Apps que travaram nos últimos dias' },
        ] : [
          { icon: <Bug size={15} />, text: 'Só itens comprovadamente quebrados' },
          { icon: <Archive size={15} />, text: 'Backup .reg automático antes de corrigir' },
          { icon: <AlertTriangle size={15} />, text: 'Aviso quando um item quebrado aparecer' },
        ]}
        note={isMac ? undefined : 'Não é um "limpador de registro" genérico: nada é removido só por parecer antigo.'}
        action={{ label: 'Analisar', onClick: scan }} busy={busy === 'scan'} busyText="Analisando…" />
    );
  }

  return (
    <PageBody>
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Wrench size={22} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{isMac ? 'Reparos do sistema' : 'Registro do Windows'}</h1>
          <p className="text-[13px] text-muted">{problems.length ? `${fmtNum(problems.length)} item(ns) quebrado(s) encontrado(s)` : 'Nada quebrado encontrado'}</p>
        </div>
        <Button variant="ghost" icon={busy === 'scan' ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} onClick={scan} disabled={!!busy}>Analisar de novo</Button>
        <Button variant="primary" icon={<Wrench size={15} />} onClick={fix} disabled={!sel.size || !!busy} loading={busy === 'fix'}>Corrigir {sel.size ? `(${sel.size})` : ''}</Button>
      </div>

      {!problems.length && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <ShieldCheck size={26} className="text-[var(--accent)]" />
          <div><div className="font-semibold">Tudo certo</div><div className="text-[13px] text-muted">Nenhuma entrada aponta para arquivos que não existem mais.</div></div>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {groups.map(([cat, list]) => {
          const fixable = list.filter((x) => x.fixable);
          const allOn = fixable.length > 0 && fixable.every((x) => sel.has(x.id));
          return (
            <div key={cat} className="anim-rise overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
              <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
                {fixable.length > 0 && <Checkbox checked={allOn} indeterminate={!allOn && fixable.some((x) => sel.has(x.id))} onChange={(v) => setSel((s) => { const n = new Set(s); fixable.forEach((x) => (v ? n.add(x.id) : n.delete(x.id))); return n; })} />}
                <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold">{CAT[cat]?.label || cat} <span className="ml-1 text-[12px] font-normal text-muted">{list.length}</span></div><div className="text-[12px] text-muted">{CAT[cat]?.text}</div></div>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {list.map((it) => (
                  <div key={it.id} className="flex items-start gap-3 border-b border-[var(--line)] px-4 py-2.5 last:border-0">
                    {it.fixable ? <Checkbox className="mt-0.5" checked={sel.has(it.id)} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(it.id) : n.delete(it.id); return n; })} /> : <Info size={15} className="mt-0.5 text-muted" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[13px] font-medium"><span className="truncate">{it.title}</span>{it.needsAdmin && <Badge>administrador</Badge>}</div>
                      <div className="break-all text-[12px] text-muted">{it.detail}</div>
                      {it.target && <div className="mt-0.5 truncate font-mono text-[11px] text-muted opacity-70" title={it.target}>{it.target}</div>}
                    </div>
                    {done[it.id] && <span className={cx('flex shrink-0 items-center gap-1 text-[12px]', done[it.id].ok ? 'text-[var(--accent)]' : 'text-[var(--danger)]')}>{done[it.id].ok && <CheckCircle2 size={13} />}{done[it.id].message}</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold"><AlertTriangle size={16} className="text-[var(--warn)]" />Apps que travaram (3 dias)</div>
          {!errors.length ? <div className="text-[13px] text-muted">Nenhum travamento registrado.</div> : (
            <div className="max-h-[220px] space-y-1 overflow-y-auto">
              {errors.map((e, i) => <div key={i} className="flex items-center gap-3 text-[13px]"><span className="min-w-0 flex-1 truncate font-medium">{e.app}</span><span className="text-muted">{e.message}</span><span className="w-24 text-right text-[12px] text-muted">{fmtRelative(e.at)}</span></div>)}
            </div>
          )}
          <div className="mt-2 text-[12px] text-muted">{isMac ? 'Se um app trava sempre, as preferências corrompidas dele costumam aparecer acima.' : 'Falhas repetidas costumam vir de programas mal desinstalados: veja os itens de inicialização e serviços acima.'}</div>
        </div>
        {!isMac && (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold"><Archive size={16} className="text-[var(--accent)]" />Backups do registro</div>
            {!backups.length ? <div className="text-[13px] text-muted">Os backups aparecem aqui depois da primeira correção.</div> : (
              <div className="max-h-[220px] space-y-1 overflow-y-auto">
                {backups.map((b) => <div key={b.id} className="flex items-center gap-3 text-[13px]"><span className="flex-1">{fmtRelative(b.at)}</span><span className="text-muted">{b.files} chave(s)</span><Button size="sm" variant="ghost" onClick={() => restore(b.id)}>Restaurar</Button></div>)}
              </div>
            )}
          </div>
        )}
      </div>
    </PageBody>
  );
}
