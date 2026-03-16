import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Link, useLocation } from 'react-router-dom';
import { ConfigAdminBridge } from '../native/configBridge';
import { alertDialog, confirmDialog } from '../store/confirmStore';
import { useSettingsStore } from '../store/settingsStore';

const Config: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [hasPayload, setHasPayload] = useState(false);
  const [configHash, setConfigHash] = useState('');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [payloadInput, setPayloadInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const location = useLocation();
  const hasNotifiedRef = useRef(false);
  const firstPromptRef = useRef(false);
  const { firstLaunchPrompted, setFirstLaunchPrompted } = useSettingsStore();

  const nativeAvailable = useMemo(() => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('ConfigAdminBridge'), []);
  const fromApp1 = useMemo(() => new URLSearchParams(location.search).get('from') === 'app1', [location.search]);

  const refreshState = useCallback(async () => {
    if (!nativeAvailable) return;
    const state = await ConfigAdminBridge.getConfigState();
    setEnabled(state.enabled);
    setHasPayload(state.hasPayload);
    setConfigHash(state.configHash ?? '');
    setUpdatedAt(state.updatedAt ?? null);
  }, [nativeAvailable]);

  useEffect(() => {
    if (!nativeAvailable) {
      setLoading(false);
      return;
    }
    refreshState().finally(() => setLoading(false));
  }, [nativeAvailable, refreshState]);

  useEffect(() => {
    if (!fromApp1 || loading || !nativeAvailable) return;
    if (!enabled || hasNotifiedRef.current) return;
    hasNotifiedRef.current = true;
    void alertDialog('分发功能已启用，点击确定返回轻松答案', { title: '提示', confirmText: '确定' }).then(() => {
      void ConfigAdminBridge.openMainApp();
    });
  }, [fromApp1, loading, enabled, nativeAvailable]);

  useEffect(() => {
    if (!nativeAvailable) return;
    if (fromApp1) {
      if (!firstLaunchPrompted) {
        setFirstLaunchPrompted(true);
      }
      return;
    }
    if (firstLaunchPrompted || firstPromptRef.current) return;
    firstPromptRef.current = true;
    const run = async () => {
      try {
        const res = await ConfigAdminBridge.isMainAppInstalled();
        if (!res?.installed) return;
        const ok = await confirmDialog({
          title: '提示',
          message: '检测到轻松答案，是否前往快速导入配置',
          confirmText: '前往',
          cancelText: '取消'
        });
        setFirstLaunchPrompted(true);
        if (!ok) return;
        await ConfigAdminBridge.openMainApp();
      } catch {
        // no-op
      }
    };
    void run();
  }, [firstLaunchPrompted, fromApp1, nativeAvailable, setFirstLaunchPrompted]);

  const handleToggle = async (next: boolean) => {
    if (!nativeAvailable) return;
    setEnabled(next);
    await ConfigAdminBridge.setEnabled({ enabled: next });
  };

  const handleSavePayload = async () => {
    if (!nativeAvailable) return;
    const trimmed = payloadInput.trim();
    if (!trimmed) {
      void alertDialog('请输入密文字符串');
      return;
    }
    await ConfigAdminBridge.setPayload({ payload: trimmed });
    setPayloadInput('');
    await refreshState();
    void alertDialog('配置密文已保存', { title: '保存成功', confirmText: '好的' });
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      setPayloadInput(content.trim());
    };
    reader.onerror = () => {
      void alertDialog('读取文件失败');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClear = async () => {
    if (!nativeAvailable) return;
    const ok = await confirmDialog({
      title: '删除配置',
      message: '确定要删除当前配置密文吗？删除后原软件将无法读取配置。',
      confirmText: '删除',
      cancelText: '取消'
    });
    if (!ok) return;
    await ConfigAdminBridge.clearConfig();
    await refreshState();
    void alertDialog('配置已删除', { title: '删除成功', confirmText: '好的' });
  };

  const updatedLabel = updatedAt ? new Date(updatedAt).toLocaleString() : '未设置';

  return (
    <div className="page-container settings-page chapter-page">
      <div className="w-full max-w-4xl mx-auto box-border px-1 sm:px-0">
        <div className="chapter-header">
          <Link to="/" className="icon-button" aria-label="返回首页">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="chapter-title">配置中心</div>
          <div className="chapter-spacer" />
        </div>

        {!nativeAvailable && (
          <div className="settings-section">
            <div className="settings-title">仅支持 App2 使用</div>
            <div className="settings-sub">该页面仅在配置软件中生效。</div>
          </div>
        )}

        {nativeAvailable && (
          <>
            <div className="settings-section">
              <div className="settings-row">
                <div>
                  <div className="settings-title">分发功能</div>
                  <div className="settings-sub">开启后，轻松答案将能够读取配置密文</div>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={enabled} onChange={(e) => handleToggle(e.target.checked)} />
                  <span className="slider" />
                </label>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-title">当前状态</div>
              <div className="settings-sub">配置状态：{hasPayload ? '已配置' : '未配置'}</div>
              <div className="settings-sub mt-1 break-all">配置哈希：{configHash || '暂无'}</div>
              <div className="settings-sub mt-1">最近更新时间：{updatedLabel}</div>
            </div>

            <div className="settings-section">
              <div className="settings-title">导入配置密文</div>
              <div className="settings-sub">可粘贴密文字符串或从文件导入</div>
              <div className="settings-divider" />
              <div className="settings-field">
                <label>密文内容</label>
                <textarea
                  className="input-styled"
                  rows={5}
                  value={payloadInput}
                  onChange={(e) => setPayloadInput(e.target.value)}
                  placeholder="salt|iv|iterations|cipher"
                />
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={handleChooseFile} disabled={loading}>
                  选择文件
                </button>
                <button className="btn-primary" onClick={handleSavePayload} disabled={loading}>
                  保存密文
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.dat,*/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-title">危险操作</div>
              <div className="settings-sub">删除配置将清空密文</div>
              <div className="settings-divider" />
              <button className="btn-secondary text-red-500" onClick={handleClear} disabled={loading}>
                删除配置
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Config;
