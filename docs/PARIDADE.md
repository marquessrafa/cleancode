# CleanCode × TreeSize: tabela de paridade

**Referência:** TreeSize **Free 4.8.1**, a edição instalada nesta máquina. O inventário saiu da própria ajuda do app (faixa de opções: Arquivo, Início, Varredura, Exibir, Opções, Treemap, Ajuda; lista de colunas; filtros; dicas). Também incluí os recursos das edições **Professional/Personal** que a ajuda do Free descreve, porque o pedido citou vários deles (duplicados, Excel/HTML, comparação, donos, idades).
Não reaproveitei código, ícones, textos nem marca do TreeSize. O CleanCode tem nome, visual e implementação próprios.

Legenda: ✅ implementado · 🟡 parcial ou diferente · ❌ pendente · — não se aplica

## 1. Varredura e navegação (TreeSize Free)

| Recurso do TreeSize | CleanCode | Observação |
|---|---|---|
| Selecionar diretório / varrer unidade | ✅ | Cartões de unidade na Visão geral e seletor de pasta |
| Resultados durante a varredura | ✅ | Árvore e detalhes se atualizam a cada ~1 s |
| Atualizar / Parar varredura | ✅ | Também dá para "Atualizar esta pasta" no menu de contexto |
| Varreduras recentes | ✅ | |
| Nova instância | ✅ | "Nova janela" nas Configurações |
| Iniciar como administrador / sempre como administrador | ✅ | Botão na barra superior e opção nas Configurações |
| Árvore de diretórios estilo Explorer | ✅ | Virtualizada: aguenta centenas de milhares de pastas |
| Modos de exibição: tamanho, alocado, nº de arquivos, % | ✅ | |
| Unidades Auto/TB/GB/MB/KB/B e casas decimais | ✅ | |
| Expandir até o nível N / expansão total / recolher | ✅ | |
| Nova pasta | ✅ | |
| Pesquisar na árvore | ✅ | Aceita curingas `*` e `?` |
| Pasta pai, voltar e avançar | ✅ | |
| Abrir local no Explorer | ✅ | |
| Barra de status com resumo e link de erros | ✅ | Lista de pastas sem acesso, com o motivo |
| Mostrar erros ao fim da varredura | ✅ | Opção |
| Menu de contexto do Explorer ("Analisar com…") | ✅ | Instalado pelo instalador; liga e desliga nas Configurações |
| Linha de comando: abrir pasta passada como argumento | ✅ | Instância única: repassa a pasta para a janela aberta |
| Varredura multithread | 🟡 | Cada varredura roda numa thread própria e dá para varrer várias pastas ao mesmo tempo (abas). Dentro de uma varredura ainda é uma thread só (~65 mil itens/s; C: com 898 mil arquivos em 13,7 s) |
| Hardlinks e fluxos alternativos (ADS) | ❌ | O Free também não conta (só as edições pagas). Junções e links são mostrados, mas não são seguidos |

## 2. Colunas da visão de detalhes

| Coluna do TreeSize | CleanCode | Observação |
|---|---|---|
| Nome, Caminho completo, Tamanho, Alocado | ✅ | Alocado = clusters reais; usa `GetCompressedFileSize` em arquivos compactados, esparsos e só na nuvem |
| Arquivos, Pastas, % do pai | ✅ | |
| Última modificação (recursiva), Último acesso, Criação | ✅ | Modificação e acesso consideram toda a subárvore, como no TreeSize |
| Compactação (%) | ✅ | |
| Proprietário | ✅ | Preenchida depois de rodar "Proprietários" (leitura sob demanda) |
| Tamanho em mídia óptica | 🟡 | Exato para arquivos; estimado para pastas |
| Atributos (R H S D A C P T O L E) | ✅ | |
| Tipo, Nível, Caminho do conteúdo (pasta), Tamanho médio, Comprimento do caminho | ✅ | |
| Desperdiçado (alocado − tamanho) | ✅ | Coluna extra |
| Permissões | ❌ | |
| Versão do arquivo, Autor, Data do último salvamento, Descrição | ❌ | Exigem ler metadados de cada arquivo |
| Configurar e reordenar colunas | ✅ | Clique direito no cabeçalho |
| Ordenar por qualquer coluna | ✅ | |

## 3. Filtros

