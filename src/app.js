// 같이 보는 방 — 3D 버전의 뼈대
// 세계 모델은 하나(방·탁자·노트북·유선 마우스·친구 둘)이고, 친구를 클릭하면 "그림체(테마)"만 그 친구의 게임 것으로 바뀐다.
//
// ── 캐릭터 모듈 약속 (src/characters/<id>.js) ──────────────────────────────
//   export async function createCharacter(ctx) → {
//     root,            // THREE.Object3D. 원점 = 바닥의 앉는 자리, +Z(카메라 쪽)를 보고 앉은 자세. 단위 m.
//     headHeight,      // 머리 꼭대기 높이(m) — 이름표·말풍선 위치
//     update(dt, t, state),   // state = { phase:'idle'|'playing'|'paused'|'ended', active, lookTarget:Vector3(월드) }
//     react(kind),     // 'laugh'|'wow'|'clap'|'love'|'sad'|'eat'|'cheer'
//     setActive(on),   // 이 친구의 세계가 켜짐/꺼짐 — 게임 속 모션·목소리·상호작용을 켠다
//     onClick?(),      // 이미 켜진 상태에서 다시 클릭됐을 때(상호작용)
//   }
// ── 테마 모듈 약속 (src/themes/<id>.js) ────────────────────────────────────
//   export default { id, label, async load(ctx), enter(ctx), exit(ctx), update(ctx, dt, t), post }
//   enter 전에 앱이 기본(아늑한 방) 모습으로 되돌려 주므로, enter 는 바꿀 것만 바꾸고 exit 는 자기가 추가한 것만 치운다.
//   post = null 또는 { uniforms, fragmentShader } (tDiffuse 를 받는 전체 화면 후처리 한 장)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

/* ───────── 렌더러 · 장면 · 카메라 ───────── */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));  // 폰은 조금 낮춰 가볍게
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
// 후처리를 거쳐도 가장자리가 계단지지 않도록 4배 멀티샘플 버퍼를 쓴다
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
let themePass = null;
const outputPass = new OutputPass();
composer.addPass(outputPass);

/* ───────── 치수 ───────── */
const TABLE_Y = 0.34;
const SCREEN_W = 0.62, SCREEN_H = SCREEN_W * 808 / 1366;   // 화면 = 주소줄(40) + 유튜브(768)
const LID_TILT = 0.24;                                       // 뒤로 젖혀진 각도(rad)
const HINGE = new THREE.Vector3(0, TABLE_Y + 0.022, -0.16);
const SEATS = { shoreline: new THREE.Vector3(-0.8, 0, -0.3), penguin: new THREE.Vector3(0.8, 0, -0.3) };

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
const mats = {
  floor: mat('#7b5140'), wall: mat('#3d3168'), ceiling: mat('#2b2452'), rug: mat('#55789f'), rugTrim: mat('#f0e2c8'),
  table: mat('#b98356'), tableLeg: mat('#7d5133'), cushionA: mat('#e9a15b'), cushionB: mat('#7fe3c4'),
  laptopBody: mat('#cfd3de', { roughness: 0.45, metalness: 0.5 }), laptopDark: mat('#17161f', { roughness: 0.6 }),
  keycap: mat('#2a2933', { roughness: 0.7 }), mouseBody: mat('#e7e9f0', { roughness: 0.4 }), cable: mat('#22212b'),
  windowFrame: mat('#efe3cf'), windowGlass: new THREE.MeshBasicMaterial({ color: '#1b2350' }),
  picture: new THREE.MeshBasicMaterial({ color: '#ffb48a' }),
};
const DEFAULT_COLORS = Object.fromEntries(Object.entries(mats).map(([k, m]) => [k, { color: m.color.clone(), roughness: m.roughness, metalness: m.metalness }]));

/* ───────── 방 ───────── */
const parts = {};
const room = new THREE.Group();
scene.add(room);
function box(w, h, d, m, x, y, z, parent = room) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o;
}
parts.floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), mats.floor);
parts.floor.rotation.x = -Math.PI / 2; parts.floor.position.z = 0.6; parts.floor.receiveShadow = true; room.add(parts.floor);
parts.backWall = box(8, 3, 0.1, mats.wall, 0, 1.5, -1.55);
parts.leftWall = box(0.1, 3, 6, mats.wall, -3.2, 1.5, 0.6);
parts.rightWall = box(0.1, 3, 6, mats.wall, 3.2, 1.5, 0.6);
parts.rug = new THREE.Mesh(new THREE.CircleGeometry(1.55, 64), mats.rug);
parts.rug.rotation.x = -Math.PI / 2; parts.rug.position.set(0, 0.004, 0.15); parts.rug.receiveShadow = true; room.add(parts.rug);
parts.rugRing = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.26, 64), mats.rugTrim);
parts.rugRing.rotation.x = -Math.PI / 2; parts.rugRing.position.set(0, 0.006, 0.15); room.add(parts.rugRing);

// 낮은 탁자
parts.table = new THREE.Group(); room.add(parts.table);
box(1.5, 0.05, 0.8, mats.table, 0, TABLE_Y - 0.025, 0.05, parts.table);
for (const [x, z] of [[-0.68, -0.28], [0.68, -0.28], [-0.68, 0.38], [0.68, 0.38]]) box(0.06, TABLE_Y - 0.05, 0.06, mats.tableLeg, x, (TABLE_Y - 0.05) / 2, z, parts.table);

