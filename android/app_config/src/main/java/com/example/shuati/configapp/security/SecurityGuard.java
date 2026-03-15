package com.example.shuati.configapp.security;

import android.app.Activity;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.widget.Toast;
import androidx.appcompat.app.AlertDialog;


import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.ArrayList;
import java.util.Set;
import java.lang.reflect.Method;

public final class SecurityGuard {
  private static final String[] ROOT_PATHS = new String[] {
      "/system/bin/su",
      "/system/xbin/su",
      "/sbin/su",
      "/system/sd/xbin/su",
      "/system/bin/failsafe/su",
      "/data/local/su",
      "/data/local/bin/su",
      "/data/local/xbin/su",
      "/su/bin/su",
      "/system/app/Superuser.apk",
      "/system/app/SuperSU.apk",
      "/system/app/Magisk.apk",
      "/system/priv-app/Magisk.apk",
      "/sbin/.magisk",
      "/data/adb/magisk"
  };

  private static final String[] SUSPECT_BINARIES = new String[] {
      "/system/bin/daemonsu",
      "/system/xbin/daemonsu",
      "/system/bin/.ext/.su",
      "/system/bin/.ext",
      "/system/bin/su",
      "/system/xbin/su",
      "/sbin/su",
      "/su/bin/su",
      "/system/bin/magisk",
      "/sbin/magisk",
      "/data/adb/magisk/magisk",
      "/data/adb/ksu",
      "/data/adb/ksud",
      "/data/adb/ap",
      "/data/adb/apd"
  };

  private static final Set<String> SUSPECT_PACKAGES = new HashSet<>(Arrays.asList(
      "com.topjohnwu.magisk",
      "com.topjohnwu.magisk.debug",
      "io.github.vvb2060.magisk",
      "me.weishu.magisk",
      "com.koushikdutta.superuser",
      "com.noshufou.android.su",
      "eu.chainfire.supersu",
      "eu.chainfire.supersu.pro",
      "com.thirdparty.superuser",
      "com.yellowes.su",
      "com.kingroot.kinguser",
      "com.kingroot.kinguser.activity",
      "com.kingroot.krhelper",
      "com.kunlun.root",
      "com.smedialink.oneclickroot",
      "com.zachspong.temprootremovejb",
      "com.ramdroid.appquarantine",
      "de.robv.android.xposed.installer",
      "org.lsposed.manager",
      "org.meowcat.edxposed.manager",
      "com.android.vending.billing.InAppBillingService.LOCK",
      "com.devadvance.rootcloak",
      "io.github.huskydg.magisk",
      "io.github.vvb2060.magisk",
      "com.zhiliaoapp.musically.magisk",
      "me.bmax.apatch",
      "me.bmax.apatch.ui",
      "me.bmax.apatch.module",
      "com.rikka.safetynetfix",
      "org.lsposed.lsposedmanager",
      "org.lsposed.manager",
      "com.github.kyuubiran.ezxhelper",
      "com.rikka.hidden"
  ));

  private static final String[] SUSPECT_MAPS = new String[] {
      "magisk",
      "zygisk",
      "ksu",
      "kernelsu",
      "apatch",
      "riru",
      "lsposed",
      "edxposed",
      "xposed",
      "frida",
      "substrate",
      "v4a"
  };

  private SecurityGuard() {}

  public static boolean shouldBlockBeforeCreate(Activity activity) {
    if (!isCompromised(activity)) {
      return false;
    }
    List<String> reasons = getDetectionReasonsDetailed(activity);
    String message = "检测到环境异常";
    if (!reasons.isEmpty()) {
      message = "检测到环境异常: " + joinReasons(reasons);
    } else {
      message = "检测到环境异常，但未命中具体项（可能被隐藏或权限受限）";
    }
    final String dialogMessage = message;
    if (!isDebuggable(activity)) {
      try {
        activity.runOnUiThread(() ->
            Toast.makeText(activity, "检测到环境异常，应用即将退出", Toast.LENGTH_LONG).show()
        );
      } catch (Exception ignored) {
      }
      return true;
    }
    return false;
  }

  public static void showDebugDialogIfNeeded(Activity activity) {
    if (!isCompromised(activity)) {
      return;
    }
    if (!isDebuggable(activity)) {
      return;
    }
    List<String> reasons = getDetectionReasonsDetailed(activity);
    String message = "检测到环境异常";
    if (!reasons.isEmpty()) {
      message = "检测到环境异常: " + joinReasons(reasons);
    } else {
      message = "检测到环境异常，但未命中具体项（可能被隐藏或权限受限）";
    }
    final String dialogMessage = message;
    try {
      activity.runOnUiThread(() -> new AlertDialog.Builder(activity)
          .setTitle("环境异常")
          .setMessage(dialogMessage)
          .setPositiveButton("确定", (d, w) -> d.dismiss())
          .setCancelable(true)
          .show());
    } catch (Exception ignored) {
    }
  }

