# Instruções para agentes (Claude, Codex e outros)

Este arquivo vale para qualquer agente que escreva código, textos ou documentação no CleanCode.
O `CLAUDE.md` da raiz importa este arquivo, então o Claude Code também segue estas regras.

## 1. Como escrever

Estas regras valem para tudo o que uma pessoa vai ler: textos do app (títulos, descrições, dicas,
avisos, botões, mensagens de erro e notificações), README, documentos em `docs/`, notas de versão
(`release-notes/`), entradas do changelog (`src/lib/changelog.ts`), descrição do repositório no GitHub,
mensagens de commit e descrições de pull request.

### 1.1. Regras

1. **Escreva frases completas.** Cada frase tem sujeito, verbo e complemento. Não escreva listas de
   palavras soltas no lugar de uma frase.
2. **Use preposições, artigos e palavras de transição.** Palavras como "porque", "então", "por isso",
   "depois", "antes de", "assim", "além disso", "por exemplo" e "ou seja" ligam as ideias e deixam
   claro o motivo e a ordem das coisas.
3. **Não deixe nada subentendido.** Diga o que acontece, quando acontece e o que a pessoa precisa
   fazer. Se uma ação apaga, move ou muda alguma coisa, diga o que muda e se dá para desfazer.
4. **Prefira palavras do dia a dia.** Quando um termo técnico for necessário (por exemplo, "cache",
   "SMART" ou "hash"), explique o termo na mesma frase ou na frase seguinte.
5. **Não corte frases.** Não use reticências para encurtar texto, não troque a frase por uma
   abreviação e não deixe o texto ser cortado na tela. Se o espaço for pequeno, escreva uma frase mais
   curta e completa, ou deixe o texto quebrar em mais de uma linha.
6. **Uma ideia por frase.** Frases curtas são mais fáceis de ler. Se uma frase tiver mais de duas
   vírgulas, divida em duas frases.
7. **Fale com a pessoa.** Use "você" e verbos na voz ativa: "O CleanCode apaga os arquivos", e não
   "Os arquivos são apagados".
8. **Evite símbolos no lugar de palavras.** Não use "·", "→", "/" ou "+" para ligar ideias dentro de
   uma frase. Esses símbolos podem aparecer em dados (por exemplo, "16 GB · LPDDR5"), mas não no lugar
   de uma explicação.

### 1.2. Exemplos

| Evite | Escreva assim |
| --- | --- |
| Caches, logs, lixeiras, sobras de dev. | O CleanCode encontra caches, registros de atividade (logs), lixeiras e sobras de ferramentas de desenvolvimento. Você revisa tudo antes de apagar. |
| Baixa sozinho; instala ao fechar. | O CleanCode baixa a atualização sozinho. Depois, ele instala a versão nova quando você fecha a janela. |
| Itens com 15% ou mais do total. | Mostra os itens que ocupam 15% ou mais do espaço analisado. |
| Pede elevação (UAC) a cada abertura. | O Windows pede a sua permissão de administrador sempre que o CleanCode abre. Com essa permissão, o CleanCode consegue ler todas as pastas. |
| Funcionam… | Tempo ligado |

## 2. Idiomas da documentação

A documentação pública existe em três idiomas: inglês, espanhol e português do Brasil.

- `README.md` é a versão em inglês e é a página principal do GitHub.
- `docs/readme/README_ES.md` é a versão em espanhol.
- `docs/readme/README_PT-BR.md` é a versão em português do Brasil.

Regras:

1. **Mude as três versões juntas.** Quando você alterar o conteúdo de uma versão, altere as outras
   duas no mesmo commit. As três precisam dizer a mesma coisa.
2. **Mantenha a barra de idiomas.** Cada versão começa com a barra de idiomas, que fica entre os
   comentários `README_LANGUAGES_START` e `README_LANGUAGES_END`. O idioma atual aparece em negrito e
   os outros dois aparecem como links.
3. **Ajuste os caminhos.** As versões em `docs/readme/` ficam duas pastas abaixo da raiz. Por isso,
   imagens e links para arquivos do repositório usam `../../` no começo do caminho.
4. **As regras de escrita valem para os três idiomas.** Em inglês e em espanhol, use frases completas
   e palavras de transição da mesma forma.

O app em si continua em português do Brasil. Os documentos internos de desenvolvimento
(`docs/DESENVOLVIMENTO.md`, `docs/MAC-PORT.md` e `docs/PARIDADE.md`) também ficam em português.

## 3. Idiomas do app

O app funciona em português do Brasil, inglês e espanhol.

- **Como o idioma é escolhido.** O arquivo `electron/lang.ts` decide o idioma assim que o app abre. Primeiro, ele usa a escolha das Configurações (`language`). Se a escolha for "Automático", ele usa o idioma do computador. Se o idioma do computador não for português nem espanhol, ele usa o inglês. Para testar outro idioma, abra o app com a variável `CLEANCODE_LANG=en` ou `CLEANCODE_LANG=es`.
- **Como escrever um texto novo.** Todo texto que aparece na tela passa pela função `t()`. Nas janelas, importe de `src/lib/i18n`. No processo principal, importe de `electron/i18n`. O texto em português é a própria chave, por exemplo `t('Limpar a Lixeira')`.
- **Valores que mudam.** Use `{0}`, `{1}` e assim por diante dentro do texto, e passe os valores depois: `t('{0} itens encontrados', n)`. Não monte frases juntando pedaços, porque a ordem das palavras muda de um idioma para outro.
- **Traduções.** Para cada texto novo, adicione a tradução em `src/locales/en.json` e em `src/locales/es.json`, no mesmo commit. Quando um texto não tem tradução, o app mostra o texto em português.
- **Números e datas.** Use `LOCALE` (exportado pelos mesmos arquivos) em `toLocaleString` e `toLocaleDateString`. Não escreva `'pt-BR'` fixo.
- **Textos que vêm do processo principal.** Quando uma tela mostra um rótulo que veio pronto do processo principal (por exemplo, o nome de um grupo ou de um campo), passe esse rótulo por `t()` na hora de mostrar.
- **Novidades das versões.** O changelog continua em português. O script `scripts/make-latest.cjs` gera as versões em inglês e em espanhol no feed de atualização (`notes_en` e `notes_es`), a partir dos dicionários. Por isso, traduza também os itens novos do changelog nos dicionários.

## 4. Notas de versão e changelog

- Cada item do changelog (`src/lib/changelog.ts`) é uma frase completa que diz o que mudou para a
  pessoa que usa o app. Esses itens aparecem na janela de novidades e no popup de atualização.
- As notas de versão (`release-notes/<versão>.md`) seguem o mesmo estilo. Explique primeiro o que
  mudou para quem usa o app. Depois, se for útil, explique como a mudança funciona por dentro.

## 5. Privacidade

- Não coloque nome de usuário, e-mail, nome de rede Wi-Fi, endereços IP ou nomes de projetos pessoais
  em capturas de tela, commits ou documentos públicos.
- Antes de capturar uma tela, troque esses dados por valores genéricos. Textos desenhados em `canvas`
  (por exemplo, os rótulos do treemap) não passam pela troca automática, então desligue esses rótulos
  antes da captura.
