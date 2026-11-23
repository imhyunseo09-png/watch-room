// 펭귄 — 게임 "펭귄 횡단"의 주인공을 그대로 옮겨 온 캐릭터 모듈.
// · 보이는 모델: assets/penguin/penguin.glb (게임의 펭귄_후보_C.glb 그대로)
// · 게임이 코드로 덧붙이던 것(털옷·단추·깃·장갑·양동이)과 절차적 동작(뒤뚱 걸음, 스쿼시, 눈 퍼담기, 앉기, 떨기, 먹기, 손 뻗기)은
//   아트_펭귄.gd 를 같은 수치로 옮겼다. 안쪽 좌표는 게임과 똑같이 "정면 = -Z, 단위 = 게임 단위"이고, 맨 바깥에서 180° 돌리고 줄인다.
// · 이 파일은 공용 도구(Kit: 팔레트·장난감 재질·모양 도우미)도 내보낸다. 테마(src/themes/penguin.js)가 같이 쓴다.
import * as THREE from 'three';

export const SCALE = 0.54;            // 게임 단위 → 방(m). 펭귄 키 1.486 × 0.54 ≈ 0.80 m
const H = 1.5, R = 0.62;              // 아트_펭귄.gd 의 몸 치수 (털옷 모양 계산에 씀)

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ───────────────────────── 팔레트 (아트_모양도구.gd) ───────────────────────── */
export const PAL = {
  SNOW: 'f4f8fb', SNOW_SHADE: 'b7cde0', ICE: '9fd2ec', TEAL: '2bb39a', TEAL_D: '1b6f66', ORANGE: 'f08a2c', CREAM: 'ead9b0',
  RED: 'e3352b', NAVY: '27324a', DARK: '1c1f26', YELLOW: 'f6c445', LCD: '1f5a44', LCD_TXT: 'c8f0d2', GREY: '8d939c',
  WHITE: 'f7f5ee', BROWN: '9a6a45', MEAT: 'b5523a', GREEN: '3be06a',
};
// 색 = sRGB [r,g,b] (0..1). 게임의 Color 연산(darkened·lightened)은 sRGB 값 그대로 계산한다.
export const rgb = c => {
  if (Array.isArray(c)) return c;
  const n = parseInt(String(c).replace('#', ''), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};
export const darkened = (c, a) => rgb(c).map(v => v * (1 - a));
export const lightened = (c, a) => rgb(c).map(v => v + (1 - v) * a);
export const color3 = c => { const a = rgb(c); return new THREE.Color().setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace); };
const same = (a, b) => { a = rgb(a); b = rgb(b); return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-4; };
const hsv = c => {
  const [r, g, b] = rgb(c), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) { h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return { h, s: mx ? d / mx : 0, v: mx };
};

/* ───────────────────────── 장난감 재질 (TOY_SHADER) ─────────────────────────
   MeshStandardMaterial 위에 얹는다: 감싸는 램버트(diffuse_lambert_wrap), 얼룩, 나뭇결, 모서리 밝기·칠 벗겨짐,
   윗면에 쌓인 눈, 눈 반짝이, 테두리 빛. 조명·그림자·안개는 three 것을 그대로 쓴다. */
