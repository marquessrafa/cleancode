// Novidades de cada versão, mostradas uma vez na primeira abertura depois de atualizar.
// (as notas técnicas completas ficam em release-notes/<versão>.md e vão para o Release do GitHub)
export interface ChangeGroup { title: string; icon: 'wrench' | 'globe' | 'gamepad' | 'panel' | 'download' | 'sparkles' | 'chip'; items: string[] }
export interface Release { version: string; date: string; headline: string; groups: ChangeGroup[] }

export const CHANGELOG: Release[] = [
  {
    version: '1.4.34', date: '2026-11-27', headline: 'Sem brilho verde embaixo do widget',
    groups: [
      { title: 'Widget', icon: 'chip', items: [
        'O widget não tem mais o brilho da cor de destaque na parte de baixo. Assim, nenhuma borda fica verde.',
      ] },
    ],
  },
  {
    version: '1.4.33', date: '2026-11-27', headline: 'Bordas neutras no widget',
    groups: [
      { title: 'Widget', icon: 'chip', items: [
        'As bordas do widget, dos detalhes e dos cartões agora são de um cinza claro bem fraco, igual em todos os lados, sem o verde da cor de destaque. O cartão selecionado também perdeu a borda colorida.',
      ] },
    ],
  },
  {
    version: '1.4.32', date: '2026-11-27', headline: 'Ajustes no widget',
    groups: [
      { title: 'Widget', icon: 'chip', items: [
        'Os detalhes longos do widget, como o da placa de vídeo, agora rolam por dentro. Antes, o fim do detalhe ficava cortado.',
        'A placa de vídeo do widget aparece com as mesmas partículas de ondas da tela Ventoinhas atrás dela.',
        'No detalhe de cada ventoinha, as três ventoinhas ficaram maiores e ocupam quase toda a largura.',
        'O detalhe da placa de vídeo mostra todas as telas conectadas, cada uma com a resolução, a taxa de atualização e qual é a principal. Antes, duas telas apareciam como uma.',
      ] },
    ],
  },
  {
    version: '1.4.31', date: '2026-11-27', headline: 'Widget redesenhado, com ventoinhas',
    groups: [
      { title: 'Widget', icon: 'chip', items: [
        'O widget da bandeja ficou mais largo e mais baixo. Os cartões das métricas aparecem em três colunas, com todas as informações numa linha só, e os textos que não cabem deslizam devagar para o lado.',
        'O widget agora mostra as ventoinhas ligadas. A placa de vídeo aparece grande, em 3D, com o RPM, o modo e a força ao lado, e cada outra ventoinha ganha um cartão próprio com o desenho girando.',
        'Cada ventoinha abre o próprio detalhe, com o RPM, a temperatura que guia a ventoinha, o histórico da velocidade e a curva com a temperatura de agora.',
        'Os detalhes do disco, da memória, da rede, do processador e da placa de vídeo foram redesenhados. O disco mostra um tanque de partículas que enche até o espaço usado e o mapa do armazenamento, a memória mostra um pente de RAM aceso, e a rede tem um velocímetro para o teste de velocidade.',
        'O widget abre mais rápido e sem piscar. Ele já fica pronto quando o app inicia, e os detalhes de todos os cartões são carregados antes do clique.',
      ] },
    ],
  },
  {
    version: '1.4.30', date: '2026-11-27', headline: 'Ventoinhas 3D nas placas de vídeo',
    groups: [
      { title: 'Ventoinhas', icon: 'chip', items: [
        'As ventoinhas das placas de vídeo agora são modelos 3D, com as pás, o miolo, o dissipador e os canos de calor de cada modelo. Só as pás giram, e o dissipador fica parado atrás delas.',
        'Em rotação alta, as pás viram um borrão de movimento, como numa ventoinha de verdade. Nas ventoinhas com muitas pás, o giro continua visível.',
        'A RX 570 e a RX 580 2048SP mostram a segunda ventoinha girando.',
      ] },
    ],
  },
  {
    version: '1.4.29', date: '2026-11-26', headline: 'Cartões das ventoinhas sem piscar',
    groups: [
      { title: 'Ventoinhas', icon: 'chip', items: [
        'Nos cartões da tela Ventoinhas, o texto Aplicando não fica mais aparecendo e sumindo. O cartão mostra o desenho do modo o tempo todo.',
      ] },
    ],
  },
  {
    version: '1.4.28', date: '2026-11-26', headline: 'Jogos no mapa e no Desinstalador',
    groups: [
      { title: 'Visão geral', icon: 'panel', items: [
        'O mapa do armazenamento ganhou a categoria Jogos. Cada jogo conta uma vez só e sai de Aplicativos, Documentos, Downloads e das outras categorias.',
        'O botão de Downloads no mapa abre a pasta Downloads na árvore do Explorador.',
        'No cartão do disco selecionado, os números de espaço ficam um embaixo do outro quando a janela é estreita, sem quebrar linha.',
        'Os nomes das categorias do mapa não são mais cortados.',
      ] },
      { title: 'Desinstalador', icon: 'wrench', items: [
        'O Desinstalador ganhou o filtro Jogos, e o botão Ver jogos do mapa abre o Desinstalador já filtrado.',
        'O CleanCode encontra jogos em qualquer pasta dos discos, como ports, recomps, pastas com romfs e exefs e jogos instalados sem loja.',
        'Um jogo sem desinstalador vai para a Lixeira com a pasta inteira, depois que você confirma. Você consegue recuperar o jogo até esvaziar a Lixeira.',
      ] },
    ],
  },
  {
    version: '1.4.27', date: '2026-11-25', headline: 'Atualização no Windows igual à do Mac',
    groups: [
      { title: 'Atualizações', icon: 'download', items: [
        'No Windows, a janela de instalação da atualização agora tem o mesmo desenho do popup do app e abre no mesmo lugar dele. Antes, uma segunda janela, com outro visual, aparecia por cima do popup.',
      ] },
    ],
  },
  {
    version: '1.4.26', date: '2026-11-25', headline: 'Curva da ventoinha sem espera ao trocar de modo',
    groups: [
      { title: 'Ventoinhas', icon: 'chip', items: [
        'Quando você troca de modo ou de curva, a ventoinha vai na hora para a velocidade nova. Antes, a curva descia devagar e levava até 33 segundos para chegar ao valor certo.',
      ] },
    ],
  },
  {
    version: '1.4.25', date: '2026-11-25', headline: 'Varredura automática e ventoinhas na rotação real',
    groups: [
      { title: 'Ventoinhas', icon: 'chip', items: [
        'Nas placas de vídeo AMD, o 0% agora devolve a curva original da placa e liga o Zero RPM. Assim, a ventoinha fica parada enquanto a placa está fria.',
        'As ventoinhas da placa de vídeo giram na rotação real, com o borrão de movimento que uma câmera mostraria.',
        'Os cartões das ventoinhas mostram o modo com um desenho animado: um robô para o Automático, uma linha reta para a Velocidade fixa e uma onda para a Curva.',
        'O cartão da placa de vídeo fica da mesma altura dos outros cartões da linha.',
      ] },
      { title: 'Monitor de hardware', icon: 'panel', items: [
        'Depois de uma atualização, o CleanCode refaz a varredura de hardware sozinho, se você já tinha feito antes. O Windows pede a sua permissão uma vez.',
        'Um botão no Monitor de hardware mostra se a varredura foi feita, se ela teve erros ou se ainda falta fazer. Um clique no botão refaz a varredura.',
      ] },
      { title: 'Análise de disco', icon: 'wrench', items: [
        'O disco em 3D da Visão geral não é mais cortado quando a câmera se move.',
      ] },
    ],
  },
  {
    version: '1.4.24', date: '2026-11-25', headline: 'Ventoinhas com fotos, 3D e textos mais curtos',
    groups: [
      { title: 'Ventoinhas', icon: 'chip', items: [
        'A placa de vídeo aparece com a foto do modelo, e as ventoinhas dela giram na rotação da placa. A TechPowerUp cedeu as fotos.',
        'As ventoinhas da placa-mãe aparecem desenhadas, com LEDs que acendem quando elas giram. A saída marcada como bomba mostra uma bomba de water cooler em 3D.',
        'Nas placas de vídeo AMD, o 0% agora liga o Zero RPM, então a ventoinha para enquanto a placa está fria.',
        'Os controles de cada ventoinha ficam num bloco com abas, e a curva ficou mais baixa.',
      ] },
      { title: 'Análise de disco', icon: 'wrench', items: [
        'A tela Discos saiu. O botão + abre uma aba nova e mostra a lista de discos para você escolher.',
        'Na Visão geral, o disco da aba aberta aparece grande, em 3D, com a tag Selecionado.',
      ] },
      { title: 'Aparência', icon: 'sparkles', items: [
        'Os textos do app ficaram mais curtos e diretos.',
        'A janela não fica menor que 1280 por 720 pixels.',
      ] },
    ],
  },
  {
    version: '1.4.23', date: '2026-11-25', headline: 'Tela Discos e abas independentes',
    groups: [
      { title: 'Análise de disco', icon: 'wrench', items: [
        'A tela nova Discos mostra todos os discos do computador. Nela, você escolhe o disco que a aba aberta vai analisar.',
        'Agora cada aba do topo tem a própria análise. O botão + abre uma aba nova, e as telas de Análise de disco mostram o disco da aba que está aberta.',
        'A Visão geral, a Manutenção e o Hardware continuam iguais em todas as abas.',
      ] },
    ],
  },
  {
    version: '1.4.22', date: '2026-11-25', headline: 'Ventoinha da placa de vídeo AMD',
    groups: [
      { title: 'Ventoinhas', icon: 'chip', items: [
        'No Windows, o CleanCode agora controla a ventoinha das placas de vídeo AMD, pelo driver da própria AMD. Você usa a velocidade fixa, a curva e o botão Testar, como nas ventoinhas da placa-mãe.',
        'Quando você volta a placa de vídeo para Automático, ou fecha o CleanCode, a curva de ventoinha e o Zero RPM do driver voltam exatamente ao que eram. Os seus ajustes de desempenho no AMD Software não mudam.',
        'As placas de vídeo NVIDIA e Intel continuam só com a leitura da velocidade, com o selo Em breve.',
      ] },
      { title: 'Painel', icon: 'panel', items: [
        'No painel da bandeja, um valor comprido não fica mais por cima do título do cartão. Agora ele desce para a linha de baixo.',
      ] },
    ],
  },
  {
    version: '1.4.21', date: '2026-11-25', headline: 'Assistente para identificar as ventoinhas',
    groups: [
      { title: 'Ventoinhas', icon: 'chip', items: [
        'O assistente Identificar as ventoinhas acelera uma ventoinha por vez e pergunta onde ela fica. No final, cada saída ganha um nome, como Cooler do processador ou Gabinete, frente.',
        'Agora o CleanCode também confere o RPM. Se a placa aceita o comando, mas a ventoinha não muda de velocidade, o CleanCode devolve a ventoinha ao modo automático e mostra Não responde.',
        'O guia Quando uma ventoinha não obedece explica as causas mais comuns, como ventoinhas num hub de outra marca, e mostra como resolver cada uma.',
      ] },
    ],
  },
  {
    version: '1.4.20', date: '2026-11-24', headline: 'Ventoinhas com tela nova e controle mais seguro',
    groups: [
      { title: 'Ventoinhas', icon: 'chip', items: [
        'A tela Ventoinhas ganhou um visual novo, com cartões menores e um painel para a ventoinha que você escolher. A curva agora aceita pontos novos e mostra a faixa de proteção.',
        'Depois de cada comando, o CleanCode confere o valor que a placa informa. Se a placa não obedecer, o CleanCode devolve a ventoinha ao modo automático e avisa na tela.',
        'Você pode marcar uma saída como bomba do water cooler. Assim, o CleanCode nunca deixa a bomba abaixo de 60%.',
        'O controle da ventoinha da placa de vídeo chega numa próxima versão. Por enquanto, a tela só mostra a velocidade dela.',
      ] },
    ],
  },
  {
    version: '1.4.19', date: '2026-11-24', headline: 'Controle das ventoinhas no Windows',
    groups: [
      { title: 'Ventoinhas', icon: 'chip', items: [
        'No Windows, a tela nova Ventoinhas, no grupo Hardware, deixa você escolher a velocidade de cada ventoinha da placa-mãe e da placa de vídeo. Você pode usar uma velocidade fixa ou uma curva que acompanha a temperatura.',
        'Se o processador ou a placa de vídeo chegar a 90 °C, o CleanCode coloca as ventoinhas controladas em 100%. Quando você fecha o CleanCode, cada ventoinha volta ao modo automático da placa.',
        'O botão Testar muda a velocidade de uma ventoinha por alguns segundos e mostra se ela obedeceu ao comando.',
        'O controle usa o monitoramento avançado. Depois de atualizar, ative o monitoramento avançado de novo, porque o programa dos sensores mudou.',
      ] },
    ],
  },
  {
    version: '1.4.18', date: '2026-11-24', headline: 'Sensores do Windows com leitura completa',
    groups: [
      { title: 'Monitor de hardware', icon: 'chip', items: [
        'No Windows, o Monitor de hardware voltou a mostrar todos os sensores. O nome de alguns pentes de memória vinha com caracteres inválidos, e isso fazia o app descartar a leitura inteira.',
        'O relatório para o GitHub agora inclui os dois registros do programa dos sensores e o erro de leitura, quando ele acontece.',
      ] },
    ],
  },
  {
    version: '1.4.17', date: '2026-11-24', headline: 'Processador e memória de volta nos sensores do Windows',
    groups: [
      { title: 'Monitor de hardware', icon: 'chip', items: [
        'No Windows, o processador e a memória voltaram a aparecer no Monitor de hardware. Na versão 1.4.15, duas cópias do programa dos sensores abriam ao mesmo tempo, e uma achava que a outra tinha caído.',
        'Agora uma peça só fica de fora depois de cair duas vezes seguidas. Ao mapear os sensores de novo, o CleanCode também apaga os registros de quedas antigos.',
      ] },
    ],
  },
  {
    version: '1.4.16', date: '2026-11-24', headline: 'Varreduras voltam a funcionar',
    groups: [
      { title: 'Correções', icon: 'wrench', items: [
        'As varreduras voltaram a funcionar. Desde a versão 1.4.12, a análise de disco, a limpeza, os acúmulos e os dados de apps paravam logo no início no app instalado.',
      ] },
    ],
  },
  {
    version: '1.4.15', date: '2026-11-24', headline: 'Sensores do Windows voltam a funcionar em PCs Intel',
    groups: [
      { title: 'Monitor de hardware', icon: 'chip', items: [
        'No Windows, os sensores do processador, da placa-mãe, da memória e da energia voltaram a aparecer em PCs Intel. Desde a versão 1.4.12, o programa que lê os sensores fechava antes da primeira leitura nesses PCs.',
        'Agora o programa abre todas as peças antes de começar a ler. Se uma peça travar, só ela fica de fora, e as outras continuam com leitura.',
        'Se os sensores avançados pararem de responder, o popup de ativação aparece de novo, em vez de deixar a tela vazia.',
        'Quando você abre o Monitor de hardware e os sensores avançados não estão ativos, um popup oferece a ativação. Ele mostra cada etapa da instalação e fecha sozinho no fim.',
        'Depois de ativar, o popup confere se o processador, a placa de vídeo, a memória, a placa-mãe, os discos e a energia entregaram leituras.',
        'Se a leitura de alguma peça falhar, você pode enviar um relatório para o GitHub com um clique. O relatório não leva o seu nome de usuário nem o nome do computador.',
      ] },
    ],
  },
  {
    version: '1.4.14', date: '2026-11-24', headline: 'Cor de destaque branca',
    groups: [
      { title: 'Aparência', icon: 'sparkles', items: [
        'Nas Configurações, você pode escolher a nova cor de destaque Branco.',
        'No tema escuro, os destaques ficam brancos, e o texto e os ícones sobre eles ficam pretos. A bolinha das chaves também fica preta.',
        'No tema claro, os destaques ficam pretos, sem o brilho no fundo e sem o brilho na borda das caixas.',
      ] },
    ],
  },
  {
    version: '1.4.13', date: '2026-11-24', headline: 'Atualização no Windows instala até o fim e reabre o app',
    groups: [
      { title: 'Atualizações', icon: 'download', items: [
        'No Windows, o botão Atualizar agora instala a versão nova até o fim. Antes, o app fechava, mas a instalação parava no meio e o CleanCode não abria de novo.',
        'A janela de instalação mostra as mesmas etapas do popup. Quando a instalação termina, ela abre o CleanCode na versão nova.',
        'A instalação que acontece quando você fecha o app com uma atualização baixada também foi corrigida.',
      ] },
    ],
  },
  {
    version: '1.4.12', date: '2026-11-24', headline: 'App em três idiomas, menu lateral novo e PCs AMD e Intel em 3D',
    groups: [
      { title: 'Idiomas', icon: 'globe', items: [
        'O CleanCode agora funciona em português, inglês e espanhol, de acordo com o idioma do computador.',
        'Se o idioma do computador não for português nem espanhol, o app usa o inglês. Você também pode escolher o idioma em Configurações.',
        'Os textos do app foram reescritos em frases completas e mais fáceis de entender.',
      ] },
      { title: 'Menu lateral', icon: 'panel', items: [
        'A barra de rolagem do menu agora fica do lado de fora, à direita, e só aparece com o mouse sobre o menu.',
        'Com o menu recolhido, ele abre por cima da tela enquanto o mouse estiver sobre ele e fecha quando o mouse sai.',
        'O menu desliza ao abrir e ao fechar, e, no menu recolhido, cada grupo fica separado por uma linha.',
      ] },
      { title: 'Monitor de hardware', icon: 'chip', items: [
        'Os processadores AMD aparecem em 3D no formato AM5, inclusive no soquete da placa-mãe.',
        'Os desktops com AMD ganharam uma placa-mãe preta de linha gamer. Os desktops com Intel ganharam uma placa-mãe branca e um gabinete branco com vidro escuro e uma tela no canto.',
        'Todos os LEDs dos modelos 3D seguem a cor de destaque.',
        'No Windows, quando o processador não informa a temperatura, o app explica o motivo em vez de mostrar 0 °C. Além disso, uma peça que trava não derruba mais as outras leituras.',
      ] },
    ],
  },
  {
    version: '1.4.11', date: '2026-11-24', headline: 'Popup de atualização com novidades e instalação acompanhada',
    groups: [
      { title: 'Atualizações', icon: 'download', items: [
        'Quando sai uma versão nova, um popup no centro da tela mostra as novidades e o botão Atualizar agora.',
        'Ao atualizar, você acompanha o download e cada etapa da instalação; o CleanCode só reinicia quando tudo terminou.',
        'Se preferir atualizar depois, ele continua instalando sozinho ao fechar a janela.',
      ] },
    ],
  },
  {
    version: '1.4.10', date: '2026-11-24', headline: 'Atualizações aparecem poucos minutos depois de saírem',
    groups: [
      { title: 'Atualizações', icon: 'download', items: [
        'O CleanCode procura versão nova a cada 3 minutos (antes eram 30) e também ao acordar o computador, ao abrir a janela e ao abrir o painel. O aviso aparece uma vez por versão.',
      ] },
    ],
  },
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
        'No macOS 27, os Ajustes abrem em Privacidade e Segurança, porque a Apple não permite abrir direto no item. Depois, clique em Acesso Total ao Disco.',
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
      { title: 'Registro do Windows e Reparos do macOS', icon: 'wrench', items: [
        'Encontra entradas que apontam para programas e arquivos que não existem mais, como itens de inicialização, programas fantasmas, "Abrir com", o menu do botão direito, atalhos e serviços.',
        'Backup .reg automático antes de cada correção, com restauração na própria tela.',
        'Aviso em segundo plano quando um item quebrado novo aparece, e lista dos apps que travaram nos últimos dias.',
        'No Mac: preferências corrompidas, agentes de inicialização órfãos e reconstrução do menu "Abrir com".',
      ] },
      { title: 'Navegadores', icon: 'globe', items: [
        'Chrome, Edge, Brave, Opera, Opera GX, Vivaldi, Chromium, Firefox e Safari, cada perfil separado.',
        'Limpe cache e imagens, cache de GPU, histórico, histórico de downloads, cookies e dados de sites, sessões e preenchimento automático.',
        'A otimização compacta os bancos de dados internos do navegador. As senhas e os favoritos nunca são apagados.',
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
        'O painel abre no canto da tela deslizando, sem piscar.',
      ] },
      { title: 'Downloads', icon: 'download', items: [
        'Instaladores separados: macOS Apple Silicon e Intel, e Windows x64.',
        'Atualizações menores e mais rápidas: cada computador baixa só a versão da própria arquitetura.',
      ] },
    ],
  },
];
