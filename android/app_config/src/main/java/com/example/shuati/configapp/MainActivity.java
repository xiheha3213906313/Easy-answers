package com.example.shuati.configapp;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(ConfigAdminBridge.class);
    super.onCreate(savedInstanceState);
    ConfigStorage.ensureDefaults(this);
    if (getBridge() != null && getBridge().getWebView() != null) {
      String url = getBridge().getLocalUrl() + "#/config";
      getBridge().getWebView().loadUrl(url);
    }
  }
}
