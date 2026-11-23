// Modelos 3D do Monitor de hardware, feitos com geometria própria (sem marcas nem logotipos):
// placa de vídeo, processador, memória RAM, placa-mãe, SSD, energia (fonte ou bateria),
// PC montado em gabinete de vidro, MacBook e notebook Windows. Cada modelo se anima com os dados ao vivo.
import { THREE, Model, Live, mat, rbox, box, cyl, extrude, slab, canvasTex, pcbTexture, labelTexture, fan, ledStrip, ledRing, tempColor } from './core';

const accentHex = (l: Live) => '#' + l.accent.getHexString();

// ======================= PLACA DE VÍDEO =======================
export function gpuModel(opts: { fans?: number } = {}): Model {
  const g = new THREE.Group();
  const L = 0.34, H = 0.135, T = 0.068;
  const nFans = opts.fans ?? 3;
  // corpo, placa de circuito e backplate
  const body = rbox(L * 0.97, H * 0.88, T * 0.7, 0.008, mat.dark(0x121418, 0.5)); body.position.z = -0.004; g.add(body);
  const pcb = box(L * 0.95, H * 0.84, 0.003, mat.pcb(0x0c1a14)); pcb.position.set(0, -0.004, -T / 2 + 0.002); g.add(pcb);
  const back = slab(L * 0.96, H * 0.86, 0.004, 0.006, mat.metal(0x2a2d33, 0.38)); back.position.z = -T / 2 - 0.002; g.add(back);
  // aletas do dissipador (visíveis em cima e na ponta aberta)
  const finMat = mat.metal(0x8d939b, 0.3);
  for (let i = 0; i < 70; i++) { const f = box(0.0012, H * 0.12, T * 0.55, finMat); f.position.set(-L * 0.46 + i * (L * 0.92 / 70), H * 0.43, -0.006); g.add(f); }
  for (let i = 0; i < 14; i++) { const f = box(0.0012, H * 0.7, T * 0.55, finMat); f.position.set(L * 0.44 + i * 0.0024, 0, -0.006); g.add(f); }
  // moldura chanfrada (frente)
  const c = 0.018, w2 = L / 2, h2 = H / 2;
  const outer = new THREE.Shape([[-w2 + c, -h2], [w2 - c, -h2], [w2, -h2 + c], [w2, h2 - c], [w2 - c, h2], [-w2 + c, h2], [-w2, h2 - c], [-w2, -h2 + c]].map(([x, y]) => new THREE.Vector2(x, y)));
  const hole = new THREE.Path(); const iw = w2 - 0.012, ih = h2 - 0.012, ic = 0.012;
  [[-iw + ic, -ih], [iw - ic, -ih], [iw, -ih + ic], [iw, ih - ic], [iw - ic, ih], [-iw + ic, ih], [-iw, ih - ic], [-iw, -ih + ic]].forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
  outer.holes.push(hole);
  const frameGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
  const frame = new THREE.Mesh(frameGeo, mat.dark(0x2b2e34, 0.35)); frame.position.z = T / 2 - 0.012; frame.castShadow = true; g.add(frame);
  // placa prateada escovada atrás das ventoinhas
  const plate = slab(L * 0.93, H * 0.82, 0.003, 0.01, new THREE.MeshStandardMaterial({ color: 0xb7bcc3, metalness: 1, roughness: 0.28 })); plate.position.z = T / 2 - 0.006; g.add(plate);
  const darkInset = slab(L * 0.3, H * 0.8, 0.002, 0.01, mat.dark(0x15171b)); darkInset.position.set(L * 0.3, 0, T / 2 - 0.004); g.add(darkInset);
  // ventoinhas
  const fans: ReturnType<typeof fan>[] = [];
  const r = H * 0.39, step = (L * 0.86) / nFans;
  for (let i = 0; i < nFans; i++) {
    const f = fan(r, { blades: 11 }); f.group.position.set(-L * 0.43 + step * (i + 0.5), -0.003, T / 2 - 0.002); g.add(f.group); fans.push(f);
    const shroud = new THREE.Mesh(new THREE.TorusGeometry(r * 1.03, r * 0.05, 10, 64), mat.metal(0x5d636b, 0.3)); shroud.position.copy(f.group.position); g.add(shroud);
  }
  // aro prateado com marcas na última ventoinha
  const last = fans[fans.length - 1].group.position;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.1, r * 0.06, 12, 80), mat.metal(0xd7dbe0, 0.18)); ring.position.copy(last); ring.position.z += 0.003; g.add(ring);
  for (let i = 0; i < 36; i++) { const tk = box(0.0015, 0.005, 0.002, mat.dark(0x30333a)); const a = (i / 36) * Math.PI * 2; tk.position.set(last.x + Math.cos(a) * r * 1.1, last.y + Math.sin(a) * r * 1.1, last.z + 0.009); tk.rotation.z = a; g.add(tk); }
  // faixa de LED no topo (difusor + segmentos)
  const strip = ledStrip(L * 0.82, 60, 0.004, 0.006); strip.group.position.set(-0.01, H / 2 + 0.002, T / 2 - 0.02); g.add(strip.group);
  const topBar = ledStrip(L * 0.82, 40, 0.002, 0.012); topBar.group.rotation.x = -Math.PI / 2; topBar.group.position.set(-0.01, H / 2 + 0.004, 0); g.add(topBar.group);
  // suporte (bracket), conector PCIe e alimentação
  const bracket = box(0.002, H * 1.08, T * 0.62, mat.metal(0xa8adb4, 0.3)); bracket.position.set(-L / 2 - 0.004, 0, -0.008); g.add(bracket);
  for (let i = 0; i < 5; i++) { const v = box(0.003, 0.004, T * 0.45, mat.dark(0x0a0b0d)); v.position.set(-L / 2 - 0.004, -H * 0.35 + i * 0.02, -0.008); g.add(v); }
  const fingers = box(0.09, 0.008, 0.002, mat.gold()); fingers.position.set(-L * 0.25, -H / 2 - 0.004, -T / 2 + 0.002); g.add(fingers);
  const power = box(0.022, 0.008, 0.012, mat.plastic(0x0c0d10)); power.position.set(L * 0.16, H / 2 + 0.004, -T * 0.2); g.add(power);
  return {
    group: g, focus: { distance: 0.62, target: [0, 0.07, 0], height: 0.2 },
    update(live, t, dt) {
      const u = live.gpu ?? 0.2;
      const speed = live.fanRpm ? (live.fanRpm / 60) * Math.PI * 2 * 0.35 : 3 + u * 26;
      fans.forEach((f) => f.spin(speed, dt));
      strip.update(t, live.accent, 'wave', 0.7 + u * 0.6); topBar.update(t, live.accent, 'wave', 0.6 + u * 0.5);
    },
  };
}