// 방석
parts.cushions = {};
for (const [id, m] of [['shoreline', mats.cushionA], ['penguin', mats.cushionB]]) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.07, 40), m);
  c.position.copy(SEATS[id]).setY(0.035); c.castShadow = c.receiveShadow = true; room.add(c); parts.cushions[id] = c;
}

// 꾸밈(아늑한 방 전용): 창문 · 액자 · 꼬마전구
parts.decor = new THREE.Group(); room.add(parts.decor);
{
  const win = new THREE.Group(); win.position.set(-1.75, 1.45, -1.49); parts.decor.add(win);
  box(0.72, 0.95, 0.04, mats.windowFrame, 0, 0, 0, win);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.85), mats.windowGlass); glass.position.z = 0.025; win.add(glass);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), new THREE.MeshBasicMaterial({ color: '#fff6cf' })); moon.position.set(0.14, 0.2, 0.03); win.add(moon);
  box(0.035, 0.85, 0.02, mats.windowFrame, 0, 0, 0.03, win); box(0.62, 0.035, 0.02, mats.windowFrame, 0, 0, 0.03, win);
  parts.window = win;
  const pic = new THREE.Group(); pic.position.set(1.8, 1.5, -1.49); parts.decor.add(pic);
  box(0.62, 0.46, 0.04, mats.windowFrame, 0, 0, 0, pic);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.38), mats.picture); art.position.z = 0.025; pic.add(art);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshBasicMaterial({ color: '#ffe9a8' })); sun.position.set(0, -0.03, 0.03); pic.add(sun);
  parts.picture = pic;
  parts.stringLights = new THREE.Group(); parts.decor.add(parts.stringLights);
  const cols = ['#ffc66b', '#ff86a8', '#7fe3c4', '#8fb4ff'];
  for (let i = 0; i < 22; i++) {
    const u = i / 21, x = lerp(-3, 3, u), seg = (u * 4) % 1;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), new THREE.MeshBasicMaterial({ color: cols[i % 4] }));
    b.position.set(x, 2.45 - 0.22 * 4 * seg * (1 - seg), -1.46); parts.stringLights.add(b);
  }
}

/* ───────── 조명 ───────── */
const lights = {
  hemi: new THREE.HemisphereLight('#a9a0e0', '#4a352c', 1.5),
  key: new THREE.DirectionalLight('#ffd9a8', 1.5),
  lamp: new THREE.PointLight('#ffc66b', 1.2, 7, 1.6),
  screen: new THREE.PointLight('#a8c4ff', 0.55, 2.6, 1.8),
};
lights.key.position.set(1.8, 3, 2.4); lights.key.castShadow = true;
lights.key.shadow.mapSize.set(2048, 2048); lights.key.shadow.radius = 5; lights.key.shadow.bias = -0.0004;
Object.assign(lights.key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 9 });
lights.lamp.position.set(0, 2.3, -0.9);
lights.screen.position.set(0, TABLE_Y + 0.25, 0.25);
scene.add(lights.hemi, lights.key, lights.lamp, lights.screen);
const DEFAULT_LIGHTS = {
  hemi: [lights.hemi.color.clone(), lights.hemi.groundColor.clone(), lights.hemi.intensity],
  key: [lights.key.color.clone(), lights.key.intensity, lights.key.position.clone()],
  lamp: [lights.lamp.color.clone(), lights.lamp.intensity], screen: [lights.screen.color.clone(), lights.screen.intensity],
};

/* ───────── 노트북 (임시 모양 — 외부 모델이 오면 assets/laptop.glb 로 바꿔 낀다) ───────── */
const laptop = new THREE.Group(); room.add(laptop); parts.laptop = laptop;
const base = box(0.66, 0.02, 0.4, mats.laptopBody, 0, TABLE_Y + 0.01, 0.04, laptop);
const deck = box(0.56, 0.002, 0.2, mats.laptopDark, 0, TABLE_Y + 0.0205, -0.03, laptop); deck.castShadow = false;
const trackpad = box(0.15, 0.002, 0.09, mat('#b9bdcb', { roughness: 0.3, metalness: 0.4 }), 0, TABLE_Y + 0.021, 0.165, laptop);
const lid = new THREE.Group(); lid.position.copy(HINGE); lid.rotation.x = -LID_TILT; laptop.add(lid);
box(0.66, SCREEN_H + 0.045, 0.012, mats.laptopBody, 0, (SCREEN_H + 0.045) / 2, -0.006, lid);
const bezel = box(0.645, SCREEN_H + 0.03, 0.004, mats.laptopDark, 0, (SCREEN_H + 0.045) / 2, 0.002, lid); bezel.castShadow = false;
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), new THREE.MeshBasicMaterial({ color: '#0f0f0f' }));
screenMesh.position.set(0, (SCREEN_H + 0.045) / 2, 0.0045); lid.add(screenMesh);
parts.screen = screenMesh;