| Recurso | CleanCode | Observação |
|---|---|---|
| Regras de inclusão e exclusão | ✅ | |
| Campos: nome do arquivo, caminho completo, nome da pasta | ✅ | Também por **extensão** |
| Padrões: curinga, regex, nome exato | ✅ | |
| Limpar filtro | ✅ | |
| Ocultar pastas vazias | ✅ | |
| Tamanho mínimo e máximo | ✅ | Extra |
| Reaplicar sem varrer de novo | ✅ | Os totais são recalculados em memória (~50 ms) |

## 4. Gráficos

| Recurso | CleanCode | Observação |
|---|---|---|
| Treemap hierárquico | ✅ | Página "Visualizações" |
| Nível de detalhe | ✅ | |
| Arquivos individuais | ✅ | Coloridos por categoria, com legenda |
| 3D / relevo | ✅ | |
| Mostrar hierarquia | ✅ | |
| Rótulos | ✅ | |
| Espaço livre da unidade | ✅ | |
| Clique para entrar na pasta; menu de contexto | ✅ | |
| Posição do treemap (painel direito ou inferior) | 🟡 | O treemap tem página própria em vez de painel acoplado |
| Arrastar e soltar no treemap | ❌ | No TreeSize vem desligado por padrão |
| Pizza e barras (Pro) | ✅ | |

## 5. Opções e interface

| Recurso | CleanCode | Observação |
|---|---|---|
| Tema escuro / claro / automático | ✅ | Barra de título acompanha o tema |
| Indicadores de tamanho na árvore | ✅ | |
| Itens compactados em azul | ✅ | |
| Itens grandes em negrito (≥ 15%) | ✅ | |
| Datas com horário | ✅ | |
| Mostrar arquivos na árvore | ✅ | |
| Dicas de ferramenta | 🟡 | Dicas simples; sem a prévia do conteúdo da pasta |
| Interface otimizada para toque | 🟡 | Layout responsivo, sem modo de toque dedicado |
| Idiomas | 🟡 | Só português (Brasil) por enquanto |
| Verificar atualizações | ❌ | |

## 6. Exportação e relatórios

| Recurso | CleanCode | Observação |
|---|---|---|
| Exportar PDF | ✅ | Relatório com estrutura, maiores extensões e maiores arquivos |
| Imprimir relatório / configurar impressão | ✅ | Diálogo de impressão do sistema |
| Excel (Pro) | ✅ | `.xlsx` com formatação, filtro e aba de resumo |
| HTML, CSV, texto (Pro) | ✅ | CSV com `;` e BOM, abre direto no Excel pt-BR |
| XML (Pro) | 🟡 | Varreduras salvas em JSON compactado (`.json.gz`) |
| Área de transferência (Pro) | 🟡 | Copia caminhos; não copia a tabela |
| Profundidade e inclusão de arquivos na exportação | ✅ | |

## 7. Recursos das edições Pro/Personal

| Recurso | CleanCode | Observação |
|---|---|---|
| Salvar e carregar varreduras | ✅ | Histórico automático + importar e exportar |
| Comparar com varredura anterior | ✅ | Colunas "Anterior" e "Variação" + lista das pastas que mais cresceram |
| Comparar com instantâneos VSS | ❌ | |
| Estatísticas por tipo de arquivo | ✅ | Por extensão e por categoria |
| Estatísticas por proprietário | ✅ | |
| Estatísticas por idade | ✅ | Por modificação, acesso ou criação; faixas e histograma por ano |
| Top 100 maiores arquivos | ✅ | Top 50 a 1000, mais "pastas pesadas" |
| Busca de duplicados | ✅ | Tamanho → hash do início → SHA-1 completo; seleção automática |
| Deduplicar com hardlinks | ❌ | |
| Busca personalizável | ✅ | Nome, tamanho, datas e atributos + pesquisas prontas (temporários, antigos, pastas vazias…) |
| Buscar em vários caminhos ao mesmo tempo | 🟡 | Busca na varredura ativa (uma raiz por vez) |
| Ações sobre resultados: exportar, mover, excluir | ✅ | Exclusão vai para a Lixeira por padrão, com confirmação explícita |
| Ações: compactar / passar para executável | ❌ | |
| Varreduras agendadas | ❌ | |
| Varrer sem permissão (privilégio de backup) | 🟡 | Rodar como administrador cobre a maioria dos casos |

