import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { X, Users, MessageSquare, Plus } from "lucide-react";
import { useGetNpcs, useGetWorldState, useGetNpcStats, useGetNpcMemory } from "@workspace/api-client-react";

// Types
type Position = { x: number; z: number };
type NpcState = { 
  id: string; 
  name: string; 
  color: string; 
  position: Position; 
  targetPosition?: Position; 
  currentAction?: string; 
  emotion?: string; 
};
type WorldObject = { 
  id: string; 
  type: string; 
  position: Position; 
  creator?: string;
  creatorColor?: string;
};
type ChatMessage = { 
  id: string; 
  from: "player" | "npc"; 
  text: string; 
  color?: string; 
  name?: string; 
};
type EventFeedItem = { 
  id: string; 
  type: "conversation" | "creation" | "greeting"; 
  text: string; 
  color: string; 
  initials: string; 
};
type ToastMessage = {
  id: string;
  text: string;
  color: string;
};

const WS_URL = window.location.origin.replace(/^http/, "ws") + "/ws";
const WORLD_SIZE = 120;

// Helper: Text Wrapping for Canvas
function wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let lines = 0;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = context.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      context.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
      lines++;
      if (lines >= 3) break; // Max 3 lines
    } else {
      line = testLine;
    }
  }
  if (lines < 3) context.fillText(line, x, y);
}

// Helpers for 3D Sprites
function createLabelSprite(name: string, color: string, action: string = "", emotion: string = "") {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  
  ctx.fillStyle = 'rgba(10, 10, 30, 0.8)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 256, 80, 16);
  ctx.fill();
  
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(name, 128, 36);
  
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText(`${emotion ? emotion + ' ' : ''}${action || 'Idle'}`, 128, 64);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(4, 1.25, 1);
  return { sprite, canvas, ctx, texture };
}

function createSpeechBubbleSprite(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 128, 16);
  ctx.fill();
  
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'left';
  wrapText(ctx, text, 20, 36, 472, 32);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(6, 1.5, 1);
  return sprite;
}

