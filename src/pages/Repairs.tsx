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
import { t } from '../lib/i18n';

const CAT: Record<string, { label: string; text: string }> = isMac ? {
  prefs: { label: t("Preferências corrompidas"), text: t("São arquivos de preferências (.plist) que o app não consegue ler. Depois que o arquivo vai para a Lixeira, o app cria um novo ao abrir.") },
  launchagents: { label: t("Inicialização órfã"), text: t("São agentes que tentam abrir um programa que já foi apagado.") },
  shortcuts: { label: t("Links quebrados"), text: t("São atalhos na Mesa que apontam para arquivos que não existem mais.") },
  launchservices: { label: t("Manutenção"), text: t("São ações opcionais, para quando algo no sistema se comporta de forma estranha.") },
} : {
  startup: { label: t("Inicialização"), text: t("São programas que o Windows tenta abrir quando liga, mas que não existem mais. Eles podem causar mensagens de erro quando o computador liga.") },
  uninstall: { label: t("Programas fantasmas"), text: t("Aparecem como instalados nas Configurações do Windows, mas já foram removidos.") },
  apppaths: { label: t("Caminhos de apps"), text: t("São atalhos do comando Executar (Win+R) que apontam para programas apagados.") },
  fileassoc: { label: t("\"Abrir com\""), text: t("São programas removidos que continuam aparecendo na lista \"Abrir com\".") },
  contextmenu: { label: t("Menu do botão direito"), text: t("São itens do menu do botão direito que apontam para programas removidos.") },
  muicache: { label: t("Cache de nomes"), text: t("São nomes de programas apagados que o Windows ainda guarda.") },
  shortcuts: { label: t("Atalhos quebrados"), text: t("São atalhos na Área de Trabalho e no Menu Iniciar que apontam para arquivos que não existem mais.") },
  services: { label: t("Serviços (só aviso)"), text: t("São serviços configurados para programas que não existem mais. Para resolver, reinstale ou desinstale o programa.") },
};

