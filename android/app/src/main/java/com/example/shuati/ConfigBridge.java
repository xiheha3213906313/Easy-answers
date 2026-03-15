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
  private static final String KEY_PASS_ENC = "password_enc";
  private static final String KEY_PASS_IV = "password_iv";
  private static final String KEYSTORE_ALIAS = "config_bridge_key";

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
  public void decryptConfig(PluginCall call) {
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
      password = loadPassword();
      if (password == null || password.isEmpty()) {
        JSObject ret = new JSObject();
        ret.put("needsPassword", true);
        call.resolve(ret);
        return;
      }
    }

    try {
      String json = decryptPayload(record.payload, password);
      savePassword(password);
      JSObject ret = new JSObject();
      ret.put("jsonString", json);
      call.resolve(ret);
    } catch (Exception ex) {
      clearPassword();
      JSObject ret = new JSObject();
      ret.put("error", "密码错误或解密失败");
      call.resolve(ret);
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

  private String decryptPayload(String payload, String password) throws Exception {
    String[] parts = payload.split("\\|");
    if (parts.length < 4) {
      throw new IllegalArgumentException("Invalid payload");
    }
    byte[] salt = Base64.decode(parts[0], Base64.DEFAULT);
    byte[] iv = Base64.decode(parts[1], Base64.DEFAULT);
    int iterations = Integer.parseInt(parts[2]);
    byte[] cipherBytes = Base64.decode(parts[3], Base64.DEFAULT);

    PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, 256);
    SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
    byte[] keyBytes = factory.generateSecret(spec).getEncoded();
    SecretKeySpec keySpec = new SecretKeySpec(keyBytes, "AES");

    Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
    cipher.init(Cipher.DECRYPT_MODE, keySpec, new IvParameterSpec(iv));
    byte[] jsonBytes = cipher.doFinal(cipherBytes);
    return new String(jsonBytes, StandardCharsets.UTF_8);
  }

  private void savePassword(String password) throws Exception {
    SecretKey key = getOrCreateKey();
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, key);
    byte[] iv = cipher.getIV();
    byte[] enc = cipher.doFinal(password.getBytes(StandardCharsets.UTF_8));

    SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs.edit()
        .putString(KEY_PASS_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
        .putString(KEY_PASS_ENC, Base64.encodeToString(enc, Base64.NO_WRAP))
        .apply();
  }

  private String loadPassword() {
    SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String ivB64 = prefs.getString(KEY_PASS_IV, null);
    String encB64 = prefs.getString(KEY_PASS_ENC, null);
    if (ivB64 == null || encB64 == null) {
      return null;
    }
    try {
      SecretKey key = getOrCreateKey();
      byte[] iv = Base64.decode(ivB64, Base64.DEFAULT);
      byte[] enc = Base64.decode(encB64, Base64.DEFAULT);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, key, new javax.crypto.spec.GCMParameterSpec(128, iv));
      byte[] dec = cipher.doFinal(enc);
      return new String(dec, StandardCharsets.UTF_8);
    } catch (Exception ex) {
      clearPassword();
      return null;
    }
  }

  private void clearPassword() {
    SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs.edit().remove(KEY_PASS_IV).remove(KEY_PASS_ENC).apply();
  }

  private SecretKey getOrCreateKey() throws Exception {
    KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
    keyStore.load(null);
    if (!keyStore.containsAlias(KEYSTORE_ALIAS)) {
      KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
          KEYSTORE_ALIAS,
          KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setRandomizedEncryptionRequired(true)
          .build();
      keyGenerator.init(spec);
      keyGenerator.generateKey();
    }
    return (SecretKey) keyStore.getKey(KEYSTORE_ALIAS, null);
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