  public static boolean isCompromised(Context context) {
    return isRooted()
        || isBootloaderUnlocked()
        || isDebuggable(context)
        || isSelinuxPermissive()
        || hasSuspiciousPackages(context)
        || hasSuspiciousMounts()
        || hasSuspiciousMaps()
        || hasDangerousProps();
  }

  private static List<String> getDetectionReasonsDetailed(Context context) {
    List<String> reasons = new ArrayList<>();
    String tags = Build.TAGS;
    if (tags != null && tags.contains("test-keys")) {
      reasons.add("build tags:test-keys");
    }
    for (String path : ROOT_PATHS) {
      if (new File(path).exists()) {
        reasons.add("file:" + path);
      }
    }
    for (String path : SUSPECT_BINARIES) {
      if (new File(path).exists()) {
        reasons.add("file:" + path);
      }
    }
    if (canExecuteSu()) {
      reasons.add("which su:found");
    }

    String vbmeta = getSystemProperty("ro.boot.vbmeta.device_state");
    if ("unlocked".equalsIgnoreCase(vbmeta)) {
      reasons.add("prop ro.boot.vbmeta.device_state=unlocked");
    }
    String verified = getSystemProperty("ro.boot.verifiedbootstate");
    if ("orange".equalsIgnoreCase(verified) || "yellow".equalsIgnoreCase(verified)) {
      reasons.add("prop ro.boot.verifiedbootstate=" + verified);
    }
    String flashLocked = getSystemProperty("ro.boot.flash.locked");
    if ("0".equals(flashLocked)) {
      reasons.add("prop ro.boot.flash.locked=0");
    }
    String bootLocked = getSystemProperty("ro.boot.locked");
    if ("0".equals(bootLocked)) {
      reasons.add("prop ro.boot.locked=0");
    }

    if (isDebuggable(context)) {
      reasons.add("flag debuggable");
    }

    String selinux = getSystemProperty("ro.build.selinux");
    if ("0".equals(selinux)) {
      reasons.add("prop ro.build.selinux=0");
    } else {
      String enforce = readFirstLine("/sys/fs/selinux/enforce");
      if ("0".equals(enforce)) {
        reasons.add("selinux enforce=0");
      }
    }

    PackageManager pm = context.getPackageManager();
    for (String pkg : SUSPECT_PACKAGES) {
      try {
        pm.getPackageInfo(pkg, 0);
        reasons.add("pkg:" + pkg);
      } catch (PackageManager.NameNotFoundException ignored) {
      } catch (Exception ignored) {
      }
    }

    String mountLine = findSuspiciousMountLine();
    if (mountLine != null) {
      reasons.add("mount:" + shorten(mountLine));
    }

    String mapLine = findSuspiciousMapLine();
    if (mapLine != null) {
      reasons.add("maps:" + shorten(mapLine));
    }

    String debuggable = getSystemProperty("ro.debuggable");
    if ("1".equals(debuggable)) {
      reasons.add("prop ro.debuggable=1");
    }
    String secure = getSystemProperty("ro.secure");
    if ("0".equals(secure)) {
      reasons.add("prop ro.secure=0");
    }
    String adb = getSystemProperty("persist.sys.usb.config");
    if (adb != null && adb.contains("adb") && "1".equals(debuggable)) {
      reasons.add("prop persist.sys.usb.config=" + adb);
    }
    return reasons;
  }

