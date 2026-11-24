// Categorias da Limpeza no macOS. Só pastas do usuário (não precisa de administrador).
// Itens "review" vêm desmarcados: podem conter coisas que o usuário quer guardar.
import os from 'os';
import path from 'path';
import type { JunkApi, JunkCategory } from '../types';
import { t } from '../../i18n';

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
    id: 'user-caches', name: t("Caches de apps"), group: 'Sistema', selected: true, risk: 'safe',
    description: t("São arquivos temporários que os apps criam de novo quando precisam, como miniaturas, dados baixados e caches de navegador."),
    targets: [{ path: L('Caches'), mode: 'children', exclude: CACHE_EXCLUDE }],
  },
  {
    id: 'user-logs', name: t("Logs de apps"), group: 'Sistema', selected: true, risk: 'safe',
    description: t("São registros de atividade e de falhas dos apps, que só servem para diagnóstico."),
    targets: [{ path: L('Logs'), mode: 'children', exclude: ['DiagnosticReports'] }, { path: L('Logs', 'DiagnosticReports'), mode: 'children', minAgeDays: 7 }],
  },
  {
    id: 'saved-state', name: t("Estado salvo de janelas"), group: 'Sistema', selected: false, risk: 'review',
    description: t("São as janelas que os apps abrem de novo quando iniciam. Se você apagar, os apps abrem \"limpos\"."),
    targets: [{ path: L('Saved Application State'), mode: 'children' }],
  },
  {
    id: 'mail-downloads', name: t("Anexos baixados do Mail"), group: 'Sistema', selected: true, risk: 'safe',
    description: t("São cópias dos anexos que o Mail guarda quando você abre. Os originais continuam nos e-mails."),
    targets: [{ path: L('Containers', 'com.apple.mail', 'Data', 'Library', 'Mail Downloads'), mode: 'children' }],
  },
  {
    id: 'trash', name: t("Lixeira"), group: 'Sistema', selected: true, risk: 'safe', removal: 'delete',
    description: t("São os itens que já foram para a Lixeira. Eles são apagados de vez."),
    targets: [{ path: path.join(H, '.Trash'), mode: 'children' }],
  },
  {
    id: 'xcode-derived', name: t("Xcode: DerivedData"), group: 'Desenvolvimento', selected: true, risk: 'safe',
    description: t("São compilações intermediárias do Xcode. O Xcode faz essas compilações de novo no próximo build."),
    targets: [{ path: L('Developer', 'Xcode', 'DerivedData'), mode: 'children' }],
  },
  {
    id: 'xcode-sim-caches', name: t("Xcode: caches do simulador"), group: 'Desenvolvimento', selected: true, risk: 'safe',
    description: t("São os caches do Simulador do iOS."),
    targets: [{ path: L('Developer', 'CoreSimulator', 'Caches'), mode: 'children' }],
  },
  {
    id: 'xcode-device-support', name: t("Xcode: suporte a aparelhos"), group: 'Desenvolvimento', selected: false, risk: 'review',
    description: t("São símbolos baixados para depurar iPhones e iPads. As versões antigas quase nunca são usadas."),
    targets: ['iOS DeviceSupport', 'watchOS DeviceSupport', 'tvOS DeviceSupport'].map((d) => ({ path: L('Developer', 'Xcode', d), mode: 'children' as const })),
  },
  {
    id: 'xcode-archives', name: t("Xcode: arquivos de apps"), group: 'Desenvolvimento', selected: false, risk: 'review',
    description: t("São builds arquivados para publicação. Guarde os das versões que ainda estão na loja."),
    targets: [{ path: L('Developer', 'Xcode', 'Archives'), mode: 'children' }],
  },
  {
    id: 'dev-caches', name: t("Caches de pacotes (npm, Gradle e pip)"), group: 'Desenvolvimento', selected: false, risk: 'review',
    description: t("São pacotes baixados por gerenciadores de pacotes. Eles são baixados de novo quando um projeto precisar."),
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
    id: 'ios-backups', name: t("Backups de iPhone e iPad"), group: 'Aparelhos', selected: false, risk: 'review',
    description: t("São cópias completas de aparelhos feitas pelo Finder. Mantenha a cópia mais recente de cada aparelho."),
    targets: [{ path: L('Application Support', 'MobileSync', 'Backup'), mode: 'children' }],
  },
  {
    id: 'installers', name: t("Instaladores em Transferências"), group: 'Arquivos', selected: false, risk: 'review',
    description: t("São imagens .dmg e pacotes .pkg baixados há mais de 7 dias."),
    targets: [{ path: path.join(H, 'Downloads'), mode: 'children', exts: ['dmg', 'pkg', 'iso', 'xip'], minAgeDays: 7 }],
  },
  {
    id: 'old-downloads', name: t("Transferências antigas"), group: 'Arquivos', selected: false, risk: 'review',
    description: t("É tudo o que está em Transferências sem mudança há mais de 90 dias."),
    targets: [{ path: path.join(H, 'Downloads'), mode: 'children', minAgeDays: 90 }],
  },
];

export const junk: JunkApi = { categories: () => categories };
