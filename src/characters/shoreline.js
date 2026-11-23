// 탐험가(SHORELINE DELUXE 의 여자 주인공) — 게임 속 몸·색·표정·움직임·목소리를 three.js 로 옮긴 것.
//   몸      : assets/shoreline/hero_f.glb (게임의 assets/models/hero_f.glb 그대로, 뼈 22개 "ExplorerRig")
//   색·얼굴 : shaders/hero_surface.gdshader + character/hero_look.gd(분홍 옷) + character/hero_face.gd(표정·눈 깜빡임·입)
//   움직임  : character/explorer.gd _animate_figure(숨쉬기·흔들림·팔), character/hq_body.gd _gait(발을 땅에 딛는 걸음),
//             character/tool_motions.gd(도구 휘두르기), character/hook_band.gd(두 팔 번쩍)
//   목소리  : assets/voice/me_f/<대사 md5 앞 12자>.mp3 중 hero_face.gd SAYS["f"] 대사들
// 좌표: 모델은 게임처럼 -Z 를 보고 있고(모델 단위, 키 2.86), 바깥 묶음이 0.56배·반 바퀴 돌려 +Z 를 보는 1.6 m 사람으로 만든다.

const SCALE = 0.56;
const TAU = Math.PI * 2;

/* ───────── 게임의 표(그대로 옮김) ───────── */
// hero_look.gd: 머리 "기본"(그림 그대로 분홍), 옷 "분홍" Color(0.95,0.58,0.7), 포인트 "기본"(그림 그대로 남색)
const LOOK = { hairOn: false, hair: [0.96, 0.6, 0.71], lightOn: true, light: [0.95, 0.58, 0.7], darkOn: false, dark: [0.09, 0.14, 0.3] };
const PAINTED = { hairRef: 0.755, lightRef: 0.99, darkRef: 0.14 };
// hero_face.gd FACES["f"]
const FACE = { eye: [0.072, 2.5415], eyeS: [0.037, 0.0245], mouth: [0, 2.445], mouthW: 0.028, cheek: [0.102, 2.478], nose: [0, 2.478], skin: [254 / 255, 224 / 255, 213 / 255] };
const KEYS = ['lid_r', 'lid_l', 'hap_r', 'hap_l', 'tilt', 'under', 'smile', 'open', 'round', 'mix', 'blush', 'brow_up'];
const BASE = { mix: 1.0, smile: 0.15 };
const MOODS = {
  neutral: { smile: 0.12 },
  smile: { under: 0.3, smile: 0.7, mix: 1.0 },
  grin: { lid_r: 1.0, lid_l: 1.0, hap_r: 1.0, hap_l: 1.0, smile: 1.0, open: 0.6, mix: 1.0 },
  surprised: { brow_up: 1.0, smile: -0.1, open: 0.75, round: 1.0, mix: 1.0 },
  angry: { lid_r: 0.25, lid_l: 0.25, tilt: 0.9, smile: -0.6, mix: 1.0 },
  sad: { brow_up: 0.3, lid_r: 0.3, lid_l: 0.3, tilt: -0.9, smile: -0.6, mix: 1.0 },
  shy: { lid_r: 0.35, lid_l: 0.35, under: 0.25, smile: 0.4, blush: 1.0, mix: 1.0 },
  wink: { lid_l: 1.0, hap_l: 1.0, under: 0.15, smile: 0.8, open: 0.25, mix: 1.0 },
  sleepy: { lid_r: 0.68, lid_l: 0.68, smile: 0.1, open: 0.12, round: 0.6, mix: 1.0 },
  fond: { under: 0.3, smile: 0.75, blush: 0.85, mix: 1.0 },
  yawn: { lid_r: 0.85, lid_l: 0.85, brow_up: 0.4, open: 0.85, round: 0.9, mix: 1.0 },
};
// hero_face.gd SAYS["f"] 중 방에서 어울리는 대사 → [목소리 파일(md5 앞 12자), 글]
const SAYS = {
  hello: [['fb44582973b9', '안녕? 가까이 가도 돼?'], ['046854edcca4', '눈 찡긋. 오늘도 잘해 보자고.'], ['31ae3347a863', '걱정 마, 나 믿어 봐.']],
  neutral: [['46da685a5138', '자, 평소 얼굴로 돌아왔다.'], ['3695cdecb698', '표정 관리… 이게 제일 어렵네.'], ['aca36fa554ac', '아무 생각 없는 얼굴이 제일 편해.']],
  smile: [['c7f276c3a38c', '이 정도 웃으면 괜찮아 보이지?'], ['485023f67c45', '웃어 두자. 웃으면 좀 나아지니까.'], ['013df5795de4', '거울 없어도 알아. 지금 좀 괜찮아.']],
  grin: [['9c65b77c9d42', '아하하, 왜! 나 지금 기분 좋아!'], ['a274df976832', '이렇게 크게 웃는 거 오래됐네.'], ['a6a057f27e21', '봤어? 이빨까지 보이게 웃었어.']],
  surprised: [['40409083fe6e', '엇?! 뭐야, 방금 무슨 소리 났어?'], ['747829f9efe1', '어… 뒤에 뭐 있어? 없다고 말해 줘.'], ['4e9327583a60', '헉! 놀랐잖아.']],
  sad: [['c17757148161', '…조금만 쉬면 괜찮아질 거야.'], ['b932cac90764', '다들 무사하기만 하면 됐는데.'], ['1db05bc7b22d', '울진 않을 거야. 아직은.']],
  shy: [['c43a9ba124a1', '아, 왜 그렇게 봐… 쑥스럽게.'], ['f862103cd7ee', '너무 쳐다보지 마.'], ['d6c7c5563860', '얼굴 빨개진 거, 안 보이는 거지?']],
  wink: [['e673b8cc2269', '윙크 한 방! 이러면 다 해결돼.'], ['31ae3347a863', '걱정 마, 나 믿어 봐.'], ['046854edcca4', '눈 찡긋. 오늘도 잘해 보자고.']],
  sleepy: [['483eab03c4d6', '하아… 잠깐만 눈 좀 붙이면 안 될까.'], ['abce5820fbdd', '눈꺼풀이 천근이야.']],
  idle: [['72b16747fe35', '하암… 가만히 있으니까 졸린다.'], ['8cfc9e877ab0', '이러다 서서 자겠어.'], ['976898b74f69', '눈 감기 전에 뭐라도 하자…']],
  fond: [['cbdc8a2e4c01', '저 눈 좀 봐. 너무 귀엽잖아.'], ['303db0706b47', '이제 우린 친구야. 헤헤.'], ['a7126fe38e44', '말 걸길 잘했다.'], ['a9fd06e1cbe8', '…왜 이렇게 두근거리지.']],
};
// tool_motions.gd MOTIONS: [때 0..1, 팔 x, 팔 y, 팔 z, 팔꿈치, (도구 기울기), 가슴 비틀기, 가슴 숙이기, 왼팔 x]
const MOTIONS = {
  slash: { time: 0.5, hit: 0.5, keys: [[0.0, 0.1, 0.0, 0.1, 0.3, 0.3, 0.0, 0.0, 0.0], [0.3, 1.25, -1.3, 0.2, 0.7, -0.9, -0.45, 0.0, 0.3], [0.5, 1.5, 0.0, 0.0, 0.15, -1.65, 0.0, 0.05, -0.2], [0.68, 1.35, 1.05, 0.0, 0.25, -1.65, 0.45, 0.08, -0.4], [1.0, 0.1, 0.0, 0.1, 0.3, 0.3, 0.0, 0.0, 0.0]] },
  chop: { time: 0.7, hit: 0.55, keys: [[0.0, 0.1, 0.0, 0.1, 0.3, 0.3, 0.0, 0.0, 0.0], [0.38, 2.7, 0.0, 0.45, 1.1, 1.3, -0.3, -0.15, 0.6], [0.55, 1.15, 0.0, -0.1, 0.15, -1.75, 0.2, 0.28, -0.1], [0.72, 1.1, 0.0, -0.1, 0.15, -1.8, 0.2, 0.28, -0.1], [1.0, 0.1, 0.0, 0.1, 0.3, 0.3, 0.0, 0.0, 0.0]] },
  punch: { time: 0.4, hit: 0.5, keys: [[0.0, 0.1, 0.0, 0.1, 0.3, 0.0, 0.0, 0.0, 0.0], [0.3, 0.75, 0.0, 0.2, 1.75, 0.0, -0.3, 0.0, 0.6], [0.5, 1.5, 0.18, 0.0, 0.05, 0.0, 0.32, 0.08, 0.7], [0.68, 1.45, 0.15, 0.0, 0.1, 0.0, 0.28, 0.08, 0.7], [1.0, 0.1, 0.0, 0.1, 0.3, 0.0, 0.0, 0.0, 0.0]] },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fposmod = (a, b) => ((a % b) + b) % b;
const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (from, to) => { let d = (to - from) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

/* ───────── 색 입히기 + 얼굴 그리기 + 얼굴 전용 빛 (hero_surface.gdshader) ───────── */
const FRAG_PARS = /* glsl */`
varying vec4 vZone; varying vec2 vFacePos;
uniform bool uHairOn, uLightOn, uDarkOn; uniform vec3 uHairColor, uLightColor, uDarkColor;
uniform float uHairRef, uLightRef, uDarkRef;
uniform vec2 uEyeC, uEyeS, uMouthC, uCheekC, uNoseC; uniform float uMouthW;
uniform vec3 uSkin, uLash, uMouthIn, uTongue, uBlushColor, uBrowColor, uLipColor;
uniform vec2 uLid, uHappy; uniform float uTilt, uUnder, uSmile, uOpenM, uRoundM, uMouthMix, uBlush, uBrowUp;
uniform float uFaceKnee, uFaceCap, uFaceFill, uFaceMid, uFacePop, uFaceDim, uFill;
float hsHead = 0.0;
float hsBand(float d, float halfW) { return 1.0 - smoothstep(halfW * 0.6, halfW, abs(d)); }
vec3 hsEye(vec3 col, vec2 p, vec2 c, float inward, float shut, float hap) {
  vec2 q = (p - c) / uEyeS; q.x *= inward;
  float r = length(q * vec2(0.74, 0.6));
  float upperMoved = clamp(max(shut, hap) * 4.0 + abs(uTilt) * 2.0, 0.0, 1.0);
  float moved = clamp(max(max(shut, hap) * 4.0, max(abs(uTilt) * 2.0, uUnder * 3.0)), 0.0, 1.0);
  if (r > 1.35 || moved <= 0.0) return col;
  float x = clamp(q.x, -1.15, 1.15);
  float top = 1.15 - 0.3 * x * x;
  float lineShut = -0.55 + 0.3 * x * x;
  float arch = -0.35 + 0.75 * (1.0 - x * x);
  float closed = mix(lineShut, arch, hap);
  float lidY = mix(top, closed, max(shut, hap));
  lidY -= (max(uTilt, 0.0) * 0.5 * (x + 1.0) + max(-uTilt, 0.0) * 0.5 * (1.0 - x)) * (1.0 - max(shut, hap));
  float low = mix(-1.25 + 0.2 * x * x, -0.4 + 0.25 * x * x, uUnder);
  low = mix(low, lidY, smoothstep(0.55, 0.95, max(shut, hap)));
  float th = 0.16;
  float inside = step(low, q.y) * step(q.y, lidY);
  float fade = (1.0 - smoothstep(1.1, 1.35, r)) * (1.0 - smoothstep(1.05, 1.3, q.y));
  vec3 o = mix(uSkin, col, inside);
  float ends = 1.0 - smoothstep(0.95, 1.12, abs(q.x));
  o = mix(o, uLash, hsBand(q.y - lidY, th * (1.0 + 0.3 * max(shut, hap))) * ends * upperMoved);
  o = mix(o, uLash, hsBand(q.y - low, th * 0.45) * ends * uUnder * (1.0 - max(shut, hap)) * 0.8);
  return mix(col, o, fade * moved);
}
vec3 hsBrow(vec3 col, vec2 p, vec2 c, float inward) {
  vec2 q = (p - c) / uEyeS; q.x *= inward;
  if (abs(q.x) > 1.3 || q.y < 0.9 || q.y > 2.6) return col;
  float x = q.x;
  float y = 1.38 + uBrowUp * 0.4 + 0.18 * (1.0 - x * x) - 0.08 * x;
  y -= max(uTilt, 0.0) * 0.4 * (x + 0.3);
  y += max(-uTilt, 0.0) * 0.45 * (x + 0.3);
  float th = 0.2 * mix(1.0, 0.45, smoothstep(-0.2, -1.05, x));
  float ends = 1.0 - smoothstep(0.85, 1.05, abs(x - 0.05));
  return mix(col, uBrowColor, hsBand(q.y - y, th) * ends);
}
vec3 hsNose(vec3 col, vec2 p) {
  vec2 d = (p - uNoseC) / uEyeS.y;
  float tip = 1.0 - smoothstep(0.1, 0.24, length((d - vec2(-0.06, 0.0)) * vec2(0.8, 2.0)));
  float side = hsBand(d.x + 0.14 + d.y * 0.3, 0.07) * (1.0 - smoothstep(0.1, 0.5, abs(d.y - 0.35)));
  return mix(col, col * vec3(0.68, 0.55, 0.56), max(tip, side * 0.75));
}
vec3 hsMouth(vec3 col, vec2 p) {
  vec2 m = (p - uMouthC) / uMouthW;
  float r = length(m * vec2(0.72, 1.0));
  if (r > 1.35 || uMouthMix <= 0.0) return col;
  vec3 o = uSkin;
  float w = mix(1.0, 0.42, uRoundM) * (1.0 + 0.12 * uSmile);
  float xn = m.x / w;
  if (abs(xn) < 1.0) {
    float arc = sqrt(1.0 - xn * xn);
    float upper = uSmile * 0.35 * xn * xn - 0.1 * uSmile + uRoundM * uOpenM * 0.3 * arc;
    float lower = upper - uOpenM * 0.95 * mix(1.0 - xn * xn, arc, uRoundM);
    if (m.y < upper && m.y > lower) {
      o = uMouthIn;
      if (uOpenM > 0.2 && m.y < mix(lower, upper, 0.4) && abs(xn) < 0.6) o = uTongue;
    }
    float taper = 1.0 - smoothstep(0.75, 1.0, abs(xn));
    float lip = 0.13 * mix(1.0, 0.6, taper);
    o = mix(o, uOpenM > 0.08 ? uLash : uLipColor, hsBand(m.y - upper, lip) * max(taper, 0.35));
    o = mix(o, uLash, hsBand(m.y - lower, lip * 0.8) * step(0.08, uOpenM) * max(taper, 0.35));
  }
  return mix(col, o, (1.0 - smoothstep(1.05, 1.35, r)) * uMouthMix);
}
vec3 hsHeld(vec3 e) {
  vec3 over = max(e - vec3(uFaceKnee), vec3(0.0));
  float room = max(uFaceCap - uFaceKnee, 0.001);
  return min(e, vec3(uFaceKnee)) + room * (vec3(1.0) - exp(-over / room));
}
vec3 hsTinted(vec3 tint, float shade) { return tint * pow(shade, 2.2); }
vec3 hsPaint(vec3 paint) {
  vec3 s = pow(max(paint, vec3(0.0)), vec3(1.0 / 2.2));
  float most = max(s.r, max(s.g, s.b));
  float least = min(s.r, min(s.g, s.b));
  float vivid = (most - least) / max(most, 0.001);
  float bright = dot(s, vec3(0.2126, 0.7152, 0.0722));
  float head = clamp(vZone.r, 0.0, 1.0);
  float hand = clamp(vZone.g, 0.0, 1.0);
  float isDark = 1.0 - smoothstep(0.38, 0.5, most);
  float isLight = (1.0 - smoothstep(0.14, 0.2, vivid)) * smoothstep(0.5, 0.62, most);
  vec3 col = paint;
  if (vFacePos.y < 40.0) {
    float pinkish = smoothstep(-0.01, 0.03, s.b - s.g) * smoothstep(0.12, 0.2, vivid) * smoothstep(0.55, 0.7, most) * smoothstep(0.02, 0.08, s.r - s.b);
    vec3 f = col;
    f = hsEye(f, vFacePos, uEyeC, -1.0, uLid.x, uHappy.x);
    f = hsEye(f, vFacePos, vec2(-uEyeC.x, uEyeC.y), 1.0, uLid.y, uHappy.y);
    f = hsMouth(f, vFacePos);
    f = hsBrow(f, vFacePos, uEyeC, -1.0);
    f = hsBrow(f, vFacePos, vec2(-uEyeC.x, uEyeC.y), 1.0);
    f = hsNose(f, vFacePos);
    float bl = max(1.0 - smoothstep(0.2, 1.0, length((vFacePos - uCheekC) / (uEyeS * 1.1))),
                   1.0 - smoothstep(0.2, 1.0, length((vFacePos - vec2(-uCheekC.x, uCheekC.y)) / (uEyeS * 1.1))));
    f = mix(f, uBlushColor, bl * uBlush * 0.5);
    col = mix(f, col, pinkish);
    vec3 pc = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
    float lum = max(dot(pc, vec3(0.2126, 0.7152, 0.0722)), 0.0015);
    float want = clamp((lum - uFaceMid) * uFacePop + uFaceMid, 0.0, 1.0) * uFaceDim;
    vec3 popped = pow(clamp(pc * (want / lum), vec3(0.0), vec3(1.0)), vec3(2.2));
    col = mix(col, popped, 1.0 - pinkish);
  }
  if (uHairOn) {
    float pink = smoothstep(-0.01, 0.03, s.b - s.g) * smoothstep(0.1, 0.18, vivid) * smoothstep(0.5, 0.65, most) * smoothstep(0.0, 0.06, s.r - s.b);
    col = mix(col, hsTinted(uHairColor, clamp(bright / uHairRef, 0.5, 1.3)), pink * head);
  }
  if (uLightOn) col = mix(col, hsTinted(uLightColor, clamp(bright / uLightRef, 0.45, 1.05)), isLight * (1.0 - head) * (1.0 - hand));
  if (uDarkOn) col = mix(col, hsTinted(uDarkColor, clamp(bright / uDarkRef, 0.6, 1.3)), isDark * (1.0 - head));
  return col;
}
`;
// 게임의 light(): 몸은 보통 빛 + 작은 반짝임, 얼굴은 빛을 눌러 받고(하얗게 안 날아감) 그늘을 조금 들어 올린 무광
const LIGHT_PARS = /* glsl */`
varying vec3 vViewPosition;
struct LambertMaterial { vec3 diffuseColor; float specularStrength; };
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float nl = saturate( dot( geometryNormal, directLight.direction ) );
  vec3 e = directLight.color * RECIPROCAL_PI;   // 게임(Godot) 빛 단위
  vec3 d = e * nl;
  float soft = mix( nl, nl * ( 1.0 - uFaceFill ) + uFaceFill, hsHead );
  d = mix( d, hsHeld( e ) * soft, hsHead );
  reflectedLight.directDiffuse += d * material.diffuseColor;
  vec3 h = normalize( directLight.direction + geometryViewDir );
  float gloss = mix( 60.0, 4.0, 0.72 );
  reflectedLight.directDiffuse += e * nl * 0.3 * pow( max( dot( geometryNormal, h ), 0.0 ), gloss ) * ( 1.0 - hsHead );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  // uFill = 게임이 주인공에게만 비추는 약한 보조등(hq_body.gd _make_fill): 어두운 곳에서도 몸이 까맣게 묻히지 않게
  reflectedLight.indirectDiffuse += ( irradiance * RECIPROCAL_PI + vec3( uFill ) ) * material.diffuseColor;
}
#define RE_Direct RE_Direct_Lambert
#define RE_IndirectDiffuse RE_IndirectDiffuse_Lambert
`;

function makeHeroMaterial(THREE, map) {
  const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  const U = {
    uHairOn: { value: LOOK.hairOn }, uHairColor: { value: srgb(...LOOK.hair) }, uHairRef: { value: PAINTED.hairRef },
    uLightOn: { value: LOOK.lightOn }, uLightColor: { value: srgb(...LOOK.light) }, uLightRef: { value: PAINTED.lightRef },
    uDarkOn: { value: LOOK.darkOn }, uDarkColor: { value: srgb(...LOOK.dark) }, uDarkRef: { value: PAINTED.darkRef },
    uEyeC: { value: new THREE.Vector2(...FACE.eye) }, uEyeS: { value: new THREE.Vector2(...FACE.eyeS) },
    uMouthC: { value: new THREE.Vector2(...FACE.mouth) }, uMouthW: { value: FACE.mouthW },
    uCheekC: { value: new THREE.Vector2(...FACE.cheek) }, uNoseC: { value: new THREE.Vector2(...FACE.nose) },
    uSkin: { value: srgb(...FACE.skin) }, uLash: { value: srgb(0.16, 0.09, 0.12) }, uMouthIn: { value: srgb(0.55, 0.2, 0.24) },
    uTongue: { value: srgb(0.93, 0.52, 0.55) }, uBlushColor: { value: srgb(0.98, 0.55, 0.6) },
    uBrowColor: { value: srgb(0.36, 0.2, 0.25) }, uLipColor: { value: srgb(0.5, 0.25, 0.27) },
    uLid: { value: new THREE.Vector2() }, uHappy: { value: new THREE.Vector2() },
    uTilt: { value: 0 }, uUnder: { value: 0 }, uSmile: { value: 0.15 }, uOpenM: { value: 0 }, uRoundM: { value: 0 },
    uMouthMix: { value: 1 }, uBlush: { value: 0 }, uBrowUp: { value: 0 },
    uFaceKnee: { value: 0.8 }, uFaceCap: { value: 1.25 }, uFaceFill: { value: 0.3 }, uFaceMid: { value: 0.8 },
    uFacePop: { value: 1.55 }, uFaceDim: { value: 0.9 }, uFill: { value: 0.0 },
  };
  const m = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide });
  m.shadowSide = THREE.FrontSide;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 zone; attribute vec2 facePos; varying vec4 vZone; varying vec2 vFacePos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZone = zone; vFacePos = facePos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <lights_lambert_pars_fragment>', LIGHT_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = hsPaint( diffuseColor.rgb );\nhsHead = clamp( vZone.r, 0.0, 1.0 );');
  };
  m.customProgramCacheKey = () => 'shoreline-hero-1';
  m.userData.U = U;
  return m;
}