// ======================= PROCESSADOR =======================
export function cpuModel(opts: { name?: string; sub?: string; cores?: number } = {}): Model {
  const g = new THREE.Group();
  const W = 0.45, D = 0.375;
  // substrato (placa verde-azulada) com borda dourada
  const sub = slab(W, D, 0.012, 0.006, new THREE.MeshStandardMaterial({ color: 0x0f5a57, metalness: 0.25, roughness: 0.5 })); sub.rotation.x = -Math.PI / 2; sub.position.y = 0.006; g.add(sub);
  const edge = slab(W + 0.002, D + 0.002, 0.002, 0.007, mat.gold()); edge.rotation.x = -Math.PI / 2; edge.position.y = 0.0005; g.add(edge);
  // componentes SMD nas bordas
  const smd = mat.metal(0x6c7178, 0.4), smdDark = mat.dark(0x2b2620);
  const place = (x: number, z: number, w: number, d: number, m: THREE.Material) => { const b = box(w, 0.006, d, m); b.position.set(x, 0.015, z); g.add(b); };
  for (let i = 0; i < 6; i++) { place(-W * 0.43, -D * 0.25 + i * 0.022, 0.012, 0.008, smd); place(W * 0.43, D * 0.05 + i * 0.022, 0.012, 0.008, smd); }
  for (let i = 0; i < 4; i++) { place(-W * 0.18 + i * 0.03, D * 0.44, 0.008, 0.012, smdDark); place(W * 0.12 + i * 0.022, -D * 0.44, 0.008, 0.012, smdDark); }
  const tri = new THREE.Mesh(new THREE.CircleGeometry(0.012, 3), mat.gold()); tri.rotation.x = -Math.PI / 2; tri.position.set(-W * 0.44, 0.0125, D * 0.42); g.add(tri);
  // tampa metálica (IHS) em dois níveis, com recortes laterais
  const metal = new THREE.MeshStandardMaterial({ color: 0xc4c8cd, metalness: 1, roughness: 0.34 });
  const s1 = new THREE.Shape(); const a = W * 0.4, b = D * 0.42, n = 0.03;
  s1.moveTo(-a, -b); s1.lineTo(a, -b); s1.lineTo(a, -b * 0.35); s1.lineTo(a + n * 0.4, -b * 0.25); s1.lineTo(a + n * 0.4, b * 0.25); s1.lineTo(a, b * 0.35); s1.lineTo(a, b); s1.lineTo(-a, b); s1.lineTo(-a, b * 0.35); s1.lineTo(-a - n * 0.4, b * 0.25); s1.lineTo(-a - n * 0.4, -b * 0.25); s1.lineTo(-a, -b * 0.35); s1.lineTo(-a, -b);
  const lower = new THREE.Mesh(new THREE.ExtrudeGeometry(s1, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 3 }), metal);
  lower.rotation.x = -Math.PI / 2; lower.position.y = 0.012; lower.castShadow = true; g.add(lower);
  const tex = labelTexture([{ text: (opts.name || 'PROCESSADOR').toUpperCase().slice(0, 22), size: 62 }, { text: opts.sub || '', size: 54 }, { text: opts.cores ? `${opts.cores} NÚCLEOS` : '', size: 48, alpha: 0.6 }], 1024, 900);
  const topMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, metalness: 0.95, roughness: 0.36 });
  const upper = slab(W * 0.66, D * 0.7, 0.012, 0.03, metal);
  upper.rotation.x = -Math.PI / 2; upper.position.y = 0.032; g.add(upper);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.62, D * 0.66), topMat); face.rotation.x = -Math.PI / 2; face.position.y = 0.0385 + 0.004; g.add(face);
  // contorno luminoso (carga e temperatura)
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0x3ddc97), emissiveIntensity: 1.2 });
  const glow = new THREE.Mesh(new THREE.TorusGeometry(1, 0.004, 6, 4, Math.PI * 2), glowMat); glow.rotation.set(-Math.PI / 2, 0, Math.PI / 4); glow.scale.set(W * 0.6, D * 0.6, 1); glow.position.y = 0.013; g.add(glow);
  return {
    group: g, focus: { distance: 0.95, target: [0, 0.02, 0], height: 0.55 },
    update(live, t) {
      const ld = live.load ?? 0.2; const tc = live.temps?.cpu;
      glowMat.emissive.copy(tc !== undefined ? tempColor(tc) : live.accent); glowMat.emissiveIntensity = 0.8 + ld * 3 + Math.sin(t * 3) * 0.2;
    },
  };
}

