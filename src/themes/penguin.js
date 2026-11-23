// 펭귄 횡단 그림체 — 같은 방(바닥·탁자·방석·노트북·마우스)을 게임의 설원 모습으로 바꾼다.
// 옮겨 온 것: 노을 하늘(ProceduralSky 색), 낮은 주황 해 + 파란 그림자, 눈 바닥(GROUND_SHADER: 얼룩·바람결·알갱이 반짝이·발자국),
// 장난감 재질(TOY_SHADER: 윗면에 쌓인 눈·모서리 마모), "대피소 1"(상점·가격표·난로·간판), 판매기와 지급 표지판, 빨간 신호탑 빛기둥,
// 얼음 바위·길 깃발·먼 산, 내리는 눈, 화면 후처리(POST: 필름 톤 + 스플릿 톤 + 그림자 하프톤 점 + 비네트).
import * as THREE from 'three';
import { Kit, Props, PAL, SCALE, toyMat, toyify, untoyify, kindParams, color3, darkened, rgb } from '../characters/penguin.js';

const S = SCALE;                    // 게임 단위 → m
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ───────── 빛 (게임플레이_메인.gd _env) ───────── */
const SUN_DIR = new THREE.Vector3(0.94, 0, 0.34).normalize().multiplyScalar(Math.cos(16 * Math.PI / 180)).setY(Math.sin(16 * Math.PI / 180));   // 해가 있는 쪽 (높이 16°)
const SUN_COLOR = 'ffb26e';
const TUNE = {
  sun: 7.85,                                  // 2.5 × π 근처
  // 주변광 (원본 화면에서 잰 색에 맞춤): 위를 보는 면은 분홍빛 보라, 해를 등진 옆면은 푸른 보라.
  // 게임은 하늘(해 원반 포함)을 주변광으로 써서 해 쪽에서 그림자 없는 따뜻한 빛이 더 온다 → glow 로 흉내
  hemiSky: [1.1, 0.7, 1.08], hemiGround: [0.0, 0.56, 1.12], hemi: 1.0, env: 0.25, glow: [1.5, 0.25, 0.0], shadow: 0.9,   // 하늘빛(파랑~보라) — 그림자 색
  fog: 0.0042, exposure: 0.95,
};

/* ───────── 작은 잡음 (지형용) ───────── */
const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
const fbm = (x, y) => (vnoise(x, y) * 0.6 + vnoise(x * 2.1 + 7.3, y * 2.1 - 3.1) * 0.3 + vnoise(x * 4.3 - 1.7, y * 4.3 + 9.2) * 0.1) * 2 - 1;
// 지형 높이(m). 방 둘레는 평평하고(대피소 자리처럼), 멀어질수록 언덕. (height_raw 를 본뜸)
function groundH(x, z) {
  const gx = x / S, gz = z / S, dd = Math.hypot(gx, gz + 4);
  let h = fbm(gx * 0.011 + 3.1, gz * 0.011 - 1.7) * 6.0 + fbm(gx * 0.07, gz * 0.07) * 0.45;
  // 신호탑으로 가는 길은 골짜기처럼 낮게 (멀리 지평선과 산이 보이게), 길에서 멀수록 언덕
  const lane = Math.abs(x - lerp(2, 10, clamp((-z - 5) / 111, 0, 1)));
  h *= lerp(0.16, 1, smooth(7, 42, lane));
  h += Math.pow(Math.abs(gx - 12) / 120, 2.5) * 16;
  return lerp(0, h, smooth(17, 38, dd)) * S;
}
const snowDepth = (x, z) => { const gx = x / S, gz = z / S; return smooth(0.4, 0.62, vnoise(gx * 0.05 + 11, gz * 0.05 + 5)) * smooth(14, 24, Math.hypot(gx, gz + 4)); };