const TOY_PARS = /* glsl */`
uniform float uGrain, uWood, uWear, uSnow, uSnowBias, uSparkle, uRim, uInv;
uniform vec3 uWearCol;
varying vec3 vToyWp; varying vec3 vToyWn; varying float vToyEdge;
float toyH3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float toyVn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(toyH3(i), toyH3(i + vec3(1,0,0)), f.x), mix(toyH3(i + vec3(0,1,0)), toyH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(toyH3(i + vec3(0,0,1)), toyH3(i + vec3(1,0,1)), f.x), mix(toyH3(i + vec3(0,1,1)), toyH3(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
const TOY_COLOR = /* glsl */`
#include <color_fragment>
vec3 tWp = vToyWp * uInv;
float tN1 = toyVn(tWp * 1.7);
float tN2 = toyVn(tWp * 7.3);
vec3 tc = diffuseColor.rgb;
tc *= 1.0 + ((tN1 - 0.5) * 0.22 + (tN2 - 0.5) * 0.12) * uGrain;
if (uWood > 0.0) {
  float ln = sin((tWp.x * 0.7 + tWp.z * 0.7) * 9.0 + toyVn(tWp * vec3(1.5, 0.25, 1.5)) * 7.0);
  tc *= mix(1.0, 0.86 + 0.14 * smoothstep(-0.4, 0.6, ln), uWood);
}
float tE = smoothstep(0.15, 0.85, vToyEdge);
tc = mix(tc, tc * 1.16 + 0.025, tE * 0.55);
float tW = tE * smoothstep(0.42, 0.68, toyVn(tWp * 9.0) * 0.7 + tN1 * 0.3) * uWear;
tc = mix(tc, uWearCol, tW);
float tS = smoothstep(0.62, 0.86, normalize(vToyWn).y - uSnowBias + (tN1 - 0.5) * 0.45 + (tN2 - 0.5) * 0.12) * uSnow;
tc = mix(tc, vec3(0.93, 0.95, 0.98), tS);
diffuseColor.rgb = tc;
`;
const TOY_ROUGH = /* glsl */`
#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + (tN2 - 0.5) * 0.2 * uGrain, 0.04, 1.0);
roughnessFactor = mix(roughnessFactor, 0.45, tW);
roughnessFactor = mix(roughnessFactor, 1.0, tS);
`;
const TOY_METAL = /* glsl */`
#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.5, tW * step(0.5, uWear)) * (1.0 - tS);
`;
const TOY_EMIT = /* glsl */`
#include <emissivemap_fragment>
float tSp = max(uSparkle, tS);
if (tSp > 0.0) {
  float tg = toyH3(floor(tWp * 70.0) + floor(normalize(vViewPosition) * 9.0) * 3.1);
  float tNear = 1.0 - smoothstep(2.0, 12.0, length(vViewPosition) * uInv);
  totalEmissiveRadiance += vec3(1.0, 0.98, 0.92) * step(0.993, tg) * tNear * tSp;
}
`;
let toyLights = null;
function toyLightsChunk() {
  if (toyLights) return toyLights;
  let s = THREE.ShaderChunk.lights_physical_pars_fragment;
  const a = 'vec3 irradiance = dotNL * directLight.color;';
  const b = 'reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );';
  if (s.includes(a) && s.includes(b)) {
    // 감싸는 램버트: 그늘 쪽으로 빛이 조금 넘어가 장난감처럼 부드럽게 (Godot diffuse_lambert_wrap 과 같은 식)
    s = s.replace(a, a + `
	float toyR = material.roughness;
	vec3 toyIrr = max( 0.0, ( dot( geometryNormal, directLight.direction ) + toyR ) / ( ( 1.0 + toyR ) * ( 1.0 + toyR ) ) ) * directLight.color;
	float toyRimL = pow( max( 1e-4, 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ) ), max( 0.0, ( 1.0 - toyR ) * 16.0 ) ) * uRim;`);
    s = s.replace(b, 'reflectedLight.directDiffuse += toyIrr * diffuseBRDF * ( 1.0 - F ) + toyRimL * mix( vec3( 1.0 ), material.diffuseContribution, 0.6 ) * material.diffuseContribution * directLight.color * RECIPROCAL_PI;');
  } else console.warn('[penguin] three 조명 코드가 달라져서 감싸는 램버트를 못 얹었어요');
  return (toyLights = s);
}
// 아무 MeshStandardMaterial 에나 장난감 모습을 얹는다 (앱의 ctx.mats 에도 씀). untoyify 로 되돌린다.
export function toyify(m, p = {}) {
  const u = {
    uGrain: { value: p.grain ?? 0.3 }, uWood: { value: p.wood ?? 0 }, uWear: { value: p.wear ?? 0 },
    uWearCol: { value: color3(p.wearCol ?? 'b4bac3') }, uSnow: { value: p.snow ?? 0 }, uSnowBias: { value: p.snowBias ?? 0 },
    uSparkle: { value: p.sparkle ?? 0 }, uRim: { value: p.rim ?? 0 }, uInv: { value: 1 / (p.scale ?? SCALE) },
  };
  m.userData.toy = u;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEdge;\nvarying vec3 vToyWp; varying vec3 vToyWn; varying float vToyEdge;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvToyWn = normalize( mat3( modelMatrix ) * objectNormal );')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvToyWp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; vToyEdge = aEdge;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TOY_PARS)
      .replace('#include <lights_physical_pars_fragment>', toyLightsChunk())
      .replace('#include <color_fragment>', TOY_COLOR)
      .replace('#include <roughnessmap_fragment>', TOY_ROUGH)
      .replace('#include <metalnessmap_fragment>', TOY_METAL)
      .replace('#include <emissivemap_fragment>', TOY_EMIT);
  };
  m.customProgramCacheKey = () => 'penguin-toy-1';
  m.needsUpdate = true;
  return m;
}
export function untoyify(m) {
  delete m.userData.toy; delete m.onBeforeCompile; delete m.customProgramCacheKey; m.needsUpdate = true;
}
// 색을 보고 재질 종류를 정한다: [rough, metal, spec, rim, grain, wood, wear, wear_col, sparkle]  (_kind)
function kind(c, rough) {
  const custom = Math.abs(rough - 0.9) > 1e-5, r = custom ? rough : -1, k = hsv(c);
  if (rough <= 0.2) return [rough, 0, 0.8, 0.35, 0, 0, 0, c, 0];
  if (same(c, PAL.ICE)) return [custom ? r : 0.35, 0, 0.7, 0.45, 0.45, 0, 0, c, 0.25];
  if (same(c, PAL.SNOW) || same(c, PAL.SNOW_SHADE)) return [1, 0, 0.2, 0, 0.5, 0, 0, c, 0.6];
  if (same(c, PAL.MEAT)) return [custom ? r : 0.42, 0, 0.55, 0.15, 0.9, 0, 0, c, 0];
  if (k.v < 0.2) return [custom ? r : 0.72, 0, 0.3, 0.12, 0.45, 0, 0.45, lightened(c, 0.22), 0];
  if (k.s < 0.12 && k.v < 0.7) return [custom ? r : 0.42, 0.55, 0.5, 0, 0.55, 0, 0.5, lightened(c, 0.3), 0];
  if (same(c, PAL.BROWN) || (k.h > 0.04 && k.h < 0.12 && k.s > 0.3 && k.v < 0.65)) return [custom ? r : 0.85, 0, 0.25, 0, 0.7, 1, 0.45, lightened(c, 0.25), 0];
  if (k.s < 0.32) return [custom ? r : 0.7, 0, 0.4, 0.05, 0.35, 0, 0.3, darkened(c, 0.14), 0];
  return [custom ? r : 0.5, 0, 0.5, 0.1, 0.3, 0, 0.7, 'b4bac3', 0];
}
export function kindParams(c, rough = 0.9, snowy = false) {
  const k = kind(rgb(c), rough);
  return { rough: k[0], metal: k[1], rim: k[3], grain: k[4], wood: k[5], wear: k[6], wearCol: k[7], sparkle: k[8], snow: snowy ? 1 : 0 };
}
const matCache = new Map();
export function toyMat(c, emit = 0, rough = 0.9, snowy = false) {
  c = rgb(c);
  const key = c.map(v => v.toFixed(4)).join() + '_' + emit + '_' + rough + '_' + snowy;
  if (matCache.has(key)) return matCache.get(key);
  const p = kindParams(c, rough, snowy);
  // 하늘 반사가 없어서 금속은 어둡게만 보인다 → 금속성은 조금만
  const m = new THREE.MeshStandardMaterial({ color: color3(c), roughness: p.rough, metalness: p.metal * 0.3 });
  if (emit > 0) { m.emissive = color3(c); m.emissiveIntensity = emit; }
  m.userData.kit = [c, emit, rough];
  toyify(m, p);
  matCache.set(key, m);
  return m;
}

/* ───────────────────────── 모양 도우미 (Kit) ───────────────────────── */
const geoCache = new Map();
const cached = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
// 모서리가 둥근 박스 + 모서리 정도(aEdge). rbox_mesh 와 같은 만들기.
function rboxGeo(sx, sy, sz, r) {
  return cached(`b${sx}_${sy}_${sz}_${r.toFixed(3)}`, () => {
    const h = [sx / 2, sy / 2, sz / 2];
    r = Math.min(r, Math.min(h[0], h[1], h[2]) * 0.98);
    if (r <= 0.001) return new THREE.BoxGeometry(sx, sy, sz);
    const hin = h.map(v => v - r), k = 3, axes = [];
    for (let a = 0; a < 3; a++) {
      const arr = [];
      for (let i = 0; i <= k; i++) arr.push(lerp(-h[a], -hin[a], i / k));
      for (let i = 0; i <= k; i++) arr.push(lerp(hin[a], h[a], i / k));
      axes.push(arr);
    }
    const pos = [], nor = [], edg = [];
    const tri = (A, B, C, fn) => {
      const e1 = [B.p[0] - A.p[0], B.p[1] - A.p[1], B.p[2] - A.p[2]], e2 = [C.p[0] - A.p[0], C.p[1] - A.p[1], C.p[2] - A.p[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (cr[0] * cr[0] + cr[1] * cr[1] + cr[2] * cr[2] < 1e-12) return;
      const order = cr[0] * fn[0] + cr[1] * fn[1] + cr[2] * fn[2] > 0 ? [A, B, C] : [A, C, B];   // three: 반시계가 앞면
      for (const v of order) { pos.push(...v.p); nor.push(...v.n); edg.push(v.e); }
    };
    for (let a = 0; a < 3; a++) {
      const u = (a + 1) % 3, v = (a + 2) % 3;
      for (const sgn of [-1, 1]) {
        const fn = [0, 0, 0]; fn[a] = sgn;
        const cu = axes[u], cv = axes[v], grid = [];
        for (let i = 0; i < cu.length; i++) {
          const row = [];
          for (let j = 0; j < cv.length; j++) {
            const p = [0, 0, 0]; p[a] = sgn * h[a]; p[u] = cu[i]; p[v] = cv[j];
            const pin = p.map((q, x) => clamp(q, -hin[x], hin[x]));
            let n = [p[0] - pin[0], p[1] - pin[1], p[2] - pin[2]];
            const l = Math.hypot(n[0], n[1], n[2]);
            n = l < 1e-6 ? fn.slice() : n.map(q => q / l);
            row.push({ p: [pin[0] + n[0] * r, pin[1] + n[1] * r, pin[2] + n[2] * r], n, e: clamp((1 - (n[0] * fn[0] + n[1] * fn[1] + n[2] * fn[2])) * 3, 0, 1) });
          }
          grid.push(row);
        }
        for (let i = 0; i < cu.length - 1; i++) for (let j = 0; j < cv.length - 1; j++) {
          tri(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], fn);
          tri(grid[i][j], grid[i + 1][j + 1], grid[i][j + 1], fn);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edg, 1));
    return g;
  });
}
const latheGeo = (prof, segs = 20) => new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(Math.max(0, p[0]), p[1])), segs);
function mk(parent, geo, pos, c, emit = 0) {
  const m = new THREE.Mesh(geo, toyMat(c, emit));
  m.rotation.order = 'YXZ';        // Godot 의 회전 순서
  m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
export const Kit = {
  node(parent, pos = [0, 0, 0], yaw = 0) { const n = new THREE.Group(); n.rotation.order = 'YXZ'; n.position.set(pos[0], pos[1], pos[2]); n.rotation.y = yaw; parent.add(n); return n; },
  mat: toyMat,
  box(parent, size, pos, c, emit = 0, r = -1) {
    if (r < 0) r = clamp(Math.min(size[0], size[1], size[2]) * 0.18, 0, 0.07);
    return mk(parent, rboxGeo(size[0], size[1], size[2], r), pos, c, emit);
  },
  cyl(parent, rt, rb, h, pos, c, emit = 0) {
    const geo = cached(`c${rt.toFixed(3)}_${rb.toFixed(3)}_${h.toFixed(3)}`, () => {
      const b = Math.min(0.06, Math.min(h * 0.22, Math.max(rt, rb) * 0.35)), y0 = -h / 2, y1 = h / 2, prof = [[0, y0]];
      if (rb > 0) { const cb = Math.min(b, rb * 0.5); for (let i = 0; i < 4; i++) { const t = -Math.PI / 2 + Math.PI / 2 * i / 3; prof.push([rb - cb + cb * Math.cos(t), y0 + cb + cb * Math.sin(t)]); } }
      if (rt > 0) { const ct = Math.min(b, rt * 0.5); for (let i = 0; i < 4; i++) { const t = Math.PI / 2 * i / 3; prof.push([rt - ct + ct * Math.cos(t), y1 - ct + ct * Math.sin(t)]); } }
      prof.push([0, y1]);
      return latheGeo(prof, 20);
    });
    return mk(parent, geo, pos, c, emit);
  },
  sph(parent, r, pos, c, emit = 0, scl = [1, 1, 1], segs = 20, rings = 10) {
    const m = mk(parent, cached(`s${r.toFixed(4)}_${segs}_${rings}`, () => new THREE.SphereGeometry(r, segs, rings)), pos, c, emit);
    m.scale.set(scl[0], scl[1], scl[2]);
    return m;
  },
  cap(parent, r, h, pos, c) { return mk(parent, cached(`k${r}_${h}`, () => new THREE.CapsuleGeometry(r, Math.max(0.001, h - 2 * r), 6, 16)), pos, c); },
  tor(parent, inner, outer, pos, c) {
    return mk(parent, cached(`t${inner}_${outer}`, () => new THREE.TorusGeometry((inner + outer) / 2, (outer - inner) / 2, 10, 20).rotateX(Math.PI / 2)), pos, c);
  },
  lathe(parent, prof, pos, c, segs = 20) { return mk(parent, latheGeo(prof, segs), pos, c); },
  egg(h, r, k0 = 0, k1 = 1, n = 14) { const a = []; for (let i = 0; i <= n; i++) { const k = lerp(k0, k1, i / n); a.push([r * Math.sin(Math.PI * Math.pow(k, 0.72)), h * k]); } return a; },
  eggR(h, r, y) { return r * Math.sin(Math.PI * Math.pow(clamp(y / h, 0, 1), 0.72)); },
  // 정면(-Z)을 보는 글자 (Label3D). px = 글자 1픽셀의 크기(게임 단위)
  label(parent, txt, pos, px = 0.004, c = 'ffffff', fsize = 64) {
    const cv = document.createElement('canvas'), g = cv.getContext('2d'), k = 2, lines = String(txt).split('\n'), lh = fsize * k * 1.2;
    const font = `800 ${fsize * k}px "Malgun Gothic","Noto Sans CJK KR","Apple SD Gothic Neo",sans-serif`;
    g.font = font;
    cv.width = Math.ceil(Math.max(...lines.map(l => g.measureText(l).width))) + 8 * k; cv.height = Math.ceil(lh * lines.length + fsize * k * 0.15);
    const g2 = cv.getContext('2d');
    g2.font = font; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    const a = rgb(c); g2.fillStyle = `rgb(${a.map(v => Math.round(v * 255)).join()})`;
    lines.forEach((l, i) => g2.fillText(l, cv.width / 2, fsize * k * 0.075 + lh * (i + 0.5)));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(cv.width / k * px, cv.height / k * px), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide }));
    m.rotation.order = 'YXZ'; m.position.set(pos[0], pos[1], pos[2]); m.rotation.y = Math.PI;
    m.userData.label = true;
    parent.add(m);
    return m;
  },
  // 밖에 서 있는 물체: 아래 모든 메시의 윗면에 눈이 쌓이게 (snowy)
  snowy(n) {
    n.traverse(o => { const k = o.isMesh && o.material.userData && o.material.userData.kit; if (k && k[1] <= 0) o.material = toyMat(k[0], k[1], k[2], true); });
    return n;
  },
  // 토이풍 크레이트 (crate)
  crate(parent, size, pos, c, trim) {
    const n = Kit.node(parent, pos), h = size.map(v => v / 2);
    const post = Math.min(size[0], size[2]) * 0.16, lip = clamp(size[1] * 0.09, 0.04, 0.1), dark = darkened(c, 0.45);
    Kit.box(n, [size[0] - post * 0.5, size[1] * 0.86, size[2] - post * 0.5], [0, size[1] * 0.02, 0], c, 0, 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) Kit.box(n, [post, size[1] * 0.9, post], [sx * (h[0] - post * 0.5), -size[1] * 0.03, sz * (h[2] - post * 0.5)], c, 0, 0.025);
    Kit.box(n, [size[0] + 0.02, size[1] * 0.14, size[2] + 0.02], [0, -h[1] + size[1] * 0.07, 0], darkened(c, 0.12), 0, 0.03);
    const t = post * 0.9, ly = h[1] - lip * 0.5 + lip;
    Kit.box(n, [size[0] + 0.04, lip * 2, t], [0, ly - lip * 0.5, h[2] - t * 0.5 + 0.02], trim, 0, 0.025);
    Kit.box(n, [size[0] + 0.04, lip * 2, t], [0, ly - lip * 0.5, -h[2] + t * 0.5 - 0.02], trim, 0, 0.025);
    Kit.box(n, [t, lip * 2, size[2] - t * 2 + 0.04], [h[0] - t * 0.5 + 0.02, ly - lip * 0.5, 0], trim, 0, 0.025);
    Kit.box(n, [t, lip * 2, size[2] - t * 2 + 0.04], [-h[0] + t * 0.5 - 0.02, ly - lip * 0.5, 0], trim, 0, 0.025);
    Kit.box(n, [size[0] - t * 1.6, 0.03, size[2] - t * 1.6], [0, h[1] - 0.015, 0], dark, 0, 0);
    for (const sz of [-1, 1]) Kit.box(n, [size[0] * 0.42, lip * 0.7, 0.03], [0, ly - lip * 0.4, sz * (h[2] + 0.025)], dark, 0, 0.012);
    return n;
  },
  // 박스에 덧대는 모서리 기둥 4개 + 아래 스커트 (trim)
  trim(parent, size, pos, postC, skirtC) {
    const h = size.map(v => v / 2), p = clamp(Math.min(size[0], size[2]) * 0.14, 0.05, 0.14), sk = clamp(size[1] * 0.08, 0.05, 0.14);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) Kit.box(parent, [p, size[1] * 0.97, p], [pos[0] + sx * (h[0] - p * 0.5 + 0.02), pos[1], pos[2] + sz * (h[2] - p * 0.5 + 0.02)], postC, 0, 0.02);
    Kit.box(parent, [size[0] + 0.05, sk, size[2] + 0.05], [pos[0], pos[1] - h[1] + sk * 0.5, pos[2]], skirtC, 0, 0.02);
  },
  // 벽 면의 세로 리브 (ribs)
  ribs(parent, from, to, n, height, nrm, c) {
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], l = Math.hypot(d[0], d[1], d[2]) || 1, al = d.map(v => v / l);
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / (n + 1);
      Kit.box(parent, [0.06 + Math.abs(al[0]) * 0.08, height, 0.06 + Math.abs(al[2]) * 0.08], [from[0] + d[0] * f + nrm[0] * 0.03, from[1] + d[1] * f + nrm[1] * 0.03, from[2] + d[2] * f + nrm[2] * 0.03], c, 0, 0.02);
    }
  },
};

/* ───────────────────────── 소품 (아트_소품.gd) ───────────────────────── */
export const Props = {
  bucket(big = false) {
    const n = new THREE.Group(), s = big ? 1.35 : 1, col = big ? PAL.TEAL : 'd9d2c0';
    n.rotation.order = 'YXZ';
    const m = Kit.lathe(n, [[0, 0], [0.15, 0], [0.2, 0.3], [0.175, 0.3], [0.135, 0.03], [0, 0.03]], [0, 0, 0], col);
    m.scale.setScalar(s);
    Kit.tor(n, 0.19 * s, 0.215 * s, [0, 0.3 * s, 0], PAL.DARK);
    const fill = Kit.sph(n, 0.17 * s, [0, 0.2 * s, 0], PAL.SNOW, 0, [1, 0.5, 1]);
    fill.name = 'fill'; fill.visible = false;
    n.userData.big = big;
    return n;
  },
  setBucketFill(b, frac) {
    const fill = b.getObjectByName('fill'), s = b.userData.big ? 1.35 : 1;
    fill.visible = frac > 0;
    fill.position.y = lerp(0.06, 0.27, frac) * s;
    fill.scale.set(lerp(0.82, 1.02, frac), 0.3 + 0.35 * frac, lerp(0.82, 1.02, frac));
  },
  item(kind) {
    const n = new THREE.Group(); n.rotation.order = 'YXZ';
    if (kind === 'drink') {
      Kit.cyl(n, 0.075, 0.075, 0.24, [0, 0.12, 0], PAL.YELLOW); Kit.cyl(n, 0.078, 0.078, 0.07, [0, 0.12, 0], PAL.DARK); Kit.cyl(n, 0.055, 0.075, 0.025, [0, 0.25, 0], PAL.GREY);
    } else if (kind === 'can') {
      Kit.cyl(n, 0.085, 0.085, 0.18, [0, 0.09, 0], PAL.RED); Kit.cyl(n, 0.088, 0.088, 0.06, [0, 0.09, 0], PAL.CREAM); Kit.cyl(n, 0.065, 0.085, 0.025, [0, 0.19, 0], PAL.GREY);
    } else if (kind === 'meat') {
      Kit.sph(n, 0.13, [0, 0.13, 0], PAL.MEAT, 0, [1.3, 0.95, 0.95]);
      Kit.cyl(n, 0.028, 0.028, 0.2, [0.22, 0.13, 0], PAL.WHITE).rotation.z = Math.PI / 2;
      Kit.sph(n, 0.042, [0.32, 0.165, 0], PAL.WHITE); Kit.sph(n, 0.042, [0.32, 0.095, 0], PAL.WHITE);
    } else if (kind === 'shoes') {
      for (const sx of [-0.14, 0.14]) {
        Kit.tor(n, 0.09, 0.13, [sx, 0.03, 0], PAL.ORANGE).scale.set(1, 1, 1.7);
        Kit.box(n, [0.2, 0.015, 0.03], [sx, 0.03, 0], PAL.DARK); Kit.box(n, [0.03, 0.015, 0.38], [sx, 0.03, 0], PAL.DARK);
      }
    } else if (kind === 'bigbucket') n.add(Props.bucket(true));
    return n;
  },
};

/* ───────────────────────── 무전 내레이션 (사운드_무전내레이션.gd) ───────────────────────── */
export const LINES = {
  start: '걸어.', hut: '대피소. 쉬어. 오래는 말고.', sell: '눈도 돈이다. 계속 퍼.', tired: '숨 고르고. 다시 걸어.', cold: '얼면 배송 지연이다.',
  storm: '눈보라. 고개 숙이고 가.', wake: '일어나세요. 근무가 시작됩니다.', buggy: '바퀴 생겼네. 가.', goal: '근무가 완료 되었습니다. 버튼을 누르세요.',
  heli: '타. 퇴근이다.', crevasse: '틈이다. 뛰어 넘든지, 다리로 돌아.', wind: '맞바람이다. 몸 낮춰.', wind_back: '뒷바람. 지금 밀어.', night: '해 졌다. 불빛 따라 가.',
  flare: '신호탄. 길 보이지?', thin_ice: '얼음 얇다. 짐 무거우면 빠진다.', bear: '곰이다. 눈 마주치지 말고 대피소로.', clear: '북쪽 끝 도착. 근무 끝. 수고했다.',
};

/* ───────────────────────── 캐릭터 ───────────────────────── */
export async function createCharacter(ctx) {
  const A = ctx.assets + 'penguin/';
  const root = new THREE.Group(); root.name = 'penguin';
  const gd = new THREE.Group(); gd.rotation.y = Math.PI; gd.scale.setScalar(SCALE); root.add(gd);   // 여기부터 게임 좌표 (정면 -Z)
  const mover = Kit.node(gd);       // 펭귄 노드 (도는 방향)
  const body = Kit.node(mover);     // body: 기울기·스쿼시가 걸리는 몸
  const gltf = await new Promise((res, rej) => ctx.loader.load(A + 'penguin.glb', res, undefined, rej));
  const model = gltf.scene;
  const holder = new THREE.Group(); holder.rotation.y = Math.PI; holder.add(model); body.add(holder);   // Blender 정면(+Z) → 게임 정면(-Z)
  root.updateMatrixWorld(true);
  const bodyInv = new THREE.Matrix4().copy(body.matrixWorld).invert();
  const originIn = o => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(bodyInv);
  const meshes = [];
  model.traverse(o => { if (o.isMesh) { meshes.push(o); o.castShadow = o.receiveShadow = true; o.material.envMapIntensity = 0.5; } });

  // ── 팔: 회전 중심을 모델 어깨로 (_arm + _use_model 3·4단계)
  const makeArm = x => {
    const p = Kit.node(body, [x, 0.95, 0]), piv = Kit.node(p), hand = Kit.node(p, [0, -0.5, 0]);
    return { p, piv, hand, flip: null };
  };
  const armR = makeArm(0.47), armL = makeArm(-0.47);
  let waveBone = null, waveArm = null;
  for (const f of meshes.filter(o => o.name.includes('지느러미'))) {
    const o = originIn(f), arm = o.x > 0 ? armR : armL;
    arm.p.position.copy(o); arm.hand.position.set(0, -0.3, 0); arm.flip = f;
    if (f.parent && f.parent.name === 'Bone') { waveBone = f.parent; waveArm = arm; }
  }
  // 손 흔들기 뼈의 쉬는 자세 (회전 변화량을 몸 기준으로 바꾸는 데 씀: _bone_delta)
  const qRestInv = new THREE.Quaternion(), pg = new THREE.Quaternion(), pgInv = new THREE.Quaternion();
  if (waveBone) {
    qRestInv.copy(waveBone.quaternion).invert();
    pg.copy(body.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(waveBone.parent.getWorldQuaternion(new THREE.Quaternion()));
    pgInv.copy(pg).invert();
  }
  root.updateMatrixWorld(true);
  for (const arm of [armR, armL]) if (arm.flip) arm.piv.attach(arm.flip);

  // ── 발: 몸 밖(펭귄 노드)에 따로. 엉덩이 관절(hip)을 하나 둬서 앉을 때 다리를 앞으로 뻗는다
  const makeFoot = () => { const g = Kit.node(mover), hip = Kit.node(g); return { g, hip }; };
  const footR = makeFoot(), footL = makeFoot();
  const footBones = new Set();
  for (const m of meshes) {
    const o = originIn(m);
    if (m.name.includes('발') || (o.y < 0.2 && Math.abs(o.x) > 0.05)) footBones.add(m.parent && m.parent.isBone && m.parent.children.every(c => c.isMesh) ? m.parent : m);
  }
  for (const b of footBones) {
    const o = originIn(b), foot = o.x > 0 ? footR : footL;
    if (!foot.set) { foot.hip.position.set(o.x * 0.92, 0.17, o.z + 0.05); foot.set = true; root.updateMatrixWorld(true); }
    foot.hip.attach(b);
  }
  // ── 머리: 목 관절 하나 (보는 방향으로 돌린다)
  const headMesh = meshes.find(o => o.name === '머리') || meshes.reduce((a, b) => (originIn(a).y > originIn(b).y ? a : b));
  const headBone = headMesh.parent && headMesh.parent !== model ? headMesh.parent : headMesh;
  const neck = Kit.node(body, originIn(headBone).toArray());
  root.updateMatrixWorld(true);
  neck.attach(headBone);
  const belly = meshes.find(o => o.name === '배');

  // ── 털옷 (coat_node) — 크기·자리는 _use_model 6단계 값
  const coat = Kit.node(body);
  const onCoat = (x, y, out = 0) => { const r = Kit.eggR(H, R * 1.07, y) + out; return [x, y, -Math.sqrt(Math.max(0, r * r - x * x))]; };
  Kit.lathe(coat, Kit.egg(H, R * 1.07, 0.07, 0.68, 20), [0, 0, 0], PAL.CREAM, 40);
  Kit.tor(coat, 0.36, 0.56, [0, 0.97, 0], PAL.WHITE);
  Kit.sph(coat, 0.12, [0, 0.9, -0.43], PAL.TEAL, 0, [1.1, 0.7, 0.4]);
  for (const sx of [-1, 1]) {
    const lap = Kit.box(coat, [0.09, 0.3, 0.04], onCoat(sx * 0.09, 0.8, 0.012), darkened(PAL.CREAM, 0.08));
    lap.rotation.set(0.25, sx * -0.2, sx * 0.35);
    const pk = Kit.box(coat, [0.2, 0.15, 0.04], onCoat(sx * 0.25, 0.32, 0.01), darkened(PAL.CREAM, 0.1));
    pk.rotation.y = -Math.asin(clamp(sx * 0.25 / Kit.eggR(H, R * 1.07, 0.32), -1, 1)); pk.rotation.x = 0.12;
  }
  for (const y of [0.42, 0.57, 0.72]) Kit.sph(coat, 0.035, onCoat(0, y, 0.01), PAL.NAVY);
  coat.scale.set(0.44, 0.62, 0.46); coat.position.set(0, 0, -0.06);
  // wear_coat(): 배를 가리고, 지느러미는 크림색, 손에는 어두운 장갑
  if (belly) belly.visible = false;
  for (const arm of [armR, armL]) {
    if (arm.flip) arm.flip.material = toyMat(PAL.CREAM);
    Kit.sph(arm.hand, 0.085, [0, 0.04, 0], PAL.DARK);
  }
  // 양동이 (왼손). 앉아 있을 때는 방석 옆 바닥에 내려놓는다
  const bucket = Props.bucket(false);
  const FLOOR_Y = -0.07 / SCALE;               // 방석 윗면(원점)에서 본 바닥 높이
  const BUCKET_REST = new THREE.Vector3(-1.0, FLOOR_Y, 0.1);
  const putBucket = inHand => {
    if (inHand) { armL.hand.add(bucket); bucket.position.set(0, -0.34, 0); }
    else { mover.add(bucket); bucket.position.copy(BUCKET_REST); }
    bucket.rotation.set(0, 0, 0);
  };
  putBucket(false);
  let fill = 0; const CAP = 8;
  // 먹는 물건 (오른손)
  const snack = Props.item('can'); snack.visible = false; armR.hand.add(snack); snack.position.set(0, -0.02, -0.06);
  // 눈가루 (_puff)
  const puffs = [];
  for (let i = 0; i < 10; i++) { const p = Kit.sph(gd, 0.08, [0, -99, 0], PAL.SNOW, 0, [1, 1, 1], 8, 4); p.castShadow = false; p.visible = false; puffs.push({ m: p, v: new THREE.Vector3(), life: 0, s: 1 }); }
  const wp = new THREE.Vector3();
  function puff(s) {
    root.getWorldPosition(wp); gd.worldToLocal(wp);
    for (const p of puffs) {
      const a = rand(0, Math.PI * 2), tilt = rand(0, 1.2), sp = rand(1.2, 3.2);
      p.v.set(Math.cos(a) * Math.sin(tilt) * sp, Math.cos(tilt) * sp, Math.sin(a) * Math.sin(tilt) * sp);
      p.m.position.set(wp.x, wp.y + 0.15, wp.z); p.life = 0.55; p.s = rand(0.5, 1.2 * s); p.m.visible = true;
    }
  }

  /* ── 소리 ── */
  let ac = null;
  const actx = () => { try { ac = ac || new AudioContext(); if (ac.state === 'suspended') ac.resume().catch(() => {}); return ac; } catch { return null; } };
  const VOL = 0.6;
  function sfx(name, vol = 0.5, rate = 1, jitter = 0) {
    const a = ctx.playAudio(`${A}sfx/${name}.ogg`, { volume: clamp(vol * VOL, 0, 1) });
    if (a) { a.preservesPitch = false; a.playbackRate = Math.max(0.3, rate * (1 + rand(-jitter, jitter))); }
    return a;
  }
  function noiseBurst(dur, env, lo, hi, gain) {
    const c = actx(); if (!c) return;
    const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    let cr = 1;
    for (let i = 0; i < n; i++) { if (i % 90 === 0) cr = rand(0.55, 1); d[i] = rand(-1, 1) * cr * env(i / c.sampleRate, i / n); }
    const src = c.createBufferSource(); src.buffer = buf;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = hi;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = lo;
    const g = c.createGain(); g.gain.value = gain * VOL;
    src.connect(lp).connect(hp).connect(g).connect(c.destination); src.start();
  }
  function tone(f0, f1, dur, gain, decay, delay = 0) {
    const c = actx(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + delay;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain * VOL, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.min(dur, 5 / decay + 0.02));
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const radioIn = () => noiseBurst(0.22, tt => Math.min(1, tt / 0.004) * Math.exp(-tt * 9) * 0.6, 400, 2800, 0.9);       // 무전 '치익'
  const radioOut = () => { tone(1180, 1160, 0.11, 0.2, 14); tone(2360, 2320, 0.11, 0.03, 30); };                           // 무전 끝 '삐'
  function scoopSnd(k) {                                                                                                  // 삽질 크런치 → 양동이에 '퍽'
    noiseBurst(0.28, (tt, x) => Math.sin(Math.PI * Math.pow(x, 0.6)) * 0.5, 1200 * k, 6500, 0.7);
    setTimeout(() => { noiseBurst(0.14, (tt, x) => (1 - x) * 0.35, 600, 5000, 0.6); tone(190, 120, 0.12, 0.22, 30); }, 320);
  }
  const pop = (rate = 1) => tone(520 * rate, 1040 * rate, 0.09, 0.2, 30);
  const hopSnd = () => tone(300, 620, 0.14, 0.14, 18);
  // 한 줄 말하기: 치익 → 0.14초 뒤 목소리 → 자막. 줄이 겹치지 않게 한 번에 하나만.
  let narrBusy = false, voice = null; const timers = new Set();
  const later = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  function narrate(key) {
    if (narrBusy || !LINES[key]) return false;
    narrBusy = true;
    radioIn();
    ctx.subtitle(LINES[key], 2600);
    let ended = false;
    const end = () => { if (ended) return; ended = true; radioOut(); later(350, () => { narrBusy = false; }); };
    later(140, () => {
      voice = ctx.playAudio(`${A}voice/${key}.wav`, { volume: 0.63 });
      if (!voice) { later(2400, end); return; }
      voice.addEventListener('loadedmetadata', () => {
        const hold = Math.max(2.5, 0.14 + (voice.duration || 2) + 0.5);
        ctx.subtitle(LINES[key], hold * 1000 - 140);
        later(hold * 1000 - 140, end);
      }, { once: true });
      voice.addEventListener('error', () => later(2400, end), { once: true });
    });
    later(9000, end);
    return true;
  }
  function hush() { for (const id of timers) clearTimeout(id); timers.clear(); narrBusy = false; if (voice) { try { voice.pause(); } catch {} voice = null; } }

  /* ── 동작 상태 (아트_펭귄.gd 의 변수 그대로) ── */
  let move_amt = 0, deep = 0, scooping = false, sitting = true, shiver = false, consume_t = 0, reach_t = 0;
  let phase = 0, t = 0, sq = 0, sq_v = 0, lastSign = 1;
  let sitK = 1;                 // 0 = 서 있음, 1 = 앉음 (다리·키가 부드럽게 바뀜)
  let hopY = 0, hopV = 0, hopping = false;
  let lean = 0, wobble = 0, armsOut = 0, lookK = 1, headYaw = 0, headPitch = 0, bodyYaw = 0;
  let active = false, home = null, heading = null;   // heading: 걸을 때 보는 방향(월드 각도)
  const punch = a => { sq_v += a * 14; };
  const api = { onFootstep: null, onScoop: null };   // 테마가 눈 위 발자국·삽 자국을 찍으려고 끼워 넣는다

  // 손 흔들기 (Blender 동작 '펭귄_손흔들기'): 뼈 'Bone' 이 돈 만큼을 늘 오른팔(빈손)에 더한다
  const mixer = new THREE.AnimationMixer(model);
  let waveAction = null;
  {
    const clip = gltf.animations.find(c => c.name.includes('손흔들기')) || gltf.animations[0];
    if (clip && waveBone) {
      const tracks = clip.tracks.filter(tr => tr.name === waveBone.name + '.quaternion');
      const only = new THREE.AnimationClip('wave', clip.duration, tracks.length ? tracks : clip.tracks);
      waveAction = mixer.clipAction(only); waveAction.setLoop(THREE.LoopOnce, 1); waveAction.clampWhenFinished = false;
    }
  }
  const isWaving = () => !!waveAction && waveAction.isRunning();
  const wave = () => { if (waveAction) { waveAction.reset().play(); } };
  const waveDelta = new THREE.Quaternion(), qd = new THREE.Quaternion(), qa = new THREE.Quaternion(), IDENT = new THREE.Quaternion();
  function updateBones(d) {
    mixer.update(d);
    if (!waveBone) return;
    if (isWaving()) {
      qd.copy(waveBone.quaternion).multiply(qRestInv);
      waveDelta.copy(pg).multiply(qd).multiply(pgInv);
      if (waveArm === armL) { waveDelta.y *= -1; waveDelta.z *= -1; }       // 뼈가 왼쪽이면 좌우를 뒤집음
    } else waveDelta.slerp(IDENT, Math.min(1, d * 10));
    qa.copy(armR.p.quaternion);
    armR.piv.quaternion.copy(qa).invert().multiply(waveDelta).multiply(qa);
  }

  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
  function onStep() {
    const off = home && Math.hypot(root.position.x - home.x, root.position.z - home.z) > 0.3;
    sfx('step' + Math.floor(rand(0, 3)), off ? 0.5 : 0.3, 1, 0.1);
    if (off) {
      puff(0.6);
      if (api.onFootstep && heading !== null) {
        const side = lastSign > 0 ? 1 : -1;
        fwd.set(Math.sin(heading), 0, Math.cos(heading));
        tmp.set(root.position.x + fwd.z * side * 0.2 * SCALE * -1, 0, root.position.z + fwd.x * side * 0.2 * SCALE);
        api.onFootstep(tmp, heading, side);
      }
    }
  }

  // 매 프레임 (_process)
  function process(d, look) {
    t += d;
    const amt = clamp(move_amt, 0, 1.6);
    if (amt > 0.05 && !sitting) phase += d * (5 + 5 * amt);
    const s = Math.sin(phase);
    if (amt > 0.2 && !sitting && Math.sign(s) !== lastSign && s !== 0) { lastSign = Math.sign(s); onStep(); }
    sq_v += (-180 * sq - 14 * sq_v) * d; sq += sq_v * d; sq = clamp(sq, -0.4, 0.4);
    const w = Math.min(amt, 1), k = Math.min(1, d * 12);
    let rx = -0.1 * w - 0.14 * deep * w, rz = s * 0.13 * w, py = Math.abs(s) * 0.07 * w - deep * 0.22;
    if (scooping) rx = -0.55 + Math.sin(t * 16) * 0.08;
    if (shiver) rz += Math.sin(t * 55) * 0.025;
    if (sitting) { rx = 0.08; rz = 0; py = 0; }
    rx -= lean; rz += Math.sin(t * 9) * wobble;
    body.rotation.x = lerp(body.rotation.x, rx, k); body.rotation.z = lerp(body.rotation.z, rz, k);
    body.rotation.y = lerp(body.rotation.y, bodyYaw, Math.min(1, d * 6));
    body.position.y = lerp(body.position.y, py, k) ;
    // 메뉴 화면의 숨쉬기: sq = sin(t·1.6)·0.03 (가만히 있을 때만)
    const idle = Math.sin(t * 1.6) * 0.03 * (1 - w) * (scooping ? 0 : 1);
    const q = sq + idle;
    body.scale.set(1 + q * 0.5, 1 - q, 1 + q * 0.5);
    mover.position.y = hopY;
    // 발
    sitK = lerp(sitK, sitting ? 1 : 0, Math.min(1, d * 9));
    const fz = -0.15, fy = 0.05 - deep * 0.15;
    footR.g.position.set(0, fy - 0.05 + Math.max(0, s) * 0.09 * w + sitK * 0.03, fz + 0.15 + Math.cos(phase) * 0.16 * w - sitK * 0.08);
    footL.g.position.set(0, fy - 0.05 + Math.max(0, -s) * 0.09 * w + sitK * 0.03, fz + 0.15 - Math.cos(phase) * 0.16 * w - sitK * 0.08);
    footR.hip.rotation.x = sitK * 1.15; footL.hip.rotation.x = sitK * 1.15;      // 앉으면 다리를 앞으로 뻗음
    footR.hip.rotation.z = sitK * 0.12; footL.hip.rotation.z = -sitK * 0.12;
    // 팔 (길이는 안 변함. 회전만.)
    let ar = [-s * 0.6 * w, 0, 0.35 + 0.15 * w], al = [s * 0.45 * w, 0, -0.3 - 0.1 * w];
    if (consume_t > 0) { consume_t -= d; ar = [2.25 + Math.sin(t * 20) * 0.08, 0, -0.3]; }
    else if (reach_t > 0) { reach_t -= d; ar = [1.35, 0, 0.1]; }
    if (scooping) al = [1.0 + Math.sin(t * 16) * 0.4, 0, -0.2];
    if (sitting && consume_t <= 0 && reach_t <= 0) ar = [0.5, 0, 0.3];             // 앉아서 쉬는 팔 (운전대 잡는 1.25 대신 편하게)
    if (sitting) al = [0.5, 0, -0.3];
    if (armsOut > 0) { ar = [0.3, 0, 0.35 + armsOut * 1.1]; al = [0.3, 0, -0.3 - armsOut * 1.1]; }
    const ka = Math.min(1, d * 18);
    for (let i = 0; i < 3; i++) { const ax = 'xyz'[i]; armR.p.rotation[ax] = lerp(armR.p.rotation[ax], ar[i], ka); armL.p.rotation[ax] = lerp(armL.p.rotation[ax], al[i], ka); }
    // 머리·몸이 보는 곳을 따라감
    let wy = 0, wpitch = 0;
    if (look && lookK > 0.01) {
      tmp.copy(look); mover.worldToLocal(tmp);
      wy = clamp(Math.atan2(-tmp.x, -tmp.z), -1.15, 1.15) * lookK;
      wpitch = clamp(Math.atan2(tmp.y - 1.1, Math.hypot(tmp.x, tmp.z)), -0.45, 0.4) * lookK;
    }
    const kl = Math.min(1, d * 5);
    headYaw = lerp(headYaw, wy, kl); headPitch = lerp(headPitch, wpitch, kl);
    bodyYaw = headYaw * 0.3;
    neck.rotation.y = headYaw * 0.62; neck.rotation.x = headPitch * 0.8 + (scooping ? 0.25 : 0) - lean * 0.6;
    updateBones(d);
    // 눈가루
    for (const p of puffs) if (p.life > 0) {
      p.life -= d; p.v.y -= 9 * d; p.m.position.addScaledVector(p.v, d);
      p.m.scale.setScalar(p.s * clamp(p.life / 0.25, 0, 1)); if (p.life <= 0) p.m.visible = false;
    }
  }

  /* ── 켜졌을 때 하는 일들 (게임 속 동작을 차례로) ── */
  const R_LOOP = 0.6;                      // 방석 옆에서 도는 작은 원 (m)
  const setHeading = (want, d, rate = 11) => {
    if (heading === null) heading = root.rotation.y;
    let diff = ((want - heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    heading += diff * Math.min(1, d * rate);
    mover.rotation.y = heading - root.rotation.y;
    return Math.abs(diff);
  };
  const groundY = () => 0.07 * (1 - smooth(0.3, 0.42, Math.hypot(root.position.x - home.x, root.position.z - home.z)));
  const acts = {
    idle: dur => ({ dur, tick() { move_amt = lerp(move_amt, 0, 0.2); } }),
    stand: () => ({ dur: 0.9, start() { sitting = false; punch(0.3); pop(0.9); reach_t = 0.45; later(260, () => { putBucket(true); sfx('pocket', 0.5); }); } }),
    say: key => ({ dur: 0.1, start() { narrate(key); } }),
    wave: () => ({ dur: 3.6, start() { wave(); punch(0.15); }, tick(d) { setHeading(root.rotation.y, d, 6); } }),
    march: dur => ({ dur, tick(d) { move_amt = lerp(move_amt, 0.8, Math.min(1, d * 10)); }, end() { move_amt = 0; } }),
    loop: () => ({
      dur: 30, a: Math.PI, walking: true, start() { lookK = 0.25; },
      tick(d) {
        move_amt = lerp(move_amt, 0.55, Math.min(1, d * 10));
        const sp = 3.4 * 0.55 * SCALE;                    // WALK × 걸음 세기
        this.a += sp / R_LOOP * d;
        const cx = home.x + R_LOOP, cz = home.z;
        const nx = cx + Math.cos(this.a) * R_LOOP, nz = cz + Math.sin(this.a) * R_LOOP;
        setHeading(Math.atan2(nx - root.position.x, nz - root.position.z), d);
        root.position.x = nx; root.position.z = nz; root.position.y = groundY();
        if (this.a >= Math.PI * 3) this.dur = 0;
      },
      end() { root.position.copy(home); move_amt = 0; lookK = 1; },
    }),
    face: () => ({ dur: 0.5, tick(d) { move_amt = lerp(move_amt, 0.3, 0.2); setHeading(root.rotation.y, d, 9); }, end() { move_amt = 0; heading = root.rotation.y; mover.rotation.y = 0; } }),
    scoop: n => ({
      dur: 0.36 * n + 0.25, st: 0, done: 0,
      start() { scooping = true; lookK = 0.2; },
      tick(d) {
        this.st += d;
        if (this.st >= 0.36 && this.done < n) {
          this.st = 0; this.done++; fill = Math.min(CAP, fill + 1);
          Props.setBucketFill(bucket, fill / CAP);
          scoopSnd(0.85 + 0.5 * fill / CAP); punch(0.14); puff(1.4);
          if (api.onScoop) { root.getWorldPosition(tmp); fwd.set(Math.sin(heading ?? root.rotation.y), 0, Math.cos(heading ?? root.rotation.y)); tmp.addScaledVector(fwd, 0.42 * SCALE); api.onScoop(tmp); }
          if (fill >= CAP) { pop(1.4); ctx.toast('양동이 가득!', 1600); }
        }
      },
      end() { scooping = false; lookK = 1; },
    }),
    sell: () => ({ dur: 0.7, start() { reach_t = 0.5; punch(0.15); sfx('thud', 0.4, 1.2); later(200, () => { fill = 0; Props.setBucketFill(bucket, 0); sfx('click', 0.5); pop(1.2); }); } }),
    hop: () => ({
      dur: 1.2, start() { hopV = 4.2; hopping = true; punch(-0.2); hopSnd(); },
      tick(d) { if (hopping) { hopV -= 16 * d; hopY += hopV * d; if (hopY <= 0) { hopY = 0; hopping = false; punch(0.22); sfx('thud', 0.3, 1.3); puff(0.8); } } },
      end() { hopY = 0; hopping = false; },
    }),
    eat: () => ({
      dur: 1.5, start() { snack.visible = true; snack.scale.setScalar(0.2); consume_t = 1.0; pop(1.2); sfx('click', 0.35, 1.4); },
      tick(d) { snack.scale.setScalar(Math.min(1.3, snack.scale.x + d * 9)); if (consume_t <= 0 && snack.visible) { snack.visible = false; punch(0.28); tone(440, 880, 0.25, 0.12, 8); } },
      end() { snack.visible = false; },
    }),
    shiver: dur => ({ dur, start() { shiver = true; lean = 0.12; }, end() { shiver = false; lean = 0; } }),
    // 방석에서 (ox, oz) 만큼 떨어진 곳으로 뒤뚱뒤뚱 걸어감 (0,0 = 방석으로 돌아옴)
    goto: (ox = 0, oz = 0, amt = 0.6) => ({
      dur: 4, walking: true, start() { lookK = 0.25; },
      tick(d) {
        const tx = home.x + ox, tz = home.z + oz, dx = tx - root.position.x, dz = tz - root.position.z, dist = Math.hypot(dx, dz);
        if (dist < 0.02) { this.dur = 0; return; }
        move_amt = lerp(move_amt, amt, Math.min(1, d * 10)); setHeading(Math.atan2(dx, dz), d);
        const st = Math.min(dist, 3.4 * amt * SCALE * d);
        root.position.x += dx / dist * st; root.position.z += dz / dist * st; root.position.y = groundY();
      },
      end() { root.position.x = home.x + ox; root.position.z = home.z + oz; root.position.y = groundY(); move_amt = 0; lookK = 1; },
    }),
    // 제자리에서 돌아서기 (월드 각도. 0 = 카메라 쪽)
    turn: psi => ({ dur: 0.45, tick(d) { move_amt = lerp(move_amt, 0.3, 0.2); setHeading(psi, d, 9); }, end() { move_amt = 0; } }),
    sit: () => ({ dur: 0.6, start() { sitting = true; punch(0.2); sfx('thud', 0.3, 0.8); putBucket(false); heading = null; mover.rotation.y = 0; lookK = 1; } }),
  };
  let queue = [], cur = null, curT = 0, clickN = 0, autoN = 0, lastLine = -99;
  const push = (...a) => { queue.push(...a); };
  const line = key => (t - lastLine > 6 ? (lastLine = t, [acts.say(key)]) : []);
  function endCur() { if (cur && cur.end) cur.end(); cur = null; }
  function clearActs() { endCur(); queue = []; scooping = false; shiver = false; lean = 0; wobble = 0; armsOut = 0; lookK = 1; hopY = 0; hopping = false; snack.visible = false; }
  // 눈 퍼담기: 방석 옆 눈밭으로 나가서 → 퍼담고 → (가득 차면 비우고) → 돌아옴
  const scoopTrip = n => [acts.goto(0.62, 0.16), acts.turn(0.55), acts.scoop(n), acts.idle(0.35), { dur: 0.01, start() { if (fill >= CAP) queue.unshift(acts.sell()); } }, acts.goto(0, 0), acts.face()];
  // 클릭할 때마다 다음 상호작용
  const CLICKS = [
    () => [...line('hut'), acts.wave()],
    () => [...line('sell'), ...scoopTrip(4)],
    () => [acts.hop(), acts.hop()],
    () => [...line('start'), acts.loop(), acts.face()],
    () => [acts.eat()],
    () => [...line('cold'), acts.shiver(1.8)],
    () => [...line('tired'), acts.march(1.6)],
  ];
  // 가만히 두면 혼자서 하는 일 (영상을 보는 동안에는 말없이, 드문드문)
  const AUTO = [
    () => [acts.march(1.4)], () => scoopTrip(3), () => [acts.wave()],
    () => [acts.loop(), acts.face()], () => [acts.hop()], () => scoopTrip(2),
  ];
  function runActs(d, state) {
    if (!cur) {
      cur = queue.shift() || null; curT = 0;
      if (cur && cur.start) cur.start();
      if (!cur && active) {
        const quiet = state && state.phase === 'playing';
        push(acts.idle(quiet ? rand(7, 12) : rand(2.5, 4.5)), ...AUTO[autoN++ % AUTO.length]());
        if (!quiet && autoN % 3 === 0) push(...line(['hut', 'sell', 'tired', 'storm', 'wind'][Math.floor(autoN / 3) % 5]));
      }
      return;
    }
    curT += d;
    if (cur.tick) cur.tick(d);
    if (curT >= cur.dur) endCur();
  }

  /* ── 반응 (이모지 버튼) ── */
  let fx = null;       // { t, dur, tick, end }
  function react(kindName) {
    if (fx && fx.end) fx.end();
    fx = null;
    switch (kindName) {
      case 'laugh': punch(0.25); wobble = 0.09; fx = { t: 0, dur: 1.1, n: 0, tick(d) { if (this.t > this.n * 0.22) { this.n++; punch(0.1); } }, end() { wobble = 0; } }; break;
      case 'wow': punch(-0.3); reach_t = 0.7; break;
      case 'clap': case 'cheer': wave(); punch(0.2); break;
      case 'love': punch(0.15); armsOut = 0.6; wobble = 0.05; fx = { t: 0, dur: 1.4, end() { armsOut = 0; wobble = 0; } }; break;
      case 'sad': shiver = true; lean = 0.22; fx = { t: 0, dur: 1.8, end() { shiver = false; lean = 0; } }; break;
      case 'eat': snack.visible = true; snack.scale.setScalar(1.3); consume_t = 1.0; fx = { t: 0, dur: 1.05, end() { snack.visible = false; punch(0.28); } }; break;
      default: punch(0.15);
    }
  }

  function setActive(on) {
    if (on === active) return;
    active = on;
    if (!home) home = root.position.clone();
    clearActs();
    if (on) {
      clickN = 0; autoN = 0; lastLine = -99;
      // 일어나서(퐁!) → "일어나세요. 근무가 시작됩니다." + 손 흔들기 → "걸어." → 방석 옆을 한 바퀴 → 눈 퍼담기
      push(acts.stand(), acts.say('wake'), acts.wave(), acts.idle(0.6), acts.say('start'), acts.loop(), acts.face(), acts.idle(0.5), ...scoopTrip(4), acts.idle(1.5));
      lastLine = t + 8;
    } else {
      hush();
      if (!sitting) push(acts.goto(0, 0, 1), acts.sit());
    }
  }
  function onClick() {
    if (!active) return;
    // 지금 하던 쉬는 시간·혼자 하던 일은 끊고 바로 다음 상호작용으로
    if (cur && cur.walking) queue = [acts.face()]; else { endCur(); queue = []; }
    push(...CLICKS[clickN++ % CLICKS.length]());
  }

  return {
    root,
    get headHeight() { return (1.486 * (1 - sq) + hopY) * SCALE; },
    update(dt, _t, state) {
      if (!home) home = root.position.clone();
      runActs(dt, state);
      if (fx) { fx.t += dt; if (fx.tick) fx.tick(dt); if (fx.t >= fx.dur) { if (fx.end) fx.end(); fx = null; } }
      process(dt, state && state.lookTarget);
    },
    react, setActive, onClick,
    // 테마·점검용
    hooks: api, narrate, wave, punch,
    get state() { return { sitting, active, fill, move_amt, waving: isWaving(), busy: !!cur, queue: queue.length, narrBusy }; },
    debug: { acts, push, clearActs, set(o) { if ('sitting' in o) sitting = o.sitting; if ('scooping' in o) scooping = o.scooping; if ('move' in o) move_amt = o.move; if ('bucket' in o) putBucket(o.bucket); if ('sitK' in o) sitK = o.sitK; } },
  };
}