  private static String joinReasons(List<String> reasons) {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < reasons.size(); i++) {
      if (i > 0) sb.append("、");
      sb.append(reasons.get(i));
    }
    return sb.toString();
  }

  private static boolean isRooted() {
    String tags = Build.TAGS;
    if (tags != null && tags.contains("test-keys")) {
      return true;
    }
    for (String path : ROOT_PATHS) {
      if (new File(path).exists()) {
        return true;
      }
    }
    for (String path : SUSPECT_BINARIES) {
      if (new File(path).exists()) {
        return true;
      }
    }
    return canExecuteSu();
  }

  private static boolean isBootloaderUnlocked() {
    String vbmeta = getSystemProperty("ro.boot.vbmeta.device_state");
    if ("unlocked".equalsIgnoreCase(vbmeta)) {
      return true;
    }
    String verified = getSystemProperty("ro.boot.verifiedbootstate");
    if ("orange".equalsIgnoreCase(verified) || "yellow".equalsIgnoreCase(verified)) {
      return true;
    }
    String flashLocked = getSystemProperty("ro.boot.flash.locked");
    if ("0".equals(flashLocked)) {
      return true;
    }
    String bootLocked = getSystemProperty("ro.boot.locked");
    return "0".equals(bootLocked);
  }

  private static boolean isDebuggable(Context context) {
    try {
      ApplicationInfo info = context.getApplicationInfo();
      return (info.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    } catch (Exception ignored) {
      return false;
    }
  }

  private static boolean isSelinuxPermissive() {
    String selinux = getSystemProperty("ro.build.selinux");
    if ("0".equals(selinux)) {
      return true;
    }
    BufferedReader reader = null;
    try {
      reader = new BufferedReader(new InputStreamReader(new FileInputStream("/sys/fs/selinux/enforce")));
      String line = reader.readLine();
      return line != null && line.trim().equals("0");
    } catch (Exception ignored) {
      return false;
    } finally {
      try {
        if (reader != null) reader.close();
      } catch (Exception ignored) {
      }
    }
  }

  private static boolean hasSuspiciousPackages(Context context) {
    PackageManager pm = context.getPackageManager();
    for (String pkg : SUSPECT_PACKAGES) {
      try {
        pm.getPackageInfo(pkg, 0);
        return true;
      } catch (PackageManager.NameNotFoundException ignored) {
      } catch (Exception ignored) {
      }
    }
    return false;
  }

  private static boolean hasSuspiciousMounts() {
    return findSuspiciousMountLine() != null;
  }

  private static boolean hasSuspiciousMaps() {
    return findSuspiciousMapLine() != null;
  }

  private static boolean hasDangerousProps() {
    String debuggable = getSystemProperty("ro.debuggable");
    if ("1".equals(debuggable)) {
      return true;
    }
    String secure = getSystemProperty("ro.secure");
    if ("0".equals(secure)) {
      return true;
    }
    String adb = getSystemProperty("persist.sys.usb.config");
    return adb != null && adb.contains("adb") && "1".equals(debuggable);
  }

  private static String getSystemProperty(String key) {
    try {
      Class<?> sp = Class.forName("android.os.SystemProperties");
      Method get = sp.getMethod("get", String.class, String.class);
      return (String) get.invoke(null, key, "");
    } catch (Exception ignored) {
      return "";
    }
  }

  private static boolean canExecuteSu() {
    java.lang.Process process = null;
    try {
      process = Runtime.getRuntime().exec(new String[] {"sh", "-c", "which su"});
      BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
      String line = reader.readLine();
      return line != null && !line.trim().isEmpty();
    } catch (Exception ignored) {
      return false;
    } finally {
      if (process != null) {
        process.destroy();
      }
    }
  }

  private static String readFirstLine(String path) {
    BufferedReader reader = null;
    try {
      reader = new BufferedReader(new InputStreamReader(new FileInputStream(path)));
      return reader.readLine();
    } catch (Exception ignored) {
      return null;
    } finally {
      try {
        if (reader != null) reader.close();
      } catch (Exception ignored) {
      }
    }
  }

  private static String shorten(String value) {
    if (value == null) return null;
    int max = 120;
    if (value.length() <= max) return value;
    return value.substring(0, max) + "...";
  }

  private static String findSuspiciousMountLine() {
    BufferedReader reader = null;
    try {
      reader = new BufferedReader(new InputStreamReader(new FileInputStream("/proc/mounts")));
      String line;
      while ((line = reader.readLine()) != null) {
        String lower = line.toLowerCase();
        if (lower.contains("magisk") || lower.contains("zygisk") || lower.contains("kernelsu")
            || lower.contains("ksu") || lower.contains("apatch")) {
          return line;
        }
      }
    } catch (Exception ignored) {
    } finally {
      try {
        if (reader != null) reader.close();
      } catch (Exception ignored) {
      }
    }
    return null;
  }

  private static String findSuspiciousMapLine() {
    BufferedReader reader = null;
    try {
      reader = new BufferedReader(new InputStreamReader(new FileInputStream("/proc/self/maps")));
      String line;
      while ((line = reader.readLine()) != null) {
        String lower = line.toLowerCase();
        for (String s : SUSPECT_MAPS) {
          if (!lower.contains(s)) continue;
          if (lower.contains("/system/") || lower.contains("/apex/")) {
            continue;
          }
          if (lower.contains("/data/") || lower.contains("/dev/") || lower.contains("/proc/")) {
            return line;
          }
        }
      }
    } catch (Exception ignored) {
    } finally {
      try {
        if (reader != null) reader.close();
      } catch (Exception ignored) {
      }
    }
    return null;
  }
}