/* ───────── 눈 바닥 재질 (GROUND_SHADER) ───────── */
const GROUND_PARS = /* glsl */`
uniform sampler2D uDent; uniform vec4 uDentWin; uniform float uInv;
varying vec3 vGWp; varying vec3 vGWn;
float gH3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gVn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gH3(i), gH3(i + vec3(1,0,0)), f.x), mix(gH3(i + vec3(0,1,0)), gH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gH3(i + vec3(0,0,1)), gH3(i + vec3(1,0,1)), f.x), mix(gH3(i + vec3(0,1,1)), gH3(i + vec3(1,1,1)), f.x), f.y), f.z); }
// 눈 높이 지도(발자국·삽 자국)
float gDent(vec2 p){ vec2 uv = 0.5 + (p - uDentWin.xy) / uDentWin.z; return texture2D(uDent, uv).r * 0.3 * uDentWin.w; }
float gSurf(vec2 p){ float d = gDent(p); float r = 0.075;
  float a = (gDent(p + vec2(r, 0.0)) + gDent(p - vec2(r, 0.0)) + gDent(p + vec2(0.0, r)) + gDent(p - vec2(0.0, r))) * 0.25;
  return clamp((a - d) * 0.5, 0.0, 0.035) - d; }
// 바람에 깎인 물결 + 잔 요철
float gBump(vec2 p){ vec2 q = vec2(p.x * 0.85 + p.y * 0.4, -p.x * 0.4 + p.y * 0.85);
  float warp = gVn(vec3(q * 0.18, 3.0)) * 6.0; float rip = sin(q.x * 1.9 + warp) * 0.5 + 0.5; rip = rip * rip;
  return rip * 0.07 + gVn(vec3(p * 2.6, 0.0)) * 0.02 + gVn(vec3(p * 9.0, 1.0)) * 0.008; }
`;
const GROUND_COLOR = /* glsl */`
#include <color_fragment>
vec3 gWp = vGWp * uInv;
float gDist = length(vViewPosition) * uInv;
float gNear = 1.0 - smoothstep(18.0, 75.0, gDist);
vec3 gc = diffuseColor.rgb;
gc *= 1.0 + (gVn(gWp * 0.09) - 0.5) * 0.07;
float gE = 0.06;
float gB0 = gBump(gWp.xz);
vec3 gG = vec3(gBump(gWp.xz + vec2(gE, 0.0)) - gB0, 0.0, gBump(gWp.xz + vec2(0.0, gE)) - gB0) / gE * (0.35 + 0.65 * gNear);
float gPressed = 0.0;
float gFade = 1.0 - smoothstep(uDentWin.z * 0.5 - 3.0, uDentWin.z * 0.5 - 0.6, max(abs(gWp.x - uDentWin.x), abs(gWp.z - uDentWin.y)));
if (gFade > 0.0) {
  float e2 = 0.025;
  float s0 = gSurf(gWp.xz);
  vec3 gs = vec3(gSurf(gWp.xz + vec2(e2, 0.0)) - s0, 0.0, gSurf(gWp.xz + vec2(0.0, e2)) - s0) / e2;
  gs = clamp(gs, vec3(-2.5), vec3(2.5)) * gFade;
  gPressed = smoothstep(0.004, 0.05, -s0) * gFade;
  gG = gG * (1.0 - gPressed * 0.75) + gs;
}
float gK = 1.0 - smoothstep(2.5, 9.0, gDist);
vec2 gP = fract(gWp.xz / 64.0) * 64.0 * 120.0;
vec3 gCi = vec3(floor(gP), 0.0);
float gR1 = gH3(gCi + vec3(0.0, 0.0, 1.0)), gR2 = gH3(gCi + vec3(0.0, 0.0, 2.0)), gR3 = gH3(gCi + vec3(0.0, 0.0, 3.0));
float gGrain = (1.0 - smoothstep(0.15, 0.48, length(fract(gP) - 0.5))) * gK;
float gGl = step(0.94, gR3) * gGrain;
gG += vec3(gR1 - 0.5, 0.0, gR2 - 0.5) * gGrain * mix(0.3, 0.9, gGl);
gc = mix(gc, gc * vec3(0.9, 0.95, 1.04), (1.0 - smoothstep(0.0, 0.03, gB0)) * 0.5 * gNear * (1.0 - gPressed));
gc = mix(gc, gc * vec3(0.80, 0.88, 1.0), gPressed * 0.6);
gc *= 1.0 + (gR1 - 0.5) * 0.07 * gGrain;
diffuseColor.rgb = gc;
`;
function groundMaterial(dentTex, win) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  const u = { uDent: { value: dentTex }, uDentWin: { value: new THREE.Vector4(win.cx / S, win.cz / S, win.size / S, 1) }, uInv: { value: 1 / S } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWp; varying vec3 vGWn;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvGWn = normalize( mat3( modelMatrix ) * objectNormal );')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGWp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_PARS)
      .replace('#include <color_fragment>', GROUND_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( 0.88, 0.2, gGl );')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize( ( viewMatrix * vec4( normalize( normalize( vGWn ) - gG ), 0.0 ) ).xyz );');
  };
  m.customProgramCacheKey = () => 'penguin-ground-1';
  return m;
}

/* ───────── 화면 후처리 (아트_화면표시.gd POST + _env 의 톤매핑·보정·글로우) ─────────
   앱의 후처리 한 장은 톤매핑 전(선형 HDR)에 끼어들므로, 여기서 게임과 같은 순서로 직접 한다:
   글로우 → 필름 톤(white 4, 노출 0.95) → sRGB → 대비 1.12·채도 1.15 → 스플릿 톤 → 하프톤 점 → 비네트 → (다시 선형으로) */
const POST = {
  uniforms: { uExposure: { value: TUNE.exposure }, uWarm: { value: 0 } },
  fragmentShader: /* glsl */`
uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uExposure; uniform float uWarm;
varying vec2 vUv;
vec3 filmic(vec3 x){ const float A = 0.88, B = 0.6, C = 0.1, D = 0.2, E = 0.01, F = 0.3;
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F; }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
void main(){
  vec3 hdr = max(texture2D(tDiffuse, vUv).rgb, 0.0);
  // 글로우: 아주 밝은 곳(등불·난로·빛기둥)이 번짐
  vec3 gsum = vec3(0.0);
  float sc = uRes.y / 900.0;
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  for (int i = 0; i < 20; i++) {
    float a = float(i) * 2.39996 + jit, r = (2.0 + (float(i) + fract(jit * 3.7)) * 1.6) * sc;
    gsum += max(texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * r / uRes).rgb - 1.7, 0.0);
  }
  hdr += min(gsum / 20.0, vec3(4.0)) * 0.45;
  vec3 c = filmic(hdr * uExposure) / filmic(vec3(4.0));
  c = toSRGB(clamp(c, 0.0, 1.0));
  c = mix(vec3(0.5), c, 1.12);
  c = mix(vec3(dot(vec3(1.0), c) * 0.33333), c, 1.15);
  c = clamp(c, 0.0, 1.0);
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  // 스플릿 톤: 그림자는 남청, 밝은 곳은 크림
  c = mix(c, c * vec3(0.86, 0.93, 1.08), (1.0 - smoothstep(0.15, 0.6, lum)) * 0.35);
  c = mix(c, c * vec3(1.04, 1.01, 0.95), smoothstep(0.55, 1.0, lum) * 0.6);
  // 하프톤 도트 (45도 격자 4px, 어두울수록 큰 점) — 그림자에만
  vec2 fc = vUv * uRes / sc;
  vec2 g = mat2(0.7071, 0.7071, -0.7071, 0.7071) * fc / 4.0;
  float d = length(fract(g) - 0.5);
  float shade = 1.0 - smoothstep(0.32, 0.72, lum);
  float rad = mix(0.12, 0.44, shade);
  float dotm = (1.0 - smoothstep(rad - 0.07, rad + 0.07, d)) * shade;
  c = mix(c, c * vec3(0.62, 0.68, 0.86), 0.24 * dotm);
  vec2 q = vUv - 0.5;
  float v = dot(q, q);
  c *= mix(vec3(1.0), vec3(0.8, 0.82, 0.9), clamp(v * 1.1, 0.0, 1.0));
  float wv = smoothstep(0.08, 0.32, v) * uWarm;
  c = mix(c, c * vec3(1.25, 0.92, 0.7) + vec3(0.18, 0.07, 0.0), clamp(wv, 0.0, 0.7));
  gl_FragColor = vec4(toLin(clamp(c, 0.0, 1.0)), 1.0);
}`,
};