// 키보드: 키 하나하나가 실제 키 위치(code)와 이어져 있어서, 타자를 치면 같은 키가 눌린다
const ROWS = [
  [['Escape', 1], ['F1', 1], ['F2', 1], ['F3', 1], ['F4', 1], ['F5', 1], ['F6', 1], ['F7', 1], ['F8', 1], ['F9', 1], ['F10', 1], ['F11', 1], ['F12', 1], ['Delete', 2]],
  [['Backquote', 1], ['Digit1', 1], ['Digit2', 1], ['Digit3', 1], ['Digit4', 1], ['Digit5', 1], ['Digit6', 1], ['Digit7', 1], ['Digit8', 1], ['Digit9', 1], ['Digit0', 1], ['Minus', 1], ['Equal', 1], ['Backspace', 2]],
  [['Tab', 1.5], ['KeyQ', 1], ['KeyW', 1], ['KeyE', 1], ['KeyR', 1], ['KeyT', 1], ['KeyY', 1], ['KeyU', 1], ['KeyI', 1], ['KeyO', 1], ['KeyP', 1], ['BracketLeft', 1], ['BracketRight', 1], ['Backslash', 1.5]],
  [['CapsLock', 1.75], ['KeyA', 1], ['KeyS', 1], ['KeyD', 1], ['KeyF', 1], ['KeyG', 1], ['KeyH', 1], ['KeyJ', 1], ['KeyK', 1], ['KeyL', 1], ['Semicolon', 1], ['Quote', 1], ['Enter', 2.25]],
  [['ShiftLeft', 2.25], ['KeyZ', 1], ['KeyX', 1], ['KeyC', 1], ['KeyV', 1], ['KeyB', 1], ['KeyN', 1], ['KeyM', 1], ['Comma', 1], ['Period', 1], ['Slash', 1], ['ShiftRight', 2.75]],
  [['ControlLeft', 1.25], ['MetaLeft', 1.25], ['AltLeft', 1.25], ['Space', 5], ['AltRight', 1.25], ['ControlRight', 1], ['ArrowLeft', 1], ['ArrowUp', 1], ['ArrowDown', 1], ['ArrowRight', 1]],
];
const keys = {};
{
  const U = 0.036, GAP = 0.004, KH = 0.006, x0 = -0.27, z0 = -0.118, topY = TABLE_Y + 0.0215;
  ROWS.forEach((row, r) => {
    let x = x0;
    const depth = r === 0 ? U * 0.62 : U;
    const z = z0 + (r === 0 ? 0 : U * 0.62 + (r - 1) * U) + depth / 2;
    for (const [code, w] of row) {
      const kw = w * U - GAP;
      const k = new THREE.Mesh(new THREE.BoxGeometry(kw, KH, depth - GAP), mats.keycap);
      k.position.set(x + (w * U) / 2, topY + KH / 2, z); k.userData = { restY: topY + KH / 2, down: false };
      laptop.add(k); keys[code] = k; x += w * U;
    }
  });
  keys.Lang1 = keys.AltRight; keys.HangulMode = keys.AltRight; keys.NumpadEnter = keys.Enter;
}
function pressKey(code, down) { const k = keys[code]; if (k) k.userData.down = down; }

// 외부에서 만든 노트북 모델이 있으면 임시 몸체 대신 끼운다 (화면·키는 그대로 위에 얹힌다)
const loader = new GLTFLoader();
loader.load('assets/laptop.glb', g => {
  const m = g.scene; m.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  const bb = new THREE.Box3().setFromObject(m), size = bb.getSize(new THREE.Vector3());
  const s = 0.6 / Math.max(size.x, size.z); m.scale.setScalar(s);
  bb.setFromObject(m); m.position.set(-(bb.min.x + bb.max.x) / 2, TABLE_Y - bb.min.y, 0.04 - (bb.min.z + bb.max.z) / 2);
  parts.laptopModel = m; laptop.add(m);
}, undefined, () => {});

/* ───────── 유선 마우스 ───────── */
const mouse3d = new THREE.Group(); room.add(mouse3d); parts.mouse = mouse3d;
const MOUSE_HOME = new THREE.Vector3(0.52, TABLE_Y, 0.22);
{
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.033, 28, 18), mats.mouseBody);
  body.scale.set(1, 0.55, 1.6); body.position.y = 0.014; body.castShadow = true; mouse3d.add(body);
  const split = box(0.002, 0.004, 0.045, mats.cable, 0, 0.03, -0.022, mouse3d); split.castShadow = false;
  const btnL = box(0.024, 0.004, 0.04, mats.mouseBody, -0.014, 0.0285, -0.024, mouse3d);
  const btnR = box(0.024, 0.004, 0.04, mats.mouseBody, 0.014, 0.0285, -0.024, mouse3d);
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 14), mats.cable);
  wheel.rotation.z = Math.PI / 2; wheel.position.set(0, 0.031, -0.03); mouse3d.add(wheel);
  mouse3d.userData = { btnL, btnR, wheel, target: MOUSE_HOME.clone(), down: [false, false] };
  mouse3d.position.copy(MOUSE_HOME);
}
let cable = null;
function updateCable() {
  const a = mouse3d.position.clone().add(new THREE.Vector3(0, 0.012, -0.052));
  const b = new THREE.Vector3(0.33, TABLE_Y + 0.012, -0.1);
  const mid = a.clone().lerp(b, 0.5); mid.z -= 0.12; mid.y = TABLE_Y + 0.004;
  const curve = new THREE.CatmullRomCurve3([a, a.clone().add(new THREE.Vector3(0, -0.008, -0.05)), mid, b.clone().add(new THREE.Vector3(0.06, -0.006, 0)), b]);
  const geo = new THREE.TubeGeometry(curve, 24, 0.0028, 6);
  if (!cable) { cable = new THREE.Mesh(geo, mats.cable); cable.castShadow = true; room.add(cable); parts.cable = cable; }
  else { cable.geometry.dispose(); cable.geometry = geo; }
}
// 화면 안/밖 어디서든 포인터가 움직이면 3D 마우스가 같이 움직인다
function moveMouseTo(nx, ny) {
  mouse3d.userData.target.set(MOUSE_HOME.x + (nx - 0.5) * 0.16, TABLE_Y, MOUSE_HOME.z + (ny - 0.5) * 0.11);
}

