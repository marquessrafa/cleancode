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
      : st === 'ready' ? `Versão ${update.info?.version} já foi baixada. Ela será instalada quando você fechar a janela, ou agora, se você clicar em "Atualizar agora".`
      : st === 'none' ? `Você já tem a versão mais recente (${info?.version})`
      : st === 'downloading' ? `Baixando… ${update.total ? Math.round(((update.done || 0) / update.total) * 100) : 0}%`
      : st === 'installing' ? 'O CleanCode está instalando a versão nova e vai abrir de novo sozinho.'
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
              : update.source === 'missing' ? 'O CleanCode não encontrou o endereço das atualizações agora. Ele continua procurando sozinho.'
              : 'O CleanCode configurou sozinho o endereço das atualizações.'}
          </div>
          <Toggle checked={s.autoCheckUpdates} onChange={(v) => set({ autoCheckUpdates: v })} label="Verificar automaticamente" hint="O CleanCode procura versões novas quando abre, a cada 3 minutos e quando o computador sai do repouso." />
          <Toggle checked={s.autoInstallUpdates} disabled={!s.autoCheckUpdates} onChange={(v) => set({ autoInstallUpdates: v })} label="Instalar automaticamente"
            hint="O CleanCode baixa a versão nova sozinho. Se a janela estiver fechada, ele instala na hora. Se a janela estiver aberta, ele instala quando você fechar a janela ou sair do app. Depois, o app abre de novo já atualizado." />
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
      <PageHeader title="Configurações" icon={<Cog size={18} />} description={`Aqui você muda a aparência do app, o jeito como a análise funciona e a integração com o ${OS_NAME}.`} />
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
              <span className="block text-xs text-muted">A cor de destaque aparece nos botões, nas chaves, nas seleções e nos gráficos. O fundo do app não muda.</span>
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
          <Toggle checked={s.boldLarge} onChange={(v) => set({ boldLarge: v })} label="Destacar itens grandes em negrito" hint="Destaca os itens que ocupam 15% ou mais do espaço analisado." />
          <Toggle checked={s.sizeBars} onChange={(v) => set({ sizeBars: v })} label="Barras de tamanho na árvore" hint="Mostra uma faixa atrás de cada pasta. O tamanho da faixa mostra quanto a pasta ocupa dentro da pasta de cima." />
          <Toggle checked={s.compressedBlue} onChange={(v) => set({ compressedBlue: v })} label={`Mostrar itens compactados (${isMac ? 'APFS' : 'NTFS'}) em azul`} />
          <Toggle checked={s.datesWithTime} onChange={(v) => set({ datesWithTime: v })} label="Mostrar datas com horário" />
        </Card>
        <Card title="Análise">
          <Toggle checked={s.showFilesInTree} onChange={(v) => set({ showFilesInTree: v })} label="Mostrar arquivos na árvore de pastas" />
          <Toggle checked={s.hideEmpty} onChange={(v) => set({ hideEmpty: v })} label="Ocultar pastas vazias" />
          <Toggle checked={s.showErrorsAfterScan} onChange={(v) => set({ showErrorsAfterScan: v })} label="Mostrar a lista de erros ao fim da varredura" />
          <Toggle checked={s.autoSaveHistory} onChange={(v) => set({ autoSaveHistory: v })} label="Salvar cada varredura no histórico" hint="Assim, você consegue comparar as análises e ver o que cresceu com o tempo." />
        </Card>
        <Card title={`Integração com o ${OS_NAME}`}>
          {info?.contextMenu && <Toggle checked={!!ctx} disabled={ctx === null} onChange={async (v) => { const r = await cc.contextMenu(v); setCtx(r); toast(r ? 'Menu de contexto ativado' : 'Menu de contexto removido'); }}
            label={<span className="flex items-center gap-2"><MousePointerClick size={14} /> “Analisar com CleanCode” no menu do {FILE_MANAGER}</span>} hint="Para analisar uma pasta ou um disco, clique nele com o botão direito." />}
          {info?.canElevate && <Toggle checked={s.alwaysAdmin} onChange={(v) => set({ alwaysAdmin: v })} label="Sempre iniciar como administrador" hint="O Windows pede a sua permissão de administrador sempre que o CleanCode abre. Com essa permissão, o CleanCode consegue ler todas as pastas." />}
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
                  ? 'Quando você fecha a janela, o CleanCode continua aberto na barra de menus, no topo da tela, e sai do Dock. Assim, o monitoramento continua funcionando. Para sair do app, clique no ícone da barra de menus e escolha Sair.'
                  : 'Quando você fecha a janela, o CleanCode continua aberto na bandeja do sistema, perto do relógio. Assim, o monitoramento continua funcionando. Para sair do app, clique com o botão direito no ícone da bandeja.'} />
              <Toggle checked={s.startWithWindows} disabled={login ? !login.packaged : true} onChange={async (v) => { set({ startWithWindows: v }); setTimeout(() => cc.loginItemStatus().then(setLogin), 300); }}
                label={`Iniciar com o ${OS_NAME}`} hint={login && !login.packaged ? 'Esta opção só funciona na versão instalada do app.' : isMac ? 'Quando você entra no macOS, o CleanCode abre apenas na barra de menus.' : 'Quando você entra no Windows, o CleanCode abre minimizado na bandeja.'} />
            </div>
            <div>
              <Toggle checked={s.notifyEnabled} onChange={(v) => set({ notifyEnabled: v })} label="Exibir notificações" hint={isMac ? 'Os avisos aparecem no canto superior direito, abaixo da barra de menus.' : 'Os avisos aparecem no canto da tela, acima do relógio.'} />
              <div className={s.notifyEnabled ? '' : 'pointer-events-none opacity-50'}>
                <Toggle checked={s.notifyDisk} onChange={(v) => set({ notifyDisk: v })} label="Quando o uso de um disco aumentar" />
                <div className="flex items-center justify-between py-2 pl-0">
                  <span className="text-[13px] text-muted">Avisar a partir de</span>
                  <Select className="w-32" value={String(s.notifyThresholdMB)} onChange={(v) => set({ notifyThresholdMB: +v })} options={[
                    { value: '256', label: '256 MB' }, { value: '512', label: '512 MB' }, { value: '1024', label: '1 GB' }, { value: '2048', label: '2 GB' }, { value: '5120', label: '5 GB' }, { value: '10240', label: '10 GB' },
                  ]} />
                </div>
                <Toggle checked={s.notifyApps} onChange={(v) => set({ notifyApps: v })} label="Quando um programa for instalado" hint={isMac ? 'O CleanCode avisa quando um app novo aparece em /Applications ou em ~/Applications.' : 'Win32 (registro) e apps da Microsoft Store.'} />
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
          <Toggle checked={s.silentUninstall} onChange={(v) => set({ silentUninstall: v })} label="Pré-selecionar desinstalação silenciosa" hint="Você sempre confirma antes da desinstalação. Esta opção só muda a escolha que já vem marcada na janela de confirmação." />
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