/* ───────── 만들기 ───────── */
export async function createCharacter(ctx) {
  const { THREE } = ctx;
  const V3 = THREE.Vector3, Q = THREE.Quaternion;
  const base = ctx.assets + 'shoreline/';
  const gltf = await ctx.loader.loadAsync(base + 'hero_f.glb');
  const model = gltf.scene;
  model.updateMatrixWorld(true);

  const root = new THREE.Group(); root.name = 'shoreline-hero';
  const body = new THREE.Group(); body.scale.setScalar(SCALE); body.rotation.y = Math.PI; root.add(body);
  body.add(model);

  // 몸: 색 구역(COLOR_0)과 얼굴 자리(UV2 = 쉬는 자세의 앞쪽 머리 좌표, hero_look.gd _with_face)를 붙이고 재질을 바꾼다
  let skinned = null, U = null;
  model.traverse(o => {
    if (!o.isSkinnedMesh) return;
    skinned = o;
    const g = o.geometry, pos = g.getAttribute('position'), nor = g.getAttribute('normal'), col = g.getAttribute('color');
    if (col) { g.setAttribute('zone', col); g.deleteAttribute('color'); }
    else g.setAttribute('zone', new THREE.BufferAttribute(new Float32Array(pos.count * 4), 4));
    const fp = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const front = pos.getZ(i) < -0.05 && (!nor || nor.getZ(i) < 0.2);
      fp[i * 2] = front ? pos.getX(i) : 50; fp[i * 2 + 1] = front ? pos.getY(i) : 50;
    }
    g.setAttribute('facePos', new THREE.BufferAttribute(fp, 2));
    const map = o.material.map; if (map) map.anisotropy = 8;
    o.material = makeHeroMaterial(THREE, map); U = o.material.userData.U;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    o.raycast = () => {};   // 클릭은 아래의 안 보이는 통이 받는다(뼈 붙은 몸은 느리고, 자세가 바뀌면 빗나간다)
  });
  if (!skinned) throw new Error('hero_f.glb: 뼈 붙은 몸이 없음');
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1, 10), new THREE.MeshBasicMaterial());
  hit.visible = false; root.add(hit);

  /* ── 뼈대: 쉬는 자세를 재 두고, 매 프레임 "모델 공간의 자세"를 만들어 뼈에 넣는다 (hq_body.gd _update 방식) ── */
  const B = {}, order = [];
  for (const bone of skinned.skeleton.bones) {
    const rp = new V3(), rq = new Q(), rs = new V3();
    bone.matrixWorld.decompose(rp, rq, rs);
    B[bone.name] = { bone, name: bone.name, parent: bone.parent && bone.parent.isBone ? bone.parent.name : null, rp, rq, p: rp.clone(), q: rq.clone() };
  }
  // GLTFLoader 는 이름의 점을 지운다(thigh.L → thighL): 게임 이름으로도 찾게 한다
  const nb = n => B[n] || B[n.replace('.', '')] || B[n.replace('.', '_')];
  const depth = b => { let d = 0; while (b.parent) { d++; b = B[b.parent]; } return d; };
  for (const k in B) order.push(B[k]);
  order.sort((a, b) => depth(a) - depth(b));
  for (const b of order) {
    if (!b.parent) continue;
    const pb = B[b.parent], inv = pb.rq.clone().invert();
    b.relP = b.rp.clone().sub(pb.rp).applyQuaternion(inv); b.relQ = inv.clone().multiply(b.rq);
  }
  const hips = nb('hips'), spineB = nb('spine'), chest = nb('chest'), neck = nb('neck'), headB = nb('head');
  const LEG = {}, ARM = {};
  const rz = a => new Q().setFromAxisAngle(new V3(0, 0, 1), a);
  for (const tag of ['L', 'R']) {
    const a = nb('thigh.' + tag), b = nb('shin.' + tag), e = nb('foot.' + tag), seat = nb('seat.' + tag);
    LEG[tag] = { a, b, e, seat, hip: a.rp.clone(), ankle: e.rp.clone(), l1: a.rp.distanceTo(b.rp), l2: b.rp.distanceTo(e.rp),
      d1: b.rp.clone().sub(a.rp).normalize(), d2: e.rp.clone().sub(b.rp).normalize() };
    // 발 뼈는 발목에서 발끝 쪽으로 뻗는다(발끝은 땅): 발끝·뒤꿈치까지 거리 (hq_body.gd _measure_legs)
    const along = new V3(0, 1, 0).applyQuaternion(e.rq).normalize();
    const reach = (e.rp.y - 0.05) / Math.max(0.2, -along.y);
    const toe = clamp(reach * Math.hypot(along.x, along.z), 0.08, 0.5);
    LEG[tag].toe = toe * 0.85; LEG[tag].heel = toe * 0.3;
    // 팔: 벌린 채 만들어진 팔을 몸 옆에 늘어뜨리는 고정 회전 (hq_body.gd _hang_arms, 평상복 0.2 rad)
    const up = nb('upper_arm.' + tag), fo = nb('forearm.' + tag), ha = nb('hand.' + tag);
    const want = 0.2 * (tag === 'L' ? -1 : 1);
    const swing = dir => rz(want - Math.atan2(dir.x, -dir.y));
    const dU = fo.rp.clone().sub(up.rp), dF = ha.rp.clone().sub(fo.rp);
    const hung = Math.abs(Math.atan2(dU.x, -dU.y)) < 0.3;
    ARM[tag] = { up, fo, ha, fixU: hung ? new Q() : swing(dU), fixF: hung ? new Q() : swing(dF) };
  }
  const midRest = LEG.L.hip.clone().add(LEG.R.hip).multiplyScalar(0.5);
  const half = Math.abs(LEG.R.hip.x - LEG.L.hip.x) * 0.5;
  const HEAD_TOP = 2.86 - headB.rp.y;             // 머리 뼈에서 정수리(고양이 귀 헤드셋 빼고 머리카락 위)까지

  // 자세 하나 = 골반(자리·기울기) + 두 발목 목표(바닥에 딛는 자리)와 발 기울기 + 무릎 방향 + 팔 관절 + 등·머리
  const mkPose = () => ({ hp: new V3(), hq: new Q(), aL: new V3(), aR: new V3(), fL: new Q(), fR: new Q(), pL: new V3(), pR: new V3(),
    arm: [0, 0, 0, 0, 0, 0, 0, 0], sp: [0, 0, 0], hd: [0, 0, 0] });
  const mixPose = (o, a, b, w) => {
    o.hp.lerpVectors(a.hp, b.hp, w); o.hq.slerpQuaternions(a.hq, b.hq, w);
    o.aL.lerpVectors(a.aL, b.aL, w); o.aR.lerpVectors(a.aR, b.aR, w);
    o.fL.slerpQuaternions(a.fL, b.fL, w); o.fR.slerpQuaternions(a.fR, b.fR, w);
    o.pL.lerpVectors(a.pL, b.pL, w); o.pR.lerpVectors(a.pR, b.pR, w);
    for (let i = 0; i < 8; i++) o.arm[i] = lerp(a.arm[i], b.arm[i], w);
    for (let i = 0; i < 3; i++) { o.sp[i] = lerp(a.sp[i], b.sp[i], w); o.hd[i] = lerp(a.hd[i], b.hd[i], w); }
  };
  const eul = new THREE.Euler(0, 0, 0, 'YXZ');     // Godot 의 회전 순서(YXZ)
  const qe = (x, y, z, out = new Q()) => out.setFromEuler(eul.set(x, y, z, 'YXZ'));
  const tq = new Q(), tq2 = new Q(), tq3 = new Q(), tv = new V3(), tv2 = new V3(), tv3 = new V3();

  function applyPose(P) {
    // 골반
    hips.q.copy(P.hq).multiply(hips.rq);
    hips.p.copy(hips.rp).sub(midRest).applyQuaternion(P.hq).add(P.hp);
    // 물려받는 뼈들(등·가슴·목·머리는 그 위에 비틀기/숙이기)
    const sp = qe(-P.sp[0] * 0.5, P.sp[1] * 0.5, P.sp[2] * 0.5, tq2), hd = qe(P.hd[1] * 0.5, P.hd[0] * 0.5, P.hd[2] * 0.5, tq3);
    for (const b of order) {
      if (!b.parent) continue;
      const pb = B[b.parent];
      b.p.copy(b.relP).applyQuaternion(pb.q).add(pb.p);
      b.q.copy(pb.q).multiply(b.relQ);
      if (b === spineB || b === chest) b.q.premultiply(sp);
      else if (b === neck || b === headB) b.q.premultiply(hd);
    }
    // 팔: 가슴이 돈 만큼 따라 돌고, 그 위에 어깨·팔꿈치 관절
    const chestD = tq.copy(chest.q).multiply(new Q().copy(chest.rq).invert()).clone();
    let i = 0;
    for (const tag of ['L', 'R']) {
      const A = ARM[tag], ax = P.arm[i], ay = P.arm[i + 1], az = P.arm[i + 2], el = P.arm[i + 3]; i += 4;
      const sh = chestD.clone().multiply(qe(ax, ay, az));
      A.up.q.copy(sh).multiply(A.fixU).multiply(A.up.rq);
      const fore = sh.multiply(qe(el, 0, 0));
      A.fo.p.copy(A.fo.relP).applyQuaternion(A.up.q).add(A.up.p);
      A.fo.q.copy(fore).multiply(A.fixF).multiply(A.fo.rq);
      A.ha.p.copy(A.ha.relP).applyQuaternion(A.fo.q).add(A.fo.p);
      A.ha.q.copy(fore).multiply(A.fixF).multiply(A.ha.rq);
      const grip = nb('grip.' + tag);
      if (grip) { grip.p.copy(grip.relP).applyQuaternion(A.ha.q).add(A.ha.p); grip.q.copy(A.ha.q).multiply(grip.relQ); }
    }
    // 다리: 발목 목표에서 거꾸로 계산(두 마디 IK), 무릎은 pole 쪽으로 (hq_body.gd _gait 끝부분)
    for (const tag of ['L', 'R']) {
      const L = LEG[tag], goal = tv.copy(tag === 'L' ? P.aL : P.aR), pole = tv2.copy(tag === 'L' ? P.pL : P.pR);
      const start = L.a.p.copy(L.hip).sub(midRest).applyQuaternion(P.hq).add(P.hp);
      const dir = tv3.copy(goal).sub(start); const far = dir.length(); dir.normalize();
      const dist = clamp(far, Math.abs(L.l1 - L.l2) + 0.001, L.l1 + L.l2 - 0.001);
      goal.copy(start).addScaledVector(dir, dist);
      pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      const reach = (L.l1 * L.l1 + dist * dist - L.l2 * L.l2) / (2 * dist);
      const knee = L.b.p.copy(start).addScaledVector(dir, reach).addScaledVector(pole, Math.sqrt(Math.max(0, L.l1 * L.l1 - reach * reach)));
      L.a.q.setFromUnitVectors(L.d1, tv3.copy(knee).sub(start).normalize()).multiply(L.a.rq);
      L.b.q.setFromUnitVectors(L.d2, tv3.copy(goal).sub(knee).normalize()).multiply(L.b.rq);
      L.e.p.copy(goal); L.e.q.copy(tag === 'L' ? P.fL : P.fR).multiply(L.e.rq);
      // 엉덩이 뼈: 골반과 허벅지의 중간만큼 돌아 엉덩이가 꺼지지 않게 (hq_body.gd _seats)
      if (L.seat) { const dt = tq.copy(L.a.q).multiply(tq2.copy(L.a.rq).invert()); L.seat.q.copy(P.hq).slerp(dt, 0.5).multiply(L.seat.rq); L.seat.p.copy(L.a.p); }
    }
    // 모델 공간 → 뼈마다의 자리
    for (const b of order) {
      if (!b.parent) { b.bone.position.copy(b.p); b.bone.quaternion.copy(b.q); continue; }
      const pb = B[b.parent], inv = tq.copy(pb.q).invert();
      b.bone.quaternion.copy(inv).multiply(b.q);
      b.bone.position.copy(b.p).sub(pb.p).applyQuaternion(inv);
    }
  }

  /* ── 상태 ── */
  const st = {
    mode: 'seated',            // seated → rising → walking(무대로) → active → walking(집으로) → sitting → seated
    up: 0,                     // 0 앉음 … 1 섬
    active: false, home: null, homeYaw: 0, floorDrop: 0,
    clock: 0, stepClock: 0, amount: 0, turnStep: 0, drop: 0, lastBeat: 0,
    walk: null,                // { x, z, face, done }
    act: null, actQueue: 0, nextIdle: 6, clickN: 0,
    mood: 'smile', moodUntil: 0, calm: 'smile', calmLeft: 4,
    cur: Object.fromEntries(KEYS.map(k => [k, BASE[k] || 0])),
    blinkIn: rnd(1.5, 4), blinkT: -1, flap: 0, voice: null, talkUntil: 0, said: '',
    arm: [0, 0, -0.1, 0.34, 0, 0, 0.1, 0.34], sp: [0, 0, 0], hd: [0, 0, 0],
    lookYaw: 0, lookPitch: 0, headTop: 0.96, now: 0,
  };
  const seatP = mkPose(), standP = mkPose(), P = mkPose();

  // 앉은 자세: 방석(7 cm) 위에 엉덩이, 두 다리는 앞으로 뻗어 탁자 밑에, 손은 허벅지 위
  function seatedPose(o, t) {
    const breathe = Math.sin(t * 1.7), floor = -st.floorDrop / SCALE;
    o.hp.set(0.012 * Math.sin(t * 0.55), 0.215 + breathe * 0.006, 0.06);
    qe(0.2, 0, Math.sin(t * 0.55) * 0.012, o.hq);
    o.aL.set(-0.2, floor + 0.115, -1.0); o.aR.set(0.17, floor + 0.115, -1.035);
    qe(1.15 + 0.05 * Math.sin(t * 0.8), 0.28, 0, o.fL); qe(1.15 + 0.05 * Math.sin(t * 0.8 + 1.3), -0.22, 0, o.fR);
    o.pL.set(-0.25, 1, -0.1); o.pR.set(0.25, 1, -0.1);
    const sway = Math.sin(t * 0.9) * 0.03;
    o.arm[0] = 0.62 + sway; o.arm[1] = -0.1; o.arm[2] = -0.1 - 0.02 * breathe; o.arm[3] = 0.62;
    o.arm[4] = 0.62 - sway; o.arm[5] = 0.1; o.arm[6] = 0.1 + 0.02 * breathe; o.arm[7] = 0.62;
    o.sp[0] = 0.42 + breathe * 0.02; o.sp[1] = 0; o.sp[2] = 0;
    o.hd[0] = 0; o.hd[1] = -0.04; o.hd[2] = 0;
  }

  // 선 자세·걸음: explorer.gd _animate_figure(팔·숨) + hq_body.gd _gait(발 딛기·골반), 달리기·웅크리기 뺀 것
  function standingPose(o, t, dt) {
    const amount = st.amount, legs = Math.max(amount, 0.75 * st.turnStep), phase = st.stepClock / TAU, turn = TAU * phase;
    const stride = CYCLE * legs, beta = 0.62, walk = amount;
    const breathe = Math.sin(t * 1.7);
    const yawP = -0.1 * Math.cos(turn) * amount, list = -0.065 * Math.sin(turn + 0.25) * walk, sway = -0.035 * Math.sin(turn - 0.3) * walk;
    // 서 있을 때의 몸 전체 흔들림(figure): 발은 땅에 그대로
    const figZ = Math.sin(t * 0.55) * 0.008 * (1 - amount), figX = -0.015 * amount, figY = breathe * 0.012 * (1 - amount);
    const rot = qe(figX, yawP, list + figZ, o.hq);
    let need = 0;
    for (const tag of ['L', 'R']) {
      const L = LEG[tag], side = tag === 'L' ? -1 : 1, u = fposmod(phase - (tag === 'L' ? 0 : 0.5), 1);
      const ankleH = L.ankle.y, land = 0.4 * amount, push = 0.95 * amount, lead = stride * beta * 0.5;
      let along = 0, pitch = 0, lift = 0;
      if (u < beta) {
        along = lead - stride * u;
        if (u < 0.09) pitch = land * (1 - u / 0.09);
        else { const q = clamp((u - beta * 0.5) / (beta * 0.5), 0, 1); pitch = -push * q * q; }
      } else {
        const w = (u - beta) / (1 - beta), p0 = lead - stride * beta, slope = -stride * (1 - beta), w2 = w * w, w3 = w2 * w;
        along = (2 * w3 - 3 * w2 + 1) * p0 + (w3 - 2 * w2 + w) * slope + (-2 * w3 + 3 * w2) * lead + (w3 - w2) * slope;
        pitch = lerp(-push, land, sstep(0.2, 0.95, w));
        lift = 0.07 * legs * Math.sin(Math.PI * w);
      }
      const fx = side * lerp(half * 0.95, Math.max(half * 0.5, 0.08), amount), fz = L.ankle.z - along;   // 앞 = -Z
      // 발은 뒤꿈치(발끝 들 때)나 발끝(뒤꿈치 들 때)을 땅에 둔 채 돈다
      const pz = fz + (pitch > 0 ? L.heel : -L.toe), c = Math.cos(pitch), s = Math.sin(pitch);
      const ry = ankleH, rzz = fz - pz;
      const goal = (tag === 'L' ? o.aL : o.aR).set(fx, ry * c - rzz * s + lift, pz + ry * s + rzz * c);
      qe(pitch, 0, 0, tag === 'L' ? o.fL : o.fR);
      (tag === 'L' ? o.pL : o.pR).set(side * 0.06, 0, -1);
      // 이 다리가 닿으려면 골반이 얼마나 내려와야 하나(다리를 끝까지 펴지는 않음)
      const joint = tv.copy(L.hip).sub(midRest).applyQuaternion(rot).add(midRest); joint.x += sway;
      const vx = goal.x - joint.x, vy = goal.y - joint.y, vz = goal.z - joint.z;
      const most = (L.l1 + L.l2) * 0.996, can = Math.sqrt(Math.max(0, most * most - vx * vx - vz * vz));
      need = Math.max(need, -vy - can);
    }
    need = Math.max(need, 0) + 0.006;
    st.drop = lerp(st.drop, need, 1 - Math.exp(-(need < st.drop ? 12 : 40) * dt));
    o.hp.set(midRest.x + sway, midRest.y - st.drop + figY, midRest.z);
    // 팔: 다리와 반대로, 다리 박자보다 조금 늦게 흔들리고, 서 있을 때는 느리게 조금 (explorer.gd)
    const sC = Math.cos(st.stepClock), late = Math.cos(st.stepClock - 0.3), later = Math.cos(st.stepClock - 0.85);
    const armAmp = 0.34 * amount, idleSway = Math.sin(t * 0.9) * 0.05 * (1 - amount);
    const armL = -late * armAmp - 0.03 * amount + idleSway, armR = late * armAmp - 0.03 * amount - idleSway;
    const foldL = (0.5 - 0.5 * later) * 0.34 * amount, foldR = (0.5 + 0.5 * later) * 0.34 * amount;
    const inward = 0.16 * amount, out = 0.1 + 0.02 * breathe * (1 - amount), elbow = 0.22 + 0.12 * (1 - amount);
    o.arm[0] = armL; o.arm[1] = -inward; o.arm[2] = -out; o.arm[3] = elbow + foldL + Math.max(0, armL) * 0.2;
    o.arm[4] = armR; o.arm[5] = inward; o.arm[6] = out; o.arm[7] = elbow + foldR + Math.max(0, armR) * 0.2;
    // 가슴은 골반과 반대로 돌고, 머리는 정면을 지킨다
    const yawC = 0.07 * Math.cos(turn) * amount;
    o.sp[0] = breathe * 0.015 * (1 - amount); o.sp[1] = (yawC - yawP); o.sp[2] = -list;
    o.hd[0] = -yawC * 0.84 + Math.sin(t * 0.37) * 0.18 * (1 - amount); o.hd[1] = 0; o.hd[2] = 0;
    void sC;
  }
  const CYCLE = 1.9;                    // 한 걸음 주기(왼발+오른발)에 가는 거리, 모델 단위
  const WALK_SPEED = 0.8 / SCALE;       // 걷는 빠르기, 모델 단위/초 (0.8 m/s)

  /* ── 소리 ── */
  const sfx = (name, volume = 0.5) => { try { ctx.playAudio(base + 'sfx/' + name + '.wav', { volume }); } catch {} };
  function speak(kind, mood) {
    const pool = SAYS[kind] || SAYS.smile;
    let pickd = pool[Math.floor(Math.random() * pool.length)];
    if (pickd[1] === st.said && pool.length > 1) pickd = pool[(pool.indexOf(pickd) + 1) % pool.length];
    st.said = pickd[1];
    if (st.voice) { try { st.voice.pause(); } catch {} }
    st.voice = ctx.playAudio(base + 'voice/' + pickd[0] + '.mp3', { volume: 0.95 }) || null;
    const ms = 2000 + 60 * pickd[1].length;       // hero_face.gd note(): 글이 길수록 오래
    st.talkUntil = st.now + ms / 1000 * 0.75;
    if (st.voice) { st.voice.addEventListener('ended', () => { st.talkUntil = 0; }, { once: true }); st.voice.addEventListener('playing', () => { st.talkUntil = st.now + 30; }, { once: true }); }
    ctx.subtitle(pickd[1], ms + 700);
    setMood(mood || kind, ms / 1000 + 0.6);
    return ms / 1000;
  }
  const talking = () => st.now < st.talkUntil && (!st.voice || !st.voice.ended);
  function setMood(m, secs) { if (!MOODS[m]) m = 'smile'; st.mood = m; st.moodUntil = st.now + secs; }

  /* ── 몸짓: 팔·등·머리의 "가고 싶은 값"을 덮어쓴다(관절은 게임처럼 부드럽게 따라간다) ── */
  const env = (tau, dur, i = 0.25, o = 0.35) => sstep(0, i, tau) * (1 - sstep(dur - o, dur, tau));
  const setArm = (T, k, side, x, y, z, e) => { const i = side === 'L' ? 0 : 4; T.arm[i] = lerp(T.arm[i], x, k); T.arm[i + 1] = lerp(T.arm[i + 1], y, k); T.arm[i + 2] = lerp(T.arm[i + 2], z, k); T.arm[i + 3] = lerp(T.arm[i + 3], e, k); };
  const ACTS = {
    wave: { dur: 2.2, fn(T, tau, k) { setArm(T, k, 'R', 2.75, 0, 0.35 + 0.3 * Math.sin(tau * 10), 0.25); T.hd[2] = lerp(T.hd[2], 0.12, k); } },
    // hook_band.gd: 두 팔을 번쩍 들고 번갈아 흔들기
    cheer: { dur: 2.4, fn(T, tau, k) { const sw = Math.sin(tau * 7) * 0.35; setArm(T, k, 'R', 2.9 + sw, 0, 0.1, 0.2); setArm(T, k, 'L', 2.9 - sw, 0, -0.1, 0.2); T.hop = 0.03 * k * Math.abs(Math.sin(tau * 7)); } },
    stretch: { dur: 3.4, fn(T, tau, k) { setArm(T, k, 'R', 3.0, 0, 0.3, 0.1); setArm(T, k, 'L', 3.0, 0, -0.3, 0.1); T.sp[0] = lerp(T.sp[0], -0.28, k); T.hd[1] = lerp(T.hd[1], 0.3, k); T.sp[2] = lerp(T.sp[2], 0.12 * Math.sin(tau * 1.6), k); } },
    clap: { dur: 2.0, fn(T, tau, k) { const c = 0.16 * Math.max(0, Math.sin(tau * 17)); setArm(T, k, 'L', 1.0, -0.42 - c, -0.02, 1.15); setArm(T, k, 'R', 1.0, 0.42 + c, 0.02, 1.15); } },
    love: { dur: 2.6, fn(T, tau, k) { setArm(T, k, 'L', 0.55, -0.75, -0.05, 2.0); setArm(T, k, 'R', 0.55, 0.75, 0.05, 2.0); T.hd[2] = lerp(T.hd[2], 0.16 * Math.sin(tau * 2.2), k); T.sp[2] = lerp(T.sp[2], 0.06 * Math.sin(tau * 2.2), k); } },
    eat: { dur: 2.6, fn(T, tau, k) { setArm(T, k, 'R', 0.75, 0.5, 0.05, 2.15 + 0.12 * Math.sin(tau * 9)); T.hd[1] = lerp(T.hd[1], -0.1 + 0.05 * Math.sin(tau * 9), k); T.chew = k; } },
    wow: { dur: 2.2, fn(T, tau, k) { setArm(T, k, 'L', 0.75, 0, -0.55, 1.5); setArm(T, k, 'R', 0.75, 0, 0.55, 1.5); T.sp[0] = lerp(T.sp[0], -0.14, k); T.hd[1] = lerp(T.hd[1], 0.12, k); } },
    sad: { dur: 2.8, fn(T, tau, k) { T.hd[1] = lerp(T.hd[1], -0.42, k); T.sp[0] = lerp(T.sp[0], T.sp[0] + 0.22, k); T.lookK = 1 - k; } },
    laugh: { dur: 2.2, fn(T, tau, k) { const b = Math.sin(tau * 15); T.sp[0] = lerp(T.sp[0], T.sp[0] - 0.08 + 0.05 * b, k); T.hd[1] = lerp(T.hd[1], 0.14 + 0.04 * b, k); T.hop = 0.012 * k * Math.max(0, b); setArm(T, k * 0.6, 'R', 0.9, 0.55, 0.05, 2.0); } },
    look: { dur: 4.2, fn(T, tau, k) { const y = Math.sin(tau * 1.5) * 0.85; T.hd[0] = lerp(T.hd[0], y, k); T.sp[1] = lerp(T.sp[1], y * 0.35, k); T.lookK = 1 - k; } },
    shy: { dur: 2.6, fn(T, tau, k) { setArm(T, k, 'L', -0.25, 0.3, -0.05, 0.5); setArm(T, k, 'R', -0.25, -0.3, 0.05, 0.5); T.hd[1] = lerp(T.hd[1], -0.18, k); T.hd[2] = lerp(T.hd[2], 0.14, k); T.sp[1] = lerp(T.sp[1], 0.12 * Math.sin(tau * 2.4), k); T.lookK = 1 - 0.6 * k; } },
  };
  for (const kind in MOTIONS) {
    // tool_motions.gd apply(): 열쇠 사이를 부드럽게 잇고, 오른팔·팔꿈치·가슴·왼팔에 넣는다 (세 번 되풀이)
    const M = MOTIONS[kind], reps = 3, gap = 0.25, one = M.time * 1.6 + gap;
    ACTS[kind] = { dur: one * reps, raw: true, fn(T, tau) {
      const n = Math.min(reps - 1, Math.floor(tau / one)), local = (tau - n * one) / (M.time * 1.6), t = clamp(local, 0, 1), keys = M.keys;
      if (local >= M.hit && this.hitN !== n) { this.hitN = n; sfx('whoosh', 0.35); }
      let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
      const a = keys[i], b = keys[i + 1]; let u = clamp((t - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1); u = u * u * (3 - 2 * u);
      const p = []; for (let j = 1; j < a.length; j++) p.push(lerp(a[j], b[j], u));
      T.arm[4] = p[0]; T.arm[5] = p[1]; T.arm[6] = p[2]; T.arm[7] = p[3]; T.arm[0] = p[7]; T.sp[1] = p[5]; T.sp[0] = p[6]; T.fast = true;
    }, start() { this.hitN = -1; } };
  }
  function startAct(name, mood, moodSecs) {
    const a = ACTS[name]; if (!a) return;
    st.act = { name, a, t: 0 }; a.start?.();
    if (mood) setMood(mood, moodSecs || a.dur + 0.3);
  }

  /* ── 걷기: 목표까지 돌아서고 → 걸어가고 → 마지막에 볼 쪽으로 돌아선다 ── */
  function walkTo(x, z, face, done) { st.walk = { x, z, face, done, back: null }; st.mode = 'walking'; }
  function stepWalk(dt) {
    const w = st.walk, dx = w.x - root.position.x, dz = w.z - root.position.z, dist = Math.hypot(dx, dz);
    const arrived = dist < 0.035;
    // 가까운 뒤쪽이면 돌아서지 않고 뒷걸음으로 간다(게임의 뒷걸음: 걸음 박자가 거꾸로 돈다)
    if (w.back === null) w.back = !arrived && dist < 1.3 && Math.abs(angDiff(root.rotation.y, Math.atan2(dx, dz))) > 1.9;
    const way = w.back ? -1 : 1;
    const wantYaw = arrived ? w.face : Math.atan2(dx * way, dz * way), err = angDiff(root.rotation.y, wantYaw);
    const turnRate = clamp(err * 6, -3.2, 3.2);
    root.rotation.y += turnRate * dt;
    const go = !arrived && Math.abs(err) < 0.55;
    st.amount = lerp(st.amount, go ? Math.min(1, 0.35 + dist * 2.2) * (w.back ? 0.7 : 1) : 0, 1 - Math.exp(-dt * (go ? 5 : 9)));
    const turning = !go && Math.abs(err) > 0.12;
    st.turnStep = clamp(st.turnStep + (turning ? 1 : -1) * dt * 6, 0, 1);
    const rate = WALK_SPEED / CYCLE;
    if (st.amount > 0.02) {
      const v = WALK_SPEED * SCALE * st.amount, move = Math.min(dist, v * dt) * way;
      root.position.x += Math.sin(root.rotation.y) * move; root.position.z += Math.cos(root.rotation.y) * move;
      st.stepClock += rate * TAU * dt * way;
    } else if (st.turnStep > 0.02) st.stepClock += TAU * 1.5 * dt;
    else {
      // 멈추면 두 발이 땅에 놓이는 박자까지만 더 간다
      const q = fposmod(st.stepClock / TAU, 0.5);
      if (q > 0.04 && q < 0.46) st.stepClock += TAU * 1.2 * dt;
    }
    const beat = Math.sign(Math.sin(st.stepClock));
    if ((st.amount > 0.3 || st.turnStep > 0.5) && beat !== st.lastBeat) { st.lastBeat = beat; sfx('step_deck_' + (1 + Math.floor(Math.random() * 4)), st.amount > 0.3 ? 0.22 : 0.1); }
    // 방석(7 cm)에서 내려서기/올라서기
    const fromHome = Math.hypot(root.position.x - st.home.x, root.position.z - st.home.z);
    root.position.y = st.home.y * (1 - sstep(0.22, 0.42, fromHome));
    if (arrived && Math.abs(err) < 0.04 && st.amount < 0.05) {
      root.position.x = w.x; root.position.z = w.z; root.rotation.y = w.face; st.walk = null; st.turnStep = 0; st.mode = 'active';
      w.done?.();
    }
  }
  const spot = (lx, lz) => { const c = Math.cos(st.homeYaw), s = Math.sin(st.homeYaw); return [st.home.x + lx * c + lz * s, st.home.z - lx * s + lz * c]; };
  const faceCam = (x, z) => Math.atan2(ctx.camera.position.x * 0.35 - x, 2.2 - z);
  const STAGE = [-0.1, -0.72], SIDE = [-0.85, -0.8];
  function goStage(then) { const [x, z] = spot(...STAGE); walkTo(x, z, faceCam(x, z), then); }

  // 켜진 동안 클릭할 때마다 다음 상호작용 (말 + 표정 + 몸짓)
  const CLICKS = [
    () => { speak('smile', 'smile'); startAct('wave'); },
    () => { startAct('stretch', 'yawn', 2.6); setTimeout(() => st.active && speak('idle', 'sleepy'), 900); },
    () => { speak('wink', 'wink'); startAct('cheer'); },
    () => { setMood('smile', 9); const [x, z] = spot(...SIDE); walkTo(x, z, faceCam(x, z), () => { startAct('look', 'neutral'); st.after = () => goStage(() => speak('neutral', 'neutral')); }); },
    () => { speak('surprised', 'surprised'); startAct('wow'); },
    () => { startAct('chop', 'angry'); st.after = () => speak('grin', 'grin'); },
    () => { speak('shy', 'shy'); startAct('shy'); },
    () => { startAct('slash', 'neutral'); st.after = () => { startAct('punch', 'angry'); st.after = () => { speak('fond', 'fond'); startAct('love'); }; }; },
    () => { speak('sad', 'sad'); startAct('sad'); },
    () => { speak('grin', 'grin'); startAct('laugh'); },
  ];

  /* ── 매 프레임 ── */
  const camLocal = new V3();
  function update(dt, t, state) {
    st.now = t;
    if (!st.home) { st.home = root.position.clone(); st.homeYaw = root.rotation.y; st.floorDrop = st.home.y; }
    st.clock += dt;
    const T = st.clock;
    // 일어서기/앉기
    if (st.mode === 'rising') { st.up = Math.min(1, st.up + dt / 1.25); if (st.up >= 1) { st.mode = 'active'; if (st.active) goStage(() => { if (st.active) { speak('hello', 'smile'); startAct('wave'); } }); else sitDown(); } }
    else if (st.mode === 'sitting') { st.up = Math.max(0, st.up - dt / 1.35); if (st.up <= 0) { st.mode = 'seated'; if (st.active) standUp(); } }
    else if (st.mode === 'walking') stepWalk(dt);
    else if (st.mode === 'active') {
      st.amount = lerp(st.amount, 0, 1 - Math.exp(-dt * 9)); st.turnStep = Math.max(0, st.turnStep - dt * 6);
      if (!st.active) sitDown();
      else if (!st.act) {
        // 가만히 서 있을 때: 가끔 둘러보거나 기지개(말없이)
        st.nextIdle -= dt;
        if (st.nextIdle <= 0) { st.nextIdle = rnd(9, 16); startAct(Math.random() < 0.6 ? 'look' : 'stretch', Math.random() < 0.5 ? 'neutral' : 'smile', 3); }
      }
    }
    // 자세 섞기
    const w = sstep(0, 1, st.up);
    if (st.up < 1) seatedPose(seatP, T);
    if (st.up > 0) standingPose(standP, T, dt);
    if (st.up <= 0) mixPose(P, seatP, seatP, 0); else if (st.up >= 1) mixPose(P, standP, standP, 0);
    else {
      mixPose(P, seatP, standP, w);
      // 일어서는 중: 몸을 앞으로 숙여 무게를 발 위로 옮기고, 손으로 무릎을 짚는다
      const hump = Math.sin(Math.PI * w);
      P.sp[0] += 0.75 * hump; P.hp.z -= 0.2 * hump; P.hd[1] += 0.25 * hump;
      P.arm[0] += 0.35 * hump; P.arm[4] += 0.35 * hump; P.arm[3] += 0.3 * hump; P.arm[7] += 0.3 * hump;
    }
    // 바라보기: 머리가 lookTarget 쪽으로 (몸 기준 좌우·위아래), 게임의 느린 머리 흔들림은 그 위에 조금
    P.hop = 0; P.chew = 0; P.lookK = 1; P.fast = false;
    if (state && state.lookTarget) {
      camLocal.copy(state.lookTarget); root.worldToLocal(camLocal);
      const hy = st.headTop - 0.14, yaw = Math.atan2(camLocal.x, camLocal.z), pitch = Math.atan2(camLocal.y - hy, Math.hypot(camLocal.x, camLocal.z));
      st.lookYaw = lerp(st.lookYaw, clamp(yaw, -1.15, 1.15), 1 - Math.exp(-dt * 5));
      st.lookPitch = lerp(st.lookPitch, clamp(pitch, -0.6, 0.5), 1 - Math.exp(-dt * 5));
    }
    const drift = Math.sin(T * 0.37) * 0.18;
    const baseHd0 = P.hd[0];
    // 몸짓
    if (st.act) {
      const A = st.act; A.t += dt;
      const k = A.a.raw ? 1 : env(A.t, A.a.dur);
      A.a.fn(P, A.t, k);
      if (A.t >= A.a.dur) { st.act = null; const after = st.after; st.after = null; after?.(); }
    }
    const lk = P.lookK * (st.mode === 'walking' ? 0.35 : 1);
    // 모델은 -Z 를 보므로 왼쪽(+yaw)이 바깥 묶음의 -x 쪽
    P.hd[0] += (-st.lookYaw * 0.8 + drift * 0.35 - (st.up >= 1 ? baseHd0 * 0 : 0)) * lk;
    P.hd[1] += st.lookPitch * 0.8 * lk;
    P.sp[1] += -st.lookYaw * 0.22 * lk;
    // 관절은 목표를 부드럽게 따라간다 (explorer.gd: k = 1 - exp(-16·dt))
    const kk = 1 - Math.exp(-(P.fast ? 40 : 11) * dt), kh = 1 - Math.exp(-8 * dt);
    for (let i = 0; i < 8; i++) st.arm[i] = lerp(st.arm[i], P.arm[i], kk);
    for (let i = 0; i < 3; i++) { st.sp[i] = lerp(st.sp[i], P.sp[i], kk); st.hd[i] = lerp(st.hd[i], P.hd[i], kh); }
    for (let i = 0; i < 8; i++) P.arm[i] = st.arm[i];
    for (let i = 0; i < 3; i++) { P.sp[i] = st.sp[i]; P.hd[i] = st.hd[i]; }
    P.hp.y += P.hop / SCALE;
    applyPose(P);
    st.headTop = lerp(st.headTop, (headB.p.y + HEAD_TOP) * SCALE, 1 - Math.exp(-dt * 10));
    hit.scale.y = st.headTop; hit.position.y = st.headTop / 2;
    updateFace(dt, T, state);
  }

  // 표정: hero_face.gd _process (부드럽게 바뀜 · 눈 깜빡임 · 말할 때 입)
  function updateFace(dt, T, state) {
    let mood = st.mood;
    if (st.now > st.moodUntil) {
      // 아무 일 없을 때: 미소 ↔ 기본을 말없이 오간다(hero_face.gd _think 끝부분), 영상을 볼 때는 미소
      st.calmLeft -= dt;
      if (st.calmLeft <= 0) { st.calm = st.calm === 'smile' ? 'neutral' : 'smile'; st.calmLeft = rnd(4, 9); }
      mood = state && state.phase === 'playing' ? 'smile' : st.calm;
    }
    const want = MOODS[mood] || {}, k = clamp(dt * 12, 0, 1), c = st.cur;
    for (const key of KEYS) c[key] = lerp(c[key], want[key] ?? BASE[key] ?? 0, k);
    let blink = 0;
    st.blinkIn -= dt;
    if (st.blinkIn <= 0 && st.blinkT < 0) st.blinkT = 0;
    if (st.blinkT >= 0) {
      st.blinkT += dt;
      blink = st.blinkT < 0.16 ? clamp(1 - Math.abs(st.blinkT - 0.08) / 0.08, 0, 1) : 0;
      blink = Math.max(blink, st.blinkT > 0.06 && st.blinkT < 0.1 ? 1 : 0);
      if (st.blinkT > 0.18) { st.blinkT = -1; st.blinkIn = Math.random() > 0.15 ? rnd(2, 5.5) : 0.25; }
    }
    let talk = 0;
    if (talking()) { st.flap += dt * 13; talk = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(st.flap) * Math.sin(st.flap * 0.53 + 1)); }
    else if (P.chew > 0.3) { st.flap += dt * 9; talk = 0.12 + 0.14 * (0.5 + 0.5 * Math.sin(st.flap)); }
    U.uLid.value.set(Math.max(c.lid_r, blink), Math.max(c.lid_l, blink));
    U.uHappy.value.set(c.hap_r, c.hap_l);
    U.uTilt.value = c.tilt; U.uUnder.value = c.under; U.uSmile.value = c.smile;
    U.uOpenM.value = clamp(c.open + talk, 0, 1); U.uRoundM.value = c.round * (1 - talk);
    U.uMouthMix.value = Math.max(c.mix, talk > 0 ? 1 : 0); U.uBlush.value = c.blush; U.uBrowUp.value = c.brow_up;
  }

  function standUp() { if (st.mode === 'seated' || st.mode === 'sitting') { st.mode = 'rising'; sfx('leather_1', 0.4); } }
  function sitDown() {
    st.act = null; st.after = null;
    if (!st.home) return;
    const away = Math.hypot(root.position.x - st.home.x, root.position.z - st.home.z) > 0.05 || Math.abs(angDiff(root.rotation.y, st.homeYaw)) > 0.05;
    if (away) walkTo(st.home.x, st.home.z, st.homeYaw, () => { st.mode = 'sitting'; sfx('leather_2', 0.4); });
    else { st.mode = 'sitting'; sfx('leather_2', 0.4); }
  }

  const REACT = { laugh: ['laugh', 'grin'], wow: ['wow', 'surprised'], clap: ['clap', 'smile'], love: ['love', 'fond'], sad: ['sad', 'sad'], eat: ['eat', 'smile'], cheer: ['cheer', 'grin'] };
  const api = {
    root,
    get headHeight() { return st.headTop; },
    update,
    react(kind) { const r = REACT[kind] || REACT.clap; if (st.mode === 'walking' || st.mode === 'rising' || st.mode === 'sitting') { setMood(r[1], 2.5); return; } st.after = null; startAct(r[0], r[1]); },
    setActive(on) {
      st.active = !!on;
      if (on) { st.nextIdle = rnd(7, 11); if (st.mode === 'seated') standUp(); else if (st.mode === 'walking' && st.home) goStage(() => { if (st.active) { speak('hello', 'smile'); startAct('wave'); } }); }
      else { if (st.voice) { try { st.voice.pause(); } catch {} } st.talkUntil = 0; st.moodUntil = 0; if (st.mode === 'active' || st.mode === 'walking') sitDown(); }
    },
    onClick() {
      if (!st.active || st.mode !== 'active') return;
      st.after = null; st.nextIdle = rnd(9, 14);
      CLICKS[st.clickN++ % CLICKS.length]();
    },
    // 점검·사진용: 표정/몸짓/대사를 바로 시킨다
    debug: { st, U, startAct, speak, setMood, MOODS, ACTS, moods: Object.keys(MOODS) },
  };
  // 첫 자세를 바로 잡아 둔다(첫 프레임에 T 자세가 보이지 않게)
  seatedPose(P, 0); for (let i = 0; i < 8; i++) st.arm[i] = P.arm[i]; for (let i = 0; i < 3; i++) { st.sp[i] = P.sp[i]; st.hd[i] = P.hd[i]; }
  applyPose(P);
  return api;
}
