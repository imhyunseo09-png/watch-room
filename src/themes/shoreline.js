// 그림체 "SHORELINE 정거장" — 같은 방(바닥·벽·탁자·방석·노트북·마우스는 그 자리)을 게임 속 정거장 시장의
// "장비 상점" 앞처럼 보이게 바꾼다.
//   색     : station/exterior_style.gd 의 작은 팔레트(크림 벽 · 초록 바닥 · 남색 철물 · 주황 · 금색)
//   칠 느낌 : 같은 파일의 무광 + 빛이 모서리를 감싸는 확산(lambert wrap) + 만화식 반짝임(toon) + 가장자리 빛(rim 0.35)
//   빛·공기 : station/station_build.gd _space (AgX 노출 1.2 · 어두운 안개 · 대비) + station/indoors.gd 의 따뜻한 실내 채움빛
//   필름   : shaders/screen_film.gdshader (모서리 어둡게 0.16 · 고운 알갱이)
// 앱이 enter 전에 아늑한 방으로 되돌려 주므로 여기서는 바꿀 것만 바꾸고, exit 에서 더한 것·고친 것을 모두 되돌린다.

const PAL = {
  CREAM: [0.80, 0.77, 0.68], PALE: [0.66, 0.68, 0.64], GREEN: [0.18, 0.44, 0.37], NAVY: [0.10, 0.15, 0.20],
  ORANGE: [0.88, 0.45, 0.12], GOLD: [0.78, 0.60, 0.26],
  TEAL: [0.07, 0.20, 0.19], PANEL: [0.22, 0.44, 0.36], BOX: [0.72, 0.60, 0.42], WOOD: [0.50, 0.33, 0.20], SEAM: [0.52, 0.45, 0.33],
};

/* ── 게임의 칠 느낌을 three.js 표준 재질에 얹는다 (직접 빛 계산만 바꿈) ── */
const GAME_LIGHT = /* glsl */`
void RE_Direct_Shoreline( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  float r = max( roughness, 0.72 );
  float nl = dot( geometryNormal, directLight.direction );
  // 빛이 모서리를 감싸는 확산 (Godot DIFFUSE_LAMBERT_WRAP)
  float wrap = max( 0.0, ( nl + r ) / ( ( 1.0 + r ) * ( 1.0 + r ) ) );
  vec3 lit = directLight.color * wrap;
  // 만화식 반짝임 (Godot SPECULAR_TOON): 넓고 옅은 한 덩어리
  vec3 R = reflect( - directLight.direction, geometryNormal );
  float mid = ( 1.0 - r ) * ( 1.0 - r );
  lit += directLight.color * smoothstep( mid - r * 0.5, mid + r * 0.5, dot( R, geometryViewDir ) ) * mid * step( 0.0, nl + r );
  // 가장자리 빛 (rim 0.35, tint 0.6)
  float rim = pow( max( 1e-4, 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ) ), ( 1.0 - r ) * 16.0 ) * 0.35;
  lit += rim * mix( vec3( 1.0 ), material.diffuseColor, 0.6 ) * directLight.color * saturate( nl * 0.5 + 0.5 );
  reflectedLight.directDiffuse += lit * material.diffuseColor * RECIPROCAL_PI;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Shoreline
`;
// 게임의 판 그림(고무·에나멜)은 세계 좌표로 입혀져 어디에나 고운 알갱이와 얼룩이 있다: 같은 것을 세계 좌표 잡음으로 만든다
const GRAIN_PARS = /* glsl */`
varying vec3 vGrainPos;
float gHash( vec3 p ) { p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) ); p += dot( p, p.yzx + 33.33 ); return fract( ( p.x + p.y ) * p.z ); }
float gNoise( vec3 p ) {
  vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( gHash( i ), gHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( gHash( i + vec3( 0, 1, 0 ) ), gHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( gHash( i + vec3( 0, 0, 1 ) ), gHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( gHash( i + vec3( 0, 1, 1 ) ), gHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float gGrain() {
  float px = length( fwidth( vGrainPos ) );                       // 화면 한 점이 덮는 길이: 그보다 고운 알갱이는 흐려서 반짝이지 않게
  float fine = ( gHash( floor( vGrainPos / 0.004 ) ) - 0.5 ) * clamp( 0.004 / ( px * 1.2 ), 0.0, 1.0 );
  float mid = ( gNoise( vGrainPos / 0.012 ) - 0.5 ) * clamp( 0.012 / ( px * 1.5 ), 0.0, 1.0 );
  float blot = gNoise( vGrainPos / 0.11 ) - 0.5 + 0.5 * ( gNoise( vGrainPos / 0.37 ) - 0.5 );
  float k = 1.0 + GRAIN_FINE * fine + GRAIN_FINE * 0.8 * mid + GRAIN_BLOT * blot;
  // 면 안의 부드러운 명암(게임의 구석 그늘·등에서 멀어질수록 어두워짐을 싸게 흉내):
  float y = vGrainPos.y, onFloor = 1.0 - step( 0.003, y );
  k *= 1.0 - 0.30 * exp( - max( y, 0.0 ) / 0.2 ) * ( 1.0 - onFloor );                    // 바닥 가까이는 어둡게(닿는 자리의 그늘)
  k *= 1.0 - 0.10 * smoothstep( 1.2, 2.6, y );                                           // 위로 갈수록 조금 어둡게
  float d = length( vGrainPos.xz - vec2( - 0.3, - 0.3 ) );
  k *= 1.0 - onFloor * 0.34 * smoothstep( 1.0, 4.2, d );                                 // 바닥: 등에서 멀수록 어둡게
  k *= 1.0 - onFloor * 0.40 * exp( - max( vGrainPos.z + 1.5, 0.0 ) / 0.16 );             // 바닥: 벽·계산대 밑의 그늘
  k *= 1.0 + 0.16 * ( gNoise( vGrainPos / 1.1 + 7.3 ) - 0.5 );                           // 아주 큰 얼룩 없는 완만한 밝기 차
  vec2 e = abs( vGUv * 2.0 - 1.0 );
  k *= 1.0 - 0.13 * ( pow( e.x, 5.0 ) + pow( e.y, 5.0 ) );                               // 면의 가장자리·모서리 쪽이 조금 어둡다
  #ifdef EDGE_HI
    k *= 0.9 + 0.14 * vGUv.y;                                                            // 상자: 아래가 조금 어둡고
    k *= 1.0 + 0.26 * smoothstep( 0.9, 0.96, max( e.x, e.y ) );                          // 모서리(깎인 턱)에 밝은 선
  #endif
  return k;
}
`;
const mkPatch = (fine, blot, edge) => sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrainPos; varying vec2 vGUv;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvGrainPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; vGUv = uv;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + (edge ? '#define EDGE_HI\n' : '') + '#define GRAIN_FINE ' + fine.toFixed(3) + '\n#define GRAIN_BLOT ' + blot.toFixed(3) + '\nvarying vec2 vGUv;\n' + GRAIN_PARS)
    .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= gGrain();')
    .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + GAME_LIGHT);
};
const gamePatch = mkPatch(0.11, 0.0), floorPatch = mkPatch(0.17, 0.03), propPatch = mkPatch(0.13, 0.05, true);     // 고르고 옅은 알갱이(바닥은 조금 더), 상자는 모서리 밝은 선
const gameKey = () => 'shoreline-station-paint-4', floorKey = () => 'shoreline-station-floor-4', propKey = () => 'shoreline-station-prop-4';
function styleOn(m, floor) { m.onBeforeCompile = floor ? floorPatch : gamePatch; m.customProgramCacheKey = floor ? floorKey : gameKey; m.needsUpdate = true; }
function styleOff(m) { delete m.onBeforeCompile; delete m.customProgramCacheKey; m.needsUpdate = true; }

