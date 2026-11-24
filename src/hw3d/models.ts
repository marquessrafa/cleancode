// Modelos 3D do Monitor de hardware, feitos com geometria própria (sem marcas nem logotipos):
// placa de vídeo, processador, memória RAM, placa-mãe, SSD, energia (fonte ou bateria),
// PC montado em gabinete de vidro, MacBook e notebook Windows. Cada modelo se anima com os dados ao vivo.
import { THREE, Model, Live, mat, rbox, box, cyl, extrude, slab, canvasTex, pcbTexture, labelTexture, fan, ledStrip, ledRing, tempColor } from './core';
import { t as tr, LOCALE } from '../lib/i18n';

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
  const step = (L * 0.86) / nFans, r = Math.min(H * 0.39, step * 0.42);
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
      strip.update(t, live.accent, 'accent', 0.7 + u * 0.6); topBar.update(t, live.accent, 'accent', 0.6 + u * 0.5);
    },
  };
}

// ======================= PROCESSADOR AMD (AM5) =======================
/** Contorno da tampa metálica (IHS) dos Ryzen AM5: quadrado de cantos arredondados com dois recortes em cada lado,
 *  onde aparecem os capacitores do substrato (o formato "polvo"). Coordenadas no plano XY, centradas. */
function am5Outline(a: number, corner: number, offset: number, halfW: number, depth: number) {
  const s = new THREE.Shape();
  type V = [number, number];
  const sides: { p: V; dir: V; n: V }[] = [
    { p: [-a, -a], dir: [1, 0], n: [0, 1] }, { p: [a, -a], dir: [0, 1], n: [-1, 0] },
    { p: [a, a], dir: [-1, 0], n: [0, -1] }, { p: [-a, a], dir: [0, -1], n: [1, 0] },
  ];
  const len = 2 * a, rr = Math.min(0.008, halfW * 0.5);
  sides.forEach((sd, i) => {
    const P = (t: number, k: number): V => [sd.p[0] + sd.dir[0] * t + sd.n[0] * k, sd.p[1] + sd.dir[1] * t + sd.n[1] * k];
    const start = P(corner, 0);
    if (i === 0) s.moveTo(...start); else s.lineTo(...start);
    for (const c of [len / 2 - offset, len / 2 + offset]) {
      s.lineTo(...P(c - halfW, 0)); s.lineTo(...P(c - halfW, depth - rr)); s.quadraticCurveTo(...P(c - halfW, depth), ...P(c - halfW + rr, depth));
      s.lineTo(...P(c + halfW - rr, depth)); s.quadraticCurveTo(...P(c + halfW, depth), ...P(c + halfW, depth - rr)); s.lineTo(...P(c + halfW, 0));
    }
    s.lineTo(...P(len - corner, 0));
    const end = P(len, 0), nx = sides[(i + 1) % 4];
    s.quadraticCurveTo(end[0], end[1], nx.p[0] + nx.dir[0] * corner, nx.p[1] + nx.dir[1] * corner);
  });
  return s;
}
/** Texto gravado na tampa: nome da marca e da linha em letra comum (sem logotipo) e o modelo embaixo. */
function am5LabelTexture(name: string) {
  const model = name.replace(/\bAMD\b|\bRyzen\b|Processor|with Radeon Graphics|\d+-Core|\(R\)|\(TM\)|™|®/gi, ' ').replace(/\s+/g, ' ').trim();
  const line = /threadripper/i.test(name) ? 'THREADRIPPER' : /athlon/i.test(name) ? 'ATHLON' : 'RYZEN';
  return canvasTex(1024, 1024, (c) => {
    c.clearRect(0, 0, 1024, 1024);
    c.fillStyle = '#4a4e55'; c.textBaseline = 'alphabetic';
    c.font = '800 250px "Segoe UI", "SF Pro Display", Helvetica, Arial, sans-serif'; c.fillText('AMD', 150, 470);
    c.font = '600 150px "Segoe UI", "SF Pro Display", Helvetica, Arial, sans-serif';
    let x = 160; for (const ch of line) { c.fillText(ch, x, 660); x += c.measureText(ch).width + 26; }
    if (model) { c.globalAlpha = 0.85; c.font = '500 96px "Segoe UI", "SF Pro Display", Helvetica, Arial, sans-serif'; c.fillText(model.slice(0, 18), 164, 800); }
  });
}
function amdCpuModel(opts: { name?: string; sub?: string; cores?: number }): Model {
  const g = new THREE.Group();
  const S = 0.42; // substrato quadrado (40 × 40 mm no real)
  const subTex = canvasTex(512, 512, (c) => {
    c.fillStyle = '#0f5c58'; c.fillRect(0, 0, 512, 512);
    c.fillStyle = 'rgba(160,220,210,0.10)'; for (let y = 3; y < 512; y += 6) for (let x = 3; x < 512; x += 6) c.fillRect(x, y, 1.4, 1.4);
  });
  const sub = slab(S, S, 0.012, 0.006, new THREE.MeshStandardMaterial({ map: subTex, metalness: 0.25, roughness: 0.55 })); sub.rotation.x = -Math.PI / 2; sub.position.y = 0.006; g.add(sub);
  const edge = slab(S + 0.002, S + 0.002, 0.002, 0.007, mat.gold()); edge.rotation.x = -Math.PI / 2; edge.position.y = 0.0005; g.add(edge);
  const tri = new THREE.Mesh(new THREE.CircleGeometry(0.012, 3), mat.gold()); tri.rotation.set(-Math.PI / 2, 0, Math.PI / 4); tri.position.set(-S * 0.455, 0.0125, S * 0.455); g.add(tri);
  // tampa metálica escovada no formato AM5
  const a = S * 0.465, offset = S * 0.2, halfW = S * 0.07, depth = S * 0.11;
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9cdd2, metalness: 1, roughness: 0.3 });
  const ihs = new THREE.Mesh(new THREE.ExtrudeGeometry(am5Outline(a, S * 0.06, offset, halfW, depth), { depth: 0.016, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3, curveSegments: 10 }), metal);
  ihs.rotation.x = -Math.PI / 2; ihs.position.y = 0.012; ihs.castShadow = true; g.add(ihs);
  const top = 0.012 + 0.016 + 0.003;
  // capacitores dentro dos recortes (fileiras douradas e cinza), como no substrato real
  const capA = mat.gold(), capB = mat.metal(0x7c8189, 0.35);
  const caps = (cx: number, cz: number, alongX: boolean) => {
    for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
      const w = alongX ? 0.011 : 0.007, d = alongX ? 0.007 : 0.011;
      const b = box(w, 0.005, d, (r + k) % 2 ? capA : capB);
      const u = (k - 1.5) * 0.016, v = (r - 0.5) * 0.016;
      b.position.set(cx + (alongX ? u : v), 0.0145, cz + (alongX ? v : u)); g.add(b);
    }
  };
  const inset = a - depth * 0.45;
  for (const o of [-offset, offset]) { caps(o, inset, true); caps(-inset, o, false); caps(inset, o, false); }
  // pequeno círculo de orientação na tampa (canto superior esquerdo)
  const pip = new THREE.Mesh(new THREE.RingGeometry(0.0045, 0.0065, 24), mat.dark(0x8a8f96, 0.4)); pip.rotation.x = -Math.PI / 2; pip.position.set(-a * 0.82, top + 0.0006, -a * 0.82); g.add(pip);
  // texto gravado
  const label = new THREE.Mesh(new THREE.PlaneGeometry(S * 0.7, S * 0.7), new THREE.MeshStandardMaterial({ map: am5LabelTexture(opts.name || 'AMD Ryzen'), transparent: true, metalness: 0.7, roughness: 0.45 }));
  label.rotation.x = -Math.PI / 2; label.position.set(0, top + 0.0008, 0.005); g.add(label);
  // contorno luminoso sob a tampa (carga e temperatura), igual ao modelo genérico
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0x3ddc97), emissiveIntensity: 1.2 });
  const glow = new THREE.Mesh(new THREE.TorusGeometry(1, 0.004, 6, 4, Math.PI * 2), glowMat); glow.rotation.set(-Math.PI / 2, 0, Math.PI / 4); glow.scale.set(S * 0.66, S * 0.66, 1); glow.position.y = 0.013; g.add(glow);
  return {
    group: g, focus: { distance: 0.95, target: [0, 0.02, 0], height: 0.55 },
    update(live, t) {
      const ld = live.load ?? 0.2; const tc = live.temps?.cpu;
      glowMat.emissive.copy(tc !== undefined ? tempColor(tc) : live.accent); glowMat.emissiveIntensity = 0.8 + ld * 3 + Math.sin(t * 3) * 0.2;
    },
  };
}
/** O nome do processador indica AMD? (Ryzen, Threadripper, Athlon ou "AMD") */
export const isAmdCpu = (name?: string) => /\b(amd|ryzen|threadripper|athlon)\b/i.test(name || '');