// ======================= MEMÓRIA RAM =======================
function ramStick(white = true) {
  const g = new THREE.Group();
  const L = 0.133 * 4, H = 0.044 * 4;
  const pcb = box(L, H * 0.42, 0.006, mat.pcb(0x13402c)); pcb.position.y = H * 0.21; g.add(pcb);
  const fingers = box(L * 0.96, 0.022, 0.0065, mat.gold()); fingers.position.y = 0.011; g.add(fingers);
  const notch = box(0.012, 0.03, 0.008, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 })); notch.position.set(-L * 0.05, 0.012, 0); g.add(notch);
  // dissipador facetado (perfil com cantos chanfrados)
  const w = L / 2, y0 = H * 0.28, y1 = H * 0.92, c = 0.05;
  const prof: [number, number][] = [[-w, y0], [w, y0], [w, y1 - c * 1.2], [w - c * 0.5, y1 - c * 0.6], [w - c * 0.5, y1], [-w + c * 0.5, y1], [-w + c * 0.5, y1 - c * 0.6], [-w, y1 - c * 1.2]];
  const shell = extrude(prof, 0.026, new THREE.MeshStandardMaterial({ color: white ? 0xcfd3d8 : 0x1b1d22, metalness: 0.25, roughness: 0.45 }), 0.004);
  shell.position.z = -0.013; g.add(shell);
  // parafusos dourados
  for (const sx of [-1, 1]) for (const yy of [0.62, 0.76]) { const sc = cyl(0.007, 0.007, 0.03, mat.gold(), 16); sc.rotation.x = Math.PI / 2; sc.position.set(sx * (w - 0.025), H * yy, 0); g.add(sc); }
  // barra de luz: difusor + LEDs
  const diff = box(L * 0.86, 0.026, 0.024, new THREE.MeshPhysicalMaterial({ color: 0xbfc4cc, roughness: 0.6, transmission: 0.3, transparent: true, opacity: 0.35 }));
  diff.position.y = y1 + 0.006; g.add(diff);
  const leds = ledStrip(L * 0.84, 40, 0.02, 0.016); leds.group.position.y = y1 + 0.006; g.add(leds.group);
  // pastilhas coloridas no topo
  const caps: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 9; i++) { const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.2 }); const p = box(0.022, 0.004, 0.02, m); p.position.set(-L * 0.36 + i * (L * 0.09), y1 + 0.021, 0); g.add(p); caps.push(m); }
  return { group: g, update(t: number, accent: THREE.Color, level: number, offset: number) { leds.update(t + offset, accent, 'rainbow', level); caps.forEach((m, i) => m.emissive.setHSL((i / caps.length + t * 0.08 + offset) % 1, 0.9, 0.6)); } };
}
export function ramModel(opts: { count?: number } = {}): Model {
  const g = new THREE.Group(); const n = Math.max(1, Math.min(4, opts.count ?? 2));
  const sticks = Array.from({ length: n }, (_, i) => { const s = ramStick(); s.group.position.set(i * 0.09, 0, -i * 0.09); g.add(s.group); return s; });
  return { group: g, focus: { distance: 0.95, target: [0, 0.09, -0.04], height: 0.3 }, update(live, t) { sticks.forEach((s, i) => s.update(t, live.accent, 0.7 + (live.mem ?? 0.5) * 0.6, i * 0.12)); } };
}

