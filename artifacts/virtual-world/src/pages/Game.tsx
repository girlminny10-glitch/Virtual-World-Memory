import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

// ─── Types ────────────────────────────────────────────────────────────────────
type Pos = { x: number; z: number };
type Outfit = { top: string; bottom: string; hair: string; accessory: string };
type NpcState = {
  id: string; name: string; color: string; gender: "female" | "male";
  position: Pos; emotion: string; personality: string;
  currentAction?: string; outfit: Outfit;
};
type WorldObject = { id: string; type: string; position: Pos; creator: string; creatorColor: string; description: string; color?: string; scale?: number };
type Msg = { id: string; who: string; text: string; color: string; mine?: boolean; typing?: boolean };
type ConvFeed = { fromName: string; fromColor: string; toName: string; toColor: string; message: string; response: string; ts: number };
type DrawCmd = { type: "line" | "circle" | "rect" | "clear"; x?: number; y?: number; x2?: number; y2?: number; color?: string; size?: number };
type WeatherType = "sunny" | "rain" | "storm" | "party" | "foggy" | "night" | "dawn";

const WS_URL = window.location.origin.replace(/^http/, "ws") + "/api/ws";
const WORLD_SIZE = 300;
const DRAW_TTL = 30 * 60 * 1000;

// ─── Build categories ─────────────────────────────────────────────────────────
const BUILD_CATEGORIES: Record<string, { types: string[]; emoji: string }> = {
  "Estruturas": { emoji: "🏠", types: ["house","cabin","tower","lighthouse","dome","arch","pyramid","obelisk","bridge"] },
  "Natureza":   { emoji: "🌿", types: ["tree","flower_bed","garden","rock","mushroom","fountain","well"] },
  "Arte":       { emoji: "🎨", types: ["crystal","portal","spiral","star_monument","monument","painting","totem","cube_art","sphere_art"] },
  "Mobília":    { emoji: "🪑", types: ["bench","table","chair","lamp_post","fence","gate","swing"] },
  "Veículos":   { emoji: "🚗", types: ["car","boat"] },
  "Especial":   { emoji: "✨", types: ["statue","pyramid","lighthouse","obelisk"] },
};

const OBJ_EMOJI: Record<string, string> = {
  house:"🏠", tower:"🗼", fountain:"⛲", garden:"🌸", monument:"🗽", chair:"🪑", table:"🪵",
  lamp_post:"💡", arch:"🌉", pyramid:"🔺", totem:"🪆", well:"🪣", bench:"🪑", crystal:"💎",
  portal:"🌀", statue:"🗿", painting:"🖼️", car:"🚗", boat:"⛵", tree:"🌲", rock:"🪨",
  fence:"🚧", gate:"🚪", swing:"🎡", mushroom:"🍄", star_monument:"⭐", flower_bed:"🌺",
  bridge:"🌉", dome:"🏛️", spiral:"🌀", cube_art:"📦", sphere_art:"🔮", obelisk:"🗼",
  cabin:"🏡", lighthouse:"🏮",
};

// ─── Three.js helpers ─────────────────────────────────────────────────────────
function makeBubble(text: string, color: string, emote = "💬"): THREE.Sprite {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 112;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "rgba(4,4,16,0.92)";
  ctx.beginPath(); ctx.roundRect(0,0,512,112,12); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(1,1,510,110,12); ctx.stroke();
  ctx.font = "24px sans-serif"; ctx.fillText(emote, 10, 44);
  ctx.font = "bold 18px system-ui,sans-serif"; ctx.fillStyle = "#fff";
  const words = text.split(" "); let line = ""; let y = 36;
  for (const w of words) {
    const test = line + w + " ";
    if (ctx.measureText(test).width > 440 && line) { ctx.fillText(line, 44, y); line = w + " "; y += 24; if (y > 90) break; }
    else line = test;
  }
  ctx.fillText(line, 44, y);
  const tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(7.5, 1.65, 1); return sp;
}

function buildChar(colorHex: string | number, gender: "female" | "male", isSelf = false): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.Color(colorHex);
  const bodyMat = new THREE.MeshLambertMaterial({ color: c });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xf4c2a1 });
  const hairMat = new THREE.MeshLambertMaterial({ color: isSelf ? 0x3d1c02 : (Math.random() > 0.5 ? 0x1a0900 : 0xd4a017) });
  const legMat  = new THREE.MeshLambertMaterial({ color: gender === "female" ? 0xdd6699 : 0x223355 });

  const legG = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8);
  [-.17,.17].forEach(x => { const l = new THREE.Mesh(legG, legMat); l.position.set(x,.35,0); l.castShadow=true; g.add(l); });

  if (gender === "female") {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.48,0.58,0.6,12), bodyMat);
    skirt.position.set(0,.9,0); skirt.castShadow=true; g.add(skirt);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.34,0.68,10), bodyMat);
    torso.position.set(0,1.44,0); torso.castShadow=true; g.add(torso);
  } else {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72,0.76,0.42), bodyMat);
    torso.position.set(0,1.34,0); torso.castShadow=true; g.add(torso);
  }

  const armG = new THREE.CylinderGeometry(0.1,0.09,0.64,8);
  [gender==="female"?-.42:-.48, gender==="female"?.42:.48].forEach((x,i) => {
    const a = new THREE.Mesh(armG, bodyMat); a.position.set(x,1.34,0); a.rotation.z = i===0?.2:-.2; a.castShadow=true; g.add(a);
  });

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.2), new THREE.MeshLambertMaterial({ color: 0xf4c2a1 }));
  neck.position.y = 1.78; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.32,16,16), skinMat); head.position.set(0,2.22,0); head.castShadow=true; g.add(head);

  const eyeM = new THREE.MeshBasicMaterial({color:0x111111});
  const eyeG = new THREE.SphereGeometry(.055,8,8);
  [-.1,.1].forEach(ex => { const e = new THREE.Mesh(eyeG,eyeM); e.position.set(ex,2.25,.28); g.add(e); });

  if (gender === "female") {
    const ht = new THREE.Mesh(new THREE.SphereGeometry(.34,12,8,0,Math.PI*2,0,Math.PI/2),hairMat); ht.position.set(0,2.22,0); g.add(ht);
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(.2,.14,.7,8),hairMat); hb.position.set(0,1.9,-.22); g.add(hb);
  } else {
    const ht = new THREE.Mesh(new THREE.SphereGeometry(.33,12,6,0,Math.PI*2,0,Math.PI*.6),hairMat); ht.position.set(0,2.22,0); g.add(ht);
  }

  if (isSelf) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.55,.06,8,24), new THREE.MeshBasicMaterial({color:0x00ffff,transparent:true,opacity:.6}));
    ring.rotation.x = Math.PI/2; ring.position.y = .05; g.add(ring);
  }
  return g;
}