/* ── 화면 전체 후처리: AgX(노출 1.2) → 대비·채도 → 모서리 어둡게·알갱이 ── */
const POST = {
  uniforms: { uExposure: { value: 1.2 }, uContrast: { value: 1.0 }, uSaturation: { value: 1.0 }, uLift: { value: 0.045 }, uBloom: { value: 0.3 }, uCorners: { value: 0.16 }, uGrain: { value: 0.012 } },
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes;
    uniform float uExposure, uContrast, uSaturation, uLift, uCorners, uGrain, uBloom;
    varying vec2 vUv;
    vec3 agxContrast( vec3 x ) {
      vec3 x2 = x * x; vec3 x4 = x2 * x2;
      return + 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
    }
    vec3 agx( vec3 color ) {
      const mat3 toRec2020 = mat3( vec3( 0.6274, 0.0691, 0.0164 ), vec3( 0.3293, 0.9195, 0.0880 ), vec3( 0.0433, 0.0113, 0.8956 ) );
      const mat3 fromRec2020 = mat3( vec3( 1.6605, - 0.1246, - 0.0182 ), vec3( - 0.5876, 1.1329, - 0.1006 ), vec3( - 0.0728, - 0.0083, 1.1187 ) );
      const mat3 inset = mat3( vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ), vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ), vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 ) );
      const mat3 outset = mat3( vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ), vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ), vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 ) );
      const float minEv = - 12.47393; const float maxEv = 4.026069;
      color = inset * ( toRec2020 * color );
      color = clamp( ( log2( max( color, 1e-10 ) ) - minEv ) / ( maxEv - minEv ), 0.0, 1.0 );
      color = outset * agxContrast( color );
      color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
      return clamp( fromRec2020 * color, 0.0, 1.0 );
    }
    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
    void main() {
      vec3 hdr = texture2D( tDiffuse, vUv ).rgb;
      vec3 halo = vec3( 0.0 );
      for ( int i = 0; i < 40; i ++ ) {                               // 해바라기 씨 모양으로 고르게 40점: 고리도 잡음도 없는 부드러운 번짐
        float fi = float( i ) + 0.5;
        float rr = 26.0 * sqrt( fi / 40.0 ), a = fi * 2.39996;
        vec3 t = texture2D( tDiffuse, vUv + vec2( cos( a ), sin( a ) ) * rr / uRes ).rgb;
        halo += min( max( t - 1.2, 0.0 ), vec3( 1.6 ) ) * ( 1.0 - rr / 30.0 );   // 한 점이 지나치게 밝아도 번짐은 일정하게
      }
      hdr += halo * vec3( 0.82, 1.0, 1.06 ) * uBloom / 40.0;
      vec3 c = agx( hdr * uExposure );
      c = pow( c, vec3( 1.0 / 2.2 ) );                              // 여기부터 화면에 보이는 값으로 (게임의 보정이 이 값에서 이루어짐)
      c = mix( vec3( 0.5 ), c, uContrast );
      c = mix( vec3( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) ), c, uSaturation );
      c = c + uLift * vec3( 0.95, 1.0, 0.98 ) * ( 1.0 - c ) * ( 1.0 - c );       // 게임 실내의 뿌연 공기: 어두운 곳이 검정까지 내려가지 않는다
      vec2 q = ( vUv - 0.5 ) * vec2( 1.25, 1.0 );
      float edge = smoothstep( 0.3, 0.9, length( q ) * 1.3 );
      float g = hash( floor( gl_FragCoord.xy * 0.5 ) + vec2( fract( uTime * 7.0 ) * 37.0, fract( uTime * 3.0 ) * 53.0 ) ) - 0.5;
      c *= ( 1.0 - edge * uCorners ) * ( 1.0 + g * 2.0 * uGrain );
      gl_FragColor = vec4( pow( clamp( c, 0.0, 1.0 ), vec3( 2.2 ) ), 1.0 );   // 뒤의 출력 단계가 다시 화면 값으로 바꾼다
    }`,
};

// exterior_style.gd _paint 의 색 고르기 (색은 화면 값(sRGB)으로 따진다)
function snap(THREE, color) {
  const c = color.clone().convertLinearToSRGB(), hsv = {};
  const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b), sat = mx > 0 ? (mx - mn) / mx : 0;
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, out = new THREE.Color();
  if (sat > 0.3 && l > 0.06) {
    c.getHSL(hsv);
    const s2 = Math.min(0.78, Math.max(0.45, sat * 1.1)), v2 = Math.min(0.88, Math.max(0.38, mx));
    const h = hsv.h * 6, i = Math.floor(h), f = h - i, p = v2 * (1 - s2), q = v2 * (1 - s2 * f), t = v2 * (1 - s2 * (1 - f));
    const rgb = [[v2, t, p], [q, v2, p], [p, v2, t], [p, q, v2], [t, p, v2], [v2, p, q]][i % 6];
    return out.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
  }
  const pick = l > 0.52 ? PAL.CREAM : l > 0.36 ? PAL.PALE : l > 0.2 ? PAL.GREEN : PAL.NAVY;
  return out.setRGB(pick[0], pick[1], pick[2], THREE.SRGBColorSpace);
}

const S = { group: null, tex: {}, own: [], lights: [], styled: [], saved: null, hero: null };

function signTexture(THREE) {
  const c = document.createElement('canvas'); c.width = 1536; c.height = 224;
  const g = c.getContext('2d');
  g.fillStyle = '#081226'; g.fillRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgb(179,242,255)';           // 게임 간판 글씨 색 (0.7, 0.95, 1.0)
  g.font = '700 118px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  g.fillText('장비 상점', c.width / 2, 86);
  g.globalAlpha = 0.85; g.font = '600 44px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  g.fillText('연료 · 그물 · 보관소', c.width / 2, 180);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function glowTexture(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function labelTexture(THREE) {
  // 종이 상자 옆면의 주황 띠 딱지
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = 'rgb(184,153,107)'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = 'rgb(214,98,26)'; g.fillRect(26, 24, 76, 14);
  g.fillStyle = 'rgba(60,40,20,0.35)'; g.fillRect(0, 0, 128, 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export default {
  id: 'shoreline',
  label: 'SHORELINE 정거장',
  screenGlow: 0.5,
  post: POST,

  async load(ctx) {
    const { THREE } = ctx, tl = new THREE.TextureLoader(), base = ctx.assets + 'shoreline/tex/';
    const load = (name, rx, ry) => tl.loadAsync(base + name).then(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }).catch(() => null);
    // 게임의 정거장 바닥(고무)·벽(에나멜) 그림: 1 m 마다 되풀이
    [S.tex.floor, S.tex.wall] = await Promise.all([load('rubber_color.png', 8, 6), load('enamel_color.png', 4, 2)]);
    S.tex.sign = signTexture(THREE); S.tex.glow = glowTexture(THREE); S.tex.label = labelTexture(THREE);
  },

  enter(ctx) {
    const { THREE, mats, parts, lights, scene, renderer } = ctx;
    const col = (m, c, rough = 0.85, metal = 0) => { m.color.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); if (m.roughness !== undefined) { m.roughness = rough; m.metalness = metal; } };
    const G = S.group = new THREE.Group(); G.name = 'shoreline-station';
    S.own = []; S.lights = []; S.styled = [];

    /* 1) 있던 것들을 팔레트로: 바닥 = 초록 갑판, 벽 = 크림 판, 탁자·노트북·방석 = 남색·옅은 회색·주황 */
    // 탁자·방석·노트북·마우스는 게임이 하는 그대로 "팔레트에 맞춰 누르기"(exterior_style.gd _paint): 제 색이 있는 것은 색상을 지키고, 나머지는 밝기로 크림/옅은 회색/초록/남색
    for (const k of ['table', 'tableLeg', 'cushionA', 'cushionB', 'laptopBody', 'laptopDark', 'keycap', 'mouseBody', 'cable', 'ceiling']) {
      const m = mats[k]; if (!m || !m.isMeshStandardMaterial) continue;
      m.color.copy(snap(THREE, m.color)); m.metalness = Math.min(m.metalness, 0.12); m.roughness = Math.max(m.roughness, 0.72);
    }
    col(mats.floor, [0.20, 0.41, 0.345], 0.88);      // 바닥은 초록 갑판
    col(mats.wall, [0.82, 0.73, 0.57], 0.8);                   // 벽은 크림 판
    for (const k of ['floor', 'wall', 'ceiling', 'table', 'tableLeg', 'cushionA', 'cushionB', 'laptopBody', 'laptopDark', 'keycap', 'mouseBody', 'cable']) { styleOn(mats[k], k === 'floor'); S.styled.push(mats[k]); }
    mats.floor.needsUpdate = mats.wall.needsUpdate = true;
    parts.decor.visible = false; parts.rug.visible = false; parts.rugRing.visible = false;
    // 바깥에서 온 노트북 모델(있다면)도 같은 팔레트로 눌러 준다
    S.saved = [];
    if (parts.laptopModel) parts.laptopModel.traverse(o => {
      if (!o.isMesh || !o.material || !o.material.color) return;
      const m = o.material; S.saved.push([m, m.color.clone(), m.roughness, m.metalness]);
      const l = 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b;
      void l; m.color.copy(snap(THREE, m.color)); if (m.roughness !== undefined) { m.roughness = Math.max(m.roughness, 0.72); m.metalness = Math.min(m.metalness, 0.12); }
    });

    /* 2) 더하는 것들 */
    const own = x => { S.own.push(x); return x; };
    const gm = (c, rough = 0.82, extra = {}) => { const m = own(new THREE.MeshStandardMaterial({ roughness: rough, metalness: 0, ...extra })); m.color.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); m.onBeforeCompile = gamePatch; m.customProgramCacheKey = gameKey; return m; };
    const glowM = (c, k) => { const m = own(new THREE.MeshBasicMaterial()); m.color.setRGB(c[0] * k, c[1] * k, c[2] * k); return m; };
    const prop = m => { m.onBeforeCompile = propPatch; m.customProgramCacheKey = propKey; return m; };
    const M = {
      navy: gm([0.14, 0.20, 0.24]), teal: gm(PAL.TEAL), rib: gm([0.17, 0.27, 0.25]), beam: gm([0.19, 0.36, 0.30]), glass: gm([0.20, 0.27, 0.29], 0.75), white: gm([0.88, 0.88, 0.84], 0.78), cream: gm(PAL.CREAM, 0.8), pale: gm(PAL.PALE, 0.78), green: gm(PAL.PANEL, 0.74), deck: gm([0.11, 0.30, 0.25], 0.9),
      box: prop(gm(PAL.BOX, 0.92)), wood: prop(gm(PAL.WOOD, 0.9)), can: prop(gm(PAL.ORANGE, 0.7)), can2: prop(gm(PAL.GOLD, 0.7)), can3: prop(gm([0.30, 0.52, 0.50], 0.7)), jar: prop(gm([0.86, 0.86, 0.82], 0.6)), orange: gm(PAL.ORANGE, 0.8), seam: gm(PAL.SEAM, 0.9), dark: gm([0.03, 0.045, 0.06], 0.85),
      inner: gm([0.74, 0.65, 0.50], 0.85), seamHi: gm([0.88, 0.79, 0.63], 0.85), band: gm([0.30, 0.20, 0.13], 0.9), gold: gm(PAL.GOLD, 0.8),
      strip: glowM([1.0, 0.97, 0.9], 3.4), stripDim: glowM([1.0, 0.98, 0.94], 3.0), cyan: glowM([0.7, 0.95, 1.0], 1.3),
    };
    const geoBox = own(new THREE.BoxGeometry(1, 1, 1));
    const box = (w, h, d, m, x, y, z, o = {}) => { const b = new THREE.Mesh(geoBox, m); b.scale.set(w, h, d); b.position.set(x, y, z); if (o.rx) b.rotation.x = o.rx; if (o.ry) b.rotation.y = o.ry; if (o.rz) b.rotation.z = o.rz; b.castShadow = o.cast !== false && !m.isMeshBasicMaterial; b.receiveShadow = !m.isMeshBasicMaterial; G.add(b); return b; };
    const WZ = -1.5;      // 뒷벽 앞면

    // 가게는 방 가운데에서 조금 왼쪽(탐험가가 일어서는 쪽)에 둔다: 게임 화면처럼 간판 밑에 그녀가 선다
    const SW = 3.3, sx0 = -0.45, LX = sx0 - SW / 2 - 0.2, RX = sx0 + SW / 2 + 0.2;
    // 벽: 매끈한 크림 판을 이어 붙인 벽(또렷한 세로 이음줄), 가는 청록 기둥, 위에는 초록 들보와 그 밑의 흰 긴 등
    box(8, 0.11, 0.03, M.rib, 0, 0.055, WZ + 0.015);
    box(8, 0.13, 0.1, M.beam, 0, 2.14, WZ + 0.05);
    box(7.7, 0.02, 0.02, M.strip, 0, 2.065, WZ + 0.085);
    for (const x of [LX - 1.1, LX, RX, RX + 1.1, RX + 2.2]) box(0.075, 3, 0.06, M.rib, x, 1.5, WZ + 0.03);
    const geoCyl = own(new THREE.CylinderGeometry(0.5, 0.5, 1, 14));
    const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const shelfStuff = (cx, y, z, w, n, seed) => {
      for (let i = 0; i < n; i++) {
        const r = rnd(seed + i * 1.7), r2 = rnd(seed + i * 3.1 + 5), x = cx - w / 2 + w * (i + 0.5) / n + (r - 0.5) * 0.03, kind = Math.floor(r2 * 5);
        if (kind < 2) { const h = 0.05 + r * 0.05, m = new THREE.Mesh(geoCyl, [M.can, M.can2, M.can3, M.jar][Math.floor(r * 3.99)]); m.scale.set(0.035 + r2 * 0.015, h, 0.035 + r2 * 0.015); m.position.set(x, y + h / 2, z); m.castShadow = true; G.add(m); }
        else { const h = 0.04 + r * 0.06, wd = 0.05 + r2 * 0.05; box(wd, h, 0.045, [M.box, M.can3, M.jar, M.box][kind - 1] || M.box, x, y + h / 2, z, { ry: (r - 0.5) * 0.5 }); }
      }
    };
    const BAYS = [LX - 0.55, RX + 0.55, RX + 1.65];
    for (const x0 of BAYS) {                                         // 가게 양옆 벽 칸
      for (const dx of [-0.26, 0.26]) { box(0.01, 2.0, 0.004, M.seam, x0 + dx, 1.08, WZ + 0.002, { cast: false }); box(0.008, 2.0, 0.004, M.seamHi, x0 + dx + 0.009, 1.08, WZ + 0.002, { cast: false }); }
      box(0.95, 0.007, 0.004, M.seam, x0, 0.5, WZ + 0.002, { cast: false }); box(0.95, 0.005, 0.004, M.seamHi, x0, 0.493, WZ + 0.002, { cast: false });
      // 선반 위 작은 물건들
      shelfStuff(x0, 0.775, WZ + 0.03, 0.56, 5, x0 * 7.0); shelfStuff(x0, 1.315, WZ + 0.03, 0.56, 3, x0 * 3.0 + 1.0);
      // 어두운 화면/창 판(남색 테 안으로 들어간 판)과 그 밑의 흰 등
      box(0.74, 0.5, 0.03, M.navy, x0, 1.6, WZ + 0.015); box(0.66, 0.42, 0.012, M.glass, x0, 1.6, WZ + 0.032, { cast: false });
      box(0.7, 0.03, 0.05, M.white, x0, 1.3, WZ + 0.025); box(0.62, 0.016, 0.012, M.stripDim, x0, 1.278, WZ + 0.05);
      box(0.7, 0.03, 0.05, M.white, x0, 0.76, WZ + 0.025); box(0.62, 0.016, 0.012, M.stripDim, x0, 0.738, WZ + 0.05);
    }
    // 옆벽에도 같은 기둥과 걸레받이(가까이 당겨 보면 보인다)
    for (const sx of [-1, 1]) {
      box(0.03, 0.13, 6, M.navy, sx * 3.135, 0.065, 0.6);
      for (const z of [-0.6, 0.9, 2.4]) box(0.09, 3, 0.16, M.navy, sx * 3.105, 1.5, z);
    }

    // 가게: 남색 테를 두른 안쪽 창구 → 그 앞 계산대(청록 몸통·초록 판·크림 윗판·밑의 긴 등) → 위 차양과 긴 등 → 남색 간판
    const WT = 1.45;      // 창구 위 테의 높이 (방의 카메라는 뒷벽을 1.6 m 쯤까지만 보므로 게임보다 낮게 눌러 담았다)
    box(SW - 0.1, WT - 0.58, 0.012, M.inner, sx0, (WT + 0.58) / 2, WZ + 0.006, { cast: false });       // 안쪽(밝은 크림)
    box(SW, 0.07, 0.07, M.navy, sx0, 0.585, WZ + 0.035); box(SW, 0.07, 0.07, M.navy, sx0, WT, WZ + 0.035);
    for (const x of [-SW / 2, SW / 2]) box(0.1, WT + 0.02, 0.09, M.navy, sx0 + x, (WT + 0.02) / 2, WZ + 0.045);
    for (const x of [-0.56, 0.56]) box(0.035, WT - 0.6, 0.03, M.pale, sx0 + x, (WT + 0.6) / 2, WZ + 0.02);   // 창구 안의 가는 기둥
    for (const [x, r] of [[-SW / 2 + 0.1, -1], [SW / 2 - 0.1, 1]]) box(0.2, 0.06, 0.05, M.navy, sx0 + x, WT - 0.07, WZ + 0.04, { rz: r * Math.PI / 4 });   // 모서리를 깎은 테
    box(0.5, 0.012, 0.01, M.stripDim, sx0 - 1.0, WT - 0.1, WZ + 0.02); box(0.5, 0.012, 0.01, M.stripDim, sx0 + 1.0, WT - 0.1, WZ + 0.02);
    // 계산대
    const CD = 0.3, cz = WZ + CD / 2, CH = 0.5;
    box(SW - 0.16, CH, CD, M.teal, sx0, CH / 2, cz);
    box(SW - 0.16, 0.05, CD + 0.02, M.dark, sx0, 0.025, cz + 0.01);
    for (let i = 0; i < 4; i++) {
      const pw = (SW - 0.4) / 4, x = sx0 - (SW - 0.4) / 2 + pw * (i + 0.5);
      box(pw - 0.07, 0.29, 0.012, M.green, x, 0.25, WZ + CD + 0.004);
      for (const [dx, dy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) box(0.05, 0.05, 0.014, M.teal, x + dx * (pw - 0.07) / 2, 0.25 + dy * 0.145, WZ + CD + 0.005, { rz: Math.PI / 4, cast: false });
    }
    box(SW + 0.06, 0.035, CD + 0.1, M.white, sx0, CH + 0.0175, cz + 0.04);
    box(SW - 0.2, 0.03, 0.06, M.white, sx0, 0.64, WZ + 0.07); box(SW - 0.4, 0.012, 0.012, M.stripDim, sx0, 0.62, WZ + 0.1);
    shelfStuff(sx0, 0.655, WZ + 0.07, SW - 0.5, 17, 2.5);
    box(SW - 0.3, 0.025, 0.05, M.white, sx0, 1.0, WZ + 0.04); box(SW - 0.5, 0.01, 0.012, M.stripDim, sx0, 0.983, WZ + 0.066); shelfStuff(sx0, 1.0125, WZ + 0.04, SW - 0.6, 13, 9.1);                            // 윗판
    box(SW - 0.2, 0.016, 0.014, M.strip, sx0, CH - 0.02, WZ + CD + 0.022);                            // 윗판 밑 긴 등
    // 계산대 위 종이 상자(주황 띠)
    const labelM = own(new THREE.MeshStandardMaterial({ map: S.tex.label, roughness: 0.92 })); prop(labelM);
    const boxMats = [M.box, M.box, M.box, M.box, labelM, M.box];
    [[-1.22, 0.24, 0.13, 0.05], [-0.62, 0.25, 0.12, -0.04], [-0.02, 0.22, 0.13, 0.07], [0.56, 0.25, 0.115, -0.02], [1.15, 0.24, 0.13, 0.04]].forEach(([x, w, h, ry]) => {
      const b = new THREE.Mesh(geoBox, boxMats); b.scale.set(w, h, 0.17); b.position.set(sx0 + x, CH + 0.035 + h / 2, cz + 0.02); b.rotation.y = ry; b.castShadow = b.receiveShadow = true; G.add(b);
    });
    // 차양(남색 판)과 그 밑의 긴 등
    const AY = WT + 0.075;
    box(SW + 0.3, 0.04, 0.3, M.navy, sx0, AY + 0.02, WZ + 0.15, { rx: 0.05 });
    box(SW + 0.3, 0.07, 0.03, M.dark, sx0, AY + 0.012, WZ + 0.3);
    box(SW - 0.3, 0.02, 0.05, M.strip, sx0, AY - 0.012, WZ + 0.24);
    for (const x of [-0.9, 0, 0.9]) box(0.14, 0.012, 0.03, M.cyan, sx0 + x, AY - 0.03, WZ + 0.1);     // 차양 밑 작은 표시등
    // 간판: 남색 빛나는 판 + 하늘색 글씨 "장비 상점 / 연료 · 그물 · 보관소"
    const SY = AY + 0.24;
    box(2.74, 0.4, 0.05, M.dark, sx0, SY, WZ + 0.06);
    const sign = new THREE.Mesh(own(new THREE.PlaneGeometry(2.66, 2.66 * 224 / 1536)), own(new THREE.MeshBasicMaterial({ map: S.tex.sign })));
    sign.material.color.setRGB(0.95, 0.95, 0.95); sign.position.set(sx0, SY, WZ + 0.087); G.add(sign);

    // 가게 옆 나무 상자 더미(게임 시장의 상자들)와 보급 상자
    for (const [x, y, z, s, ry] of [[RX + 0.42, 0.2, -1.2, 0.4, 0.08], [RX + 0.86, 0.2, -1.15, 0.4, -0.12], [RX + 0.6, 0.58, -1.2, 0.36, 0.3]]) {
      const b = box(s, s, s, M.wood, x, y, z, { ry });
      for (const dy of [-0.42, 0.42]) { const band = new THREE.Mesh(geoBox, M.band); band.scale.set(1.02, 0.06, 1.02); band.position.y = dy; b.add(band); }
    }
    box(0.3, 0.2, 0.22, labelM, LX - 0.5, 0.1, -1.3, { ry: 0.25 }); box(0.26, 0.16, 0.2, M.box, LX - 0.46, 0.28, -1.31, { ry: -0.1 });

    // 바닥 갑판 이음줄(어두운 초록), 탁자 밑 발판 테
    for (const x of [-3, -1.5, 0, 1.5, 3]) box(0.012, 0.002, 6, M.deck, x, 0.001, 0.6, { cast: false });
    for (const z of [-0.6, 0.9, 2.4]) box(8, 0.002, 0.012, M.deck, 0, 0.001, z, { cast: false });

    // 늘어진 전선: 기둥에서 기둥으로, 차양 끝에서 바닥으로
    const cable = (pts, r, m) => { const g = own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 28, r, 6)); const t = new THREE.Mesh(g, m); t.castShadow = true; G.add(t); return t; };
    cable([[LX - 1.1, 1.56, WZ + 0.11], [LX - 0.55, 1.22, WZ + 0.13], [LX, 1.5, WZ + 0.11]], 0.011, M.dark);
    cable([[LX - 1.1, 1.44, WZ + 0.12], [LX - 0.5, 1.02, WZ + 0.15], [LX, 1.4, WZ + 0.12]], 0.007, M.orange);
    cable([[RX, 1.5, WZ + 0.11], [RX + 0.55, 1.2, WZ + 0.13], [RX + 1.1, 1.52, WZ + 0.11], [RX + 1.65, 1.28, WZ + 0.13], [RX + 2.2, 1.56, WZ + 0.11]], 0.011, M.dark);
    cable([[RX + 1.1, 1.46, WZ + 0.12], [RX + 1.6, 1.08, WZ + 0.15], [RX + 2.2, 1.42, WZ + 0.12]], 0.007, M.gold);
    cable([[RX - 0.06, 1.2, WZ + 0.3], [RX + 0.02, 0.8, WZ + 0.3], [RX - 0.02, 0.3, WZ + 0.26], [RX + 0.11, 0.02, WZ + 0.3], [RX + 0.28, 0.015, WZ + 0.42]], 0.009, M.dark);
    cable([[LX + 0.06, 1.2, WZ + 0.3], [LX - 0.06, 0.9, WZ + 0.2], [LX, 0.62, WZ + 0.12]], 0.008, M.dark);

    // 천장: 남색 판과 긴 등 두 줄(초록 들보 밑), 게임 시장 천장처럼
    const ceil = new THREE.Mesh(own(new THREE.PlaneGeometry(8, 6)), M.navy); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 3, 0.6); G.add(ceil);
    for (const x of [-1.6, 1.6]) { box(0.2, 0.1, 5.6, M.teal, x, 2.94, 0.6, { cast: false }); box(0.07, 0.02, 5.2, M.strip, x, 2.885, 0.6); }

    // 등 둘레의 번짐(게임의 glow 대신): 더해지는 빛 그림
    const glowMat = (c, op) => { const m = own(new THREE.MeshBasicMaterial({ map: S.tex.glow, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.color.setRGB(...c); return m; };
    const glowGeo = own(new THREE.PlaneGeometry(1, 1));
    const glow = (w, h, x, y, z, c, op) => { const p = new THREE.Mesh(glowGeo, glowMat(c, op)); p.scale.set(w, h, 1); p.position.set(x, y, z); p.renderOrder = 5; G.add(p); return p; };
    glow(SW - 0.1, 0.16, sx0, AY - 0.012, WZ + 0.28, [1.0, 0.97, 0.9], 0.8);
    glow(SW + 0.5, 0.4, sx0, AY - 0.06, WZ + 0.29, [0.82, 0.97, 1.0], 0.3);
    glow(SW - 0.1, 0.14, sx0, CH - 0.02, WZ + CD + 0.04, [0.9, 1.0, 0.95], 0.7);
    glow(SW + 0.4, 0.5, sx0, CH - 0.04, WZ + CD + 0.05, [0.8, 1.0, 0.97], 0.3);
    for (const x0 of BAYS) for (const y of [1.278, 0.738]) { glow(0.74, 0.09, x0, y, WZ + 0.06, [1.0, 0.97, 0.9], 0.6); glow(1.0, 0.36, x0, y - 0.03, WZ + 0.062, [0.82, 0.97, 1.0], 0.24); }
    glow(8.0, 0.1, 0, 2.065, WZ + 0.1, [1.0, 0.97, 0.9], 0.5);
    for (const x of [sx0 - 1.0, sx0 + 1.0]) glow(0.75, 0.3, x, WT - 0.1, WZ + 0.04, [1.0, 0.96, 0.88], 0.22);

    ctx.room.add(G);

    /* 3) 빛: 따뜻한 실내 채움빛은 약하게, 위의 긴 등(그림자) + 가게 차양 등 + 계산대 밑 등 */
    lights.hemi.color.setRGB(1.0, 0.88, 0.72); lights.hemi.groundColor.setRGB(0.80, 0.72, 0.60); lights.hemi.intensity = 0.5;
    lights.key.color.setRGB(1.0, 0.97, 0.9); lights.key.intensity = 0.22; lights.key.position.set(0.5, 3.4, 1.5);
    lights.lamp.color.setRGB(1.0, 0.97, 0.9); lights.lamp.intensity = 0.45;
    lights.screen.color.setRGB(0.66, 0.78, 1.0);
    const addLight = (c, i, d, x, y, z) => { const l = new THREE.PointLight(0xffffff, i, d, 1.7); l.color.setRGB(...c); l.position.set(x, y, z); scene.add(l); S.lights.push(l); return l; };
    S.awning = [addLight([1.0, 0.97, 0.9], 0.6, 3.4, sx0 - 1.0, WT - 0.05, WZ + 0.95), addLight([1.0, 0.97, 0.9], 0.6, 3.4, sx0 + 1.0, WT - 0.05, WZ + 0.95)];
    addLight([0.8, 1.0, 0.92], 0.3, 2.2, sx0, 0.42, WZ + CD + 0.25);

    /* 4) 공기·필름 */
    scene.background = new THREE.Color().setRGB(0.004, 0.005, 0.02, THREE.SRGBColorSpace);
    scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(0.035, 0.05, 0.06, THREE.SRGBColorSpace), 0.055);
    renderer.toneMapping = THREE.NoToneMapping;          // AgX(노출 1.2)는 후처리에서 직접 한다 → 그 뒤에 대비·필름
    renderer.toneMappingExposure = 1;
    // 게임이 주인공에게만 비추는 약한 보조등
    S.hero = ctx.chars.shoreline?.debug?.U || null;
    if (S.hero) S.hero.uFill.value = 0.17;
  },

  exit(ctx) {
    const { scene } = ctx;
    for (const m of S.styled) styleOff(m);
    S.styled = [];
    if (S.saved) for (const [m, c, r, me] of S.saved) { m.color.copy(c); if (r !== undefined) m.roughness = r; if (me !== undefined) m.metalness = me; }
    S.saved = null;
    if (S.group) { S.group.removeFromParent(); S.group = null; }
    for (const l of S.lights) { scene.remove(l); l.dispose?.(); }
    S.lights = []; S.awning = null;
    for (const o of S.own) o.dispose?.();
    S.own = [];
    if (S.hero) S.hero.uFill.value = 0;
    S.hero = null;
    scene.fog = null;
  },

  update(ctx, dt, t) {
    // 긴 등이 아주 조금 떨린다(낡은 정거장의 형광등)
    if (S.awning) { const f = 1 + 0.025 * Math.sin(t * 13.7) * Math.sin(t * 2.3); S.awning[0].intensity = 0.6 * f; S.awning[1].intensity = 0.6 * f; }
  },
};
