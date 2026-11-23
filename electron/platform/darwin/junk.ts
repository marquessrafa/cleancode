// Categorias da Limpeza no macOS. Só pastas do usuário (não precisa de administrador).
// Itens "review" vêm desmarcados: podem conter coisas que o usuário quer guardar.
import os from 'os';
import path from 'path';
import type { JunkApi, JunkCategory } from '../types';

const H = os.homedir();
const L = (...p: string[]) => path.join(H, 'Library', ...p);

// caches que o macOS recria na hora ou que pertencem a serviços em uso: mexer neles só causa trabalho extra
const CACHE_EXCLUDE = [
  'com.apple.bird', 'com.apple.CloudKit', 'CloudKit', 'com.apple.nsurlsessiond', 'com.apple.akd', 'FamilyCircle',
  'com.apple.ap.adprivacyd', 'com.apple.homed', 'com.apple.Safari.SafeBrowsing', 'com.apple.containermanagerd',
  'com.apple.iCloudHelper', 'com.apple.passd', 'CleanCode*', 'com.cleancode.*',
];

const categories: JunkCategory[] = [
  {
    id: 'user-caches', name: 'Caches de apps', group: 'Sistema', selected: true, risk: 'safe',
    description: 'Arquivos temporários que os apps recriam quando precisam (miniaturas, dados baixados, caches de navegador).',
    targets: [{ path: L('Caches'), mode: 'children', exclude: CACHE_EXCLUDE }],
  },
  {
    id: 'user-logs', name: 'Logs de apps', group: 'Sistema', selected: true, risk: 'safe',
    description: 'Registros de atividade e de falhas dos apps. Só servem para diagnóstico.',
    targets: [{ path: L('Logs'), mode: 'children', exclude: ['DiagnosticReports'] }, { path: L('Logs', 'DiagnosticReports'), mode: 'children', minAgeDays: 7 }],
  },
  {
    id: 'saved-state', name: 'Estado salvo de janelas', group: 'Sistema', selected: false, risk: 'review',
    description: 'Janelas que os apps reabrem ao iniciar. Apagar faz os apps abrirem "limpos".',
    targets: [{ path: L('Saved Application State'), mode: 'children' }],
  },
  {
    id: 'mail-downloads', name: 'Anexos baixados do Mail', group: 'Sistema', selected: true, risk: 'safe',
    description: 'Cópias de anexos que o Mail guarda ao abrir. Os originais continuam nos e-mails.',
    targets: [{ path: L('Containers', 'com.apple.mail', 'Data', 'Library', 'Mail Downloads'), mode: 'children' }],
  },
  {
    id: 'trash', name: 'Lixeira', group: 'Sistema', selected: true, risk: 'safe', removal: 'delete',
    description: 'Itens já enviados para a Lixeira. São apagados definitivamente.',
    targets: [{ path: path.join(H, '.Trash'), mode: 'children' }],
  },
  {
    id: 'xcode-derived', name: 'Xcode: DerivedData', group: 'Desenvolvimento', selected: true, risk: 'safe',
    description: 'Compilações intermediárias do Xcode. São refeitas no próximo build.',
    targets: [{ path: L('Developer', 'Xcode', 'DerivedData'), mode: 'children' }],
  },
  {
    id: 'xcode-sim-caches', name: 'Xcode: caches do simulador', group: 'Desenvolvimento', selected: true, risk: 'safe',
    description: 'Caches do Simulador do iOS.',
    targets: [{ path: L('Developer', 'CoreSimulator', 'Caches'), mode: 'children' }],
  },
  {
    id: 'xcode-device-support', name: 'Xcode: suporte a aparelhos', group: 'Desenvolvimento', selected: false, risk: 'review',
    description: 'Símbolos baixados para depurar iPhones e iPads. Versões antigas raramente são usadas.',
    targets: ['iOS DeviceSupport', 'watchOS DeviceSupport', 'tvOS DeviceSupport'].map((d) => ({ path: L('Developer', 'Xcode', d), mode: 'children' as const })),
  },
  {
    id: 'xcode-archives', name: 'Xcode: arquivos de apps', group: 'Desenvolvimento', selected: false, risk: 'review',
    description: 'Builds arquivados para publicação. Guarde os das versões que ainda estão na loja.',
    targets: [{ path: L('Developer', 'Xcode', 'Archives'), mode: 'children' }],
  },
  {
    id: 'dev-caches', name: 'Caches de pacotes (npm, Gradle, pip…)', group: 'Desenvolvimento', selected: false, risk: 'review',
    description: 'Pacotes baixados por gerenciadores. São baixados de novo quando um projeto precisar.',
    targets: [
      { path: path.join(H, '.npm', '_cacache'), mode: 'self' },
      { path: path.join(H, '.gradle', 'caches'), mode: 'self' },
      { path: path.join(H, '.cache', 'pip'), mode: 'self' },
      { path: path.join(H, '.cache', 'yarn'), mode: 'self' },
      { path: path.join(H, '.pnpm-store'), mode: 'self' },
      { path: path.join(H, '.cargo', 'registry', 'cache'), mode: 'self' },
    ],
  },
  {
    id: 'ios-backups', name: 'Backups de iPhone e iPad', group: 'Aparelhos', selected: false, risk: 'review',
    description: 'Cópias completas de aparelhos feitas pelo Finder. Mantenha a mais recente de cada aparelho.',
    targets: [{ path: L('Application Support', 'MobileSync', 'Backup'), mode: 'children' }],
  },
  {
    id: 'installers', name: 'Instaladores em Transferências', group: 'Arquivos', selected: false, risk: 'review',
    description: 'Imagens .dmg e pacotes .pkg já baixados, com mais de 7 dias.',
    targets: [{ path: path.join(H, 'Downloads'), mode: 'children', exts: ['dmg', 'pkg', 'iso', 'xip'], minAgeDays: 7 }],
  },
  {
    id: 'old-downloads', name: 'Transferências antigas', group: 'Arquivos', selected: false, risk: 'review',
    description: 'Tudo em Transferências sem modificação há mais de 90 dias.',
    targets: [{ path: path.join(H, 'Downloads'), mode: 'children', minAgeDays: 90 }],
  },
];

export const junk: JunkApi = { categories: () => categories };
