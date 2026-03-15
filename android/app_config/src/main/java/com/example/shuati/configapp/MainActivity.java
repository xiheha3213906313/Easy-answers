package com.example.shuati.configapp;

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
      String url = getBridge().getLocalUrl() + "#/config";
      getBridge().getWebView().loadUrl(url);
    }
  }
}
