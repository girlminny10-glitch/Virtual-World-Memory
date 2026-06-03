import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

// ─── Types ────────────────────────────────────────────────────────────────────
type Pos = { x: number; z: number };
type Outfit = { top: string; bottom: string; hair: string; accessory: string };
type NpcState = {
  id: string; name: string; color: string; gender: "female" | "male";
  position: Pos; targetPosition?: Pos; emotion: string; personality: string;
  currentAction?: string; outfit: Outfit;
  relationships?: Record<string, { bond: number; reason: string }>;
};
type WorldObject = {
  id: string; type: string; position: Pos; creator: string;
  creatorColor: string; description: string; color?: string; scale?: number;
};
type ChatMsg = { id: string; from: "player" | "npc"; text: string; color?: string; name?: string; forMe?: boolean };
type ConvFeed = { fromName: string; fromColor: string; toName: string; toColor: string; message: string; response: string; ts: number };
type Toast = { id: string; text: string; color: string };
type DrawCmd = { type: "line" | "circle" | "rect" | "clear"; x?: number; y?: number; x2?: number; y2?: number; color?: string; size?: number; fill?: boolean };

const WS_URL = window.location.origin.replace(/^http/, "ws") + "/ws";
const WORLD_SIZE = 300;
const DRAW_CANVAS_TTL = 30 * 60 * 1000; // 30 mins

const OBJECT_TYPES = [
  { id: "house", label: "🏠 Casa" }, { id: "tower", label: "🗼 Torre" }, { id: "fountain", label: "⛲ Fonte" },
  { id: "garden", label: "🌸 Jardim" }, { id: "monument", label: "🗿 Monumento" }, { id: "chair", label: "🪑 Cadeira" },
  { id: "table", label: "🪵 Mesa" }, { id: "lamp_post", label: "🔦 Poste" }, { id: "arch", label: "🌈 Arco" },
  { id: "pyramid", label: "🔺 Pirâmide" }, { id: "totem", label: "🎭 Totem" }, { id: "well", label: "🪣 Poço" },
  { id: "bench", label: "🪑 Banco" }, { id: "crystal", label: "💎 Cristal" }, { id: "portal", label: "🌀 Portal" },
  { id: "statue", label: "🗽 Estátua" }, { id: "painting", label: "🖼 Quadro" }, { id: "car", label: "🚗 Carro" },
  { id: "boat", label: "⛵ Barco" }, { id: "tree", label: "🌲 Árvore" }, { id: "rock", label: "🪨 Pedra" },
  { id: "fence", label: "🚧 Cerca" }, { id: "gate", label: "🚪 Portão" }, { id: "swing", label: "🎠 Balanço" },
  { id: "mushroom", label: "🍄 Cogumelo" }, { id: "star_monument", label: "⭐ Estrela" },
  { id: "flower_bed", label: "🌻 Canteiro" }, { id: "bridge", label: "🌉 Ponte" }, { id: "dome", label: "🔮 Domo" },
  { id: "spiral", label: "🌀 Espiral" }, { id: "cube_art", label: "🧊 Cubo" }, { id: "sphere_art", label: "🔵 Esfera" },
  { id: "obelisk", label: "🏛 Obelisco" }, { id: "cabin", label: "🛖 Cabana" }, { id: "lighthouse", label: "🗼 Farol" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(" ");
  let line = "";
  let lines = 0;
  for (const w of words) {
    const test = line + w + " ";
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w + " "; y += lh; lines++;
      if (lines >= 4) break;
    } else { line = test; }
  }
  if (lines < 4) ctx.fillText(line, x, y);
}

function makeSpeechSprite(text: string, color = "#ffffff", emote = ""): THREE.Sprite {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "rgba(5,5,20,0.9)";
  ctx.beginPath(); ctx.roundRect(0, 0, 512, 128, 14); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(1, 1, 510, 126, 14); ctx.stroke();
  if (emote) {
    ctx.font = "28px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(emote, 12, 44);
  }
  ctx.font = "bold 20px sans-serif";
  ctx.fillStyle = "#ffffff"; ctx.textAlign = "left";
  wrapText(ctx, text, emote ? 50 : 14, 38, emote ? 450 : 488, 26);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(7, 1.8, 1);
  return sp;
}

function makeEmoteSprite(emote: string): THREE.Sprite {
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 64;
  const ctx = cv.getContext("2d")!;
  ctx.font = "44px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(emote, 32, 36);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.2, 1.2, 1);
  return sp;
}

function createCharacter(color: string | number, gender: "female" | "male", isSelf = false): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  const mat = new THREE.MeshLambertMaterial({ color: c });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xf4c2a1 });
  const hairCol = isSelf ? 0x3d1c02 : Math.random() > 0.5 ? 0x1a0a00 : 0xd4a017;
  const hairMat = new THREE.MeshLambertMaterial({ color: hairCol });

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8);
  const legMat = new THREE.MeshLambertMaterial({ color: gender === "female" ? 0xff99bb : 0x334466 });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.17, 0.35, 0); legL.castShadow = true; g.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.17, 0.35, 0); legR.castShadow = true; g.add(legR);

  if (gender === "female") {
    // Skirt/dress
    const skirtGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.6, 12);
    const skirtMat = new THREE.MeshLambertMaterial({ color: c });
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    skirt.position.set(0, 0.9, 0); skirt.castShadow = true; g.add(skirt);
    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.7, 10), mat);
    torso.position.set(0, 1.45, 0); torso.castShadow = true; g.add(torso);
  } else {
    // Torso (broader)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.75, 0.42), mat);
    torso.position.set(0, 1.35, 0); torso.castShadow = true; g.add(torso);
  }

  // Arms
  const armGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.65, 8);
  const armL = new THREE.Mesh(armGeo, mat);
  armL.position.set(gender === "female" ? -0.42 : -0.48, 1.35, 0); armL.rotation.z = 0.2; armL.castShadow = true; g.add(armL);
  const armR = new THREE.Mesh(armGeo, mat);
  armR.position.set(gender === "female" ? 0.42 : 0.48, 1.35, 0); armR.rotation.z = -0.2; armR.castShadow = true; g.add(armR);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 8), skinMat);
  neck.position.set(0, 1.82, 0); g.add(neck);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), skinMat);
  head.position.set(0, 2.22, 0); head.castShadow = true; g.add(head);

  // Eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeGeo = new THREE.SphereGeometry(0.055, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.1, 2.25, 0.28); g.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.1, 2.25, 0.28); g.add(eyeR);

  // Hair
  if (gender === "female") {
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
    hairTop.position.set(0, 2.22, 0); g.add(hairTop);
    const hairBack = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.7, 8), hairMat);
    hairBack.position.set(0, 1.9, -0.22); g.add(hairBack);
  } else {
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
    hairTop.position.set(0, 2.22, 0); g.add(hairTop);
  }

  // Self indicator glow ring
  if (isSelf) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6 })
    );
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  }

  return g;
}