function spawnObj(obj: WorldObject, scene: THREE.Scene, ref: Record<string, THREE.Group>) {
  if (ref[obj.id]) return;
  const grp = new THREE.Group(); grp.position.set(obj.position.x,0,obj.position.z);
  const col = new THREE.Color(obj.color ?? obj.creatorColor ?? "#88aaff");
  const sc = obj.scale ?? 1;
  const m = (c: number | THREE.Color | string) => new THREE.MeshLambertMaterial({color:c});
  const t = obj.type;
  const add = (mesh: THREE.Mesh, y=0,x=0,z=0) => { mesh.position.set(x,y,z); mesh.castShadow=true; grp.add(mesh); };

  if (t==="house"||t==="cabin") {
    add(new THREE.Mesh(new THREE.BoxGeometry(4*sc,3*sc,4*sc), m(t==="cabin"?0x8B5E3C:col)), 1.5*sc);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2*sc,2*sc,4), m(0x884422)); roof.position.y=(3+1)*sc; roof.rotation.y=Math.PI/4; roof.castShadow=true; grp.add(roof);
  } else if (t==="tower"||t==="lighthouse"||t==="obelisk") {
    add(new THREE.Mesh(new THREE.CylinderGeometry(t==="obelisk"?.6:1.4*sc,t==="obelisk"?.9:2*sc,t==="obelisk"?10*sc:9*sc,t==="obelisk"?4:10),m(col)), 4.5*sc);
    add(new THREE.Mesh(new THREE.SphereGeometry(1.2*sc,12,12),m(t==="lighthouse"?0xff4400:0x4466aa)), 9.5*sc);
  } else if (t==="fountain") {
    add(new THREE.Mesh(new THREE.CylinderGeometry(2.5*sc,2*sc,.6*sc,16),m(0xcccccc)), .3*sc);
    add(new THREE.Mesh(new THREE.CylinderGeometry(2.2*sc,2.2*sc,.3*sc,16),new THREE.MeshLambertMaterial({color:0x44aaff,transparent:true,opacity:.75})), .6*sc);
    add(new THREE.Mesh(new THREE.CylinderGeometry(.2*sc,.3*sc,1.5*sc,8),m(0xcccccc)), 1.1*sc);
  } else if (t==="garden"||t==="flower_bed") {
    for(let i=0;i<12;i++){
      const ox=(Math.random()-.5)*5*sc,oz=(Math.random()-.5)*5*sc;
      add(new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.5,6),m(0x226622)), .25,ox,oz);
      add(new THREE.Mesh(new THREE.SphereGeometry(.22*sc,8,8),new THREE.MeshLambertMaterial({color:new THREE.Color().setHSL(Math.random(),.9,.6)})), .55,ox,oz);
    }
  } else if (t==="crystal") {
    for(let i=0;i<5;i++){
      const cry=new THREE.Mesh(new THREE.OctahedronGeometry((.3+Math.random()*.4)*sc),new THREE.MeshLambertMaterial({color:col,transparent:true,opacity:.8}));
      cry.position.set((Math.random()-.5)*2,.5+i*.5,(Math.random()-.5)*2); cry.rotation.set(Math.random(),Math.random(),Math.random()); grp.add(cry);
    }
  } else if (t==="portal") {
    add(new THREE.Mesh(new THREE.TorusGeometry(1.8*sc,.22*sc,12,40),m(col)), 2*sc);
    add(new THREE.Mesh(new THREE.CircleGeometry(1.6*sc,32),new THREE.MeshLambertMaterial({color:col,transparent:true,opacity:.4,side:THREE.DoubleSide})), 2*sc);
  } else if (t==="tree") {
    add(new THREE.Mesh(new THREE.CylinderGeometry(.22*sc,.35*sc,2.5*sc,8),m(0x664422)), 1.25*sc);
    for(let i=0;i<3;i++) add(new THREE.Mesh(new THREE.ConeGeometry((1.8-i*.3)*sc,1.6*sc,8),m(0x226622)), (2+i*1.3)*sc);
  } else if (t==="monument"||t==="star_monument") {
    add(new THREE.Mesh(new THREE.BoxGeometry(1.2*sc,5*sc,1.2*sc),m(0x444444)), 2.5*sc);
    add(new THREE.Mesh(t==="star_monument"?new THREE.OctahedronGeometry(1*sc):new THREE.TorusKnotGeometry(.7*sc,.22*sc,64,8),m(0xffdd44)), 5.5*sc);
  } else if (t==="arch") {
    add(new THREE.Mesh(new THREE.BoxGeometry(.6*sc,4*sc,.6*sc),m(col)), 2*sc,-1.8*sc,0);
    add(new THREE.Mesh(new THREE.BoxGeometry(.6*sc,4*sc,.6*sc),m(col)), 2*sc,1.8*sc,0);
    add(new THREE.Mesh(new THREE.BoxGeometry(4.2*sc,.6*sc,.6*sc),m(col)), 4.3*sc);
  } else if (t==="pyramid") {
    const pyr=new THREE.Mesh(new THREE.ConeGeometry(3*sc,5*sc,4),m(col)); pyr.position.y=2.5*sc; pyr.rotation.y=Math.PI/4; pyr.castShadow=true; grp.add(pyr);
  } else if (t==="mushroom") {
    add(new THREE.Mesh(new THREE.CylinderGeometry(.3*sc,.4*sc,1.5*sc,8),m(0xddccaa)), .75*sc);
    add(new THREE.Mesh(new THREE.SphereGeometry(1.4*sc,12,12,0,Math.PI*2,0,Math.PI*.55),m(col)), 1.8*sc);
  } else if (t==="dome") {
    grp.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(2.5*sc,16,16,0,Math.PI*2,0,Math.PI/2),new THREE.MeshLambertMaterial({color:col,transparent:true,opacity:.6,side:THREE.DoubleSide})),{position:new THREE.Vector3(0,.1,0)}));
  } else if (t==="statue") {
    add(new THREE.Mesh(new THREE.BoxGeometry(1.5*sc,.4*sc,1.5*sc),m(0x666666)), .2*sc);
    add(new THREE.Mesh(new THREE.CylinderGeometry(.4*sc,.5*sc,3*sc,8),m(0xaaaaaa)), 1.5*sc);
    add(new THREE.Mesh(new THREE.SphereGeometry(.5*sc,12,12),m(0xaaaaaa)), 3.5*sc);
  } else if (t==="spiral") {
    for(let i=0;i<24;i++){const r=i/24,ang=r*Math.PI*6,rad=r*2.5*sc,h=r*5*sc;const s=new THREE.Mesh(new THREE.SphereGeometry(.18*sc,6,6),m(col));s.position.set(Math.cos(ang)*rad,h,Math.sin(ang)*rad);grp.add(s);}
  } else if (t==="car") {
    add(new THREE.Mesh(new THREE.BoxGeometry(3.5*sc,.8*sc,1.8*sc),m(col)), .7*sc);
    add(new THREE.Mesh(new THREE.BoxGeometry(2.2*sc,.7*sc,1.6*sc),m(col)), 1.5*sc);
    for(const[wx,wz] of[[-1.3,-.8],[1.3,-.8],[-1.3,.8],[1.3,.8]]){
      const w=new THREE.Mesh(new THREE.TorusGeometry(.38*sc,.15*sc,8,18),m(0x111111));w.rotation.x=Math.PI/2;w.position.set(wx*sc,.4*sc,wz*sc);grp.add(w);
    }
  } else if (t==="bench") {
    add(new THREE.Mesh(new THREE.BoxGeometry(2.5*sc,.18*sc,.8*sc),m(0x885533)), .7*sc);
    add(new THREE.Mesh(new THREE.BoxGeometry(2.5*sc,.9*sc,.12*sc),m(0x885533)), 1.2*sc,0,-.34*sc);
  } else if (t==="table") {
    add(new THREE.Mesh(new THREE.BoxGeometry(3*sc,.15*sc,1.8*sc),m(col)), 1.1*sc);
    for(const[lx,lz] of[[-1.3,-.7],[1.3,-.7],[-1.3,.7],[1.3,.7]]){const l=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,1.1*sc,6),m(col));l.position.set(lx*sc,.55*sc,lz*sc);grp.add(l);}
  } else if (t==="lamp_post") {
    add(new THREE.Mesh(new THREE.CylinderGeometry(.1,.14,5*sc,8),m(0x444444)), 2.5*sc);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.35*sc,12,12),new THREE.MeshBasicMaterial({color:0xffffaa}));lamp.position.y=5.2*sc;grp.add(lamp);
    const glow = new THREE.PointLight(0xffffaa, 0.8, 15*sc); glow.position.y=5.2*sc; grp.add(glow);
  } else if (t==="boat") {
    const hull=new THREE.Mesh(new THREE.CylinderGeometry(.8*sc,1.2*sc,3*sc,8),m(col));hull.rotation.z=Math.PI/2;hull.position.y=.6*sc;grp.add(hull);
    add(new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,3*sc,6),m(0x885533)), 2.5*sc);
  } else if (t==="bridge") {
    add(new THREE.Mesh(new THREE.BoxGeometry(8*sc,.3*sc,2*sc),m(col)), 2*sc);
    for(const bx of[-3.5*sc,3.5*sc]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.25*sc,.3*sc,2*sc,8),m(col));p.position.set(bx,1*sc,0);grp.add(p);}
  } else if (t==="well") {
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1*sc,.3*sc,8,20),m(0x888888));ring.rotation.x=Math.PI/2;ring.position.y=.5*sc;grp.add(ring);
    add(new THREE.Mesh(new THREE.CylinderGeometry(.15*sc,.15*sc,2*sc,8),m(0x664422)), 2*sc);
  } else if (t==="rock") {
    for(let i=0;i<4;i++){const r=new THREE.Mesh(new THREE.DodecahedronGeometry((.4+Math.random()*.5)*sc),m(0x777777));r.position.set((Math.random()-.5)*1.5,.3,(Math.random()-.5)*1.5);r.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);r.castShadow=true;grp.add(r);}
  } else if (t==="cube_art") {
    for(let i=0;i<5;i++){const cube=new THREE.Mesh(new THREE.BoxGeometry(.8*sc,.8*sc,.8*sc),m(new THREE.Color().setHSL(i/5,.8,.5)));cube.position.set((Math.random()-.5)*3,i*.9+.4,(Math.random()-.5)*3);cube.rotation.set(Math.random(),Math.random(),0);grp.add(cube);}
  } else if (t==="sphere_art") {
    for(let i=0;i<7;i++){const s=new THREE.Mesh(new THREE.SphereGeometry((.3+Math.random()*.5)*sc,8,8),new THREE.MeshLambertMaterial({color:new THREE.Color().setHSL(i/7,.9,.6),transparent:true,opacity:.85}));s.position.set(Math.cos(i/7*Math.PI*2)*2,1+i*.3,Math.sin(i/7*Math.PI*2)*2);grp.add(s);}
  } else if (t==="totem") {
    for(let i=0;i<4;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(1.2*sc,1.4*sc,1.2*sc),m(new THREE.Color().setHSL(i/4,.8,.4)));b.position.y=(i*1.4+.7)*sc;b.castShadow=true;grp.add(b);}
  } else if (t==="swing") {
    add(new THREE.Mesh(new THREE.BoxGeometry(3*sc,.15*sc,.15*sc),m(0x664422)), 3.5*sc);
    [-.9,.9].forEach(x=>{const r=new THREE.Mesh(new THREE.BoxGeometry(.08*sc,3*sc,.08*sc),m(0xaaaaaa));r.position.set(x*sc,2*sc,0);grp.add(r);});
    add(new THREE.Mesh(new THREE.BoxGeometry(1.5*sc,.2*sc,.4*sc),m(col)), .5*sc);
  } else if (t==="fence") {
    for(let i=0;i<6;i++){const p=new THREE.Mesh(new THREE.BoxGeometry(.15*sc,2*sc,.15*sc),m(0x885533));p.position.set((i-2.5)*1.5*sc,1*sc,0);p.castShadow=true;grp.add(p);}
    add(new THREE.Mesh(new THREE.BoxGeometry(9*sc,.15*sc,.15*sc),m(0x885533)), 1.5*sc);
    add(new THREE.Mesh(new THREE.BoxGeometry(9*sc,.15*sc,.15*sc),m(0x885533)), 0.7*sc);
  } else if (t==="gate") {
    [-.2,.2].forEach(s=>{const p=new THREE.Mesh(new THREE.BoxGeometry(.3*sc,4*sc,.3*sc),m(0x554433));p.position.set(s*12*sc,2*sc,0);p.castShadow=true;grp.add(p);});
    add(new THREE.Mesh(new THREE.BoxGeometry(5*sc,.3*sc,.3*sc),m(0x443322)), 4.2*sc);
  } else if (t==="painting") {
    add(new THREE.Mesh(new THREE.BoxGeometry(3*sc,2.5*sc,.1*sc),m(0x222222)), 2.5*sc);
    add(new THREE.Mesh(new THREE.PlaneGeometry(2.6*sc,2.1*sc),new THREE.MeshBasicMaterial({color:col,side:THREE.DoubleSide})), 2.5*sc,0,.06*sc);
  } else {
    add(new THREE.Mesh(new THREE.BoxGeometry(2*sc,2.5*sc,2*sc),m(col)), 1.25*sc);
  }

  grp.scale.set(.01,.01,.01);
  scene.add(grp); ref[obj.id] = grp;
}

