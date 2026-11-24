// Novidades de cada versão, mostradas uma vez na primeira abertura depois de atualizar.
// (as notas técnicas completas ficam em release-notes/<versão>.md e vão para o Release do GitHub)
export interface ChangeGroup { title: string; icon: 'wrench' | 'globe' | 'gamepad' | 'panel' | 'download' | 'sparkles' | 'chip'; items: string[] }
export interface Release { version: string; date: string; headline: string; groups: ChangeGroup[] }

export const CHANGELOG: Release[] = [
  {
    version: '1.4.9', date: '2026-11-24', headline: 'Notebook Windows renovado no Monitor de hardware',
    groups: [
      { title: 'Monitor de hardware', icon: 'chip', items: [
        'O notebook Windows ganhou corpo de alumínio grafite, tela de bordas finas com câmera, teclado iluminado na cor de destaque, leitor de digital, ventilação e portas de verdade.',
        'A tela mostra um wallpaper novo de ondas de luz e uma barra de tarefas com relógio e ícones.',
      ] },
    ],
  },
  {
    version: '1.4.8', date: '2026-11-24', headline: 'Processador certo na placa-mãe do desktop',
    groups: [
      { title: 'Monitor de hardware', icon: 'chip', items: [
        'A placa-mãe do desktop agora mostra no soquete o mesmo processador da aba Processador, com o nome do seu processador gravado, tanto sozinha quanto dentro do gabinete.',
      ] },
    ],
  },
  {
    version: '1.4.7', date: '2026-11-24', headline: 'Dossiê de cada programa, mapa do armazenamento e visual novo',
    groups: [
      { title: 'Programas', icon: 'sparkles', items: [
        'Dossiê de cada programa e jogo: quem criou, licença, lançamento, versão mais recente, assinatura, permissões, tecnologias e as pastas de dados que ele deixa no seu perfil.',
        'Instalados recentemente na Visão geral e no Desinstalador, com atalho para abrir a pasta na árvore. A notificação de app instalado abre o dossiê dele.',
        'Os apps aparecem com o ícone de verdade, maior e sem caixa.',
      ] },
      { title: 'Navegação', icon: 'panel', items: [
        'Voltar e avançar entre as telas e entre as pastas do Explorador, com os botões laterais do mouse, o teclado, o gesto do trackpad ou as setas no topo.',
        'Menu lateral flutuante, brilho na cor de destaque no topo e as telas centralizadas.',
      ] },
      { title: 'Visão geral', icon: 'download', items: [
        'Mapa do armazenamento: mostra o que ocupa o disco (apps, documentos, downloads, caches, desenvolvimento…) com o atalho certo para cada parte.',
      ] },
      { title: 'Monitor de hardware', icon: 'chip', items: [
        '3D mais fosco e sem serrilhado, solto da moldura, com circuito animado ao fundo e câmera que passeia sozinha, com aproximações nas partes de cada peça.',
        'MacBook com tela, Dock e barra de menu, e a tampa abrindo e fechando. Energia do notebook/Mac com um modelo novo.',
      ] },
    ],
  },
  {
    version: '1.4.6', date: '2026-11-23', headline: 'Temperatura certa dos SSDs e passo a passo do Acesso Total ao Disco',
    groups: [
      { title: 'Windows', icon: 'chip', items: [
        'SSDs NVMe: a temperatura mostrada agora é a leitura real. Antes podia aparecer o limite de fábrica do SSD (acima de 100 °C) como se fosse a temperatura.',
        'Dois SSDs iguais não misturam mais os sensores, e a saúde do NVMe passou a ser calculada certo.',
      ] },
      { title: 'Mac', icon: 'panel', items: [
        'O assistente de Acesso Total ao Disco mostra os seis passos do macOS, incluindo os avisos "Ignorar Proteções do Sistema" e os três OK do alerta vermelho, com o caminho do app já copiado para o +.',
      ] },
    ],
  },
  {
    version: '1.4.5', date: '2026-11-23', headline: 'Acesso Total ao Disco pelo botão +',
    groups: [
      { title: 'Mac', icon: 'panel', items: [
        'O assistente agora copia o caminho do app: no + da lista do Acesso Total ao Disco, aperte ⌘⇧G, cole e clique em Abrir. Também abre o CleanCode selecionado no Finder para arrastar de lá.',
      ] },
    ],
  },
  {
    version: '1.4.4', date: '2026-11-23', headline: 'Painel instantâneo e temperatura real da CPU',
    groups: [
      { title: 'Painel', icon: 'panel', items: [
        'O painel da barra de menus / bandeja abre com os números na hora, sem ficar carregando.',
      ] },
      { title: 'Windows', icon: 'chip', items: [
        'A temperatura do processador agora vem do sensor real (a mesma fonte do AIDA64), com o monitoramento avançado ativo. Antes aparecia a zona térmica da placa, quase sempre fixa em 28 °C.',
      ] },
    ],
  },
  {
    version: '1.4.3', date: '2026-11-23', headline: 'Assistente de Acesso Total ao Disco mais claro',
    groups: [
      { title: 'Mac', icon: 'panel', items: [
        'A janelinha para arrastar o CleanCode até o Acesso Total ao Disco agora mostra o ícone, está maior e indica cada passo.',
        'No macOS 27 os Ajustes abrem em Privacidade e Segurança (a Apple não permite abrir direto no item): é só clicar em Acesso Total ao Disco.',
      ] },
    ],
  },
  {
    version: '1.4.2', date: '2026-11-23', headline: 'Liberar memória com um clique',
    groups: [
      { title: 'Memória', icon: 'wrench', items: [
        'Liberar direto no quadrado da Memória do painel, sem abrir o detalhe, mostrando quanto ficou livre.',
        'Windows: Liberar memória também em Desempenho › Manutenção.',
      ] },
    ],
  },
  {
    version: '1.4.1', date: '2026-11-23', headline: 'AppData, liberar memória e permissões que não se perdem',
    groups: [
      { title: 'Nova tela: AppData', icon: 'sparkles', items: [
        'Veja quanto cada programa guarda em AppData (no Mac, em Dados de apps) e limpe só o que é seguro: caches, logs e versões antigas deixadas por atualizações.',
        'Sobras de programas já desinstalados aparecem separadas e podem ir para a Lixeira.',
      ] },
      { title: 'Memória e limpeza', icon: 'wrench', items: [
        'Botão Liberar memória no painel, na aba Memória e no menu do ícone.',
        'A limpeza de temporários agora encontra muito mais: pastas com algum arquivo recente não escondem mais o que está parado. No Windows, há também um modo agressivo.',
      ] },
      { title: 'Modo Jogo', icon: 'gamepad', items: [
        'Adicione pastas de jogos instalados fora da Steam, Epic e GOG.',
      ] },
      { title: 'Correções', icon: 'panel', items: [
        'Windows: o monitoramento avançado não abre mais uma janela de CMD, e o driver de sensores instala sem janelas. Se você já tinha ativado, ative de novo uma vez.',
        'Mac: o Acesso Total ao Disco continua valendo depois das próximas atualizações (pode ser pedido uma última vez), com um assistente que guia a liberação.',
      ] },
    ],
  },
  {
    version: '1.4.0', date: '2026-11-23', headline: 'Monitor de hardware em 3D, nível AIDA64',
    groups: [
      { title: 'Modelos 3D de verdade', icon: 'chip', items: [
        'Placa de vídeo, processador, memória RAM, placa-mãe, SSD e energia em 3D com luz, reflexos e LEDs neon (three.js).',
        'A visão geral mostra o seu computador: PC em gabinete de vidro com water cooler, MacBook ou notebook Windows.',
        'Cada máquina com as peças certas: no Mac, o chip com CPU, GPU e memória unificada e a placa lógica do MacBook; no notebook, processador soldado, memória SO-DIMM ou soldada e placa de notebook.',
        'Fundo tecnológico com grade neon e partículas.',
        'Ventoinhas giram com o uso, os LEDs acompanham a cor de destaque, a RAM aparece nos slots e o water cooler mostra a temperatura.',
      ] },
      { title: 'Monitoramento completo', icon: 'sparkles', items: [
        'Cada componente com tabela de sensores: valor atual, mínimo, máximo, média e minigráfico.',
        'Windows: LibreHardwareMonitor integrado. Ative o monitoramento avançado para ler temperatura e frequência por núcleo, tensões, ventoinhas da placa-mãe, consumo e SMART.',
        'Mac: frequência dos núcleos de eficiência e de desempenho, frequência e consumo da GPU, sem pedir senha.',
      ] },
      { title: 'Novas abas', icon: 'download', items: [
        'Armazenamento: cada disco com modelo, firmware, interface, saúde, temperatura, horas ligado, dados gravados e partições.',
        'Energia: fluxo animado da fonte (PC) ou da bateria (notebook), consumo, tensões e carregador.',
        'Sensores: mapa térmico de todos os componentes e exportação dos dados em CSV.',
      ] },
    ],
  },
  {
    version: '1.3.2', date: '2026-11-23', headline: 'Buscar atualização a qualquer momento',
    groups: [
      { title: 'Atualizações', icon: 'download', items: [
        'Botão no canto superior direito com a versão instalada: um clique busca atualização na hora.',
        'Cada sistema recebe a versão nova assim que o instalador dele fica pronto, sem esperar o do outro sistema.',
        'O app consulta duas fontes e usa sempre a versão mais nova encontrada.',
      ] },
    ],
  },
  {
    version: '1.3.1', date: '2026-11-23', headline: 'Tarefas que continuam, discos em destaque e sensores',
    groups: [
      { title: 'Tarefas em andamento', icon: 'sparkles', items: [
        'O que você inicia continua rodando ao trocar de tela: a página volta exatamente como estava, com o progresso ou o resultado.',
        'Um ponto verde no menu lateral mostra cada tela executando, e a central de atividades no topo lista tudo o que está em andamento.',
      ] },
      { title: 'Visão geral e análise', icon: 'download', items: [
        'Os discos ficam em destaque no topo da Visão geral, prontos para analisar.',
        'O botão + da barra superior abre um menu para escolher um disco ou uma pasta.',
        'Cuidados Inteligentes agora abre o grupo Manutenção.',
      ] },
      { title: 'Sensores', icon: 'chip', items: [
        'Windows: temperatura, ventoinha e potência de qualquer placa de vídeo (NVIDIA, AMD e Intel), sem precisar de administrador.',
        'Windows: temperatura de cada disco separado e das zonas térmicas do processador; quando faltar permissão, o app oferece reabrir como administrador.',
        'A aba Sensores mostra um medidor para cada sensor encontrado.',
      ] },
      { title: 'Visual', icon: 'panel', items: [
        'As telas iniciais de Manutenção ganharam objetos 3D animados, soltos na tela, que reagem ao mouse e aceleram durante a execução.',
        'A janela de novidades volta a aparecer depois de atualizar.',
      ] },
    ],
  },
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