/* ───────── 카메라 (휠로 가까이/멀리) ───────── */
let dolly = 0.7, dollyTarget = 0.7;
const CAM_WIDE = { p: new THREE.Vector3(0, 1.15, 2.4), t: new THREE.Vector3(0, 0.66, -0.15) };
const CAM_NEAR = { p: new THREE.Vector3(0, 0.7, 0.42), t: new THREE.Vector3(0, 0.555, -0.16) };
function placeCamera() {
  camera.position.lerpVectors(CAM_WIDE.p, CAM_NEAR.p, dolly);
  camera.lookAt(new THREE.Vector3().lerpVectors(CAM_WIDE.t, CAM_NEAR.t, dolly));
  camera.updateMatrixWorld();
}

/* ───────── 노트북 화면 ↔ 진짜 브라우저 맞추기 ───────── */
const wrap = $('#screenWrap'), cursorEl = $('#cursor');
const WRAP_W = 1366, WRAP_H = 808, BAR_H = 40;
let H = null, Hinv = null, lastCss = '';
// 네 꼭짓점(화면 픽셀)으로 가는 원근 변환 행렬
function homography(pts) {
  const src = [[0, 0], [WRAP_W, 0], [WRAP_W, WRAP_H], [0, WRAP_H]], A = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = pts[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
const apply3 = (m, x, y) => { const w = m[6] * x + m[7] * y + m[8]; return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w]; };
const corner = new THREE.Vector3();
function alignScreen() {
  const hw = SCREEN_W / 2, hh = SCREEN_H / 2, pts = [];
  for (const [x, y] of [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]]) {
    corner.set(x, y, 0); screenMesh.localToWorld(corner).project(camera);
    pts.push([(corner.x + 1) / 2 * innerWidth, (1 - corner.y) / 2 * innerHeight]);
  }
  H = homography(pts); Hinv = inv3(H);
  const css = `matrix3d(${H[0]},${H[3]},0,${H[6]},${H[1]},${H[4]},0,${H[7]},0,0,1,0,${H[2]},${H[5]},0,1)`;
  if (css !== lastCss) { wrap.style.transform = css; lastCss = css; }
}
// 화면 속 커서: 진짜 커서는 숨기고, 노트북 화면 위에 놓인 커서를 그린다(기울기·크기가 화면을 따라간다)
function setCursor(x, y, kind) {
  cursorEl.style.display = 'block';
  cursorEl.style.transform = `translate(${x}px,${y}px)`;
  if (kind) cursorEl.dataset.k = kind;
  moveMouseTo(x / WRAP_W, y / WRAP_H);
}
const hideCursor = () => { cursorEl.style.display = 'none'; };