// ======================= PROCESSADOR =======================
export function cpuModel(opts: { name?: string; sub?: string; cores?: number } = {}): Model {
  if (isAmdCpu(opts.name)) return amdCpuModel(opts);
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
  const tex = labelTexture([{ text: (opts.name || 'PROCESSADOR').toUpperCase().slice(0, 22), size: 62 }, { text: opts.sub || '', size: 54 }, { text: opts.cores ? tr("{0} NÚCLEOS", opts.cores) : '', size: 48, alpha: 0.6 }], 1024, 900);
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
  // LEDs sempre na cor de destaque: a barra pulsa e as pastilhas variam só o brilho
  return { group: g, update(t: number, accent: THREE.Color, level: number, offset: number) { leds.update(t + offset, accent, 'accent', level); caps.forEach((m, i) => { m.emissive.copy(accent); m.emissiveIntensity = 0.9 + Math.sin(t * 2 + i * 0.7 + offset * 5) * 0.5; }); } };
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
// ======================= PLACA-MÃE AMD (AM5) =======================
// Placa de linha gamer para processadores AMD, com desenho próprio inspirado nas placas AM5 topo de linha:
// capa de I/O alta e inclinada com vidro iluminado, dissipadores grandes com aletas inclinadas, soquete AM5 com
// suporte e parafusos, coluna de capacitores, tampas grandes de M.2 com grafismo cromado e slots PCIe blindados.
// Não usa logotipos nem nomes de fabricantes: os textos e o emblema são do CleanCode.
function ioGlassTexture(accent: string) {
  return canvasTex(512, 1024, (c) => {
    c.fillStyle = '#05060a'; c.fillRect(0, 0, 512, 1024);
    // linhas verticais finas, do lilás no topo para a cor de destaque embaixo
    const gr = c.createLinearGradient(0, 0, 0, 1024); gr.addColorStop(0, '#c9bcff'); gr.addColorStop(0.55, '#7f6bff'); gr.addColorStop(1, accent);
    c.fillStyle = gr;
    for (let x = 96; x < 500; x += 9) { c.globalAlpha = 0.18 + ((x / 9) % 3) * 0.08; c.fillRect(x, 30, 3, 964); }
    c.globalAlpha = 1;
    // emblema hexagonal grande, com brilho
    c.strokeStyle = '#efeaff'; c.shadowColor = '#a99bff'; c.shadowBlur = 40; c.lineWidth = 26; c.lineJoin = 'round';
    const hx = (cx: number, cy: number, r: number) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.closePath(); c.stroke(); };
    hx(300, 470, 150); c.lineWidth = 16; hx(300, 470, 88);
    c.shadowBlur = 0;
    // nome na coluna da esquerda, letra por letra, bem discreto
    c.fillStyle = 'rgba(220,220,235,0.28)'; c.font = '300 58px "Segoe UI", "SF Pro Display", sans-serif'; c.textAlign = 'center';
    'CLEANCODE'.split('').forEach((ch, i) => c.fillText(ch, 46, 110 + i * 96));
  });
}
function chromeSwooshTexture() {
  return canvasTex(1024, 384, (c) => {
    const bg = c.createLinearGradient(0, 0, 0, 384); bg.addColorStop(0, '#1c1d21'); bg.addColorStop(1, '#0b0c0e'); c.fillStyle = bg; c.fillRect(0, 0, 1024, 384);
    // faixas cromadas em leque, desenho próprio
    for (let i = 0; i < 7; i++) {
      const g2 = c.createLinearGradient(200, 300, 820, 60); g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(0.45, `rgba(235,238,245,${0.55 + i * 0.05})`); g2.addColorStop(1, 'rgba(120,124,132,0.2)');
      c.fillStyle = g2; c.beginPath();
      const x0 = 180 + i * 70, y0 = 330, x1 = 560 + i * 45, y1 = 70 + i * 14;
      c.moveTo(x0, y0); c.quadraticCurveTo(x0 + 120, y0 - 120, x1, y1); c.lineTo(x1 + 26 - i * 2, y1 + 8); c.quadraticCurveTo(x0 + 150, y0 - 90, x0 + 40, y0); c.closePath(); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 0; y < 384; y += 3) c.fillRect(0, y, 1024, 1);
  });
}
function engravedTexture(text: string, w = 1024, h = 128, spacing = 18) {
  return canvasTex(w, h, (c) => {
    c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(225,228,234,0.85)'; c.font = '600 64px "Segoe UI", "SF Pro Display", sans-serif'; c.textBaseline = 'middle';
    let x = 30; for (const ch of text) { c.fillText(ch, x, h / 2); x += c.measureText(ch).width + spacing; }
  });
}
function amdBoardModel(opts: { dimms?: number; sticks?: number; cpu?: { name?: string; sub?: string; cores?: number } }): Model {
  const g = new THREE.Group();
  const W = 0.61, H = 0.49, z0 = 0.004;
  const pcb = slab(W, H, 0.008, 0.008, new THREE.MeshStandardMaterial({ map: pcbTexture('#08090b', 'rgba(60,66,76,0.4)', 9), metalness: 0.3, roughness: 0.6 })); g.add(pcb);
  const copper = slab(W + 0.003, H + 0.003, 0.004, 0.009, new THREE.MeshStandardMaterial({ color: 0xb36d2c, metalness: 0.85, roughness: 0.35 })); copper.position.z = -0.003; g.add(copper);
  const gloss = new THREE.MeshStandardMaterial({ color: 0x141519, metalness: 0.55, roughness: 0.32 });
  const satin = new THREE.MeshStandardMaterial({ color: 0x1d1f24, metalness: 0.6, roughness: 0.42 });
  const darker = mat.dark(0x0d0e11, 0.5), steel = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.22 });
  const add = (m: THREE.Object3D, x: number, y: number, z = z0) => { m.position.set(x, y, z); g.add(m); return m; };
  // capa do I/O alta e inclinada, com vidro iluminado
  add(extrude([[-0.305, -0.03], [-0.215, -0.03], [-0.17, 0.02], [-0.17, 0.245], [-0.305, 0.245]], 0.09, gloss, 0.004), 0, 0);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.5, roughness: 0.15, metalness: 0.2 });
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.118, 0.255), glassMat), -0.238, 0.106, z0 + 0.0955);
  add(box(0.004, 0.27, 0.004, steel), -0.177, 0.104, z0 + 0.095);
  // dissipadores dos reguladores: bloco de cima com aletas inclinadas e bloco vertical ao lado do soquete
  add(extrude([[-0.17, 0.165], [0.085, 0.165], [0.1, 0.18], [0.1, 0.245], [-0.17, 0.245]], 0.05, satin, 0.004), 0, 0);
  for (let i = 0; i < 4; i++) { const fin = box(0.075, 0.016, 0.014, gloss); fin.rotation.z = -0.42; add(fin, -0.12 + i * 0.058, 0.212, z0 + 0.058); }
  add(extrude([[-0.17, -0.005], [-0.118, -0.005], [-0.118, 0.165], [-0.17, 0.165]], 0.046, satin, 0.004), 0, 0);
  for (let i = 0; i < 8; i++) add(box(0.05, 0.002, 0.002, mat.metal(0x3a3e45, 0.4)), -0.144, 0.01 + i * 0.019, z0 + 0.051);
  // coluna de capacitores redondos e indutores em volta do soquete
  const capTop = mat.metal(0xb7bcc3, 0.3);
  for (let i = 0; i < 8; i++) {
    const c1 = cyl(0.0058, 0.0058, 0.012, darker, 18); c1.rotation.x = Math.PI / 2; add(c1, -0.104, 0.135 - i * 0.02, z0 + 0.006);
    const top = cyl(0.0045, 0.0045, 0.001, capTop, 18); top.rotation.x = Math.PI / 2; add(top, -0.104, 0.135 - i * 0.02, z0 + 0.0125);
  }
  for (let i = 0; i < 7; i++) add(rbox(0.015, 0.015, 0.011, 0.002, darker), -0.08 + i * 0.02, 0.148, z0 + 0.0055);
  // soquete AM5: base, placa de contatos, moldura de fixação, suporte com quatro parafusos e alavanca
  const sx = -0.03, sy = 0.06;
  add(box(0.118, 0.118, 0.004, mat.plastic(0x0b0b0d)), sx, sy, z0 + 0.002);
  const pads = new THREE.Mesh(new THREE.PlaneGeometry(0.072, 0.072), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c) => { c.fillStyle = '#3a3420'; c.fillRect(0, 0, 256, 256); c.fillStyle = '#c9a54a'; for (let y = 4; y < 256; y += 7) for (let x = 4; x < 256; x += 7) c.fillRect(x, y, 3, 3); }), metalness: 0.8, roughness: 0.4 })); add(pads, sx, sy, z0 + 0.0045);
  const fr = new THREE.Shape(); fr.moveTo(-0.05, -0.05); fr.lineTo(0.05, -0.05); fr.lineTo(0.05, 0.05); fr.lineTo(-0.05, 0.05); fr.lineTo(-0.05, -0.05);
  const fh = new THREE.Path(); fh.moveTo(-0.039, -0.039); fh.lineTo(0.039, -0.039); fh.lineTo(0.039, 0.039); fh.lineTo(-0.039, 0.039); fh.lineTo(-0.039, -0.039); fr.holes.push(fh);
  add(new THREE.Mesh(new THREE.ExtrudeGeometry(fr, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2 }), mat.dark(0x2a2c31, 0.3)), sx, sy, z0 + 0.004);
  for (const yy of [-1, 1]) {
    add(rbox(0.12, 0.022, 0.012, 0.004, gloss), sx, sy + yy * 0.064, z0 + 0.006);
    for (const xx of [-1, 1]) { const sc = cyl(0.0055, 0.0055, 0.006, steel, 20); sc.rotation.x = Math.PI / 2; add(sc, sx + xx * 0.045, sy + yy * 0.064, z0 + 0.014); }
  }
  add(cyl(0.0022, 0.0022, 0.11, steel, 12), sx + 0.058, sy - 0.004, z0 + 0.009);
  let socketCpu: Model | null = cpuModel(opts.cpu || { name: 'AMD Ryzen' });
  socketCpu.group.scale.setScalar(0.16); socketCpu.group.rotation.x = Math.PI / 2; add(socketCpu.group, sx, sy, z0 + 0.0055);
  // slots de memória (com pentes)
  const dimms = opts.dimms ?? 4, sticks = Math.min(dimms, opts.sticks ?? 2);
  const ramSticks: ReturnType<typeof ramStick>[] = [];
  for (let i = 0; i < dimms; i++) {
    const x = 0.125 + i * 0.017;
    add(box(0.008, 0.27, 0.009, mat.plastic(0x08090b)), x, 0.07, z0 + 0.004);
    add(box(0.009, 0.012, 0.012, mat.plastic(0x30343b)), x, 0.21, z0 + 0.006);
    const occupied = sticks >= dimms ? true : sticks === 1 ? i === 1 : sticks === 2 ? i % 2 === 1 : i < sticks;
    if (occupied) {
      const st = ramStick(); st.group.scale.setScalar(0.5);
      st.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
      st.group.position.set(x, 0.07, z0 + 0.008); g.add(st.group); ramSticks.push(st);
    }
  }
  // lateral direita: display de diagnóstico, botões, conector de 24 pinos e o de 8 pinos
  const dbgCanvas = document.createElement('canvas'); dbgCanvas.width = 128; dbgCanvas.height = 64;
  const dbgTex = new THREE.CanvasTexture(dbgCanvas); dbgTex.colorSpace = THREE.SRGBColorSpace;
  const drawDbg = (txt: string) => { const c = dbgCanvas.getContext('2d')!; c.fillStyle = '#000'; c.fillRect(0, 0, 128, 64); c.fillStyle = '#ff3b30'; c.font = '700 54px "SF Mono", Menlo, Consolas, monospace'; c.textAlign = 'center'; c.fillText(txt, 64, 52); dbgTex.needsUpdate = true; };
  drawDbg('A0');
  add(box(0.034, 0.02, 0.004, mat.plastic(0x050506)), 0.262, 0.225, z0 + 0.002);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.016), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveMap: dbgTex, emissiveIntensity: 1.4 })), 0.262, 0.225, z0 + 0.0045);
  const start = cyl(0.011, 0.011, 0.008, steel, 32); start.rotation.x = Math.PI / 2; add(start, 0.272, 0.19, z0 + 0.004);
  const startRing = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0012, 8, 32), mat.dark(0x2a2c31)); add(startRing, 0.272, 0.19, z0 + 0.008);
  const flex = cyl(0.007, 0.007, 0.006, mat.dark(0x202226, 0.3), 24); flex.rotation.x = Math.PI / 2; add(flex, 0.272, 0.162, z0 + 0.003);
  add(box(0.016, 0.07, 0.018, mat.plastic(0x0b0c0e)), 0.288, 0.06, z0 + 0.009);
  add(box(0.016, 0.028, 0.016, mat.plastic(0x0b0c0e)), 0.288, -0.012, z0 + 0.008);
  for (let i = 0; i < 6; i++) add(rbox(0.012, 0.012, 0.009, 0.002, darker), 0.24 + (i % 2) * 0.016, 0.12 - Math.floor(i / 2) * 0.03, z0 + 0.0045);
  // tampa de M.2 logo abaixo do soquete, com o nome gravado
  add(extrude([[-0.17, -0.008], [0.095, -0.008], [0.105, -0.02], [0.105, -0.045], [-0.17, -0.045]], 0.02, gloss, 0.003), 0, 0);
  const nameBand = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.016), new THREE.MeshBasicMaterial({ map: engravedTexture('CLEANCODE'), transparent: true }));
  add(nameBand, -0.01, -0.026, z0 + 0.0236);
  // slots PCIe blindados (aço com trilhos claros)
  const pcie = (y: number, len: number, x: number) => {
    add(box(len, 0.012, 0.012, mat.plastic(0x0a0a0c)), x, y, z0 + 0.006);
    add(box(len + 0.006, 0.017, 0.004, steel), x, y, z0 + 0.0125);
    add(box(len - 0.01, 0.004, 0.0015, mat.plastic(0xe9ebee)), x, y, z0 + 0.0148);
  };
  pcie(-0.062, 0.24, -0.03);
  // tampa grande com grafismo cromado e faixa com o nome
  add(extrude([[-0.27, -0.165], [0.2, -0.165], [0.2, -0.08], [-0.27, -0.08]], 0.022, gloss, 0.004), 0, 0);
  const swoosh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.072), new THREE.MeshStandardMaterial({ map: chromeSwooshTexture(), metalness: 0.75, roughness: 0.28 }));
  add(swoosh, -0.04, -0.124, z0 + 0.0265);
  add(extrude([[0.2, -0.165], [0.29, -0.165], [0.29, -0.08], [0.2, -0.08]], 0.016, satin, 0.003), 0, 0);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.012), new THREE.MeshBasicMaterial({ map: engravedTexture('CC · AM5', 1024, 128, 22), transparent: true }));
  add(tag, 0.245, -0.1, z0 + 0.0205);
  // faixa lateral esquerda (áudio) e o segundo slot PCIe
  add(extrude([[-0.305, -0.235], [-0.272, -0.235], [-0.272, -0.07], [-0.305, -0.07]], 0.024, satin, 0.003), 0, 0);
  pcie(-0.196, 0.22, -0.06);
  add(extrude([[-0.27, -0.235], [0.17, -0.235], [0.17, -0.212], [-0.27, -0.212]], 0.012, gloss, 0.003), 0, 0);
  // bateria da placa, conectores do rodapé e furos de fixação
  const coin = cyl(0.016, 0.016, 0.004, steel, 36); coin.rotation.x = Math.PI / 2; add(coin, 0.25, -0.212, z0 + 0.002);
  for (let i = 0; i < 6; i++) add(box(0.022, 0.008, 0.006, mat.plastic(0x15161a)), -0.02 + i * 0.04, -0.238, z0 + 0.003);
  for (const [x, y] of [[-0.285, 0.225], [0.285, 0.225], [-0.285, -0.225], [0.285, -0.225], [0.02, 0.225], [0.03, -0.225]]) add(new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0015, 8, 20), mat.metal(0xb9bec4)), x, y, z0 + 0.001);
  let lastAccent = '', lastDbg = '';
  return {
    group: g, focus: { distance: 1.25, target: [0, 0.245, 0], height: 0.42 }, orbit: { maxEl: 0.55, span: 0.95 },
    pois: [
      { at: [sx, sy, 0.012], d: 0.16, az: 0.1, el: 0.2 },          // processador no soquete
      { at: [0.15, 0.07, 0.03], d: 0.2, az: 0.45, el: 0.18 },      // memórias
      { at: [-0.04, 0.205, 0.06], d: 0.22, az: -0.2, el: 0.45 },   // dissipador com aletas
      { at: [-0.04, -0.124, 0.03], d: 0.22, az: 0.15, el: 0.3 },   // tampa com grafismo cromado
      { at: [0.268, 0.2, 0.008], d: 0.1, az: 0.3, el: 0.15 },      // display e botão de ligar
      { at: [-0.238, 0.11, 0.1], d: 0.22, az: -0.5, el: 0.15 },    // vidro iluminado do I/O
      { at: [-0.03, -0.062, 0.015], d: 0.2, az: 0.1, el: 0.3 },    // slot PCIe blindado
    ],
    update(live, t) {
      const hex = accentHex(live);
      if (hex !== lastAccent) { lastAccent = hex; glassMat.emissiveMap = ioGlassTexture(hex); glassMat.needsUpdate = true; }
      glassMat.emissiveIntensity = 1.25 + Math.sin(t * 1.4) * 0.3 + (live.load ?? 0) * 0.7;
      // o display mostra a temperatura do processador (ou o código de inicialização, sem leitura)
      const code = live.temps?.cpu !== undefined ? String(Math.min(99, Math.round(live.temps.cpu))) : 'A0';
      if (code !== lastDbg) { lastDbg = code; drawDbg(code); }
      ramSticks.forEach((st, i) => st.update(t, live.accent, 0.8, i * 0.1));
      socketCpu?.update?.(live, t, 0);
    },
  };
}

