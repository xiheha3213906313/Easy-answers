package com.example.shuati.configapp;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

class ConfigStorage {
  static final String PREFS = "config_provider_prefs";
  static final String KEY_ENABLED = "enabled";
  static final String KEY_PAYLOAD = "payload";
  static final String KEY_HASH = "hash";
  static final String KEY_UPDATED_AT = "updated_at";

  static final String DEFAULT_PAYLOAD =
      "GtBlL2MAhHqFwhmD87tXhg==|Xs5QkZZUB1lCfotVaVWjjg==|100000|AD2uo8hdHfAiXsvqgUhmj6CXsArjSmQe+io0noJaCOW80QVFfMvywIUhAcV8QPx/KD/rGoOEhQyGchEeNI7hYbWRMfA4blSHvIhtacR3JtxQg7d9ur1zqLwtiFeggKrNRT6LP8moEjmSwN73aZl66Te/yKjZE80Xv2FkgepXJuFuwnxuC8goH+eafv4tx1YFSvLe9l0gdv+xs+fZwTLQLg==";

  static void ensureDefaults(Context context) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    if (!prefs.contains(KEY_PAYLOAD)) {
      String hash = sha256(DEFAULT_PAYLOAD);
      prefs.edit()
          .putBoolean(KEY_ENABLED, true)
          .putString(KEY_PAYLOAD, DEFAULT_PAYLOAD)
          .putString(KEY_HASH, hash)
          .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
          .apply();
    }
  }

  static ConfigRecord read(Context context) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    boolean enabled = prefs.getBoolean(KEY_ENABLED, true);
    String payload = prefs.getString(KEY_PAYLOAD, "");
    String hash = prefs.getString(KEY_HASH, "");
    long updatedAt = prefs.getLong(KEY_UPDATED_AT, 0L);
    if (payload == null) payload = "";
    if (hash == null || hash.isEmpty()) {
      hash = payload.isEmpty() ? "" : sha256(payload);
    }
    return new ConfigRecord(enabled, payload, hash, updatedAt);
  }

  static void setEnabled(Context context, boolean enabled) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs.edit().putBoolean(KEY_ENABLED, enabled).apply();
  }

  static void setPayload(Context context, String payload) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String hash = payload == null || payload.isEmpty() ? "" : sha256(payload);
    prefs.edit()
        .putString(KEY_PAYLOAD, payload)
        .putString(KEY_HASH, hash)
        .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
        .apply();
  }

  static void clear(Context context) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs.edit()
        .putString(KEY_PAYLOAD, "")
        .putString(KEY_HASH, "")
        .putLong(KEY_UPDATED_AT, 0L)
        .apply();
  }

  private static String sha256(String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
      return Base64.encodeToString(bytes, Base64.NO_WRAP);
    } catch (Exception ex) {
      return "";
    }
  }

  static class ConfigRecord {
    final boolean enabled;
    final String payload;
    final String hash;
    final long updatedAt;

    ConfigRecord(boolean enabled, String payload, String hash, long updatedAt) {
      this.enabled = enabled;
      this.payload = payload;
      this.hash = hash;
      this.updatedAt = updatedAt;
    }
  }
}