/* ───────── 노트북 속 유튜브 ───────── */
const urlInput = $('#urlInput');
const IS_APP = /\bElectron\//.test(navigator.userAgent);   // 데스크톱 앱이면 진짜 유튜브 사이트, 아니면(폰·브라우저) 유튜브 플레이어
const TOUCH = matchMedia('(pointer: coarse)').matches;
const YT_URL = /^(https?:\/\/)?([\w-]+\.)*(youtube\.com|youtu\.be)(\/|$)/i;
let wv = null, wvReady = false, phase = 'idle', title = '', lastVid = null, watched = 0;
const PROBE = `(() => {
  const vs = Array.from(document.querySelectorAll('video'));
  const v = vs.find(x => !x.paused && !x.ended && x.readyState > 1) || vs.find(x => x.currentTime > 0 && x.duration > 0) || null;
  return { path: location.pathname, id: new URLSearchParams(location.search).get('v') || location.pathname,
    title: document.title.replace(/^\\(\\d+\\)\\s*/, '').replace(/\\s*-\\s*YouTube$/, ''),
    has: !!v, playing: !!v && !v.paused && !v.ended, ended: !!v && v.ended, t: v ? v.currentTime : 0 };
})()`;
function go(raw) {
  const url = YT_URL.test(raw) ? 'https://' + raw.replace(/^https?:\/\//i, '') : 'https://www.youtube.com/results?search_query=' + encodeURIComponent(raw);
  urlInput.blur();
  if (wvReady) wv.loadURL(url).catch(() => {}); else wv.setAttribute('src', url);
}
function initBrowser() {
  const first = new URLSearchParams(location.search).get('url');
  wv = document.createElement('webview');
  wv.setAttribute('partition', 'persist:watchroom');
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('src', first && YT_URL.test(first) ? first : 'https://www.youtube.com/');
  wrap.insertBefore(wv, cursorEl);
  wv.addEventListener('dom-ready', () => {
    wvReady = true; wv.setZoomFactor(1);
    wv.insertCSS('*,*::before,*::after{cursor:none!important}');
  });
  const showUrl = u => { if (document.activeElement !== urlInput) urlInput.value = u.replace(/^https?:\/\/(www\.)?/, ''); };
  wv.addEventListener('did-navigate', e => showUrl(e.url));
  wv.addEventListener('did-navigate-in-page', e => { if (e.isMainFrame) showUrl(e.url); });
  wv.addEventListener('did-fail-load', e => { if (e.isMainFrame && e.errorCode !== -3) toast('유튜브를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); });
  wv.addEventListener('ipc-message', e => {
    const a = e.args[0] || {};
    if (e.channel === 'wr-move') setCursor(a.x * WRAP_W, BAR_H + a.y * (WRAP_H - BAR_H), a.k);
    else if (e.channel === 'wr-leave') hideCursor();
    else if (e.channel === 'wr-button') clickMouse(a.button === 2 ? 1 : 0, a.down);
    else if (e.channel === 'wr-wheel') mouse3d.userData.wheel.rotation.x += a.dy * 0.6;
    else if (e.channel === 'wr-key') pressKey(a.code, a.down);
  });
  $('#urlForm').addEventListener('submit', e => { e.preventDefault(); const v = urlInput.value.trim(); if (v) go(v); });
  urlInput.addEventListener('focus', () => urlInput.select());
  $('#navBack').addEventListener('click', () => { if (wvReady && wv.canGoBack()) wv.goBack(); });
  $('#navFwd').addEventListener('click', () => { if (wvReady && wv.canGoForward()) wv.goForward(); });
  $('#navReload').addEventListener('click', () => { if (wvReady) wv.reload(); });
  $('#navHome').addEventListener('click', () => go('youtube.com/'));
  setInterval(async () => {
    if (!wvReady) return;
    try { applyProbe(await wv.executeJavaScript(PROBE)); } catch {}
  }, 600);
}
function applyProbe(s) {
  const watching = /^\/(watch|shorts\/|live\/)/.test(s.path);
  let p = 'idle';
  if (watching && s.has) {
    if (s.id !== lastVid) { lastVid = s.id; friendSay(pick(LINES.start)); }
    title = s.title; p = s.ended ? 'ended' : s.playing ? 'playing' : s.t > 0.2 ? 'paused' : 'idle';
  } else { title = ''; lastVid = null; }
  setPhase(p);
}
function setPhase(p) {
  if (p !== phase) {
    const prev = phase; phase = p; document.body.dataset.phase = p;
    if (p === 'paused') setTimeout(() => { if (phase === 'paused') friendSay(pick(LINES.pause)); }, 1800);
    else if (p === 'ended') setTimeout(() => friendSay(pick(LINES.ended)), 700);
    else if (p === 'playing' && prev === 'paused') friendSay(pick(LINES.resume));
  }
  const label = { idle: '대기 중', playing: '재생 중', paused: '일시정지', ended: '영상 끝' }[phase];
  $('#statusText').textContent = title && phase !== 'idle' ? `${label} · ${title}` : label;
}
setInterval(() => {
  if (phase !== 'playing') return;
  watched++;
  const m = Math.floor(watched / 60), s = watched % 60;
  $('#watchTime').textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}, 1000);

/* ───────── 폰·브라우저: 노트북 속 유튜브 플레이어 ─────────
   브라우저에서는 유튜브 사이트 전체를 띄울 수 없어서, 링크를 붙여넣으면 그 영상을 노트북 화면에서 재생한다.
   폰에서 유튜브 앱의 '공유 → 같이 보는 방'으로 보내도 바로 열린다(manifest share_target). */
function parseTime(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return +t;
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}
function parseYouTube(input) {
  const s = (input || '').trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return { id: s };
  const found = s.match(/https?:\/\/\S+|(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/\S+/i);   // 공유 글 속 링크도 찾는다
  let u;
  try { const raw = found ? found[0] : s; u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/); if (m) id = m[1]; }
  } else return null;
  const list = u.searchParams.get('list');
  const start = parseTime(u.searchParams.get('t') || u.searchParams.get('start'));
  if (id && /^[\w-]{11}$/.test(id)) return { id, start };
  if (list && /^[\w-]+$/.test(list)) return { list };
  return null;
}
let yt = { state: 'none', player: null, ready: false, pending: null };
function initWebPlayer() {
  document.body.classList.add('web');
  const host = document.createElement('div'); host.id = 'ytHost';
  host.innerHTML = `<div id="ytEmpty"><b>무엇을 볼까요?</b>
    <p>유튜브 앱에서 영상의 <b>공유 → 같이 보는 방</b>을 누르거나,<br>링크를 복사해서 위 칸에 붙여넣어 주세요.</p>
    <p class="ytFind"></p></div><div id="ytPlayer"></div>`;
  wrap.insertBefore(host, cursorEl);
  urlInput.placeholder = '유튜브 링크 붙여넣기 (또는 검색어)';
  $('#goBtn').textContent = '보기';
  const paste = document.createElement('button'); paste.type = 'button'; paste.id = 'pasteBtn'; paste.textContent = '붙여넣기';
  $('#urlForm').insertBefore(paste, $('#goBtn'));
  paste.addEventListener('click', async () => {
    try { const t = await navigator.clipboard.readText(); if (t) { urlInput.value = t.trim(); webGo(t); } else toast('복사한 링크가 없어요.'); }
    catch { toast('붙여넣기를 못 했어요. 칸을 길게 눌러 붙여넣어 주세요.'); }
  });
  $('#urlForm').addEventListener('submit', e => { e.preventDefault(); const v = urlInput.value.trim(); if (v) webGo(v); });
  urlInput.addEventListener('focus', () => urlInput.select());
  $('#navHome').addEventListener('click', () => {
    if (yt.ready) yt.player.stopVideo();
    host.classList.remove('on'); urlInput.value = ''; title = ''; lastVid = null; setPhase('idle');
  });
  // 폰에서는 노트북 주소칸이 작아서, 큰 '영상 고르기' 창을 따로 띄운다
  const pick = $('#pickBox'), pickIn = $('#pickInput');
  const openPick = () => { pick.hidden = false; pickIn.value = ''; pickIn.focus(); };
  $('#pickBtn').hidden = false;
  $('#pickBtn').addEventListener('click', openPick);
  $('#ytEmpty').addEventListener('click', e => { if (!e.target.closest('a')) openPick(); });
  $('#pickClose').addEventListener('click', () => { pick.hidden = true; });
  $('#pickPaste').addEventListener('click', async () => {
    try { const t = await navigator.clipboard.readText(); if (t) { pick.hidden = true; webGo(t); } else toast('복사한 링크가 없어요.'); }
    catch { toast('붙여넣기를 못 했어요. 칸을 길게 눌러 붙여넣어 주세요.'); }
  });
  $('#pickForm').addEventListener('submit', e => { e.preventDefault(); const v = pickIn.value.trim(); if (v) { pick.hidden = true; webGo(v); } });
  if (TOUCH) dollyTarget = dolly = 0.85;
  const q = new URLSearchParams(location.search);
  const first = q.get('url') || q.get('text') || q.get('title');
  if (first) { history.replaceState(null, '', location.pathname); webGo(first); }
}
function webGo(raw) {
  urlInput.blur();
  const v = parseYouTube(raw);
  const find = $('#ytHost .ytFind');
  if (!v) {
    $('#ytHost').classList.remove('on');
    find.innerHTML = '';
    const a = document.createElement('a'); a.target = '_blank'; a.rel = 'noopener';
    a.href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(raw);
    a.textContent = `유튜브에서 “${raw}” 찾아보기 ↗`;
    find.append(a, document.createElement('br'), '마음에 드는 영상의 공유 → 같이 보는 방, 또는 링크 복사 후 붙여넣기');
    return;
  }
  find.textContent = '';
  $('#ytHost').classList.add('on');
  urlInput.value = v.id ? 'youtu.be/' + v.id : 'youtube.com/playlist?list=' + v.list;
  if (yt.state !== 'ready') { yt.pending = v; loadYtApi(); return; }
  if (!yt.player) makePlayer(v); else if (!yt.ready) yt.pending = v; else loadInto(v);
}
function loadYtApi() {
  if (yt.state === 'loading' || yt.state === 'ready') return;
  yt.state = 'loading';
  window.onYouTubeIframeAPIReady = () => { yt.state = 'ready'; const v = yt.pending; yt.pending = null; if (v) makePlayer(v); };
  const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
  s.onerror = () => { yt.state = 'none'; s.remove(); toast('유튜브에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'); };
  document.head.appendChild(s);
}
function makePlayer(v) {
  const vars = { autoplay: 1, playsinline: 1, rel: 0, hl: 'ko' };
  if (location.protocol.startsWith('http')) vars.origin = location.origin;
  if (v.start) vars.start = v.start;
  const opts = { width: '100%', height: '100%', playerVars: vars, events: {
    onReady: () => { yt.ready = true; const p = yt.pending; yt.pending = null; if (p) loadInto(p); else yt.player.playVideo(); },
    onStateChange: e => {
      const S = YT.PlayerState, d = yt.player.getVideoData?.() || {};
      if (d.video_id && d.video_id !== lastVid) { lastVid = d.video_id; friendSay(pick(LINES.start)); }
      if (d.title) title = d.title;
      if (e.data === S.PLAYING) setPhase('playing');
      else if (e.data === S.PAUSED) setPhase('paused');
      else if (e.data === S.ENDED) setPhase('ended');
    },
    onError: e => {
      toast({ 2: '링크가 올바르지 않은 것 같아요.', 100: '삭제됐거나 비공개인 영상이에요.' }[e.data]
        || '이 영상은 여기서 재생할 수 없어요. 올린 사람이 막아 뒀을 수 있어요.', 5200);
      title = ''; setPhase('idle');
    },
  } };
  if (v.id) opts.videoId = v.id; else { vars.listType = 'playlist'; vars.list = v.list; }
  yt.player = new YT.Player('ytPlayer', opts);
}
function loadInto(v) {
  if (v.id) yt.player.loadVideoById({ videoId: v.id, startSeconds: v.start || 0 });
  else yt.player.loadPlaylist({ list: v.list, listType: 'playlist' });
}

/* ───────── 마우스 · 키보드 입력 ───────── */
function clickMouse(i, down) { mouse3d.userData.down[i] = down; }
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
addEventListener('pointermove', e => {
  if (!Hinv || e.pointerType === 'touch') return;
  const [lx, ly] = apply3(Hinv, e.clientX, e.clientY);
  const inScreen = lx >= 0 && lx <= WRAP_W && ly >= 0 && ly <= WRAP_H;
  if (inScreen) {
    const t = e.target;
    setCursor(lx, ly, t === urlInput ? 'text' : t.closest && t.closest('button') ? 'pointer' : 'default');
  } else {
    hideCursor(); moveMouseTo(e.clientX / innerWidth, e.clientY / innerHeight);
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    canvas.style.cursor = e.target === canvas && pickCharacter() ? 'pointer' : 'default';
  }
});
addEventListener('pointerdown', e => clickMouse(e.button === 2 ? 1 : 0, true));
addEventListener('pointerup', e => clickMouse(e.button === 2 ? 1 : 0, false));
addEventListener('keydown', e => pressKey(e.code, true));
addEventListener('keyup', e => pressKey(e.code, false));
addEventListener('blur', () => { for (const k in keys) keys[k].userData.down = false; });
canvas.addEventListener('wheel', e => { dollyTarget = clamp(dollyTarget - Math.sign(e.deltaY) * 0.12, 0, 1); mouse3d.userData.wheel.rotation.x += Math.sign(e.deltaY) * 0.6; }, { passive: true });
// 폰: 두 손가락을 벌리면 가까이, 오므리면 멀리
const touches = new Map(); let pinchD = 0;
const pinchDist = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2) pinchD = pinchDist(); });
canvas.addEventListener('pointermove', e => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size !== 2) return;
  const d = pinchDist(); dollyTarget = clamp(dollyTarget + (d - pinchD) / Math.min(innerWidth, innerHeight) * 1.4, 0, 1); pinchD = d;
});
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, e => touches.delete(e.pointerId));
canvas.style.touchAction = 'none';
function pickCharacter() {
  ray.setFromCamera(ndc, camera);
  for (const id in chars) if (ray.intersectObject(chars[id].root, true).length) return id;
  return null;
}
canvas.addEventListener('click', e => {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const id = pickCharacter();
  if (!id) return;
  if (themeId === id) { chars[id].onClick?.(); } else setTheme(id);
});