// ======================= PLACA-MÃE =======================
function lightPanelTexture(accent: string) {
  return canvasTex(512, 1024, (c) => {
    c.fillStyle = '#07080b'; c.fillRect(0, 0, 512, 1024);
    const gr = c.createLinearGradient(0, 0, 512, 1024); gr.addColorStop(0, accent); gr.addColorStop(0.5, '#7a3cff'); gr.addColorStop(1, accent);
    c.strokeStyle = gr; c.lineCap = 'round';
    for (let i = 0; i < 6; i++) { c.lineWidth = 26 - i * 3; c.globalAlpha = 0.9 - i * 0.12; c.beginPath(); c.moveTo(60 + i * 30, 980); c.bezierCurveTo(480, 760 - i * 40, 40, 420 - i * 30, 460 - i * 20, 80 + i * 20); c.stroke(); }
    c.globalAlpha = 1; c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = 0; y < 1024; y += 6) c.fillRect(0, y, 512, 1);
  });
}
function hexEmblemTexture(accent: string) {
  return canvasTex(512, 256, (c) => {
    c.fillStyle = '#0b0c10'; c.fillRect(0, 0, 512, 256);
    c.strokeStyle = accent; c.lineWidth = 10; c.shadowColor = accent; c.shadowBlur = 30;
    const hx = (cx: number, cy: number, r: number) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.closePath(); c.stroke(); };
    hx(150, 128, 70); hx(150, 128, 40);
    c.font = '800 58px "SF Pro Display", "Segoe UI", sans-serif'; c.fillStyle = '#e8ecf2'; c.shadowBlur = 18; c.fillText('CLEAN', 250, 120); c.fillStyle = accent; c.fillText('CODE', 250, 178);
  });
}
export function boardModel(opts: { dimms?: number; sticks?: number; mac?: boolean } = {}): Model {
  const g = new THREE.Group();
  const W = 0.61, H = 0.49, mkTex = pcbTexture('#0a0b0e', 'rgba(70,82,96,0.45)', 7);
  const pcb = slab(W, H, 0.008, 0.008, new THREE.MeshStandardMaterial({ map: mkTex, metalness: 0.3, roughness: 0.55 })); g.add(pcb);
  const z0 = 0.004; const darkMetal = mat.dark(0x1b1d22, 0.38), darker = mat.dark(0x101115, 0.5), lighter = mat.metal(0x5a6069, 0.35);
  const add = (m: THREE.Object3D, x: number, y: number, z = z0) => { m.position.set(x, y, z); g.add(m); return m; };
  // capa do painel traseiro com painel de luz
  const io = extrude([[-0.305, -0.005], [-0.2, -0.005], [-0.2, 0.16], [-0.18, 0.18], [-0.18, 0.245], [-0.305, 0.245]], 0.07, darkMetal, 0.004); add(io, 0, 0, z0);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveMap: null as any, emissiveIntensity: 1.6 });
  const light = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.2), lightMat); add(light, -0.252, 0.12, z0 + 0.0785);
  for (let i = 0; i < 4; i++) add(box(0.09, 0.002, 0.004, lighter), -0.252, -0.0 + i * 0.012, z0 + 0.077);
  // dissipador dos reguladores (topo)
  const vrm = extrude([[-0.19, 0.16], [0.07, 0.16], [0.09, 0.18], [0.09, 0.235], [-0.17, 0.235], [-0.19, 0.215]], 0.045, darkMetal, 0.004); add(vrm, 0, 0, z0);
  for (let i = 0; i < 3; i++) add(box(0.22, 0.003, 0.002, lighter), -0.05, 0.185 + i * 0.014, z0 + 0.052);
  // reguladores e indutores em volta do soquete
  for (let i = 0; i < 9; i++) add(rbox(0.016, 0.016, 0.012, 0.002, darker), -0.13 + i * 0.022, 0.145, z0 + 0.006);
  for (let i = 0; i < 6; i++) add(rbox(0.016, 0.016, 0.012, 0.002, darker), -0.175, 0.12 - i * 0.022, z0 + 0.006);
  // soquete do processador
  add(box(0.12, 0.12, 0.004, mat.plastic(0x0c0c0e)), -0.03, 0.06, z0 + 0.002);
  const sockFrame = new THREE.Shape(); sockFrame.moveTo(-0.055, -0.05); sockFrame.lineTo(0.055, -0.05); sockFrame.lineTo(0.055, 0.05); sockFrame.lineTo(-0.055, 0.05); sockFrame.lineTo(-0.055, -0.05);
  const hole = new THREE.Path(); hole.moveTo(-0.04, -0.035); hole.lineTo(0.04, -0.035); hole.lineTo(0.04, 0.035); hole.lineTo(-0.04, 0.035); hole.lineTo(-0.04, -0.035); sockFrame.holes.push(hole);
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(sockFrame, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2 }), mat.metal(0xd2d6db, 0.22)); add(frame, -0.03, 0.06, z0 + 0.004);
  const pads = new THREE.Mesh(new THREE.PlaneGeometry(0.078, 0.068), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c) => { c.fillStyle = '#3a3420'; c.fillRect(0, 0, 256, 256); c.fillStyle = '#c9a54a'; for (let y = 4; y < 256; y += 8) for (let x = 4; x < 256; x += 8) c.fillRect(x, y, 3, 3); }), metalness: 0.8, roughness: 0.4 })); add(pads, -0.03, 0.06, z0 + 0.0045);
  const lever = cyl(0.0025, 0.0025, 0.12, mat.metal(0xd8dce0, 0.2), 12); add(lever, 0.033, 0.055, z0 + 0.008);
  // slots de memória (com pentes, quando houver)
  const dimms = opts.dimms ?? 4, sticks = Math.min(dimms, opts.sticks ?? 2);
  const ramSticks: ReturnType<typeof ramStick>[] = [];
  for (let i = 0; i < dimms; i++) {
    const x = 0.12 + i * 0.017;
    add(box(0.008, 0.27, 0.009, mat.plastic(0x08090b)), x, 0.07, z0 + 0.004);
    add(box(0.009, 0.012, 0.012, mat.plastic(0x30343b)), x, 0.21, z0 + 0.006);
    // ocupa slots alternados (2 e 4), como manda o manual
    const occupied = sticks >= dimms ? true : sticks === 1 ? i === 1 : sticks === 2 ? i % 2 === 1 : i < sticks;
    if (occupied) {
      // pente em pé no slot: comprimento ao longo do slot (y), altura saindo da placa (z)
      const s = ramStick(); s.group.scale.setScalar(0.5);
      s.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
      s.group.position.set(x, 0.07, z0 + 0.008); g.add(s.group); ramSticks.push(s);
    }
  }
  // conector de 24 pinos e display de diagnóstico
  add(box(0.014, 0.065, 0.018, mat.plastic(0x0b0c0e)), 0.285, 0.1, z0 + 0.009);
  const dbg = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.016), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveMap: canvasTex(128, 64, (c) => { c.fillStyle = '#000'; c.fillRect(0, 0, 128, 64); c.fillStyle = '#ff5a4f'; c.font = '700 48px Menlo, monospace'; c.fillText('A0', 24, 50); }), emissiveIntensity: 1.4 }));
  add(box(0.034, 0.02, 0.004, mat.plastic(0x050506)), 0.26, 0.215, z0 + 0.002); add(dbg, 0.26, 0.215, z0 + 0.0045);
  // slots PCIe com reforço metálico e coberturas M.2 em camadas
  for (const y of [-0.05, -0.17]) {
    add(box(0.34, 0.012, 0.012, mat.plastic(0x0a0a0c)), -0.02, y, z0 + 0.006);
    add(box(0.345, 0.016, 0.004, mat.metal(0xc7ccd2, 0.25)), -0.02, y, z0 + 0.012);
  }
  const plate = (pts: [number, number][], d: number) => add(extrude(pts, d, darkMetal, 0.003), 0, 0, z0);
  plate([[-0.2, -0.03], [0.12, -0.03], [0.14, -0.045], [0.14, -0.035], [0.12, -0.012], [-0.2, -0.012]], 0.014);
  plate([[-0.2, -0.155], [0.02, -0.155], [0.05, -0.125], [0.05, -0.07], [-0.2, -0.07]], 0.012);
  plate([[-0.2, -0.235], [0.05, -0.235], [0.05, -0.19], [-0.2, -0.19]], 0.012);
  for (let i = 0; i < 3; i++) add(box(0.012, 0.004, 0.002, lighter), -0.17 + i * 0.016, -0.1, z0 + 0.0135);
  // dissipador do chipset com emblema iluminado próprio
  plate([[0.07, -0.235], [0.3, -0.235], [0.3, -0.06], [0.16, -0.06], [0.07, -0.15]], 0.024);
  const emblemMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.5 });
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), emblemMat), 0.215, -0.11, z0 + 0.0285);
  // capacitores de áudio, conectores do rodapé, furos de fixação
  for (let i = 0; i < 4; i++) add(cyl(0.005, 0.005, 0.01, new THREE.MeshStandardMaterial({ color: 0xc89a3c, metalness: 0.9, roughness: 0.3 }), 16), -0.28 + (i % 2) * 0.014, -0.2 - Math.floor(i / 2) * 0.014, z0 + 0.005).rotation.x = Math.PI / 2;
  for (let i = 0; i < 7; i++) add(box(0.02, 0.008, 0.006, mat.plastic(0x15161a)), -0.15 + i * 0.045, -0.235, z0 + 0.003);
  for (const [x, y] of [[-0.285, 0.225], [0.285, 0.225], [-0.285, -0.225], [0.285, -0.225], [0.02, 0.225], [0.02, -0.225]]) add(new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0015, 8, 20), mat.metal(0xb9bec4)), x, y, z0 + 0.001);
  let lastAccent = '';
  return {
    group: g, focus: { distance: 1.25, target: [0, 0.245, 0], height: 0.42 },
    update(live, t) {
      const hex = accentHex(live);
      if (hex !== lastAccent) { lastAccent = hex; lightMat.emissiveMap = lightPanelTexture(hex); emblemMat.emissiveMap = hexEmblemTexture(hex); lightMat.needsUpdate = true; emblemMat.needsUpdate = true; }
      lightMat.emissiveIntensity = 1.3 + Math.sin(t * 1.5) * 0.35 + (live.load ?? 0) * 0.8;
      emblemMat.emissiveIntensity = 1.2 + Math.sin(t * 2.2) * 0.3;
      ramSticks.forEach((s, i) => s.update(t, live.accent, 0.8, i * 0.1));
    },
  };
}

