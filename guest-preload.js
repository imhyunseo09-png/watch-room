// 노트북 속 유튜브 페이지에 붙는 작은 스크립트.
// 마우스 위치와 "어떤 키가 눌렸는지(키 위치만)"를 방 화면에 알려 줘서
// 3D 노트북의 화면 속 커서·유선 마우스·키보드가 따라 움직이게 한다.
const { ipcRenderer } = require('electron');

const isYouTube = () => /(^|\.)youtube\.com$/.test(location.hostname);
let pending = null;

function kindOf(t) {
  if (!t || !t.closest) return 'default';
  if (t.closest('input:not([type]),input[type=text],input[type=search],textarea,[contenteditable=true]')) return 'text';
  if (t.closest('a,button,[role=button],[role=link],[role=tab],[role=option],[role=menuitem],[role=slider],.ytp-progress-bar,yt-chip-cloud-chip-renderer,ytd-thumbnail,label,summary,select')) return 'pointer';
  return 'default';
}

addEventListener('mousemove', e => {
  const first = !pending;
  pending = { x: e.clientX / innerWidth, y: e.clientY / innerHeight, k: kindOf(e.target) };
  if (first) requestAnimationFrame(() => { ipcRenderer.sendToHost('wr-move', pending); pending = null; });
}, true);
document.addEventListener('mouseleave', () => ipcRenderer.sendToHost('wr-leave'), true);
addEventListener('mousedown', e => ipcRenderer.sendToHost('wr-button', { down: true, button: e.button }), true);
addEventListener('mouseup', e => ipcRenderer.sendToHost('wr-button', { down: false, button: e.button }), true);
addEventListener('wheel', e => ipcRenderer.sendToHost('wr-wheel', { dy: Math.sign(e.deltaY) }), { capture: true, passive: true });

// 키는 유튜브에서만, 그리고 "키 위치(code)"만 보낸다. 로그인 화면(구글)에서는 아무것도 보내지 않는다.
const key = down => e => { if (isYouTube()) ipcRenderer.sendToHost('wr-key', { code: e.code, down }); };
addEventListener('keydown', key(true), true);
addEventListener('keyup', key(false), true);