## 8. Recursos próprios do CleanCode (além do TreeSize)

| Recurso | Situação |
|---|---|
| **Descoberta**: apps sem uso há 3, 6, 12 ou 24 meses, com último uso (UserAssist + Prefetch), data de instalação, tamanho e desinstalação na hora | ✅ |
| **Desinstalador**: registro HKLM/HKCU de 32 e 64 bits + Store/MSIX; ordenar por maior, mais antigo e menos usado; desinstalação em lote com confirmação e progresso | ✅ |
| Detecção de remoção real (espera a chave do registro sumir) e modo silencioso opcional (`QuietUninstallString`, MSI `/qb`) | ✅ |
| Tamanho calculado em segundo plano para apps sem `EstimatedSize` | ✅ |
| Interface com barra lateral recolhível, ícones Lucide, tema claro e escuro, animações | ✅ |
| Lista de erros com motivo (acesso negado, em uso…) | ✅ |
| Dashboard na Visão geral: KPIs, distribuição entre discos, oportunidades de limpeza, categorias, idade, tendência e maiores programas | ✅ |
| Tarefas longas (proprietários, duplicados, desinstalação) continuam em segundo plano ao trocar de tela, com centro de atividades e cancelamento | ✅ |
| Roda na bandeja do sistema e inicia com o Windows (minimizado) | ✅ |
| Popup próprio acima do relógio quando o uso de um disco aumenta (limite configurável) ou um programa é instalado | ✅ |
| **Limpeza**: caches, logs, Lixeira, sobras do Xcode e de gerenciadores de pacotes, backups de iPhone, instaladores e downloads antigos (macOS); temporários, caches de navegadores, relatórios de erro, miniaturas, Windows Update e Lixeira (Windows). Revisão por categoria e por item, itens sensíveis desmarcados, Lixeira por padrão, só remove o que veio da análise, registro em atividades | ✅ macOS testado; Windows sem teste em máquina real |
| **Desempenho**: tarefas de manutenção numa única senha/UAC (macOS: liberar memória, DNS, instantâneos locais, scripts periódicos, reindexar Spotlight, permissões; Windows: DNS, otimizar unidades, SFC, DISM); itens de início com liga/desliga (LaunchAgents/Daemons e itens de login no Mac; Run/StartupApproved e pasta Inicializar no Windows); apps que mais usam CPU/memória, agrupados por app, com encerrar | ✅ macOS testado (itens de início e processos); tarefas de manutenção e Windows sem teste real |
| **Acúmulos**: nas pastas pessoais, duplicados (tamanho → início → SHA-1, original preservado e cópias marcadas), fotos parecidas (miniaturas do sistema + dHash com agrupamento por líder), arquivos grandes (100 MB+) e antigos (1 ano), Transferências; tudo para a Lixeira, só caminhos da análise | ✅ macOS testado |
| **Cuidados Inteligentes**: uma análise que junta Limpeza, Proteção, Desempenho e apps sem uso; um clique executa só o seguro (lixo marcado por padrão, para a Lixeira, e, se escolhido, as tarefas recomendadas); o resto fica para revisão em cada módulo | ✅ análise testada no macOS; execução usa os passos já testados de Limpeza e Desempenho |
| **Proteção**: estado das defesas do SO (macOS: Gatekeeper, SIP, XProtect, respostas de segurança, FileVault, firewall; Windows: antivírus, tempo real, definições, firewall, UAC, SmartScreen) com atalho para os ajustes; assinatura de código e local de tudo o que inicia sozinho (itens de início, agentes, serviços, tarefas agendadas) com desativar; extensões de navegador (Chrome, Edge, Brave, Vivaldi, Arc/Opera, Firefox, Safari) com aviso de acesso a todos os sites; verificação rápida do Defender no Windows. Não é antivírus | ✅ macOS testado; Windows sem teste real |
| **Atividades**: linha do tempo de limpezas, manutenções, itens de início, desinstalações e exclusões, com espaço liberado total e por mês e filtros | ✅ |
| **Painel da barra de menus / bandeja** (clique no ícone): saúde do computador, disco, pressão de memória, bateria, carga e temperatura da CPU, taxa da rede e teste de velocidade, dispositivos Bluetooth, recomendação do dia; cores pela cor de destaque | ✅ macOS testado; Windows sem teste em máquina real (temperatura costuma exigir administrador) |
| Painel: posição fixa no canto (Mac: superior direito; Windows: inferior direito) | ✅ macOS testado; Windows sem teste em máquina real |
| Painel: detalhes no formato anel + legenda, quadros de saúde/temperatura, maiores consumidores com ícone e Encerrar, anel segmentado da bateria, gráfico da CPU com grade, Download/Upload com totais, teste de velocidade circular; animações de entrada (desliza de trás do painel, anéis se desenhando, números contando) | ✅ macOS testado; Windows sem teste em máquina real (sem ícones de app no Windows) |
| Painel: cada cartão abre um detalhe à esquerda — Processador (usuário/sistema/disponível, histórico, temperatura, tempo ligado, apps que mais consomem com Encerrar), Memória (apps/fixa/comprimida/disponível, swap, Liberar memória no Mac), Bateria (saúde, capacidade máxima, ciclos, temperatura), Armazenamento (categorias Aplicativos/Mesa/Documentos/Transferências/Outros, saúde do disco), Rede (nome, segurança, IP, roteador, canal, sinal, tráfego, teste de velocidade), Dispositivos (Bluetooth com bateria, discos externos com Ejetar) | ✅ macOS testado (Ejetar não executado no teste); Windows sem teste em máquina real |
| Atualizador embutido: verifica uma pasta ou URL com `latest.yml`, confere o SHA-512, instala em silêncio e reabre | ✅ |
| Desinstalação real testada | ⏳ Só a listagem foi testada; uma desinstalação de verdade depende da sua autorização |
| **Registro / Reparos** (Manutenção): itens comprovadamente quebrados (inicialização, programas fantasmas, App Paths, "Abrir com", menu de contexto, MuiCache, atalhos, serviços só aviso) com backup .reg e restauração; no macOS preferências corrompidas, agentes órfãos, links quebrados e reconstrução do LaunchServices; travamentos recentes de apps; aviso em segundo plano a cada 6 h | ✅ macOS testado; Windows sem teste em máquina real |
| **Navegadores** (Manutenção): Chrome, Edge, Brave, Vivaldi, Chromium, Opera, Opera GX, Firefox e Safari por perfil; cache, GPU/shaders, histórico, downloads, cookies e dados de sites, sessões, preenchimento automático (SQL via node:sqlite, senhas e favoritos preservados); otimização com VACUUM; fechar navegador | ✅ macOS testado com perfil de teste (navegadores reais pedem Acesso Total ao Disco); Windows sem teste em máquina real |
| **Modo Jogo** (Manutenção): sessão que fecha apps, libera memória, plano de energia de alto desempenho/Modo Pouca Energia, prioridade alta do jogo, restaura ao encerrar; Modo de Jogo, Game DVR e HAGS no Windows; caches de shaders; jogos Steam/Epic/GOG e categoria Jogos no Mac | ✅ macOS testado (sem ativar a sessão); Windows sem teste em máquina real |
| Janela de **Novidades** após atualizar e notas técnicas no Release (release-notes/<versão>.md) | ✅ |
| Downloads por arquitetura (macOS Apple Silicon/Intel, Windows x64; sem x86, que o Electron 45 não suporta) e feed do atualizador no repositório de releases, com entradas por arquitetura | ✅ build macOS testado localmente |
| **Monitor de hardware** (grupo Hardware): CPU (núcleos P/E, carga por núcleo, frequência, cache), GPU (uso, memória, temperatura, telas), RAM (tipo, velocidade, pentes), placa-mãe/placa lógica (modelo, BIOS/firmware), energia (W do sistema, carregador, bateria) e sensores, com cenas 3D animadas | ✅ macOS testado; Windows sem teste em máquina real |
| Painel: cartões e detalhes de GPU e Energia | ✅ macOS testado; Windows sem teste em máquina real |
| Monitor de hardware 1.4: modelos 3D (three.js) de GPU, CPU, RAM, placa-mãe, SSD, energia, PC/MacBook/notebook; tabelas de sensores estilo AIDA64 com mín/máx/média/histórico; abas Armazenamento e Energia; mapa térmico e CSV | ✅ macOS testado (IOReport); Windows: LibreHardwareMonitor/PawnIO compilados no CI, sem teste em máquina real |