// ======================= SSD =======================
export function ssdModel(opts: { kind?: 'nvme' | 'sata' | 'hdd' | 'usb'; label?: string } = {}): Model {
  const g = new THREE.Group(); const kind = opts.kind || 'nvme';
  let activity: THREE.MeshStandardMaterial | null = null;
  if (kind === 'nvme') {
    const L = 0.48, W = 0.132;
    const pcb = slab(L, W, 0.008, 0.006, new THREE.MeshStandardMaterial({ map: pcbTexture('#08090b', 'rgba(70,90,110,0.5)', 3, 512), metalness: 0.3, roughness: 0.5 })); pcb.rotation.x = -Math.PI / 2; pcb.position.y = 0.004; g.add(pcb);
    const fingers = box(0.03, 0.009, W * 0.85, mat.gold()); fingers.position.set(L / 2 - 0.015, 0.0045, 0); g.add(fingers);
    const screw = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 8, 24), mat.gold()); screw.rotation.x = -Math.PI / 2; screw.position.set(-L / 2 + 0.012, 0.009, 0); g.add(screw);
    // dissipador com aletas e faixa iluminada
    const sink = rbox(L * 0.84, 0.03, W * 0.96, 0.006, new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.9, roughness: 0.32 })); sink.position.set(-0.01, 0.024, 0); g.add(sink);
    for (let i = 0; i < 16; i++) { const f = box(L * 0.8, 0.012, 0.003, mat.metal(0x8b9199, 0.3)); f.position.set(-0.01, 0.045, -W * 0.42 + i * (W * 0.84 / 15)); g.add(f); }
    activity = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0x3ddc97), emissiveIntensity: 2 });
    const bar = box(L * 0.78, 0.004, 0.006, activity); bar.position.set(-0.01, 0.04, W * 0.49); g.add(bar);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshStandardMaterial({ map: labelTexture([{ text: (opts.label || 'NVMe SSD').toUpperCase().slice(0, 18), size: 70 }, { text: 'M.2 2280 · PCIe', size: 54, alpha: 0.6 }], 1024, 340, '#1d2026', '#cfd5dd'), metalness: 0.5, roughness: 0.4 }));
    lbl.rotation.x = -Math.PI / 2; lbl.position.set(-0.05, 0.0525, 0); g.add(lbl);
  } else if (kind === 'hdd') {
    const body = rbox(0.4, 0.1, 0.58, 0.01, mat.metal(0x8f959d, 0.4)); body.position.y = 0.05; g.add(body);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.5), new THREE.MeshStandardMaterial({ map: labelTexture([{ text: (opts.label || 'DISCO RÍGIDO').toUpperCase().slice(0, 18), size: 70 }, { text: 'SATA · 3,5"', size: 54, alpha: 0.6 }], 1024, 1400, '#d9dde2', '#2c3036'), metalness: 0.6, roughness: 0.4 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.101; g.add(top);
    activity = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0x3ddc97), emissiveIntensity: 2 });
  } else {
    const body = rbox(0.3, 0.028, 0.42, 0.012, kind === 'usb' ? mat.dark(0x1d2026, 0.4) : mat.metal(0x2f333a, 0.35)); body.position.y = 0.014; g.add(body);
    activity = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0x3ddc97), emissiveIntensity: 2 });
    const stripe = box(0.3, 0.004, 0.006, activity); stripe.position.set(0, 0.03, 0.21); g.add(stripe);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), new THREE.MeshStandardMaterial({ map: labelTexture([{ text: (opts.label || (kind === 'usb' ? 'DISCO EXTERNO' : 'SSD SATA')).toUpperCase().slice(0, 16), size: 72 }, { text: kind === 'usb' ? 'USB' : 'SATA · 2,5"', size: 56, alpha: 0.6 }], 1024, 1340, '#22262d', '#d5dbe3'), metalness: 0.4, roughness: 0.4 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.0285; g.add(top);
  }
  return { group: g, focus: { distance: 0.95, target: [0, 0.02, 0], height: 0.5 }, update(live, t) { if (activity) { activity.emissive.copy(live.accent); activity.emissiveIntensity = 0.6 + (live.disk ?? 0.2) * 3 * (0.6 + 0.4 * Math.abs(Math.sin(t * 9))); } } };
}