export default function Repairs() {
  const { toast, confirm } = useApp();
  const [items, setItems] = useState<RepairItem[] | null>(null);
  const [busy, setBusy] = useState<'scan' | 'fix' | null>(null);
  useRunning('repairs', busy === 'scan' ? `${isMac ? t("Reparos") : t("Registro")}: analisando` : busy === 'fix' ? `${isMac ? t("Reparos") : t("Registro")}: corrigindo` : null);
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
      title: t("Corrigir {0} item(ns)?", ids.length),
      message: isMac ? t("Os arquivos vão para a Lixeira, então você consegue colocar tudo de volta se precisar.") : t("Antes de mudar uma chave do registro, o CleanCode salva a chave em um arquivo .reg. Se precisar, você restaura tudo nesta mesma tela, na seção \"Backups\"."),
      items: chosen.slice(0, 8).map((x) => ({ label: x.title, detail: CAT[x.category]?.label })),
      confirmLabel: t("Corrigir"),
    });
    if (!r0.ok) return;
    setBusy('fix');
    try {
      const r = await cc.repairsFix(ids);
      setDone(Object.fromEntries(r.results.map((x) => [x.id, x])));
      const ok = r.results.filter((x) => x.ok).length;
      toast(t("{0} de {1} corrigido(s){2}", ok, ids.length, r.backup ? ' · backup salvo' : ''), ok === ids.length ? 'ok' : 'info');
      setSel(new Set());
      cc.repairsBackups().then(setBackups).catch(() => null);
    } finally { setBusy(null); }
  };
  const restore = async (id: string) => {
    const r0 = await confirm({ title: t("Restaurar este backup?"), message: t("As chaves do registro voltam exatamente como estavam antes da correção."), confirmLabel: t("Restaurar") });
    if (!r0.ok) return;
    const r = await cc.repairsRestore(id);
    toast(r.message, r.ok ? 'ok' : 'error');
  };

  if (!items) {
    return (
      <Hero icon={<Wrench size={46} />} title={isMac ? t("Reparos do sistema") : t("Registro do Windows")}
        text={isMac ? t("Encontra preferências corrompidas e restos de programas que tentam abrir sozinhos. Esses problemas costumam fazer os apps travarem ao abrir.") : t("Encontra entradas do registro que apontam para programas e arquivos que não existem mais. Essas entradas costumam causar erros quando o PC liga, itens fantasmas e menus quebrados.")}
        bullets={isMac ? [
          { icon: <Bug size={15} />, text: t("Preferências corrompidas e inicialização órfã") },
          { icon: <Archive size={15} />, text: t("Tudo vai para a Lixeira.") },
          { icon: <AlertTriangle size={15} />, text: t("Mostra os apps que travaram nos últimos dias.") },
        ] : [
          { icon: <Bug size={15} />, text: t("Mostra apenas os itens que estão comprovadamente quebrados.") },
          { icon: <Archive size={15} />, text: t("Salva uma cópia do registro (.reg) antes de corrigir.") },
          { icon: <AlertTriangle size={15} />, text: t("Avisa você quando um item quebrado aparecer.") },
        ]}
        note={isMac ? undefined : t("O CleanCode não é um \"limpador de registro\" comum. Ele não remove nada só porque parece antigo.")}
        action={{ label: t("Analisar"), onClick: scan }} busy={busy === 'scan'} busyText="Analisando…" />
    );
  }

  return (
    <PageBody>
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Wrench size={22} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{isMac ? t("Reparos do sistema") : t("Registro do Windows")}</h1>
          <p className="text-[13px] text-muted">{problems.length ? t("{0} item(ns) quebrado(s) encontrado(s)", fmtNum(problems.length)) : t("Nada quebrado encontrado")}</p>
        </div>
        <Button variant="ghost" icon={busy === 'scan' ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} onClick={scan} disabled={!!busy}>{t("Analisar de novo")}</Button>
        <Button variant="primary" icon={<Wrench size={15} />} onClick={fix} disabled={!sel.size || !!busy} loading={busy === 'fix'}>{t("Corrigir")} {sel.size ? `(${sel.size})` : ''}</Button>
      </div>

      {!problems.length && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <ShieldCheck size={26} className="text-[var(--accent)]" />
          <div><div className="font-semibold">{t("Tudo certo")}</div><div className="text-[13px] text-muted">{t("Nenhuma entrada aponta para arquivos que não existem mais.")}</div></div>
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
                      <div className="flex items-center gap-2 text-[13px] font-medium"><span className="truncate">{it.title}</span>{it.needsAdmin && <Badge>{t("administrador")}</Badge>}</div>
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
          <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold"><AlertTriangle size={16} className="text-[var(--warn)]" />{t("Apps que travaram nos últimos 3 dias")}</div>
          {!errors.length ? <div className="text-[13px] text-muted">{t("Nenhum travamento registrado.")}</div> : (
            <div className="max-h-[220px] space-y-1 overflow-y-auto">
              {errors.map((e, i) => <div key={i} className="flex items-center gap-3 text-[13px]"><span className="min-w-0 flex-1 truncate font-medium">{e.app}</span><span className="text-muted">{e.message}</span><span className="w-24 text-right text-[12px] text-muted">{fmtRelative(e.at)}</span></div>)}
            </div>
          )}
          <div className="mt-2 text-[12px] text-muted">{isMac ? t("Se um app trava sempre, as preferências corrompidas desse app costumam aparecer na lista acima.") : t("Falhas repetidas costumam vir de programas que não foram desinstalados por completo. Por isso, confira os itens de inicialização e os serviços na lista acima.")}</div>
        </div>
        {!isMac && (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold"><Archive size={16} className="text-[var(--accent)]" />{t("Backups do registro")}</div>
            {!backups.length ? <div className="text-[13px] text-muted">{t("As cópias de segurança aparecem aqui depois da primeira correção.")}</div> : (
              <div className="max-h-[220px] space-y-1 overflow-y-auto">
                {backups.map((b) => <div key={b.id} className="flex items-center gap-3 text-[13px]"><span className="flex-1">{fmtRelative(b.at)}</span><span className="text-muted">{b.files} {t("chave(s)")}</span><Button size="sm" variant="ghost" onClick={() => restore(b.id)}>{t("Restaurar")}</Button></div>)}
              </div>
            )}
          </div>
        )}
      </div>
    </PageBody>
  );
}
