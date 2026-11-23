import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppProvider, useApp } from './lib/store';
import { Sidebar, TopBar, Toasts, ConfirmDialog } from './components/Shell';
import { ContextMenuHost } from './components/ui';
import Overview from './pages/Overview';
import Explorer from './pages/Explorer';
import Visual from './pages/Visual';
import Types from './pages/Types';
import Age from './pages/Age';
import Owners from './pages/Owners';
import TopFiles from './pages/TopFiles';
import Duplicates from './pages/Duplicates';
import SearchPage from './pages/Search';
import HistoryPage from './pages/History';
import Discover from './pages/Discover';
import Uninstaller from './pages/Uninstaller';
import Cleanup from './pages/Cleanup';
import Performance from './pages/Performance';
import ActivityPage from './pages/Activity';
import ProtectionPage from './pages/Protection';
import SmartCare from './pages/SmartCare';
import Clutter from './pages/Clutter';
import Repairs from './pages/Repairs';
import Browsers from './pages/Browsers';
import GameMode from './pages/GameMode';
import Hardware from './pages/Hardware';
import SettingsPage from './pages/Settings';
import { NeedsScan } from './pages/common';
import Panel from './panel/Panel';
import WhatsNew from './components/WhatsNew';

// telas com tarefas longas ficam montadas depois da primeira visita: trocar de tela não perde o
// progresso nem o resultado (e a execução continua aparecendo no menu e na central do topo)
const KEEP_ALIVE = new Set<string>(['smartcare', 'cleanup', 'clutter', 'performance', 'protection', 'repairs', 'browsers', 'game', 'uninstall', 'discover']);

function Content({ page: forced }: { page?: string } = {}) {
  const { page: current, active, settings } = useApp();
  const page = (forced || current) as typeof current;
  if (!settings) return null;
  const needs = ['explorer', 'visual', 'types', 'age', 'owners', 'top', 'duplicates', 'search'].includes(page);
  if (needs && !active) return <NeedsScan />;
  switch (page) {
    case 'overview': return <Overview />;
    case 'explorer': return <Explorer />;
    case 'visual': return <Visual />;
    case 'types': return <Types />;
    case 'age': return <Age />;
    case 'owners': return <Owners />;
    case 'top': return <TopFiles />;
    case 'duplicates': return <Duplicates />;
    case 'search': return <SearchPage />;
    case 'history': return <HistoryPage />;
    case 'discover': return <Discover />;
    case 'uninstall': return <Uninstaller />;
    case 'cleanup': return <Cleanup />;
    case 'performance': return <Performance />;
    case 'activity': return <ActivityPage />;
    case 'protection': return <ProtectionPage />;
    case 'smartcare': return <SmartCare />;
    case 'clutter': return <Clutter />;
    case 'repairs': return <Repairs />;
    case 'browsers': return <Browsers />;
    case 'game': return <GameMode />;
    case 'hardware': return <Hardware />;
    case 'settings': return <SettingsPage />;
  }
}

function App() {
  const { page } = useApp();
  const [alive, setAlive] = React.useState<string[]>([]);
  React.useEffect(() => { if (KEEP_ALIVE.has(page)) setAlive((a) => (a.includes(page) ? a : [...a, page])); }, [page]);
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {!KEEP_ALIVE.has(page) && <main key={page} className="h-full min-w-0 overflow-hidden anim-page"><Content /></main>}
          {(KEEP_ALIVE.has(page) && !alive.includes(page) ? [...alive, page] : alive).map((p) => (
            <main key={p} className={p === page ? 'h-full min-w-0 overflow-hidden anim-page' : 'hidden'}><Content page={p} /></main>
          ))}
        </div>
      </div>
      <Toasts />
      <ConfirmDialog />
      <ContextMenuHost />
      <WhatsNew />
    </div>
  );
}

// a mesma página serve a janela principal e o painel da barra de menus (#panel)
// (a classe entra antes do primeiro quadro: sem ela o fundo do app aparece por um instante)
if (location.hash === '#panel') document.body.classList.add('panel-body');
createRoot(document.getElementById('root')!).render(
  location.hash === '#panel' ? <Panel /> : (
    <AppProvider>
      <App />
    </AppProvider>
  ),
);
