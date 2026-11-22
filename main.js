// 같이 보는 방 — 데스크톱 앱 (Electron)
// 방 화면(index.html) 안의 노트북에 진짜 유튜브 사이트(www.youtube.com)를 그대로 띄웁니다.
const { app, BrowserWindow, Menu, shell, session, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

// 점검용 옵션: --wr-capture=<폴더> 를 주면 화면을 찍어 저장하고 바로 꺼집니다.
const arg = name => {
  const p = `--wr-${name}=`;
  const a = process.argv.find(x => x.startsWith(p));
  return a ? a.slice(p.length) : null;
};
const CAPTURE_DIR = arg('capture');
const START_URL = arg('url');
const WAIT = Number(arg('wait')) || 9000;
const DO = arg('do');
const SIZE = (arg('size') || '').split('x').map(Number);
// --wr-profile=real : 점검 캡처를 실제 앱 프로필(로그인 포함)로 찍는다
const REAL_PROFILE = arg('profile') === 'real';
const PARTITION = 'persist:watchroom';

const YT_HOST = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;
const GOOGLE_HOST = /(^|\.)google\.(com|co\.kr)$/i; // 동의·로그인 화면
const hostOf = u => {
  try { const x = new URL(u); return x.protocol === 'https:' ? x.hostname : ''; } catch { return ''; }
};
const isYouTube = u => YT_HOST.test(hostOf(u));
const staysInLaptop = u => { const h = hostOf(u); return YT_HOST.test(h) || GOOGLE_HOST.test(h); };

/* ───────── 노트북 화면 안에서만 전체화면 ─────────
   유튜브가 진짜 전체화면을 요청하면 모니터 전체가 덮이므로,
   전체화면 기능을 "노트북 화면을 꽉 채우기"로 바꿔치기한다. 유튜브는 전체화면이 된 줄 알고 전체화면 화면을 그린다. */
const LAPTOP_FULLSCREEN = `(() => {
  if (window.__wrFs) return;
  window.__wrFs = true;
  let fsEl = null;
  const css = document.createElement('style');
  css.textContent = '.wr-fs{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important;z-index:2147483647!important;background:#000!important}html.wr-fs-root,html.wr-fs-root body{overflow:hidden!important}';
  (document.head || document.documentElement).appendChild(css);
  const notify = el => {
    el.dispatchEvent(new Event('fullscreenchange', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('webkitfullscreenchange', { bubbles: true, composed: true }));
  };
  const leave = () => {
    if (!fsEl) return;
    const el = fsEl;
    fsEl = null;
    el.classList.remove('wr-fs');
    document.documentElement.classList.remove('wr-fs-root');
    notify(el);
  };
  function enter() {
    if (fsEl === this) return Promise.resolve();
    leave();
    fsEl = this;
    this.classList.add('wr-fs');
    document.documentElement.classList.add('wr-fs-root');
    notify(this);
    return Promise.resolve();
  }
  function exit() { leave(); return Promise.resolve(); }
  for (const k of ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen']) Element.prototype[k] = enter;
  for (const k of ['exitFullscreen', 'webkitExitFullscreen', 'webkitCancelFullScreen']) Document.prototype[k] = exit;
  const getters = {
    fullscreenElement: () => fsEl, webkitFullscreenElement: () => fsEl, webkitCurrentFullScreenElement: () => fsEl,
    fullscreen: () => !!fsEl, webkitIsFullScreen: () => !!fsEl,
    fullscreenEnabled: () => true, webkitFullscreenEnabled: () => true,
  };
  for (const k in getters) Object.defineProperty(Document.prototype, k, { get: getters[k], configurable: true });
  addEventListener('keydown', e => { if (e.key === 'Escape' && fsEl) { e.stopPropagation(); leave(); } }, true);
})()`;

let lastExternal = 0;
function openOutside(url) {
  // 유튜브 밖 링크(광고 등)는 노트북이 아니라 평소 쓰는 브라우저에서 연다
  if (!/^https?:\/\//i.test(url) || Date.now() - lastExternal < 1500) return;
  lastExternal = Date.now();
  shell.openExternal(url);
}

if (CAPTURE_DIR) {
  // 점검용 캡처는 보통 실제 앱의 로그인·기록과 섞이지 않게 임시 프로필을 쓴다
  if (!REAL_PROFILE) app.setPath('userData', path.join(app.getPath('temp'), 'watch-room-capture' + (arg('tmp') ? '-' + arg('tmp').replace(/[^\w-]/g, '') : '')));
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}
if ((!CAPTURE_DIR || REAL_PROFILE) && !app.requestSingleInstanceLock()) {
  app.quit();
}

/* ───────── 로그인 유지 ─────────
   유튜브(구글)는 보는 동안 로그인 쿠키를 계속 새것으로 바꿔 줍니다.
   새 쿠키가 디스크에 저장되기 전에 앱이 꺼지면, 다음 실행 때 낡은 쿠키를 내밀게 되어 로그아웃됩니다.
   그래서 크롬처럼 쿠키를 자주 저장하고, 끄기 직전에도 꼭 저장한 뒤 종료합니다. */
let ytSession = null;
function saveLogin() {
  if (!ytSession) return Promise.resolve();
  return Promise.race([
    Promise.all([ytSession.cookies.flushStore(), Promise.resolve(ytSession.flushStorageData())]).catch(() => {}),
    new Promise(r => setTimeout(r, 2500)),
  ]);
}
let saved = false;
app.on('before-quit', e => {
  if (saved) return;
  e.preventDefault();
  saveLogin().finally(() => { saved = true; app.quit(); });
});

nativeTheme.themeSource = 'dark';

let win = null;
let guest = null;

function createWindow() {
  const capture = !!CAPTURE_DIR;
  win = new BrowserWindow({
    width: SIZE[0] || 1440,
    height: SIZE[1] || 900,
    minWidth: 900,
    minHeight: 620,
    useContentSize: true,
    backgroundColor: '#1c1730',
    title: '같이 보는 방',
    icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon-512.png'),
    ...(capture ? { x: -12000, y: 0, frame: false, skipTaskbar: true, focusable: false } : {}),
    webPreferences: {
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: !capture,
    },
  });

  const start = START_URL && isYouTube(START_URL) ? { query: { url: START_URL } } : undefined;
  win.loadFile(path.join(__dirname, arg('page') || 'index.html'), start);

  // 방 화면 자체는 다른 곳으로 이동하거나 새 창을 띄우지 않는다
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());

  win.webContents.on('will-attach-webview', (e, prefs, params) => {
    prefs.preload = path.join(__dirname, 'guest-preload.js'); // 우리 것만 허용
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    if (!isYouTube(params.src)) e.preventDefault();
  });

  win.webContents.on('did-attach-webview', (_e, contents) => {
    guest = contents;
    if (capture) contents.setAudioMuted(true);
    contents.setWindowOpenHandler(({ url }) => {
      if (staysInLaptop(url)) setImmediate(() => { if (!contents.isDestroyed()) contents.loadURL(url).catch(() => {}); });
      else openOutside(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (e, url) => {
      if (staysInLaptop(url)) return;
      e.preventDefault();
      openOutside(url);
    });
    contents.on('dom-ready', () => { contents.executeJavaScript(LAPTOP_FULLSCREEN).catch(() => {}); });
    // 페이지를 옮길 때마다(로그인 직후 포함) 쿠키 저장
    contents.on('did-navigate', () => { saveLogin(); });
    if (capture) runCapture(contents);
  });

  // 윈도우 종료·로그오프 때도 저장
  win.on('session-end', () => { saveLogin(); });
  win.on('closed', () => { win = null; guest = null; });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runCapture(contents) {
  const fail = setTimeout(() => { console.error('capture timed out'); app.exit(1); }, 60000);
  try {
    fs.mkdirSync(CAPTURE_DIR, { recursive: true });
    await new Promise(resolve => {
      contents.once('did-finish-load', resolve);
      setTimeout(resolve, 20000);
    });
    await sleep(WAIT);
    if (DO) {
      // 점검용: 방 화면에서 스크립트를 한 번 실행한 뒤(예: 검색해 보기) 다시 기다렸다가 찍는다
      const r = await win.webContents.executeJavaScript(fs.readFileSync(DO, 'utf8'), true);
      if (r && r.click) {
        // 점검용: 방 화면 좌표에 진짜 마우스 클릭을 보낸다
        const p = { x: Math.round(r.click.x), y: Math.round(r.click.y), button: 'left', clickCount: 1 };
        // 실제 입력 경로(노트북 속 유튜브까지의 좌표 판정 포함)를 타도록 디버거 프로토콜로 보낸다
        const dbg = win.webContents.debugger;
        if (!dbg.isAttached()) dbg.attach('1.3');
        const ev = type => dbg.sendCommand('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
        await ev('mouseMoved'); await ev('mousePressed'); await ev('mouseReleased');
        console.log('CLICK ' + JSON.stringify(p));
      }
      await sleep(WAIT);
    }
    if (arg('after')) {
      // 점검용: 캡처 직전에 방 화면에서 값을 읽어 출력한다
      const out = await win.webContents.executeJavaScript(fs.readFileSync(arg('after'), 'utf8'), true);
      console.log('AFTER ' + JSON.stringify(out));
    }
    const meta = await contents.executeJavaScript(
      `({ url: location.href, title: document.title, w: innerWidth, h: innerHeight, dpr: devicePixelRatio,
          signedIn: !!document.querySelector('#avatar-btn, ytd-topbar-menu-button-renderer #avatar-btn, button#avatar-btn'),
          signInButton: !!document.querySelector('a[href*="ServiceLogin"]'),
          ua: navigator.userAgent, clk: window.__clk || null, active: document.activeElement && (document.activeElement.name || document.activeElement.id || document.activeElement.tagName) })`);
    const shot = await contents.capturePage();
    fs.writeFileSync(path.join(CAPTURE_DIR, 'laptop-screen.png'), shot.toPNG());
    const scene = await win.webContents.capturePage();
    fs.writeFileSync(path.join(CAPTURE_DIR, 'scene.png'), scene.toPNG());
    meta.shot = shot.getSize();
    meta.scene = scene.getSize();
    fs.writeFileSync(path.join(CAPTURE_DIR, 'meta.json'), JSON.stringify(meta, null, 2));
    console.log(JSON.stringify(meta));
    clearTimeout(fail);
    await saveLogin();
    app.exit(0);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // 노트북 속 유튜브가 요청할 수 있는 권한은 링크 복사뿐 (진짜 전체화면·마이크·알림 등은 거절)
  ytSession = session.fromPartition(PARTITION);
  ytSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'clipboard-sanitized-write');
  });
  // 구글에는 평범한 크롬으로 보이게 (앱 이름·Electron 표시를 뺀다)
  const ua = ytSession.getUserAgent().replace(/\s(watch-room|Electron)\/\S+/gi, '');
  ytSession.setUserAgent(ua); // 노트북 속 유튜브에만 적용 (방 화면은 그대로 둬야 데스크톱 앱임을 알아챔)
  // 보는 동안 1분마다 쿠키 저장 (갑자기 꺼져도 최대 1분치만 잃음)
  setInterval(saveLogin, 60000);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
