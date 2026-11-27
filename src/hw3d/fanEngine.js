// Motor das ventoinhas 3D das placas de vídeo (pás, miolo, anel, dissipador, aletas, canos, luz das pás e borrão).
// O modelador (.capturas/modelador/fan3d.html) e o app usam este mesmo arquivo, então o que aparece no modelador é o que
// aparece no app. As medidas de cada placa ficam em public/gpus/fans3d.json (exportadas do modelador).
// @ts-nocheck
export const PARAMS = {
  rpm:      { label: 'RPM', min: 0, max: 3300, step: 10, def: 0, g: 'Giro' },
  borraoPx: { label: 'Degrau do borrão (px)', min: 1, max: 100, step: 0.5, def: 6, g: 'Giro' },
  borrao:   { label: 'Força do borrão', min: 0, max: 1, step: 0.01, def: 1, g: 'Giro' },
  giro:     { label: 'Direção do giro', type: 'select', options: [['0', 'Horário'], ['1', 'Anti-horário']], def: 1, g: 'Formato das pás' },
  fluxo:    { label: 'Fluxo de ar', type: 'select', options: [['0', 'Puxa o ar para dentro da placa'], ['1', 'Empurra o ar para fora']], def: 0, g: 'Formato das pás' },
  fase:     { label: 'Giro inicial (°)', min: 0, max: 360, step: 0.5, def: 0, g: 'Formato das pás' },
  escDiss:  { label: 'Escurecer o dissipador', min: 0, max: 1, step: 0.01, def: 0, g: 'Luz do fundo' },
  aletaTipo:{ label: 'Tipo das aletas', type: 'select', options: [['0', 'Paralelas'], ['1', 'Radiais (do centro para fora)']], def: 0, g: 'Dissipador' },
  corBase:  { label: 'Cor do fundo', type: 'color', def: '#0b0c0e', g: 'Dissipador' },
  brilhoDiss:{ label: 'Brilho do dissipador', min: 0, max: 1, step: 0.01, def: 0.18, g: 'Luz do fundo' },
  abertura: { label: 'Abertura (raio %)', min: 95, max: 125, step: 0.5, def: 104, g: 'Dissipador' },
  pas:      { label: 'Pás', min: 3, max: 100, step: 1, def: 9, g: 'Formato das pás' },
  curva:    { label: 'Curvatura (°)', min: -90, max: 90, step: 1, def: 62, g: 'Formato das pás' },
  saida:    { label: 'Ângulo de saída (°)', min: -75, max: 75, step: 0.5, def: 0, g: 'Formato das pás' },
  arco:     { label: 'Arco da borda', min: 0.6, max: 2.5, step: 0.05, def: 1.25, g: 'Formato das pás' },
  raizCurva:{ label: 'Curva contrária na raiz (°)', min: -60, max: 60, step: 0.5, def: 0, g: 'Formato das pás' },
  raizCurvaAte:{ label: 'Alcance da curva da raiz', min: 0.05, max: 0.8, step: 0.01, def: 0.3, g: 'Formato das pás' },
  larg:     { label: 'Largura na ponta (°)', min: 6, max: 120, step: 0.5, def: 21, g: 'Formato das pás' },
  raiz:     { label: 'Largura na raiz (°)', min: 4, max: 120, step: 0.5, def: 11, g: 'Formato das pás' },
  redonda:  { label: 'Ponta redonda', min: 0, max: 1, step: 0.01, def: 0.15, g: 'Formato das pás' },
  pontaLink:{ label: 'Pás acompanham a abertura', type: 'select', options: [['0', 'Não'], ['1', 'Sim']], def: 0, g: 'Formato das pás' },
  ponta:    { label: 'Ponta (raio %)', min: 80, max: 125, step: 0.5, def: 97, g: 'Formato das pás' },
  anel:     { label: 'Anel nas pontas', min: 0, max: 1, step: 1, def: 0, g: 'Formato das pás' },
  anelPAlt: { label: 'Altura do anel das pontas', min: 0.1, max: 8, step: 0.02, def: 0.6, g: 'Formato das pás' },
  anelPEsp: { label: 'Espessura do anel das pontas', min: 0.05, max: 0.8, step: 0.01, def: 0.16, g: 'Formato das pás' },
  anelPPos: { label: 'Profundidade do anel das pontas', min: -1.5, max: 1.5, step: 0.02, def: 0, g: 'Formato das pás' },
  incl:     { label: 'Inclinação (°)', min: 0, max: 90, step: 1, def: 14, g: 'Volume das pás' },
  esp:      { label: 'Espessura', min: 0.02, max: 0.6, step: 0.01, def: 0.13, g: 'Volume das pás' },
  arestaLado: { label: 'Lado da aresta clara', type: 'select', options: [['0', 'Borda de ataque'], ['1', 'Borda de fuga']], def: 0, g: 'Volume das pás' },
  raizForma:{ label: 'Formato da raiz', type: 'select', options: [['0', 'Quadrada'], ['1', 'Pontiaguda'], ['2', 'Arredondada']], def: 0, g: 'Volume das pás' },
  encaixe:  { label: 'Distância que entra no miolo', min: 0, max: 0.9, step: 0.01, def: 0, g: 'Volume das pás' },
  sombraInt:{ label: 'Sombra interna', min: 0, max: 1, step: 0.01, def: 0.45, g: 'Luz das ventoinhas' },
  sombraPas:{ label: 'Sombra entre pás', min: 0, max: 1, step: 0.01, def: 0, g: 'Luz das ventoinhas' },
  sombraPasSuave:{ label: 'Suavidade da sombra entre pás', min: 0.02, max: 1, step: 0.01, def: 0.3, g: 'Luz das ventoinhas' },
  nivel:    { label: 'Nivelar a altura', min: 0, max: 1, step: 0.01, def: 0, g: 'Volume das pás' },
  alturaPas:{ label: 'Altura das pás', min: 0, max: 4, step: 0.02, def: 1, g: 'Volume das pás' },
  altPas:   { label: 'Profundidade das pás', min: -1.5, max: 1.5, step: 0.02, def: 0, g: 'Volume das pás' },
  aresta:   { label: 'Aresta clara', min: 0, max: 0.4, step: 0.01, def: 0.07, g: 'Volume das pás' },
  cor:      { label: 'Cor da pá', type: 'color', def: '#45474b', g: 'Cores' },
  corAresta:{ label: 'Cor da aresta', type: 'color', def: '#e9ebee', g: 'Cores' },
  acab:     { label: 'Acabamento das pás', type: 'select', options: [['0', 'Fosco'], ['1', 'Acetinado'], ['2', 'Brilhante']], def: 1, g: 'Cores' },
  verniz:   { label: 'Verniz da pá', min: 0, max: 1, step: 0.01, def: 0.45, g: 'Cores' },
  aspereza: { label: 'Aspereza da pá', min: 0, max: 1, step: 0.01, def: 0.5, g: 'Cores' },
  mioloCone:{ label: 'Forma do miolo', min: 0, max: 0.5, step: 0.01, def: 0, g: 'Miolo e aro' },
  raizPas:  { label: 'Início das pás (raio %)', min: 15, max: 92, step: 0.5, def: 0, g: 'Miolo e aro' },
  degrauTipo:{ label: 'Tipo do espaço', type: 'select', options: [['0', 'Degrau plano'], ['1', 'Vazado (mostra o fundo)']], def: 0, g: 'Miolo e aro' },
  platAlt:  { label: 'Altura do degrau', min: -3, max: 0, step: 0.02, def: -0.2, g: 'Miolo e aro' },
  corPlat:  { label: 'Cor do degrau', type: 'color', def: '#1c1d20', g: 'Miolo e aro' },
  miolo:    { label: 'Miolo (raio %)', min: 10, max: 85, step: 0.5, def: 30, g: 'Miolo e aro' },
  circs:    { type: 'hidden', def: () => Array.from({ length: 6 }, (_, i) => ({ raio: 0.95 - i * 0.15, largura: 0.04, cheio: 0, relevo: 0, altura: 0.08, cor: '#55585d' })) },
  relevo:   { label: 'Relevo do centro', min: 0, max: 1, step: 0.01, def: 0, g: 'Miolo e aro' },
  anelAlt:  { label: 'Altura do anel', min: 0.2, max: 3, step: 0.02, def: 0.46, g: 'Miolo e aro' },
  anelLarg: { label: 'Largura do anel', min: 0, max: 0.4, step: 0.01, def: 0.2, g: 'Miolo e aro' },
  acabMiolo:{ label: 'Acabamento do miolo e do aro', type: 'select', options: [['0', 'Fosco'], ['1', 'Acetinado'], ['2', 'Brilhante']], def: 2, g: 'Miolo e aro' },
  corMiolo: { label: 'Cor do anel do miolo', type: 'color', def: '#d7d9dc', g: 'Miolo e aro' },
  corParede:{ label: 'Cor da parede do miolo', type: 'color', def: '#2a2c30', g: 'Miolo e aro' },
  corCentro:{ label: 'Cor do centro', type: 'color', def: '#3a3c40', g: 'Miolo e aro' },
  corAro:   { label: 'Cor do aro', type: 'color', def: '#c9ccd0', g: 'Miolo e aro' },
  corAleta: { label: 'Cor das aletas', type: 'color', def: '#34373b', g: 'Dissipador' },
  aletaEsp: { label: 'Largura das aletas', min: 0.01, max: 0.5, step: 0.005, def: 0.035, g: 'Dissipador' },
  aletaIncl:{ label: 'Inclinação das aletas paralelas (°)', min: -70, max: 70, step: 1, def: 0, g: 'Dissipador' },
  aletaCurva:{ label: 'Curvatura das aletas paralelas', min: -1, max: 1, step: 0.01, def: 0, g: 'Dissipador' },
  aletaInclR:{ label: 'Inclinação das aletas radiais (°)', min: -70, max: 70, step: 1, def: 0, g: 'Dissipador' },
  aletaCurvaR:{ label: 'Curvatura das aletas radiais', min: -1, max: 1, step: 0.01, def: 0, g: 'Dissipador' },
  aletaDir: { label: 'Direção das aletas (°)', min: 0, max: 180, step: 1, def: 0, g: 'Dissipador' },
  aletaQtd: { label: 'Quantidade (radiais)', min: 12, max: 240, step: 1, def: 90, g: 'Dissipador' },
  passo:    { label: 'Espaçamento', min: 0.12, max: 0.8, step: 0.01, def: 0.26, g: 'Dissipador' },
  pipes:    { type: 'hidden', def: () => [-3.15, -1.05, 1.05, 3.15].map((o) => ({ cor: '#cfd3d8', g: 0.38, achat: 0, perfil: 0, cantos: 0.25, off: o, dir: 0, forma: 0, dobra: 60, dobraPos: 0, dobraRaio: 3 })) },
  luzPas:   { label: 'Iluminação das pás', type: 'select', options: [['0', 'Luz real (de uma direção)'], ['1', 'Igual em todas as pás']], def: 0, g: 'Luz das ventoinhas' },
  luzDir:   { label: 'Direção da luz (°)', min: 0, max: 360, step: 1, def: 125, g: 'Luz das ventoinhas' },
  luzAlt:   { label: 'Altura da luz (°)', min: 10, max: 85, step: 1, def: 55, g: 'Luz das ventoinhas' },
  luzForca: { label: 'Força da luz', min: 0, max: 6, step: 0.1, def: 2.4, g: 'Luz das ventoinhas' },
  luzDist:  { label: 'Distância da luz', min: 0.3, max: 4, step: 0.02, def: 1.2, g: 'Luz das ventoinhas' },
  bgDir:    { label: 'Direção da luz (°)', min: 0, max: 360, step: 1, def: 125, g: 'Luz do fundo' },
  bgAlt:    { label: 'Altura da luz (°)', min: 10, max: 85, step: 1, def: 55, g: 'Luz do fundo' },
  bgForca:  { label: 'Força da luz', min: 0, max: 6, step: 0.1, def: 2.4, g: 'Luz do fundo' },
  bgDist:   { label: 'Distância da luz', min: 0.3, max: 4, step: 0.02, def: 1.2, g: 'Luz do fundo' },
  dureza:   { label: 'Dureza da sombra', min: 0, max: 1, step: 0.01, def: 0.5, g: 'Luz' },
  ambiente: { label: 'Reflexo do ambiente', min: 0, max: 2, step: 0.05, def: 0.25, g: 'Luz' },
};
export const defaults = () => Object.fromEntries(Object.entries(PARAMS).map(([k, d]) => [k, typeof d.def === 'function' ? d.def() : d.def]));