/* ───────── 친구들 ───────── */
const chars = {}, labels = {};
const NAMES = { shoreline: '탐험가', penguin: '펭귄' };
const LINES = {
  start: ['오 이거 볼 거야?', '틀어 틀어!', '기대된다'], pause: ['어? 왜 멈춰~', '잠깐 쉬는 타임?'],
  resume: ['다시 간다!', '오케이 집중'], ended: ['재밌었다!', '다음 거 뭐 볼까?'], reply: ['인정', '그니까!', '맞아 맞아', 'ㅋㅋㅋㅋ'],
};
function placeholder(id) {
  const root = new THREE.Group(), m = mat(id === 'penguin' ? '#27324a' : '#ff9fbb');
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 6, 16), m); body.position.y = 0.4; body.castShadow = true; root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), mat('#ffdcbd')); head.position.y = 0.82; head.castShadow = true; root.add(head);
  return { root, headHeight: 1.0, update() {}, react() {}, setActive() {} };
}
async function loadCharacters(ctx) {
  for (const id of ['shoreline', 'penguin']) {
    let c;
    try { c = await (await import(`./characters/${id}.js`)).createCharacter(ctx); }
    catch (err) { console.warn('캐릭터 모듈 없음/오류:', id, err); c = placeholder(id); }
    c.root.position.copy(SEATS[id]).setY(0.07);
    c.root.rotation.y = id === 'shoreline' ? 0.42 : -0.42;
    room.add(c.root); chars[id] = c;
    const tag = document.createElement('div'); tag.className = 'tag'; tag.textContent = NAMES[id];
    const bubble = document.createElement('div'); bubble.className = 'bubble';
    $('#labels').append(tag, bubble); labels[id] = { tag, bubble, timer: 0 };
  }
}
function say(id, text, ms) {
  const l = labels[id]; if (!l) return;
  l.bubble.textContent = text; l.bubble.classList.add('show');
  clearTimeout(l.timer); l.timer = setTimeout(() => l.bubble.classList.remove('show'), ms || 2300 + Math.min(text.length, 30) * 70);
}
const friendSay = text => say(pick(Object.keys(chars)), text);
let subT = 0;
function subtitle(text, ms = 3200) {
  const el = $('#subtitle'); el.textContent = text; el.classList.add('show');
  clearTimeout(subT); subT = setTimeout(() => el.classList.remove('show'), ms);
}
const head = new THREE.Vector3();
function placeLabels() {
  for (const id in chars) {
    const c = chars[id], l = labels[id];
    head.set(0, c.headHeight + 0.06, 0); c.root.localToWorld(head).project(camera);
    const x = (head.x + 1) / 2 * innerWidth, y = Math.max(64, (1 - head.y) / 2 * innerHeight);
    l.tag.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    l.bubble.style.transform = `translate(${x}px,${y - 30}px) translate(-50%,-100%)`;
    l.tag.classList.toggle('on', themeId === id);
  }
}

