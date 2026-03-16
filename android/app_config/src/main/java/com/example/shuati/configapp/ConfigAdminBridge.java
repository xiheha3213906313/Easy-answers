package com.example.shuati.configapp;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.content.Context;
import android.content.Intent;

@CapacitorPlugin(name = "ConfigAdminBridge")
public class ConfigAdminBridge extends Plugin {

  @PluginMethod
  public void getConfigState(PluginCall call) {
    ConfigStorage.ConfigRecord record = ConfigStorage.read(getContext());
    JSObject ret = new JSObject();
    ret.put("enabled", record.enabled);
    ret.put("hasPayload", record.payload != null && !record.payload.isEmpty());
    if (record.hash != null && !record.hash.isEmpty()) {
      ret.put("configHash", record.hash);
    }
    if (record.updatedAt > 0) {
      ret.put("updatedAt", record.updatedAt);
    }
    call.resolve(ret);
  }

  @PluginMethod
  public void setEnabled(PluginCall call) {
    Boolean enabled = call.getBoolean("enabled", true);
    ConfigStorage.setEnabled(getContext(), enabled);
    call.resolve();
  }

  @PluginMethod
  public void setPayload(PluginCall call) {
    String payload = call.getString("payload", "");
    ConfigStorage.setPayload(getContext(), payload == null ? "" : payload.trim());
    call.resolve();
  }

  @PluginMethod
  public void clearConfig(PluginCall call) {
    ConfigStorage.clear(getContext());
    call.resolve();
  }

  @PluginMethod
  public void openMainApp(PluginCall call) {
    JSObject ret = new JSObject();
    boolean opened = false;
    try {
      Context context = getContext();
      Intent launchIntent = context.getPackageManager()
          .getLaunchIntentForPackage("com.example.shuati");
      if (launchIntent != null) {
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        launchIntent.putExtra("from_app2", true);
        context.startActivity(launchIntent);
        opened = true;
      }
    } catch (Exception ignored) {
    }
    ret.put("opened", opened);
    call.resolve(ret);
  }

  @PluginMethod
  public void isMainAppInstalled(PluginCall call) {
    JSObject ret = new JSObject();
    boolean installed = false;
    try {
      Context context = getContext();
      context.getPackageManager().getPackageInfo("com.example.shuati", 0);
      installed = true;
    } catch (Exception ignored) {
    }
    ret.put("installed", installed);
    call.resolve(ret);
  }
}