/** Cria o motor para uma instância do three.js. makeFan(medidas, comMoldura) monta uma ventoinha no raio R. */
export function createFanEngine(THREE) {
  let p = defaults();
  const R = 10; // raio da ventoinha
  const bgShadeU = { uBgShade: { value: 1 } }; // 1 = normal; 0 = preto (barra "Escurecer o dissipador")
  function lightGroup(mat, bg) {
    if (mat.userData.lg !== undefined) return; mat.userData.lg = bg ? 1 : 0;
    const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey;
    mat.onBeforeCompile = (sh, rr) => {
      if (prev) prev.call(mat, sh, rr);
      if (bg) { Object.assign(sh.uniforms, bgShadeU); sh.fragmentShader = 'uniform float uBgShade;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', 'gl_FragColor.rgb *= uBgShade;\n#include <dithering_fragment>'); }
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
        'getSpotLightInfo( spotLight, geometryPosition, directLight );',
        'getSpotLightInfo( spotLight, geometryPosition, directLight ); directLight.color *= ( UNROLLED_LOOP_INDEX == ' + (bg ? 1 : 0) + ' ? 1.0 : 0.0 );'));
    };
    mat.customProgramCacheKey = () => (key ? key.call(mat) : '') + '|lg' + (bg ? 1 : 0);
  }
  function occPatch(sh) {
    sh.vertexShader = 'attribute float occ;\nvarying float vOcc;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvOcc = occ;');
    sh.fragmentShader = 'varying float vOcc;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', 'gl_FragColor.rgb *= vOcc;\n#include <dithering_fragment>');
  }
  const bladeLightU = { uBladeLight: { value: new THREE.Vector3(0, 0, 1) }, uBladeOn: { value: 0 }, uBladeForce: { value: 2.4 } };
  function bladeLightPatch(sh) {
    Object.assign(sh.uniforms, bladeLightU);
    sh.vertexShader = 'uniform vec3 uBladeLight;\nvarying vec3 vBladeLight;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      { mat4 bm4 = modelViewMatrix;
        #ifdef USE_INSTANCING
          bm4 = modelViewMatrix * instanceMatrix;
        #endif
        vBladeLight = normalize((bm4 * vec4(uBladeLight, 0.0)).xyz); }`);
    sh.fragmentShader = 'uniform float uBladeOn;\nuniform float uBladeForce;\nvarying vec3 vBladeLight;\n' + sh.fragmentShader.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
      'getSpotLightInfo( spotLight, geometryPosition, directLight );',
      'getSpotLightInfo( spotLight, geometryPosition, directLight ); directLight.color *= ( UNROLLED_LOOP_INDEX == 0 ? 1.0 : 0.0 );\n' +
      'if ( UNROLLED_LOOP_INDEX == 0 && uBladeOn > 0.5 ) { directLight.direction = normalize( vBladeLight ); directLight.color = vec3( uBladeForce ); directLight.visible = true; }'));
  }
  const mat = {
    blade: () => { const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: p.aspereza, metalness: 0.0, clearcoat: p.verniz, clearcoatRoughness: 0.06 + p.aspereza * 0.4, side: THREE.DoubleSide });
      m.onBeforeCompile = (sh) => { occPatch(sh); bladeLightPatch(sh); }; m.userData.lg = 0; m.customProgramCacheKey = () => 'bladeLight'; return m; },
    edge: () => new THREE.MeshPhysicalMaterial({ color: p.corAresta, roughness: 0.35, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    hubRing: () => new THREE.MeshPhysicalMaterial({ color: p.corMiolo, roughness: [0.75, 0.4, 0.12][p.acabMiolo ?? 2], metalness: [0.2, 0.5, 0.85][p.acabMiolo ?? 2], clearcoat: [0, 0.4, 1][p.acabMiolo ?? 2], clearcoatRoughness: 0.1, side: THREE.DoubleSide }),
    hubCenter: () => new THREE.MeshStandardMaterial({ color: p.corCentro, roughness: [0.85, 0.5, 0.2][p.acabMiolo ?? 2], metalness: [0.1, 0.4, 0.7][p.acabMiolo ?? 2], side: THREE.DoubleSide }),
    rim: () => new THREE.MeshPhysicalMaterial({ color: p.corAro, roughness: [0.75, 0.35, 0.12][p.acabMiolo ?? 2], metalness: [0.2, 0.6, 0.85][p.acabMiolo ?? 2], clearcoat: [0, 0.4, 1][p.acabMiolo ?? 2] }),
    fin: () => new THREE.MeshStandardMaterial({ color: p.corAleta, roughness: 0.5, metalness: 0.6, envMapIntensity: p.brilhoDiss }),
    dark: () => new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.8, envMapIntensity: 0.15 }),
  };
  
  // pá como uma peça contínua: uma malha (u da raiz à ponta, v da borda de ataque à de fuga) com face de cima e de
  // baixo. O perfil é de asa: mais grosso no meio e arredondado nas bordas. A borda de ataque sobe (inclinação) e a
  // pá tem uma leve barriga. A aresta clara é a cor da própria pá perto da borda de ataque.
  // ponta das pás em % do raio: nunca passa da abertura do dissipador; com "Pás acompanham a abertura", segue a abertura
  function pontaEf() { const ab = p.abertura ?? 104; return p.pontaLink ? ab - 1.5 : Math.min(p.ponta, ab - 0.5); }
  function bladeGeometry(lo = false) {
    // encaixe: a raiz da pá entra por baixo do anel do miolo (de 0 até 60% do raio do miolo para dentro)
    // com o anel nas pontas ligado, a pá vai até o meio da espessura do anel, para ficar presa nele
    const d = Math.PI / 180, rh = ((p.raizPas ?? 0) > p.miolo ? R * p.raizPas / 100 : R * p.miolo / 100 * (0.97 - p.encaixe)), // com espaço, as pás começam exatamente no início escolhido
      rt = R * pontaEf() / 100 + (p.anel ? p.anelPEsp * 0.5 : 0);
    // inclinação: gira o corte da pá no próprio eixo (o meio da pá). 0 = deitada; 90 = em pé, como uma parede
    const NU = lo ? 36 : 128, NV = lo ? 10 : 26, th = Math.min(89.5, p.incl) * d, cT = Math.cos(th), sT = Math.sin(th);
    // curva contrária na raiz: perto do miolo, a pá dobra para o outro lado e se emenda suave com a curvatura normal
    const rcA = Math.max(0.02, p.raizCurvaAte ?? 0.3);
    // a curva contrária sai e chega sem quina (formato de S, com a mudança de direção espalhada pelo alcance)
    // transição bem suave (sem mudança brusca de direção nem de dobra): 1 na raiz e 0 no fim do alcance
    const ease = (t) => { t = Math.min(1, Math.max(0, t)); return 1 - t * t * t * (t * (6 * t - 15) + 10); };
    // ângulo de saída: a pá reta sai do miolo inclinada (uma linha reta que não passa pelo centro). A linha fica a uma
    // distância e do centro, com e = raio da raiz x seno do ângulo; o ângulo da pá em cada raio é asin(e / r)
    const sa = (p.saida ?? 0) * d, eOff = rh * Math.sin(sa);
    const sweep = (u) => { const rr = rh + (rt - rh) * u; return sa ? Math.asin(Math.max(-1, Math.min(1, eOff / rr))) - sa : 0; };
    const lead = (u) => p.curva * d * Math.pow(u, p.arco) + (p.raizCurva ?? 0) * d * ease(u / rcA) - sweep(u);
    const width = (u) => (p.raiz + (p.larg - p.raiz) * Math.pow(u, 0.9)) * d;
    // onde a ponta começa a arredondar; com o anel nas pontas, a ponta é sempre reta
    const u0 = 1 - Math.max(0.001, p.anel ? 0 : p.redonda) * 0.22;
    const cBlade = new THREE.Color(p.cor), cEdge = new THREE.Color(p.corAresta);
    const pos = [], col = [], idx = [], occs = [];
    const vert = (u, v, side) => {
      // formato da raiz: quadrada (larga e cortada reta no miolo), pontiaguda (afina até a raiz) ou arredondada
      const rf = p.raizForma ?? 0, ur = 0.16;
      const w = rf === 0 ? width(Math.max(u, ur)) : rf === 1 ? width(u) * Math.max(0.12, Math.min(1, u / ur)) : width(u) * (u < ur ? Math.sqrt(Math.max(0.03, 1 - ((ur - u) / ur) ** 2)) : 1);
      const r = rh + (rt - rh) * u;
      const wc = w;
      const k = u > u0 ? Math.sqrt(Math.max(0.02, 1 - ((u - u0) / (1 - u0)) ** 2)) : 1;
      const front = p.giro ? 1 : 0, up = (front === 0) === (p.fluxo === 0) ? 1 : -1;
      const t = p.esp * (0.18 + 0.82 * Math.pow(Math.sin(Math.PI * v), 0.5)) * (0.6 + 0.4 * (1 - u));
      // a largura vista de cima encolhe com a inclinação; a espessura gira junto com o corte
      const vv = 0.5 + (v - 0.5) * k * cT + (side * t / 2) * up * sT / Math.max(0.001, wc * r), a = lead(u) + w * 0.5 + wc * (vv - 0.5), arc = w * k * r;
      // altura da pá: o quanto a borda de cima sobe em relação à de baixo (1 = a inclinação escolhida)
      // nivelar: a altura deixa de crescer com a largura da pá e fica igual da raiz até a ponta (frente nivelada)
      const arcRef = width(0.5) * (rh + rt) / 2, arcH = k * (w * r + (p.nivel ?? 0) * (arcRef - w * r));
      // pás largas que passam por baixo da vizinha: a diferença de altura entre as duas precisa caber a grossura delas.
      // Onde a pá cobre mais que o espaço entre pás, a inclinação sobe só o necessário (a pá de trás passa por baixo)
      const gap = (Math.PI * 2) / Math.max(1, p.pas), Hbase = (p.alturaPas ?? 1) * arcH * sT;
      const Hmin = wc > gap * 0.98 ? 1.25 * p.esp * wc / gap : 0, Heff = Math.max(Hbase, Hmin);
      const lift = (up * (0.5 - v) * Heff + Math.sin(Math.PI * v) * arcH * 0.07 * cT);
      pos.push(Math.cos(a) * r, Math.sin(a) * r, lift + side * (t / 2) * cT);
      const ve = p.arestaLado ? 1 - v : v; // a aresta clara fica na borda de ataque (v = 0) ou na de fuga (v = 1)
      const e = p.aresta > 0 ? Math.min(1, Math.max(0, (ve - p.aresta * 0.45) / (p.aresta * 0.35 + 1e-3))) : 1;
      const c = cEdge.clone().lerp(cBlade, e);
      // a parte mais baixa da pá é a borda que desce com a inclinação (v = 1 quando up = 1, v = 0 quando up = -1)
      const low = up > 0 ? v : 1 - v, sm = Math.min(1, Math.max(0, (low - 0.3) / 0.7));
      const occ = 1 - (p.sombraInt ?? 0.45) * (0.75 * sm * sm * (3 - 2 * sm) + 0.35 * (1 - u) * (1 - u));
      // sombra entre pás: a pá de cima projeta sombra na parte visível da pá de baixo, logo ao lado da beirada dela. O
      // escuro é mais forte encostado na beirada e clareia até a distância da suavidade (em fração do espaço entre pás)
      let ov = 1;
      if (p.sombraPas) {
        const gapA = (Math.PI * 2) / Math.max(1, p.pas), reach = Math.max(0.02, p.sombraPasSuave ?? 0.3) * gapA;
        const dist = gapA - (up > 0 ? v : 1 - v) * wc; // distância até a beirada da pá de cima (negativa = embaixo dela)
        if (dist < reach) ov = 1 - p.sombraPas * Math.min(1, 1 - Math.max(0, dist) / reach);
      }
      occs.push(Math.max(0.04, occ * ov));
      col.push(c.r, c.g, c.b);
    };
    for (const side of [1, -1]) for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) vert(i / NU, j / NV, side);
    const id = (side, i, j) => (side > 0 ? 0 : (NU + 1) * (NV + 1)) + i * (NV + 1) + j;
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = id(1, i, j), b = id(1, i + 1, j), c = id(1, i + 1, j + 1), e = id(1, i, j + 1);
      idx.push(a, b, c, a, c, e);
      const a2 = id(-1, i, j), b2 = id(-1, i + 1, j), c2 = id(-1, i + 1, j + 1), e2 = id(-1, i, j + 1);
      idx.push(a2, c2, b2, a2, e2, c2);
    }
    // paredes: borda de ataque (j=0), de fuga (j=NV), ponta (i=NU) e raiz (i=0)
    for (let i = 0; i < NU; i++) { idx.push(id(1, i, 0), id(-1, i, 0), id(-1, i + 1, 0), id(1, i, 0), id(-1, i + 1, 0), id(1, i + 1, 0)); idx.push(id(1, i, NV), id(1, i + 1, NV), id(-1, i + 1, NV), id(1, i, NV), id(-1, i + 1, NV), id(-1, i, NV)); }
    for (let j = 0; j < NV; j++) { idx.push(id(1, NU, j), id(-1, NU, j), id(-1, NU, j + 1), id(1, NU, j), id(-1, NU, j + 1), id(1, NU, j + 1)); idx.push(id(1, 0, j), id(1, 0, j + 1), id(-1, 0, j + 1), id(1, 0, j), id(-1, 0, j + 1), id(-1, 0, j)); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('occ', new THREE.Float32BufferAttribute(occs, 1));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  // cano chapado: o corte é um retângulo de largura 2g e altura 2g, com cantos de raio (cantos * g). O corte segue o
  // caminho com a largura sempre no plano das aletas e a altura para cima, então a face de cima fica reta.
  function flatPipe(run, g, cantos) {
    const rc = Math.max(0.001, Math.min(1, cantos)) * g, sec = [], N = 10;
    const corner = (cx, cy, a0) => { for (let i = 0; i <= N; i++) { const a = a0 + (i / N) * Math.PI / 2; sec.push([cx + Math.cos(a) * rc, cy + Math.sin(a) * rc]); } };
    corner(g - rc, g - rc, 0); corner(-g + rc, g - rc, Math.PI / 2); corner(-g + rc, -g + rc, Math.PI); corner(g - rc, -g + rc, Math.PI * 1.5);
    const pos = [], idx = [], M = sec.length;
    for (let i = 0; i < run.length; i++) {
      const a = run[Math.max(0, i - 1)], b = run[Math.min(run.length - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      const nx = -ty, ny = tx; // para o lado, no plano
      for (const [sx, sz] of sec) pos.push(run[i].x + nx * sx, run[i].y + ny * sx, sz);
    }
    for (let i = 0; i < run.length - 1; i++) for (let j = 0; j < M; j++) {
      const a = i * M + j, b = i * M + (j + 1) % M, c2 = (i + 1) * M + j, d = (i + 1) * M + (j + 1) % M;
      idx.push(a, b, c2, b, d, c2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  const SAMPLES = 24;
  // uma ventoinha no raio R (10 unidades): dissipador, pás com borrão e miolo; com ou sem a moldura em volta
  function makeFan(withShroud) {
    const fan = new THREE.Group();
    const ap = R * p.abertura / 100;
    if (withShroud) {
      const plate = new THREE.Shape(); plate.moveTo(-14, -12); plate.lineTo(14, -12); plate.lineTo(14, 12); plate.lineTo(-14, 12); plate.closePath();
      const hole = new THREE.Path(); hole.absarc(0, 0, R * 1.06, 0, Math.PI * 2, true); plate.holes.push(hole);
      const shroud = new THREE.Mesh(new THREE.ExtrudeGeometry(plate, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 4, curveSegments: 96 }), mat.rim());
      shroud.material.color.set('#a9adb2'); shroud.position.z = 0.7; shroud.receiveShadow = true; fan.add(shroud);
    }
    // dissipador: base escura e aletas de metal recortadas no círculo da abertura
    const rr = withShroud ? R * 1.06 : ap;
    const hs = new THREE.Group(); fan.add(hs);
    const back = new THREE.Mesh(new THREE.CircleGeometry(rr + 0.05, 96), new THREE.MeshStandardMaterial({ color: p.corBase ?? '#0b0c0e', roughness: 0.8, envMapIntensity: 0.15 })); back.position.z = -3.2; back.receiveShadow = true; back.userData.part = 'dissipador'; hs.add(back);
    const finMat = mat.fin();
    const finG = new THREE.Group(); hs.add(finG);
    // aletas: largura (espessura), inclinação no próprio eixo e curvatura (paralelas viram arcos; radiais, espiral)
    // cada tipo de aleta tem a própria curvatura e inclinação (trocar de tipo não leva a curva de um para o outro)
    const radial = (p.aletaTipo ?? 0) === 1, fe = p.aletaEsp ?? 0.035;
    const ftilt = ((radial ? p.aletaInclR : p.aletaIncl) ?? 0) * Math.PI / 180, fc = (radial ? p.aletaCurvaR : p.aletaCurva) ?? 0;
    if ((p.aletaTipo ?? 0) === 1) {
      // radiais: lâminas que saem do centro para a borda; com curvatura, cada uma se curva como uma espiral
      const n = Math.round(p.aletaQtd ?? 90), r0 = rr * 0.12, len = rr - r0;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const geo = new THREE.BoxGeometry(len, fe, 2.2, 32, 1, 1); geo.rotateX(ftilt); const ps = geo.attributes.position; // inclina o corte primeiro
        for (let j = 0; j < ps.count; j++) { const t = (ps.getX(j) + len / 2) / len; ps.setY(j, ps.getY(j) + fc * len * 0.35 * t * t); }
        geo.computeVertexNormals();
        const fin = new THREE.Mesh(geo, finMat);
        fin.position.set(Math.cos(a) * (r0 + len / 2), Math.sin(a) * (r0 + len / 2), -2.0); fin.rotation.z = a;
        fin.castShadow = true; fin.receiveShadow = true; fin.userData.part = 'dissipador'; finG.add(fin);
      }
    } else {
      finG.rotation.z = (p.aletaDir ?? 0) * Math.PI / 180;
      for (let x = -rr; x <= rr; x += p.passo) {
        const h = 2 * Math.sqrt(Math.max(0, rr * rr - x * x)); if (h < 0.3) continue;
        const geo = new THREE.BoxGeometry(fe, h, 2.2, 1, 32, 1); geo.rotateY(ftilt); const ps = geo.attributes.position; // inclina o corte primeiro
        // arco: o meio da aleta sai para o lado; a flecha acompanha o raio, então todas as aletas ficam paralelas
        for (let j = 0; j < ps.count; j++) { const y = ps.getY(j) / rr; ps.setX(j, ps.getX(j) + fc * rr * 0.3 * (1 - y * y)); }
        geo.computeVertexNormals();
        const fin = new THREE.Mesh(geo, finMat);
        fin.position.set(x, 0, -2.0); fin.castShadow = true; fin.receiveShadow = true; fin.userData.part = 'dissipador'; finG.add(fin);
      }
    }
  
    // as aletas viram uma peça só (uma por ventoinha): desenhar dezenas de peças separadas, três vezes por quadro (duas
    // sombras e a imagem), deixava tudo lento. A aparência não muda.
    {
      finG.updateMatrixWorld(true);
      const parts = []; const inv = new THREE.Matrix4().copy(finG.matrixWorld).invert();
      for (const c of finG.children) { const g2 = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone(); g2.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld)); for (const k of Object.keys(g2.attributes)) if (!['position', 'normal'].includes(k)) g2.deleteAttribute(k); parts.push(g2); c.geometry.dispose(); }
      if (parts.length) {
        let n = 0; for (const g2 of parts) n += g2.attributes.position.count;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
        for (const g2 of parts) { pos.set(g2.attributes.position.array, o * 3); nor.set(g2.attributes.normal.array, o * 3); o += g2.attributes.position.count; g2.dispose(); }
        const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        finG.clear(); const one = new THREE.Mesh(mg, finMat); one.castShadow = true; one.receiveShadow = true; one.userData.part = 'dissipador'; finG.add(one);
      }
    }
    // canos de calor: cada cano tem cor, grossura, achatamento, posição, direção e formato próprios. O caminho anda em
    // linha reta e, nas curvas, gira o rumo pelo ângulo escolhido num arco do raio escolhido. Só os trechos dentro da
    // abertura aparecem.
    (p.pipes || []).forEach((c, pi) => {
      const pm = new THREE.MeshPhysicalMaterial({ color: c.cor, metalness: 1, roughness: 0.3, clearcoat: 0.2, envMapIntensity: p.brilhoDiss * 1.6 });
      const g = c.g, holder = new THREE.Group(); holder.rotation.z = c.dir * Math.PI / 180; hs.add(holder);
      const bends = c.forma === 0 ? [] : c.forma === 1 ? [[c.dobraPos, c.dobra]] : [[c.dobraPos - c.dobraRaio * 1.6, c.dobra], [c.dobraPos + c.dobraRaio * 1.6, -c.dobra]];
      // o cano anda deslocado (off) para o lado do caminho; nas curvas, o raio do arco acompanha o deslocamento
      const pts = []; let x = -rr * 1.6, y = c.off, h = 0, bi = 0, turned = 0; const ds = 0.08;
      while (pts.length < 4000 && Math.hypot(x, y) < rr * 2.4) {
        pts.push([x, y]);
        if (bi < bends.length && x >= bends[bi][0]) {
          const want = bends[bi][1] * Math.PI / 180, dh = Math.sign(want) * ds / c.dobraRaio;
          if (Math.abs(turned + dh) <= Math.abs(want)) { h += dh; turned += dh; } else { h += want - turned; bi++; turned = 0; }
        }
        x += Math.cos(h) * ds; y += Math.sin(h) * ds;
      }
      const runs = []; let cur = [];
      for (const [px, py] of pts) {
        if (Math.hypot(px, py) <= rr * 1.05) cur.push(new THREE.Vector3(px, py, 0));
        else if (cur.length) { runs.push(cur); cur = []; }
      }
      if (cur.length) runs.push(cur);
      for (const run of runs) {
        if (run.length < 3) continue;
        const tube = new THREE.Mesh(c.perfil ? flatPipe(run, g, c.cantos) : new THREE.TubeGeometry(new THREE.CatmullRomCurve3(run), Math.max(8, run.length), g, 24, false), pm);
        tube.scale.z = 1 - c.achat; tube.position.z = -0.9 - g * 0.4;
        tube.castShadow = true; tube.receiveShadow = true; tube.userData.part = 'cano'; tube.userData.pipe = pi; holder.add(tube);
      }
    });
    const rotor = new THREE.Group(); fan.add(rotor);
    const bladeGeo = bladeGeometry();
    // topo do dissipador: o topo das aletas (-0.9) ou dos canos; desce até ficar 0.25 abaixo da parte mais baixa das pás
    bladeGeo.computeBoundingBox();
    const hsTop = Math.max(-0.9, ...(p.pipes || []).map((c) => -0.9 + 0.6 * c.g));
    // o dissipador desce até ficar abaixo da parte mais baixa das pás e do anel das pontas (com folga)
    const lowest = Math.min(bladeGeo.boundingBox.min.z + (p.altPas ?? 0), p.anel ? bladeGeo.boundingBox.min.z + (p.altPas ?? 0) + (p.anelPPos ?? 0) : Infinity);
    hs.position.z = Math.min(0, lowest - 0.25 - hsTop);
    const _unused = 0, bm = mat.blade(), one = new THREE.Group();
    for (let b = 0; b < p.pas; b++) {
      const g = new THREE.Group(); g.rotation.z = (b / p.pas) * Math.PI * 2;
      const m = new THREE.Mesh(bladeGeo, bm); m.userData.part = 'pas'; m.position.z = p.altPas ?? 0; m.castShadow = true; m.receiveShadow = !p.luzPas; g.add(m); one.add(g);
    }
    if (p.anel) {
      // faixa presa nas pontas das pás: começa na ponta e vai para fora pela espessura; a altura é a largura da faixa
      // a faixa parte da base: a borda de baixo fica na parte mais baixa das pás (mais a profundidade) e a altura cresce para cima
      const ri = R * pontaEf() / 100 - 0.02, ro = ri + p.anelPEsp, zb = bladeGeo.boundingBox.min.z + (p.altPas ?? 0) + p.anelPPos, zt = zb + p.anelPAlt, ch = Math.min(0.05, p.anelPEsp / 3);
      const prof = [[ri, zb], [ro - ch, zb], [ro, zb + ch], [ro, zt - ch], [ro - ch, zt], [ri, zt], [ri, zb]].map(([x, y]) => new THREE.Vector2(x, y));
      const tg = new THREE.LatheGeometry(prof, 160);
      tg.setAttribute('occ', new THREE.Float32BufferAttribute(new Array(tg.attributes.position.count).fill(1), 1));
      tg.setAttribute('color', new THREE.Float32BufferAttribute(new Array(tg.attributes.position.count).fill(0).flatMap(() => { const c = new THREE.Color(p.cor); return [c.r, c.g, c.b]; }), 3));
      // material próprio: o das pás fica invisível durante o giro (só faz sombra)
      const ringMat = mat.blade(); const ring = new THREE.Mesh(tg, ringMat); ring.userData.part = 'anelPontas'; ring.rotation.x = Math.PI / 2; ring.castShadow = true; ring.receiveShadow = true; fan.add(ring);
    }
    // miolo: anel prateado (largura ajustável, zero tira o anel) e o centro. O miolo é redondo, então fica fora das cópias
    // do borrão: cópias iguais umas sobre as outras brigavam na tela e desenhavam linhas no centro liso.
    const hubG = new THREE.Group(); fan.add(hubG); // redondo: fica parado (girando, o brilho pulava a cada quadro)
    // corpo do miolo: a parede vai da base (raio do miolo) até o topo (menor quando o miolo é cônico). O anel prateado é
    // a borda de cima, com a largura escolhida (0 tira o anel), e o centro fica dentro dele. A parede existe mesmo sem o anel.
    const rh = R * p.miolo / 100, hz = (p.anelAlt ?? 0.46) - 0.16 + p.relevo * 0.5;
    const top = rh * (1 - (p.mioloCone ?? 0)), inner = top * (1 - p.anelLarg);
    const hubBottom = Math.min(-1.2, bladeGeo.boundingBox.min.z + (p.altPas ?? 0) + Math.min(0, p.platAlt ?? -0.2) - 0.05);
    {
      // parede (lateral, reta ou cônica) com cor própria, do topo até a base
      const wallProf = [[top * 0.995, hz], [top, hz - 0.02], [rh, hubBottom]].map(([x, y]) => new THREE.Vector2(x, y));
      const wm = mat.hubCenter(); wm.color.set(p.corParede ?? '#2a2c30');
      const wall = new THREE.Mesh(new THREE.LatheGeometry(wallProf, 128), wm);
      wall.rotation.x = Math.PI / 2; wall.castShadow = true; wall.userData.part = 'miolo'; hubG.add(wall);
      // anel prateado na borda de cima (largura 0 tira o anel)
      if (p.anelLarg > 0.005) {
        const ringProf = [[inner, 0.2], [inner, hz + 0.08], [inner + (top - inner) * 0.2, hz + 0.16], [top * 0.97, hz + 0.16], [top, hz + 0.08], [top, hz - 0.02]].map(([x, y]) => new THREE.Vector2(x, y));
        const hubRing = new THREE.Mesh(new THREE.LatheGeometry(ringProf, 128), mat.hubRing()); hubRing.rotation.x = Math.PI / 2; hubRing.castShadow = true; hubRing.userData.part = 'miolo'; hubG.add(hubRing);
      }
    }
    // degrau: faixa plana entre o miolo e o início das pás (placas com miolo grande e pás pequenas, como a 5700 XT)
    const rb = R * (p.raizPas ?? 0) / 100;
    if (rb > rh + 0.05 && !(p.degrauTipo ?? 0)) {
      const plat = new THREE.Mesh(new THREE.RingGeometry(rh * 0.99, rb, 128, 1), new THREE.MeshStandardMaterial({ color: p.corPlat ?? '#1c1d20', roughness: 0.6, metalness: 0.3 }));
      // o degrau é a base: fica no nível do pé das pás (0) ou mais fundo (valores negativos), nunca acima
      plat.position.z = bladeGeo.boundingBox.min.z + (p.altPas ?? 0) + Math.min(0, p.platAlt ?? -0.2); plat.receiveShadow = true; plat.userData.part = 'miolo'; hubG.add(plat);
    }
    // centro: disco com o desenho numa textura (liso, círculos em linha ou círculos preenchidos) e relevo opcional
    const dome = p.relevo * 0.45;
    const capMat = mat.hubCenter();
    // círculos do centro, cada um com medidas próprias (p.circs): raio e largura em fração do centro, preenchido ou
    // vazado, plano (desenhado) ou em relevo (peça 3D), e cor
    const circs = Array.isArray(p.circs) ? p.circs : [];
    {
      const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
      g.fillStyle = p.corCentro; g.fillRect(0, 0, 1024, 1024);
      for (const ci of circs) {
        if (ci.relevo) continue;
        const ro = 500 * ci.raio, ri = ci.cheio ? 0 : Math.max(0, ro - 500 * ci.largura);
        g.fillStyle = ci.cor; g.beginPath(); g.arc(512, 512, ro, 0, Math.PI * 2); if (ri > 0) g.arc(512, 512, ri, 0, Math.PI * 2, true); g.fill('evenodd');
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; capMat.map = t; capMat.color.set('#ffffff');
    }
    const capGeo = new THREE.RingGeometry(0.0001, inner, 128, 32);
    { const cp = capGeo.attributes.position; for (let i = 0; i < cp.count; i++) { const q = Math.hypot(cp.getX(i), cp.getY(i)) / inner; cp.setZ(i, dome * (1 - q * q)); } capGeo.computeVertexNormals(); }
    const cap = new THREE.Mesh(capGeo, capMat); cap.position.z = hz; cap.userData.part = 'miolo'; cap.userData.inner = inner; cap.userData.isCap = true; hubG.add(cap);
    // círculos em relevo: peças que saem do centro, com a altura escolhida
    circs.forEach((ci, ciIdx) => {
      if (!ci.relevo) return;
      const ro = inner * ci.raio, ri = ci.cheio ? 0.0001 : Math.max(0.0001, ro - inner * ci.largura), h = ci.altura ?? 0.08;
      const prof = [[ri, 0], [ri, h], [ro, h], [ro, 0]].map(([x, y]) => new THREE.Vector2(x, y));
      const m = new THREE.Mesh(new THREE.LatheGeometry(prof, 128), new THREE.MeshStandardMaterial({ color: ci.cor, roughness: 0.45, metalness: 0.4, side: THREE.DoubleSide }));
      m.rotation.x = Math.PI / 2; const q = (ri + ro) / 2 / inner; m.position.z = hz + dome * (1 - q * q); m.castShadow = true; m.userData.part = 'circulo'; m.userData.circ = ciIdx; hubG.add(m);
    });
    // borrão de movimento: as pás parados (sólidas) e, girando, BLUR cópias de todas as pás num único desenho da placa de
    // vídeo. Cada cópia k gira um pouco mais (até o espaço entre duas pás) e pesa 1/(k+1); como a placa desenha as cópias
    // em ordem, o resultado é a média de todas, sem degraus. O giro de cada cópia é feito no próprio desenho (uSpread).
    rotor.add(one);
    // cópias: até 320 (menos quando há muitas pás); a quantidade usada é calculada a cada quadro
    const n = Math.round(p.pas), BLUR = Math.max(16, Math.min(320, Math.floor(60000 / Math.max(1, n))));
    const blurMat = bm.clone();
    blurMat.transparent = true; blurMat.depthWrite = false; blurMat.side = THREE.FrontSide; // só a face virada para a câmera (as duas faces somadas deixavam o borrão mais claro)
    blurMat.blending = THREE.CustomBlending; blurMat.blendEquation = THREE.AddEquation;
    blurMat.blendSrc = THREE.SrcAlphaFactor; blurMat.blendDst = THREE.OneFactor; blurMat.blendSrcAlpha = THREE.OneFactor; blurMat.blendDstAlpha = THREE.OneFactor;
    blurMat.userData.u = { uSpread: { value: 0 }, uSamples: { value: BLUR } };
    blurMat.onBeforeCompile = (sh) => {
      occPatch(sh); bladeLightPatch(sh);
      Object.assign(sh.uniforms, blurMat.userData.u);
      sh.vertexShader = 'attribute float iK;\nuniform float uSpread;\nuniform float uSamples;\nvarying float vA;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n{ float ba = -uSpread * iK / uSamples; float bc = cos(ba), bs = sin(ba); objectNormal.xy = vec2(bc * objectNormal.x - bs * objectNormal.y, bs * objectNormal.x + bc * objectNormal.y); }')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float ba = -uSpread * iK / uSamples; float bc = cos(ba), bs = sin(ba); transformed.xy = vec2(bc * transformed.x - bs * transformed.y, bs * transformed.x + bc * transformed.y); vA = 1.0 / uSamples; }');
      sh.fragmentShader = 'varying float vA;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', 'gl_FragColor.a *= vA;\n#include <dithering_fragment>');
    };
    blurMat.customProgramCacheKey = () => 'blur';
    const bg2 = bladeGeometry(true); // as cópias do borrão usam uma pá mais simples (ficam borradas, e isso deixa tudo bem mais leve)
    const iK = new Float32Array(n * BLUR);
    const blur = new THREE.InstancedMesh(bg2, blurMat, n * BLUR);
    const mtx = new THREE.Matrix4();
    for (let k = 0; k < BLUR; k++) for (let b = 0; b < n; b++) {
      const i = k * n + b; iK[i] = k;
      mtx.makeRotationZ((b / n) * Math.PI * 2); mtx.setPosition(0, 0, p.altPas ?? 0); blur.setMatrixAt(i, mtx);
    }
    bg2.setAttribute('iK', new THREE.InstancedBufferAttribute(iK, 1));
    blur.frustumCulled = false; blur.visible = false; blur.receiveShadow = !p.luzPas; blur.renderOrder = 30; blur.userData.copy = true; blur.layers.set(1); rotor.add(blur); // recebe as mesmas sombras das pás paradas
    hubG.traverse((o) => o.layers.enable(2)); fan.children.forEach((o) => { if (o.userData.part === 'anelPontas') o.layers.enable(2); });
    const solidMats = []; one.traverse((o) => { if (o.isMesh && !solidMats.includes(o.material)) solidMats.push(o.material); });
    const copies = { one, blur, solidMats, u: blurMat.userData.u, n, max: BLUR, tip: R * pontaEf() / 100 };
    hs.traverse((o) => { if (o.isMesh) lightGroup(o.material, true); });
    rotor.traverse((o) => { if (o.isMesh) lightGroup(o.material, false); });
    fan.traverse((o) => { if (o.isMesh && o.material.userData.lg === undefined) lightGroup(o.material, false); });
    return { fan, copies };
  }
  return {
    R, bladeLightU, bgShadeU, lightGroup,
    /** monta uma ventoinha com estas medidas (as que faltarem usam o padrão) */
    makeFan(medidas, withShroud = false) { const prev = p; p = { ...defaults(), ...medidas }; try { return makeFan(withShroud); } finally { p = prev; } },
    /** ponta das pás (em % do raio) para estas medidas */
    ponta(medidas) { const prev = p; p = { ...defaults(), ...medidas }; try { return pontaEf(); } finally { p = prev; } },
  };
}
