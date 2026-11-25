import React, { useEffect, useState } from 'react';
import { Settings as Cog, Sun, Moon, Monitor, ShieldCheck, AppWindow, MousePointerClick, BellRing, ArrowUpCircle, FolderOpen, RefreshCw } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, OS_NAME, FILE_MANAGER, isMac } from '../lib/api';
import { Button, Card, Input, PageHeader, ProgressBar, Segmented, Select, Toggle } from '../components/ui';
import { PageBody } from './common';
import { t } from '../lib/i18n';
import { LANG_NAMES } from '../locales/core';
import type { Settings } from '../lib/api';

const ACCENT_OPTIONS: { key: 'green' | 'purple' | 'blue' | 'orange' | 'white'; label: string; light: string; dark: string }[] = [
  { key: 'green', label: t("Verde"), light: '#0e9f6e', dark: '#34d399' },
  { key: 'purple', label: t("Roxo"), light: '#7c3aed', dark: '#a78bfa' },
  { key: 'blue', label: t("Azul"), light: '#2563eb', dark: '#60a5fa' },
  { key: 'orange', label: t("Laranja suave"), light: '#e5803f', dark: '#fdba74' },
  { key: 'white', label: t("Branco"), light: '#18181b', dark: '#f4f4f5' },
];

function UpdatesCard() {
  const { settings: s, setSettings: set, update, installUpdate, info } = useApp();
  if (!s) return null;
  const st = update.status;
  const statusText =
    st === 'checking' ? 'Verificando…'
      : st === 'available' ? t("A versão {0} está disponível", update.info?.version)
      : st === 'ready' ? t("A versão {0} já foi baixada e será instalada quando você fechar a janela.", update.info?.version)
      : st === 'none' ? t("Você já tem a versão mais recente ({0})", info?.version)
      : st === 'downloading' ? `Baixando… ${update.total ? Math.round(((update.done || 0) / update.total) * 100) : 0}%`
      : st === 'installing' ? t("O CleanCode está instalando a versão nova e vai abrir de novo sozinho.")
      : st === 'error' ? `Erro: ${update.error}`
      : t("Ainda não verificado");
  return (
    <Card title={<span className="flex items-center gap-2"><ArrowUpCircle size={14} /> {t("Atualizações")}</span>} className="lg:col-span-2">
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="text-[13px]">{t("Versão instalada:")} <b>{info?.version}</b></div>
          <div className={'mt-0.5 text-xs ' + (st === 'error' ? 'text-danger' : st === 'available' ? 'text-accent' : 'text-muted')}>{statusText}</div>
          {st === 'downloading' && <ProgressBar className="mt-2 h-1.5" value={update.total ? (update.done || 0) / update.total : undefined} indeterminate={!update.total} />}
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <span className={'h-2 w-2 rounded-full ' + (update.source === 'missing' ? 'bg-warn' : update.source === 'searching' ? 'animate-pulse bg-accent' : 'bg-accent')} />
            {update.source === 'searching' ? t("Procurando a origem das atualizações…")
              : update.source === 'missing' ? t("O CleanCode não encontrou o endereço das atualizações agora. Ele continua procurando sozinho.")
              : t("O CleanCode configurou sozinho o endereço das atualizações.")}
          </div>
          <Toggle checked={s.autoCheckUpdates} onChange={(v) => set({ autoCheckUpdates: v })} label={t("Verificar automaticamente")} hint={t("O CleanCode procura versões novas a cada 3 minutos.")} />
          <Toggle checked={s.autoInstallUpdates} disabled={!s.autoCheckUpdates} onChange={(v) => set({ autoInstallUpdates: v })} label={t("Instalar automaticamente")}
            hint={t("O CleanCode baixa a versão nova sozinho e instala quando você fecha a janela.")} />
        </div>
        <div className="flex flex-col items-stretch gap-2 lg:w-52">
          <Button icon={<RefreshCw size={14} className={st === 'checking' ? 'animate-spin' : ''} />} disabled={st === 'checking' || st === 'downloading' || st === 'installing'} onClick={() => cc.updateCheck()}>{t("Verificar agora")}</Button>
          <Button variant="primary" icon={<ArrowUpCircle size={14} />} disabled={st !== 'available' && st !== 'ready'} onClick={installUpdate}>{t("Atualizar agora")}</Button>
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
      <PageHeader title={t("Configurações")} icon={<Cog size={18} />} description={t("Ajuste a aparência e o funcionamento do app.")} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t("Aparência")}>
          <div className="flex items-center justify-between py-2">
            <span className="text-[13px]">{t("Tema")}</span>
            <Segmented value={s.theme} onChange={(v) => set({ theme: v })} options={[
              { value: 'system', label: <><Monitor size={13} /> {t("Sistema")}</> }, { value: 'light', label: <><Sun size={13} /> {t("Claro")}</> }, { value: 'dark', label: <><Moon size={13} /> {t("Escuro")}</> },
            ]} />
          </div>
          <div className="flex items-center justify-between gap-4 py-2">
            <span>
              <span className="block text-[13px]">{t("Idioma")}</span>
              <span className="block text-xs text-muted">{t("O CleanCode reinicia quando você troca o idioma.")}</span>
            </span>
            <Select className="w-48" value={s.language || 'auto'} onChange={async (v) => { if (v === (s.language || 'auto')) return; set({ language: v as Settings['language'] }); await cc.settingsSet({ language: v as Settings['language'] }); cc.relaunch(); }} options={[
              { value: 'auto', label: t("Automático") }, { value: 'pt', label: LANG_NAMES.pt }, { value: 'en', label: LANG_NAMES.en }, { value: 'es', label: LANG_NAMES.es },
            ]} />
          </div>
          <div className="flex items-center justify-between gap-4 py-2">
            <span>
              <span className="block text-[13px]">{t("Cor de destaque")}</span>
              <span className="block text-xs text-muted">{t("A cor de destaque aparece nos botões, nas seleções e nos gráficos.")}</span>
            </span>
            <div className="flex items-center gap-2">
              {ACCENT_OPTIONS.map((a) => (
                <button
                  key={a.key}
                  title={a.label}
                  onClick={() => set({ accent: a.key })}
                  className={'relative h-7 w-7 rounded-full transition-transform duration-150 hover:scale-110 ' + (s.accent === a.key ? 'ring-2 ring-offset-2 ring-offset-[var(--surface)]' : '')}
                  style={{ background: `linear-gradient(135deg, ${a.light}, ${a.dark})`, ['--tw-ring-color' as any]: a.key === 'white' ? 'var(--accent)' : a.light }}
                >
                  {s.accent === a.key && <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto h-3.5 w-3.5" style={a.key === 'white' ? { mixBlendMode: 'difference' } : undefined} fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-[13px]">{t("Unidade de tamanho")}</span>
            <Select className="w-32" value={s.units} onChange={(v) => set({ units: v })} options={[{ value: 'auto', label: t("Automática") }, { value: 'TB', label: 'TB' }, { value: 'GB', label: 'GB' }, { value: 'MB', label: 'MB' }, { value: 'KB', label: 'KB' }, { value: 'B', label: t("Bytes") }]} />
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-[13px]">{t("Casas decimais")}</span>
            <Select className="w-32" value={String(s.decimals)} onChange={(v) => set({ decimals: +v })} options={['0', '1', '2', '3'].map((d) => ({ value: d, label: d }))} />
          </div>
          <Toggle checked={s.boldLarge} onChange={(v) => set({ boldLarge: v })} label={t("Destacar itens grandes em negrito")} hint={t("Destaca os itens que ocupam 15% ou mais do espaço analisado.")} />
          <Toggle checked={s.sizeBars} onChange={(v) => set({ sizeBars: v })} label={t("Barras de tamanho na árvore")} hint={t("Mostra uma faixa com o tamanho de cada pasta.")} />
          <Toggle checked={s.compressedBlue} onChange={(v) => set({ compressedBlue: v })} label={t("Mostrar itens compactados ({0}) em azul", isMac ? 'APFS' : 'NTFS')} />
          <Toggle checked={s.datesWithTime} onChange={(v) => set({ datesWithTime: v })} label={t("Mostrar datas com horário")} />
        </Card>
        <Card title={t("Análise")}>
          <Toggle checked={s.showFilesInTree} onChange={(v) => set({ showFilesInTree: v })} label={t("Mostrar arquivos na árvore de pastas")} />
          <Toggle checked={s.hideEmpty} onChange={(v) => set({ hideEmpty: v })} label={t("Ocultar pastas vazias")} />
          <Toggle checked={s.showErrorsAfterScan} onChange={(v) => set({ showErrorsAfterScan: v })} label={t("Mostrar a lista de erros ao fim da varredura")} />
          <Toggle checked={s.autoSaveHistory} onChange={(v) => set({ autoSaveHistory: v })} label={t("Salvar cada varredura no histórico")} hint={t("Assim, você consegue comparar as análises e ver o que cresceu com o tempo.")} />
        </Card>
        <Card title={t("Integração com o {0}", OS_NAME)}>
          {info?.contextMenu && <Toggle checked={!!ctx} disabled={ctx === null} onChange={async (v) => { const r = await cc.contextMenu(v); setCtx(r); toast(r ? t("Menu de contexto ativado") : t("Menu de contexto removido")); }}
            label={<span className="flex items-center gap-2"><MousePointerClick size={14} /> {t("“Analisar com CleanCode” no menu do")} {FILE_MANAGER}</span>} hint={t("Para analisar uma pasta ou um disco, clique nele com o botão direito.")} />}
          {info?.canElevate && <Toggle checked={s.alwaysAdmin} onChange={(v) => set({ alwaysAdmin: v })} label={t("Sempre iniciar como administrador")} hint={t("O Windows pede permissão de administrador sempre que o CleanCode abre, e assim ele lê todas as pastas.")} />}
          <div className="mt-2 flex flex-wrap gap-2">
            {info?.canElevate && <Button icon={<ShieldCheck size={14} />} disabled={info?.isAdmin} onClick={() => cc.restartAdmin()}>{info?.isAdmin ? t("O CleanCode já está aberto como administrador") : t("Reiniciar como administrador")}</Button>}
            <Button icon={<AppWindow size={14} />} onClick={() => cc.newWindow()}>{t("Nova janela")}</Button>
          </div>
        </Card>
        <Card title={<span className="flex items-center gap-2"><BellRing size={14} /> {t("Segundo plano e notificações")}</span>} className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
            <div>
              <Toggle checked={s.runInBackground} onChange={(v) => set({ runInBackground: v })} label={t("Continuar rodando em segundo plano")}
                hint={isMac
                  ? t("Ao fechar a janela, o CleanCode continua na barra de menus. Para sair, use o ícone da barra de menus.")
                  : t("Ao fechar a janela, o CleanCode continua na bandeja, perto do relógio. Para sair, clique com o botão direito no ícone.")} />
              <Toggle checked={s.startWithWindows} disabled={login ? !login.packaged : true} onChange={async (v) => { set({ startWithWindows: v }); setTimeout(() => cc.loginItemStatus().then(setLogin), 300); }}
                label={t("Iniciar com o {0}", OS_NAME)} hint={login && !login.packaged ? t("Esta opção só funciona na versão instalada do app.") : isMac ? t("Quando você entra no macOS, o CleanCode abre apenas na barra de menus.") : t("Quando você entra no Windows, o CleanCode abre minimizado na bandeja.")} />
            </div>
            <div>
              <Toggle checked={s.notifyEnabled} onChange={(v) => set({ notifyEnabled: v })} label={t("Exibir notificações")} hint={isMac ? t("Os avisos aparecem no canto superior direito, abaixo da barra de menus.") : t("Os avisos aparecem no canto da tela, acima do relógio.")} />
              <div className={s.notifyEnabled ? '' : 'pointer-events-none opacity-50'}>
                <Toggle checked={s.notifyDisk} onChange={(v) => set({ notifyDisk: v })} label={t("Quando o uso de um disco aumentar")} />
                <div className="flex items-center justify-between py-2 pl-0">
                  <span className="text-[13px] text-muted">{t("Avisar a partir de")}</span>
                  <Select className="w-32" value={String(s.notifyThresholdMB)} onChange={(v) => set({ notifyThresholdMB: +v })} options={[
                    { value: '256', label: t("256 MB") }, { value: '512', label: t("512 MB") }, { value: '1024', label: t("1 GB") }, { value: '2048', label: t("2 GB") }, { value: '5120', label: t("5 GB") }, { value: '10240', label: t("10 GB") },
                  ]} />
                </div>
                <Toggle checked={s.notifyApps} onChange={(v) => set({ notifyApps: v })} label={t("Quando um programa for instalado")} hint={isMac ? t("O CleanCode avisa quando um app novo aparece em /Applications ou em ~/Applications.") : t("Win32 (registro) e apps da Microsoft Store.")} />
                <Button className="mt-1" icon={<BellRing size={14} />} onClick={() => cc.notifyTest()}>{t("Mostrar notificação de teste")}</Button>
              </div>
            </div>
          </div>
        </Card>
        <UpdatesCard />
        <Card title={t("Aplicativos")}>
          <div className="flex items-center justify-between py-2">
            <span className="text-[13px]">{t("Considerar “sem uso” após")}</span>
            <Select className="w-32" value={String(s.staleMonths)} onChange={(v) => set({ staleMonths: +v })} options={['3', '6', '12', '24'].map((m) => ({ value: m, label: `${m} meses` }))} />
          </div>
          <Toggle checked={s.silentUninstall} onChange={(v) => set({ silentUninstall: v })} label={t("Pré-selecionar desinstalação silenciosa")} hint={t("Você sempre confirma antes da desinstalação. Esta opção só muda a escolha que já vem marcada na janela de confirmação.")} />
        </Card>
        <Card title={t("Sobre")} className="lg:col-span-2">
          <div className="flex items-center gap-4">
            <img src="./icon.png" className="h-12 w-12" alt="" />
            <div className="text-[13px]">
              <div className="font-semibold">{t("CleanCode")} {info?.version}</div>
              <div className="text-xs text-muted">{t("Análise de disco e desinstalador para")} {OS_NAME} {t("· Electron")} {info?.electron} · {info?.isAdmin ? 'administrador' : t("usuário padrão")}</div>
            </div>
          </div>
        </Card>
      </div>
    </PageBody>
  );
}
