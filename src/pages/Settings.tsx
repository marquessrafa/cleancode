import React, { useEffect, useState } from 'react';
import { Settings as Cog, Sun, Moon, Monitor, ShieldCheck, AppWindow, MousePointerClick, BellRing, ArrowUpCircle, FolderOpen, RefreshCw } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, OS_NAME, FILE_MANAGER, isMac } from '../lib/api';
import { Button, Card, Input, PageHeader, ProgressBar, Segmented, Select, Toggle } from '../components/ui';
import { PageBody } from './common';

const ACCENT_OPTIONS: { key: 'green' | 'purple' | 'blue' | 'orange'; label: string; light: string; dark: string }[] = [
  { key: 'green', label: 'Verde', light: '#0e9f6e', dark: '#34d399' },
  { key: 'purple', label: 'Roxo', light: '#7c3aed', dark: '#a78bfa' },
  { key: 'blue', label: 'Azul', light: '#2563eb', dark: '#60a5fa' },
  { key: 'orange', label: 'Laranja suave', light: '#e5803f', dark: '#fdba74' },
];

function UpdatesCard() {
  const { settings: s, setSettings: set, update, installUpdate, info } = useApp();
  if (!s) return null;
  const st = update.status;
  const statusText =
    st === 'checking' ? 'Verificando…'
      : st === 'available' ? `Versão ${update.info?.version} disponível`
      : st === 'ready' ? `Versão ${update.info?.version} baixada: será instalada ao fechar a janela (ou clique em "Atualizar agora")`
      : st === 'none' ? `Você já tem a versão mais recente (${info?.version})`
      : st === 'downloading' ? `Baixando… ${update.total ? Math.round(((update.done || 0) / update.total) * 100) : 0}%`
      : st === 'installing' ? 'Instalando: o app vai reabrir sozinho'
      : st === 'error' ? `Erro: ${update.error}`
      : 'Ainda não verificado';
  return (
    <Card title={<span className="flex items-center gap-2"><ArrowUpCircle size={14} /> Atualizações</span>} className="lg:col-span-2">
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="text-[13px]">Versão instalada: <b>{info?.version}</b></div>
          <div className={'mt-0.5 text-xs ' + (st === 'error' ? 'text-danger' : st === 'available' ? 'text-accent' : 'text-muted')}>{statusText}</div>
          {st === 'downloading' && <ProgressBar className="mt-2 h-1.5" value={update.total ? (update.done || 0) / update.total : undefined} indeterminate={!update.total} />}
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <span className={'h-2 w-2 rounded-full ' + (update.source === 'missing' ? 'bg-warn' : update.source === 'searching' ? 'animate-pulse bg-accent' : 'bg-accent')} />
            {update.source === 'searching' ? 'Procurando a origem das atualizações…'
              : update.source === 'missing' ? 'Origem das atualizações não encontrada no momento. O app continua procurando sozinho.'
              : 'Origem das atualizações configurada automaticamente pelo app.'}
          </div>
          <Toggle checked={s.autoCheckUpdates} onChange={(v) => set({ autoCheckUpdates: v })} label="Verificar automaticamente" hint="Ao abrir o app, a cada 30 minutos e assim que uma versão nova aparecer na pasta de atualizações." />
          <Toggle checked={s.autoInstallUpdates} disabled={!s.autoCheckUpdates} onChange={(v) => set({ autoInstallUpdates: v })} label="Instalar automaticamente"
            hint="Baixa sozinho. Se o app estiver só na bandeja, instala na hora; com a janela aberta, instala quando você fechar a janela ou sair. O app reabre já atualizado." />
        </div>
        <div className="flex flex-col items-stretch gap-2 lg:w-52">
          <Button icon={<RefreshCw size={14} className={st === 'checking' ? 'animate-spin' : ''} />} disabled={st === 'checking' || st === 'downloading' || st === 'installing'} onClick={() => cc.updateCheck()}>Verificar agora</Button>
          <Button variant="primary" icon={<ArrowUpCircle size={14} />} disabled={st !== 'available' && st !== 'ready'} onClick={installUpdate}>Atualizar agora</Button>
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const { settings: s, setSettings: set, info, toast } = useApp();
  const [ctx, setCtx] = useState<boolean | null>(null);
  const [login, setLogin] = useState<{ packaged: boolean; openAtLogin: boolean } | null>(null);
  useEffect(() => { cc.contextMenuStatus().then(setCtx); cc.loginItemStatus().then(setLogin); }, []);
  if (!s) return null;
  return (
    <PageBody>
      <PageHeader title="Configurações" icon={<Cog size={18} />} description={`Aparência, comportamento da análise e integração com o ${OS_NAME}.`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Aparência">
          <div className="flex items-center justify-between py-2">
            <span className="text-[13px]">Tema</span>
            <Segmented value={s.theme} onChange={(v) => set({ theme: v })} options={[
              { value: 'system', label: <><Monitor size={13} /> Sistema</> }, { value: 'light', label: <><Sun size={13} /> Claro</> }, { value: 'dark', label: <><Moon size={13} /> Escuro</> },
            ]} />
          </div>
          <div className="flex items-center justify-between gap-4 py-2">
            <span>
              <span className="block text-[13px]">Cor de destaque</span>
              <span className="block text-xs text-muted">Botões, chaves, seleções e gráficos de destaque. O fundo não muda.</span>
            </span>
            <div className="flex items-center gap-2">
              {ACCENT_OPTIONS.map((a) => (
                <button
                  key={a.key}
                  title={a.label}
                  onClick={() => set({ accent: a.key })}
                  className={'relative h-7 w-7 rounded-full transition-transform duration-150 hover:scale-110 ' + (s.accent === a.key ? 'ring-2 ring-offset-2 ring-offset-[var(--surface)]' : '')}
                  style={{ background: `linear-gradient(135deg, ${a.light}, ${a.dark})`, ['--tw-ring-color' as any]: a.light }}
                >
                  {s.accent === a.key && <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto h-3.5 w-3.5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-[13px]">Unidade de tamanho</span>
            <Select className="w-32" value={s.units} onChange={(v) => set({ units: v })} options={[{ value: 'auto', label: 'Automática' }, { value: 'TB', label: 'TB' }, { value: 'GB', label: 'GB' }, { value: 'MB', label: 'MB' }, { value: 'KB', label: 'KB' }, { value: 'B', label: 'Bytes' }]} />
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-[13px]">Casas decimais</span>
            <Select className="w-32" value={String(s.decimals)} onChange={(v) => set({ decimals: +v })} options={['0', '1', '2', '3'].map((d) => ({ value: d, label: d }))} />
          </div>
          <Toggle checked={s.boldLarge} onChange={(v) => set({ boldLarge: v })} label="Destacar itens grandes em negrito" hint="Itens com 15% ou mais do total da varredura." />
          <Toggle checked={s.sizeBars} onChange={(v) => set({ sizeBars: v })} label="Barras de tamanho na árvore" hint="Faixa no fundo de cada pasta, proporcional ao tamanho na pasta pai." />
          <Toggle checked={s.compressedBlue} onChange={(v) => set({ compressedBlue: v })} label={`Mostrar itens compactados (${isMac ? 'APFS' : 'NTFS'}) em azul`} />
          <Toggle checked={s.datesWithTime} onChange={(v) => set({ datesWithTime: v })} label="Mostrar datas com horário" />
        </Card>
        <Card title="Análise">
          <Toggle checked={s.showFilesInTree} onChange={(v) => set({ showFilesInTree: v })} label="Mostrar arquivos na árvore de pastas" />
          <Toggle checked={s.hideEmpty} onChange={(v) => set({ hideEmpty: v })} label="Ocultar pastas vazias" />
          <Toggle checked={s.showErrorsAfterScan} onChange={(v) => set({ showErrorsAfterScan: v })} label="Mostrar a lista de erros ao fim da varredura" />
          <Toggle checked={s.autoSaveHistory} onChange={(v) => set({ autoSaveHistory: v })} label="Salvar cada varredura no histórico" hint="Permite comparar e ver o que cresceu com o tempo." />
        </Card>
        <Card title={`Integração com o ${OS_NAME}`}>
          {info?.contextMenu && <Toggle checked={!!ctx} disabled={ctx === null} onChange={async (v) => { const r = await cc.contextMenu(v); setCtx(r); toast(r ? 'Menu de contexto ativado' : 'Menu de contexto removido'); }}
            label={<span className="flex items-center gap-2"><MousePointerClick size={14} /> “Analisar com CleanCode” no menu do {FILE_MANAGER}</span>} hint="Clique com o botão direito numa pasta ou unidade para analisá-la." />}
          {info?.canElevate && <Toggle checked={s.alwaysAdmin} onChange={(v) => set({ alwaysAdmin: v })} label="Sempre iniciar como administrador" hint="Pede elevação (UAC) a cada abertura para ler todas as pastas." />}
          <div className="mt-2 flex flex-wrap gap-2">
            {info?.canElevate && <Button icon={<ShieldCheck size={14} />} disabled={info?.isAdmin} onClick={() => cc.restartAdmin()}>{info?.isAdmin ? 'Já é administrador' : 'Reiniciar como administrador'}</Button>}
            <Button icon={<AppWindow size={14} />} onClick={() => cc.newWindow()}>Nova janela</Button>
          </div>
        </Card>
        <Card title={<span className="flex items-center gap-2"><BellRing size={14} /> Segundo plano e notificações</span>} className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
            <div>
              <Toggle checked={s.runInBackground} onChange={(v) => set({ runInBackground: v })} label="Continuar rodando em segundo plano"
                hint={isMac
                  ? 'Ao fechar a janela, o CleanCode fica só na barra de menus (ícone no topo da tela, sem ícone no Dock) e o monitor continua ativo. Para sair, clique no ícone e escolha Sair.'
                  : 'Ao fechar a janela, o CleanCode fica na bandeja do sistema (perto do relógio) e o monitor continua ativo. Para sair, clique com o botão direito no ícone da bandeja.'} />
              <Toggle checked={s.startWithWindows} disabled={login ? !login.packaged : true} onChange={async (v) => { set({ startWithWindows: v }); setTimeout(() => cc.loginItemStatus().then(setLogin), 300); }}
                label={`Iniciar com o ${OS_NAME}`} hint={login && !login.packaged ? 'Disponível na versão instalada.' : isMac ? 'Abre só na barra de menus ao entrar no macOS.' : 'Abre minimizado na bandeja ao entrar no Windows.'} />
            </div>
            <div>
              <Toggle checked={s.notifyEnabled} onChange={(v) => set({ notifyEnabled: v })} label="Exibir notificações" hint={isMac ? 'Popup no canto superior direito, abaixo da barra de menus.' : 'Popup no canto da tela, acima do relógio.'} />
              <div className={s.notifyEnabled ? '' : 'pointer-events-none opacity-50'}>
                <Toggle checked={s.notifyDisk} onChange={(v) => set({ notifyDisk: v })} label="Quando o uso de um disco aumentar" />
                <div className="flex items-center justify-between py-2 pl-0">
                  <span className="text-[13px] text-muted">Avisar a partir de</span>
                  <Select className="w-32" value={String(s.notifyThresholdMB)} onChange={(v) => set({ notifyThresholdMB: +v })} options={[
                    { value: '256', label: '256 MB' }, { value: '512', label: '512 MB' }, { value: '1024', label: '1 GB' }, { value: '2048', label: '2 GB' }, { value: '5120', label: '5 GB' }, { value: '10240', label: '10 GB' },
                  ]} />
                </div>
                <Toggle checked={s.notifyApps} onChange={(v) => set({ notifyApps: v })} label="Quando um programa for instalado" hint={isMac ? 'Apps novos em /Applications e ~/Applications.' : 'Win32 (registro) e apps da Microsoft Store.'} />
                <Button className="mt-1" icon={<BellRing size={14} />} onClick={() => cc.notifyTest()}>Mostrar notificação de teste</Button>
              </div>
            </div>
          </div>
        </Card>
        <UpdatesCard />
        <Card title="Aplicativos">
          <div className="flex items-center justify-between py-2">
            <span className="text-[13px]">Considerar “sem uso” após</span>
            <Select className="w-32" value={String(s.staleMonths)} onChange={(v) => set({ staleMonths: +v })} options={['3', '6', '12', '24'].map((m) => ({ value: m, label: `${m} meses` }))} />
          </div>
          <Toggle checked={s.silentUninstall} onChange={(v) => set({ silentUninstall: v })} label="Pré-selecionar desinstalação silenciosa" hint="Você sempre confirma antes; esta opção só muda o padrão do diálogo." />
        </Card>
        <Card title="Sobre" className="lg:col-span-2">
          <div className="flex items-center gap-4">
            <img src="./icon.png" className="h-12 w-12" alt="" />
            <div className="text-[13px]">
              <div className="font-semibold">CleanCode {info?.version}</div>
              <div className="text-xs text-muted">Análise de disco e desinstalador para {OS_NAME} · Electron {info?.electron} · {info?.isAdmin ? 'administrador' : 'usuário padrão'}</div>
            </div>
          </div>
        </Card>
      </div>
    </PageBody>
  );
}
