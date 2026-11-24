package com.watchroom.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Matrix;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

/**
 * 같이 보는 방 — 안드로이드 앱.
 * 게임(3D 방)은 앱 속 웹페이지로 돌리고, 그 위에 '진짜 유튜브' 브라우저를 하나 더 올린 뒤
 * 노트북 화면 네 꼭짓점에 맞춰 기울여 붙인다(컴퓨터 버전의 webview 와 같은 생각).
 * 손가락이 노트북 화면 안이면 유튜브로, 밖이면 게임으로 보낸다.
 */
public class MainActivity extends Activity {
    static final String GAME_URL = "https://appassets.androidplatform.net/assets/www/index.html";
    static final String YT_HOME = "https://m.youtube.com/";
    static final int YT_CSS_W = 560;                 // 유튜브 화면의 가로 폭(웹 글자 크기 기준). 작을수록 글씨가 크게 보인다
    static final float SCREEN_RATIO = 768f / 1366f;  // 노트북 화면 비율

    WebView game, yt;
    RoomLayout room;
    final Handler ui = new Handler(Looper.getMainLooper());
    final Matrix toScreen = new Matrix(), toYt = new Matrix();
    boolean quadReady = false, gameReady = false, hidden = false;
    String probe = null, pendingUrl = null;
    int ytW, ytH;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        float density = getResources().getDisplayMetrics().density;
        ytW = Math.round(YT_CSS_W * density);
        ytH = Math.round(YT_CSS_W * SCREEN_RATIO * density);

        room = new RoomLayout();
        room.setBackgroundColor(Color.BLACK);