/* ───────── 대피소 (_build_shelter(1) + build_shop + _locker) — 게임 단위, 정면 -Z ───────── */
function makeReader(parent, pos) {
  const r = Kit.node(parent, pos);
  Kit.box(r, [0.46, 0.5, 0.36], [0, 0.25, 0], PAL.CREAM);
  Kit.box(r, [0.38, 0.24, 0.02], [0, 0.33, -0.185], PAL.LCD);
  Kit.label(r, 'INSERT\nCARD', [0, 0.33, -0.2], 0.0017, PAL.LCD_TXT, 48);
  Kit.box(r, [0.22, 0.03, 0.07], [0, 0.5, -0.04], PAL.DARK);
}
function buildShop(parent, pos, yaw, stock) {
  const s = Kit.node(parent, pos, yaw), w = stock.length * 0.6 + 0.8;
  Kit.box(s, [w, 0.9, 0.6], [0, 0.45, 0.3], PAL.TEAL_D);
  Kit.trim(s, [w, 0.9, 0.6], [0, 0.45, 0.3], PAL.TEAL, PAL.DARK);
  Kit.box(s, [w + 0.1, 0.06, 0.7], [0, 0.93, 0.3], PAL.CREAM);
  Kit.box(s, [w + 0.12, 0.04, 0.06], [0, 0.9, -0.04], PAL.DARK, 0, 0.015);
  const rx = w / 2 - 0.35;
  makeReader(s, [rx, 0.96, 0.3]);
  stock.forEach((e, i) => {
    const x = rx - 0.6 - i * 0.6, stand = Kit.node(s, [x, 0.96, 0.3]);
    Kit.cyl(stand, 0.2, 0.23, 0.05, [0, 0.025, 0], PAL.ORANGE);
    const it = Props.item(e.kind); it.position.y = 0.05; it.scale.setScalar(e.kind === 'shoes' || e.kind === 'bigbucket' ? 0.9 : 1.4); stand.add(it);
    Kit.box(s, [0.44, 0.22, 0.02], [x, 0.68, -0.01], PAL.WHITE);
    Kit.label(s, '$' + e.price, [x, 0.68, -0.03], 0.003, PAL.DARK, 56);
  });
}
function buildLocker(parent, pos, yaw) {
  const l = Kit.node(parent, pos, yaw), green = '24402f';
  Kit.box(l, [1.4, 2.5, 0.1], [0, 1.25, 0.45], green); Kit.box(l, [0.12, 2.5, 0.8], [-0.7, 1.25, 0.1], green); Kit.box(l, [0.12, 2.5, 0.8], [0.7, 1.25, 0.1], green);
  Kit.box(l, [1.52, 0.12, 0.8], [0, 2.5, 0.1], green); Kit.box(l, [0.8, 0.07, 0.14], [0, 2.4, 0.0], 'fff2c4', 4.0);
}
function buildShelter(parent, lights) {
  const h = Kit.node(parent);
  Kit.box(h, [7.0, 0.06, 6.0], [0, 0.03, 0], PAL.BROWN);
  Kit.box(h, [7.0, 3.0, 0.3], [0, 1.5, 3.0], PAL.TEAL);
  Kit.box(h, [0.3, 3.0, 6.3], [-3.5, 1.5, 0], PAL.TEAL);
  Kit.box(h, [0.3, 3.0, 6.3], [3.5, 1.5, 0], PAL.TEAL);
  Kit.box(h, [7.3, 0.5, 0.32], [0, 0.25, 3.0], PAL.TEAL_D);
  // 벽 패널 이음새(안·밖) + 위쪽 띠 + 뒤 모서리 기둥
  Kit.ribs(h, [-3.35, 1.5, 2.85], [3.35, 1.5, 2.85], 4, 2.9, [0, 0, -1], PAL.TEAL_D);
  Kit.ribs(h, [-3.35, 1.5, 3.15], [3.35, 1.5, 3.15], 4, 2.9, [0, 0, 1], PAL.TEAL_D);
  for (const sx of [-1, 1]) {
    Kit.ribs(h, [sx * 3.35, 1.5, -3.0], [sx * 3.35, 1.5, 2.85], 3, 2.9, [-sx, 0, 0], PAL.TEAL_D);
    Kit.ribs(h, [sx * 3.65, 1.5, -3.0], [sx * 3.65, 1.5, 3.0], 3, 2.9, [sx, 0, 0], PAL.TEAL_D);
    Kit.box(h, [0.42, 3.0, 0.42], [sx * 3.5, 1.5, 3.0], PAL.ORANGE, 0, 0.05);
    Kit.box(h, [0.36, 0.5, 6.4], [sx * 3.5, 0.25, 0], PAL.TEAL_D);
  }
  Kit.box(h, [6.7, 0.16, 0.08], [0, 2.86, 2.82], PAL.TEAL_D, 0, 0.02);
  Kit.box(h, [7.8, 0.3, 7.2], [0, 3.15, 0], PAL.ORANGE);
  for (const sz of [-1, 1]) Kit.box(h, [7.86, 0.1, 0.12], [0, 3.02, sz * 3.57], PAL.DARK, 0, 0.02);
  for (const sx of [-1, 1]) Kit.box(h, [0.12, 0.1, 7.26], [sx * 3.87, 3.02, 0], PAL.DARK, 0, 0.02);
  Kit.box(h, [7.5, 0.3, 6.9], [0, 3.42, 0], PAL.SNOW);
  Kit.box(h, [7.3, 0.6, 0.2], [0, 2.75, -3.1], PAL.DARK);
  Kit.label(h, '대피소 1', [0, 2.75, -3.22], 0.0075, PAL.YELLOW, 64);
  for (const sx of [-3.5, 3.5]) Kit.cyl(h, 0.16, 0.16, 3.0, [sx, 1.5, -3.1], PAL.ORANGE);
  // 난로
  Kit.box(h, [1.2, 1.1, 0.7], [0, 0.55, 2.4], PAL.DARK);
  Kit.trim(h, [1.2, 1.1, 0.7], [0, 0.55, 2.4], darkened(PAL.GREY, 0.35), darkened(PAL.GREY, 0.5));
  const fire = Kit.box(h, [0.9, 0.6, 0.05], [0, 0.55, 2.03], PAL.ORANGE, 3.0);
  Kit.cyl(h, 0.14, 0.14, 2.0, [0, 2.0, 2.5], PAL.DARK);
  const stove = new THREE.PointLight(color3('ffb060'), 5.0, 9 * S, 1.0); stove.position.set(0, 1.4, 1.2); h.add(stove);
  // 지붕 위 주황 등불 + 입구를 비추는 불빛
  const roofLamp = Kit.sph(h, 0.32, [0, 3.85, -2.6], PAL.ORANGE, 6.0); roofLamp.castShadow = false;
  const door = new THREE.PointLight(color3('ff9a48'), 3.0, 11 * S, 1.0); door.position.set(0, 2.6, -4.2); h.add(door);
  lights.push(stove, door); lights.fire = fire;
  // 상점 (왼쪽 벽) · 무료 보급 상자 · 털옷 보관함
  buildShop(h, [-2.7, 0, 0.1], -Math.PI / 2, [{ kind: 'drink', price: 6 }, { kind: 'can', price: 5 }, { kind: 'meat', price: 8 }, { kind: 'shoes', price: 20 }, { kind: 'bigbucket', price: 18 }]);
  Kit.crate(h, [0.9, 0.72, 0.9], [2.2, 0.36, 2.3], PAL.NAVY, PAL.ORANGE);
  const p1 = Props.item('can'); p1.position.set(2.0, 0.72, 2.2); p1.scale.setScalar(1.5); h.add(p1);
  const p2 = Props.item('meat'); p2.position.set(2.45, 0.72, 2.4); p2.scale.setScalar(1.5); h.add(p2);
  buildLocker(h, [3.3, 0, -0.6], Math.PI / 2);
  return h;
}
// 판매기 + 지급 표지판 (build_deposit)
function buildDeposit(parent, pos, yaw, price) {
  const m = Kit.node(parent, pos, yaw);
  Kit.box(m, [1.3, 2.0, 1.0], [0, 1.0, 0.5], PAL.CREAM);
  Kit.trim(m, [1.3, 2.0, 1.0], [0, 1.0, 0.5], darkened(PAL.CREAM, 0.1), PAL.DARK);
  for (const sx of [-1, 1]) {
    Kit.box(m, [0.03, 0.05, 0.84], [sx * 0.66, 1.62, 0.5], darkened(PAL.CREAM, 0.25), 0, 0.01);
    Kit.box(m, [0.04, 0.08, 0.4], [sx * 0.66, 1.35, 0.5], PAL.DARK, 0, 0.02);
  }
  Kit.box(m, [1.38, 0.25, 1.08], [0, 2.1, 0.5], PAL.DARK);
  Kit.box(m, [0.8, 0.75, 0.05], [0, 1.2, -0.01], PAL.DARK);
  Kit.box(m, [1.0, 0.1, 0.95], [0, 0.76, -0.47], PAL.DARK);
  for (let i = 0; i < 5; i++) Kit.cyl(m, 0.05, 0.05, 0.96, [0, 0.82, -0.12 - i * 0.18], PAL.GREY).rotation.z = Math.PI / 2;
  Kit.cyl(m, 0.06, 0.06, 0.74, [0, 0.37, -0.7], PAL.GREY);
  Kit.box(m, [0.12, 0.22, 0.04], [-0.53, 1.45, -0.02], PAL.GREEN, 2.5);
  Kit.box(m, [1.1, 0.55, 0.1], [0, 2.52, 0.1], PAL.DARK);
  Kit.box(m, [0.98, 0.43, 0.02], [0, 2.52, 0.045], PAL.LCD);
  Kit.label(m, 'DEPOSIT', [0, 2.6, 0.03], 0.0034, PAL.LCD_TXT, 64);
  for (let i = 0; i < 5; i++) Kit.sph(m, 0.04, [0.3 - i * 0.15, 2.4, 0.03], PAL.DARK);
  Kit.cyl(m, 0.05, 0.05, 1.5, [-1.45, 0.75, 0.3], PAL.DARK);
  Kit.box(m, [1.2, 0.8, 0.1], [-1.45, 1.8, 0.3], PAL.DARK);
  Kit.box(m, [1.08, 0.68, 0.02], [-1.45, 1.8, 0.245], PAL.LCD);
  Kit.label(m, 'PAYMENT', [-1.45, 2.0, 0.23], 0.003, PAL.LCD_TXT, 56);
  Kit.label(m, `$${price.toFixed(2)} / 칸`, [-1.45, 1.72, 0.23], 0.0036, PAL.GREEN, 64);
  Kit.snowy(m);
  return m;
}