// ======================= PLACA-MÃE INTEL (BRANCA) =======================
// Placa branca e prateada de linha gamer para processadores Intel, com desenho próprio: capa de I/O alta com faixas
// de LED diagonais, dissipadores em blocos escalonados, soquete retangular com moldura metálica, tampas de M.2
// prateadas com faixas diagonais e uma tampa grande com aletas. Sem logotipos nem nomes de fabricantes.
function slashTexture(w = 512, h = 128, n = 4, bg = '#d7dade', fg = 'rgba(150,155,163,0.9)') {
  return canvasTex(w, h, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.05})`; c.fillRect(0, y, w, 1); }
    c.fillStyle = fg;
    for (let i = 0; i < n; i++) { const x = w * 0.55 + i * w * 0.08; c.beginPath(); c.moveTo(x, h); c.lineTo(x + w * 0.035, h); c.lineTo(x + w * 0.035 + h * 0.6, 0); c.lineTo(x + h * 0.6, 0); c.closePath(); c.fill(); }
  });
}
function finTexture() {
  return canvasTex(1024, 512, (c) => {
    c.fillStyle = '#d9dce0'; c.fillRect(0, 0, 1024, 512);
    for (let y = 0; y < 512; y += 2) { c.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`; c.fillRect(0, y, 1024, 1); }
    // aletas diagonais em leque na metade direita, desenho próprio
    for (let i = 0; i < 22; i++) {
      const x = 470 + i * 24, y0 = 470 - i * 6;
      const gr = c.createLinearGradient(x, y0, x + 120, y0 - 260); gr.addColorStop(0, 'rgba(120,125,133,0.15)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(150,155,163,0.5)');
      c.fillStyle = gr; c.beginPath(); c.moveTo(x, y0); c.lineTo(x + 12, y0); c.lineTo(x + 12 + 150, y0 - 300); c.lineTo(x + 150, y0 - 300); c.closePath(); c.fill();
    }
    c.strokeStyle = 'rgba(140,145,152,0.6)'; c.lineWidth = 3; c.beginPath(); c.moveTo(330, 512); c.lineTo(620, 0); c.stroke();
  });
}
function intelBoardModel(opts: { dimms?: number; sticks?: number; cpu?: { name?: string; sub?: string; cores?: number } }): Model {
  const g = new THREE.Group();
  const W = 0.61, H = 0.49, z0 = 0.004;
  const pcb = slab(W, H, 0.008, 0.008, new THREE.MeshStandardMaterial({ map: pcbTexture('#e3e5e8', 'rgba(140,146,156,0.45)', 9), metalness: 0.15, roughness: 0.6 })); g.add(pcb);
  const silver = new THREE.MeshStandardMaterial({ color: 0xdfe2e6, metalness: 0.8, roughness: 0.28 });
  const white = new THREE.MeshStandardMaterial({ color: 0xeef0f2, metalness: 0.35, roughness: 0.38 });
  const black = mat.dark(0x121316, 0.45), steel = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.22 });
  const add = (m: THREE.Object3D, x: number, y: number, z = z0) => { m.position.set(x, y, z); g.add(m); return m; };
  const tex = (m: THREE.Texture, w: number, h: number, x: number, y: number, z: number, mtl?: Partial<THREE.MeshStandardMaterialParameters>) =>
    add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: m, metalness: 0.7, roughness: 0.3, ...mtl })), x, y, z);
  // capa do I/O alta e prateada, com faixas de LED diagonais e o nome gravado na vertical
  add(extrude([[-0.305, -0.035], [-0.165, -0.035], [-0.165, 0.245], [-0.305, 0.245]], 0.085, silver, 0.004), 0, 0);
  add(extrude([[-0.255, -0.02], [-0.17, -0.02], [-0.17, 0.235], [-0.255, 0.235]], 0.093, white, 0.003), 0, 0);
  const ledMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveIntensity: 2 });
    const bar = box(0.05, 0.0045, 0.003, m); bar.rotation.z = -0.62; add(bar, -0.262, 0.15 - i * 0.026, z0 + 0.0905); ledMats.push(m);
  }
  const name = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.026), new THREE.MeshBasicMaterial({ map: engravedTexture('CLEANCODE', 1024, 128, 30), transparent: true, opacity: 0.55, color: 0x6c7178 }));
  name.rotation.z = Math.PI / 2; add(name, -0.29, 0.1, z0 + 0.0905);
  // dissipadores: blocos escalonados no topo e bloco com ranhuras ao lado do soquete
  add(extrude([[-0.165, 0.17], [0.04, 0.17], [0.04, 0.245], [-0.165, 0.245]], 0.05, white, 0.004), 0, 0);
  add(extrude([[0.04, 0.17], [0.095, 0.17], [0.095, 0.24], [0.04, 0.24]], 0.042, silver, 0.004), 0, 0);
  for (let i = 0; i < 3; i++) { const fin = box(0.06, 0.006, 0.01, silver); fin.rotation.z = -0.5; add(fin, -0.1 + i * 0.05, 0.205, z0 + 0.056); }
  add(extrude([[-0.165, -0.005], [-0.115, -0.005], [-0.115, 0.17], [-0.165, 0.17]], 0.046, white, 0.004), 0, 0);
  tex(slashTexture(256, 512, 3, '#eceef0', 'rgba(170,175,182,0.8)'), 0.046, 0.17, -0.14, 0.082, z0 + 0.0505, { metalness: 0.3, roughness: 0.4 });
  // indutores pretos em volta do soquete
  for (let i = 0; i < 7; i++) add(rbox(0.015, 0.015, 0.011, 0.002, black), -0.085 + i * 0.019, 0.148, z0 + 0.0055);
  for (let i = 0; i < 6; i++) add(rbox(0.015, 0.015, 0.011, 0.002, black), -0.1, 0.122 - i * 0.021, z0 + 0.0055);
  // soquete Intel: retangular, com placa de contatos, moldura metálica, parafusos e alavanca
  const sx = -0.03, sy = 0.06;
  add(box(0.112, 0.124, 0.004, mat.plastic(0xd0d3d7)), sx, sy, z0 + 0.002);
  const pads = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.082), new THREE.MeshStandardMaterial({ map: canvasTex(256, 300, (c) => { c.fillStyle = '#3a3420'; c.fillRect(0, 0, 256, 300); c.fillStyle = '#c9a54a'; for (let y = 4; y < 300; y += 7) for (let x = 4; x < 256; x += 7) c.fillRect(x, y, 3, 3); }), metalness: 0.8, roughness: 0.4 })); add(pads, sx, sy, z0 + 0.0045);
  const fr = new THREE.Shape(); fr.moveTo(-0.047, -0.054); fr.lineTo(0.047, -0.054); fr.lineTo(0.047, 0.054); fr.lineTo(-0.047, 0.054); fr.lineTo(-0.047, -0.054);
  const fh = new THREE.Path(); fh.moveTo(-0.037, -0.044); fh.lineTo(0.037, -0.044); fh.lineTo(0.037, 0.044); fh.lineTo(-0.037, 0.044); fh.lineTo(-0.037, -0.044); fr.holes.push(fh);
  add(new THREE.Mesh(new THREE.ExtrudeGeometry(fr, { depth: 0.005, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2 }), steel), sx, sy, z0 + 0.004);
  for (const [dx, dy] of [[-0.043, 0.058], [0.043, 0.058], [-0.043, -0.058], [0.043, -0.058]]) { const sc = cyl(0.005, 0.005, 0.005, steel, 18); sc.rotation.x = Math.PI / 2; add(sc, sx + dx, sy + dy, z0 + 0.008); }
  add(cyl(0.0022, 0.0022, 0.118, steel, 12), sx + 0.054, sy - 0.004, z0 + 0.009);
  const socketCpu: Model = cpuModel(opts.cpu || { name: 'Intel Core' });
  socketCpu.group.scale.setScalar(0.16); socketCpu.group.rotation.x = Math.PI / 2; add(socketCpu.group, sx, sy, z0 + 0.0055);
  // slots de memória pretos (com pentes)
  const dimms = opts.dimms ?? 4, sticks = Math.min(dimms, opts.sticks ?? 2);
  const ramSticks: ReturnType<typeof ramStick>[] = [];
  for (let i = 0; i < dimms; i++) {
    const x = 0.125 + i * 0.017;
    add(box(0.008, 0.27, 0.009, mat.plastic(0x08090b)), x, 0.07, z0 + 0.004);
    add(box(0.009, 0.012, 0.012, mat.plastic(0x30343b)), x, 0.21, z0 + 0.006);
    const occupied = sticks >= dimms ? true : sticks === 1 ? i === 1 : sticks === 2 ? i % 2 === 1 : i < sticks;
    if (occupied) {
      const st = ramStick(); st.group.scale.setScalar(0.5);
      st.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
      st.group.position.set(x, 0.07, z0 + 0.008); g.add(st.group); ramSticks.push(st);
    }
  }
  // lateral direita: capacitores pretos, display de diagnóstico, botões e conectores
  for (let i = 0; i < 10; i++) { const c1 = cyl(0.0055, 0.0055, 0.011, black, 18); c1.rotation.x = Math.PI / 2; add(c1, 0.235 + (i % 2) * 0.018, 0.15 - Math.floor(i / 2) * 0.026, z0 + 0.0055); }
  const dbgCanvas = document.createElement('canvas'); dbgCanvas.width = 128; dbgCanvas.height = 64;
  const dbgTex = new THREE.CanvasTexture(dbgCanvas); dbgTex.colorSpace = THREE.SRGBColorSpace;
  const drawDbg = (txt: string) => { const c = dbgCanvas.getContext('2d')!; c.fillStyle = '#000'; c.fillRect(0, 0, 128, 64); c.fillStyle = '#ff3b30'; c.font = '700 54px "SF Mono", Menlo, Consolas, monospace'; c.textAlign = 'center'; c.fillText(txt, 64, 52); dbgTex.needsUpdate = true; };
  drawDbg('A0');
  add(box(0.034, 0.02, 0.004, mat.plastic(0x050506)), 0.262, 0.225, z0 + 0.002);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.016), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveMap: dbgTex, emissiveIntensity: 1.4 })), 0.262, 0.225, z0 + 0.0045);
  const start = cyl(0.011, 0.011, 0.008, steel, 32); start.rotation.x = Math.PI / 2; add(start, 0.282, 0.19, z0 + 0.004);
  const flex = cyl(0.007, 0.007, 0.006, black, 24); flex.rotation.x = Math.PI / 2; add(flex, 0.282, 0.162, z0 + 0.003);
  add(box(0.016, 0.07, 0.018, mat.plastic(0x0b0c0e)), 0.29, 0.03, z0 + 0.009);
  // tampa de M.2 prateada logo abaixo do soquete, com faixas diagonais
  add(extrude([[-0.165, -0.008], [0.1, -0.008], [0.1, -0.045], [-0.165, -0.045]], 0.02, silver, 0.003), 0, 0);
  tex(slashTexture(1024, 128, 4), 0.26, 0.034, -0.032, -0.0265, z0 + 0.0236);
  // slots PCIe pretos com reforço metálico
  const pcie = (y: number, len: number, x: number, armor: boolean) => {
    add(box(len, 0.012, 0.012, mat.plastic(0x0a0a0c)), x, y, z0 + 0.006);
    if (armor) add(box(len + 0.006, 0.017, 0.004, steel), x, y, z0 + 0.0125);
  };
  pcie(-0.06, 0.12, -0.08, false);
  // tampa com o nome gravado (à direita) e a tampa grande com aletas
  add(extrude([[-0.02, -0.095], [0.27, -0.095], [0.27, -0.065], [-0.02, -0.065]], 0.02, silver, 0.003), 0, 0);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.014), new THREE.MeshBasicMaterial({ map: engravedTexture('CLEANCODE', 1024, 128, 24), transparent: true, opacity: 0.6, color: 0x5c6168 }));
  add(tag, 0.09, -0.08, z0 + 0.0236);
  pcie(-0.11, 0.24, -0.04, true);
  add(extrude([[-0.27, -0.205], [0.27, -0.205], [0.27, -0.125], [-0.27, -0.125]], 0.024, silver, 0.004), 0, 0);
  tex(finTexture(), 0.53, 0.076, 0, -0.165, z0 + 0.0285, { metalness: 0.75, roughness: 0.26 });
  pcie(-0.222, 0.22, -0.05, true);
  // painel pequeno iluminado na lateral esquerda e capacitores dourados de áudio
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.4 });
  add(box(0.03, 0.07, 0.006, white), -0.285, -0.075, z0 + 0.003);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.062), sideMat), -0.285, -0.075, z0 + 0.0065);
  for (let i = 0; i < 4; i++) { const cp = cyl(0.005, 0.005, 0.01, new THREE.MeshStandardMaterial({ color: 0xc89a3c, metalness: 0.9, roughness: 0.3 }), 16); cp.rotation.x = Math.PI / 2; add(cp, -0.28 + (i % 2) * 0.014, -0.2 - Math.floor(i / 2) * 0.014, z0 + 0.005); }
  for (let i = 0; i < 6; i++) add(box(0.022, 0.008, 0.006, mat.plastic(0x15161a)), -0.02 + i * 0.04, -0.238, z0 + 0.003);
  for (const [x, y] of [[-0.285, 0.225], [0.285, 0.225], [-0.285, -0.225], [0.285, -0.225], [0.02, 0.225], [0.03, -0.225]]) add(new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0015, 8, 20), mat.metal(0xb9bec4)), x, y, z0 + 0.001);
  let lastAccent = '', lastDbg = '';
  return {
    group: g, focus: { distance: 1.25, target: [0, 0.245, 0], height: 0.42 }, orbit: { maxEl: 0.55, span: 0.95 },
    pois: [
      { at: [sx, sy, 0.012], d: 0.16, az: 0.1, el: 0.2 },          // processador no soquete
      { at: [0.15, 0.07, 0.03], d: 0.2, az: 0.45, el: 0.18 },      // memórias
      { at: [-0.235, 0.1, 0.09], d: 0.22, az: -0.45, el: 0.15 },   // capa do I/O com as faixas de LED
      { at: [0, -0.165, 0.03], d: 0.24, az: 0.15, el: 0.3 },       // tampa grande com aletas
      { at: [0.27, 0.2, 0.008], d: 0.1, az: 0.3, el: 0.15 },       // display e botão de ligar
      { at: [-0.06, 0.2, 0.05], d: 0.2, az: -0.2, el: 0.45 },      // dissipadores do topo
      { at: [-0.04, -0.11, 0.015], d: 0.2, az: 0.1, el: 0.3 },     // slot PCIe blindado
    ],
    update(live, t) {
      const hex = accentHex(live);
      if (hex !== lastAccent) { lastAccent = hex; sideMat.emissiveMap = hexEmblemTexture(hex); sideMat.needsUpdate = true; }
      ledMats.forEach((m, i) => { m.emissive.copy(live.accent); m.emissiveIntensity = 1.6 + Math.sin(t * 2 - i * 0.6) * 0.6 + (live.load ?? 0) * 0.6; });
      sideMat.emissiveIntensity = 1.1 + Math.sin(t * 1.8) * 0.3;
      const code = live.temps?.cpu !== undefined ? String(Math.min(99, Math.round(live.temps.cpu))) : 'A0';
      if (code !== lastDbg) { lastDbg = code; drawDbg(code); }
      ramSticks.forEach((st, i) => st.update(t, live.accent, 0.8, i * 0.1));
      socketCpu.update?.(live, t, 0);
    },
  };
}

