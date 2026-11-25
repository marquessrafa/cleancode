import React, { useEffect, useState } from 'react';
import { History as HistoryIcon, Save, Upload, Trash2, GitCompare, X, TrendingUp, TrendingDown } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc } from '../lib/api';
import { fmtSize, fmtNum, fmtDate } from '../lib/format';
import { DataTable } from '../components/DataTable';
import { Badge, Button, Card, Empty, PageHeader, Stat } from '../components/ui';
import { PageBody } from './common';
import { t } from '../lib/i18n';

export default function HistoryPage() {
  const { active, settings, toast, confirm, bump, setComparing, go, select } = useApp();
  const units = settings!.units;
  const [list, setList] = useState<any[]>([]);
  const [growth, setGrowth] = useState<any[] | null>(null);
  const [cmp, setCmp] = useState<any>(null);
  const [sort, setSort] = useState({ key: 'date', asc: false });
  const load = () => cc.historyList().then(setList);
  useEffect(() => { load(); }, [active?.done]);
  const comparingId = active?.comparing;
  useEffect(() => {
    if (!active || !comparingId) { setGrowth(null); setCmp(null); return; }
    cc.scanQuery(active.id, 'compareRoot').then(setCmp);
    cc.scanQuery(active.id, 'growth', 0, 300).then(setGrowth);
  }, [active?.id, comparingId, active?.done]); // eslint-disable-line

  const sameRoot = (h: any) => active && h.root.toLowerCase() === active.root.toLowerCase();
  const compare = async (id: string | null) => {
    if (!active) return;
    await cc.historyCompare(active.id, id);
    setComparing(id); bump();
    if (id) toast(t("A comparação está ativa. Por isso, o Explorador mostra as colunas “Anterior” e “Variação”."), 'info');
  };
  const del = async (h: any) => {
    const r = await confirm({ title: t("Apagar este registro do histórico?"), message: t("Varredura de {0} em {1}. Esta ação apaga apenas o registro que o CleanCode salvou. Nenhum arquivo seu é apagado.", h.root, fmtDate(h.date, true)), confirmLabel: t("Apagar"), danger: true });
    if (!r.ok) return;
    if (comparingId === h.id) await compare(null);
    await cc.historyDelete(h.id); load();
  };

  return (
    <PageBody>
      <PageHeader title={t("Histórico e comparação")} icon={<HistoryIcon size={18} />} description={t("Compare a análise atual com uma anterior para ver o que cresceu.")}
        actions={<>
          <Button icon={<Upload size={14} />} onClick={async () => { const id = await cc.historyImport(); if (id) { toast(t("Varredura importada")); load(); } }}>{t("Importar…")}</Button>
          <Button variant="primary" icon={<Save size={14} />} disabled={!active?.done} onClick={async () => { await cc.historySave(active!.id); toast(t("Varredura salva no histórico")); load(); }}>{t("Salvar varredura atual")}</Button>
        </>} />

      {comparingId && cmp && (
        <div className="mb-4 anim-fade">
          <div className="mb-3 flex items-center gap-2">
            <Badge tone="accent"><GitCompare size={11} /> {t("Comparando com")} {fmtDate(cmp.date, true)}</Badge>
            <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={() => compare(null)}>{t("Encerrar comparação")}</Button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t("Antes")} value={fmtSize(cmp.prevSize, units)} sub={`${fmtNum(cmp.prevFiles)} arquivos`} />
            <Stat label={t("Agora")} value={fmtSize(cmp.size, units)} sub={`${fmtNum(cmp.files)} arquivos`} />
            <Stat label={t("Variação")} value={`${cmp.size - cmp.prevSize >= 0 ? '+' : ''}${fmtSize(cmp.size - cmp.prevSize, units)}`} tone={cmp.size > cmp.prevSize ? 'danger' : 'accent'} icon={cmp.size > cmp.prevSize ? <TrendingUp size={16} /> : <TrendingDown size={16} />} />
            <Stat label={t("Arquivos")} value={`${cmp.files - cmp.prevFiles >= 0 ? '+' : ''}${fmtNum(cmp.files - cmp.prevFiles)}`} />
          </div>
          <Card className="mt-3" title={t("Pastas que mais mudaram")} pad={false}>
            <div className="h-[320px]">
              <DataTable className="h-full" rows={growth || []} rowKey={(r) => r.id} onRowDoubleClick={(r) => { select(r.id); go('explorer'); }} columns={[
                { key: 'path', label: t("Pasta"), width: 400, flex: true, render: (r) => <span className="flex items-center gap-2"><span className="truncate">{r.path}</span>{r.isNew && <Badge tone="info">{t("nova")}</Badge>}</span>, title: (r) => r.path },
                { key: 'prev', label: t("Antes"), width: 110, align: 'right', render: (r) => fmtSize(r.prevSize, units) },
                { key: 'size', label: t("Agora"), width: 110, align: 'right', render: (r) => fmtSize(r.size, units) },
                { key: 'delta', label: t("Variação"), width: 120, align: 'right', render: (r) => <span className={r.delta > 0 ? 'text-danger' : 'text-accent'}>{r.delta > 0 ? '+' : ''}{fmtSize(r.delta, units)}</span> },
              ]} empty={t("Nenhuma diferença")} />
            </div>
          </Card>
        </div>
      )}

      <Card title={t("Varreduras salvas ({0})", list.length)} pad={false}>
        {list.length === 0 ? <Empty icon={<HistoryIcon size={20} />} title={t("Nenhuma varredura salva ainda")} text={t("Quando você concluir uma análise, ela vai aparecer aqui.")} /> : (
          <div className="h-[420px]">
            <DataTable className="h-full" rows={list} rowKey={(r) => r.id} sort={sort} onSort={setSort} columns={[
              { key: 'root', label: t("Pasta"), width: 260, flex: true, sortable: true, sortValue: (r) => r.root, render: (r) => <span className="flex items-center gap-2">{r.root}{r.imported && <Badge>{t("importada")}</Badge>}{comparingId === r.id && <Badge tone="accent">{t("comparando")}</Badge>}</span> },
              { key: 'date', label: t("Data"), width: 150, sortable: true, sortValue: (r) => r.date, render: (r) => fmtDate(r.date, true) },
              { key: 'size', label: t("Tamanho"), width: 110, align: 'right', sortable: true, sortValue: (r) => r.size, render: (r) => fmtSize(r.size, units) },
              { key: 'files', label: t("Arquivos"), width: 110, align: 'right', sortable: true, sortValue: (r) => r.files, render: (r) => fmtNum(r.files) },
              { key: 'act', label: '', width: 210, render: (r) => (
                <span className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" icon={<GitCompare size={12} />} disabled={!sameRoot(r) || !active?.done} title={sameRoot(r) ? '' : t("Para comparar, analise a mesma pasta de novo.")} onClick={() => compare(r.id)}>{t("Comparar")}</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => del(r)} />
                </span>
              ) },
            ]} />
          </div>
        )}
      </Card>
    </PageBody>
  );
}