function spawnWorldObject(obj: WorldObject, scene: THREE.Scene, objsRef: Record<string, THREE.Group>) {
  if (objsRef[obj.id]) return;
  const group = new THREE.Group();
  group.position.set(obj.position.x, 0, obj.position.z);
  const col = new THREE.Color(obj.color ?? obj.creatorColor ?? "#88aaff");
  const sc = obj.scale ?? 1;
  const m = (c: THREE.Color | number | string) => new THREE.MeshLambertMaterial({ color: c });

  const t = obj.type;
  if (t === "house" || t === "cabin") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(4 * sc, 3 * sc, 4 * sc), m(t === "cabin" ? 0x8B5E3C : col));
    base.position.y = 1.5 * sc; base.castShadow = true; base.receiveShadow = true; group.add(base);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2 * sc, 2 * sc, 4), m(0x884422));
    roof.position.y = (3 + 1) * sc; roof.rotation.y = Math.PI / 4; roof.castShadow = true; group.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8 * sc, 1.5 * sc, 0.1), m(0x442211));
    door.position.set(0, 0.75 * sc, 2.01 * sc); group.add(door);
  } else if (t === "tower" || t === "lighthouse" || t === "obelisk") {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(t === "obelisk" ? 0.6 : 1.4 * sc, t === "obelisk" ? 0.9 : 2 * sc, t === "obelisk" ? 10 * sc : 9 * sc, t === "obelisk" ? 4 : 10), m(t === "lighthouse" ? 0xffffff : col));
    base.position.y = 4.5 * sc; base.castShadow = true; group.add(base);
    const top = new THREE.Mesh(new THREE.SphereGeometry(t === "obelisk" ? 0.5 : 1.5 * sc, 12, 12), m(t === "lighthouse" ? 0xff4400 : 0x4466aa));
    top.position.y = 9.5 * sc; group.add(top);
  } else if (t === "fountain") {
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.5 * sc, 2 * sc, 0.6 * sc, 16), m(0xcccccc));
    basin.position.y = 0.3 * sc; group.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.2 * sc, 2.2 * sc, 0.3 * sc, 16), new THREE.MeshLambertMaterial({ color: 0x44aaff, transparent: true, opacity: 0.75 }));
    water.position.y = 0.6 * sc; group.add(water);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * sc, 0.3 * sc, 1.5 * sc, 8), m(0xcccccc));
    pillar.position.y = 1.1 * sc; group.add(pillar);
  } else if (t === "garden" || t === "flower_bed") {
    for (let i = 0; i < 14; i++) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), m(0x226622));
      const ox = (Math.random() - 0.5) * 5 * sc, oz = (Math.random() - 0.5) * 5 * sc;
      stem.position.set(ox, 0.25, oz); group.add(stem);
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.22 * sc, 8, 8), new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.9, 0.6) }));
      flower.position.set(ox, 0.55, oz); flower.castShadow = true; group.add(flower);
    }
  } else if (t === "monument" || t === "star_monument") {
    const base2 = new THREE.Mesh(new THREE.BoxGeometry(1.2 * sc, 5 * sc, 1.2 * sc), m(0x444444));
    base2.position.y = 2.5 * sc; base2.castShadow = true; group.add(base2);
    const top2 = new THREE.Mesh(t === "star_monument" ? new THREE.OctahedronGeometry(1 * sc) : new THREE.TorusKnotGeometry(0.7 * sc, 0.22 * sc, 64, 8), m(0xffdd44));
    top2.position.y = 5.5 * sc; top2.castShadow = true; group.add(top2);
  } else if (t === "arch") {
    const leftPil = new THREE.Mesh(new THREE.BoxGeometry(0.6 * sc, 4 * sc, 0.6 * sc), m(col));
    leftPil.position.set(-1.8 * sc, 2 * sc, 0); leftPil.castShadow = true; group.add(leftPil);
    const rightPil = leftPil.clone(); rightPil.position.set(1.8 * sc, 2 * sc, 0); group.add(rightPil);
    const top3 = new THREE.Mesh(new THREE.BoxGeometry(4.2 * sc, 0.6 * sc, 0.6 * sc), m(col));
    top3.position.set(0, 4.3 * sc, 0); top3.castShadow = true; group.add(top3);
  } else if (t === "pyramid") {
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(3 * sc, 5 * sc, 4), m(col));
    pyr.position.y = 2.5 * sc; pyr.rotation.y = Math.PI / 4; pyr.castShadow = true; group.add(pyr);
  } else if (t === "totem") {
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * sc, 0.6 * sc, 1.2 * sc, 6), new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(i * 0.33, 0.8, 0.5) }));
      seg.position.y = 0.6 + i * 1.3; seg.castShadow = true; group.add(seg);
    }
  } else if (t === "well") {
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1 * sc, 0.3 * sc, 8, 20), m(0x888888));
    ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.5 * sc; group.add(ring2);
    const pillar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * sc, 0.15 * sc, 2 * sc, 8), m(0x664422));
    pillar2.position.set(0, 2 * sc, 0); group.add(pillar2);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.5 * sc, 0.2 * sc, 0.2 * sc), m(0x664422));
    crossbar.position.y = 2.8 * sc; group.add(crossbar);
  } else if (t === "bench") {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.5 * sc, 0.18 * sc, 0.8 * sc), m(0x885533));
    seat.position.y = 0.7 * sc; seat.castShadow = true; group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.5 * sc, 0.9 * sc, 0.12 * sc), m(0x885533));
    back.position.set(0, 1.2 * sc, -0.34 * sc); group.add(back);
    for (let li = -1; li <= 1; li += 2) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14 * sc, 0.7 * sc, 0.7 * sc), m(0x664422));
      leg.position.set(li * 1.0 * sc, 0.35 * sc, 0); group.add(leg);
    }
  } else if (t === "chair") {
    const cseat = new THREE.Mesh(new THREE.BoxGeometry(1 * sc, 0.12 * sc, 1 * sc), m(col));
    cseat.position.y = 0.7 * sc; group.add(cseat);
    const cback = new THREE.Mesh(new THREE.BoxGeometry(1 * sc, 0.9 * sc, 0.1 * sc), m(col));
    cback.position.set(0, 1.2 * sc, -0.45 * sc); group.add(cback);
    for (const [lx, lz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
      const cleg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7 * sc, 6), m(col));
      cleg.position.set(lx * sc, 0.35 * sc, lz * sc); group.add(cleg);
    }
  } else if (t === "table") {
    const top4 = new THREE.Mesh(new THREE.BoxGeometry(3 * sc, 0.15 * sc, 1.8 * sc), m(col));
    top4.position.y = 1.1 * sc; group.add(top4);
    for (const [lx, lz] of [[-1.3, -0.7], [1.3, -0.7], [-1.3, 0.7], [1.3, 0.7]]) {
      const tleg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1 * sc, 6), m(col));
      tleg.position.set(lx * sc, 0.55 * sc, lz * sc); group.add(tleg);
    }
  } else if (t === "lamp_post") {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5 * sc, 8), m(0x444444));
    post.position.y = 2.5 * sc; group.add(post);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35 * sc, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffaa }));
    lamp.position.y = 5.2 * sc; group.add(lamp);
  } else if (t === "crystal") {
    for (let i = 0; i < 5; i++) {
      const cry = new THREE.Mesh(new THREE.OctahedronGeometry((0.3 + Math.random() * 0.4) * sc), new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.8 }));
      cry.position.set((Math.random() - 0.5) * 2, 0.5 + i * 0.5, (Math.random() - 0.5) * 2);
      cry.rotation.set(Math.random(), Math.random(), Math.random()); cry.castShadow = true; group.add(cry);
    }
  } else if (t === "portal") {
    const ring3 = new THREE.Mesh(new THREE.TorusGeometry(1.8 * sc, 0.22 * sc, 12, 40), m(col));
    ring3.position.y = 2 * sc; ring3.castShadow = true; group.add(ring3);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1.6 * sc, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
    inner.position.y = 2 * sc; group.add(inner);
  } else if (t === "statue") {
    const sbody = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * sc, 0.5 * sc, 3 * sc, 8), m(0xaaaaaa));
    sbody.position.y = 1.5 * sc; sbody.castShadow = true; group.add(sbody);
    const shead = new THREE.Mesh(new THREE.SphereGeometry(0.5 * sc, 12, 12), m(0xaaaaaa));
    shead.position.y = 3.5 * sc; group.add(shead);
    const sbase = new THREE.Mesh(new THREE.BoxGeometry(1.5 * sc, 0.4 * sc, 1.5 * sc), m(0x666666));
    sbase.position.y = 0.2 * sc; group.add(sbase);
  } else if (t === "painting") {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.5 * sc, 2 * sc, 0.1 * sc), m(0x664422));
    frame.position.y = 2 * sc; group.add(frame);
    const canvas2 = new THREE.Mesh(new THREE.PlaneGeometry(2.2 * sc, 1.7 * sc), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
    canvas2.position.set(0, 2 * sc, 0.06 * sc); group.add(canvas2);
  } else if (t === "car") {
    const body2 = new THREE.Mesh(new THREE.BoxGeometry(3.5 * sc, 0.8 * sc, 1.8 * sc), m(col));
    body2.position.y = 0.7 * sc; body2.castShadow = true; group.add(body2);
    const roof2 = new THREE.Mesh(new THREE.BoxGeometry(2.2 * sc, 0.7 * sc, 1.6 * sc), m(col));
    roof2.position.y = 1.5 * sc; group.add(roof2);
    for (const [wx, wz] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.38 * sc, 0.15 * sc, 8, 18), m(0x111111));
      wheel.rotation.x = Math.PI / 2; wheel.position.set(wx * sc, 0.4 * sc, wz * sc); group.add(wheel);
    }
  } else if (t === "boat") {
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * sc, 1.2 * sc, 3 * sc, 8), m(col));
    hull.rotation.z = Math.PI / 2; hull.position.y = 0.6 * sc; group.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3 * sc, 6), m(0x885533));
    mast.position.y = 2.5 * sc; group.add(mast);
    const sail = new THREE.Mesh(new THREE.ConeGeometry(1.2 * sc, 2.5 * sc, 4), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    sail.position.y = 3.5 * sc; group.add(sail);
  } else if (t === "tree") {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * sc, 0.35 * sc, 2.5 * sc, 8), m(0x664422));
    trunk.position.y = 1.25 * sc; trunk.castShadow = true; group.add(trunk);
    for (let li = 0; li < 3; li++) {
      const lvl = new THREE.Mesh(new THREE.ConeGeometry((1.8 - li * 0.3) * sc, 1.6 * sc, 8), m(0x226622));
      lvl.position.y = (2 + li * 1.3) * sc; lvl.castShadow = true; group.add(lvl);
    }
  } else if (t === "rock") {
    for (let ri = 0; ri < 4; ri++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry((0.4 + Math.random() * 0.5) * sc), m(0x777777));
      r.position.set((Math.random() - 0.5) * 1.5, 0.3, (Math.random() - 0.5) * 1.5);
      r.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      r.castShadow = true; group.add(r);
    }
  } else if (t === "dome") {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.5 * sc, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    dome.position.y = 0.1; group.add(dome);
  } else if (t === "spiral") {
    const segments = 30;
    for (let si = 0; si < segments; si++) {
      const t2 = si / segments;
      const angle = t2 * Math.PI * 6;
      const radius = t2 * 2.5 * sc;
      const height = t2 * 5 * sc;
      const seg = new THREE.Mesh(new THREE.SphereGeometry(0.18 * sc, 6, 6), m(col));
      seg.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      group.add(seg);
    }
  } else if (t === "mushroom") {
    const mstalk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * sc, 0.4 * sc, 1.5 * sc, 8), m(0xddccaa));
    mstalk.position.y = 0.75 * sc; group.add(mstalk);
    const mcap = new THREE.Mesh(new THREE.SphereGeometry(1.4 * sc, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m(col));
    mcap.position.y = 1.8 * sc; group.add(mcap);
    for (let si = 0; si < 8; si++) {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.15 * sc, 8), m(0xffffff));
      const da = (si / 8) * Math.PI * 2;
      dot.position.set(Math.cos(da) * 0.8 * sc, 2.2 * sc, Math.sin(da) * 0.8 * sc);
      dot.rotation.x = -0.5; group.add(dot);
    }
  } else if (t === "cube_art") {
    const cube = new THREE.Mesh(new THREE.BoxGeometry(sc * 2, sc * 2, sc * 2), m(col));
    cube.position.y = sc; cube.rotation.set(0.3, 0.5, 0.2); cube.castShadow = true; group.add(cube);
  } else if (t === "sphere_art") {
    const sph = new THREE.Mesh(new THREE.SphereGeometry(sc * 1.5, 20, 20), m(col));
    sph.position.y = sc * 1.5; sph.castShadow = true; group.add(sph);
  } else if (t === "bridge") {
    const brd = new THREE.Mesh(new THREE.BoxGeometry(8 * sc, 0.3 * sc, 2 * sc), m(col));
    brd.position.y = 2 * sc; group.add(brd);
    for (const bx of [-3.5 * sc, 3.5 * sc]) {
      const bpil = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * sc, 0.3 * sc, 2 * sc, 8), m(col));
      bpil.position.set(bx, 1 * sc, 0); group.add(bpil);
    }
  } else if (t === "fence" || t === "gate") {
    for (let fi = -3; fi <= 3; fi++) {
      const fp = new THREE.Mesh(new THREE.BoxGeometry(0.15 * sc, 1.8 * sc, 0.15 * sc), m(col));
      fp.position.set(fi * sc, 0.9 * sc, 0); group.add(fp);
    }
    const fbar = new THREE.Mesh(new THREE.BoxGeometry(6 * sc, 0.12 * sc, 0.12 * sc), m(col));
    fbar.position.set(0, 1.4 * sc, 0); group.add(fbar);
  } else if (t === "swing") {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3 * sc, 0.15 * sc, 0.15 * sc), m(0x885533));
    frame.position.set(0, 3.2 * sc, 0); group.add(frame);
    for (const sx of [-1 * sc, 1 * sc]) {
      const frp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2 * sc, 6), m(0x885533));
      frp.position.set(sx, 1.6 * sc, 0); group.add(frp);
    }
    const seat2 = new THREE.Mesh(new THREE.BoxGeometry(1.4 * sc, 0.12 * sc, 0.7 * sc), m(0xddaa66));
    seat2.position.set(0, 1.5 * sc, 0); group.add(seat2);
  } else {
    // Default: colored box
    const def = new THREE.Mesh(new THREE.BoxGeometry(2 * sc, 2.5 * sc, 2 * sc), m(col));
    def.position.y = 1.25 * sc; def.castShadow = true; group.add(def);
  }

  group.scale.set(0.01, 0.01, 0.01);
  scene.add(group);
  objsRef[obj.id] = group;
}