/* ───────── 리액션 · 채팅 ───────── */
const REACTS = [['😂', 'laugh'], ['😮', 'wow'], ['👏', 'clap'], ['❤️', 'love'], ['😭', 'sad'], ['🍿', 'eat']];
function floatEmoji(x, y, emoji) {
  const n = document.createElement('span'); n.className = 'float'; n.textContent = emoji; n.style.left = x + 'px'; n.style.top = y + 'px';
  $('#fx').appendChild(n);
  n.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: `translate(-50%,-90px) scale(1.3)`, opacity: 1, offset: 0.25 }, { transform: `translate(calc(-50% + ${rand(-40, 40)}px),-190px) scale(1)`, opacity: 0 }], { duration: 1700, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => n.remove();
}
function charReact(id, emoji, kind) {
  const c = chars[id]; if (!c) return;
  c.react(kind);
  head.set(0, c.headHeight, 0); c.root.localToWorld(head).project(camera);
  floatEmoji((head.x + 1) / 2 * innerWidth, (1 - head.y) / 2 * innerHeight, emoji);
}
REACTS.forEach(([emoji, kind]) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'react'; b.textContent = emoji;
  b.addEventListener('click', () => {
    floatEmoji(innerWidth / 2, innerHeight - 90, emoji);
    for (const id in chars) if (Math.random() < 0.6) setTimeout(() => charReact(id, emoji, kind), rand(300, 1100));
  });
  $('#reacts').appendChild(b);
});
$('#chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#chatInput'), text = input.value.trim(); if (!text) return;
  input.value = ''; subtitle('나: ' + text, 2200);
  setTimeout(() => friendSay(pick(LINES.reply)), rand(900, 1700));
});
let toastT = 0;
function toast(msg, ms = 3200) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms); }