// ======================= ENERGIA =======================
/** Partículas correndo por curvas (cabos): quantidade e velocidade seguem os watts. */
function flows(curves: THREE.Curve<THREE.Vector3>[], perCurve = 18) {
  const g = new THREE.Group(); const dots: { m: THREE.Mesh; c: number; off: number }[] = [];
  const dotMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveIntensity: 3 });
  curves.forEach((curve, ci) => {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.006, 8, false), new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.3, roughness: 0.5, emissive: new THREE.Color(0x000000) }));
    g.add(tube);
    for (let i = 0; i < perCurve; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 10, 8), dotMat); g.add(m); dots.push({ m, c: ci, off: i / perCurve }); }
  });
  let phase = 0;
  return { group: g, dotMat, update(dt: number, speed: number, count: number, accent: THREE.Color, reverse = false) {
    phase += dt * speed; dotMat.emissive.copy(accent);
    dots.forEach((d, i) => { const visible = (i % Math.max(1, Math.round(18 / Math.max(1, count)))) === 0; d.m.visible = visible; if (!visible) return; let u = (d.off + phase) % 1; if (reverse) u = 1 - u; d.m.position.copy(curves[d.c].getPointAt(u)); });
  } };
}
export function powerModel(opts: { laptop?: boolean } = {}): Model {
  const g = new THREE.Group();
  if (!opts.laptop) {
    // fonte modular
    const psu = rbox(0.3, 0.17, 0.32, 0.01, mat.dark(0x15171b, 0.45)); psu.position.set(-0.25, 0.085, 0); g.add(psu);
    const f = fan(0.1, { blades: 9 }); f.group.rotation.x = -Math.PI / 2; f.group.position.set(-0.25, 0.172, 0); g.add(f.group);
    const grill = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.004, 8, 48), mat.metal(0x8f959d)); grill.rotation.x = -Math.PI / 2; grill.position.set(-0.25, 0.174, 0); g.add(grill);
    const ring = ledRing(0.106, 0.004); ring.mesh.rotation.x = -Math.PI / 2; ring.mesh.position.set(-0.25, 0.176, 0); g.add(ring.mesh);
    for (let i = 0; i < 6; i++) { const s = box(0.03, 0.02, 0.004, mat.plastic(0x050506)); s.position.set(-0.13 + 0.0, 0.05 + (i % 3) * 0.035, -0.08 + Math.floor(i / 3) * 0.16); s.rotation.y = Math.PI / 2; g.add(s); }
    // destinos: processador, placa de vídeo, placa-mãe
    const cpuB = rbox(0.1, 0.03, 0.1, 0.006, mat.metal(0xc4c8cd, 0.3)); cpuB.position.set(0.22, 0.25, -0.12); g.add(cpuB);
    const gpuB = rbox(0.28, 0.05, 0.1, 0.008, mat.dark(0x202328, 0.4)); gpuB.position.set(0.25, 0.08, 0.13); g.add(gpuB);
    const brdB = rbox(0.16, 0.02, 0.14, 0.006, new THREE.MeshStandardMaterial({ map: pcbTexture('#0a0b0e', 'rgba(70,82,96,0.5)', 9, 256), metalness: 0.3, roughness: 0.5 })); brdB.position.set(0.25, 0.17, -0.02); g.add(brdB);
    const mk = (a: THREE.Vector3, b: THREE.Vector3, lift: number) => new THREE.CubicBezierCurve3(a, a.clone().add(new THREE.Vector3(0.12, lift, 0)), b.clone().add(new THREE.Vector3(-0.15, lift * 0.5, 0)), b);
    const curves = [mk(new THREE.Vector3(-0.1, 0.12, -0.08), new THREE.Vector3(0.17, 0.25, -0.12), 0.12), mk(new THREE.Vector3(-0.1, 0.06, 0.08), new THREE.Vector3(0.11, 0.08, 0.13), 0.02), mk(new THREE.Vector3(-0.1, 0.1, 0.0), new THREE.Vector3(0.17, 0.17, -0.02), 0.08)];
    const fl = flows(curves); g.add(fl.group);
    return { group: g, focus: { distance: 1.35, target: [0, 0.12, 0], height: 0.55 }, update(live, t, dt) { const w = live.watts ?? 60; f.spin(4 + Math.min(1, w / 400) * 18, dt); ring.update(t); fl.update(dt, 0.15 + Math.min(1, w / 300) * 0.7, 3 + Math.min(15, w / 25), live.accent); } };
  }
  // notebook: pacote de bateria com células, carregador e fluxo
  const frame = rbox(0.5, 0.03, 0.28, 0.01, mat.dark(0x1a1c21, 0.5)); frame.position.y = 0.015; g.add(frame);
  const fills: THREE.Mesh[] = []; const fillMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0x3ddc97), emissiveIntensity: 1.6, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const cell = rbox(0.14, 0.02, 0.11, 0.008, new THREE.MeshPhysicalMaterial({ color: 0x2a2f37, metalness: 0.4, roughness: 0.3, clearcoat: 1 })); cell.position.set(-0.16 + i * 0.16, 0.036, -0.06 + j * 0.12); g.add(cell);
    const fill = box(0.12, 0.004, 0.09, fillMat); fill.position.set(-0.16 + i * 0.16, 0.047, -0.06 + j * 0.12); g.add(fill); fills.push(fill);
  }
  const brick = rbox(0.12, 0.05, 0.12, 0.016, new THREE.MeshPhysicalMaterial({ color: 0x3a3d43, roughness: 0.45, clearcoat: 0.4 })); brick.position.set(-0.45, 0.025, 0.2); g.add(brick);
  const chip = rbox(0.09, 0.012, 0.09, 0.004, mat.metal(0x9aa1ab, 0.3)); chip.position.set(0.4, 0.006, -0.12); g.add(chip);
  const c1 = new THREE.CubicBezierCurve3(new THREE.Vector3(-0.39, 0.03, 0.2), new THREE.Vector3(-0.3, 0.12, 0.25), new THREE.Vector3(-0.3, 0.08, 0.05), new THREE.Vector3(-0.25, 0.03, 0.0));
  const c2 = new THREE.CubicBezierCurve3(new THREE.Vector3(0.25, 0.03, 0.0), new THREE.Vector3(0.3, 0.1, -0.02), new THREE.Vector3(0.33, 0.08, -0.12), new THREE.Vector3(0.36, 0.012, -0.12));
  const fl = flows([c1, c2]); g.add(fl.group);
  return {
    group: g, focus: { distance: 1.3, target: [0, 0.04, 0], height: 0.6 },
    update(live, t, dt) {
      const lvl = live.battery ?? 0.8; fillMat.emissive.copy(lvl < 0.15 ? new THREE.Color(0xff4d4f) : live.accent); fillMat.emissiveIntensity = 1.2 + Math.sin(t * 2) * 0.3;
      fills.forEach((f, i) => { const k = Math.max(0.05, Math.min(1, lvl * fills.length - i)); f.scale.set(k, 1, 1); });
      const w = live.watts ?? 10; fl.update(dt, 0.15 + Math.min(1, w / 60) * 0.6, 3 + Math.min(14, w / 4), live.accent, !live.charging && false);
    },
  };
}

