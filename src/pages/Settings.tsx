import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettingsStore, ThemeMode } from '../store/settingsStore';
import { testAiConnection } from '../utils/aiGrader';
import { alertDialog, confirmDialog } from '../store/confirmStore';
import { ConfigBridge } from '../native/configBridge';
import { promptDialog } from '../store/promptStore';
import { Capacitor } from '@capacitor/core';

const Settings: React.FC = () => {
  const {
    themeMode,
    aiSmartEnabled,
    aiGradingEnabled,
    aiExplainEnabled,
    realtimeCheckEnabled,
    aiSecurityDisabled,
    aiConfig,
    aiConfigSource,
    aiNativeReady,
    setThemeMode,
    setAiSmartEnabled,
    setAiGradingEnabled,
    setAiExplainEnabled,
    setRealtimeCheckEnabled,
    updateAiConfig,
    setLastConfigHash,
    setPendingConfigHash,
    setAwaitingApp2Return,
    setAiConfigSource,
    setAiNativeReady,
    clearAiConfig,
    setLastApp2SyncAt,
    setApp2SyncOverdue,
    setApp2SyncMaxSeenAt,
    requestApp2Sync,
    clearApp2SyncRequest,
    pendingAiPanelFocus,
    setPendingAiPanelFocus,
    app2SyncMaxSeenAt
  } = useSettingsStore();
  const [aiTesting, setAiTesting] = useState(false);
  const [configFetching, setConfigFetching] = useState(false);
  const aiPanelRef = useRef<HTMLDivElement | null>(null);
  const aiSmartToggleRef = useRef<HTMLDivElement | null>(null);
  const prevAiSmartEnabled = useRef(aiSmartEnabled);
  const [temperatureInput, setTemperatureInput] = useState(String(aiConfig.temperature));
  const [maxTokensInput, setMaxTokensInput] = useState(String(aiConfig.maxTokens));
  const isApp2Config = aiConfigSource === 'app2';
  const nativeAvailable = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('ConfigBridge');
  const manualSyncTimer = useRef<number | null>(null);

  const scrollToAiSmartToggle = () => {
    const target = aiSmartToggleRef.current ?? aiPanelRef.current;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const top = Math.max(0, window.scrollY + rect.top - 100);
    window.scrollTo({ top, behavior: 'smooth' });
  };
  const handleApp2EditBlock = async () => {
    const ok = await confirmDialog({
      title: '正在使用分发配置',
      message: '是否删除当前分发配置以允许手动编辑？',
      confirmText: '删除',
      cancelText: '取消',
      confirmTone: 'danger'
    });
    if (!ok) return;
    if (nativeAvailable) {
      await ConfigBridge.clearDecryptedConfig();
    }
    clearAiConfig();
    setLastConfigHash('');
    setPendingConfigHash('');
    setAiConfigSource('none');
    setAiNativeReady(false);
  };

  const tryOpenConfigApp = async () => {
    if (!nativeAvailable) return;
    try {
      const res = await ConfigBridge.openConfigApp();
      if (res?.opened) {
        setAwaitingApp2Return(true);
        return true;
      }
      return false;
    } catch {
      // no-op: reserved for future
      return false;
    }
  };

  const handleSyncConfig = async () => {
    if (!nativeAvailable || configFetching) return;
    setConfigFetching(true);
    try {
      requestApp2Sync('manual');
      const opened = await tryOpenConfigApp();
      if (!opened) {
        clearApp2SyncRequest();
        void alertDialog('无法打开配置应用，请确认已安装并允许启动', { title: '同步失败', confirmText: '我知道了' });
      }
    } finally {
      setConfigFetching(false);
    }
  };

  const handleFetchConfig = async () => {
    if (!nativeAvailable || configFetching) return;
    setConfigFetching(true);
    try {
      const meta = await ConfigBridge.getConfigMeta();
      if (!meta.enabled || !meta.configHash) {
        await tryOpenConfigApp();
        return;
      }

      const hash = meta.configHash;
      let result = await ConfigBridge.decryptAndStoreConfig();
      if (result?.needsPassword) {
        const pwd = await promptDialog({
          title: '获取配置',
          message: '请输入配置密码以解密 AI 配置',
          confirmText: '解密',
          cancelText: '取消',
          inputType: 'password',
          placeholder: '请输入密码'
        });
        if (!pwd) {
          setPendingConfigHash(hash);
          return;
        }
        result = await ConfigBridge.decryptAndStoreConfig({ password: pwd });
      }

      if (!result || result.error) {
        clearAiConfig();
        setLastConfigHash('');
        setPendingConfigHash(hash);
        void alertDialog('解密失败，请检查密码', { title: '解密失败', confirmText: '我知道了' });
        return;
      }
      if (!result.baseUrl || !result.model) {
        clearAiConfig();
        setLastConfigHash('');
        setPendingConfigHash(hash);
        void alertDialog('配置格式无效，缺少必要字段', { title: '配置无效', confirmText: '我知道了' });
        return;
      }

      updateAiConfig({
        apiKey: result.maskedApiKey || '********',
        baseUrl: result.baseUrl,
        model: result.model
      });
      setAiNativeReady(true);
      setLastConfigHash(hash);
      setPendingConfigHash('');
      setAiConfigSource('app2');
      setPendingAiPanelFocus(true);
      const now = Date.now();
      setLastApp2SyncAt(now);
      setApp2SyncOverdue(false);
      setApp2SyncMaxSeenAt(Math.max(now, app2SyncMaxSeenAt || 0));
    } catch {
      await tryOpenConfigApp();
    } finally {
      setConfigFetching(false);
    }
  };

  useEffect(() => {
    if (!nativeAvailable) return;
    if (aiConfigSource !== 'manual') return;
    if (!aiConfig.apiKey || !aiConfig.baseUrl || !aiConfig.model) {
      setAiNativeReady(false);
      return;
    }
    if (manualSyncTimer.current) {
      window.clearTimeout(manualSyncTimer.current);
    }
    manualSyncTimer.current = window.setTimeout(async () => {
      try {
        const payload = JSON.stringify({
          API_KEY: aiConfig.apiKey,
          BASE_URL: aiConfig.baseUrl,
          MODEL_ID: aiConfig.model
        });
        const res = await ConfigBridge.storeDecryptedConfig({ jsonString: payload });
        if (res.error) {
          setAiNativeReady(false);
          return;
        }
        setAiNativeReady(true);
      } catch {
        setAiNativeReady(false);
      }
    }, 400);
    return () => {
      if (manualSyncTimer.current) {
        window.clearTimeout(manualSyncTimer.current);
      }
    };
  }, [aiConfig.apiKey, aiConfig.baseUrl, aiConfig.model, aiConfigSource, nativeAvailable, setAiNativeReady]);

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: '亮色' },
    { value: 'dark', label: '暗色' },
    { value: 'system', label: '跟随系统' }
  ];

  useEffect(() => {
    const justEnabled = !prevAiSmartEnabled.current && aiSmartEnabled;
    if (!justEnabled) {
      prevAiSmartEnabled.current = aiSmartEnabled;
      return;
    }
    window.requestAnimationFrame(() => {
      scrollToAiSmartToggle();
    });
    prevAiSmartEnabled.current = aiSmartEnabled;
  }, [aiSmartEnabled]);

  useEffect(() => {
    if (!pendingAiPanelFocus) return;
    window.requestAnimationFrame(() => {
      scrollToAiSmartToggle();
      setPendingAiPanelFocus(false);
    });
  }, [pendingAiPanelFocus, setPendingAiPanelFocus]);

  useEffect(() => {
    setTemperatureInput(String(aiConfig.temperature));
    setMaxTokensInput(String(aiConfig.maxTokens));
  }, [aiConfig.temperature, aiConfig.maxTokens]);

  return (
    <div className="page-container settings-page chapter-page">
      <div className="w-full max-w-4xl mx-auto box-border px-1 sm:px-0">
        <div className="chapter-header">
          <Link to="/" className="icon-button" aria-label="返回首页">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="chapter-title">设置</div>
          <div className="chapter-spacer" />
        </div>

        <div className="settings-section">
          <div className="settings-title">主题模式</div>
          <div className="segmented-control">
            <div
              className="segment-indicator"
              style={{ transform: `translateX(${themeOptions.findIndex((o) => o.value === themeMode) * 100}%)` }}
            />
            {themeOptions.map((option) => (
              <button
                key={option.value}
                className={`segment ${themeMode === option.value ? 'segment-active' : ''}`}
                onClick={() => setThemeMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-title">题库工具</div>
          <div className="settings-row">
            <div>
              <div className="settings-title">题库管理</div>
              <div className="settings-sub">维护题库与题目内容</div>
            </div>
            <Link to="/banks" className="btn-secondary flex-shrink-0 whitespace-nowrap">
              进入
            </Link>
          </div>
          <div className="settings-divider" />
          <div className="settings-row">
            <div>
              <div className="settings-title">导入题库</div>
              <div className="settings-sub">从 JSON 文件导入题库</div>
            </div>
            <Link to="/import" className="btn-secondary flex-shrink-0 whitespace-nowrap">
              进入
            </Link>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-row">
            <div>
              <div className="settings-title">实时判题</div>
              <div className="settings-sub">填空题输入答案后立刻进行判断</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={realtimeCheckEnabled}
                onChange={(e) => setRealtimeCheckEnabled(e.target.checked)}
              />
              <span className="slider" />
            </label>
          </div>

          <div className="settings-divider" />
          <div className="settings-row" ref={aiSmartToggleRef}>
            <div>
              <div className="settings-title">AI智能</div>
              <div className="settings-sub">开启后可使用 AI 判题与解析功能</div>
            </div>
            <label className="switch">
                <input
                  type="checkbox"
                  checked={aiSmartEnabled}
                  disabled={aiSecurityDisabled}
                  onChange={(e) => setAiSmartEnabled(e.target.checked)}
                />
              <span className="slider" />
            </label>
          </div>

          {aiSmartEnabled && (
            <div className="settings-panel" ref={aiPanelRef}>
              <div className="settings-row">
                <div>
                  <div className="settings-title">AI 判题</div>
                  <div className="settings-sub">使用AI模型进行智能判题</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={aiGradingEnabled}
                    onChange={(e) => setAiGradingEnabled(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div className="settings-divider" />
              <div className="settings-row">
                <div>
                  <div className="settings-title">AI 解析</div>
                  <div className="settings-sub">使用AI模型进行答案解析</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={aiExplainEnabled}
                    onChange={(e) => setAiExplainEnabled(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div className="settings-divider" />
              <div className="settings-field">
                <label>API Key</label>
                <input
                  type="password"
                  className={`input-styled ${isApp2Config ? 'input-disabled' : ''}`}
                  value={aiConfig.apiKey}
                  readOnly={isApp2Config}
                  onClick={() => {
                    if (isApp2Config) {
                      void handleApp2EditBlock();
                    }
                  }}
                  onChange={(e) => {
                    updateAiConfig({ apiKey: e.target.value });
                    if (aiConfigSource !== 'manual') {
                      setAiConfigSource('manual');
                    }
                  }}
                  placeholder="sk-..."
                />
              </div>
              <div className="settings-field">
                <div className="flex gap-2">
                  <button
                    className="btn-secondary"
                    disabled={aiTesting}
                    onClick={async () => {
                      const ready = aiNativeReady || (!nativeAvailable && aiConfig.apiKey && aiConfig.baseUrl && aiConfig.model);
                      if (!ready) {
                        void alertDialog('请先填写 API Key / Base URL / 模型');
                        return;
                      }
                      try {
                        setAiTesting(true);
                        await testAiConnection(aiConfig, { useNativeProxy: aiNativeReady && nativeAvailable });
                        void alertDialog('连接成功', { title: '连接成功', confirmText: '好的' });
                      } catch (err) {
                        void alertDialog('连接失败，请检查配置或网络', { title: '连接失败', confirmText: '我知道了' });
                      } finally {
                        setAiTesting(false);
                      }
                    }}
                  >
                    {aiTesting ? '测试中...' : '测试连接'}
                  </button>
                  <button
                    className="btn-primary"
                    onClick={isApp2Config ? handleSyncConfig : handleFetchConfig}
                    disabled={!nativeAvailable || configFetching}
                  >
                    {configFetching ? (isApp2Config ? '同步中...' : '获取中...') : isApp2Config ? '同步配置' : '获取配置'}
                  </button>
                </div>
              </div>
              <div className="settings-field">
                <label>Base URL</label>
                <input
                  type="text"
                  className={`input-styled ${isApp2Config ? 'input-disabled' : ''}`}
                  value={aiConfig.baseUrl}
                  readOnly={isApp2Config}
                  onClick={() => {
                    if (isApp2Config) {
                      void handleApp2EditBlock();
                    }
                  }}
                  onChange={(e) => updateAiConfig({ baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div className="settings-field">
                <label>模型</label>
                <input
                  type="text"
                  className={`input-styled ${isApp2Config ? 'input-disabled' : ''}`}
                  value={aiConfig.model}
                  readOnly={isApp2Config}
                  onClick={() => {
                    if (isApp2Config) {
                      void handleApp2EditBlock();
                    }
                  }}
                  onChange={(e) => updateAiConfig({ model: e.target.value })}
                  placeholder="gpt-4o-mini"
                />
              </div>
              <div className="settings-grid">
                <div className="settings-field">
                  <label>温度</label>
                  <input
                    type="number"
                    className="input-styled"
                    value={temperatureInput}
                    onChange={(e) => {
                      const next = e.target.value;
                      setTemperatureInput(next);
                      if (next.trim() === '') return;
                      updateAiConfig({ temperature: Number(next) });
                    }}
                    onBlur={() => {
                      if (temperatureInput.trim() !== '') return;
                      setTemperatureInput('0.6');
                      updateAiConfig({ temperature: 0.6 });
                    }}
                    min={0}
                    max={2}
                    step={0.1}
                    placeholder="0.6"
                  />
                </div>
                <div className="settings-field">
                  <label>Max Tokens</label>
                  <input
                    type="number"
                    className="input-styled"
                    value={maxTokensInput}
                    onChange={(e) => {
                      const next = e.target.value;
                      setMaxTokensInput(next);
                      if (next.trim() === '') return;
                      updateAiConfig({ maxTokens: Number(next) });
                    }}
                    onBlur={() => {
                      if (maxTokensInput.trim() !== '') return;
                      setMaxTokensInput('512');
                      updateAiConfig({ maxTokens: 512 });
                    }}
                    min={16}
                    max={4096}
                    step={16}
                    placeholder="512"
                  />
                </div>
              </div>
              <div className="settings-hint">
                采用 OpenAI 兼容 API：`POST /chat/completions`
              </div>
            </div>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-row">
            <div>
              <div className="settings-title">运行日志</div>
              <div className="settings-sub">查看运行日志，便于问题定位与排查</div>
            </div>
            <Link to="/logs" className="btn-secondary flex-shrink-0 whitespace-nowrap">
              查看
            </Link>
          </div>
          <div className="settings-divider" />
          <div className="settings-title">关于</div>
          <div className="settings-sub">Easy-answers 智能刷题助手，帮助你更高效地练题与复盘。</div>
          <div className="settings-sub mt-1">
            项目地址：
            <a
              href="https://github.com/xiheha3213906313/Easy-answers"
              className="text-blue-600 hover:text-blue-700 underline underline-offset-2 break-all"
              target="_blank"
              rel="noreferrer"
            >
              https://github.com/xiheha3213906313/Easy-answers
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
