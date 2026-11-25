import React, { useEffect, useState } from 'react';
import { Users, Play } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc } from '../lib/api';
import { fmtSize, fmtNum, fmtPct, PALETTE } from '../lib/format';
import { DataTable } from '../components/DataTable';
import { Button, Card, Empty, PageHeader, ProgressBar } from '../components/ui';
import { Donut, PageBody, ScopeBar } from './common';
import { t } from '../lib/i18n';

export default function Owners() {
  const { active, settings, findTask, startScanTask, cancelTask } = useApp();
  const units = settings!.units;
  const nodeId = active!.selected < 0 ? 0 : active!.selected;
  // a tarefa fica no store global: continua rodando se você trocar de tela
  const task = findTask('owners', active!.id, nodeId);
  const busy = task?.status === 'running';
  const prog = task?.progress || null;
  const data: any[] | null = task?.status === 'done' ? task.result : null;
  const [sort, setSort] = useState({ key: 'size', asc: false });
  const run = () => startScanTask('owners', nodeId);
  void useEffect; void cc;
  const total = (data || []).reduce((s, o) => s + o.size, 0);
  return (
    <PageBody>
      <PageHeader title={t("Proprietários")} icon={<Users size={18} />} description={t("Mostra quanto espaço cada usuário ocupa na pasta selecionada.")}
        actions={<Button variant="primary" icon={<Play size={14} />} loading={busy} disabled={!active!.done} onClick={run}>{data ? t("Analisar de novo") : t("Analisar proprietários")}</Button>} />
      <ScopeBar />
      {busy && (
        <Card className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted">
            <span>{t("O CleanCode está lendo o dono de cada arquivo. Enquanto isso, você pode usar as outras telas.")}</span>
            <span className="flex items-center gap-3"><span className="tnum">{fmtNum(prog?.done)} / {fmtNum(prog?.total)}</span><Button size="sm" variant="ghost" onClick={() => task && cancelTask(task.key)}>{t("Cancelar")}</Button></span>
          </div>
          <ProgressBar value={prog ? prog.done / (prog.total || 1) : 0} indeterminate={!prog} />
        </Card>
      )}
      {!data && !busy ? (
        <Card><Empty icon={<Users size={20} />} title={task?.status === 'cancelled' ? t("Análise cancelada") : task?.status === 'error' ? t("A análise falhou") : t("Clique em “Analisar proprietários”")} text={active!.done ? t("Em pastas muito grandes, a leitura pode levar alguns minutos.") : t("Aguarde a varredura terminar.")} /></Card>
      ) : data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="flex items-center justify-center">
            <Donut data={data.slice(0, 10).map((o, i) => ({ label: o.owner, value: o.size, color: PALETTE[i % PALETTE.length] }))} size={240} thickness={40}
              center={<><div className="text-xs text-muted">{data.length} {t("donos")}</div><div className="text-base font-semibold">{fmtSize(total, units)}</div></>} />
          </Card>
          <Card pad={false} title={t("Por proprietário")}>
            <div className="h-[380px]">
              <DataTable className="h-full" rows={data} rowKey={(r) => r.owner} sort={sort} onSort={setSort} columns={[
                { key: 'owner', label: t("Proprietário"), width: 260, flex: true, sortable: true, sortValue: (r) => r.owner, render: (r) => r.owner },
                { key: 'size', label: t("Tamanho"), width: 110, align: 'right', sortable: true, sortValue: (r) => r.size, render: (r) => fmtSize(r.size, units) },
                { key: 'alloc', label: t("Alocado"), width: 110, align: 'right', sortable: true, sortValue: (r) => r.alloc, render: (r) => fmtSize(r.alloc, units) },
                { key: 'files', label: t("Arquivos"), width: 100, align: 'right', sortable: true, sortValue: (r) => r.files, render: (r) => fmtNum(r.files) },
                { key: 'pct', label: '%', width: 80, align: 'right', sortable: true, sortValue: (r) => r.size, render: (r) => fmtPct(r.size / (total || 1)) },
              ]} />
            </div>
          </Card>
        </div>
      )}
    </PageBody>
  );
}