// ======================= PC MONTADO =======================
export function pcModel(opts: { sticks?: number } = {}): Model {
  const g = new THREE.Group();
  const W = 0.5, H = 0.5, D = 0.32;
  const frameMat = mat.dark(0x0d0e11, 0.45);
  // estrutura do gabinete: base, topo, traseira, frente com tela, colunas
  const bottom = rbox(W, 0.03, D, 0.006, frameMat); bottom.position.y = 0.015; g.add(bottom);
  const top = rbox(W, 0.02, D, 0.006, frameMat); top.position.y = H - 0.01; g.add(top);
  const back = box(W, H, 0.01, frameMat); back.position.set(0, H / 2, -D / 2); g.add(back);
  const right = box(0.012, H, D, frameMat); right.position.set(W / 2, H / 2, 0); g.add(right);
  for (const [x, z] of [[-W / 2, D / 2], [W / 2, D / 2], [-W / 2, -D / 2]]) { const p = box(0.012, H, 0.012, frameMat); p.position.set(x, H / 2, z); g.add(p); }
  for (const [x, z] of [[-W / 2 + 0.06, D / 2 - 0.05], [W / 2 - 0.06, D / 2 - 0.05], [-W / 2 + 0.06, -D / 2 + 0.05], [W / 2 - 0.06, -D / 2 + 0.05]]) { const f = rbox(0.06, 0.02, 0.04, 0.006, frameMat); f.position.set(x, -0.005, z); g.add(f); }
  // vidros (lateral e frente)
  const glassF = new THREE.Mesh(new THREE.PlaneGeometry(W, H - 0.05), mat.glass()); glassF.position.set(0, H / 2, D / 2 + 0.002); g.add(glassF);
  const glassL = new THREE.Mesh(new THREE.PlaneGeometry(D, H - 0.05), mat.glass()); glassL.rotation.y = -Math.PI / 2; glassL.position.set(-W / 2 - 0.002, H / 2, 0); g.add(glassL);
  // cobertura da fonte
  const shroud = box(W - 0.02, 0.09, D - 0.02, mat.dark(0x15171b, 0.5)); shroud.position.set(0, 0.075, 0); g.add(shroud);
  // placa-mãe na traseira
  const board = boardModel({ sticks: opts.sticks ?? 2 }); board.group.scale.setScalar(0.62); board.group.position.set(-0.04, 0.29, -D / 2 + 0.012); g.add(board.group);
  // placa de vídeo horizontal (ventoinhas para baixo)
  const gpu = gpuModel(); gpu.group.scale.setScalar(0.95); gpu.group.rotation.set(Math.PI / 2, 0, 0); gpu.group.position.set(-0.03, 0.17, -D / 2 + 0.09); g.add(gpu.group);
  // water cooler: bomba no soquete, tubos e radiador no topo
  const pumpMat = mat.dark(0x121418, 0.4);
  const pump = cyl(0.04, 0.04, 0.035, pumpMat, 48); pump.rotation.x = Math.PI / 2; pump.position.set(-0.058, 0.327, -D / 2 + 0.04); g.add(pump);
  const pumpRing = ledRing(0.041, 0.003); pumpRing.mesh.position.set(-0.058, 0.327, -D / 2 + 0.058); g.add(pumpRing.mesh);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.2 });
  const screen = new THREE.Mesh(new THREE.CircleGeometry(0.034, 40), screenMat); screen.position.set(-0.058, 0.327, -D / 2 + 0.0585); g.add(screen);
  const radiator = box(0.38, 0.03, 0.12, mat.dark(0x16181c, 0.5)); radiator.position.set(-0.02, H - 0.04, -0.02); g.add(radiator);
  const topFans: ReturnType<typeof fan>[] = []; const rings: ReturnType<typeof ledRing>[] = [];
  for (let i = 0; i < 3; i++) {
    const f = fan(0.05, { blades: 9, blade: new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.1, roughness: 0.4, transparent: true, opacity: 0.85, side: THREE.DoubleSide }) });
    f.group.rotation.x = Math.PI / 2; f.group.position.set(-0.14 + i * 0.12, H - 0.07, -0.02); g.add(f.group); topFans.push(f);
    const rr = ledRing(0.05, 0.004); rr.mesh.rotation.x = Math.PI / 2; rr.mesh.position.copy(f.group.position); g.add(rr.mesh); rings.push(rr);
  }
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.7 });
  for (const dx of [-0.015, 0.015]) { const c = new THREE.CubicBezierCurve3(new THREE.Vector3(-0.058 + dx, 0.36, -D / 2 + 0.04), new THREE.Vector3(-0.03 + dx, 0.42, 0.0), new THREE.Vector3(0.12 + dx, 0.45, 0.02), new THREE.Vector3(0.16 + dx, H - 0.055, -0.02)); g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.008, 10, false), tubeMat)); }
  // ventoinhas da frente (lado direito) e traseira
  const sideFans: ReturnType<typeof fan>[] = [];
  for (let i = 0; i < 3; i++) {
    const f = fan(0.055, { blades: 9, blade: new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.1, roughness: 0.4, transparent: true, opacity: 0.85, side: THREE.DoubleSide }) });
    f.group.rotation.y = -Math.PI / 2; f.group.position.set(W / 2 - 0.02, 0.16 + i * 0.12, 0.0); g.add(f.group); sideFans.push(f);
    const rr = ledRing(0.055, 0.004); rr.mesh.rotation.y = -Math.PI / 2; rr.mesh.position.copy(f.group.position); g.add(rr.mesh); rings.push(rr);
  }
  const rear = fan(0.05, { blades: 9 }); rear.group.position.set(-W / 2 + 0.07, 0.36, -D / 2 + 0.02); g.add(rear.group); sideFans.push(rear);
  const rr2 = ledRing(0.05, 0.004); rr2.mesh.position.copy(rear.group.position); g.add(rr2.mesh); rings.push(rr2);
  // faixa de LED na base do vidro
  const strip = ledStrip(W - 0.04, 40, 0.004, 0.004); strip.group.position.set(0, 0.123, D / 2 - 0.01); g.add(strip.group);
  let lastShown = -1;
  return {
    group: g, focus: { distance: 1.55, target: [0, 0.25, 0], height: 0.42 },
    update(live, t, dt) {
      const ld = live.load ?? 0.2; const speed = 4 + ld * 16;
      topFans.forEach((f) => f.spin(speed, dt)); sideFans.forEach((f) => f.spin(speed * 0.9, dt));
      rings.forEach((r, i) => r.update(t, i * 0.09)); pumpRing.update(t, 0.5);
      strip.update(t, live.accent, 'rainbow', 0.9);
      board.update?.(live, t, dt); gpu.update?.(live, t, dt);
      const tc = Math.round(live.temps?.cpu ?? 0);
      if (tc !== lastShown) {
        lastShown = tc; screenMat.emissiveMap?.dispose();
        screenMat.emissiveMap = canvasTex(256, 256, (c) => { c.fillStyle = '#000'; c.fillRect(0, 0, 256, 256); const gr = c.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, '#0d1a2a'); gr.addColorStop(1, accentHex(live)); c.fillStyle = gr; c.beginPath(); c.arc(128, 128, 126, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.font = '700 84px "SF Pro Display", "Segoe UI", sans-serif'; c.textAlign = 'center'; c.fillText(tc ? `${tc}°` : '--', 128, 156); });
        screenMat.needsUpdate = true;
      }
    },
  };
}

