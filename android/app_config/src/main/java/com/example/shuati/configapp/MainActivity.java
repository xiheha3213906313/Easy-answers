package com.example.shuati.configapp;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.example.shuati.configapp.security.SecurityGuard;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(ConfigAdminBridge.class);
    if (SecurityGuard.shouldBlockBeforeCreate(this)) {
      return;
    }
    super.onCreate(savedInstanceState);
    SecurityGuard.showDebugDialogIfNeeded(this);
    ConfigStorage.ensureDefaults(this);
    if (getBridge() != null && getBridge().getWebView() != null) {
      boolean fromApp1 = getIntent() != null && getIntent().getBooleanExtra("from_app1", false);
      String url = getBridge().getLocalUrl() + "#/config";
      if (fromApp1) {
        url += "?from=app1";
      }
      getBridge().getWebView().loadUrl(url);
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    if (getBridge() != null && getBridge().getWebView() != null) {
      boolean fromApp1 = intent != null && intent.getBooleanExtra("from_app1", false);
      if (fromApp1) {
        String url = getBridge().getLocalUrl() + "#/config?from=app1";
        getBridge().getWebView().loadUrl(url);
      }
    }
  }

  @Override
  public void onStop() {
    super.onStop();
    if (!isChangingConfigurations()) {
      finish();
    }
  }
}
