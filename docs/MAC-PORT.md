# Port do CleanCode para macOS — plano para a sessão no Mac

Leia também `README.md` (estrutura e publicação) e `PARIDADE.md` (recursos). Responda ao usuário em pt-BR.

## Estado atual (v1.1.0)
- App Electron + React + Tailwind. Instalador Windows (NSIS) gerado pelo GitHub Actions
  (`.github/workflows/release.yml`) a cada tag `vX.Y.Z`.
- Código: repositório **privado** `marquessrafa/cleancode`. Instaladores e atualizações:
  repositório **público** `marquessrafa/cleancode-releases` (o Actions publica lá com o segredo `RELEASES_TOKEN`).
- Atualizador próprio (`electron/updater.ts`): lê `latest.yml` da URL embutida no build
  (`CLEANCODE_UPDATE_SOURCE` = `https://github.com/marquessrafa/cleancode-releases/releases/latest/download`),
  baixa, confere SHA-512 e instala. Em builds locais sem a variável, usa a pasta `release/`
  (reencontrada por `build/feed-id.txt` + `cleancode-feed.json`, ver `electron/feedLocator.ts`).
- Decisões do usuário: **sem assinatura Apple** e **sem App Store** (o Mac dele aceita apps de qualquer
  desenvolvedor). Usar assinatura **ad-hoc** (`codesign -s -`), obrigatória para rodar em Apple Silicon.
- Regra do projeto: **um código só**. Mudanças visuais/lógica comum valem para os dois sistemas;
  só o que fala com o SO tem implementação por plataforma.

## O que já é multiplataforma (não mexer)
`src/**` (todas as telas), histórico, exportação (CSV/XLSX/HTML/PDF), duplicados (hash), filtros,
treemap, tarefas em segundo plano, popup (`public/notify.html`), bandeja (`Tray`), `setLoginItemSettings`,
`shell.trashItem`, seleção de cor/tema.

## O que é específico do Windows (criar a versão macOS)
Sugestão: `electron/platform/index.ts` exporta a implementação pelo `process.platform`
(`win32.ts` = código atual, `darwin.ts` = novo), mantendo as mesmas assinaturas.

| Arquivo atual | Windows | macOS (fazer) |
|---|---|---|
| `electron/win32.ts` + `scanWorker.ts` | `FindFirstFileExW` via koffi, `GetCompressedFileSizeW`, clusters | `fs.promises.opendir` + `lstat` (alocado = `blocks * 512`), não seguir symlinks; pular `/System/Volumes/Data` duplicado e `/Volumes` ao varrer `/` |
| `win32.ts` `drives()` | `GetLogicalDrives`/`GetDiskFreeSpaceEx` | `fs.statfs` em `/` e `/Volumes/*`; nome do volume = nome da pasta |
| `win32.ts` `ownerOf()` | `GetFileSecurityW` + SID | `stat.uid` → nome via `id -nu <uid>` (cache) |
| `win32.ts` `isAdmin`, relaunch como admin | UAC | não se aplica (esconder botões "admin" quando `darwin`) |
| `electron/hardware.ts` | PowerShell + hub USB | `diskutil info -plist <dev>` (SolidState, Protocol: PCI-Express/SATA/USB/Thunderbolt, MediaName) + `system_profiler SPUSBDataType -json` (velocidade USB) |
| `electron/apps.ts` (listar) | registro Uninstall + Appx + UserAssist/Prefetch | `/Applications`, `~/Applications`, `/System/Applications` (só leitura). Info.plist (`CFBundleShortVersionString`, ícone). Último uso: `mdls -name kMDItemLastUsedDate -name kMDItemDateAdded`. Tamanho: soma do `.app`. App Store: `_MASReceipt` dentro do bundle |
| `electron/apps.ts` (desinstalar) | `ShellExecuteEx` do desinstalador | mover `.app` para a Lixeira + oferecer restos (`~/Library/Application Support/<id|nome>`, `Caches`, `Preferences/<bundleId>.plist`, `Containers/<bundleId>`, `Saved Application State`, `LaunchAgents`), sempre com confirmação |
| `electron/monitor.ts` | registro Uninstall + Appx | vigiar `/Applications` (`fs.watch`) para apps novos; discos via `statfs` |
| Menu de contexto (`shell:contextMenu`, `build/installer.nsh`) | registro do Explorer | Quick Action/Serviço do Finder (opcional, fase final) |
| `electron/updater.ts` `installUpdate` | NSIS `/S` | baixar `.zip` do `.app`, extrair em temp (`ditto -x -k`), remover quarentena (`xattr -cr`), trocar `/Applications/CleanCode.app` e reabrir (`open -n`) via script `sh` destacado |
| `scripts/make-latest.cjs` | `latest.yml` | gerar também `latest-mac.yml` (zip + sha512) e escolher pelo `process.platform` no updater |
| Popup | canto inferior direito | no Mac, canto **superior direito** (abaixo da barra de menus): usar `workArea` do topo |
| Janela | `titleBarStyle: 'hidden'` + overlay | `titleBarStyle: 'hiddenInset'` e padding à esquerda no `TopBar` para os botões de semáforo |

