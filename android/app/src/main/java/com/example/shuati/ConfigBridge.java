package com.example.shuati;

import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import javax.crypto.KeyGenerator;

@CapacitorPlugin(name = "ConfigBridge")
public class ConfigBridge extends Plugin {
  private static final String AUTHORITY = "com.example.shuati.configprovider";
  private static final Uri CONFIG_URI = Uri.parse("content://" + AUTHORITY + "/config");
  private static final String[] PROJECTION = new String[] {
      "enabled",
      "config_hash",
      "encrypted_payload",
      "updated_at"
  };

  private static final String PREFS = "config_bridge_prefs";
  private static final String KEY_DERIVED_ENC = "derived_enc";
  private static final String KEY_DERIVED_IV = "derived_iv";
  private static final String KEY_DERIVED_HASH = "derived_hash";
  private static final String KEY_CONFIG_ENC = "config_enc";
  private static final String KEY_CONFIG_IV = "config_iv";
  private static final String KEY_CONFIG_BASE = "config_base";
  private static final String KEY_CONFIG_MODEL = "config_model";
  private static final String KEY_CONFIG_MASK = "config_mask";
  private static final String KEYSTORE_ALIAS = "config_bridge_key";
  private static final String KEYSTORE_CONFIG_ALIAS = "config_blob_key";

  @PluginMethod
  public void getConfigMeta(PluginCall call) {
    ConfigRecord record = readConfig();
    JSObject ret = new JSObject();
    ret.put("enabled", record.enabled);
    if (record.configHash != null) {
      ret.put("configHash", record.configHash);
    }
    if (record.updatedAt > 0) {
      ret.put("updatedAt", record.updatedAt);
    }
    call.resolve(ret);
  }

  @PluginMethod
  public void decryptAndStoreConfig(PluginCall call) {
    ConfigRecord record = readConfig();
    if (!record.enabled) {
      JSObject ret = new JSObject();
      ret.put("error", "配置未启用");
      call.resolve(ret);
      return;
    }
    if (record.payload == null || record.payload.isEmpty()) {
      JSObject ret = new JSObject();
      ret.put("error", "未找到配置密文");
      call.resolve(ret);
      return;
    }

    String password = call.getString("password", null);
    if (password == null || password.isEmpty()) {
      byte[] derivedKey = loadDerivedKey(record.configHash);
      if (derivedKey == null) {
        JSObject ret = new JSObject();
        ret.put("needsPassword", true);
        call.resolve(ret);
        return;
      }
      try {
        String json = decryptPayloadWithKey(record.payload, derivedKey);
        JSObject stored = storeConfigInternal(json);
        call.resolve(stored);
      } catch (Exception ex) {
        clearDerivedKey();
        JSObject ret = new JSObject();
        ret.put("error", "解密失败，请重新输入密码");
        call.resolve(ret);
      }
      return;
    }

    try {
      DeriveResult derive = deriveKeyFromPayload(record.payload, password);
      String json = decryptPayloadWithKey(record.payload, derive.keyBytes);
      saveDerivedKey(derive.keyBytes, record.configHash);
      JSObject stored = storeConfigInternal(json);
      call.resolve(stored);
    } catch (Exception ex) {
      clearDerivedKey();
      JSObject ret = new JSObject();
      ret.put("error", "密码错误或解密失败");
      call.resolve(ret);
    }
  }

  @PluginMethod
  public void storeDecryptedConfig(PluginCall call) {
    String jsonString = call.getString("jsonString", null);
    if (jsonString == null || jsonString.trim().isEmpty()) {
      JSObject ret = new JSObject();
      ret.put("error", "空配置");
      call.resolve(ret);
      return;
    }
    try {
      JSObject stored = storeConfigInternal(jsonString);
      call.resolve(stored);
    } catch (Exception ex) {
      JSObject ret = new JSObject();
      ret.put("error", "配置解析失败");
      call.resolve(ret);
    }
  }

  @PluginMethod
  public void clearDecryptedConfig(PluginCall call) {
    clearConfigInternal();
    call.resolve();
  }