/* ───────── 그림체(테마) ───────── */
const themes = {};
let themeId = 'cozy';
const audio = { current: null };
function playAudio(url, { volume = 1 } = {}) {
  try { const a = new Audio(url); a.volume = volume; a.play().catch(() => {}); audio.current = a; return a; } catch { return null; }
}
const ctx = {
  THREE, scene, camera, renderer, loader, mats, parts, lights, room, chars,
  anchors: { seats: SEATS, tableY: TABLE_Y, screenCenter: new THREE.Vector3(0, TABLE_Y + 0.2, -0.18) },
  say, subtitle, toast, playAudio, assets: 'assets/',
  get phase() { return phase; }, get themeId() { return themeId; },
};
function resetLook() {
  for (const k in DEFAULT_COLORS) { const m = mats[k], d = DEFAULT_COLORS[k]; m.color.copy(d.color); if (d.roughness !== undefined) { m.roughness = d.roughness; m.metalness = d.metalness; } m.map = null; m.needsUpdate = true; }
  lights.hemi.color.copy(DEFAULT_LIGHTS.hemi[0]); lights.hemi.groundColor.copy(DEFAULT_LIGHTS.hemi[1]); lights.hemi.intensity = DEFAULT_LIGHTS.hemi[2];
  lights.key.color.copy(DEFAULT_LIGHTS.key[0]); lights.key.intensity = DEFAULT_LIGHTS.key[1]; lights.key.position.copy(DEFAULT_LIGHTS.key[2]);
  lights.lamp.color.copy(DEFAULT_LIGHTS.lamp[0]); lights.lamp.intensity = DEFAULT_LIGHTS.lamp[1];
  lights.screen.color.copy(DEFAULT_LIGHTS.screen[0]); lights.screen.intensity = DEFAULT_LIGHTS.screen[1];
  scene.background = new THREE.Color('#2b2452'); scene.fog = null;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  for (const k of ['floor', 'backWall', 'leftWall', 'rightWall', 'rug', 'rugRing', 'table', 'decor']) parts[k].visible = true;
  for (const id in parts.cushions) parts.cushions[id].visible = true;
}
function setPost(post) {
  if (themePass) { composer.removePass(themePass); themePass = null; }
  if (!post) return;
  themePass = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, ...(post.uniforms || {}) },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: post.fragmentShader });
  composer.insertPass(themePass, 1);
}
async function setTheme(id) {
  if (id === themeId) return;
  const prev = themes[themeId];
  if (prev) prev.exit?.(ctx);
  chars[themeId]?.setActive(false);
  resetLook(); setPost(null);
  themeId = id;
  const th = themes[id];
  if (th) { th.enter?.(ctx); setPost(th.post || null); }
  chars[id]?.setActive(true);
  $('#themeName').textContent = th ? th.label : '아늑한 방';
}
$('#themeBtn').addEventListener('click', () => setTheme('cozy'));
async function loadThemes() {
  for (const id of ['shoreline', 'penguin']) {
    try { const th = (await import(`./themes/${id}.js`)).default; await th.load?.(ctx); themes[id] = th; }
    catch (err) { console.warn('테마 모듈 없음/오류:', id, err); }
  }
}

/* ───────── 매 프레임 ───────── */
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (themePass) themePass.uniforms.uRes.value.set(innerWidth, innerHeight);
}
addEventListener('resize', resize);
const clock = new THREE.Clock(), lookTarget = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  dolly = lerp(dolly, dollyTarget, 1 - Math.exp(-dt * 8));
  placeCamera(); alignScreen();
  // 키 · 마우스 움직임
  for (const code in keys) { const k = keys[code]; k.position.y = lerp(k.position.y, k.userData.restY - (k.userData.down ? 0.0035 : 0), 1 - Math.exp(-dt * 40)); }
  const mu = mouse3d.userData;
  if (mouse3d.position.distanceToSquared(mu.target) > 1e-8) { mouse3d.position.lerp(mu.target, 1 - Math.exp(-dt * 18)); updateCable(); }
  mu.btnL.position.y = lerp(mu.btnL.position.y, mu.down[0] ? 0.0265 : 0.0285, 0.5);
  mu.btnR.position.y = lerp(mu.btnR.position.y, mu.down[1] ? 0.0265 : 0.0285, 0.5);
  // 친구들: 볼 때는 화면, 멈추면 나(카메라)를 본다
  if (phase === 'playing') lookTarget.copy(ctx.anchors.screenCenter); else lookTarget.copy(camera.position);
  for (const id in chars) chars[id].update(dt, t, { phase, active: themeId === id, lookTarget });
  themes[themeId]?.update?.(ctx, dt, t);
  if (themePass) themePass.uniforms.uTime.value = t;
  lights.screen.intensity = (themes[themeId]?.screenGlow ?? DEFAULT_LIGHTS.screen[1]) * (phase === 'playing' ? 1.5 + Math.sin(t * 7) * 0.12 : 1);
  placeLabels();
  composer.render();
  requestAnimationFrame(frame);
}

/* ───────── 시작 ───────── */
resetLook(); resize(); placeCamera(); updateCable();
await loadCharacters(ctx);
await loadThemes();
if (IS_APP) initBrowser(); else initWebPlayer();
if (TOUCH) $('.hintline').textContent = '친구를 누르면 그 친구의 세계로 바뀌어요 · 두 손가락: 가까이/멀리';
window.WR = { ctx, setTheme, themes, chars, get dolly() { return dolly; }, set dolly(v) { dollyTarget = dolly = v; } };
requestAnimationFrame(frame);
setTimeout(() => friendSay('뭐 볼까? 재밌는 거 골라 줘!'), 1200);