function applyDraw(ctx: CanvasRenderingContext2D, cmd: DrawCmd) {
  if (cmd.type === "clear") { ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height); return; }
  ctx.strokeStyle = ctx.fillStyle = cmd.color ?? "#ff88aa";
  ctx.lineWidth = cmd.size ?? 4; ctx.lineCap = "round";
  if (cmd.type==="line" && cmd.x!==undefined) { ctx.beginPath(); ctx.moveTo(cmd.x,cmd.y!); ctx.lineTo(cmd.x2!,cmd.y2!); ctx.stroke(); }
  else if (cmd.type==="circle" && cmd.x!==undefined) { ctx.beginPath(); ctx.arc(cmd.x,cmd.y!,(cmd.size??4)*3,0,Math.PI*2); ctx.stroke(); }
}

// ─── Name Entry ───────────────────────────────────────────────────────────────
function NameEntry({ onStart }: { onStart: (n: string, g: "female"|"male") => void }) {
  const [name, setName] = useState("Minny");
  const [gender, setGender] = useState<"female"|"male">("female");
  return (
    <div style={{position:"fixed",inset:0,background:"linear-gradient(135deg,#0a0a1e,#151535)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
      <div style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:20,padding:"2.5rem 2.8rem",width:340,textAlign:"center",boxShadow:"0 16px 64px rgba(0,0,0,0.7)"}}>
        <div style={{fontSize:52,marginBottom:8}}>🌍</div>
        <h1 style={{color:"#88aaff",fontSize:22,fontWeight:700,margin:"0 0 6px"}}>Virtual World 3D</h1>
        <p style={{color:"#556",fontSize:12,margin:"0 0 26px"}}>5 IAs com memória e personalidade própria te esperam</p>
        <input value={name} onChange={e=>setName(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&name.trim()&&onStart(name.trim(),gender)}
          style={{width:"100%",boxSizing:"border-box",padding:"10px 14px",borderRadius:10,border:"1px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.07)",color:"#fff",fontSize:15,outline:"none",marginBottom:14}}
          placeholder="Seu nome..." maxLength={20} autoFocus />
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          {(["female","male"] as const).map(g=>(
            <button key={g} onClick={()=>setGender(g)}
              style={{flex:1,padding:"9px 0",borderRadius:10,border:`2px solid ${gender===g?"#88aaff":"rgba(255,255,255,0.1)"}`,background:gender===g?"rgba(136,170,255,0.15)":"transparent",color:gender===g?"#88aaff":"#556",cursor:"pointer",fontSize:14,fontWeight:gender===g?700:400}}>
              {g==="female"?"👩 Feminino":"👨 Masculino"}
            </button>
          ))}
        </div>
        <button disabled={!name.trim()} onClick={()=>onStart(name.trim(),gender)}
          style={{width:"100%",padding:"12px 0",borderRadius:12,border:"none",background:name.trim()?"linear-gradient(90deg,#3355ee,#7799ff)":"rgba(255,255,255,0.08)",color:name.trim()?"#fff":"#444",cursor:name.trim()?"pointer":"default",fontSize:15,fontWeight:700}}>
          Entrar no Mundo →
        </button>
      </div>
    </div>
  );
}

// ─── Main Game ────────────────────────────────────────────────────────────────
export default function Game() {
  const [started, setStarted]   = useState(false);
  const [pName, setPName]       = useState("Minny");
  const [pGender, setPGender]   = useState<"female"|"male">("female");

  const containerRef  = useRef<HTMLDivElement>(null);
  const minimapRef    = useRef<HTMLCanvasElement>(null);
  const drawRef       = useRef<HTMLCanvasElement>(null);

  // UI state
  const [uiOn,      setUiOn]      = useState(true);
  const [drawOn,    setDrawOn]    = useState(false);
  const [drawColor, setDrawColor] = useState("#ff66aa");
  const [drawSz,    setDrawSz]    = useState(4);
  const [drawMin,   setDrawMin]   = useState<number|null>(null);
  const [chatTarget,setChatTarget]= useState<string|null>(null);
  const [msgs,      setMsgs]      = useState<Msg[]>([]);
  const [feed,      setFeed]      = useState<ConvFeed[]>([]);
  const [npcList,   setNpcList]   = useState<NpcState[]>([]);
  const [input,     setInput]     = useState("");
  const [toasts,    setToasts]    = useState<{id:string;text:string;color:string}[]>([]);
  const [mention,   setMention]   = useState<{name:string;text:string}|null>(null);
  const [tab,       setTab]       = useState<"chat"|"feed"|"npcs">("chat");

  // New: build panel
  const [showBuild,    setShowBuild]    = useState(false);
  const [buildCat,     setBuildCat]    = useState("Estruturas");
  const [buildType,    setBuildType]   = useState("house");
  const [buildColor,   setBuildColor]  = useState("#4488ff");
  const [buildScale,   setBuildScale]  = useState(1.0);

  // New: weather/time
  const [weather,   setWeather]   = useState<WeatherType>("sunny");
  const [timeLabel, setTimeLabel] = useState("☀️ Dia");

  // Three.js refs
  const sceneRef    = useRef<THREE.Scene|null>(null);
  const cameraRef   = useRef<THREE.PerspectiveCamera|null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer|null>(null);
  const wsRef       = useRef<WebSocket|null>(null);
  const pidRef      = useRef<string|null>(null);
  const npcsR       = useRef<Record<string,{group:THREE.Group;state:NpcState&{targetPos?:Pos};bubble?:THREE.Sprite;bTimer?:number}>>({});
  const objsR       = useRef<Record<string,THREE.Group>>({});
  const playerR     = useRef<{group:THREE.Group;pos:Pos}>({group:new THREE.Group(),pos:{x:0,z:0}});
  const othersR     = useRef<Record<string,{group:THREE.Group;pos:Pos}>>({});
  const keys        = useRef({w:false,a:false,s:false,d:false});
  const cam         = useRef({h:0,v:.45,dist:18,drag:false,lx:0,ly:0});
  const joy         = useRef({on:false,cx:0,cy:0,dx:0,dy:0});
  const joyKnob     = useRef<HTMLDivElement>(null);
  const lastSend    = useRef(0);
  const drawPt      = useRef<{x:number;y:number}|null>(null);
  const drawing     = useRef(false);
  const drawTimer   = useRef<number|null>(null);
  const chatMsgsRef = useRef<HTMLDivElement>(null);
  // New refs
  const sunRef      = useRef<THREE.DirectionalLight|null>(null);
  const ambRef      = useRef<THREE.AmbientLight|null>(null);
  const hemRef      = useRef<THREE.HemisphereLight|null>(null);
  const rainRef     = useRef<THREE.Points|null>(null);
  const worldTimeRef = useRef(0.3); // 0=midnight,0.3=day,0.7=sunset,1=midnight
  const weatherRef  = useRef<WeatherType>("sunny");
  const wsReadyRef  = useRef(false);
  const reconnectRef = useRef<number|null>(null);
  const npcListRef  = useRef<NpcState[]>([]);

  const toast = useCallback((text:string, color:string) => {
    const id = Date.now().toString();
    setToasts(p=>[...p,{id,text,color}].slice(-4));
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)), 5000);
  },[]);

  const addMsg = useCallback((msg: Msg) => {
    setMsgs(p=>[...p,msg].slice(-50));
    setTimeout(()=>{ chatMsgsRef.current?.scrollTo(0,99999); },50);
  },[]);

  const scheduleDrawClear = useCallback(() => {
    if (drawTimer.current) clearTimeout(drawTimer.current);
    setDrawMin(30);
    let rem = 30;
    const tick = setInterval(()=>{ rem--; if(rem<=0){clearInterval(tick);setDrawMin(null);}else setDrawMin(rem); },60000);
    drawTimer.current = window.setTimeout(()=>{
      clearInterval(tick);
      const cv = drawRef.current; if(cv){const ctx=cv.getContext("2d");ctx?.clearRect(0,0,cv.width,cv.height);}
      setDrawMin(null);
    }, DRAW_TTL);
  },[]);

  const sendDraw = useCallback((cmd: DrawCmd) => {
    const cv = drawRef.current; if(!cv) return;
    const ctx = cv.getContext("2d"); if(!ctx) return;
    applyDraw(ctx,cmd);
    wsRef.current?.send(JSON.stringify({type:"canvas-drawing",drawing:cmd}));
    scheduleDrawClear();
  },[scheduleDrawClear]);

  const updateMinimap = useCallback(() => {
    const cv = minimapRef.current; if(!cv) return;
    const ctx = cv.getContext("2d"); if(!ctx) return;
    const S=120, sc=S/WORLD_SIZE, off=S/2;
    ctx.clearRect(0,0,S,S);
    ctx.fillStyle="rgba(4,4,16,0.9)"; ctx.fillRect(0,0,S,S);
    ctx.strokeStyle="rgba(80,100,200,0.25)"; ctx.strokeRect(0,0,S,S);
    Object.values(npcsR.current).forEach(n=>{ ctx.fillStyle=n.state.color; ctx.beginPath(); ctx.arc(off+n.group.position.x*sc,off+n.group.position.z*sc,2.2,0,Math.PI*2); ctx.fill(); });
    Object.values(othersR.current).forEach(p=>{ ctx.fillStyle="#888"; ctx.beginPath(); ctx.arc(off+p.pos.x*sc,off+p.pos.z*sc,2,0,Math.PI*2); ctx.fill(); });
    ctx.fillStyle="#0ff"; ctx.strokeStyle="#fff"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(off+playerR.current.pos.x*sc,off+playerR.current.pos.z*sc,3,0,Math.PI*2); ctx.fill(); ctx.stroke();
  },[]);

  const handleStart = (n:string,g:"female"|"male")=>{ setPName(n); setPGender(g); setStarted(true); };

  // ─── Place object in world ──────────────────────────────────────────────────
  const placeObject = useCallback(() => {
    if (!wsRef.current || !wsReadyRef.current) return;
    const pos = {
      x: playerR.current.pos.x + (Math.random() - 0.5) * 12,
      z: playerR.current.pos.z + (Math.random() - 0.5) * 12,
    };
    wsRef.current.send(JSON.stringify({
      type: "player-create",
      objType: buildType,
      position: pos,
      color: buildColor,
      scale: buildScale,
    }));
    toast(`Você colocou um ${buildType} ${OBJ_EMOJI[buildType] ?? "🏗️"}`, buildColor);
    setShowBuild(false);
  }, [buildType, buildColor, buildScale, toast]);

  // ─── WebSocket connection ───────────────────────────────────────────────────
  const connectWS = useCallback((scene: THREE.Scene, pn: string, pg: "female"|"male") => {
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    wsReadyRef.current = false;

    ws.onopen = () => {
      wsReadyRef.current = true;
      ws.send(JSON.stringify({type:"player-name",name:pn,gender:pg}));
    };

    ws.onmessage = (e) => {
      try { handleWS(JSON.parse(e.data), scene); } catch{}
    };

    ws.onclose = () => {
      wsReadyRef.current = false;
      // Auto-reconnect after 3 seconds
      reconnectRef.current = window.setTimeout(() => {
        if (sceneRef.current) connectWS(scene, pn, pg);
      }, 3000);
    };

    ws.onerror = () => { ws.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── WebSocket message handler ──────────────────────────────────────────────
  const handleWS = useCallback((d: Record<string,unknown>, scene: THREE.Scene) => {
    switch(d.type as string) {
      case "init": {
        pidRef.current = d.playerId as string;
        const initNpcs = d.npcs as NpcState[];
        npcListRef.current = initNpcs;
        setNpcList(initNpcs);
        initNpcs.forEach(n=>{
          if (npcsR.current[n.id]) return;
          const g=buildChar(n.color,n.gender??"female");
          g.position.set(n.position.x,0,n.position.z); scene.add(g);
          npcsR.current[n.id]={group:g,state:n};
        });
        (d.worldObjects as WorldObject[]).forEach(o=>spawnObj(o,scene,objsR.current));
        if(d.recentConversations) setFeed(d.recentConversations as ConvFeed[]);
        break;
      }
      case "npc-move": {
        const n=npcsR.current[d.npcId as string];
        if(n&&d.targetPosition) {
          n.state.targetPos = d.targetPosition as Pos;
          n.state.emotion = d.emotion as string;
        }
        break;
      }
      case "npc-arrived": {
        // Don't teleport — just update final target so lerp completes smoothly
        const n=npcsR.current[d.npcId as string];
        if(n&&d.position) { n.state.targetPos = d.position as Pos; }
        break;
      }
      case "npc-thought": {
        const em=(d.emotion as string)?.match(/\p{Emoji}/u)?.[0]??"💭";
        const n=npcsR.current[d.npcId as string];
        if(n){
          if(n.bubble) scene.remove(n.bubble);
          const sp=makeBubble(d.thought as string,d.npcColor as string,em);
          sp.position.set(n.group.position.x,5,n.group.position.z);
          scene.add(sp); n.bubble=sp; n.bTimer=performance.now()+7000;
        }
        break;
      }
      case "npc-created-object": {
        spawnObj(d.object as WorldObject,scene,objsR.current);
        const em=(d.emotion as string)?.match(/\p{Emoji}/u)?.[0]??"✨";
        const n=npcsR.current[d.npcId as string];
        if(n){
          if(n.bubble) scene.remove(n.bubble);
          const sp=makeBubble(d.description as string,d.npcColor as string,em);
          sp.position.set(n.group.position.x,5,n.group.position.z);
          scene.add(sp); n.bubble=sp; n.bTimer=performance.now()+6000;
        }
        toast(`${d.npcName} criou: ${(d.description as string).slice(0,40)}`, d.npcColor as string);
        break;
      }
      case "world-object-removed": {
        const go=objsR.current[d.objectId as string];
        if(go){scene.remove(go);delete objsR.current[d.objectId as string];}
        break;
      }
      case "npc-response": {
        const npcEntry = npcsR.current[d.npcId as string];
        const em=(d.emotion as string)?.match(/\p{Emoji}/u)?.[0]??"💬";
        if(npcEntry){
          if(npcEntry.bubble) scene.remove(npcEntry.bubble);
          const sp=makeBubble(d.response as string,d.npcColor as string,em);
          sp.position.set(npcEntry.group.position.x,5,npcEntry.group.position.z);
          scene.add(sp); npcEntry.bubble=sp; npcEntry.bTimer=performance.now()+8000;
        }
        setMsgs(p=>[...p.filter(m=>!m.typing),{id:Date.now().toString(),who:d.npcName as string,text:d.response as string,color:d.npcColor as string}]);
        setNpcList(p=>{ const next = p.map(n=>n.id===d.npcId?{...n,emotion:d.emotion as string}:n); npcListRef.current=next; return next; });
        setTimeout(()=>chatMsgsRef.current?.scrollTo(0,99999),50);
        const resp = d.response as string;
        if(resp && resp.toLowerCase().includes("@"+pName.toLowerCase())){
          setMention({name:d.npcName as string,text:resp});
          setTimeout(()=>setMention(null),5000);
        }
        break;
      }
      case "player-joined": {
        if(d.playerId!==pidRef.current){
          const og=buildChar(0xaaaaaa,"female");
          og.position.set(0,0,0); scene.add(og);
          othersR.current[d.playerId as string]={group:og,pos:{x:0,z:0}};
          toast(`${(d.player as {name:string})?.name??"Alguém"} entrou 🌍`,"#88aaff");
        }
        break;
      }
      case "player-update": {
        const op=othersR.current[d.playerId as string];
        if(op&&d.position){op.pos=d.position as Pos;op.group.position.set((d.position as Pos).x,0,(d.position as Pos).z);}
        break;
      }
      case "player-left": {
        const op=othersR.current[d.playerId as string];
        if(op){scene.remove(op.group);delete othersR.current[d.playerId as string];}
        break;
      }
      case "player-broadcast": {
        if(d.playerId!==pidRef.current)
          addMsg({id:Date.now().toString(),who:d.playerName as string,text:d.message as string,color:"#88aaff"});
        break;
      }
      case "canvas-drawing": {
        const cv=drawRef.current; if(!cv) break;
        const ctx=cv.getContext("2d"); if(!ctx) break;
        applyDraw(ctx,d.drawing as DrawCmd); break;
      }
      case "npc-learned": {
        toast(`🧠 ${d.npcName} aprendeu algo novo!`, d.npcColor as string);
        break;
      }
      case "world-event": {
        const event = d.event as string;
        toast(`🌍 Evento: ${event}`, "#88aaff");
        // Map event to weather type
        if (event.includes("chuva") || event.includes("tempestade")) {
          setWeather(event.includes("tempestade") ? "storm" : "rain");
          weatherRef.current = event.includes("tempestade") ? "storm" : "rain";
        } else if (event.includes("noite")) {
          setWeather("night"); weatherRef.current = "night";
        } else if (event.includes("festa")) {
          setWeather("party"); weatherRef.current = "party";
        } else if (event.includes("amanhecer")) {
          setWeather("dawn"); weatherRef.current = "dawn";
        } else if (event.includes("neblina")) {
          setWeather("foggy"); weatherRef.current = "foggy";
        } else {
          setWeather("sunny"); weatherRef.current = "sunny";
        }
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[addMsg, pName, toast]);

  useEffect(()=>{
    if(!started||!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080818);
    scene.fog = new THREE.Fog(0x080818, 100, 320);
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,500);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({antialias:true}); }
    catch {
      containerRef.current.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:#080818;color:#88aaff;font-family:system-ui;gap:1rem;text-align:center;padding:2rem"><div style="font-size:3rem">🌐</div><b style="font-size:1.2rem">Virtual World 3D</b><div style="color:#444;font-size:.9rem">Abra em um navegador completo para jogar.<br/>WebGL não disponível nesta visualização.</div></div>`;
      return;
    }
    renderer.setSize(innerWidth,innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ─── Lights ────────────────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0x223366, 0.8);
    scene.add(ambient); ambRef.current = ambient;

    const sun = new THREE.DirectionalLight(0xfff0dd, 1.2);
    sun.position.set(80,150,60); sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);
    sun.shadow.camera.left=-200; sun.shadow.camera.right=200;
    sun.shadow.camera.top=200; sun.shadow.camera.bottom=-200;
    sun.shadow.camera.far=600;
    scene.add(sun); sunRef.current = sun;

    const hem = new THREE.HemisphereLight(0x223366,0x112244,.4);
    scene.add(hem); hemRef.current = hem;

    // ─── Ground ────────────────────────────────────────────────────────────────
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800,800,60,60),new THREE.MeshLambertMaterial({color:0x141e14}));
    ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
    scene.add(new THREE.GridHelper(700,90,0x1a251a,0x111a11));

    // ─── Stars ────────────────────────────────────────────────────────────────
    const sb=new Float32Array(2400*3);
    for(let i=0;i<7200;i+=3){sb[i]=(Math.random()-.5)*700;sb[i+1]=50+Math.random()*300;sb[i+2]=(Math.random()-.5)*700;}
    const stG=new THREE.BufferGeometry(); stG.setAttribute("position",new THREE.BufferAttribute(sb,3));
    const stars=new THREE.Points(stG,new THREE.PointsMaterial({size:.45,color:0xffffff,transparent:true,opacity:.3}));
    scene.add(stars);

    // ─── Roads ────────────────────────────────────────────────────────────────
    const roadM=new THREE.MeshLambertMaterial({color:0x0e0e0e});
    const rH=new THREE.Mesh(new THREE.PlaneGeometry(700,12),roadM); rH.rotation.x=-Math.PI/2; rH.position.y=.02; scene.add(rH);
    const rV=new THREE.Mesh(new THREE.PlaneGeometry(12,700),roadM); rV.rotation.x=-Math.PI/2; rV.position.y=.02; scene.add(rV);

    // ─── City buildings ───────────────────────────────────────────────────────
    [[50,50,9,20,0x222840],[- 60,40,11,14,0x2a1a40],[80,-70,7,26,0x1a2a20],[-90,-60,10,16,0x30201a],
     [110,60,6,30,0x1a1a40],[-110,80,8,10,0x2a301a],[120,-100,7,22,0x301a20],[-120,-100,10,18,0x1a2030],
     [30,90,13,9,0x252525],[-40,-80,8,16,0x1a3030]].forEach(([x,z,w,h,c])=>{
      const bg=new THREE.Group(); bg.position.set(x,0,z);
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,w),new THREE.MeshLambertMaterial({color:c}));
      mesh.position.y=h/2; mesh.castShadow=true; bg.add(mesh);
      const wm=new THREE.MeshBasicMaterial({color:Math.random()>.5?0xffffaa:0x88ccff,transparent:true,opacity:.8});
      for(let wy=3;wy<h-2;wy+=3)for(let wx=-w/2+1.5;wx<w/2-1;wx+=2.5)
        if(Math.random()>.35){const win=new THREE.Mesh(new THREE.PlaneGeometry(1.1,.75),wm);win.position.set(wx,wy,w/2+.01);bg.add(win);}
      scene.add(bg);
    });

    // ─── Rain system ──────────────────────────────────────────────────────────
    const RAIN_COUNT = 3000;
    const rainPos = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      rainPos[i*3]   = (Math.random() - 0.5) * 500;
      rainPos[i*3+1] = Math.random() * 150;
      rainPos[i*3+2] = (Math.random() - 0.5) * 500;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({color:0x88aadd,size:0.25,transparent:true,opacity:0.5}));
    rain.visible = false;
    scene.add(rain); rainRef.current = rain;

    // ─── Player ───────────────────────────────────────────────────────────────
    playerR.current.group = buildChar(0x00ccff, pGender, true);
    scene.add(playerR.current.group);

    // ─── WebSocket ────────────────────────────────────────────────────────────
    connectWS(scene, pName, pGender);

    // ─── Input ────────────────────────────────────────────────────────────────
    const onKey = (e:KeyboardEvent,down:boolean) => {
      if(document.activeElement?.tagName==="INPUT"||document.activeElement?.tagName==="TEXTAREA") return;
      const k=e.key.toLowerCase();
      if(k==="w"||e.key==="ArrowUp")    keys.current.w=down;
      if(k==="a"||e.key==="ArrowLeft")  keys.current.a=down;
      if(k==="s"||e.key==="ArrowDown")  keys.current.s=down;
      if(k==="d"||e.key==="ArrowRight") keys.current.d=down;
      if(down&&k==="u") setUiOn(p=>!p);
      if(down&&k==="c") setDrawOn(p=>!p);
      if(down&&k==="b") setShowBuild(p=>!p);
      if(down&&k==="escape"){ setDrawOn(false); setChatTarget(null); setShowBuild(false); }
    };
    const onKD=(e:KeyboardEvent)=>onKey(e,true);
    const onKU=(e:KeyboardEvent)=>onKey(e,false);

    const onMD=(e:MouseEvent)=>{
      if((e.target as HTMLElement).closest(".hud")) return;
      if(!drawOn&&e.button===2) return;
      if(e.button===0&&!drawOn){
        const ray=new THREE.Raycaster();
        const mouse=new THREE.Vector2((e.clientX/innerWidth)*2-1,-(e.clientY/innerHeight)*2+1);
        ray.setFromCamera(mouse,camera);
        const hits=ray.intersectObjects(Object.values(npcsR.current).map(n=>n.group),true);
        if(hits.length>0){
          let grp:THREE.Object3D|null=hits[0].object;
          while(grp&&grp.parent!==scene) grp=grp.parent;
          const entry=Object.entries(npcsR.current).find(([,n])=>n.group===grp);
          if(entry){setChatTarget(entry[0]);setTab("chat");return;}
        }
        cam.current.drag=true; cam.current.lx=e.clientX; cam.current.ly=e.clientY;
      }
    };
    const onMM=(e:MouseEvent)=>{
      if(!cam.current.drag) return;
      cam.current.h-=(e.clientX-cam.current.lx)*.007;
      cam.current.v=Math.max(.1,Math.min(1.35,cam.current.v+(e.clientY-cam.current.ly)*.007));
      cam.current.lx=e.clientX; cam.current.ly=e.clientY;
    };
    const onMU=()=>{ cam.current.drag=false; };
    const onWheel=(e:WheelEvent)=>{ cam.current.dist=Math.max(6,Math.min(55,cam.current.dist+e.deltaY*.03)); };

    let ptDist=0;
    const onTS=(e:TouchEvent)=>{
      if((e.target as HTMLElement).closest(".hud")||(e.target as HTMLElement).closest(".jz")) return;
      if(e.touches.length===2) ptDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      else if(e.touches.length===1){cam.current.drag=true;cam.current.lx=e.touches[0].clientX;cam.current.ly=e.touches[0].clientY;}
    };
    const onTM=(e:TouchEvent)=>{
      if((e.target as HTMLElement).closest(".hud")||(e.target as HTMLElement).closest(".jz")) return;
      e.preventDefault();
      if(e.touches.length===2){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);cam.current.dist=Math.max(6,Math.min(55,cam.current.dist+(ptDist-d)*.07));ptDist=d;}
      else if(e.touches.length===1&&cam.current.drag){cam.current.h-=(e.touches[0].clientX-cam.current.lx)*.009;cam.current.v=Math.max(.1,Math.min(1.35,cam.current.v+(e.touches[0].clientY-cam.current.ly)*.009));cam.current.lx=e.touches[0].clientX;cam.current.ly=e.touches[0].clientY;}
    };
    const onTE=()=>{ cam.current.drag=false; };

    window.addEventListener("keydown",onKD); window.addEventListener("keyup",onKU);
    window.addEventListener("mousedown",onMD); window.addEventListener("mousemove",onMM); window.addEventListener("mouseup",onMU);
    window.addEventListener("wheel",onWheel,{passive:true});
    renderer.domElement.addEventListener("touchstart",onTS,{passive:true});
    renderer.domElement.addEventListener("touchmove",onTM,{passive:false});
    renderer.domElement.addEventListener("touchend",onTE);

    // ─── Animation loop ───────────────────────────────────────────────────────
    let animId:number, lastT=performance.now(), mmT=0, dayT=0, partyHue=0;
    const animate=(t:number)=>{
      animId = requestAnimationFrame(animate);
      const dt=Math.min((t-lastT)/1000,.1); lastT=t;

      // ── Player movement ──────────────────────────────────────────────────────
      const j=joy.current, spd=9*dt;
      const fwd=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),cam.current.h);
      const rgt=new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),cam.current.h);
      const dir=new THREE.Vector3();
      if(keys.current.w||(j.on&&j.dy<-.2)) dir.add(fwd);
      if(keys.current.s||(j.on&&j.dy>.2))  dir.sub(fwd);
      if(keys.current.a||(j.on&&j.dx<-.2)) dir.sub(rgt);
      if(keys.current.d||(j.on&&j.dx>.2))  dir.add(rgt);
      if(dir.lengthSq()>0){
        dir.normalize();
        const js=j.on?Math.hypot(j.dx,j.dy)*spd:spd;
        const nx = Math.max(-WORLD_SIZE/2, Math.min(WORLD_SIZE/2, playerR.current.pos.x+dir.x*js));
        const nz = Math.max(-WORLD_SIZE/2, Math.min(WORLD_SIZE/2, playerR.current.pos.z+dir.z*js));
        playerR.current.pos.x=nx; playerR.current.pos.z=nz;
        playerR.current.group.position.set(nx,0,nz);
        playerR.current.group.rotation.y=Math.atan2(dir.x,dir.z);
        if(t-lastSend.current>90){
          wsRef.current?.send(JSON.stringify({type:"player-move",position:playerR.current.pos}));
          lastSend.current=t;
        }
      }

      // ── Camera ──────────────────────────────────────────────────────────────
      const pg=playerR.current.group; const cs=cam.current;
      camera.position.set(
        pg.position.x+cs.dist*Math.sin(cs.h)*Math.cos(cs.v),
        pg.position.y+cs.dist*Math.sin(cs.v),
        pg.position.z+cs.dist*Math.cos(cs.h)*Math.cos(cs.v)
      );
      camera.lookAt(pg.position.x,pg.position.y+1.5,pg.position.z);

      // ── NPC smooth movement (lerp at speed 10) ───────────────────────────────
      Object.values(npcsR.current).forEach(n=>{
        if(n.state.targetPos){
          const tx=n.state.targetPos.x-n.group.position.x;
          const tz=n.state.targetPos.z-n.group.position.z;
          const dd=Math.sqrt(tx*tx+tz*tz);
          if(dd>0.3){
            const spd2=10*dt;
            const move=Math.min(spd2,dd);
            n.group.position.x+=tx/dd*move;
            n.group.position.z+=tz/dd*move;
            n.group.rotation.y=Math.atan2(tx,tz);
            // Leg swing animation
            const legAngle = Math.sin(t*0.008)*0.5;
            const legs = n.group.children.filter((_,i)=>i<2);
            legs.forEach((l,i)=>{ (l as THREE.Mesh).rotation.x = legAngle*(i===0?1:-1); });
          } else {
            n.group.position.set(n.state.targetPos.x,0,n.state.targetPos.z);
            n.state.targetPos = undefined;
          }
        }
        // Speech bubble follows NPC
        if(n.bubble){
          n.bubble.position.set(n.group.position.x,5,n.group.position.z);
          if(t>(n.bTimer??0)){scene.remove(n.bubble);n.bubble=undefined;}
        }
      });

      // ── Object scale-in animation ────────────────────────────────────────────
      Object.values(objsR.current).forEach(o=>{ if(o.scale.x<1){const s=Math.min(1,o.scale.x+dt*1.8);o.scale.set(s,s,s);} });

      // ── Day/night cycle (full cycle = 12 min real time) ──────────────────────
      const w = weatherRef.current;
      if(w !== "night" && w !== "party") {
        worldTimeRef.current = (worldTimeRef.current + dt / 720) % 1;
      }
      const wt = w === "night" ? 0.75 : worldTimeRef.current;
      dayT += dt;
      if(dayT > 2) {
        dayT = 0;
        updateDayNight(wt, w, sun, ambient, hem, scene, stars, rain);
        // Update time label
        const hour = Math.floor(wt * 24);
        const label = hour < 5 ? "🌙 Madrugada" : hour < 8 ? "🌅 Amanhecer" : hour < 18 ? "☀️ Dia" : hour < 21 ? "🌇 Entardecer" : "🌙 Noite";
        setTimeLabel(label);
      }

      // ── Rain animation ───────────────────────────────────────────────────────
      if(rain.visible) {
        const pos = rainGeo.attributes.position as THREE.BufferAttribute;
        for(let i=0;i<RAIN_COUNT;i++){
          pos.setY(i, pos.getY(i) - (w==="storm"?3:1.5)*dt*60);
          if(pos.getY(i)<0) pos.setY(i, 150);
        }
        pos.needsUpdate = true;
      }

      // ── Party mode: colorful pulsing ambient ─────────────────────────────────
      if(w === "party") {
        partyHue = (partyHue + dt * 0.5) % 1;
        const c = new THREE.Color().setHSL(partyHue, 1, 0.4);
        ambient.color.set(c);
        ambient.intensity = 1.2 + Math.sin(t*0.005)*0.3;
      }

      if(t-mmT>160){updateMinimap();mmT=t;}
      renderer.render(scene,camera);
    };
    animate(performance.now());

    const onResize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);};
    window.addEventListener("resize",onResize);

    return ()=>{
      window.removeEventListener("keydown",onKD); window.removeEventListener("keyup",onKU);
      window.removeEventListener("mousedown",onMD); window.removeEventListener("mousemove",onMM); window.removeEventListener("mouseup",onMU);
      window.removeEventListener("wheel",onWheel); window.removeEventListener("resize",onResize);
      renderer.domElement.removeEventListener("touchstart",onTS); renderer.domElement.removeEventListener("touchmove",onTM); renderer.domElement.removeEventListener("touchend",onTE);
      cancelAnimationFrame(animId); renderer.dispose();
      wsRef.current?.close();
      if(reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[started, pName, pGender, connectWS]);

  // ─── Day/night scene updater ─────────────────────────────────────────────────
  function updateDayNight(wt:number, w:WeatherType, sun:THREE.DirectionalLight, ambient:THREE.AmbientLight, hem:THREE.HemisphereLight, scene:THREE.Scene, stars:THREE.Points, rain:THREE.Points) {
    let skyColor: THREE.Color, sunColor: THREE.Color, ambInt: number, sunInt: number, fogDensity: number;

    if(w==="foggy") {
      skyColor = new THREE.Color(0x889999); sunColor = new THREE.Color(0xddddcc); ambInt=0.6; sunInt=0.5; fogDensity=80;
    } else if(w==="rain"||w==="storm") {
      skyColor = new THREE.Color(0x112233); sunColor = new THREE.Color(0x8899aa); ambInt=0.4; sunInt=0.3; fogDensity=150;
      rain.visible = true;
    } else if(w==="party") {
      skyColor = new THREE.Color(0x111122); sunColor = new THREE.Color(0xffffff); ambInt=0.5; sunInt=0.5; fogDensity=300;
      rain.visible = false;
    } else {
      rain.visible = false;
      // Day cycle
      if(wt < 0.2 || wt > 0.85) { // Night
        skyColor = new THREE.Color(0x010208); sunColor = new THREE.Color(0x223366); ambInt=0.2; sunInt=0.1; fogDensity=250;
      } else if(wt < 0.3) { // Dawn
        const f=(wt-0.2)/0.1;
        skyColor = new THREE.Color().lerpColors(new THREE.Color(0x010208),new THREE.Color(0xff6633),f);
        sunColor = new THREE.Color(0xffaa44); ambInt=0.2+f*0.5; sunInt=0.1+f*0.8; fogDensity=300-f*200;
      } else if(wt < 0.65) { // Day
        skyColor = new THREE.Color(0x080818); sunColor = new THREE.Color(0xfff0dd); ambInt=0.8; sunInt=1.2; fogDensity=320;
      } else { // Sunset
        const f=(wt-0.65)/0.2;
        skyColor = new THREE.Color().lerpColors(new THREE.Color(0x080818),new THREE.Color(0x220811),f);
        sunColor = new THREE.Color().lerpColors(new THREE.Color(0xfff0dd),new THREE.Color(0xff4400),f);
        ambInt=0.8-f*0.5; sunInt=1.2-f*0.9; fogDensity=320-f*200;
      }
    }

    (scene.background as THREE.Color)?.set?.(skyColor);
    (scene.fog as THREE.Fog).far = fogDensity;
    (scene.fog as THREE.Fog).color.set(skyColor);
    ambient.color.set(w==="party"?ambient.color:new THREE.Color(0x223366).lerp(skyColor,0.5));
    ambient.intensity = w==="party"?ambient.intensity:ambInt;
    sun.color.set(sunColor);
    sun.intensity = sunInt;
    // Stars visible at night
    (stars.material as THREE.PointsMaterial).opacity = wt < 0.25 || wt > 0.8 ? 0.7 : 0.15;
  }

  const sendChat = () => {
    const msg=input.trim(); if(!msg) return;
    if(chatTarget==="all"){
      wsRef.current?.send(JSON.stringify({type:"player-chat-all",message:msg}));
      addMsg({id:Date.now().toString(),who:"Você→todos",text:msg,color:"#88aaff",mine:true});
    } else if(chatTarget){
      wsRef.current?.send(JSON.stringify({type:"player-chat",npcId:chatTarget,message:msg}));
      const npc=npcListRef.current.find(n=>n.id===chatTarget);
      addMsg({id:Date.now().toString(),who:"Você",text:msg,color:"#88aaff",mine:true});
      const typId="typing-"+Date.now();
      addMsg({id:typId,who:npc?.name??"IA",text:"digitando...",color:npc?.color??"#aaa",typing:true});
    }
    setInput("");
  };

  const onJoyStart=(e:React.TouchEvent)=>{ const t=e.touches[0]; joy.current={on:true,cx:t.clientX,cy:t.clientY,dx:0,dy:0}; };
  const onJoyMove=(e:React.TouchEvent)=>{ e.stopPropagation(); const t=e.touches[0]; const dx=(t.clientX-joy.current.cx)/50,dy=(t.clientY-joy.current.cy)/50; const len=Math.hypot(dx,dy); const c=len>1?{dx:dx/len,dy:dy/len}:{dx,dy}; joy.current.dx=c.dx;joy.current.dy=c.dy; if(joyKnob.current)joyKnob.current.style.transform=`translate(${c.dx*26}px,${c.dy*26}px)`; };
  const onJoyEnd=()=>{ joy.current={on:false,cx:0,cy:0,dx:0,dy:0}; if(joyKnob.current)joyKnob.current.style.transform=""; };

  const onDrawMD=(e:React.MouseEvent<HTMLCanvasElement>)=>{ drawing.current=true; const r=(e.target as HTMLCanvasElement).getBoundingClientRect(); drawPt.current={x:e.clientX-r.left,y:e.clientY-r.top}; };
  const onDrawMM=(e:React.MouseEvent<HTMLCanvasElement>)=>{ if(!drawing.current||!drawPt.current) return; const r=(e.target as HTMLCanvasElement).getBoundingClientRect(); const x2=e.clientX-r.left,y2=e.clientY-r.top; sendDraw({type:"line",x:drawPt.current.x,y:drawPt.current.y,x2,y2,color:drawColor,size:drawSz}); drawPt.current={x:x2,y:y2}; };
  const onDrawMU=()=>{ drawing.current=false; drawPt.current=null; };

  const chatNpc = npcListRef.current.find(n=>n.id===chatTarget);
  const isMobile = innerWidth<768;
  const weatherEmoji = weather==="rain"?"🌧️":weather==="storm"?"⛈️":weather==="party"?"🎉":weather==="foggy"?"🌫️":weather==="night"?"🌙":weather==="dawn"?"🌅":"☀️";

  if(!started) return <NameEntry onStart={handleStart}/>;

  return (
    <div style={{width:"100dvw",height:"100dvh",overflow:"hidden",background:"#080818",position:"relative",fontFamily:"system-ui,sans-serif",userSelect:"none"}}>

      {/* 3D canvas */}
      <div ref={containerRef} style={{position:"absolute",inset:0}}/>

      {/* Drawing layer */}
      {drawOn && (
        <canvas ref={drawRef} width={innerWidth} height={innerHeight}
          style={{position:"absolute",inset:0,zIndex:20,cursor:"crosshair",touchAction:"none"}}
          onMouseDown={onDrawMD} onMouseMove={onDrawMM} onMouseUp={onDrawMU} onMouseLeave={onDrawMU}/>
      )}

      {uiOn && (<>

        {/* ── TOP-LEFT: Minimap ── */}
        <div className="hud" style={{position:"absolute",top:10,left:10,zIndex:100}}>
          <canvas ref={minimapRef} width={120} height={120}
            style={{borderRadius:12,border:"1px solid rgba(80,100,200,0.28)",display:"block",boxShadow:"0 4px 16px rgba(0,0,0,.5)"}}/>
          <div style={{textAlign:"center",color:"#334",fontSize:9,marginTop:2,letterSpacing:.5}}>MAPA</div>
        </div>

        {/* ── TOP-CENTER: Player badge ── */}
        <div className="hud" style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",zIndex:100,background:"rgba(4,4,16,0.82)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"5px 16px",fontSize:12,color:"#88aaff",fontWeight:700,whiteSpace:"nowrap",boxShadow:"0 2px 12px rgba(0,0,0,.4)",display:"flex",alignItems:"center",gap:8}}>
          <span>{pGender==="female"?"👩":"👨"} {pName}</span>
          <span style={{color:"#445",fontSize:10,fontWeight:400}}>{weatherEmoji} {timeLabel}</span>
          <span style={{color:"#334",fontSize:10,fontWeight:400}}>WASD · B=construir · C=desenho</span>
        </div>

        {/* ── TOP-RIGHT: Unified panel ── */}
        <div className="hud" style={{position:"absolute",top:10,right:10,zIndex:100,width:270,height:"calc(100vh - 90px)",display:"flex",flexDirection:"column",background:"rgba(4,4,16,0.88)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,overflow:"hidden",boxShadow:"0 4px 24px rgba(0,0,0,.6)"}}>

          {/* Tabs */}
          <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
            {(["chat","feed","npcs"] as const).map(t2=>(
              <button key={t2} onClick={()=>setTab(t2)}
                style={{flex:1,padding:"8px 0",border:"none",background:tab===t2?"rgba(136,170,255,0.12)":"transparent",color:tab===t2?"#88aaff":"#445",cursor:"pointer",fontSize:11,fontWeight:tab===t2?700:400,borderBottom:tab===t2?"2px solid #88aaff":"2px solid transparent"}}>
                {t2==="chat"?"💬 Chat":t2==="feed"?"📡 Ao vivo":"👥 IAs"}
              </button>
            ))}
          </div>

          {/* CHAT TAB */}
          {tab==="chat" && (<>
            <div style={{padding:"6px 8px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
              <button onClick={()=>setChatTarget("all")} style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${chatTarget==="all"?"#88aaff":"rgba(255,255,255,0.1)"}`,background:chatTarget==="all"?"rgba(136,170,255,0.18)":"transparent",color:chatTarget==="all"?"#88aaff":"#445",cursor:"pointer",fontSize:10}}>📢 Todos</button>
              {chatTarget&&chatTarget!=="all"&&chatNpc&&(
                <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,0.05)",borderRadius:6,padding:"2px 7px",border:"1px solid rgba(255,255,255,0.08)"}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:chatNpc.color}}/>
                  <span style={{color:chatNpc.color,fontSize:11,fontWeight:700}}>{chatNpc.name}</span>
                  <button onClick={()=>setChatTarget(null)} style={{background:"none",border:"none",color:"#445",cursor:"pointer",fontSize:12,padding:0,marginLeft:2}}>✕</button>
                </div>
              )}
              {!chatTarget&&<span style={{color:"#334",fontSize:10}}>Clique em uma IA no mundo</span>}
            </div>

            <div ref={chatMsgsRef} style={{flex:1,overflowY:"auto",padding:"6px 8px",display:"flex",flexDirection:"column",gap:4}}>
              {msgs.length===0&&<div style={{color:"#334",fontSize:11,textAlign:"center",marginTop:20}}>Selecione uma IA ou "Todos" para conversar</div>}
              {msgs.map(m=>(
                <div key={m.id} style={{display:"flex",flexDirection:"column",alignItems:m.mine?"flex-end":"flex-start"}}>
                  <div style={{fontSize:9,color:m.color,marginBottom:1,paddingLeft:2,paddingRight:2}}>{m.who}</div>
                  <div style={{background:m.mine?"rgba(136,170,255,0.18)":"rgba(255,255,255,0.06)",border:`1px solid ${m.mine?"rgba(136,170,255,0.25)":"rgba(255,255,255,0.07)"}`,borderRadius:8,padding:"5px 8px",fontSize:12,color:m.typing?"#445":"#dde",maxWidth:"88%",wordBreak:"break-word",fontStyle:m.typing?"italic":"normal"}}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            <div style={{padding:"7px 8px",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",gap:5}}>
              <input value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&sendChat()}
                placeholder={chatTarget?"Digite e pressione Enter...":"Selecione uma IA primeiro"}
                disabled={!chatTarget}
                style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:7,padding:"6px 9px",color:"#eee",fontSize:12,outline:"none",opacity:chatTarget?1:.5}}/>
              <button onClick={sendChat} disabled={!chatTarget||!input.trim()}
                style={{padding:"6px 10px",borderRadius:7,border:"none",background:"#3355ee",color:"#fff",cursor:"pointer",fontSize:13,opacity:chatTarget&&input.trim()?1:.4}}>↑</button>
            </div>
          </>)}

          {/* FEED TAB */}
          {tab==="feed" && (
            <div style={{flex:1,overflowY:"auto",padding:"6px 8px",display:"flex",flexDirection:"column",gap:0}}>
              {feed.length===0&&<div style={{color:"#334",fontSize:11,textAlign:"center",marginTop:20}}>As IAs vão começar a conversar em breve...</div>}
              {feed.map((c,i)=>(
                <div key={i} style={{padding:"7px 6px",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                  <div style={{fontSize:10,marginBottom:3}}>
                    <span style={{color:c.fromColor,fontWeight:700}}>{c.fromName}</span>
                    <span style={{color:"#333"}}> → </span>
                    <span style={{color:c.toColor,fontWeight:700}}>{c.toName}</span>
                  </div>
                  <div style={{color:"#aab",fontSize:11,lineHeight:1.4}}>"{c.message}"</div>
                  {c.response&&<div style={{color:"#556",fontSize:10,marginTop:2,fontStyle:"italic"}}>↩ "{c.response.slice(0,55)}{c.response.length>55?"…":""}"</div>}
                </div>
              ))}
            </div>
          )}

          {/* NPCS TAB */}
          {tab==="npcs" && (
            <div style={{flex:1,overflowY:"auto"}}>
              {npcList.map(n=>(
                <div key={n.id} onClick={()=>{setChatTarget(n.id);setTab("chat");}}
                  style={{padding:"7px 10px",display:"flex",alignItems:"center",gap:8,cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.04)",background:chatTarget===n.id?"rgba(136,170,255,0.08)":"transparent"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:n.color,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:n.color,fontWeight:700,fontSize:12}}>{n.gender==="female"?"👩":"👨"} {n.name}</div>
                    <div style={{color:"#445",fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.emotion} · {n.currentAction}</div>
                  </div>
                  <div style={{color:"#334",fontSize:10}}>→</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── BOTTOM-LEFT: Action buttons ── */}
        <div className="hud" style={{position:"absolute",bottom:isMobile?140:16,left:isMobile?140:16,zIndex:100,display:"flex",gap:6}}>
          <button onClick={()=>setUiOn(p=>!p)} title="Ocultar UI (U)"
            style={{padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(4,4,16,0.82)",color:"#556",cursor:"pointer",fontSize:14}}>👁</button>
          <button onClick={()=>setDrawOn(p=>!p)}
            style={{padding:"8px 12px",borderRadius:10,border:`1px solid ${drawOn?"#ff88aa":"rgba(255,255,255,0.1)"}`,background:drawOn?"rgba(255,136,170,0.15)":"rgba(4,4,16,0.82)",color:drawOn?"#ff88aa":"#556",cursor:"pointer",fontSize:14}}>🎨</button>
          <button onClick={()=>setChatTarget("all")}
            style={{padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(4,4,16,0.82)",color:"#556",cursor:"pointer",fontSize:14}}>📢</button>
          <button onClick={()=>setShowBuild(p=>!p)} title="Construir (B)"
            style={{padding:"8px 12px",borderRadius:10,border:`1px solid ${showBuild?"#88ffaa":"rgba(255,255,255,0.1)"}`,background:showBuild?"rgba(136,255,170,0.15)":"rgba(4,4,16,0.82)",color:showBuild?"#88ffaa":"#556",cursor:"pointer",fontSize:14}}>🔨</button>
        </div>

        {/* ── BUILD PANEL ── */}
        {showBuild && (
          <div className="hud" style={{position:"absolute",bottom:isMobile?200:70,left:isMobile?140:16,zIndex:200,width:320,background:"rgba(4,4,16,0.95)",border:"1px solid rgba(136,255,170,0.2)",borderRadius:14,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,.7)"}}>
            <div style={{padding:"10px 12px",borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{color:"#88ffaa",fontWeight:700,fontSize:13}}>🔨 Construir</span>
              <button onClick={()=>setShowBuild(false)} style={{background:"none",border:"none",color:"#445",cursor:"pointer",fontSize:16}}>✕</button>
            </div>

            {/* Category tabs */}
            <div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"8px 10px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
              {Object.entries(BUILD_CATEGORIES).map(([cat,{emoji}])=>(
                <button key={cat} onClick={()=>{setBuildCat(cat);setBuildType(BUILD_CATEGORIES[cat].types[0]);}}
                  style={{padding:"4px 8px",borderRadius:8,border:`1px solid ${buildCat===cat?"#88ffaa":"rgba(255,255,255,0.1)"}`,background:buildCat===cat?"rgba(136,255,170,0.15)":"transparent",color:buildCat===cat?"#88ffaa":"#445",cursor:"pointer",fontSize:11,fontWeight:buildCat===cat?700:400}}>
                  {emoji} {cat}
                </button>
              ))}
            </div>

            {/* Objects in category */}
            <div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"8px 10px",maxHeight:130,overflowY:"auto",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
              {BUILD_CATEGORIES[buildCat].types.map(type=>(
                <button key={type} onClick={()=>setBuildType(type)}
                  title={type.replace(/_/g," ")}
                  style={{padding:"6px 8px",borderRadius:8,border:`1px solid ${buildType===type?"#88ffaa":"rgba(255,255,255,0.08)"}`,background:buildType===type?"rgba(136,255,170,0.18)":"rgba(255,255,255,0.04)",cursor:"pointer",fontSize:18,lineHeight:1}}>
                  {OBJ_EMOJI[type]??"📦"}
                </button>
              ))}
            </div>

            {/* Selected object + controls */}
            <div style={{padding:"8px 12px"}}>
              <div style={{color:"#88ffaa",fontSize:12,fontWeight:700,marginBottom:8}}>
                {OBJ_EMOJI[buildType]??""} {buildType.replace(/_/g," ")}
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <label style={{color:"#445",fontSize:11,flexShrink:0}}>Cor:</label>
                <input type="color" value={buildColor} onChange={e=>setBuildColor(e.target.value)}
                  style={{width:36,height:28,padding:0,border:"none",borderRadius:6,cursor:"pointer",background:"transparent"}}/>
                <label style={{color:"#445",fontSize:11,flexShrink:0}}>Escala:</label>
                <input type="range" min={0.4} max={2.5} step={0.1} value={buildScale} onChange={e=>setBuildScale(+e.target.value)}
                  style={{flex:1}}/>
                <span style={{color:"#556",fontSize:11,flexShrink:0}}>{buildScale.toFixed(1)}x</span>
              </div>
              <button onClick={placeObject}
                style={{width:"100%",padding:"9px 0",borderRadius:10,border:"none",background:"linear-gradient(90deg,#22aa55,#55dd88)",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700}}>
                📍 Colocar aqui
              </button>
            </div>
          </div>
        )}

        {/* ── Draw toolbar ── */}
        {drawOn && (
          <div className="hud" style={{position:"absolute",bottom:isMobile?140:16,left:"50%",transform:"translateX(-50%)",zIndex:150,display:"flex",gap:6,alignItems:"center",background:"rgba(4,4,16,0.92)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:30,padding:"6px 14px"}}>
            <input type="color" value={drawColor} onChange={e=>setDrawColor(e.target.value)} style={{width:28,height:28,padding:0,border:"none",borderRadius:6,cursor:"pointer",background:"transparent"}}/>
            <input type="range" min={1} max={16} value={drawSz} onChange={e=>setDrawSz(+e.target.value)} style={{width:60}}/>
            <button onClick={()=>sendDraw({type:"clear"})} style={{padding:"4px 10px",borderRadius:8,border:"1px solid rgba(255,80,80,0.3)",background:"rgba(255,80,80,0.1)",color:"#f88",cursor:"pointer",fontSize:11}}>Limpar</button>
            {drawMin!==null&&<span style={{color:"#445",fontSize:10}}>~{drawMin}min</span>}
            <button onClick={()=>setDrawOn(false)} style={{padding:"4px 9px",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#445",cursor:"pointer",fontSize:11}}>✕</button>
          </div>
        )}

        {/* ── Mention alert ── */}
        {mention&&(
          <div className="hud" style={{position:"absolute",top:52,left:"50%",transform:"translateX(-50%)",zIndex:300,background:"rgba(4,4,16,0.95)",border:"2px solid #88aaff",borderRadius:12,padding:"9px 16px",maxWidth:300,textAlign:"center",animation:"fdi .3s",pointerEvents:"none"}}>
            <div style={{color:"#88aaff",fontWeight:700,fontSize:12}}>📣 {mention.name} te chamou!</div>
            <div style={{color:"#aab",fontSize:11,marginTop:3}}>{mention.text}</div>
          </div>
        )}

        {/* ── Toasts ── */}
        <div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",zIndex:250,display:"flex",flexDirection:"column",gap:5,alignItems:"center",pointerEvents:"none",marginTop:44}}>
          {toasts.map(t=>(
            <div key={t.id} style={{background:"rgba(4,4,16,0.93)",border:`1px solid ${t.color}44`,borderLeft:`3px solid ${t.color}`,borderRadius:10,padding:"6px 14px",color:"#bbc",fontSize:11,maxWidth:280,textAlign:"center",animation:"fdi .3s",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              {t.text}
            </div>
          ))}
        </div>

      </>)}

      {/* ── UI hidden mode ── */}
      {!uiOn&&(
        <button onClick={()=>setUiOn(true)} className="hud"
          style={{position:"absolute",top:10,left:10,zIndex:200,padding:"7px 11px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(4,4,16,0.75)",color:"#445",cursor:"pointer",fontSize:16}}>👁</button>
      )}

      {/* ── Joystick ── */}
      <div className="jz hud" onTouchStart={onJoyStart} onTouchMove={onJoyMove} onTouchEnd={onJoyEnd}
        style={{position:"absolute",bottom:24,left:24,zIndex:200,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,0.06)",border:"2px solid rgba(255,255,255,0.12)",display:"flex",alignItems:"center",justifyContent:"center",touchAction:"none"}}>
        <div ref={joyKnob} style={{width:40,height:40,borderRadius:"50%",background:"rgba(136,170,255,0.35)",border:"2px solid rgba(136,170,255,0.5)",transition:"transform .05s",pointerEvents:"none"}}/>
      </div>

      <style>{`
        @keyframes fdi{from{opacity:0;transform:translateY(-6px) translateX(-50%)}to{opacity:1;transform:translateY(0) translateX(-50%)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}
      `}</style>
    </div>
  );
}