// ─── Name Entry Screen ────────────────────────────────────────────────────────
function NameEntry({ onStart }: { onStart: (name: string, gender: "female" | "male") => void }) {
  const [name, setName] = useState("Minny");
  const [gender, setGender] = useState<"female" | "male">("female");
  return (
    <div style={{ position: "fixed", inset: 0, background: "linear-gradient(135deg,#0d0d2b 0%,#1a1a4a 100%)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, fontFamily: "system-ui,sans-serif" }}>
      <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 18, padding: "2.5rem 3rem", maxWidth: 380, width: "90%", textAlign: "center", boxShadow: "0 8px 64px rgba(0,0,0,0.6)" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🌍</div>
        <h1 style={{ color: "#88aaff", fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>Virtual World 3D</h1>
        <p style={{ color: "#667", fontSize: 13, margin: "0 0 28px" }}>18 IAs com inteligência própria te esperam</p>
        <label style={{ display: "block", color: "#aab", fontSize: 13, marginBottom: 6, textAlign: "left" }}>Seu nome</label>
        <input
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && name.trim() && onStart(name.trim(), gender)}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 16, outline: "none", marginBottom: 16 }}
          placeholder="Digite seu nome..." maxLength={20}
        />
        <label style={{ display: "block", color: "#aab", fontSize: 13, marginBottom: 10, textAlign: "left" }}>Gênero do personagem</label>
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          {(["female", "male"] as const).map(g => (
            <button key={g} onClick={() => setGender(g)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `2px solid ${gender === g ? "#88aaff" : "rgba(255,255,255,0.15)"}`, background: gender === g ? "rgba(136,170,255,0.2)" : "rgba(255,255,255,0.05)", color: gender === g ? "#88aaff" : "#778", cursor: "pointer", fontSize: 15, fontWeight: gender === g ? 700 : 400 }}>
              {g === "female" ? "👩 Feminino" : "👨 Masculino"}
            </button>
          ))}
        </div>
        <button
          disabled={!name.trim()}
          onClick={() => onStart(name.trim(), gender)}
          style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: name.trim() ? "linear-gradient(90deg,#4466ff,#88aaff)" : "rgba(255,255,255,0.1)", color: name.trim() ? "#fff" : "#555", cursor: name.trim() ? "pointer" : "default", fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>
          Entrar no Mundo →
        </button>
      </div>
    </div>
  );
}