/* ───────── 테마 ───────── */
const T = {
  id: 'penguin', label: '펭귄 횡단', screenGlow: 0.25, post: POST, tune: TUNE,
  world: null, saved: null,

  async load(ctx) {
    const world = new THREE.Group(); world.name = 'penguin-world';
    const upd = [];                                   // 매 프레임 할 일
    T.world = world; T.upd = upd;

    // ── 하늘 (ProceduralSkyMaterial: 위 2a64bd → 지평선 ffbf8c, curve 0.12)
    const sky = new THREE.Mesh(new THREE.SphereGeometry(175, 32, 20), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: color3('2a64bd') }, uHor: { value: color3('ffbf8c') }, uGroundB: { value: color3('e4ecf4') }, uFog: { value: color3('cdd9ec') }, uSun: { value: SUN_DIR.clone() }, uSunCol: { value: color3(SUN_COLOR) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
uniform vec3 uTop, uHor, uGroundB, uFog, uSun, uSunCol; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float va = acos(clamp(d.y, -1.0, 1.0));
  float c = 1.0 - va / 1.5707963;
  vec3 col = mix(uHor, uTop, clamp(1.0 - pow(1.0 - max(c, 0.0), 1.0 / 0.12), 0.0, 1.0));
  if (c < 0.0) col = mix(uHor, uGroundB, clamp(1.0 - pow(1.0 + c, 1.0 / 0.02), 0.0, 1.0));
  // 해 둘레의 따뜻한 번짐 (sun_angle_max 12°)
  float sa = acos(clamp(dot(d, normalize(uSun)), -1.0, 1.0));
  col += uSunCol * (1.0 - smoothstep(0.0, 0.2094, sa)) * 1.6 + uSunCol * exp(-sa * 5.0) * 0.25;
  col = mix(col, uFog, 0.2);
  gl_FragColor = vec4(col, 1.0);
}`,
    }));
    sky.renderOrder = -10; sky.frustumCulled = false; world.add(sky);
    upd.push(ctx => sky.position.copy(ctx.camera.position));
    // 해 쪽에서 오는, 그림자 없는 따뜻한 주변광 (하늘의 해 원반이 주변광에 섞이는 것)
    T.glow = new THREE.DirectionalLight(0xffffff, 1); T.glow.position.copy(SUN_DIR).multiplyScalar(20); world.add(T.glow);
    // 하늘빛을 주변광·반사로도 쓴다 (ambient_light_source = SKY): 그림자 쪽이 지평선의 복숭아빛을 받아 보랏빛이 됨
    {
      const pm = new THREE.PMREMGenerator(ctx.renderer), es = new THREE.Scene();
      es.add(new THREE.Mesh(sky.geometry, sky.material));
      T.env = pm.fromScene(es, 0, 0.1, 400).texture; pm.dispose();
    }

    // ── 눈 높이 지도(발자국) : 12m 창
    const WIN = { cx: -0.5, cz: -1.2, size: 12 }, DN = 1024;
    const cv = document.createElement('canvas'); cv.width = cv.height = DN;
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, DN, DN);
    const dent = new THREE.CanvasTexture(cv); dent.flipY = false; dent.colorSpace = THREE.NoColorSpace; dent.generateMipmaps = false; dent.minFilter = dent.magFilter = THREE.LinearFilter;
    const ppu = DN / (WIN.size / S);                  // 게임 단위 1 = 몇 픽셀
    const toPx = (x, z) => [(x - WIN.cx) / WIN.size * DN + DN / 2, (z - WIN.cz) / WIN.size * DN + DN / 2];
    const ell = (x, y, rx, ry, rot, a) => { g.globalAlpha = a; g.beginPath(); g.ellipse(x * ppu, y * ppu, rx * ppu, ry * ppu, rot, 0, Math.PI * 2); g.fill(); };
    // 맨발 자국: 세 갈래 발가락(깊음) + 물갈퀴(얕음) + 뒤꿈치 (아트_눈바닥.gd _foot_shape)
    function stamp(x, z, heading, k = 1) {
      const [px, py] = toPx(x, z);
      // 눈에 실제로 닿는 부분만 찍힌다(게임에서는 발 모양 덩어리의 아랫부분만 눈에 잠김) → 전체 크기의 0.62배
      g.save(); g.translate(px, py); g.rotate(Math.PI - heading); g.scale(0.62, 0.62); g.fillStyle = '#fff'; g.filter = 'blur(0.8px)';
      ell(0, -0.04, 0.135, 0.13, 0, 0.14 * k);
      for (const a of [-0.42, 0, 0.42]) ell(Math.sin(a) * 0.19, 0.15 - Math.cos(a) * 0.19, 0.0475, 0.16, a, 0.3 * k);
      ell(0, 0.15, 0.065, 0.065, 0, 0.26 * k);
      g.restore(); dent.needsUpdate = true;
    }
    // 삽으로 퍼낸 자리: 얕은 그릇
    function dig(x, z, r = 0.34, k = 0.55) {
      const [px, py] = toPx(x, z), rr = r * ppu;
      const gr = g.createRadialGradient(px, py, 0, px, py, rr);
      gr.addColorStop(0, `rgba(255,255,255,${k})`); gr.addColorStop(0.65, `rgba(255,255,255,${k * 0.8})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.globalAlpha = 1; g.fillStyle = gr; g.beginPath(); g.arc(px, py, rr, 0, Math.PI * 2); g.fill(); g.restore(); dent.needsUpdate = true;
    }
    // 걸어온 길: 좌우 발을 번갈아
    function trail(pts, stride = 0.8, k = 1) {
      let left = true, carry = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0), hd = Math.atan2(x1 - x0, z1 - z0);
        if (carry >= len) { carry -= len; continue; }
        for (let d = carry; d < len; d += stride * S) {
          const f = d / len, side = (left ? 1 : -1) * 0.2 * S;
          stamp(lerp(x0, x1, f) - Math.cos(hd) * side, lerp(z0, z1, f) + Math.sin(hd) * side, hd + (left ? 0.12 : -0.12), k);
          left = !left; carry = d + stride * S - len;
        }
      }
    }
    const curve = (pts, n = 40) => new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], 0, p[1]))).getPoints(n).map(p => [p.x, p.z]);
    trail(curve([[4.6, -6.6], [2.6, -4.6], [-0.2, -3.1], [-1.2, -2.2], [0.2, -1.5], [1.5, -1.0], [1.35, -0.45]]));          // 먼 데서 대피소를 거쳐 방석까지
    trail(curve([[1.45, -0.1], [2.2, 0.5], [2.9, 0.3], [3.2, -0.7], [2.5, -1.5], [1.7, -1.1]]), 0.76);                         // 방석 옆을 한 바퀴
    trail(curve([[-1.6, -2.3], [-2.2, -1.2], [-2.9, -0.2], [-4.4, 0.6]]), 0.8, 0.9);                                           // 판매기 쪽으로
    dig(2.25, -1.85); dig(2.75, -1.55, 0.3, 0.45);
    T.stamp = stamp; T.dig = dig;

    // ── 눈 바닥 (지형 + 버텍스 컬러: 오목한 곳은 파랑, 볼록한 곳은 따뜻한 흰색)
    {
      const N = 150, L = 112, pos = [], col = [], idx = [];
      const warp = u => Math.sign(u) * Math.pow(Math.abs(u), 1.7) * L;
      const cA = color3('cfdcec'), cB = color3('fffdf8'), cW = color3('fff3e2'), cC = color3('a9c2e2'), c = new THREE.Color();
      for (let k = 0; k <= N; k++) for (let i = 0; i <= N; i++) {
        const x = warp(i / N * 2 - 1), z = warp(k / N * 2 - 1) - 6, h0 = groundH(x, z), r = 7 * S;
        const avg = (groundH(x + r, z) + groundH(x - r, z) + groundH(x, z + r) + groundH(x, z - r)) * 0.25;
        const cav = clamp((avg - h0) / S * 0.9 + 0.15, 0, 1), warm = vnoise(x / S * 0.028 + 3, z / S * 0.028 + 8);
        c.copy(cA).lerp(cB, snowDepth(x, z)).lerp(cW, warm * 0.4).lerp(cC, cav * 0.75);
        pos.push(x, h0, z); col.push(c.r, c.g, c.b);
      }
      for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) { const a = k * (N + 1) + i, b = a + 1, d = a + N + 1; idx.push(a, d, b, b, d, d + 1); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const ground = new THREE.Mesh(geo, groundMaterial(dent, WIN));
      ground.receiveShadow = true; ground.name = 'snow-ground'; world.add(ground);
    }

    // ── 지평선: 얼음 바다 띠 + 먼 산 (옅은 파랑, 안개에 잠김)
    {
      const ice = new THREE.Mesh(new THREE.RingGeometry(60, 172, 64, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: color3('d5e6f4'), roughness: 0.3 }));
      ice.position.set(0, -0.6, -6); world.add(ice);
      const mk = (r0, hMax, seed, colA, colB) => {
        const pos = [], col = [], n = 150, cA = color3(colA), cB = color3(colB), c = new THREE.Color();
        // 능선 높이: 넓은 덩어리 + 가끔 솟는 봉우리 + 잔 굴곡 (낮고 길게 — 게임의 먼 얼음 산)
        const hAt = i => { const a = i / n * Math.PI * 2; return (0.18 + Math.pow(vnoise(a * 3.1 + seed, seed), 2.2) * 0.82 + vnoise(a * 17 + seed, 2.2) * 0.14) * hMax; };
        const P = (i, k) => { const a = i / n * Math.PI * 2, rr = r0 + vnoise(i * 0.21, seed) * 10 + k * 9; return [Math.sin(a) * rr, k ? hAt(i) : -1.5, Math.cos(a) * rr - 6]; };
        for (let i = 0; i < n; i++) {
          const a = P(i, 0), b = P(i + 1, 0), c1 = P(i, 1), d = P(i + 1, 1);
          for (const tri of [[a, b, c1], [b, d, c1]]) for (const p of tri) { pos.push(...p); c.copy(cA).lerp(cB, smooth(0, hMax * 0.7, p[1])); col.push(c.r, c.g, c.b); }
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide })); world.add(m);
      };
      mk(132, 9, 3.3, 'a9c4e6', 'f2f7fc'); mk(152, 17, 9.1, '9ab6de', 'e6eef9');
    }

    // ── 게임 단위로 만든 것들 (대피소·판매기·얼음 바위·깃발·신호탑): S 배로 줄여서 놓는다
    const put = (x, z, yaw = 0) => { const n = new THREE.Group(); n.position.set(x, groundH(x, z), z); n.rotation.y = yaw; n.scale.setScalar(S); world.add(n); return n; };
    const lights = []; T.lights = lights;
    buildShelter(put(-3.3, -4.7, Math.PI + 0.775), lights);                 // 정면이 오른쪽 앞(해·카메라 쪽)을 봄
    buildDeposit(put(-3.15, -0.85, Math.PI + 1.05), [0, 0, 0], 0, 1.0);     // 판매기 + "PAYMENT $1.00 / 칸" 표지판
    Kit.snowy(Kit.crate(put(2.9, -2.6, 0.5), [0.9, 0.85, 0.9], [0, 0.425, 0], PAL.BROWN, PAL.ORANGE));
    { const d = Props.item('drink'); d.position.set(0, 0.85, 0); d.scale.setScalar(1.5); put(2.9, -2.6, 0.5).add(d); }
    // 얼음 바위 (윗면에 눈 모자) · 눈더미
    const rnd = (() => { let s = 11; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const iceMat = toyMat(PAL.ICE, 0, 0.55, true), driftMat = toyMat(PAL.SNOW, 0, 1.0);
    const rocks = [[3.9, -5.2, 0.9], [5.3, -6.4, 1.5], [4.8, -4.4, 0.6], [-6.5, -9, 1.7], [7.5, -11, 2.2], [1.5, -12, 1.2], [10, -8, 1.9], [-1.5, -16, 2.3], [12, -17, 2.4], [6, -20, 1.6], [-9, -19, 2.0], [16, -12, 1.4], [3, -27, 2.2], [9, -31, 1.8], [-5, -30, 2.4], [18, -26, 2.0], [-14, -12, 1.5], [22, -38, 2.4], [0, -42, 2.2], [11, -46, 2.0], [-11, -44, 2.4], [5.5, 2.4, 0.7]];
    for (const [x, z, r] of rocks) {
      const n = put(x, z, rnd() * 6.28);
      const m = Kit.sph(n, r, [0, r * 0.2, 0], PAL.ICE, 0, [0.7 + rnd() * 0.6, 0.6 + rnd() * 0.9, 0.7 + rnd() * 0.6], 14, 7);
      m.material = iceMat; m.rotation.set(rnd() * 0.5, 0, rnd() * 0.5);
    }
    for (const [x, z, r] of [[-5.6, -1.9, 2.0], [6.5, -3.4, 2.4], [-2.2, 2.6, 1.8], [8.5, 1.0, 2.6]]) {
      const n = put(x, z);
      Kit.sph(n, r, [0, 0.1, 0], PAL.SNOW, 0, [1, 0.42, 1], 18, 8).material = driftMat;
      Kit.sph(n, r * 0.55, [rnd() * 0.8 - 0.4, r * 0.32, rnd() * 0.8 - 0.4], PAL.SNOW, 0, [1, 0.6, 1], 18, 8).material = driftMat;
    }
    // 길 표시 깃발: 신호탑 쪽으로 이어짐
    const BEACON = [10, -116], BEACON_K = 0.62;
    for (let i = 1; i <= 7; i++) {
      const f = i / 8, x = lerp(4.2, BEACON[0], f) + Math.sin(f * 5) * 3.5, z = lerp(-6, BEACON[1], Math.pow(f, 1.25)), n = put(x, z, 0.3);
      Kit.cyl(n, 0.05, 0.06, 2.6, [0, 1.3, 0], PAL.DARK);
      Kit.box(n, [0.7, 0.4, 0.04], [0.38, 2.35, 0], PAL.ORANGE);
    }
    // 신호탑 + 하늘로 솟는 빨간 빛기둥 (_build_goal)
    {
      const n = put(BEACON[0], BEACON[1]); n.scale.setScalar(S * BEACON_K);
      for (let i = 0; i < 6; i++) Kit.cyl(n, 0.55 - i * 0.05, 0.6 - i * 0.05, 5.0, [0, 2.5 + i * 5.0, 0], i % 2 === 0 ? PAL.ORANGE : PAL.WHITE);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.25, 0.2), fog: false })); lamp.position.y = 31; n.add(lamp);
      const beamU = { uTime: { value: 0 } };
      for (const [r, power] of [[1.3, 1.0], [4.2, 0.28]]) {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 240, 24, 1, true), new THREE.ShaderMaterial({
          transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false,
          uniforms: { ...beamU, uPower: { value: power } },
          vertexShader: 'varying float vy; varying vec3 vN; varying vec3 vV; void main(){ vy = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
          fragmentShader: /* glsl */`uniform float uTime, uPower; varying float vy; varying vec3 vN; varying vec3 vV;
void main(){ float edge = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.6);
  float up = 1.0 - smoothstep(0.0, 120.0, vy + 120.0);
  float pulse = 0.8 + 0.2 * sin(uTime * 2.2 - vy * 0.04);
  gl_FragColor = vec4(vec3(1.0, 0.22, 0.15) * edge * mix(1.0, 0.35, 1.0 - up) * pulse * uPower * 2.2, 1.0); }`,
        }));
        beam.position.y = 150; beam.frustumCulled = false; n.add(beam);
      }
      upd.push((ctx, dt, t) => { beamU.uTime.value = t; });
    }

    // ── 내리는 눈 (_snow: 350개, 중력 (-1,-2.6,0.5), 수명 3.5초)
    {
      const N = 420, ext = [7.5, 2.6, 7.5], ctr = [0, 2.3, -2.5], grav = [-1.0 * S, -2.6 * S, 0.5 * S];
      const p = new Float32Array(N * 3), v0 = new Float32Array(N * 3), o = new Float32Array(N * 3), age = new Float32Array(N);
      const spawn = (i, a) => {
        o[i * 3] = ctr[0] + (Math.random() * 2 - 1) * ext[0]; o[i * 3 + 1] = ctr[1] + (Math.random() * 2 - 1) * ext[1] + 1.2; o[i * 3 + 2] = ctr[2] + (Math.random() * 2 - 1) * ext[2];
        const sp = (0.5 + Math.random()) * S; v0[i * 3] = (Math.random() - 0.5) * 0.35 * sp; v0[i * 3 + 1] = -sp; v0[i * 3 + 2] = (Math.random() - 0.5) * 0.35 * sp; age[i] = a;
      };
      for (let i = 0; i < N; i++) spawn(i, Math.random() * 3.5);
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const dot = document.createElement('canvas'); dot.width = dot.height = 32; const dg = dot.getContext('2d');
      const gr = dg.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); dg.fillStyle = gr; dg.fillRect(0, 0, 32, 32);
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.05 * S * 1.5, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false, color: 0xffffff, sizeAttenuation: true, fog: false }));
      pts.frustumCulled = false; world.add(pts);
      upd.push((ctx, dt) => {
        for (let i = 0; i < N; i++) {
          let a = age[i] + dt; if (a > 3.5) { spawn(i, 0); a = 0; } age[i] = a;
          p[i * 3] = o[i * 3] + v0[i * 3] * a + 0.5 * grav[0] * a * a; p[i * 3 + 1] = o[i * 3 + 1] + v0[i * 3 + 1] * a + 0.5 * grav[1] * a * a; p[i * 3 + 2] = o[i * 3 + 2] + v0[i * 3 + 2] * a + 0.5 * grav[2] * a * a;
        }
        geo.attributes.position.needsUpdate = true;
      });
    }
    // 난로 불빛이 살짝 일렁임
    upd.push((ctx, dt, t) => { lights[0].intensity = 5.0 * (1 + Math.sin(t * 9.0) * 0.06 + Math.sin(t * 23.0) * 0.04); });
  },

  enter(ctx) {
    const { scene, renderer, lights, mats, parts } = ctx, key = lights.key, sc = key.shadow.camera;
    // 방 벽·꾸밈·깔개는 치우고(앱이 나갈 때 되돌려 줌), 바닥은 눈 바닥으로 바꿔 깐다
    for (const k of ['floor', 'backWall', 'leftWall', 'rightWall', 'rug', 'rugRing', 'decor']) parts[k].visible = false;
    scene.background = color3('ffbf8c');
    scene.fog = new THREE.FogExp2(color3('cdd9ec'), TUNE.fog);
    renderer.toneMapping = THREE.NoToneMapping;       // 톤매핑은 후처리(POST)에서 게임과 같은 필름 곡선으로
    // 낮은 주황 해 + 하늘빛 그림자
    T.saved = { env: scene.environment, envI: scene.environmentIntensity, cam: { left: sc.left, right: sc.right, top: sc.top, bottom: sc.bottom, near: sc.near, far: sc.far }, radius: key.shadow.radius, bias: key.shadow.bias, normalBias: key.shadow.normalBias, mats: [] };
    key.color.copy(color3(SUN_COLOR)); key.intensity = TUNE.sun; key.position.copy(SUN_DIR).multiplyScalar(20);
    Object.assign(sc, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 45 }); sc.updateProjectionMatrix();
    key.shadow.radius = 6; key.shadow.bias = -0.0008; key.shadow.normalBias = 0.03;
    lights.hemi.color.setRGB(...TUNE.hemiSky); lights.hemi.groundColor.setRGB(...TUNE.hemiGround); lights.hemi.intensity = TUNE.hemi;
    lights.lamp.intensity = 0;
    T.saved.shadowI = key.shadow.intensity; key.shadow.intensity = TUNE.shadow;      // shadow_opacity 0.85
    T.glow.color.setRGB(...TUNE.glow);
    scene.environment = T.env; scene.environmentIntensity = TUNE.env;
    // 같은 탁자·방석·노트북·마우스를 게임 팔레트 + 장난감 재질로
    const paint = (name, c, extra = {}, rough = 0.9) => {
      const m = mats[name]; if (!m) return;
      const p = { ...kindParams(c, rough), ...extra };
      m.color.copy(color3(c)); m.roughness = p.rough; m.metalness = 0;
      toyify(m, p); T.saved.mats.push(m);
    };
    paint('table', PAL.BROWN, { snow: 1, snowBias: 0.27 });        // 나무 탁자, 윗면에 눈이 얼룩얼룩 쌓임
    paint('tableLeg', PAL.TEAL_D);
    paint('cushionA', PAL.ORANGE, { snow: 1, snowBias: 0.34 });
    paint('cushionB', PAL.TEAL, { snow: 1, snowBias: 0.34 });
    paint('laptopBody', PAL.CREAM);
    paint('laptopDark', PAL.DARK);
    paint('keycap', PAL.NAVY);
    paint('mouseBody', PAL.YELLOW);
    paint('cable', PAL.DARK);
    scene.add(T.world);
    const pg = ctx.chars.penguin;
    if (pg && pg.hooks) {
      pg.hooks.onFootstep = (p, heading) => T.stamp(p.x, p.z, heading);
      pg.hooks.onScoop = p => T.dig(p.x, p.z, 0.3, 0.16);
    }
  },

  exit(ctx) {
    const key = ctx.lights.key, sv = T.saved;
    ctx.scene.remove(T.world);
    if (sv) {
      Object.assign(key.shadow.camera, sv.cam); key.shadow.camera.updateProjectionMatrix();
      key.shadow.intensity = sv.shadowI ?? 1; key.shadow.radius = sv.radius; key.shadow.bias = sv.bias; key.shadow.normalBias = sv.normalBias;
      ctx.scene.environment = sv.env; ctx.scene.environmentIntensity = sv.envI;
      for (const m of sv.mats) untoyify(m);
      T.saved = null;
    }
    const pg = ctx.chars.penguin;
    if (pg && pg.hooks) { pg.hooks.onFootstep = null; pg.hooks.onScoop = null; }
  },

  update(ctx, dt, t) { for (const f of T.upd) f(ctx, dt, t); },
};
export default T;