export function boardModel(opts: { dimms?: number; sticks?: number; mac?: boolean; cpu?: { name?: string; sub?: string; cores?: number } } = {}): Model {
  // desktop: placa AM5 preta para AMD e placa branca para Intel (e para os outros processadores)
  if (!opts.mac) return isAmdCpu(opts.cpu?.name) ? amdBoardModel(opts) : intelBoardModel(opts);
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
  // processador instalado no soquete: o mesmo modelo da aba Processador (mesmo nome gravado), em escala,
  // deitado na placa (o "topo" do modelo aponta para fora da placa)
  let socketCpu: Model | null = null;
  if (!opts.mac) {
    socketCpu = cpuModel(opts.cpu || {});
    socketCpu.group.scale.setScalar(0.16);
    socketCpu.group.rotation.x = Math.PI / 2;
    add(socketCpu.group, -0.03, 0.06, z0 + 0.0055);
  }
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
    group: g, focus: { distance: 1.25, target: [0, 0.245, 0], height: 0.42 }, orbit: { maxEl: 0.55, span: 0.95 },
    pois: [
      { at: [-0.03, 0.06, 0.012], d: 0.16, az: 0.1, el: 0.2 },    // processador no soquete
      { at: [0.145, 0.07, 0.03], d: 0.2, az: 0.45, el: 0.18 },    // memórias
      { at: [-0.05, 0.2, 0.05], d: 0.2, az: -0.2, el: 0.45 },     // dissipador dos reguladores
      { at: [0.215, -0.11, 0.03], d: 0.17, az: 0.3, el: 0.25 },   // chipset com emblema
      { at: [0.26, 0.215, 0.006], d: 0.1, az: 0.25, el: 0.15 },   // display de diagnóstico
      { at: [-0.25, 0.12, 0.08], d: 0.2, az: -0.55, el: 0.15 },   // painel de luz do I/O
      { at: [-0.02, -0.11, 0.015], d: 0.22, az: 0.15, el: 0.35 }, // slots PCIe e M.2
    ],
    update(live, t) {
      const hex = accentHex(live);
      if (hex !== lastAccent) { lastAccent = hex; lightMat.emissiveMap = lightPanelTexture(hex); emblemMat.emissiveMap = hexEmblemTexture(hex); lightMat.needsUpdate = true; emblemMat.needsUpdate = true; }
      lightMat.emissiveIntensity = 1.3 + Math.sin(t * 1.5) * 0.35 + (live.load ?? 0) * 0.8;
      emblemMat.emissiveIntensity = 1.2 + Math.sin(t * 2.2) * 0.3;
      ramSticks.forEach((s, i) => s.update(t, live.accent, 0.8, i * 0.1));
      socketCpu?.update?.(live, t, 0);
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
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshStandardMaterial({ map: labelTexture([{ text: (opts.label || 'NVMe SSD').toUpperCase().slice(0, 18), size: 70 }, { text: tr("M.2 2280 · PCIe"), size: 54, alpha: 0.6 }], 1024, 340, '#1d2026', '#cfd5dd'), metalness: 0.5, roughness: 0.4 }));
    lbl.rotation.x = -Math.PI / 2; lbl.position.set(-0.05, 0.0525, 0); g.add(lbl);
  } else if (kind === 'hdd') {
    const body = rbox(0.4, 0.1, 0.58, 0.01, mat.metal(0x8f959d, 0.4)); body.position.y = 0.05; g.add(body);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.5), new THREE.MeshStandardMaterial({ map: labelTexture([{ text: (opts.label || 'DISCO RÍGIDO').toUpperCase().slice(0, 18), size: 70 }, { text: tr("SATA · 3,5\""), size: 54, alpha: 0.6 }], 1024, 1400, '#d9dde2', '#2c3036'), metalness: 0.6, roughness: 0.4 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.101; g.add(top);
    activity = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0x3ddc97), emissiveIntensity: 2 });
  } else {
    const body = rbox(0.3, 0.028, 0.42, 0.012, kind === 'usb' ? mat.dark(0x1d2026, 0.4) : mat.metal(0x2f333a, 0.35)); body.position.y = 0.014; g.add(body);
    activity = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0x3ddc97), emissiveIntensity: 2 });
    const stripe = box(0.3, 0.004, 0.006, activity); stripe.position.set(0, 0.03, 0.21); g.add(stripe);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), new THREE.MeshStandardMaterial({ map: labelTexture([{ text: (opts.label || (kind === 'usb' ? 'DISCO EXTERNO' : 'SSD SATA')).toUpperCase().slice(0, 16), size: 72 }, { text: kind === 'usb' ? 'USB' : tr("SATA · 2,5\""), size: 56, alpha: 0.6 }], 1024, 1340, '#22262d', '#d5dbe3'), metalness: 0.4, roughness: 0.4 }));
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
  // notebook / Mac: módulo plano e técnico. Placa fina com trilhas, três células de bateria planas com o nível de
  // carga aceso, porta USB-C na borda, controlador de energia e o chip; a energia corre rente à placa.
  const plate = slab(0.82, 0.48, 0.008, 0.03, new THREE.MeshStandardMaterial({ map: pcbTexture('#08090b', 'rgba(80,96,110,0.32)', 21, 512), metalness: 0.35, roughness: 0.6 }), 0.002);
  plate.rotation.x = -Math.PI / 2; plate.position.y = 0.004; g.add(plate);
  const cellMat = new THREE.MeshStandardMaterial({ color: 0x2b2e34, metalness: 0.55, roughness: 0.42 });
  const fillMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0x3ddc97), emissiveIntensity: 1.4, transparent: true, opacity: 0.95 });
  const fills: THREE.Mesh[] = [];
  const CW = 0.17, CD = 0.3;
  for (let i = 0; i < 3; i++) {
    const x = -0.24 + i * (CW + 0.02);
    const cell = slab(CW, CD, 0.012, 0.012, cellMat, 0.002); cell.rotation.x = -Math.PI / 2; cell.position.set(x, 0.016, 0.02); g.add(cell);
    // faixa de nível (cresce a partir de baixo) com moldura
    const frame = slab(CW * 0.72, CD * 0.8, 0.001, 0.006, mat.dark(0x0b0c0e, 0.7), 0); frame.rotation.x = -Math.PI / 2; frame.position.set(x, 0.0228, 0.02); g.add(frame);
    const fill = box(CW * 0.66, 0.0012, CD * 0.74, fillMat); fill.position.set(x, 0.0236, 0.02); g.add(fill); fills.push(fill);
  }
  // porta USB-C na borda esquerda e o controlador de energia
  const port = rbox(0.02, 0.008, 0.05, 0.004, mat.metal(0x9aa1ab, 0.35)); port.position.set(-0.405, 0.012, -0.12); g.add(port);
  const pmic = rbox(0.06, 0.008, 0.06, 0.003, mat.dark(0x15171b, 0.4)); pmic.position.set(-0.3, 0.012, -0.16); g.add(pmic);
  const soc = rbox(0.11, 0.012, 0.11, 0.006, mat.metal(0xa7adb5, 0.35)); soc.position.set(0.33, 0.014, -0.12); g.add(soc);
  const socDie = box(0.07, 0.002, 0.07, mat.dark(0x101215, 0.3)); socDie.position.set(0.33, 0.021, -0.12); g.add(socDie);
  // caminhos de energia rentes à placa: porta → controlador → células → chip
  const P = (x: number, z: number) => new THREE.Vector3(x, 0.013, z);
  const line = (pts: THREE.Vector3[]) => new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
  const c1 = line([P(-0.395, -0.12), P(-0.36, -0.12), P(-0.34, -0.16), P(-0.33, -0.16)]);
  const c2 = line([P(-0.27, -0.16), P(-0.24, -0.16), P(-0.24, -0.15), P(-0.24, -0.13)]);
  const c3 = line([P(-0.27, -0.17), P(0.0, -0.2), P(0.2, -0.2), P(0.27, -0.13)]);
  const c4 = line([P(0.19, -0.13), P(0.22, -0.13), P(0.26, -0.12), P(0.275, -0.12)]);
  const fl = flows([c1, c2, c3, c4], 14); g.add(fl.group);
  return {
    group: g, focus: { distance: 1.25, target: [0, 0.02, 0], height: 0.62 },
    update(live, t, dt) {
      const lvl = live.battery ?? 0.8;
      fillMat.emissive.copy(lvl < 0.15 ? new THREE.Color(0xff4d4f) : live.accent); fillMat.emissiveIntensity = 1.1 + Math.sin(t * 2) * 0.2;
      // as três células enchem em sequência, como uma barra de 0 a 100%
      fills.forEach((f, i) => { const k = Math.max(0.03, Math.min(1, lvl * fills.length - i)); f.scale.set(1, 1, k); f.position.z = 0.02 + (CD * 0.74) * (1 - k) / 2; });
      const w = live.watts ?? 10; fl.update(dt, 0.15 + Math.min(1, w / 60) * 0.6, 3 + Math.min(14, w / 4), live.accent, false);
    },
  };
}