// ─── Main Game ────────────────────────────────────────────────────────────────
export default function Game() {
  const [started, setStarted] = useState(false);
  const [playerName, setPlayerName] = useState("Minny");
  const [playerGender, setPlayerGender] = useState<"female" | "male">("female");

  const containerRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);

  // UI state
  const [uiVisible, setUiVisible] = useState(true);
  const [activeChatNPC, setActiveChatNPC] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<"individual" | "all">("individual");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [convFeed, setConvFeed] = useState<ConvFeed[]>([]);
  const [npcList, setNpcList] = useState<NpcState[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [buildPaletteOpen, setBuildPaletteOpen] = useState(false);
  const [selectedBuildType, setSelectedBuildType] = useState("house");
  const [drawMode, setDrawMode] = useState(false);
  const [drawColor, setDrawColor] = useState("#ff88aa");
  const [drawSize, setDrawSize] = useState(4);
  const [drawTool, setDrawTool] = useState<"pen" | "circle" | "rect" | "eraser">("pen");
  const [drawClearIn, setDrawClearIn] = useState<number | null>(null);
  const [mentionAlert, setMentionAlert] = useState<{ name: string; text: string } | null>(null);

  // Refs for Three.js
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const npcsRef = useRef<Record<string, { group: THREE.Group; state: NpcState; bubble?: THREE.Sprite; bubbleTimer?: number; emote?: THREE.Sprite; emoteTimer?: number }>>({});
  const objectsRef = useRef<Record<string, THREE.Group>>({});
  const playerRef = useRef<{ group: THREE.Group; position: Pos }>({ group: new THREE.Group(), position: { x: 0, z: 0 } });
  const otherPlayersRef = useRef<Record<string, { group: THREE.Group; position: Pos }>>({});
  const moveState = useRef({ w: false, a: false, s: false, d: false });
  const camState = useRef({ angleH: 0, angleV: 0.45, distance: 20, isDragging: false, lastX: 0, lastY: 0, pinchDist: 0 });
  const lastMoveSent = useRef(0);
  const drawingRef = useRef(false);
  const drawLastPt = useRef<{ x: number; y: number } | null>(null);
  const drawCanvasClearTimer = useRef<number | null>(null);
  const joystickRef = useRef<{ active: boolean; cx: number; cy: number; dx: number; dy: number }>({ active: false, cx: 0, cy: 0, dx: 0, dy: 0 });
  const joystickElemRef = useRef<HTMLDivElement>(null);
  const joystickKnobRef = useRef<HTMLDivElement>(null);

  const addToast = useCallback((text: string, color: string) => {
    const id = Date.now().toString() + Math.random();
    setToasts(prev => [...prev, { id, text, color }].slice(-4));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const handleStart = (name: string, gender: "female" | "male") => {
    setPlayerName(name); setPlayerGender(gender); setStarted(true);
  };

  // Drawing canvas clear timer
  const scheduleDrawClear = useCallback(() => {
    if (drawCanvasClearTimer.current) clearTimeout(drawCanvasClearTimer.current);
    const clearAt = Date.now() + DRAW_CANVAS_TTL;
    setDrawClearIn(Math.ceil(DRAW_CANVAS_TTL / 60000));
    drawCanvasClearTimer.current = window.setTimeout(() => {
      const cv = drawCanvasRef.current;
      if (cv) { const ctx = cv.getContext("2d"); ctx?.clearRect(0, 0, cv.width, cv.height); }
      setDrawClearIn(null);
    }, DRAW_CANVAS_TTL);
    // countdown
    const interval = setInterval(() => {
      const rem = Math.ceil((clearAt - Date.now()) / 60000);
      if (rem <= 0) { clearInterval(interval); setDrawClearIn(null); }
      else setDrawClearIn(rem);
    }, 60000);
  }, []);

  // Minimap update
  const updateMinimap = useCallback(() => {
    const cv = minimapRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const size = 120, scale = size / WORLD_SIZE, offset = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(5,5,18,0.92)"; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(100,100,200,0.3)"; ctx.strokeRect(0, 0, size, size);
    // Objects
    Object.values(objectsRef.current).forEach(obj => {
      ctx.fillStyle = "#336"; ctx.fillRect(offset + obj.position.x * scale - 1.5, offset + obj.position.z * scale - 1.5, 3, 3);
    });
    // NPCs
    Object.values(npcsRef.current).forEach(n => {
      ctx.fillStyle = n.state.color;
      ctx.beginPath(); ctx.arc(offset + n.group.position.x * scale, offset + n.group.position.z * scale, 2.5, 0, Math.PI * 2); ctx.fill();
    });
    // Other players
    Object.values(otherPlayersRef.current).forEach(p => {
      ctx.fillStyle = "#aaa"; ctx.beginPath(); ctx.arc(offset + p.position.x * scale, offset + p.position.z * scale, 2.5, 0, Math.PI * 2); ctx.fill();
    });
    // Player
    ctx.fillStyle = "#00ffff"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(offset + playerRef.current.position.x * scale, offset + playerRef.current.position.z * scale, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1;
  }, []);

  useEffect(() => {
    if (!started || !containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1e);
    scene.fog = new THREE.Fog(0x0a0a1e, 100, 350);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      containerRef.current.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:#0a0a1e;color:#88aaff;font-family:system-ui;gap:1rem;text-align:center;padding:2rem"><div style="font-size:3rem">🌐</div><div style="font-size:1.3rem;font-weight:700">Virtual World 3D</div><div style="color:#445;font-size:0.9rem">WebGL não está disponível nesta pré-visualização.<br/>Abra em um navegador completo para jogar.</div></div>`;
      return;
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    scene.add(new THREE.AmbientLight(0x223366, 0.9));
    const sun = new THREE.DirectionalLight(0xfff0dd, 1.3);
    sun.position.set(80, 150, 60); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 1; sun.shadow.camera.far = 600;
    sun.shadow.camera.left = -200; sun.shadow.camera.right = 200; sun.shadow.camera.top = 200; sun.shadow.camera.bottom = -200;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x223366, 0x112244, 0.5));

    // Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 2.2, WORLD_SIZE * 2.2, 60, 60), new THREE.MeshLambertMaterial({ color: 0x182818 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const grid = new THREE.GridHelper(WORLD_SIZE * 2.2, 80, 0x223322, 0x192419);
    grid.position.y = 0.01; scene.add(grid);

    // Stars
    const starsBuf = new Float32Array(3000 * 3);
    for (let i = 0; i < 9000; i += 3) { starsBuf[i] = (Math.random() - 0.5) * 800; starsBuf[i + 1] = 60 + Math.random() * 300; starsBuf[i + 2] = (Math.random() - 0.5) * 800; }
    const starsGeo = new THREE.BufferGeometry(); starsGeo.setAttribute("position", new THREE.BufferAttribute(starsBuf, 3));
    scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ size: 0.5, color: 0xffffff, transparent: true, opacity: 0.65 })));

    // Roads
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const rH = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 2, 14), roadMat); rH.rotation.x = -Math.PI / 2; rH.position.y = 0.02; scene.add(rH);
    const rV = new THREE.Mesh(new THREE.PlaneGeometry(14, WORLD_SIZE * 2), roadMat); rV.rotation.x = -Math.PI / 2; rV.position.y = 0.02; scene.add(rV);

    // Buildings (spread across larger map)
    const bldgs = [
      { x: 50, z: 50, w: 10, h: 22, d: 10, c: 0x2a3a5a }, { x: -60, z: 40, w: 12, h: 16, d: 12, c: 0x3a2a5a },
      { x: 80, z: -70, w: 8, h: 28, d: 8, c: 0x2a4a3a }, { x: -90, z: -60, w: 10, h: 18, d: 10, c: 0x4a3a2a },
      { x: 110, z: 60, w: 7, h: 32, d: 7, c: 0x2a2a5a }, { x: -110, z: 80, w: 9, h: 12, d: 9, c: 0x3a4a2a },
      { x: 120, z: -100, w: 8, h: 24, d: 8, c: 0x4a2a3a }, { x: -120, z: -100, w: 11, h: 20, d: 11, c: 0x2a3a4a },
      { x: 30, z: 90, w: 14, h: 10, d: 14, c: 0x3a3a3a }, { x: -40, z: -80, w: 9, h: 18, d: 9, c: 0x2a4a4a },
      { x: 70, z: -30, w: 8, h: 25, d: 8, c: 0x3a2a4a }, { x: -70, z: 110, w: 10, h: 14, d: 10, c: 0x4a4a2a },
    ];
    bldgs.forEach(b => {
      const bg = new THREE.Group(); bg.position.set(b.x, 0, b.z);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), new THREE.MeshLambertMaterial({ color: b.c }));
      mesh.position.y = b.h / 2; mesh.castShadow = true; bg.add(mesh);
      const wm = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xffffaa : 0x88ccff, transparent: true, opacity: 0.85 });
      const wg = new THREE.PlaneGeometry(1.2, 0.8);
      for (let wy = 3; wy < b.h - 2; wy += 3) {
        for (let wx = -b.w / 2 + 1.5; wx < b.w / 2 - 1; wx += 2.5) {
          if (Math.random() > 0.3) { const win = new THREE.Mesh(wg, wm); win.position.set(wx, wy, b.d / 2 + 0.01); bg.add(win); }
        }
      }
      scene.add(bg);
    });

    // Player
    playerRef.current.group = createCharacter(0x00ccff, playerGender, true);
    scene.add(playerRef.current.group);

    // Show speech bubble for NPC
    const showBubble = (npcId: string, text: string, color: string, emote: string) => {
      const n = npcsRef.current[npcId]; if (!n) return;
      if (n.bubble) { scene.remove(n.bubble); }
      const sp = makeSpeechSprite(text, color, emote);
      sp.position.set(n.group.position.x, 4.8, n.group.position.z);
      scene.add(sp); n.bubble = sp; n.bubbleTimer = performance.now() + 6500;

      // Emote
      if (n.emote) scene.remove(n.emote);
      const emSp = makeEmoteSprite(emote || "💬");
      emSp.position.set(n.group.position.x + 0.8, 3.6, n.group.position.z);
      scene.add(emSp); n.emote = emSp; n.emoteTimer = performance.now() + 4000;
    };

    // WebSocket
    ws.current = new WebSocket(WS_URL);
    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({ type: "player-name", name: playerName, gender: playerGender }));
    };

    ws.current.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        switch (d.type) {
          case "init": {
            playerIdRef.current = d.playerId;
            const initNpcs: NpcState[] = d.npcs;
            setNpcList(initNpcs);
            initNpcs.forEach(n => {
              const g = createCharacter(n.color, n.gender ?? "female");
              g.position.set(n.position.x, 0, n.position.z);
              scene.add(g);
              npcsRef.current[n.id] = { group: g, state: n };
            });
            (d.worldObjects as WorldObject[]).forEach(o => spawnWorldObject(o, scene, objectsRef.current));
            if (d.recentConversations) setConvFeed(d.recentConversations);
            break;
          }
          case "npc-move": {
            const n = npcsRef.current[d.npcId];
            if (n) {
              n.state.targetPosition = d.targetPosition;
              n.state.emotion = d.emotion;
              setNpcList(prev => prev.map(np => np.id === d.npcId ? { ...np, emotion: d.emotion } : np));
            }
            break;
          }
          case "npc-arrived": {
            const n = npcsRef.current[d.npcId];
            if (n && d.position) { n.group.position.set(d.position.x, 0, d.position.z); n.state.targetPosition = undefined; n.state.position = d.position; }
            break;
          }
          case "npc-conversation": {
            const emoteFrom = d.fromEmotion?.match(/[\p{Emoji}]/u)?.[0] ?? "💬";
            showBubble(d.fromId, d.message, d.fromColor, emoteFrom);
            setTimeout(() => showBubble(d.toId, d.response, d.toColor, d.toEmotion?.match(/[\p{Emoji}]/u)?.[0] ?? "💬"), 1400);
            setConvFeed(prev => [{ fromName: d.from, fromColor: d.fromColor, toName: d.to, toColor: d.toColor, message: d.message, response: d.response, ts: Date.now() }, ...prev].slice(0, 20));
            setNpcList(prev => prev.map(n => n.id === d.fromId ? { ...n, emotion: d.fromEmotion } : n.id === d.toId ? { ...n, emotion: d.toEmotion } : n));
            break;
          }
          case "npc-thought": {
            showBubble(d.npcId, d.thought, d.npcColor, d.emotion?.match(/[\p{Emoji}]/u)?.[0] ?? "💭");
            break;
          }
          case "npc-created-object": {
            spawnWorldObject(d.object, scene, objectsRef.current);
            showBubble(d.npcId, d.description, d.npcColor, "✨");
            addToast(`${d.npcName} criou: ${d.description}`, d.npcColor);
            break;
          }
          case "world-object-removed": {
            const go = objectsRef.current[d.objectId];
            if (go) { scene.remove(go); delete objectsRef.current[d.objectId]; }
            break;
          }
          case "npc-greet-player": {
            const emote = d.emotion?.match(/[\p{Emoji}]/u)?.[0] ?? "👋";
            showBubble(d.npcId, d.message, d.npcColor, emote);
            if (d.targetPlayerId === playerIdRef.current || d.message.toLowerCase().includes(playerName.toLowerCase())) {
              setMentionAlert({ name: d.npcName, text: d.message });
              setTimeout(() => setMentionAlert(null), 6000);
            }
            break;
          }
          case "npc-response": {
            showBubble(d.npcId, d.response, d.npcColor, d.emotion?.match(/[\p{Emoji}]/u)?.[0] ?? "💬");
            setChatMessages(prev => [...prev, { id: Date.now().toString(), from: "npc" as const, text: d.response, color: d.npcColor, name: d.npcName, forMe: d.targetPlayerId === playerIdRef.current }].slice(-30));
            setNpcList(prev => prev.map(n => n.id === d.npcId ? { ...n, emotion: d.emotion } : n));
            if (d.targetPlayerId === playerIdRef.current && d.response.toLowerCase().includes("@" + playerName.toLowerCase())) {
              setMentionAlert({ name: d.npcName, text: d.response });
              setTimeout(() => setMentionAlert(null), 6000);
            }
            break;
          }
          case "player-joined": {
            if (d.playerId !== playerIdRef.current) {
              const og = createCharacter(0xaaaaaa, "female");
              og.position.set(0, 0, 0); scene.add(og);
              otherPlayersRef.current[d.playerId] = { group: og, position: { x: 0, z: 0 } };
              addToast(`${d.player?.name ?? "Alguém"} entrou no mundo! 🌍`, "#88aaff");
            }
            break;
          }
          case "player-update": {
            const op = otherPlayersRef.current[d.playerId];
            if (op && d.position) { op.position = d.position; op.group.position.set(d.position.x, 0, d.position.z); }
            break;
          }
          case "player-left": {
            const op = otherPlayersRef.current[d.playerId];
            if (op) { scene.remove(op.group); delete otherPlayersRef.current[d.playerId]; }
            break;
          }
          case "player-broadcast": {
            if (d.playerId !== playerIdRef.current) {
              setChatMessages(prev => [...prev, { id: Date.now().toString(), from: "player" as const, text: `${d.playerName}: ${d.message}`, color: "#88aaff" }].slice(-30));
            }
            break;
          }
          case "canvas-drawing": {
            const cv = drawCanvasRef.current; if (!cv) break;
            const ctx = cv.getContext("2d"); if (!ctx) break;
            const cmd = d.drawing as DrawCmd;
            applyDrawCmd(ctx, cmd);
            break;
          }
        }
      } catch { }
    };

    // Input
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (drawMode) return;
      const k = e.key.toLowerCase();
      if (k === "w" || e.key === "ArrowUp") moveState.current.w = true;
      if (k === "a" || e.key === "ArrowLeft") moveState.current.a = true;
      if (k === "s" || e.key === "ArrowDown") moveState.current.s = true;
      if (k === "d" || e.key === "ArrowRight") moveState.current.d = true;
      if (k === "b") setBuildPaletteOpen(p => !p);
      if (k === "c") setDrawMode(p => !p);
      if (k === "u") setUiVisible(p => !p);
      if (k === "escape") { setActiveChatNPC(null); setBuildPaletteOpen(false); setDrawMode(false); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "w" || e.key === "ArrowUp") moveState.current.w = false;
      if (k === "a" || e.key === "ArrowLeft") moveState.current.a = false;
      if (k === "s" || e.key === "ArrowDown") moveState.current.s = false;
      if (k === "d" || e.key === "ArrowRight") moveState.current.d = false;
    };

    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".hud")) return;
      if (e.button === 0) {
        const ray = new THREE.Raycaster();
        const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        ray.setFromCamera(mouse, camera);
        const hits = ray.intersectObjects(Object.values(npcsRef.current).map(n => n.group), true);
        if (hits.length > 0) {
          let grp: THREE.Object3D | null = hits[0].object;
          while (grp && grp.parent !== scene) grp = grp.parent;
          const entry = Object.entries(npcsRef.current).find(([, n]) => n.group === grp);
          if (entry) { setActiveChatNPC(entry[0]); setChatMode("individual"); return; }
        }
      }
      if (!drawMode) {
        camState.current.isDragging = true; camState.current.lastX = e.clientX; camState.current.lastY = e.clientY;
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!camState.current.isDragging || drawMode) return;
      camState.current.angleH -= (e.clientX - camState.current.lastX) * 0.008;
      camState.current.angleV = Math.max(0.1, Math.min(1.4, camState.current.angleV + (e.clientY - camState.current.lastY) * 0.008));
      camState.current.lastX = e.clientX; camState.current.lastY = e.clientY;
    };
    const onMouseUp = () => { camState.current.isDragging = false; };
    const onWheel = (e: WheelEvent) => { camState.current.distance = Math.max(5, Math.min(60, camState.current.distance + e.deltaY * 0.04)); };

    // Touch for camera rotation (non-joystick area)
    let prevTouchDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest(".hud") || (e.target as HTMLElement).closest(".joystick-zone")) return;
      if (e.touches.length === 2) {
        prevTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      } else if (e.touches.length === 1) {
        camState.current.isDragging = true; camState.current.lastX = e.touches[0].clientX; camState.current.lastY = e.touches[0].clientY;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest(".hud") || (e.target as HTMLElement).closest(".joystick-zone")) return;
      e.preventDefault();
      if (e.touches.length === 2) {
        const d2 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        camState.current.distance = Math.max(5, Math.min(60, camState.current.distance + (prevTouchDist - d2) * 0.08));
        prevTouchDist = d2;
      } else if (e.touches.length === 1 && camState.current.isDragging) {
        camState.current.angleH -= (e.touches[0].clientX - camState.current.lastX) * 0.01;
        camState.current.angleV = Math.max(0.1, Math.min(1.4, camState.current.angleV + (e.touches[0].clientY - camState.current.lastY) * 0.01));
        camState.current.lastX = e.touches[0].clientX; camState.current.lastY = e.touches[0].clientY;
      }
    };
    const onTouchEnd = () => { camState.current.isDragging = false; };

    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown); window.addEventListener("mousemove", onMouseMove); window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("wheel", onWheel, { passive: true });
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
    renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: false });
    renderer.domElement.addEventListener("touchend", onTouchEnd);

    // Animation loop
    let animId: number;
    let lastT = performance.now(), minimapT = 0;

    const animate = (t: number) => {
      const dt = Math.min((t - lastT) / 1000, 0.1); lastT = t;

      // Player movement (keyboard + joystick)
      const joy = joystickRef.current;
      const speed = 10 * dt;
      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camState.current.angleH);
      const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), camState.current.angleH);
      const dir = new THREE.Vector3();
      if (moveState.current.w || (joy.active && joy.dy < -0.2)) dir.add(forward);
      if (moveState.current.s || (joy.active && joy.dy > 0.2)) dir.sub(forward);
      if (moveState.current.a || (joy.active && joy.dx < -0.2)) dir.sub(right);
      if (moveState.current.d || (joy.active && joy.dx > 0.2)) dir.add(right);
      if (dir.lengthSq() > 0) {
        dir.normalize();
        const joySpeed = joy.active ? Math.hypot(joy.dx, joy.dy) * speed : speed;
        playerRef.current.position.x += dir.x * joySpeed;
        playerRef.current.position.z += dir.z * joySpeed;
        playerRef.current.group.position.set(playerRef.current.position.x, 0, playerRef.current.position.z);
        playerRef.current.group.rotation.y = Math.atan2(dir.x, dir.z);
        if (t - lastMoveSent.current > 80) {
          ws.current?.send(JSON.stringify({ type: "player-move", position: playerRef.current.position }));
          lastMoveSent.current = t;
        }
      }

      // Camera
      const pg = playerRef.current.group;
      const cs = camState.current;
      camera.position.set(
        pg.position.x + cs.distance * Math.sin(cs.angleH) * Math.cos(cs.angleV),
        pg.position.y + cs.distance * Math.sin(cs.angleV),
        pg.position.z + cs.distance * Math.cos(cs.angleH) * Math.cos(cs.angleV)
      );
      camera.lookAt(pg.position.x, pg.position.y + 1.5, pg.position.z);

      // NPCs
      Object.values(npcsRef.current).forEach(n => {
        if (n.state.targetPosition) {
          const tx = n.state.targetPosition.x - n.group.position.x;
          const tz = n.state.targetPosition.z - n.group.position.z;
          const dd = Math.sqrt(tx * tx + tz * tz);
          if (dd > 0.4) {
            n.group.position.x += (tx / dd) * 5 * dt;
            n.group.position.z += (tz / dd) * 5 * dt;
            n.group.rotation.y = Math.atan2(tx, tz);
          } else {
            if (n.state.targetPosition) { n.group.position.set(n.state.targetPosition.x, 0, n.state.targetPosition.z); n.state.targetPosition = undefined; }
          }
        }
        if (n.bubble) {
          n.bubble.position.set(n.group.position.x, 4.8, n.group.position.z);
          if (t > (n.bubbleTimer ?? 0)) { scene.remove(n.bubble); n.bubble = undefined; }
        }
        if (n.emote) {
          n.emote.position.set(n.group.position.x + 0.8, 3.6, n.group.position.z);
          if (t > (n.emoteTimer ?? 0)) { scene.remove(n.emote); n.emote = undefined; }
        }
      });

      // Scale-in objects
      Object.values(objectsRef.current).forEach(o => {
        if (o.scale.x < 1) { const s = Math.min(1, o.scale.x + dt * 1.8); o.scale.set(s, s, s); }
      });

      if (t - minimapT > 150) { updateMinimap(); minimapT = t; }

      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };
    animate(performance.now());

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown); window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("wheel", onWheel); window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      renderer.domElement.removeEventListener("touchmove", onTouchMove);
      renderer.domElement.removeEventListener("touchend", onTouchEnd);
      cancelAnimationFrame(animId); renderer.dispose(); ws.current?.close();
    };
  }, [started, playerName, playerGender, addToast, updateMinimap]);

  // Drawing helpers
  function applyDrawCmd(ctx: CanvasRenderingContext2D, cmd: DrawCmd) {
    if (cmd.type === "clear") { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); return; }
    ctx.strokeStyle = cmd.color ?? "#ff88aa"; ctx.fillStyle = cmd.color ?? "#ff88aa";
    ctx.lineWidth = cmd.size ?? 4; ctx.lineCap = "round";
    if (cmd.type === "line" && cmd.x !== undefined) {
      ctx.beginPath(); ctx.moveTo(cmd.x, cmd.y!); ctx.lineTo(cmd.x2!, cmd.y2!); ctx.stroke();
    } else if (cmd.type === "circle" && cmd.x !== undefined) {
      ctx.beginPath(); ctx.arc(cmd.x, cmd.y!, cmd.size! * 4, 0, Math.PI * 2);
      if (cmd.fill) ctx.fill(); else ctx.stroke();
    } else if (cmd.type === "rect" && cmd.x !== undefined) {
      if (cmd.fill) ctx.fillRect(cmd.x, cmd.y!, cmd.x2! - cmd.x, cmd.y2! - cmd.y!);
      else ctx.strokeRect(cmd.x, cmd.y!, cmd.x2! - cmd.x, cmd.y2! - cmd.y!);
    }
  }

  const sendDrawCmd = useCallback((cmd: DrawCmd) => {
    const cv = drawCanvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    applyDrawCmd(ctx, cmd);
    ws.current?.send(JSON.stringify({ type: "canvas-drawing", drawing: cmd }));
    scheduleDrawClear();
  }, [scheduleDrawClear]);

  const onDrawMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    drawLastPt.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (drawTool === "circle") sendDrawCmd({ type: "circle", x: e.clientX - r.left, y: e.clientY - r.top, color: drawColor, size: drawSize, fill: false });
  };
  const onDrawMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !drawLastPt.current) return;
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x2 = e.clientX - r.left, y2 = e.clientY - r.top;
    if (drawTool === "pen" || drawTool === "eraser") {
      sendDrawCmd({ type: "line", x: drawLastPt.current.x, y: drawLastPt.current.y, x2, y2, color: drawTool === "eraser" ? "rgba(0,0,0,0)" : drawColor, size: drawTool === "eraser" ? drawSize * 4 : drawSize });
      drawLastPt.current = { x: x2, y: y2 };
    }
  };
  const onDrawMouseUp = () => { drawingRef.current = false; drawLastPt.current = null; };

  const sendChat = () => {
    const msg = chatInput.trim(); if (!msg) return;
    if (chatMode === "all") {
      ws.current?.send(JSON.stringify({ type: "player-chat-all", message: msg }));
      setChatMessages(prev => [...prev, { id: Date.now().toString(), from: "player" as const, text: `(todos) ${msg}`, color: "#88aaff" }].slice(-30));
    } else if (activeChatNPC) {
      ws.current?.send(JSON.stringify({ type: "player-chat", npcId: activeChatNPC, message: msg }));
      setChatMessages(prev => [...prev, { id: Date.now().toString(), from: "player" as const, text: msg, name: playerName }].slice(-30));
    }
    setChatInput("");
  };

  const placeObject = (type: string) => {
    const dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), (cameraRef.current ? camState.current.angleH : 0));
    const pos = { x: playerRef.current.position.x - dir.x * 8, z: playerRef.current.position.z - dir.z * 8 };
    ws.current?.send(JSON.stringify({ type: "player-create", objType: type, position: pos, color: drawColor }));
    setBuildPaletteOpen(false);
  };

  // Joystick handlers
  const onJoyStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    joystickRef.current = { active: true, cx: t.clientX, cy: t.clientY, dx: 0, dy: 0 };
  };
  const onJoyMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    const t = e.touches[0];
    const dx = (t.clientX - joystickRef.current.cx) / 50;
    const dy = (t.clientY - joystickRef.current.cy) / 50;
    const len = Math.hypot(dx, dy);
    const clamped = len > 1 ? { dx: dx / len, dy: dy / len } : { dx, dy };
    joystickRef.current.dx = clamped.dx; joystickRef.current.dy = clamped.dy;
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = `translate(${clamped.dx * 28}px, ${clamped.dy * 28}px)`;
    }
  };
  const onJoyEnd = () => {
    joystickRef.current = { active: false, cx: 0, cy: 0, dx: 0, dy: 0 };
    if (joystickKnobRef.current) joystickKnobRef.current.style.transform = "translate(0,0)";
  };

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const activeNpcInfo = npcList.find(n => n.id === activeChatNPC);

  if (!started) return <NameEntry onStart={handleStart} />;

  return (
    <div style={{ width: "100dvw", height: "100dvh", overflow: "hidden", background: "#0a0a1e", position: "relative", fontFamily: "system-ui,sans-serif", userSelect: "none" }}>
      {/* Three.js canvas container */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Drawing canvas (30-min artwork layer) */}
      {drawMode && (
        <canvas
          ref={drawCanvasRef}
          width={window.innerWidth} height={window.innerHeight}
          style={{ position: "absolute", inset: 0, zIndex: 20, cursor: drawTool === "eraser" ? "cell" : "crosshair", touchAction: "none" }}
          onMouseDown={onDrawMouseDown} onMouseMove={onDrawMouseMove} onMouseUp={onDrawMouseUp} onMouseLeave={onDrawMouseUp}
        />
      )}

      {/* UI Toggle Button */}
      <button onClick={() => setUiVisible(p => !p)}
        className="hud"
        style={{ position: "absolute", top: 12, left: 12, zIndex: 200, padding: "7px 13px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(5,5,20,0.75)", color: "#aab", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>
        {uiVisible ? "👁" : "👁‍🗨"}
      </button>

      {uiVisible && (
        <>
          {/* ── Top bar: player name + mode ── */}
          <div className="hud" style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 100, display: "flex", gap: 8, alignItems: "center", background: "rgba(5,5,20,0.8)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 30, padding: "6px 16px", fontSize: 13 }}>
            <span style={{ color: "#88aaff", fontWeight: 700 }}>{playerGender === "female" ? "👩" : "👨"} {playerName}</span>
            <span style={{ color: "#445" }}>|</span>
            <span style={{ color: "#667" }}>WASD / joystick · drag câmera · B = construir · C = desenhar · U = UI</span>
          </div>

          {/* ── Mention Alert ── */}
          {mentionAlert && (
            <div className="hud" style={{ position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 300, background: "rgba(136,170,255,0.18)", border: "2px solid #88aaff", borderRadius: 12, padding: "10px 18px", maxWidth: 340, textAlign: "center", animation: "fadeIn 0.3s" }}>
              <div style={{ color: "#88aaff", fontWeight: 700, fontSize: 13 }}>📣 {mentionAlert.name} está te chamando!</div>
              <div style={{ color: "#ccd", fontSize: 12, marginTop: 4 }}>{mentionAlert.text}</div>
            </div>
          )}

          {/* ── Right panel: Conversations feed ── */}
          <div className="hud" style={{ position: "absolute", top: 12, right: 12, zIndex: 100, width: 280, maxHeight: "calc(50vh - 20px)", display: "flex", flexDirection: "column", gap: 0, background: "rgba(5,5,20,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#88aaff", fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>💬 CONVERSAS AO VIVO</div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {convFeed.length === 0 && <div style={{ padding: 12, color: "#445", fontSize: 12, textAlign: "center" }}>As IAs vão começar a conversar em breve...</div>}
              {convFeed.map((c, i) => (
                <div key={i} style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: c.fromColor, fontWeight: 700 }}>{c.fromName}</span>
                    <span style={{ color: "#445" }}> → </span>
                    <span style={{ color: c.toColor, fontWeight: 700 }}>{c.toName}</span>
                  </div>
                  <div style={{ color: "#bbc", fontSize: 11, lineHeight: 1.4 }}>"{c.message}"</div>
                  {c.response && <div style={{ color: "#889", fontSize: 10, marginTop: 2, fontStyle: "italic" }}>↩ "{c.response.slice(0, 60)}{c.response.length > 60 ? "…" : ""}"</div>}
                </div>
              ))}
            </div>
          </div>

          {/* ── NPC List ── */}
          <div className="hud" style={{ position: "absolute", top: "calc(50vh - 10px)", right: 12, zIndex: 100, width: 280, maxHeight: "calc(50vh - 60px)", display: "flex", flexDirection: "column", background: "rgba(5,5,20,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#88aaff", fontSize: 12, fontWeight: 700 }}>👥 CIDADÃOS ({npcList.length})</div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {npcList.map(n => (
                <div key={n.id}
                  onClick={() => { setActiveChatNPC(n.id); setChatMode("individual"); }}
                  style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)", background: activeChatNPC === n.id ? "rgba(136,170,255,0.12)" : "transparent" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: n.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: n.color, fontWeight: 700, fontSize: 12 }}>{n.gender === "female" ? "👩" : "👨"} {n.name}</div>
                    <div style={{ color: "#667", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.emotion}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Chat panel ── */}
          <div className="hud" style={{ position: "absolute", bottom: isMobile ? 140 : 80, left: 12, zIndex: 100, width: Math.min(340, window.innerWidth - 24), background: "rgba(5,5,20,0.9)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden", maxHeight: 280 }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: "#88aaff", fontSize: 12, fontWeight: 700 }}>💬 CHAT</span>
              <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                <button onClick={() => setChatMode("individual")} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${chatMode === "individual" ? "#88aaff" : "rgba(255,255,255,0.1)"}`, background: chatMode === "individual" ? "rgba(136,170,255,0.2)" : "transparent", color: chatMode === "individual" ? "#88aaff" : "#556", fontSize: 10, cursor: "pointer" }}>Individual</button>
                <button onClick={() => { setChatMode("all"); setActiveChatNPC(null); }} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${chatMode === "all" ? "#88aaff" : "rgba(255,255,255,0.1)"}`, background: chatMode === "all" ? "rgba(136,170,255,0.2)" : "transparent", color: chatMode === "all" ? "#88aaff" : "#556", fontSize: 10, cursor: "pointer" }}>Todos</button>
              </div>
            </div>
            {chatMode === "individual" && !activeChatNPC && (
              <div style={{ padding: "10px 12px", color: "#445", fontSize: 11, textAlign: "center" }}>Clique em um cidadão para conversar</div>
            )}
            {chatMode === "individual" && activeChatNPC && activeNpcInfo && (
              <div style={{ padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: activeNpcInfo.color }} />
                <span style={{ color: activeNpcInfo.color, fontSize: 12, fontWeight: 700 }}>{activeNpcInfo.name}</span>
                <span style={{ color: "#556", fontSize: 10 }}>{activeNpcInfo.emotion}</span>
                <button onClick={() => setActiveChatNPC(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#556", cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            )}
            <div style={{ overflowY: "auto", flex: 1, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
              {chatMessages.map(m => (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.from === "player" ? "flex-end" : "flex-start" }}>
                  {m.name && <div style={{ fontSize: 9, color: m.color ?? "#556", marginBottom: 1, paddingLeft: 2, paddingRight: 2 }}>{m.name}</div>}
                  <div style={{ background: m.from === "player" ? "rgba(136,170,255,0.2)" : "rgba(255,255,255,0.07)", borderRadius: 8, padding: "5px 9px", fontSize: 12, color: m.from === "player" ? "#ccddff" : "#dde", maxWidth: "85%", wordBreak: "break-word", border: m.forMe ? "1px solid #88aaff" : "1px solid rgba(255,255,255,0.05)" }}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 6 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendChat()}
                placeholder={chatMode === "all" ? "Falar com todos..." : activeChatNPC ? "Digite sua mensagem..." : "Selecione uma IA primeiro"}
                disabled={chatMode === "individual" && !activeChatNPC}
                style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 10px", color: "#eee", fontSize: 12, outline: "none" }}
              />
              <button onClick={sendChat} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#4466ff", color: "#fff", cursor: "pointer", fontSize: 14 }}>↑</button>
            </div>
          </div>

          {/* ── Drawing toolbar ── */}
          {drawMode && (
            <div className="hud" style={{ position: "absolute", bottom: isMobile ? 140 : 80, left: "50%", transform: "translateX(-50%)", zIndex: 150, display: "flex", gap: 6, background: "rgba(5,5,20,0.92)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 30, padding: "7px 14px", alignItems: "center" }}>
              {(["pen", "circle", "rect", "eraser"] as const).map(tool => (
                <button key={tool} onClick={() => setDrawTool(tool)} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${drawTool === tool ? "#88aaff" : "rgba(255,255,255,0.1)"}`, background: drawTool === tool ? "rgba(136,170,255,0.2)" : "transparent", color: drawTool === tool ? "#88aaff" : "#667", cursor: "pointer", fontSize: 11 }}>
                  {tool === "pen" ? "✏️" : tool === "circle" ? "⭕" : tool === "rect" ? "▭" : "🧹"}
                </button>
              ))}
              <input type="color" value={drawColor} onChange={e => setDrawColor(e.target.value)} style={{ width: 30, height: 30, padding: 0, border: "none", borderRadius: 6, cursor: "pointer", background: "transparent" }} />
              <input type="range" min={1} max={20} value={drawSize} onChange={e => setDrawSize(+e.target.value)} style={{ width: 60 }} />
              <button onClick={() => sendDrawCmd({ type: "clear" })} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(255,80,80,0.3)", background: "rgba(255,80,80,0.1)", color: "#f88", cursor: "pointer", fontSize: 11 }}>Limpar</button>
              {drawClearIn !== null && <span style={{ color: "#667", fontSize: 10 }}>Apaga em ~{drawClearIn}min</span>}
              <button onClick={() => setDrawMode(false)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#667", cursor: "pointer", fontSize: 11 }}>✕ Sair</button>
            </div>
          )}

          {/* ── Build palette ── */}
          {buildPaletteOpen && (
            <div className="hud" style={{ position: "absolute", bottom: isMobile ? 140 : 80, left: "50%", transform: "translateX(-50%)", zIndex: 150, background: "rgba(5,5,20,0.95)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "10px 12px", maxWidth: "min(96vw, 680px)", maxHeight: "55vh", overflowY: "auto" }}>
              <div style={{ color: "#88aaff", fontWeight: 700, fontSize: 12, marginBottom: 8 }}>🔨 FERRAMENTAS DE CONSTRUÇÃO ({OBJECT_TYPES.length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {OBJECT_TYPES.map(t => (
                  <button key={t.id} onClick={() => placeObject(t.id)}
                    style={{ padding: "5px 9px", borderRadius: 8, border: `1px solid ${selectedBuildType === t.id ? "#88aaff" : "rgba(255,255,255,0.12)"}`, background: selectedBuildType === t.id ? "rgba(136,170,255,0.2)" : "rgba(255,255,255,0.04)", color: selectedBuildType === t.id ? "#88aaff" : "#aab", cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}
                    onMouseEnter={() => setSelectedBuildType(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#556", fontSize: 11 }}>Cor:</span>
                <input type="color" value={drawColor} onChange={e => setDrawColor(e.target.value)} style={{ width: 28, height: 28, border: "none", borderRadius: 6, cursor: "pointer", padding: 0 }} />
                <button onClick={() => setBuildPaletteOpen(false)} style={{ marginLeft: "auto", padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#667", cursor: "pointer", fontSize: 11 }}>✕ Fechar</button>
              </div>
            </div>
          )}

          {/* ── Bottom action bar ── */}
          <div className="hud" style={{ position: "absolute", bottom: isMobile ? 135 : 20, left: "50%", transform: "translateX(-50%)", zIndex: 100, display: "flex", gap: 8, background: "rgba(5,5,20,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 30, padding: "6px 14px" }}>
            <button onClick={() => { setBuildPaletteOpen(p => !p); setDrawMode(false); }}
              style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${buildPaletteOpen ? "#88aaff" : "rgba(255,255,255,0.15)"}`, background: buildPaletteOpen ? "rgba(136,170,255,0.2)" : "transparent", color: buildPaletteOpen ? "#88aaff" : "#778", cursor: "pointer", fontSize: 13 }}>
              🔨 Construir
            </button>
            <button onClick={() => { setDrawMode(p => !p); setBuildPaletteOpen(false); }}
              style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${drawMode ? "#ff88aa" : "rgba(255,255,255,0.15)"}`, background: drawMode ? "rgba(255,136,170,0.2)" : "transparent", color: drawMode ? "#ff88aa" : "#778", cursor: "pointer", fontSize: 13 }}>
              🎨 Desenhar
            </button>
            <button onClick={() => { setChatMode("all"); setActiveChatNPC(null); }}
              style={{ padding: "7px 14px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#778", cursor: "pointer", fontSize: 13 }}>
              📢 Todos
            </button>
          </div>

          {/* ── Minimap ── */}
          <div className="hud" style={{ position: "absolute", bottom: isMobile ? 135 : 20, right: 12, zIndex: 100 }}>
            <canvas ref={minimapRef} width={120} height={120} style={{ borderRadius: 10, border: "1px solid rgba(100,100,200,0.3)", display: "block" }} />
            <div style={{ textAlign: "center", color: "#334", fontSize: 9, marginTop: 2 }}>mapa</div>
          </div>

          {/* ── Toasts ── */}
          <div style={{ position: "absolute", top: 56, right: 12, zIndex: 300, display: "flex", flexDirection: "column", gap: 6, pointerEvents: "none" }}>
            {toasts.map(t => (
              <div key={t.id} style={{ background: "rgba(5,5,20,0.92)", border: `1px solid ${t.color}44`, borderLeft: `3px solid ${t.color}`, borderRadius: 10, padding: "8px 12px", color: "#ccd", fontSize: 12, maxWidth: 260, wordBreak: "break-word", animation: "fadeIn 0.3s" }}>
                {t.text}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Mobile Joystick ── */}
      <div className="joystick-zone hud" ref={joystickElemRef}
        onTouchStart={onJoyStart} onTouchMove={onJoyMove} onTouchEnd={onJoyEnd}
        style={{ position: "absolute", bottom: 24, left: 24, zIndex: 200, width: 110, height: 110, borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: "2px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}>
        <div ref={joystickKnobRef} style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(136,170,255,0.4)", border: "2px solid rgba(136,170,255,0.6)", transition: "transform 0.05s", pointerEvents: "none" }} />
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
      `}</style>
    </div>
  );
}