export default function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  
  // Game State
  const [activeChatNPC, setActiveChatNPC] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [chatInput, setChatInput] = useState("");
  const [events, setEvents] = useState<EventFeedItem[]>([]);
  const [npcList, setNpcList] = useState<NpcState[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  
  // Refs for imperative code
  const ws = useRef<WebSocket | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  
  const playerIdRef = useRef<string | null>(null);
  const otherPlayersRef = useRef<Record<string, THREE.Group>>({});
  
  const npcsRef = useRef<Record<string, { 
    group: THREE.Group; 
    state: NpcState; 
    label: THREE.Sprite;
    bubble?: THREE.Sprite;
    bubbleTimer?: number;
  }>>({});
  
  const objectsRef = useRef<Record<string, THREE.Group>>({});
  const playerRef = useRef<{ group: THREE.Group; position: Position }>({
    group: new THREE.Group(),
    position: { x: 0, z: 0 }
  });
  
  const moveState = useRef({ w: false, a: false, s: false, d: false, up: false, left: false, down: false, right: false });
  const camState = useRef({ angleH: 0, angleV: 0.5, distance: 18, isDragging: false, lastMouseX: 0, lastMouseY: 0 });
  const lastMoveSent = useRef<number>(0);
  
  const addEvent = useCallback((event: Omit<EventFeedItem, 'id'>) => {
    setEvents(prev => [{ ...event, id: Date.now().toString() + Math.random() }, ...prev].slice(0, 8));
  }, []);

  const showToast = useCallback((text: string, color: string) => {
    const id = Date.now().toString();
    setToast({ id, text, color });
    setTimeout(() => {
      setToast(prev => prev?.id === id ? null : prev);
    }, 4000);
  }, []);

  // Update Minimap
  const updateMinimap = useCallback(() => {
    if (!minimapRef.current) return;
    const ctx = minimapRef.current.getContext('2d');
    if (!ctx) return;
    
    const size = 160;
    const scale = size / WORLD_SIZE;
    const offset = size / 2;
    
    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, size, size);
    
    // World Objects
    ctx.fillStyle = '#555555';
    Object.values(objectsRef.current).forEach(obj => {
      ctx.fillRect(offset + obj.position.x * scale - 2, offset + obj.position.z * scale - 2, 4, 4);
    });
    
    // NPCs
    Object.values(npcsRef.current).forEach(npc => {
      ctx.fillStyle = npc.state.color;
      ctx.beginPath();
      ctx.arc(offset + npc.group.position.x * scale, offset + npc.group.position.z * scale, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Player
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(offset + playerRef.current.position.x * scale, offset + playerRef.current.position.z * scale, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Other Players
    ctx.fillStyle = '#888888';
    Object.values(otherPlayersRef.current).forEach(p => {
      ctx.beginPath();
      ctx.arc(offset + p.position.x * scale, offset + p.position.z * scale, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }, []);

  // Initialization
  useEffect(() => {
    if (!containerRef.current) return;
    
    // 1. Setup Three.js Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0d2b);
    scene.fog = new THREE.Fog(0x0d0d2b, 60, 140);
    sceneRef.current = scene;
    
    const aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 300);
    cameraRef.current = camera;
    
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      // WebGL not available (e.g. in sandbox/iframe without GPU)
      // Show a fallback message — the game works fine in a real browser
      if (containerRef.current) {
        containerRef.current.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#0d0d2b;color:#aac;font-family:monospace;text-align:center;padding:2rem;flex-direction:column;gap:1rem">
          <div style="font-size:2rem">🌐</div>
          <div style="font-size:1.2rem;color:#88aaff">Virtual World 3D</div>
          <div style="color:#667;font-size:0.9rem">WebGL is not available in this preview.<br/>Open the app in a full browser tab to play.</div>
        </div>`;
      }
      return;
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Lighting
    scene.add(new THREE.AmbientLight(0x223366, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(40, 80, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 300;
    scene.add(dirLight);
    scene.add(new THREE.HemisphereLight(0x223366, 0x112244, 0.5));
    
    // Ground
    const groundGeo = new THREE.PlaneGeometry(240, 240, 40, 40);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x1a2a1a });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    const grid = new THREE.GridHelper(240, 60, 0x223322, 0x1a2a1a);
    grid.position.y = 0.01;
    scene.add(grid);
    
    // Stars
    const starsGeo = new THREE.BufferGeometry();
    const starsCount = 2000;
    const posArray = new Float32Array(starsCount * 3);
    for(let i = 0; i < starsCount * 3; i+=3) {
      posArray[i] = (Math.random() - 0.5) * 300;
      posArray[i+1] = 50 + Math.random() * 200;
      posArray[i+2] = (Math.random() - 0.5) * 300;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const starsMat = new THREE.PointsMaterial({ size: 0.4, color: 0xffffff, transparent: true, opacity: 0.7 });
    const starsMesh = new THREE.Points(starsGeo, starsMat);
    scene.add(starsMesh);

    // Roads
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const roadH = new THREE.Mesh(new THREE.PlaneGeometry(240, 12), roadMat);
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.y = 0.02;
    roadH.receiveShadow = true;
    scene.add(roadH);
    const roadV = new THREE.Mesh(new THREE.PlaneGeometry(12, 240), roadMat);
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.y = 0.02;
    roadV.receiveShadow = true;
    scene.add(roadV);

    // Buildings
    const buildings = [
      { x: 20, z: 20, w: 8, h: 18, d: 8, color: 0x2a3a5a },
      { x: -25, z: 15, w: 10, h: 12, d: 10, color: 0x3a2a5a },
      { x: 35, z: -30, w: 7, h: 22, d: 7, color: 0x2a4a3a },
      { x: -40, z: -25, w: 9, h: 15, d: 9, color: 0x4a3a2a },
      { x: 50, z: 30, w: 6, h: 28, d: 6, color: 0x2a2a5a },
      { x: -50, z: 40, w: 8, h: 10, d: 8, color: 0x3a4a2a },
      { x: 55, z: -40, w: 7, h: 20, d: 7, color: 0x4a2a3a },
      { x: -55, z: -50, w: 10, h: 16, d: 10, color: 0x2a3a4a },
      { x: 0, z: 40, w: 12, h: 8, d: 12, color: 0x3a3a3a },
      { x: -15, z: -35, w: 8, h: 14, d: 8, color: 0x2a4a4a },
    ];
    buildings.forEach(b => {
      const bGroup = new THREE.Group();
      bGroup.position.set(b.x, 0, b.z);
      
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), new THREE.MeshLambertMaterial({ color: b.color }));
      mesh.position.y = b.h / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      bGroup.add(mesh);
      
      // Glowing windows
      const windowMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xffffaa : 0x88ccff, transparent: true, opacity: 0.8 });
      const windowGeo = new THREE.PlaneGeometry(1.2, 0.8);
      for(let wy = 3; wy < b.h - 2; wy += 3) {
        for(let wx = -b.w/2 + 1.5; wx < b.w/2 - 1; wx += 2.5) {
          if (Math.random() > 0.3) {
            const win = new THREE.Mesh(windowGeo, windowMat);
            win.position.set(wx, wy, b.d/2 + 0.01);
            bGroup.add(win);
          }
        }
      }
      scene.add(bGroup);
    });
    
    // Character Builder
    const createCharacter = (color: number | string) => {
      const group = new THREE.Group();
      const material = new THREE.MeshLambertMaterial({ color });
      
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.0, 12), material);
      body.position.y = 1.0;
      body.castShadow = true;
      group.add(body);
      
      const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8, 0, Math.PI * 2, 0, Math.PI/2), material);
      capTop.position.y = 1.5;
      capTop.castShadow = true;
      group.add(capTop);

      const capBot = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8, 0, Math.PI * 2, Math.PI/2, Math.PI/2), material);
      capBot.position.y = 0.5;
      capBot.castShadow = true;
      group.add(capBot);
      
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), material);
      head.position.y = 2.0;
      head.castShadow = true;
      group.add(head);

      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const eyeGeo = new THREE.SphereGeometry(0.07);
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
      eyeL.position.set(-0.12, 2.05, 0.3);
      group.add(eyeL);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
      eyeR.position.set(0.12, 2.05, 0.3);
      group.add(eyeR);

      return group;
    };
    
    // World Object Builder
    const spawnWorldObject = (obj: WorldObject) => {
      const group = new THREE.Group();
      group.position.set(obj.position.x, 0, obj.position.z);
      
      if (obj.type === 'house') {
        const base = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), new THREE.MeshLambertMaterial({ color: 0xddccaa }));
        base.position.y = 1.5;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(3.5, 2, 4), new THREE.MeshLambertMaterial({ color: 0x884422 }));
        roof.position.y = 4;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        group.add(roof);
      } else if (obj.type === 'tower') {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 8, 8), new THREE.MeshLambertMaterial({ color: 0x888899 }));
        base.position.y = 4;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);
        const top = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 16), new THREE.MeshLambertMaterial({ color: 0x4466aa }));
        top.position.y = 8;
        top.castShadow = true;
        group.add(top);
      } else if (obj.type === 'fountain') {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2, 0.5, 16), new THREE.MeshLambertMaterial({ color: 0xaaaaaa }));
        base.position.y = 0.25;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);
        const water = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.4, 16), new THREE.MeshLambertMaterial({ color: 0x44aaff, transparent: true, opacity: 0.8 }));
        water.position.y = 0.5;
        group.add(water);
      } else if (obj.type === 'garden') {
        for(let i=0; i<12; i++) {
          const flower = new THREE.Mesh(
            new THREE.SphereGeometry(0.25), 
            new THREE.MeshLambertMaterial({ color: Math.random() > 0.5 ? 0xff44aa : 0xffaa44 })
          );
          flower.position.set((Math.random()-0.5)*4, 0.25, (Math.random()-0.5)*4);
          flower.castShadow = true;
          group.add(flower);
        }
      } else {
        // default monument
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5, 1.2), new THREE.MeshLambertMaterial({ color: 0x333333 }));
        base.position.y = 2.5;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);
        const top = new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.2, 64, 8), new THREE.MeshLambertMaterial({ color: 0xffdd44 }));
        top.position.y = 6;
        top.castShadow = true;
        group.add(top);
      }

      group.scale.set(0, 0, 0); // For animation
      scene.add(group);
      objectsRef.current[obj.id] = group;
    };

    // Show Speech Bubble helper
    const showSpeechBubble = (npcId: string, text: string) => {
      const npc = npcsRef.current[npcId];
      if (!npc) return;
      if (npc.bubble) {
        scene.remove(npc.bubble);
      }
      const bubble = createSpeechBubbleSprite(text);
      bubble.position.set(npc.group.position.x, 4.5, npc.group.position.z);
      scene.add(bubble);
      npc.bubble = bubble;
      npc.bubbleTimer = performance.now() + 5000; // 5 seconds
    };

    // Setup Player
    playerRef.current.group = createCharacter(0x4ECDC4);
    scene.add(playerRef.current.group);
    
    // 2. WebSocket connection
    ws.current = new WebSocket(WS_URL);
    
    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({ type: "player-name", name: "Player" }));
    };

    ws.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        
        switch(data.type) {
          case "init":
            playerIdRef.current = data.playerId;
            setNpcList(data.npcs);
            data.npcs.forEach((n: any) => {
              const group = createCharacter(n.color);
              group.position.set(n.position.x, 0, n.position.z);
              scene.add(group);
              const labelInfo = createLabelSprite(n.name, n.color, n.currentAction, n.emotion);
              labelInfo.sprite.position.set(n.position.x, 3.2, n.position.z);
              scene.add(labelInfo.sprite);
              
              npcsRef.current[n.id] = { group, state: n, label: labelInfo.sprite };
            });
            data.worldObjects.forEach((obj: any) => spawnWorldObject(obj));
            break;
            
          case "npc-move": {
            const npc = npcsRef.current[data.npcId];
            if (npc) {
              npc.state.targetPosition = data.targetPosition;
              npc.state.currentAction = data.currentAction;
              npc.state.emotion = data.emotion;
              
              // Update label
              scene.remove(npc.label);
              const labelInfo = createLabelSprite(npc.state.name, npc.state.color, npc.state.currentAction, npc.state.emotion);
              labelInfo.sprite.position.copy(npc.label.position);
              scene.add(labelInfo.sprite);
              npc.label = labelInfo.sprite;
              
              setNpcList(prev => prev.map(n => n.id === data.npcId ? { ...n, ...data } : n));
            }
            break;
          }
          
          case "npc-arrived": {
            const npc = npcsRef.current[data.npcId];
            if (npc && data.position) {
              npc.group.position.set(data.position.x, 0, data.position.z);
              npc.state.targetPosition = undefined;
            }
            break;
          }
          
          case "npc-conversation": {
            showSpeechBubble(data.fromId, data.message);
            showSpeechBubble(data.toId, data.response);
            addEvent({
              type: "conversation",
              text: `${data.from} and ${data.to} are chatting.`,
              color: `border-teal-500`,
              initials: data.from[0]
            });
            break;
          }
          
          case "npc-created-object": {
            spawnWorldObject(data.object);
            showSpeechBubble(data.npcId, `I just built a ${data.object.type}!`);
            showToast(`${data.npcName} built a ${data.object.type}`, data.npcColor || '#ffffff');
            addEvent({
              type: "creation",
              text: `${data.npcName} built a ${data.object.type}.`,
              color: `border-yellow-500`,
              initials: data.npcName[0]
            });
            break;
          }
          
          case "npc-greet-player": {
            showSpeechBubble(data.npcId, data.message);
            addEvent({
              type: "greeting",
              text: `${data.npcName} says hello!`,
              color: `border-red-500`,
              initials: data.npcName[0]
            });
            break;
          }
          
          case "npc-response": {
            showSpeechBubble(data.npcId, data.response);
            setChatMessages(prev => ({
              ...prev,
              [data.npcId]: [...(prev[data.npcId] || []), { id: Date.now().toString(), from: "npc", text: data.response, color: data.npcColor, name: data.npcName }]
            }));
            break;
          }
        }
      } catch (err) {
        console.error("WS parse error", err);
      }
    };
    
    // 3. Input Handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') moveState.current.w = true;
      if (k === 'a' || e.key === 'ArrowLeft') moveState.current.a = true;
      if (k === 's' || e.key === 'ArrowDown') moveState.current.s = true;
      if (k === 'd' || e.key === 'ArrowRight') moveState.current.d = true;
      
      // Build shortcuts
      if (['1','2','3','4'].includes(k)) {
        const types = ["house", "tower", "fountain", "garden"];
        const type = types[parseInt(k)-1];
        const dir = new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0), camState.current.angleH);
        const pos = { x: playerRef.current.position.x - dir.x * 6, z: playerRef.current.position.z - dir.z * 6 };
        ws.current?.send(JSON.stringify({ type: "player-create", objType: type, position: pos }));
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') moveState.current.w = false;
      if (k === 'a' || e.key === 'ArrowLeft') moveState.current.a = false;
      if (k === 's' || e.key === 'ArrowDown') moveState.current.s = false;
      if (k === 'd' || e.key === 'ArrowRight') moveState.current.d = false;
    };
    
    const handleMouseDown = (e: MouseEvent) => {
      // Don't drag if clicking UI
      if ((e.target as HTMLElement).closest('.hud-element')) return;
      
      if (e.button === 0) {
        // Raycast for NPC chat
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(
          (e.clientX / window.innerWidth) * 2 - 1,
          -(e.clientY / window.innerHeight) * 2 + 1
        );
        raycaster.setFromCamera(mouse, camera);
        
        const intersects = raycaster.intersectObjects(
          Object.values(npcsRef.current).map(n => n.group), true
        );
        
        if (intersects.length > 0) {
          const hitObj = intersects[0].object;
          const hitGroup = hitObj.parent;
          const entry = Object.entries(npcsRef.current).find(([id, n]) => n.group === hitGroup);
          if (entry) {
            setActiveChatNPC(entry[0]);
            return;
          }
        }
      }
      
      camState.current.isDragging = true;
      camState.current.lastMouseX = e.clientX;
      camState.current.lastMouseY = e.clientY;
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!camState.current.isDragging) return;
      const dx = e.clientX - camState.current.lastMouseX;
      const dy = e.clientY - camState.current.lastMouseY;
      camState.current.lastMouseX = e.clientX;
      camState.current.lastMouseY = e.clientY;
      
      camState.current.angleH -= dx * 0.01;
      camState.current.angleV += dy * 0.01;
      
      // Clamp V angle
      camState.current.angleV = Math.max(0.1, Math.min(1.3, camState.current.angleV));
    };
    
    const handleMouseUp = () => {
      camState.current.isDragging = false;
    };
    
    const handleWheel = (e: WheelEvent) => {
      camState.current.distance += e.deltaY * 0.05;
      camState.current.distance = Math.max(6, Math.min(40, camState.current.distance));
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("wheel", handleWheel);
    
    // 4. Animation Loop
    let animationId: number;
    let lastTime = performance.now();
    let minimapTimer = 0;
    
    const animate = (time: number) => {
      const delta = (time - lastTime) / 1000;
      lastTime = time;
      
      // Player Movement
      const move = moveState.current;
      if (move.w || move.a || move.s || move.d) {
        const speed = 8 * delta;
        const dir = new THREE.Vector3();
        
        // Forward vector relative to camera (ignore Y)
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0,1,0), camState.current.angleH);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0,1,0), camState.current.angleH);
        
        if (move.w) dir.add(forward);
        if (move.s) dir.sub(forward);
        if (move.a) dir.sub(right);
        if (move.d) dir.add(right);
        
        if (dir.lengthSq() > 0) {
          dir.normalize().multiplyScalar(speed);
          playerRef.current.position.x += dir.x;
          playerRef.current.position.z += dir.z;
          playerRef.current.group.position.set(playerRef.current.position.x, 0, playerRef.current.position.z);
          
          // Rotate player to face movement direction
          const targetRot = Math.atan2(dir.x, dir.z);
          playerRef.current.group.rotation.y = targetRot;
          
          // Send move to server
          if (time - lastMoveSent.current > 100) {
            ws.current?.send(JSON.stringify({ type: "player-move", position: playerRef.current.position }));
            lastMoveSent.current = time;
          }
        }
      }
      
      // Update camera
      const pGroup = playerRef.current.group;
      const cState = camState.current;
      camera.position.x = pGroup.position.x + cState.distance * Math.sin(cState.angleH) * Math.cos(cState.angleV);
      camera.position.y = pGroup.position.y + cState.distance * Math.sin(cState.angleV);
      camera.position.z = pGroup.position.z + cState.distance * Math.cos(cState.angleH) * Math.cos(cState.angleV);
      camera.lookAt(pGroup.position.x, pGroup.position.y + 1.5, pGroup.position.z);
      
      // Update NPCs
      Object.values(npcsRef.current).forEach(n => {
        // Interpolate movement
        if (n.state.targetPosition) {
          const dx = n.state.targetPosition.x - n.group.position.x;
          const dz = n.state.targetPosition.z - n.group.position.z;
          const dist = Math.sqrt(dx*dx + dz*dz);
          if (dist > 0.3) {
            n.group.position.x += (dx/dist) * 4 * delta;
            n.group.position.z += (dz/dist) * 4 * delta;
            n.group.rotation.y = Math.atan2(dx, dz);
          } else {
            n.group.position.set(n.state.targetPosition.x, 0, n.state.targetPosition.z);
            n.state.targetPosition = undefined;
          }
        }
        
        // Update labels and bubbles
        n.label.position.set(n.group.position.x, 3.2, n.group.position.z);
        if (n.bubble) {
          n.bubble.position.set(n.group.position.x, 4.5, n.group.position.z);
          if (time > (n.bubbleTimer || 0)) {
            scene.remove(n.bubble);
            n.bubble = undefined;
          }
        }
      });
      
      // Animate Objects (Scale up)
      Object.values(objectsRef.current).forEach(obj => {
        if (obj.scale.x < 1) {
          const s = Math.min(1, obj.scale.x + delta * 2);
          obj.scale.set(s, s, s);
        }
      });
      
      // Update Minimap ~10fps
      if (time - minimapTimer > 100) {
        updateMinimap();
        minimapTimer = time;
      }
      
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate(performance.now());
    
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
      ws.current?.close();
    };
  }, [addEvent, showToast, updateMinimap]);
  
  const sendMessage = () => {
    if (!chatInput.trim() || !activeChatNPC) return;
    ws.current?.send(JSON.stringify({ type: "player-chat", npcId: activeChatNPC, message: chatInput }));
    setChatMessages(prev => ({
      ...prev,
      [activeChatNPC]: [...(prev[activeChatNPC] || []), { id: Date.now().toString(), from: "player", text: chatInput }]
    }));
    setChatInput("");
  };

  const activeNpcData = npcList.find(n => n.id === activeChatNPC);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0a0a1a]">
      <div ref={containerRef} className="absolute inset-0 z-0" />
      
      {/* Event Feed */}
      <div className="absolute top-6 left-6 z-10 w-80 space-y-3 pointer-events-none hud-element">
        {events.map(ev => (
          <div key={ev.id} className={`p-4 rounded-xl bg-card/85 backdrop-blur border-l-4 shadow-lg ${ev.color} animate-in fade-in slide-in-from-left-4`}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                {ev.initials}
              </div>
              <p className="text-sm text-foreground/90 font-medium leading-relaxed">{ev.text}</p>
            </div>
          </div>
        ))}
      </div>
      
      {/* NPC List */}
      <div className="absolute top-6 right-6 z-10 w-72 bg-card/85 backdrop-blur rounded-2xl border border-border/50 p-5 shadow-xl hud-element">
        <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2 tracking-wide uppercase">
          <Users size={16} className="text-primary" /> Citizens
        </h2>
        <div className="space-y-1 max-h-[35vh] overflow-y-auto pr-2 custom-scrollbar">
          {npcList.map(npc => (
            <div 
              key={npc.id} 
              className={`flex flex-col p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-all ${activeChatNPC === npc.id ? 'bg-white/10 ring-1 ring-primary/50' : ''}`}
              onClick={() => setActiveChatNPC(npc.id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: npc.color }} />
                <span className="text-sm font-semibold text-foreground truncate">{npc.name}</span>
                {npc.emotion && (
                  <span className="ml-auto text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground truncate max-w-[60px]">
                    {npc.emotion}
                  </span>
                )}
              </div>
              {npc.currentAction && (
                <span className="text-xs text-muted-foreground mt-1.5 ml-6 truncate block opacity-70">
                  {npc.currentAction}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Chat Panel */}
      {activeChatNPC && activeNpcData && (
        <div className="absolute top-6 bottom-24 right-[320px] w-96 bg-card/95 backdrop-blur-xl rounded-2xl border border-border/50 flex flex-col z-20 shadow-2xl overflow-hidden hud-element animate-in fade-in slide-in-from-right-8">
          <div className="p-5 border-b border-border/50 bg-black/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full shadow-md" style={{ backgroundColor: activeNpcData.color }} />
              <div>
                <h3 className="font-bold text-foreground leading-tight">{activeNpcData.name}</h3>
                <p className="text-xs text-muted-foreground">{activeNpcData.emotion || 'Idle'}</p>
              </div>
            </div>
            <button onClick={() => setActiveChatNPC(null)} className="p-2 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-full transition-colors">
              <X size={18} />
            </button>
          </div>
          
          <div className="flex-1 p-5 overflow-y-auto space-y-5 custom-scrollbar bg-black/10">
            <div className="text-center pb-4">
              <span className="text-xs text-muted-foreground/60 bg-black/20 px-3 py-1 rounded-full">
                Conversation started
              </span>
            </div>
            {(chatMessages[activeChatNPC] || []).map((msg, i) => (
              <div key={msg.id || i} className={`flex flex-col ${msg.from === "player" ? "items-end" : "items-start"}`}>
                <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] shadow-sm ${
                  msg.from === "player" 
                    ? "bg-primary text-primary-foreground rounded-br-sm" 
                    : "bg-secondary text-secondary-foreground rounded-bl-sm border border-border/30"
                }`}>
                  <p className="text-[15px] leading-relaxed">{msg.text}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="p-4 border-t border-border/50 bg-card">
            <div className="relative flex items-center">
              <input 
                className="w-full bg-black/30 border border-border/50 rounded-full pl-5 pr-12 py-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder={`Talk to ${activeNpcData.name}...`}
                autoFocus
              />
              <button 
                onClick={sendMessage}
                disabled={!chatInput.trim()}
                className="absolute right-2 p-2 bg-primary/20 text-primary rounded-full hover:bg-primary hover:text-white disabled:opacity-50 transition-colors"
              >
                <MessageSquare size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Creation Toast */}
      {toast && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 px-6 py-3 rounded-full bg-card/95 backdrop-blur-md border border-border/50 shadow-xl hud-element animate-in fade-in slide-in-from-bottom-4">
          <p className="text-sm font-semibold tracking-wide" style={{ color: toast.color }}>{toast.text}</p>
        </div>
      )}
      
      {/* Build Menu */}
      <div className="absolute bottom-6 right-6 z-10 flex gap-3 hud-element">
        {[
          { type: "house", icon: "🏠", label: "House", key: "1" },
          { type: "tower", icon: "🗼", label: "Tower", key: "2" },
          { type: "fountain", icon: "⛲", label: "Fountain", key: "3" },
          { type: "garden", icon: "🌸", label: "Garden", key: "4" }
        ].map((item) => (
          <button 
            key={item.type}
            className="w-14 h-14 rounded-2xl bg-card/85 backdrop-blur-md border border-border/50 flex flex-col items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all group relative shadow-lg hover:-translate-y-1"
            onClick={() => {
              const dir = new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0), camState.current.angleH);
              const pos = { x: playerRef.current.position.x + dir.x * 6, z: playerRef.current.position.z + dir.z * 6 };
              ws.current?.send(JSON.stringify({ type: "player-create", objType: item.type, position: pos }));
            }}
          >
            <span className="text-2xl mb-1">{item.icon}</span>
            <div className="absolute -top-10 bg-black/90 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 whitespace-nowrap font-medium tracking-wide pointer-events-none transition-opacity">
              Build {item.label} <span className="text-muted-foreground ml-1">[{item.key}]</span>
            </div>
          </button>
        ))}
      </div>
      
      {/* Minimap */}
      <div className="absolute bottom-6 left-6 z-10 p-2 bg-card/85 backdrop-blur-md border border-border/50 rounded-2xl shadow-xl hud-element">
        <canvas ref={minimapRef} width={160} height={160} className="rounded-xl border border-white/5 bg-[#0a0a1a]" />
        <div className="mt-3 flex items-center justify-center gap-4 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-white" /> You</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-primary" /> NPCs</div>
        </div>
      </div>
      
    </div>
  );
}
