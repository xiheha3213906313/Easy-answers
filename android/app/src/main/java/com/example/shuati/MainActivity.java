package com.example.shuati;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import com.example.shuati.security.SecurityGuard;

public class MainActivity extends BridgeActivity {
  private int lastInsetTop = -1;
  private int lastInsetRight = -1;
  private int lastInsetBottom = -1;
  private int lastInsetLeft = -1;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(ConfigBridge.class);
    if (SecurityGuard.shouldBlockBeforeCreate(this)) {
      return;
    }
    super.onCreate(savedInstanceState);
    SecurityGuard.showDebugDialogIfNeeded(this);

    // Edge-to-edge: allow content to draw behind status/navigation bars.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      WindowManager.LayoutParams lp = getWindow().getAttributes();
      lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
      getWindow().setAttributes(lp);
    }

    View webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView == null) {
      return;
    }
    View rootView = getWindow().getDecorView();
    ViewCompat.setOnApplyWindowInsetsListener(rootView, (v, insets) -> {
      Insets statusBars = insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.statusBars());
      Insets navBars = insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.navigationBars());
      Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());

      int top = Math.max(statusBars.top, cutout.top);
      int right = Math.max(navBars.right, cutout.right);
      int bottom = Math.max(navBars.bottom, cutout.bottom);
      int left = Math.max(navBars.left, cutout.left);

      updateSafeAreaCss((WebView) webView, top, right, bottom, left);
      return insets;
    });
    ViewCompat.requestApplyInsets(rootView);
  }

  @Override
  protected void onNewIntent(android.content.Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
  }

  private void updateSafeAreaCss(WebView webView, int top, int right, int bottom, int left) {
    if (top == lastInsetTop && right == lastInsetRight && bottom == lastInsetBottom && left == lastInsetLeft) {
      return;
    }
    lastInsetTop = top;
    lastInsetRight = right;
    lastInsetBottom = bottom;
    lastInsetLeft = left;

    float density = webView.getResources().getDisplayMetrics().density;
    int topCss = Math.max(0, Math.round(top / density));
    int rightCss = Math.max(0, Math.round(right / density));
    int bottomCss = Math.max(0, Math.round(bottom / density));
    int leftCss = Math.max(0, Math.round(left / density));

    String script =
        "(function(){"
            + "var r=document.documentElement;"
            + "r.style.setProperty('--safe-area-inset-top','" + topCss + "px');"
            + "r.style.setProperty('--safe-area-inset-right','" + rightCss + "px');"
            + "r.style.setProperty('--safe-area-inset-bottom','" + bottomCss + "px');"
            + "r.style.setProperty('--safe-area-inset-left','" + leftCss + "px');"
            + "})();";

    webView.post(() -> webView.evaluateJavascript(script, null));
  }
}
