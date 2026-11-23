// afterSign do electron-builder (macOS): assina o app com o certificado próprio e fixo do CleanCode.
//
// Por quê: com assinatura ad-hoc, o "requisito designado" do app é o hash do binário (cdhash), que muda
// a cada versão. O macOS (TCC) guarda o Acesso Total ao Disco e as outras permissões por esse requisito,
// então cada atualização virava "outro app" e as permissões precisavam ser concedidas de novo.
// Assinado sempre com o mesmo certificado, o requisito passa a ser
//   identifier "com.cleancode.app" and certificate root = H"<hash do certificado>"
// que não muda entre versões, e as permissões continuam valendo depois de atualizar.
//
// Variáveis (definidas no CI a partir dos secrets MAC_CERT_P12 / MAC_CERT_PASSWORD):
//   CLEANCODE_MAC_SIGN_ID   hash SHA-1 ou nome da identidade de assinatura
//   CLEANCODE_MAC_KEYCHAIN  keychain onde a identidade foi importada (opcional)
// Sem elas, o app fica com a assinatura ad-hoc de antes (builds locais de teste).
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function macSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const id = process.env.CLEANCODE_MAC_SIGN_ID;
  if (!id) { console.log('  • mac-sign: sem certificado (CLEANCODE_MAC_SIGN_ID), mantendo a assinatura ad-hoc'); return; }
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const kc = process.env.CLEANCODE_MAC_KEYCHAIN;
  // --deep assina de dentro para fora (frameworks, apps auxiliares e o app); sem hardened runtime,
  // como o build ad-hoc, então não há entitlements a aplicar
  const args = ['--force', '--deep', '--timestamp=none', '--sign', id, ...(kc ? ['--keychain', kc] : []), app];
  execFileSync('/usr/bin/codesign', args, { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  const req = execFileSync('/usr/bin/codesign', ['-d', '-r-', app], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const designated = (req.match(/designated => .*/) || [''])[0];
  console.log(`  • mac-sign: ${path.basename(app)} assinado · ${designated}`);
  if (!/certificate (leaf|root)/.test(designated)) throw new Error(`mac-sign: requisito designado inesperado (${designated || 'vazio'})`);
};
