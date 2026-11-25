import React, { useState } from 'react';
import { ArrowDownWideNarrow } from 'lucide-react';
import { useApp, useScanQuery } from '../lib/store';
import { Row } from '../lib/api';
import { fmtSize } from '../lib/format';
import { PageHeader, Segmented, Select } from '../components/ui';
import { PageBody, ScopeBar } from './common';
import { FileResults } from './FileResults';
import { t } from '../lib/i18n';

export default function TopFiles() {
  const { active, settings } = useApp();
  const nodeId = active!.selected < 0 ? 0 : active!.selected;
  const [n, setN] = useState('100');
  const [tab, setTab] = useState<'files' | 'dirs'>('files');
  const files = useScanQuery<Row[]>(tab === 'files' ? 'topFiles' : null, [nodeId, +n]);
  const dirs = useScanQuery<(Row & { own: number })[]>(tab === 'dirs' ? 'topDirs' : null, [nodeId, +n]);
  return (
    <PageBody>
      <PageHeader title={t("Maiores arquivos")} icon={<ArrowDownWideNarrow size={18} />} description={t("Mostra os maiores itens da pasta selecionada.")}
        actions={<>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'files', label: t("Arquivos") }, { value: 'dirs', label: t("Pastas pesadas") }]} />
          <Select className="w-28" value={n} onChange={setN} options={['50', '100', '250', '500', '1000'].map((v) => ({ value: v, label: t("Top {0}", v) }))} />
        </>} />
      <ScopeBar />
      {tab === 'files'
        ? <FileResults rows={files.data || []} name="maiores arquivos" onChanged={files.reload} height={Math.max(360, window.innerHeight - 290)} />
        : <FileResults rows={dirs.data || []} name="pastas pesadas" onChanged={dirs.reload} height={Math.max(360, window.innerHeight - 290)}
            extraCols={[{ key: 'own', label: t("Conteúdo próprio"), width: 130, align: 'right', sortable: true, sortValue: (r: any) => r.own, render: (r: any) => fmtSize(r.own, settings!.units, settings!.decimals) }]} />}
    </PageBody>
  );
}
