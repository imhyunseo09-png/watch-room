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
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
const composer = new EffectComposer(renderer);
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

/* ───────── 마우스 · 키보드 입력 ───────── */
function clickMouse(i, down) { mouse3d.userData.down[i] = down; }
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
addEventListener('pointermove', e => {
  if (!Hinv) return;
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
initBrowser();
window.WR = { ctx, setTheme, themes, chars, get dolly() { return dolly; }, set dolly(v) { dollyTarget = dolly = v; } };
requestAnimationFrame(frame);
setTimeout(() => friendSay('뭐 볼까? 재밌는 거 골라 줘!'), 1200);