// ======================= NOTEBOOKS =======================
function keyboard(cols: number, rows: number, kw: number, gap: number, keyMat: THREE.Material) {
  const g = new THREE.Group(); const geo = new THREE.BoxGeometry(kw, 0.002, kw);
  const inst = new THREE.InstancedMesh(geo, keyMat, cols * rows); const m = new THREE.Matrix4(); let n = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (r === rows - 1 && c > 3 && c < cols - 4) { if (c === 4) { m.makeScale((cols - 8) * 1 + 0.6, 1, 1); m.setPosition(-((cols - 1) * (kw + gap)) / 2 + (cols / 2 - 0.5) * (kw + gap), 0, r * (kw + gap)); inst.setMatrixAt(n++, m); } continue; }
    m.makeScale(1, 1, 1); m.setPosition(-((cols - 1) * (kw + gap)) / 2 + c * (kw + gap), 0, r * (kw + gap)); inst.setMatrixAt(n++, m);
  }
  inst.count = n; g.add(inst); return g;
}
function macScreen(accent: string) {
  return canvasTex(1600, 1040, (c) => {
    c.fillStyle = '#050507'; c.fillRect(0, 0, 1600, 1040);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const draw = (w: number, col: string, blur: number) => {
      c.strokeStyle = col; c.lineWidth = w; c.shadowColor = accent; c.shadowBlur = blur;
      c.beginPath(); c.moveTo(-50, 260); c.lineTo(820, 260); c.quadraticCurveTo(1000, 260, 1000, 430); c.quadraticCurveTo(1000, 600, 820, 600); c.lineTo(420, 600); c.quadraticCurveTo(300, 600, 300, 720); c.lineTo(300, 1100); c.stroke();
      c.beginPath(); c.moveTo(1240, 1100); c.lineTo(1240, 420); c.quadraticCurveTo(1240, 300, 1360, 300); c.quadraticCurveTo(1480, 300, 1480, 420); c.lineTo(1480, 1100); c.stroke();
    };
    draw(150, 'rgba(255,255,255,0.05)', 80); draw(110, accent + '55', 60); draw(36, accent, 40); draw(10, '#ffffff', 20);
  });
}
function winScreen(accent: string) {
  return canvasTex(1600, 1000, (c) => {
    const bg = c.createLinearGradient(0, 0, 1600, 1000); bg.addColorStop(0, '#04081a'); bg.addColorStop(1, '#0a1640'); c.fillStyle = bg; c.fillRect(0, 0, 1600, 1000);
    c.translate(820, 470);
    for (let i = 0; i < 9; i++) { c.rotate(Math.PI / 4.6); const gr = c.createLinearGradient(0, 0, 420, 0); gr.addColorStop(0, '#1d4dff'); gr.addColorStop(0.6, accent); gr.addColorStop(1, 'rgba(255,255,255,0.1)'); c.fillStyle = gr; c.globalAlpha = 0.55; c.beginPath(); c.ellipse(190, 0, 230, 70, 0.3, 0, Math.PI * 2); c.fill(); }
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    c.fillStyle = 'rgba(20,24,34,0.88)'; c.fillRect(0, 950, 1600, 50);
    for (let i = 0; i < 9; i++) { c.fillStyle = i === 0 ? '#3c8bff' : 'rgba(255,255,255,0.65)'; c.fillRect(600 + i * 46, 962, 26, 26); }
  });
}
export function laptopModel(opts: { mac?: boolean } = {}): Model {
  const g = new THREE.Group(); const mac = !!opts.mac;
  const W = 0.62, D = 0.43, T = 0.03;
  const body = mac ? new THREE.MeshPhysicalMaterial({ color: 0x141518, metalness: 0.8, roughness: 0.42, clearcoat: 0.2 }) : mat.plastic(0x141518, 0.7);
  const base = slab(W, D, T, 0.03, body, 0.006); base.rotation.x = -Math.PI / 2; base.position.y = T / 2; g.add(base);
  const well = slab(W * 0.88, D * 0.42, 0.004, 0.012, mat.dark(0x0b0b0d, 0.6), 0.001); well.rotation.x = -Math.PI / 2; well.position.set(0, T + 0.0005, -D * 0.16); g.add(well);
  const kb = keyboard(mac ? 14 : 15, 6, mac ? 0.034 : 0.031, 0.006, new THREE.MeshStandardMaterial({ color: 0x0f1012, metalness: 0.2, roughness: 0.55 })); kb.position.set(0, T + 0.0062, -D * 0.33); g.add(kb);
  const pad = slab(mac ? W * 0.42 : W * 0.32, D * 0.27, 0.002, 0.012, new THREE.MeshPhysicalMaterial({ color: mac ? 0x232428 : 0x18191c, roughness: 0.25, clearcoat: 0.6 })); pad.rotation.x = -Math.PI / 2; pad.position.set(0, T + 0.002, D * 0.26); g.add(pad);
  // tampa com tela (dobradiça na traseira)
  const lid = new THREE.Group(); lid.position.set(0, T, -D / 2 + 0.008); g.add(lid);
  const lidBody = slab(W, D * 0.98, 0.012, 0.03, body, 0.004); lidBody.position.set(0, D * 0.49, -0.006); lid.add(lidBody);
  const bezel = slab(W * 0.985, D * 0.96, 0.002, 0.024, mat.dark(0x050506, 0.4), 0.001); bezel.position.set(0, D * 0.49, 0.001); lid.add(bezel);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.05, roughness: 0.15 });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.94, D * 0.88), screenMat); scr.position.set(0, D * 0.5, 0.0042); lid.add(scr);
  if (mac) { const notch = slab(0.07, 0.016, 0.001, 0.006, mat.dark(0x000000, 0.4), 0); notch.position.set(0, D * 0.93, 0.0048); lid.add(notch); }
  else { const cam = cyl(0.003, 0.003, 0.002, mat.dark(0x000000), 16); cam.rotation.x = Math.PI / 2; cam.position.set(0, D * 0.955, 0.0045); lid.add(cam); }
  const hinge = cyl(0.01, 0.01, W * 0.85, body, 24); hinge.rotation.z = Math.PI / 2; hinge.position.set(0, T, -D / 2 + 0.006); g.add(hinge);
  let open = 0, lastAccent = '';
  return {
    group: g, focus: { distance: 1.35, target: [0, 0.16, 0], height: 0.42 },
    update(live, t, dt) {
      open = Math.min(1, open + dt * 0.8); const e = 1 - Math.pow(1 - open, 3);
      lid.rotation.x = (1 - e) * (Math.PI / 2) - e * 0.18; // fechada sobre o teclado → aberta (~100°)
      const hex = accentHex(live);
      if (hex !== lastAccent) { lastAccent = hex; screenMat.emissiveMap?.dispose(); screenMat.emissiveMap = mac ? macScreen(hex) : winScreen(hex); screenMat.needsUpdate = true; }
      screenMat.emissiveIntensity = 0.9 + Math.sin(t * 0.8) * 0.06;
    },
  };
}