## Permissões no Mac
- **Acesso Total ao Disco** (TCC) para varrer `~/Library` etc.: detectar falha de leitura e mostrar aviso com
  botão que abre `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles`.
- Bandeja: usar imagem "template" (preto + alfa) para combinar com o modo claro/escuro da barra de menus.

## Build e publicação
1. `package.json` → `build.mac`: `target: [{ target: "dmg", arch: ["universal"] }, { target: "zip", arch: ["universal"] }]`,
   `identity: "-"` (ad-hoc), `category: public.app-category.utilities`, ícone `.icns` (gerar de `public/icon.png`
   com `iconutil` ou deixar o electron-builder converter de um PNG 1024px).
2. Script `dist:mac` = `npm run build && electron-builder --mac --publish never` + gerar `latest-mac.yml`.
3. `koffi`: no Mac não deve ser carregado (importar `win32.ts` só no Windows) ou instalar o pacote
   `@koromix/koffi-darwin-*`. Preferir não depender de koffi no Mac.
4. Adicionar job `macos` em `.github/workflows/release.yml` (`runs-on: macos-latest`), publicando
   `CleanCode-<v>-universal.dmg`, `.zip` e `latest-mac.yml` no mesmo release de `cleancode-releases`.
5. Testar localmente: `npm run dist:mac`, abrir o `.dmg`, arrastar para Aplicativos, conceder Acesso Total ao Disco.

## Progresso
- [x] **Etapa 1** — camada `electron/platform/` (`types.ts`, `fs.ts`, `index.ts`, `win32/`, `darwin/`); app abre no Mac;
  janela `hiddenInset`, botões de admin e menu de contexto escondidos no Mac.
- [x] **Etapa 2** — varredura (`readdir` + `lstat`, alocado = `blocks * 512`; `/` inteiro: 2,2 mi de arquivos em ~59 s),
  unidades (`statfs` + `mount`), hardware (`diskutil info -plist` + `system_profiler` USB), Lixeira `~/.Trash`/`.Trashes`,
  aviso de Acesso Total ao Disco (Visão geral e lista de erros). Velocidade USB ainda não testada com um disco USB real.
- [x] **Etapa 3** — apps (`platform/darwin/apps.ts`): `.app` em `/Applications` (até 2 níveis), `~/Applications` e
  `/System/Applications` (protegidos; links como Safari seguem para o volume do sistema). Info.plist via `plutil`,
  último uso/inclusão/tamanho via `mdls`, App Store por `_MASReceipt`. Desinstalar = `.app` para a Lixeira (recusa se
  o app estiver aberto) + restos opcionais em `~/Library` por identificador/nome exato, listados na confirmação.
  Testado com um app falso; nenhum app real foi removido.
- [x] **Etapa 4** — monitor de apps novos (`fs.watch` em `/Applications` e `~/Applications` + snapshot a cada 60 s),
  popup no canto superior direito descendo da barra de menus, ícone template da barra de menus
  (`build/trayTemplate.png` + `@2x`, gerado por `scripts/make-tray-icon.cjs`), Dock escondido quando o app fica só na
  barra de menus (`system.setBackgroundMode`).
- [x] **Etapa 5** — `npm run dist:mac` gera `CleanCode-<v>-universal.dmg`/`.zip` (x86_64 + arm64, assinatura ad-hoc,
  ícone `build/icon-mac.png` → `.icns`, sem koffi) e `latest-mac.yml`. Atualizador Mac: `ditto -x -k`, `xattr -cr`, troca
  do `.app` por script `sh` destacado e `open -n --args --updated`; recusa rodar de dentro do `.dmg`/AppTranslocation.
  Item de início via `app.setLoginItemSettings` (SMAppService). Job `macos` no Actions (`needs: windows`).
  Testado aqui: instalação pelo `.dmg` e atualização 1.1.0 → 1.1.1 pelo feed local. O job do Actions só roda numa tag.
- [x] **Etapa 6** — tag `v1.1.1`: jobs `windows` e `macos` passaram; Release em `cleancode-releases` com `.exe`, `.dmg`,
  `.zip`, `latest.yml` e `latest-mac.yml`. O app do Actions lê o feed online (`releases/latest/download`).
- [ ] Opcional: Quick Action "Analisar com CleanCode" no Finder.

## Ordem sugerida
1. Camada `electron/platform/*` e o app abrindo no Mac sem erros (Windows intacto).
2. Varredura + unidades + hardware.
3. Apps: listar, último uso, desinstalar com restos.
4. Monitor, popup e bandeja.
5. Build `.dmg`/`.zip` ad-hoc + atualizador Mac + job no Actions.
6. Verificar que o build Windows continua passando (o Actions roda a cada tag).
