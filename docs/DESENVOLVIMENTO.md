# CleanCode — guia de desenvolvimento

App desktop para Windows e macOS que mostra para onde foi o espaço do disco e ajuda a desinstalar programas que você não usa mais.

## Stack e por quê

- **Electron + React + Tailwind (Vite)** na interface. Nesta máquina não há Rust, MSVC nem .NET SDK, e o Tauri exigiria instalar essas ferramentas fora do app. Com Electron, tudo instala localmente pelo npm, e o `electron-builder` baixa o NSIS sozinho para gerar o instalador.
- **Varredura nativa via [koffi](https://koffi.dev) (FFI)**: chama `FindFirstFileExW` (com `FIND_FIRST_EX_LARGE_FETCH`), `GetCompressedFileSizeW`, `GetFileSecurityW` e outras APIs Win32 direto do Node, sem compilador. A árvore fica num worker thread em layout colunar, e o app consulta enquanto a varredura acontece.
- **Programas instalados**: um único script PowerShell lê as chaves Uninstall (HKLM/HKCU, 32/64 bits), os pacotes Store/MSIX (`Get-AppxPackage`), o UserAssist (histórico de execução do Explorer) e o Prefetch.

## Comandos

```bash
npm install
```

```bash
npm start
```

```bash
npm run dist
```

```bash
npm run dist:mac
```

`npm start` compila e abre o app. `npm run dist` (no Windows) gera `release/CleanCode-<versão>-Windows-x64.exe` e `-Windows-x86.exe`.
`npm run dist:mac` (no Mac) gera `release/CleanCode-<versão>-macOS-Apple-Silicon.dmg` e `-macOS-Intel.dmg` (+ os `.zip` do atualizador),
com assinatura ad-hoc (sem conta de desenvolvedor Apple) e o `latest-mac.yml` do atualizador, com uma entrada por arquitetura.

No Mac, abra o `.dmg`, arraste o CleanCode para Aplicativos e conceda **Acesso Total ao Disco** em Ajustes do Sistema ›
Privacidade e Segurança (o app avisa e abre o painel). Como o app não é autenticado pela Apple, na primeira abertura
pode ser preciso clicar com o botão direito › Abrir (ou liberar em Privacidade e Segurança).

### Publicar uma atualização

1. Suba a versão em `package.json`.
2. Rode `npm run dist` (Windows) ou `npm run dist:mac` (Mac). O build sai em `release-build/` e é publicado em `release/` com:
   - o instalador (`.exe`) ou o `.dmg` + `.zip`;
   - o `latest.yml` / `latest-mac.yml` (versão, tamanho e SHA-512);
   - o `cleancode-feed.json`, com o identificador fixo de `build/feed-id.txt`.
3. Não é preciso configurar nada nos apps instalados:
   - O app já sai com a origem das atualizações embutida (a pasta `release`).
   - Se a pasta do projeto mudar de lugar, o app a reencontra pelo identificador, procurando na Área de Trabalho, em Documentos, no perfil do usuário, no OneDrive e na raiz dos discos.
   - Ele percebe a versão nova assim que ela aparece na pasta (e também a cada 30 minutos) e baixa sozinho.
   - Se o app estiver só na bandeja, instala na hora. Com a janela aberta, instala quando você a fecha. Depois reabre atualizado.
   - No Mac, o atualizador extrai o `.zip` com `ditto`, remove a quarentena e troca o `CleanCode.app` no lugar (o app precisa estar em Aplicativos, não rodando direto do `.dmg`).
   - Pelo GitHub Actions (tag `vX.Y.Z`), os dois sistemas são gerados e publicados no mesmo Release de `cleancode-releases`.
   - Para distribuir por URL, gere o build com `CLEANCODE_UPDATE_SOURCE=https://…/`.

Para rodar várias cópias isoladas (testes), defina `CLEANCODE_PROFILE=<nome>`: cada perfil tem as próprias configurações e o próprio histórico.

## Estrutura

- `electron/main.ts`: janela, IPC, histórico, exportação, menu de contexto
- `electron/scanWorker.ts`: varredura e todas as consultas (árvore, tipos, idade, duplicados, donos, busca, comparação)
- `electron/platform/`: tudo o que conversa com o SO, com as mesmas assinaturas em cada sistema
  - `types.ts`: contratos (`NativeFs`, `SystemApi`) e tipos comuns
  - `fs.ts`: primitivas de arquivos e unidades do SO atual (usado também pelos workers)
  - `index.ts`: `fs` + `system` (apps, hardware, janela, menu de contexto, atualizador) para o processo principal
  - `win32/`: `native.ts` (bindings Win32 via koffi), `apps.ts` (inventário e desinstalação), `hardware.ts`, `index.ts`
  - `darwin/`: `native.ts` (Node puro: `readdir` + `lstat`, `statfs`, `mount`), `index.ts` (port em andamento, ver [MAC-PORT.md](MAC-PORT.md))
- `electron/exporter.ts`: CSV, Excel, HTML e PDF
- `electron/metrics.ts`: painel da barra de menus / bandeja (CPU, memória, disco, bateria, temperatura, rede, dispositivos, saúde, teste de velocidade); leituras por SO em `platform/*/metrics.ts`
- `native/macos/cc-sensors.c`: helper próprio de temperatura (IOHID no Apple Silicon, SMC no Intel), compilado universal no build do Mac
- `src/panel/Panel.tsx`: interface do painel (rota `#panel` da mesma página)
- `src/pages/*`: telas (Visão geral, Explorador, Visualizações, Tipos, Idade, Proprietários, Maiores arquivos, Duplicados, Pesquisa, Histórico, Descoberta, Desinstalador, Configurações)

## Segurança

- Excluir sempre pede confirmação explícita (lista de itens + caixa de confirmação). A opção padrão é a **Lixeira**.
- Desinstalar sempre mostra a lista e pede confirmação. Os desinstaladores rodam um por vez, e o app só marca como removido quando a entrada some do registro.

A comparação com o TreeSize está em [PARIDADE.md](PARIDADE.md).