  @PluginMethod
  public void getStoredConfigMeta(PluginCall call) {
    SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String enc = prefs.getString(KEY_CONFIG_ENC, null);
    JSObject ret = new JSObject();
    ret.put("hasConfig", enc != null && !enc.isEmpty());
    String baseUrl = prefs.getString(KEY_CONFIG_BASE, null);
    String model = prefs.getString(KEY_CONFIG_MODEL, null);
    String mask = prefs.getString(KEY_CONFIG_MASK, null);
    if (baseUrl != null) ret.put("baseUrl", baseUrl);
    if (model != null) ret.put("model", model);
    if (mask != null) ret.put("maskedApiKey", mask);
    call.resolve(ret);
  }

  @PluginMethod
  public void aiProxyChat(PluginCall call) {
    String url = call.getString("url", null);
    String body = call.getString("body", null);
    JSObject headers = call.getObject("headers", new JSObject());
    if (url == null || body == null) {
      JSObject ret = new JSObject();
      ret.put("status", 0);
      ret.put("statusText", "InvalidRequest");
      ret.put("bodyText", "invalid request");
      call.resolve(ret);
      return;
    }
    StoredConfig config = loadStoredConfig();
    if (config == null || config.apiKey == null || config.apiKey.isEmpty()) {
      JSObject ret = new JSObject();
      ret.put("status", 0);
      ret.put("statusText", "MissingConfig");
      ret.put("bodyText", "missing config");
      call.resolve(ret);
      return;
    }

    try {
      HttpResult result = postJson(url, body, headers, config.apiKey);
      JSObject ret = new JSObject();
      ret.put("status", result.status);
      ret.put("statusText", result.statusText);
      ret.put("contentType", result.contentType);
      ret.put("requestId", result.requestId);
      ret.put("retryAfter", result.retryAfter);
      ret.put("bodyText", result.bodyText);
      call.resolve(ret);
    } catch (Exception ex) {
      JSObject ret = new JSObject();
      ret.put("status", 0);
      ret.put("statusText", "NetworkError");
      ret.put("bodyText", ex.getMessage());
      call.resolve(ret);
    }
  }

  private JSObject storeConfigInternal(String jsonString) throws Exception {
    JSONObject json = new JSONObject(jsonString);
    String apiKey = json.optString("API_KEY", "").trim();
    String baseUrl = json.optString("BASE_URL", "").trim();
    String model = json.optString("MODEL_ID", "").trim();
    if (apiKey.isEmpty() || baseUrl.isEmpty() || model.isEmpty()) {
      throw new IllegalArgumentException("Missing fields");
    }

    encryptAndStoreConfig(jsonString, baseUrl, model, apiKey);

    JSObject ret = new JSObject();
    ret.put("baseUrl", baseUrl);
    ret.put("model", model);
    ret.put("maskedApiKey", maskKey(apiKey));
    return ret;
  }

  private void clearConfigInternal() {
    SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs.edit()
        .remove(KEY_CONFIG_ENC)
        .remove(KEY_CONFIG_IV)
        .remove(KEY_CONFIG_BASE)
        .remove(KEY_CONFIG_MODEL)
        .remove(KEY_CONFIG_MASK)
        .apply();
  }

  private void encryptAndStoreConfig(String jsonString, String baseUrl, String model, String apiKey) throws Exception {
    SecretKey key = getOrCreateKey(KEYSTORE_CONFIG_ALIAS);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, key);
    byte[] iv = cipher.getIV();
    byte[] enc = cipher.doFinal(jsonString.getBytes(StandardCharsets.UTF_8));

    SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs.edit()
        .putString(KEY_CONFIG_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
        .putString(KEY_CONFIG_ENC, Base64.encodeToString(enc, Base64.NO_WRAP))
        .putString(KEY_CONFIG_BASE, baseUrl)
        .putString(KEY_CONFIG_MODEL, model)
        .putString(KEY_CONFIG_MASK, maskKey(apiKey))
        .apply();
  }

