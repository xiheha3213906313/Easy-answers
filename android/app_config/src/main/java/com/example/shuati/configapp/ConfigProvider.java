package com.example.shuati.configapp;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Binder;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.text.TextUtils;
import android.util.Log;
import java.util.Arrays;

import com.example.shuati.configapp.security.SecurityGuard;

public class ConfigProvider extends ContentProvider {
  private static final String TAG = "ConfigProvider";
  private static final String[] COLUMNS = new String[] {
      "enabled",
      "config_hash",
      "encrypted_payload",
      "updated_at"
  };
  private static final String[] DIAG_COLUMNS = new String[] {
      "reason",
      "details",
      "enabled",
      "config_hash",
      "updated_at",
      "caller_uid",
      "caller_packages"
  };
  private static final String DIAG_PATH = "/diagnostics";

  @Override
  public boolean onCreate() {
    Context context = getContext();
    if (context != null) {
      ConfigStorage.ensureDefaults(context);
    }
    return true;
  }

  @Override
  public Cursor query(
      Uri uri,
      String[] projection,
      String selection,
      String[] selectionArgs,
      String sortOrder
  ) {
    Context context = getContext();
    if (uri != null && DIAG_PATH.equals(uri.getPath())) {
      return buildDiagnosticsCursor(context);
    }
    MatrixCursor cursor = new MatrixCursor(COLUMNS, 1);
    if (context == null) {
      Log.w(TAG, "Query blocked: context is null");
      cursor.addRow(new Object[] {0, null, null, 0L});
      return cursor;
    }
    if (SecurityGuard.isCompromised(context)) {
      String reasons = SecurityGuard.getDetectionReasonSummary(context);
      Log.w(TAG, "Query blocked: compromised=" + (reasons.isEmpty() ? "unknown" : reasons));
      cursor.addRow(new Object[] {0, null, null, 0L});
      return cursor;
    }
    if (!isCallerTrusted(context)) {
      Log.w(TAG, "Query blocked: caller not trusted");
      cursor.addRow(new Object[] {0, null, null, 0L});
      return cursor;
    }

    ConfigStorage.ConfigRecord record = ConfigStorage.read(context);
    if (!record.enabled) {
      Log.w(TAG, "Query blocked: config disabled | updatedAt=" + record.updatedAt);
      cursor.addRow(new Object[] {0, null, null, record.updatedAt});
      return cursor;
    }

    String payload = record.payload == null || record.payload.isEmpty() ? null : record.payload;
    String hash = record.hash == null || record.hash.isEmpty() ? null : record.hash;
    if (hash == null || hash.isEmpty()) {
      Log.w(TAG, "Query returned empty hash | updatedAt=" + record.updatedAt);
    }
    cursor.addRow(new Object[] {1, hash, payload, record.updatedAt});
    return cursor;
  }

  @Override
  public String getType(Uri uri) {
    return "vnd.android.cursor.item/vnd.com.example.shuati.config";
  }

  @Override
  public Uri insert(Uri uri, ContentValues values) {
    throw new UnsupportedOperationException("Not supported");
  }

  @Override
  public int delete(Uri uri, String selection, String[] selectionArgs) {
    throw new UnsupportedOperationException("Not supported");
  }

  @Override
  public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
    throw new UnsupportedOperationException("Not supported");
  }

  private boolean isCallerTrusted(Context context) {
    int callingUid = Binder.getCallingUid();
    String[] packages = context.getPackageManager().getPackagesForUid(callingUid);
    if (packages == null || packages.length == 0) {
      Log.w(TAG, "Caller trust check failed: no packages for uid=" + callingUid);
      return false;
    }
    for (String pkg : packages) {
      int check = context.getPackageManager().checkSignatures(context.getPackageName(), pkg);
      Log.w(TAG, "Caller signature check | uid=" + callingUid + " pkg=" + pkg + " result=" + check);
      if (check == PackageManager.SIGNATURE_MATCH) {
        return true;
      }
    }
    return false;
  }

  private Cursor buildDiagnosticsCursor(Context context) {
    MatrixCursor cursor = new MatrixCursor(DIAG_COLUMNS, 1);
    if (context == null) {
      cursor.addRow(new Object[] {"context_null", "", 0, null, 0L, -1, ""});
      return cursor;
    }

    int callingUid = Binder.getCallingUid();
    String[] packages = context.getPackageManager().getPackagesForUid(callingUid);
    String pkgList = packages == null ? "" : TextUtils.join(",", packages);

    boolean compromised = SecurityGuard.isCompromised(context);
    if (compromised) {
      String reasons = SecurityGuard.getDetectionReasonSummary(context);
      cursor.addRow(new Object[] {"compromised", reasons, 0, null, 0L, callingUid, pkgList});
      return cursor;
    }

    boolean trusted = isCallerTrusted(context);
    if (!trusted) {
      String details = packages == null ? "no_packages" : "packages=" + Arrays.toString(packages);
      cursor.addRow(new Object[] {"untrusted", details, 0, null, 0L, callingUid, pkgList});
      return cursor;
    }

    ConfigStorage.ConfigRecord record = ConfigStorage.read(context);
    if (!record.enabled) {
      cursor.addRow(new Object[] {"disabled", "", 0, null, record.updatedAt, callingUid, pkgList});
      return cursor;
    }

    String hash = record.hash == null || record.hash.isEmpty() ? null : record.hash;
    if (hash == null) {
      cursor.addRow(new Object[] {"empty_hash", "", 1, null, record.updatedAt, callingUid, pkgList});
      return cursor;
    }

    cursor.addRow(new Object[] {"ok", "", 1, hash, record.updatedAt, callingUid, pkgList});
    return cursor;
  }
}