        // ── 게임 (앱 안에 든 파일) ──
        game = new WebView(this);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        WebSettings gs = game.getSettings();
        gs.setJavaScriptEnabled(true);
        gs.setDomStorageEnabled(true);
        gs.setMediaPlaybackRequiresUserGesture(false);
        gs.setAllowFileAccess(false);
        game.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String u = r.getUrl().toString();
                if (u.startsWith(GAME_URL)) return false;
                go(u);   // 게임 화면의 링크는 노트북 유튜브에서 연다
                return true;
            }
        });
        game.setWebChromeClient(new WebChromeClient());
        game.addJavascriptInterface(new Bridge(), "AndroidRoom");
        room.addView(game, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        // ── 노트북 속 진짜 유튜브 ──
        yt = new WebView(this);
        WebSettings ys = yt.getSettings();
        ys.setJavaScriptEnabled(true);
        ys.setDomStorageEnabled(true);
        ys.setMediaPlaybackRequiresUserGesture(false);
        ys.setSupportMultipleWindows(false);
        ys.setLoadWithOverviewMode(false);
        // 구글 로그인이 '앱 속 브라우저'를 막는 경우가 많아서, 보통 크롬처럼 보이게 한다
        ys.setUserAgentString(ys.getUserAgentString().replace("; wv", "").replaceAll("Version/[\\d.]+ ", ""));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(yt, true);
        yt.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String s = r.getUrl().getScheme();
                return !("http".equals(s) || "https".equals(s));   // intent:// 같은 '앱으로 열기'는 무시
            }
            @Override public void doUpdateVisitedHistory(WebView v, String url, boolean reload) { sendUrl(url); }
        });
        yt.setWebChromeClient(new WebChromeClient());   // 전체화면은 만들지 않음 → 영상은 노트북 화면 안에서만
        yt.setBackgroundColor(Color.parseColor("#0f0f0f"));
        yt.setVisibility(View.INVISIBLE);                 // 노트북 위치를 받기 전에는 숨김
        yt.setPivotX(0); yt.setPivotY(0);
        room.addView(yt, new FrameLayout.LayoutParams(ytW, ytH));

        setContentView(room);
        hideBars();

        String first = sharedUrl(getIntent());
        yt.loadUrl(first != null ? first : YT_HOME);
        game.loadUrl(GAME_URL);
        ui.postDelayed(pollProbe, 1500);
    }

    // 유튜브 앱 '공유 → 같이 보는 방'
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String u = sharedUrl(intent);
        if (u != null) go(u);
    }
    static String sharedUrl(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String t = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (t == null) return null;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("https?://\\S+").matcher(t);
        return m.find() ? m.group() : null;
    }

    void go(String raw) {
        ui.post(() -> {
            String s = raw.trim();
            String url;
            if (s.matches("(?i)^(https?://)?([\\w-]+\\.)*(youtube\\.com|youtu\\.be)(/.*)?$")) url = s.matches("(?i)^https?://.*") ? s : "https://" + s;
            else if (s.matches("(?i)^https?://.*")) url = s;
            else url = "https://m.youtube.com/results?search_query=" + Uri.encode(s);
            yt.loadUrl(url);
        });
    }

    void sendUrl(String url) {
        if (!gameReady) return;
        game.evaluateJavascript("window.WR_android&&WR_android.url(" + JSONObject.quote(url) + ")", null);
    }

    // 0.6초마다 유튜브에서 '지금 재생 중인지'를 읽어 게임(친구들 반응)에 알려 준다
    final Runnable pollProbe = new Runnable() {
        @Override public void run() {
            if (probe != null && gameReady) {
                yt.evaluateJavascript(probe, json -> {
                    if (json != null && !"null".equals(json))
                        game.evaluateJavascript("window.WR_android&&WR_android.probe(" + json + ")", null);
                });
            }
            ui.postDelayed(this, 600);
        }
    };

    class Bridge {
        @JavascriptInterface public void ready(String probeJs) { ui.post(() -> { probe = probeJs; gameReady = true; sendUrl(yt.getUrl() == null ? YT_HOME : yt.getUrl()); }); }
        @JavascriptInterface public void go(String url) { MainActivity.this.go(url); }
        @JavascriptInterface public void nav(String what) {
            ui.post(() -> {
                switch (what) {
                    case "back": if (yt.canGoBack()) yt.goBack(); break;
                    case "forward": if (yt.canGoForward()) yt.goForward(); break;
                    case "reload": yt.reload(); break;
                    default: yt.loadUrl(YT_HOME);
                }
            });
        }
        // 노트북 화면 네 꼭짓점(화면 픽셀): 왼위, 오른위, 오른아래, 왼아래
        @JavascriptInterface public void quad(String csv) {
            final float[] dst = new float[8];
            String[] p = csv.split(",");
            if (p.length != 8) return;
            for (int i = 0; i < 8; i++) dst[i] = Float.parseFloat(p[i]);
            ui.post(() -> {
                float[] src = { 0, 0, ytW, 0, ytW, ytH, 0, ytH };
                if (!toScreen.setPolyToPoly(src, 0, dst, 0, 4)) return;
                toScreen.invert(toYt);
                yt.setAnimationMatrix(toScreen);
                quadReady = true;
                yt.setVisibility(hidden ? View.INVISIBLE : View.VISIBLE);
            });
        }
        @JavascriptInterface public void hide(boolean h) { ui.post(() -> { hidden = h; yt.setVisibility(h || !quadReady ? View.INVISIBLE : View.VISIBLE); }); }
        // 화면 속 유튜브의 크기(CSS px). 폰을 세로/가로로 돌릴 때 바뀐다
        @JavascriptInterface public void size(int w, int h) {
            ui.post(() -> {
                float d = getResources().getDisplayMetrics().density;
                int nw = Math.round(w * d), nh = Math.round(h * d);
                if (nw == ytW && nh == ytH) return;
                ytW = nw; ytH = nh; quadReady = false;
                yt.setVisibility(View.INVISIBLE);
                yt.setLayoutParams(new FrameLayout.LayoutParams(ytW, ytH));
            });
        }
    }

    /** 손가락이 노트북 화면 안에서 시작하면 그 움직임 전체를 유튜브로, 아니면 게임으로 */
    class RoomLayout extends FrameLayout {
        View target = null;
        final float[] pt = new float[2];
        RoomLayout() { super(MainActivity.this); }

        boolean onScreen(float x, float y) {
            if (!quadReady || yt.getVisibility() != View.VISIBLE) return false;
            pt[0] = x; pt[1] = y; toYt.mapPoints(pt);
            return pt[0] >= 0 && pt[0] <= ytW && pt[1] >= 0 && pt[1] <= ytH;
        }

        // 원근(기울기)까지 정확히 되돌리려고 손가락 좌표를 하나씩 직접 바꿔 새 터치를 만든다
        MotionEvent mapped(MotionEvent ev) {
            int n = ev.getPointerCount();
            MotionEvent.PointerProperties[] props = new MotionEvent.PointerProperties[n];
            MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[n];
            for (int i = 0; i < n; i++) {
                props[i] = new MotionEvent.PointerProperties(); ev.getPointerProperties(i, props[i]);
                coords[i] = new MotionEvent.PointerCoords(); ev.getPointerCoords(i, coords[i]);
                pt[0] = coords[i].x; pt[1] = coords[i].y; toYt.mapPoints(pt);
                coords[i].x = pt[0]; coords[i].y = pt[1];
            }
            return MotionEvent.obtain(ev.getDownTime(), ev.getEventTime(), ev.getAction(), n, props, coords,
                    ev.getMetaState(), ev.getButtonState(), 1f, 1f, ev.getDeviceId(), ev.getEdgeFlags(), ev.getSource(), ev.getFlags());
        }

        @Override public boolean dispatchTouchEvent(MotionEvent ev) {
            if (ev.getActionMasked() == MotionEvent.ACTION_DOWN) target = onScreen(ev.getX(), ev.getY()) ? yt : game;
            if (target == null) return false;
            boolean r;
            if (target == yt) {
                MotionEvent e = mapped(ev);
                r = yt.dispatchTouchEvent(e);
                e.recycle();
            } else r = game.dispatchTouchEvent(ev);
            int a = ev.getActionMasked();
            if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) target = null;
            return r;
        }
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() {
        if (yt.canGoBack()) yt.goBack(); else super.onBackPressed();
    }

    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) hideBars(); }
    void hideBars() {
        WindowInsetsController c = getWindow().getInsetsController();
        if (c == null) return;
        c.hide(WindowInsets.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); game.onPause(); yt.onPause(); }
    @Override protected void onResume() { super.onResume(); game.onResume(); yt.onResume(); }
}