  private StoredConfig loadStoredConfig() {
    SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String ivB64 = prefs.getString(KEY_CONFIG_IV, null);
    String encB64 = prefs.getString(KEY_CONFIG_ENC, null);
    if (ivB64 == null || encB64 == null) {
      return null;
    }
    try {
      SecretKey key = getOrCreateKey(KEYSTORE_CONFIG_ALIAS);
      byte[] iv = Base64.decode(ivB64, Base64.DEFAULT);
      byte[] enc = Base64.decode(encB64, Base64.DEFAULT);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, key, new javax.crypto.spec.GCMParameterSpec(128, iv));
      byte[] dec = cipher.doFinal(enc);
      String jsonString = new String(dec, StandardCharsets.UTF_8);
      JSONObject json = new JSONObject(jsonString);
      String apiKey = json.optString("API_KEY", "").trim();
      String baseUrl = json.optString("BASE_URL", "").trim();
      String model = json.optString("MODEL_ID", "").trim();
      if (apiKey.isEmpty() || baseUrl.isEmpty() || model.isEmpty()) {
        return null;
      }
      return new StoredConfig(apiKey, baseUrl, model);
    } catch (Exception ex) {
      return null;
    }
  }

  private ConfigRecord readConfig() {
    Context context = getContext();
    ContentResolver resolver = context.getContentResolver();
    Cursor cursor = null;
    try {
      cursor = resolver.query(CONFIG_URI, PROJECTION, null, null, null);
      if (cursor == null || !cursor.moveToFirst()) {
        return ConfigRecord.disabled();
      }
      boolean enabled = cursor.getInt(0) == 1;
      String hash = cursor.isNull(1) ? null : cursor.getString(1);
      String payload = cursor.isNull(2) ? null : cursor.getString(2);
      long updatedAt = cursor.isNull(3) ? 0L : cursor.getLong(3);
      return new ConfigRecord(enabled, hash, payload, updatedAt);
    } catch (Exception ex) {
      return ConfigRecord.disabled();
    } finally {
      if (cursor != null) {
        cursor.close();
      }
    }
  }

  private DeriveResult deriveKeyFromPayload(String payload, String password) throws Exception {
    String[] parts = payload.split("\\|");
    if (parts.length < 4) {
      throw new IllegalArgumentException("Invalid payload");
    }
    byte[] salt = Base64.decode(parts[0], Base64.DEFAULT);
    int iterations = Integer.parseInt(parts[2]);
    PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, 256);
    SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
    byte[] keyBytes = factory.generateSecret(spec).getEncoded();
    return new DeriveResult(keyBytes, iterations);
  }

  private String decryptPayloadWithKey(String payload, byte[] keyBytes) throws Exception {
    String[] parts = payload.split("\\|");
    if (parts.length < 4) {
      throw new IllegalArgumentException("Invalid payload");
    }
    byte[] iv = Base64.decode(parts[1], Base64.DEFAULT);
    byte[] cipherBytes = Base64.decode(parts[3], Base64.DEFAULT);

    SecretKeySpec keySpec = new SecretKeySpec(keyBytes, "AES");
    Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
    cipher.init(Cipher.DECRYPT_MODE, keySpec, new IvParameterSpec(iv));
    byte[] jsonBytes = cipher.doFinal(cipherBytes);
    return new String(jsonBytes, StandardCharsets.UTF_8);
  }

  private void saveDerivedKey(byte[] keyBytes, String configHash) throws Exception {
    SecretKey key = getOrCreateKey(KEYSTORE_ALIAS);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, key);
    byte[] iv = cipher.getIV();
    byte[] enc = cipher.doFinal(keyBytes);

    SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs.edit()
        .putString(KEY_DERIVED_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
        .putString(KEY_DERIVED_ENC, Base64.encodeToString(enc, Base64.NO_WRAP))
        .putString(KEY_DERIVED_HASH, configHash == null ? "" : configHash)
        .apply();
  }

  private byte[] loadDerivedKey(String configHash) {
    SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String ivB64 = prefs.getString(KEY_DERIVED_IV, null);
    String encB64 = prefs.getString(KEY_DERIVED_ENC, null);
    String savedHash = prefs.getString(KEY_DERIVED_HASH, "");
    if (ivB64 == null || encB64 == null) {
      return null;
    }
    if (configHash != null && !configHash.isEmpty() && !configHash.equals(savedHash)) {
      clearDerivedKey();
      return null;
    }
    try {
      SecretKey key = getOrCreateKey(KEYSTORE_ALIAS);
      byte[] iv = Base64.decode(ivB64, Base64.DEFAULT);
      byte[] enc = Base64.decode(encB64, Base64.DEFAULT);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, key, new javax.crypto.spec.GCMParameterSpec(128, iv));
      return cipher.doFinal(enc);
    } catch (Exception ex) {
      clearDerivedKey();
      return null;
    }
  }

  private void clearDerivedKey() {
    SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs.edit().remove(KEY_DERIVED_IV).remove(KEY_DERIVED_ENC).remove(KEY_DERIVED_HASH).apply();
  }

  private SecretKey getOrCreateKey(String alias) throws Exception {
    KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
    keyStore.load(null);
    if (!keyStore.containsAlias(alias)) {
      KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
          alias,
          KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setRandomizedEncryptionRequired(true)
          .build();
      keyGenerator.init(spec);
      keyGenerator.generateKey();
    }
    return (SecretKey) keyStore.getKey(alias, null);
  }

  private String maskKey(String apiKey) {
    if (apiKey == null) return "";
    String trimmed = apiKey.trim();
    if (trimmed.length() <= 6) return "******";
    String suffix = trimmed.substring(trimmed.length() - 4);
    return "****" + suffix;
  }

  private HttpResult postJson(String urlStr, String body, JSObject headers, String apiKey) throws Exception {
    URL url = new URL(urlStr);
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setRequestMethod("POST");
    conn.setConnectTimeout(10000);
    conn.setReadTimeout(20000);
    conn.setDoOutput(true);
    conn.setRequestProperty("Content-Type", "application/json");
    conn.setRequestProperty("Authorization", "Bearer " + apiKey);
    if (headers != null) {
      java.util.Iterator<String> it = headers.keys();
      while (it.hasNext()) {
        String key = it.next();
        Object val = headers.get(key);
        if (val != null) {
          conn.setRequestProperty(key, String.valueOf(val));
        }
      }
    }

    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    OutputStream os = conn.getOutputStream();
    os.write(bytes);
    os.flush();
    os.close();

    int status = conn.getResponseCode();
    String statusText = conn.getResponseMessage();
    String contentType = conn.getHeaderField("Content-Type");
    String requestId = conn.getHeaderField("x-request-id");
    if (requestId == null) requestId = conn.getHeaderField("x-requestid");
    String retryAfter = conn.getHeaderField("Retry-After");

    InputStream stream = status >= 200 && status < 300 ? conn.getInputStream() : conn.getErrorStream();
    String bodyText = readStream(stream);
    conn.disconnect();

    return new HttpResult(status, statusText, contentType, requestId, retryAfter, bodyText);
  }

  private String readStream(InputStream stream) throws Exception {
    if (stream == null) return "";
    BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
    StringBuilder sb = new StringBuilder();
    String line;
    while ((line = reader.readLine()) != null) {
      sb.append(line).append("\n");
    }
    reader.close();
    return sb.toString();
  }

  private static class DeriveResult {
    final byte[] keyBytes;
    final int iterations;

    DeriveResult(byte[] keyBytes, int iterations) {
      this.keyBytes = keyBytes;
      this.iterations = iterations;
    }
  }

  private static class StoredConfig {
    final String apiKey;
    final String baseUrl;
    final String model;

    StoredConfig(String apiKey, String baseUrl, String model) {
      this.apiKey = apiKey;
      this.baseUrl = baseUrl;
      this.model = model;
    }
  }

  private static class HttpResult {
    final int status;
    final String statusText;
    final String contentType;
    final String requestId;
    final String retryAfter;
    final String bodyText;

    HttpResult(int status, String statusText, String contentType, String requestId, String retryAfter, String bodyText) {
      this.status = status;
      this.statusText = statusText;
      this.contentType = contentType;
      this.requestId = requestId;
      this.retryAfter = retryAfter;
      this.bodyText = bodyText;
    }
  }

  private static class ConfigRecord {
    final boolean enabled;
    final String configHash;
    final String payload;
    final long updatedAt;

    ConfigRecord(boolean enabled, String configHash, String payload, long updatedAt) {
      this.enabled = enabled;
      this.configHash = configHash;
      this.payload = payload;
      this.updatedAt = updatedAt;
    }

    static ConfigRecord disabled() {
      return new ConfigRecord(false, null, null, 0L);
    }
  }
}