// ======================= PC MONTADO =======================
export function pcModel(opts: { sticks?: number; cpu?: { name?: string; sub?: string; cores?: number } } = {}): Model {
  const g = new THREE.Group();
  const W = 0.5, H = 0.5, D = 0.32;
  // Intel: gabinete branco de câmara dupla com vidro panorâmico escuro, tela vertical e lateral com faixas.
  // AMD: gabinete preto com vidro claro. Os LEDs seguem sempre a cor de destaque.
  const whiteCase = !isAmdCpu(opts.cpu?.name);
  const frameMat = whiteCase ? new THREE.MeshStandardMaterial({ color: 0xf1f2f4, metalness: 0.15, roughness: 0.45 }) : mat.dark(0x0d0e11, 0.45);
  const innerMat = mat.dark(0x101114, 0.5);
  let caseScreen: { mat: THREE.MeshStandardMaterial; draw: (live: Live) => void } | null = null;
  if (whiteCase) {
    const darkGlass = () => new THREE.MeshPhysicalMaterial({ color: 0x0b0c0f, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const ch = 0.1; // canto chanfrado de vidro (frente à direita), onde fica a tela
    // linhas recortadas em "L" aninhados: descem na vertical e viram na horizontal, deixando um canto liso (entrada de ar)
    const cutLines = (cornerX: number, cornerY: number, flip = false) => canvasTex(1024, 1024, (c) => {
      c.fillStyle = '#f1f2f4'; c.fillRect(0, 0, 1024, 1024);
      c.strokeStyle = '#141518'; c.lineWidth = 7; c.lineCap = 'butt';
      if (flip) { c.translate(1024, 0); c.scale(-1, 1); }
      for (let i = 0; ; i++) {
        const x = cornerX - i * 24, y = cornerY + i * 24;
        if (x < 40 || y > 990) break;
        c.beginPath(); c.moveTo(x, 40); c.lineTo(x, y); c.lineTo(990, y); c.stroke();
      }
    });
    const rim = (y: number, hh: number) => { const r = extrude([[-W / 2, -D / 2], [W / 2 - ch, -D / 2], [W / 2, -D / 2 + ch], [W / 2, D / 2], [-W / 2, D / 2]], hh, frameMat, 0.006); // girada para o plano do chão: y = -D/2 do desenho vira a frente (z = +D/2), onde fica o canto chanfrado
      r.rotation.x = -Math.PI / 2; r.position.set(0, y, 0); g.add(r); return r; };
    rim(0.0, 0.04); rim(H - 0.035, 0.035);
    {
      const pts: [number, number][] = [[-W / 2 + 0.012, -D / 2 + 0.012], [W / 2 - ch - 0.006, -D / 2 + 0.012], [W / 2 - 0.012, -D / 2 + ch + 0.006], [W / 2 - 0.012, D / 2 - 0.012], [-W / 2 + 0.012, D / 2 - 0.012]];
      const geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
      const pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) + W / 2) / W; uv[i * 2 + 1] = (pos.getY(i) + D / 2) / D; }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const topLines = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: cutLines(640, 300, true), metalness: 0.15, roughness: 0.45 }));
      topLines.rotation.x = -Math.PI / 2; topLines.position.y = H + 0.0075; g.add(topLines); // acima do chanfro de borda da moldura
    }
    for (const [x, z] of [[-W / 2 + 0.07, D / 2 - 0.06], [W / 2 - 0.07, D / 2 - 0.06], [-W / 2 + 0.07, -D / 2 + 0.06], [W / 2 - 0.07, -D / 2 + 0.06]]) { const f = rbox(0.08, 0.02, 0.05, 0.006, mat.dark(0x0c0d0f, 0.5)); f.position.set(x, -0.008, z); g.add(f); }
    const back = box(W, H - 0.07, 0.01, innerMat); back.position.set(0, H / 2, -D / 2); g.add(back);
    // lateral esquerda: o fundo do gabinete (traseira com a ventoinha e as tampas dos slots)
    const rearWall = box(0.012, H - 0.07, D, frameMat); rearWall.position.set(-W / 2, H / 2, 0); g.add(rearWall);
    const rearTex = canvasTex(1024, 1024, (c) => {
      c.fillStyle = '#f1f2f4'; c.fillRect(0, 0, 1024, 1024);
      // abertura (fica perto da bandeja da placa, à esquerda da textura)
      c.fillStyle = '#121316'; c.fillRect(30, 70, 430, 860);
      // conexões da placa-mãe (painel de I/O)
      c.fillStyle = '#2a2c31'; c.fillRect(60, 110, 150, 330);
      c.fillStyle = '#0a0a0c'; for (let r = 0; r < 9; r++) for (let k = 0; k < 2; k++) c.fillRect(78 + k * 64, 128 + r * 34, 44, 20);
      c.fillStyle = '#c9a54a'; c.beginPath(); c.arc(100, 420, 9, 0, Math.PI * 2); c.arc(150, 420, 9, 0, Math.PI * 2); c.fill();
      // grade da ventoinha traseira
      c.fillStyle = '#26282d'; for (let y = 110; y < 440; y += 26) for (let x = 250; x < 440; x += 26) c.fillRect(x, y, 16, 16);
      // tampas dos slots da placa de vídeo, com recortes diagonais
      for (let i = 0; i < 7; i++) {
        const y = 480 + i * 56; c.fillStyle = '#2a2c31'; c.fillRect(60, y, 370, 42);
        c.fillStyle = '#121316'; for (let x = 90; x < 410; x += 26) { c.beginPath(); c.moveTo(x, y + 36); c.lineTo(x + 12, y + 36); c.lineTo(x + 24, y + 6); c.lineTo(x + 12, y + 6); c.closePath(); c.fill(); }
      }
    });
    const rearPanel = new THREE.Mesh(new THREE.PlaneGeometry(D - 0.012, H - 0.075), new THREE.MeshStandardMaterial({ map: rearTex, metalness: 0.15, roughness: 0.5 }));
    rearPanel.rotation.y = -Math.PI / 2; rearPanel.position.set(-W / 2 - 0.0065, H / 2, 0); g.add(rearPanel);
    // lateral direita branca com faixas pretas
    const stripes = cutLines(700, 360);
    // painel branco com faixas atrás da bandeja da placa-mãe
    const side = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.01, H - 0.08), new THREE.MeshStandardMaterial({ map: stripes, metalness: 0.1, roughness: 0.5 })); side.rotation.y = Math.PI; side.position.set(0, H / 2, -D / 2 - 0.0065); g.add(side);
    // vidro panorâmico escuro: frente, canto chanfrado (com a tela) e lateral direita (ventoinhas ao lado da placa)
    const glassW = W - ch;
    const glassF = new THREE.Mesh(new THREE.PlaneGeometry(glassW, H - 0.075), darkGlass()); glassF.position.set(-W / 2 + glassW / 2, H / 2, D / 2 + 0.002); g.add(glassF);
    const glassR = new THREE.Mesh(new THREE.PlaneGeometry(D - ch, H - 0.075), darkGlass()); glassR.rotation.y = Math.PI / 2; glassR.position.set(W / 2 + 0.002, H / 2, -ch / 2); g.add(glassR);
    const scrW = ch * Math.SQRT2 - 0.012;
    // tela vertical no lado direito da frente (relógio, uso e temperatura na cor de destaque)
    const scrCanvas = document.createElement('canvas'); scrCanvas.width = 256; scrCanvas.height = 768;
    const scrTex = new THREE.CanvasTexture(scrCanvas); scrTex.colorSpace = THREE.SRGBColorSpace;
    const scrMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveMap: scrTex, emissiveIntensity: 1.15, roughness: 0.2 });
    // a tela fica no vidro do chanfro, virada para a frente e para a direita
    const corner = new THREE.Group(); corner.rotation.y = Math.PI / 4; corner.position.set(W / 2 - ch / 2 + 0.002, H / 2, D / 2 - ch / 2 + 0.002); g.add(corner);
    const bezel = box(scrW + 0.01, H - 0.075, 0.004, mat.dark(0x050506, 0.3)); corner.add(bezel);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(scrW, H - 0.09), scrMat); scr.position.z = 0.0025; corner.add(scr);
    caseScreen = { mat: scrMat, draw: (live: Live) => {
      const c = scrCanvas.getContext('2d')!; const ac = accentHex(live);
      c.fillStyle = '#07080b'; c.fillRect(0, 0, 256, 768);
      const gr = c.createLinearGradient(0, 0, 0, 768); gr.addColorStop(0, 'rgba(255,255,255,0.02)'); gr.addColorStop(1, ac + '33'); c.fillStyle = gr; c.fillRect(0, 0, 256, 768);
      const now = new Date(); c.fillStyle = '#f2f4f7'; c.textAlign = 'center';
      c.font = '700 66px "Segoe UI", "SF Pro Display", sans-serif'; c.fillText(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, 128, 110);
      c.font = '400 22px "Segoe UI", sans-serif'; c.globalAlpha = 0.7; c.fillText(now.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }), 128, 145); c.globalAlpha = 1;
      const ring = (cy: number, v: number, label: string) => { c.lineWidth = 14; c.strokeStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.arc(128, cy, 62, 0, Math.PI * 2); c.stroke(); c.strokeStyle = ac; c.beginPath(); c.arc(128, cy, 62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, Math.min(1, v))); c.stroke(); c.fillStyle = '#f2f4f7'; c.font = '700 34px "Segoe UI", sans-serif'; c.fillText(`${Math.round(v * 100)}%`, 128, cy + 12); c.font = '500 20px "Segoe UI", sans-serif'; c.globalAlpha = 0.7; c.fillText(label, 128, cy + 96); c.globalAlpha = 1; };
      ring(270, live.load ?? 0.2, 'CPU'); ring(480, live.gpu ?? 0.2, 'GPU');
      c.fillStyle = ac; c.font = '700 58px "Segoe UI", sans-serif'; c.fillText(live.temps?.cpu !== undefined ? `${Math.round(live.temps.cpu)}°` : '—', 128, 680);
      c.fillStyle = '#f2f4f7'; c.globalAlpha = 0.6; c.font = '500 18px "Segoe UI", sans-serif'; c.fillText('CLEANCODE', 128, 730); c.globalAlpha = 1;
      scrTex.needsUpdate = true;
    } };
    // piso em grade e portas frontais na moldura de baixo
    const grille = canvasTex(512, 256, (c) => { c.fillStyle = '#0b0c0e'; c.fillRect(0, 0, 512, 256); c.fillStyle = '#26282d'; for (let x = 8; x < 512; x += 22) c.fillRect(x, 0, 12, 256); });
    // contorno interno com o chanfro da frente à direita, para o piso e a tampa da fonte ficarem dentro do vidro
    const inner = (m: number): [number, number][] => [[-W / 2 + m, -D / 2 + m], [W / 2 - ch - m * 0.4, -D / 2 + m], [W / 2 - m, -D / 2 + ch + m * 0.4], [W / 2 - m, D / 2 - m], [-W / 2 + m, D / 2 - m]];
    const floorShape = new THREE.Shape(inner(0.012).map(([x, y]) => new THREE.Vector2(x, y)));
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(floorShape), new THREE.MeshStandardMaterial({ map: grille, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.041, 0); g.add(floor);
    for (const [i, w] of [[0, 0.006], [1, 0.012], [2, 0.014], [3, 0.012], [4, 0.006]] as [number, number][]) { const port = box(w, 0.01, 0.004, mat.dark(0x0a0a0c, 0.4)); port.position.set(W / 2 - ch - 0.13 + i * 0.022, 0.02, D / 2 + 0.002); g.add(port); }
    // cobertura da fonte
    const shroud = extrude(inner(0.014), 0.08, innerMat, 0.004); shroud.rotation.x = -Math.PI / 2; shroud.position.set(0, 0.045, 0); g.add(shroud);
  } else {
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
  }
  // placa-mãe na traseira
  const board = boardModel({ sticks: opts.sticks ?? 2, cpu: opts.cpu }); board.group.scale.setScalar(0.62); board.group.position.set(-0.04, 0.29, -D / 2 + 0.012); g.add(board.group);
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
    if (whiteCase) { f.group.scale.setScalar(0.82); f.group.position.set(0.198, 0.175 + i * 0.096, -D / 2 + 0.03); }
    else { f.group.rotation.y = -Math.PI / 2; f.group.position.set(W / 2 - 0.02, 0.16 + i * 0.12, 0.0); }
    g.add(f.group); sideFans.push(f);
    const rr = ledRing(whiteCase ? 0.045 : 0.055, 0.004); if (!whiteCase) rr.mesh.rotation.y = -Math.PI / 2; rr.mesh.position.copy(f.group.position); g.add(rr.mesh); rings.push(rr);
  }
  const rear = fan(0.05, { blades: 9 }); rear.group.position.set(-W / 2 + 0.07, 0.36, -D / 2 + 0.02); g.add(rear.group); sideFans.push(rear);
  const rr2 = ledRing(0.05, 0.004); rr2.mesh.position.copy(rear.group.position); g.add(rr2.mesh); rings.push(rr2);
  // faixa de LED na base do vidro
  // no gabinete branco, a faixa termina antes do chanfro com a tela
  const strip = ledStrip(whiteCase ? W - 0.15 : W - 0.04, 40, 0.004, 0.004); strip.group.position.set(whiteCase ? -0.05 : 0, 0.123, D / 2 - 0.01); g.add(strip.group);
  let lastShown = -1, screenTick = -1;
  return {
    group: g, focus: { distance: 1.55, target: [0, 0.25, 0], height: 0.42 },
    // zooms dentro do gabinete, olhando pelo vidro da frente
    pois: [
      { at: [-0.058, 0.327, -D / 2 + 0.06], d: 0.26, az: -0.15, el: 0.12 },  // bomba do water cooler com a temperatura
      { at: [0.05, 0.33, -D / 2 + 0.03], d: 0.24, az: 0.3, el: 0.18 },       // memórias
      { at: [-0.03, 0.15, -D / 2 + 0.1], d: 0.3, az: 0.2, el: 0.05 },        // placa de vídeo
      { at: [-0.02, H - 0.07, -0.02], d: 0.32, az: -0.1, el: 0.55 },         // ventoinhas e radiador do topo
      whiteCase ? { at: [0.198, 0.27, -D / 2 + 0.03], d: 0.3, az: 0.25, el: 0.15 } : { at: [W / 2 - 0.03, 0.28, 0], d: 0.34, az: -0.55, el: 0.2 }, // ventoinhas ao lado da placa (branco) ou da frente (preto)
      { at: [-0.12, 0.3, -D / 2 + 0.02], d: 0.3, az: 0.35, el: 0.25 },       // placa-mãe e painel de luz
      { at: [0, 0.12, D / 2 - 0.01], d: 0.26, az: 0.1, el: 0.25 },           // faixa de LED e cobertura da fonte
    ],
    update(live, t, dt) {
      const ld = live.load ?? 0.2; const speed = 4 + ld * 16;
      topFans.forEach((f) => f.spin(speed, dt)); sideFans.forEach((f) => f.spin(speed * 0.9, dt));
      rings.forEach((r, i) => r.update(t, i * 0.09, live.accent)); pumpRing.update(t, 0.5, live.accent);
      strip.update(t, live.accent, 'accent', 0.9);
      board.update?.(live, t, dt); gpu.update?.(live, t, dt);
      if (caseScreen && Math.floor(t * 2) !== screenTick) { screenTick = Math.floor(t * 2); caseScreen.draw(live); }
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
/** Tela do Mac: wallpaper escuro original (faixas de luz dobradas), barra de menu no topo e Dock embaixo.
 *  Sem logos de fabricante: o canto da barra de menu e a marca usam um símbolo neutro (anel com ponto). */
function macScreen(accent: string) {
  const W = 1600, H = 1040;
  return canvasTex(W, H, (c) => {
    // wallpaper: fundo quase preto com faixas largas e suaves, iluminadas pela borda
    c.fillStyle = '#030304'; c.fillRect(0, 0, W, H);
    const band = (path: (c: CanvasRenderingContext2D) => void, width: number) => {
      for (let k = 6; k >= 0; k--) {
        c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
        c.strokeStyle = `rgba(${150 + k * 12},${152 + k * 12},${160 + k * 12},${0.035 + (6 - k) * 0.018})`;
        c.lineWidth = width - k * (width / 9); c.filter = `blur(${k * 3}px)`;
        c.beginPath(); path(c); c.stroke(); c.restore();
      }
      c.save(); c.strokeStyle = 'rgba(5,5,7,0.96)'; c.lineWidth = width * 0.62; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); path(c); c.stroke(); c.restore();
    };
    band((c) => { c.moveTo(-80, 860); c.bezierCurveTo(260, 860, 300, 420, 620, 420); c.lineTo(1080, 420); c.bezierCurveTo(1260, 420, 1260, 700, 1080, 700); c.lineTo(760, 700); }, 150);
    band((c) => { c.moveTo(1700, 200); c.bezierCurveTo(1380, 200, 1380, 620, 1180, 840); c.bezierCurveTo(1060, 980, 860, 980, 700, 980); }, 120);
    band((c) => { c.moveTo(-60, 260); c.lineTo(420, 260); c.bezierCurveTo(560, 260, 560, 120, 700, 120); c.lineTo(1000, 120); }, 90);
    // leve toque da cor de destaque no centro
    const glow = c.createRadialGradient(W * 0.55, H * 0.55, 10, W * 0.55, H * 0.55, 700); glow.addColorStop(0, accent + '22'); glow.addColorStop(1, 'transparent'); c.fillStyle = glow; c.fillRect(0, 0, W, H);

    // barra de menu
    c.fillStyle = 'rgba(28,28,32,0.72)'; c.fillRect(0, 0, W, 38);
    c.fillStyle = 'rgba(255,255,255,0.92)'; c.textBaseline = 'middle';
    c.save(); c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 3.2; c.beginPath(); c.arc(34, 19, 9, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(34, 19, 3, 0, Math.PI * 2); c.fill(); c.restore();
    c.font = '700 21px -apple-system, "SF Pro Text", "Segoe UI", sans-serif'; c.fillText('CleanCode', 62, 20);
    c.font = '500 21px -apple-system, "SF Pro Text", "Segoe UI", sans-serif';
    let x = 186; for (const m of [tr('Arquivo'), tr('Editar'), tr('Visualizar'), tr('Janela'), tr('Ajuda')]) { c.fillText(m, x, 20); x += c.measureText(m).width + 30; }
    // ícones à direita: bateria, Wi-Fi, busca, controles e relógio
    const now = new Date();
    // dia da semana e mês curtos no idioma do app (ex.: "seg 24 nov", "Mon 24 Nov")
    const clock = `${now.toLocaleString(LOCALE, { weekday: 'short' }).replace('.', '')} ${now.getDate()} ${now.toLocaleString(LOCALE, { month: 'short' }).replace('.', '')}  ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    c.textAlign = 'right'; c.fillText(clock, W - 24, 20); c.textAlign = 'left';
    let rx = W - 24 - c.measureText(clock).width - 36;
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2.4;
    c.strokeRect(rx - 6, 12, 22, 14); c.fillRect(rx - 3, 15, 13, 8); c.fillRect(rx + 17, 16, 2.5, 6); rx -= 44; // controles
    c.beginPath(); c.arc(rx + 6, 18, 8, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(rx + 12, 24); c.lineTo(rx + 17, 29); c.stroke(); rx -= 44; // busca
    for (const r of [13, 8.5, 4]) { c.beginPath(); c.arc(rx + 8, 28, r, Math.PI * 1.22, Math.PI * 1.78); c.stroke(); } rx -= 50; // Wi-Fi
    c.strokeRect(rx, 12, 32, 15); c.fillRect(rx + 33, 16, 3, 7); c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillRect(rx + 3, 15, 22, 9); // bateria

    // Dock: barra de vidro com ícones genéricos
    const icons: [string, string, (x: number, y: number, s: number) => void][] = [
      ['#4b9dff', '#1f6fe0', (x, y, s) => { c.fillStyle = '#fff'; c.fillRect(x + s * 0.22, y + s * 0.3, s * 0.56, s * 0.42); c.fillStyle = '#9cc8ff'; c.fillRect(x + s * 0.22, y + s * 0.3, s * 0.24, s * 0.08); }], // pasta
      ['#35c3ff', '#0b83d9', (x, y, s) => { c.strokeStyle = '#fff'; c.lineWidth = s * 0.06; c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.28, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.ellipse(x + s / 2, y + s / 2, s * 0.12, s * 0.28, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(x + s * 0.22, y + s / 2); c.lineTo(x + s * 0.78, y + s / 2); c.stroke(); }], // navegador
      ['#5fd06a', '#1e9c3a', (x, y, s) => { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x + s / 2, y + s * 0.47, s * 0.28, s * 0.22, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(x + s * 0.33, y + s * 0.62); c.lineTo(x + s * 0.28, y + s * 0.76); c.lineTo(x + s * 0.46, y + s * 0.66); c.fill(); }], // mensagens
      ['#5aa0ff', '#2b5fe6', (x, y, s) => { c.fillStyle = '#fff'; c.fillRect(x + s * 0.2, y + s * 0.3, s * 0.6, s * 0.4); c.strokeStyle = '#2b5fe6'; c.lineWidth = s * 0.05; c.beginPath(); c.moveTo(x + s * 0.2, y + s * 0.3); c.lineTo(x + s / 2, y + s * 0.52); c.lineTo(x + s * 0.8, y + s * 0.3); c.stroke(); }], // e-mail
      ['#ffffff', '#e9e9ee', (x, y, s) => { c.fillStyle = '#ff3b30'; c.fillRect(x, y + s * 0.0, s, s * 0.26); c.fillStyle = '#222'; c.font = `700 ${s * 0.46}px -apple-system, sans-serif`; c.textAlign = 'center'; c.fillText(String(new Date().getDate()), x + s / 2, y + s * 0.64); c.textAlign = 'left'; }], // calendário
      ['#ff9f43', '#f36b1c', (x, y, s) => { const cols = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2']; cols.forEach((col, i) => { c.fillStyle = col; c.globalAlpha = 0.9; c.beginPath(); c.arc(x + s / 2 + Math.cos(i * Math.PI / 2) * s * 0.13, y + s / 2 + Math.sin(i * Math.PI / 2) * s * 0.13, s * 0.17, 0, Math.PI * 2); c.fill(); }); c.globalAlpha = 1; }], // fotos
      ['#fc5c7d', '#e1306c', (x, y, s) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(x + s * 0.42, y + s * 0.66, s * 0.1, 0, Math.PI * 2); c.fill(); c.fillRect(x + s * 0.5, y + s * 0.26, s * 0.05, s * 0.42); c.fillRect(x + s * 0.5, y + s * 0.26, s * 0.2, s * 0.06); }], // música
      ['#2c2c30', '#111114', (x, y, s) => { c.fillStyle = '#5ef08a'; c.font = `700 ${s * 0.32}px Menlo, monospace`; c.fillText('>_', x + s * 0.2, y + s * 0.55); }], // terminal
      ['#9aa0a8', '#5f656d', (x, y, s) => { c.strokeStyle = '#fff'; c.lineWidth = s * 0.07; c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.16, 0, Math.PI * 2); c.stroke(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; c.beginPath(); c.moveTo(x + s / 2 + Math.cos(a) * s * 0.22, y + s / 2 + Math.sin(a) * s * 0.22); c.lineTo(x + s / 2 + Math.cos(a) * s * 0.3, y + s / 2 + Math.sin(a) * s * 0.3); c.stroke(); } }], // ajustes
      [accent, '#0b3b2a', (x, y, s) => { c.strokeStyle = '#fff'; c.lineWidth = s * 0.08; c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.24, 0.4, Math.PI * 2 - 0.4); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.08, 0, Math.PI * 2); c.fill(); }], // CleanCode
    ];
    const S = 66, gap = 14, dw = icons.length * (S + gap) + gap, dx = (W - dw) / 2, dy = H - S - 34;
    c.fillStyle = 'rgba(60,60,68,0.42)'; c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(dx, dy - 12, dw, S + 24, 26); c.fill(); c.stroke();
    icons.forEach(([a, b, glyph], k) => {
      const x = dx + gap + k * (S + gap), y = dy;
      const g = c.createLinearGradient(x, y, x, y + S); g.addColorStop(0, a); g.addColorStop(1, b);
      c.save(); c.beginPath(); c.roundRect(x, y, S, S, S * 0.23); c.clip(); c.fillStyle = g; c.fillRect(x, y, S, S); glyph(x, y, S); c.restore();
      if (k === icons.length - 1) { c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(x + S / 2, y + S + 8, 2.6, 0, Math.PI * 2); c.fill(); }
    });
  });
}
/** Tela do notebook Windows: wallpaper original (ondas de luz em camadas, no tom da cor de destaque) e uma barra de
 *  tarefas genérica centralizada, com ícones e relógio. Sem logos de fabricante. */
function winScreen(accent: string) {
  const W = 1600, H = 1000;
  return canvasTex(W, H, (c) => {
    const bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#05070d'); bg.addColorStop(1, '#0b1020'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    // ondas sobrepostas, cada uma com degradê e borda iluminada
    const wave = (y0: number, amp: number, freq: number, phase: number, c1: string, c2: string, alpha: number) => {
      c.save(); c.globalAlpha = alpha;
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) c.lineTo(x, y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.3);
      c.lineTo(W, H); c.closePath();
      const gr = c.createLinearGradient(0, y0 - amp, 0, H); gr.addColorStop(0, c1); gr.addColorStop(1, c2); c.fillStyle = gr; c.fill();
      c.globalAlpha = alpha * 0.9; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; c.beginPath();
      for (let x = 0; x <= W; x += 8) { const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.3; if (x) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke(); c.restore();
    };
    wave(430, 70, 0.004, 0.6, '#2340ff55', '#05070d00', 0.9);
    wave(520, 60, 0.0052, 2.1, accent + '88', '#05070d00', 0.8);
    wave(610, 50, 0.0037, 4.0, '#7a3cff66', '#05070d00', 0.75);
    wave(700, 40, 0.006, 1.2, accent + '55', '#05070d00', 0.7);
    const glow = c.createRadialGradient(W * 0.5, H * 0.45, 20, W * 0.5, H * 0.45, 650); glow.addColorStop(0, 'rgba(255,255,255,0.06)'); glow.addColorStop(1, 'transparent'); c.fillStyle = glow; c.fillRect(0, 0, W, H);

    // barra de tarefas
    c.fillStyle = 'rgba(22,24,30,0.86)'; c.fillRect(0, H - 56, W, 56);
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(0, H - 56, W, 1);
    const icons: [string, string, (x: number, y: number, s: number) => void][] = [
      [accent, '#0b3b2a', (x, y, s) => { c.strokeStyle = '#fff'; c.lineWidth = s * 0.09; c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.26, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.08, 0, Math.PI * 2); c.fill(); }], // início (símbolo neutro)
      ['#3a3d46', '#262830', (x, y, s) => { c.strokeStyle = '#d8dbe2'; c.lineWidth = s * 0.08; c.beginPath(); c.arc(x + s * 0.45, y + s * 0.45, s * 0.2, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(x + s * 0.6, y + s * 0.6); c.lineTo(x + s * 0.76, y + s * 0.76); c.stroke(); }], // busca
      ['#f2c14e', '#e09a1f', (x, y, s) => { c.fillStyle = '#fff6d8'; c.fillRect(x + s * 0.2, y + s * 0.32, s * 0.6, s * 0.4); c.fillStyle = '#f7d77a'; c.fillRect(x + s * 0.2, y + s * 0.3, s * 0.25, s * 0.08); }], // pastas
      ['#35c3ff', '#0b83d9', (x, y, s) => { c.strokeStyle = '#fff'; c.lineWidth = s * 0.06; c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.28, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.ellipse(x + s / 2, y + s / 2, s * 0.12, s * 0.28, 0, 0, Math.PI * 2); c.stroke(); }], // navegador
      ['#5aa0ff', '#2b5fe6', (x, y, s) => { c.fillStyle = '#fff'; c.fillRect(x + s * 0.2, y + s * 0.3, s * 0.6, s * 0.4); c.strokeStyle = '#2b5fe6'; c.lineWidth = s * 0.05; c.beginPath(); c.moveTo(x + s * 0.2, y + s * 0.3); c.lineTo(x + s / 2, y + s * 0.52); c.lineTo(x + s * 0.8, y + s * 0.3); c.stroke(); }], // e-mail
      ['#8b5cf6', '#5b2fd6', (x, y, s) => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x + s * 0.35, y + s * 0.28); c.lineTo(x + s * 0.72, y + s * 0.5); c.lineTo(x + s * 0.35, y + s * 0.72); c.closePath(); c.fill(); }], // mídia
      ['#2c2c30', '#111114', (x, y, s) => { c.fillStyle = '#5ef08a'; c.font = `700 ${s * 0.32}px Consolas, Menlo, monospace`; c.fillText('>_', x + s * 0.2, y + s * 0.58); }], // terminal
      ['#9aa0a8', '#5f656d', (x, y, s) => { c.strokeStyle = '#fff'; c.lineWidth = s * 0.07; c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.16, 0, Math.PI * 2); c.stroke(); }], // ajustes
    ];
    const S = 38, gap = 14, total = icons.length * (S + gap) - gap, x0 = (W - total) / 2, y0 = H - 47;
    icons.forEach(([a, b, glyph], k) => {
      const x = x0 + k * (S + gap); const g = c.createLinearGradient(x, y0, x, y0 + S); g.addColorStop(0, a); g.addColorStop(1, b);
      c.save(); c.beginPath(); c.roundRect(x, y0, S, S, 9); c.clip(); c.fillStyle = g; c.fillRect(x, y0, S, S); glyph(x, y0, S); c.restore();
      if (k === 0 || k === 3) { c.fillStyle = k === 0 ? accent : 'rgba(255,255,255,0.6)'; c.beginPath(); c.roundRect(x + S / 2 - 6, y0 + S + 4, 12, 3, 2); c.fill(); }
    });
    // área de notificação: Wi-Fi, volume, bateria e relógio
    const now = new Date();
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.textAlign = 'right'; c.textBaseline = 'middle';
    c.font = '500 17px "Segoe UI", -apple-system, sans-serif'; c.fillText(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, W - 24, H - 38);
    c.font = '400 15px "Segoe UI", -apple-system, sans-serif'; c.fillText(now.toLocaleDateString(LOCALE), W - 24, H - 18);
    c.textAlign = 'left';
    let rx = W - 150; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2;
    c.strokeRect(rx, H - 36, 24, 12); c.fillRect(rx + 25, H - 33, 2.5, 6); c.fillRect(rx + 2, H - 34, 16, 8); rx -= 34;      // bateria
    c.beginPath(); c.moveTo(rx, H - 33); c.lineTo(rx + 6, H - 33); c.lineTo(rx + 12, H - 38); c.lineTo(rx + 12, H - 22); c.lineTo(rx + 6, H - 27); c.lineTo(rx, H - 27); c.closePath(); c.fill(); rx -= 34; // volume
    for (const r of [12, 8, 4]) { c.beginPath(); c.arc(rx + 9, H - 22, r, Math.PI * 1.22, Math.PI * 1.78); c.stroke(); }  // Wi-Fi
  });
}
export function laptopModel(opts: { mac?: boolean } = {}): Model {
  const g = new THREE.Group(); const mac = !!opts.mac;
  // proporções de um notebook de 14" (x2): MacBook ~ 312 x 221 x 15,5 mm
  const W = 0.62, D = 0.44, T = mac ? 0.019 : 0.02;
  const body = mac
    ? new THREE.MeshPhysicalMaterial({ color: 0x1e1f22, metalness: 0.92, roughness: 0.34, clearcoat: 0.25, clearcoatRoughness: 0.4 })
    : new THREE.MeshStandardMaterial({ color: 0x2a2c31, metalness: 0.72, roughness: 0.42 }); // alumínio grafite fosco
  const base = slab(W, D, T - 0.004, 0.026, body, 0.002); base.rotation.x = -Math.PI / 2; base.position.y = T / 2; g.add(base);
  // pés de borracha
  for (const [x, z] of [[-W * 0.42, -D * 0.4], [W * 0.42, -D * 0.4], [-W * 0.42, D * 0.4], [W * 0.42, D * 0.4]]) { const f = cyl(0.012, 0.012, 0.003, mat.dark(0x0a0a0b, 0.9), 20); f.position.set(x, -0.001, z); g.add(f); }
  // rebaixo do teclado (rente ao tampo) e teclas
  const well = slab(W * 0.82, D * 0.55, 0.002, 0.01, mat.dark(0x0b0b0c, 0.7), 0); well.rotation.x = -Math.PI / 2; well.position.set(0, T + 0.0006, -D * 0.166); g.add(well);
  const keyMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, metalness: 0.1, roughness: 0.62 });
  const kb = keyboard(mac ? 14 : 15, 6, mac ? 0.0295 : 0.0275, 0.0055, keyMat); kb.position.set(0, T + 0.0022, -D * 0.4); g.add(kb);
  // grades de alto-falante dos lados do teclado (MacBook)
  if (mac) {
    const holes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.001, 8), mat.dark(0x050505, 0.8), 2 * 30 * 6);
    const m4 = new THREE.Matrix4(); let k = 0;
    for (const sx of [-1, 1]) for (let r = 0; r < 30; r++) for (let c = 0; c < 6; c++) { m4.makeTranslation(sx * (W * 0.445) + (c - 2.5) * 0.0045, T + 0.0003, -D * 0.36 + r * 0.0065); holes.setMatrixAt(k++, m4); }
    g.add(holes);
  }
  // Windows: teclado com luz de fundo na cor de destaque (vaza entre as teclas), botão liga/desliga com leitor de
  // digital no canto e grade de ventilação entre o teclado e a dobradiça
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0x3ddc97), emissiveIntensity: 2.2 });
  const backlight = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0x3ddc97), emissiveIntensity: 0.8, transparent: true, opacity: 0.6 });
  if (!mac) {
    const kbW = 15 * (0.0275 + 0.0055), kbD = 6 * (0.0275 + 0.0055);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(kbW, kbD), backlight); glow.rotation.x = -Math.PI / 2; glow.position.set(0, T + 0.0019, -D * 0.4 + kbD / 2 - 0.0165); g.add(glow);
    const fp = rbox(0.022, 0.002, 0.02, 0.003, mat.dark(0x0a0a0b, 0.4)); fp.position.set(kbW / 2 + 0.02, T + 0.0022, -D * 0.4); g.add(fp);
    const fpRing = new THREE.Mesh(new THREE.TorusGeometry(0.0055, 0.0007, 8, 28), ledMat); fpRing.rotation.x = -Math.PI / 2; fpRing.position.set(kbW / 2 + 0.02, T + 0.0033, -D * 0.4); g.add(fpRing);
    const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0028, 0.001, 0.011), mat.dark(0x040404, 0.7), 60);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 60; i++) { m4.makeTranslation(-W * 0.3 + i * (W * 0.6 / 59), T + 0.0002, -D * 0.445); slots.setMatrixAt(i, m4); }
    g.add(slots);
  }
  // trackpad de vidro e entalhe frontal
  const pad = slab(mac ? W * 0.44 : W * 0.36, D * 0.25, 0.001, 0.014, new THREE.MeshPhysicalMaterial({ color: mac ? 0x26272b : 0x1c1d20, roughness: 0.22, clearcoat: 0.8 }), 0); pad.rotation.x = -Math.PI / 2; pad.position.set(0, T + 0.0007, D * 0.27); g.add(pad);
  if (mac) { const notchFront = slab(0.07, 0.008, T * 0.6, 0.004, mat.dark(0x101012, 0.5), 0); notchFront.position.set(0, T * 0.55, D / 2 + 0.0005); g.add(notchFront); }
  // portas laterais
  if (mac) {
    for (const [x, z, w] of [[-W / 2, -D * 0.25, 0.014], [-W / 2, -D * 0.18, 0.01], [-W / 2, -D * 0.12, 0.01], [W / 2, -D * 0.2, 0.01], [W / 2, -D * 0.1, 0.012]]) {
      const port = rbox(0.002, 0.005, w, 0.0015, mat.dark(0x040404, 0.6)); port.position.set(x, T * 0.5, z); g.add(port);
    }
  } else {
    // esquerda: energia (redonda), dois USB-C e HDMI; direita: dois USB-A, fone e leitor de cartão
    const hole = mat.dark(0x030303, 0.6), metalIn = mat.metal(0x8d939b, 0.35);
    const sidePort = (side: number, z: number, w: number, h: number, inner?: THREE.Material) => {
      const p = rbox(0.0024, h, w, Math.min(h, w) * 0.4, hole); p.position.set(side * W / 2, T * 0.5, z); g.add(p);
      if (inner) { const i = box(0.0026, h * 0.35, w * 0.7, inner); i.position.set(side * W / 2, T * 0.5, z); g.add(i); }
    };
    const pwr = cyl(0.003, 0.003, 0.0026, hole, 16); pwr.rotation.z = Math.PI / 2; pwr.position.set(-W / 2, T * 0.5, -D * 0.3); g.add(pwr);
    sidePort(-1, -D * 0.22, 0.009, 0.0034); sidePort(-1, -D * 0.16, 0.009, 0.0034);
    sidePort(-1, -D * 0.08, 0.015, 0.0055, metalIn);
    sidePort(1, -D * 0.24, 0.013, 0.0055, metalIn); sidePort(1, -D * 0.16, 0.013, 0.0055, metalIn);
    const jack = cyl(0.0018, 0.0018, 0.0026, hole, 14); jack.rotation.z = Math.PI / 2; jack.position.set(W / 2, T * 0.5, -D * 0.09); g.add(jack);
    sidePort(1, -D * 0.02, 0.022, 0.002);
    // saídas de ventilação nas laterais, perto da traseira
    for (const side of [-1, 1]) for (let i = 0; i < 9; i++) { const v = box(0.0024, T * 0.42, 0.0035, hole); v.position.set(side * W / 2, T * 0.5, -D * 0.44 + i * 0.006); g.add(v); }
    // LED de energia na frente
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0018, 0.001), ledMat); led.position.set(-W * 0.38, T * 0.55, D / 2 + 0.0003); g.add(led);
  }
  // tampa: dobradiça na traseira, aberta e fixa (~110°)
  const lid = new THREE.Group(); lid.position.set(0, T, -D / 2 + 0.004); lid.rotation.x = -0.34; g.add(lid);
  // marca neutra em baixo relevo nas costas da tampa (sem logo de fabricante)
  {
    const markMat = new THREE.MeshStandardMaterial({ color: 0x0d0e10, metalness: 0.5, roughness: 0.25 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0045, 12, 48, Math.PI * 2 - 0.8), markMat); ring.rotation.set(0, Math.PI, 0.4); ring.position.set(0, D * 0.5, -(mac ? 0.0075 : 0.009) - 0.0004); lid.add(ring);
    const dotM = cyl(0.008, 0.008, 0.001, markMat, 24); dotM.rotation.x = Math.PI / 2; dotM.position.set(0, D * 0.5, -(mac ? 0.0075 : 0.009) - 0.0004); lid.add(dotM);
  }
  const LT = mac ? 0.0075 : 0.009;
  const lidBody = slab(W, D * 0.96, LT - 0.003, 0.026, body, 0.0015); lidBody.position.set(0, D * 0.48, -LT / 2); lid.add(lidBody);
  const glass = slab(W * 0.992, D * 0.952, 0.0012, 0.022, new THREE.MeshPhysicalMaterial({ color: 0x030304, roughness: 0.08, clearcoat: 1 }), 0); glass.position.set(0, D * 0.48, 0.0007); lid.add(glass);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.0, roughness: 0.1 });
  screenMat.userData.matte = true; // a tela não entra na atenuação de brilho (precisa ser legível)
  // bordas finas nos dois: a tela ocupa quase toda a tampa
  const sw = mac ? W * 0.965 : W * 0.955, sh = mac ? D * 0.9 : D * 0.88, scrY = mac ? D * 0.475 : D * 0.483;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), screenMat); scr.position.set(0, scrY, 0.0016); lid.add(scr);
  if (mac) { const notch = slab(0.064, 0.014, 0.0005, 0.006, mat.dark(0x000000, 0.5), 0); notch.position.set(0, D * 0.475 + sh / 2 - 0.006, 0.0019); lid.add(notch); }
  else {
    // câmera com sensores infravermelhos na borda de cima
    const camY = scrY + sh / 2 + (D * 0.96 - scrY - sh / 2) / 2;
    const cam = cyl(0.0022, 0.0022, 0.001, mat.dark(0x000000, 0.2), 16); cam.rotation.x = Math.PI / 2; cam.position.set(0, camY, 0.0018); lid.add(cam);
    for (const dx of [-0.012, 0.012]) { const ir = cyl(0.0012, 0.0012, 0.001, mat.dark(0x120808, 0.3), 12); ir.rotation.x = Math.PI / 2; ir.position.set(dx, camY, 0.0018); lid.add(ir); }
  }
  // dobradiça embutida
  const hinge = cyl(T * 0.42, T * 0.42, W * 0.82, body, 32); hinge.rotation.z = Math.PI / 2; hinge.position.set(0, T * 0.9, -D / 2 + 0.006); g.add(hinge);
  let lastAccent = '';
  return {
    group: g, focus: { distance: 1.45, target: [0, 0.12, 0.02], height: 0.36 }, orbit: { auto: false, start: -0.45, keepWhole: true },
    // zooms grandes: pontos da tampa acompanham a abertura (função = posição no mundo na hora do zoom)
    pois: [
      { at: () => lid.localToWorld(new THREE.Vector3(0, mac ? D * 0.475 : D * 0.49, 0.002)), d: 0.42, az: 0, el: 0.16 },               // tela inteira, de frente
      { at: () => lid.localToWorld(new THREE.Vector3(-sw * 0.3, scrY + sh / 2 - 0.012, 0.002)), d: 0.16, az: -0.18, el: 0.14 }, // barra de menu
      { at: () => lid.localToWorld(new THREE.Vector3(0, scrY - sh / 2 + 0.03, 0.002)), d: 0.2, az: 0.12, el: 0.1 },            // Dock / barra de tarefas
      { at: () => lid.localToWorld(new THREE.Vector3(0, scrY + sh / 2 - 0.004, 0.002)), d: 0.11, az: 0, el: 0.12 },           // notch e câmera
      { at: [0, T, -D * 0.25], d: 0.3, az: 0.15, el: 0.78 },        // teclado de cima
      { at: [W * 0.18, T, -D * 0.3], d: 0.14, az: 0.45, el: 0.5 },   // teclas bem de perto
      { at: [-W * 0.2, T, -D * 0.22], d: 0.15, az: -0.5, el: 0.42 }, // teclas, lado esquerdo
      { at: [0, T, D * 0.27], d: 0.24, az: -0.2, el: 0.62 },         // trackpad
      { at: [-W / 2, T * 0.5, -D * 0.18], d: 0.17, az: -1.42, el: 0.12 }, // portas da esquerda
      { at: [W / 2, T * 0.5, -D * 0.15], d: 0.17, az: 1.42, el: 0.12 },   // portas da direita
    ],
    update(live, t) {
      const hex = accentHex(live);
      if (hex !== lastAccent) { lastAccent = hex; screenMat.emissiveMap?.dispose(); screenMat.emissiveMap = mac ? macScreen(hex) : winScreen(hex); screenMat.needsUpdate = true; }
      screenMat.emissiveIntensity = 0.82;
      if (!mac) { backlight.emissive.copy(live.accent); backlight.emissiveIntensity = 0.7 + Math.sin(t * 1.2) * 0.12; ledMat.emissive.copy(live.accent); }
      // tampa: abre e fecha devagar entre ~110° e ~62°, sem fechar (ciclo de ~16 s, parando suave nas pontas)
      const k = (1 - Math.cos(t * (Math.PI * 2 / 16))) / 2;
      lid.rotation.x = -0.34 + k * 0.82;
    },
  };
}
