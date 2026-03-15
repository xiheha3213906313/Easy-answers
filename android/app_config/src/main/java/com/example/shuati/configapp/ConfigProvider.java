package com.example.shuati.configapp;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Binder;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;

public class ConfigProvider extends ContentProvider {
  private static final String[] COLUMNS = new String[] {
      "enabled",
      "config_hash",
      "encrypted_payload",
      "updated_at"
  };

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
    MatrixCursor cursor = new MatrixCursor(COLUMNS, 1);
    if (context == null) {
      cursor.addRow(new Object[] {0, null, null, 0L});
      return cursor;
    }
    if (!isCallerTrusted(context)) {
      cursor.addRow(new Object[] {0, null, null, 0L});
      return cursor;
    }

    ConfigStorage.ConfigRecord record = ConfigStorage.read(context);
    if (!record.enabled) {
      cursor.addRow(new Object[] {0, null, null, record.updatedAt});
      return cursor;
    }

    String payload = record.payload == null || record.payload.isEmpty() ? null : record.payload;
    String hash = record.hash == null || record.hash.isEmpty() ? null : record.hash;
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
    if (packages == null || packages.length == 0) return false;
    for (String pkg : packages) {
      if (context.getPackageManager().checkSignatures(context.getPackageName(), pkg)
          == PackageManager.SIGNATURE_MATCH) {
        return true;
      }
    }
    return false;
  }
}
