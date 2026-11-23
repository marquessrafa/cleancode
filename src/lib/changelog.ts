// Novidades de cada versão, mostradas uma vez na primeira abertura depois de atualizar.
// (as notas técnicas completas ficam em release-notes/<versão>.md e vão para o Release do GitHub)
export interface ChangeGroup { title: string; icon: 'wrench' | 'globe' | 'gamepad' | 'panel' | 'download' | 'sparkles' | 'chip'; items: string[] }
export interface Release { version: string; date: string; headline: string; groups: ChangeGroup[] }

export const CHANGELOG: Release[] = [
  {
    version: '1.3.0', date: '2026-11-23', headline: 'Hardware, registro, navegadores e Modo Jogo',
    groups: [
      { title: 'Registro do Windows / Reparos do macOS', icon: 'wrench', items: [
        'Encontra entradas que apontam para programas e arquivos que não existem mais: inicialização, programas fantasmas, "Abrir com", menu do botão direito, atalhos e serviços.',
        'Backup .reg automático antes de cada correção, com restauração na própria tela.',
        'Aviso em segundo plano quando um item quebrado novo aparece, e lista dos apps que travaram nos últimos dias.',
        'No Mac: preferências corrompidas, agentes de inicialização órfãos e reconstrução do menu "Abrir com".',
      ] },
      { title: 'Navegadores', icon: 'globe', items: [
        'Chrome, Edge, Brave, Opera, Opera GX, Vivaldi, Chromium, Firefox e Safari, cada perfil separado.',
        'Limpe cache e imagens, cache de GPU, histórico, histórico de downloads, cookies e dados de sites, sessões e preenchimento automático.',
        'Otimização: compacta os bancos internos do navegador. Senhas e favoritos nunca são apagados.',
      ] },
      { title: 'Modo Jogo', icon: 'gamepad', items: [
        'Sessão de jogo que fecha apps pesados, libera memória e põe o sistema em desempenho máximo; ao encerrar, restaura tudo.',
        'Windows: plano de energia de alto desempenho, prioridade alta para o jogo, Modo de Jogo, gravação do Xbox e agendamento de GPU.',
        'Jogos da Steam, Epic e GOG detectados, e limpeza dos caches de shaders (DirectX, NVIDIA, AMD, Intel e Metal).',
      ] },
      { title: 'Monitor de hardware', icon: 'chip', items: [
        'Área nova com processador, placa de vídeo, memória RAM, placa-mãe, energia e sensores, com leituras ao vivo.',
        'Cenas 3D animadas: núcleos acendem com a carga, ventoinhas da GPU giram com o uso, pentes de RAM enchem e a energia corre pela placa.',
        'Ficha técnica completa: modelos, núcleos, frequência, cache, memória de vídeo, tipo e velocidade da RAM, BIOS/firmware, telas conectadas.',
      ] },
      { title: 'Painel da barra de menus', icon: 'panel', items: [
        'Novos cartões de GPU (uso, memória, temperatura, apps que mais usam) e Energia (consumo em watts, carregador, bateria).',
        'Detalhes de armazenamento, memória, bateria, CPU, rede e dispositivos com anéis e gráficos animados.',
        'Abre no canto da tela deslizando, sem piscar.',
      ] },
      { title: 'Downloads', icon: 'download', items: [
        'Instaladores separados: macOS Apple Silicon e Intel, e Windows x64.',
        'Atualizações menores e mais rápidas: cada computador baixa só a versão da própria arquitetura.',
      ] },
    ],
  },
];
