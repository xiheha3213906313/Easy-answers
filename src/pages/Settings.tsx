import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettingsStore, ThemeMode } from '../store/settingsStore';
import { testAiConnection } from '../utils/aiGrader';
import { alertDialog } from '../store/confirmStore';

const Settings: React.FC = () => {
  const {
    themeMode,
    aiSmartEnabled,
    aiGradingEnabled,
    aiExplainEnabled,
    realtimeCheckEnabled,
    aiConfig,
    setThemeMode,
    setAiSmartEnabled,
    setAiGradingEnabled,
    setAiExplainEnabled,
    setRealtimeCheckEnabled,
    updateAiConfig
  } = useSettingsStore();
  const [aiTesting, setAiTesting] = useState(false);
  const aiPanelRef = useRef<HTMLDivElement | null>(null);
  const prevAiSmartEnabled = useRef(aiSmartEnabled);
  const [temperatureInput, setTemperatureInput] = useState(String(aiConfig.temperature));
  const [maxTokensInput, setMaxTokensInput] = useState(String(aiConfig.maxTokens));

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
      if (aiPanelRef.current) {
        aiPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.scrollBy({ top: -56, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: 260, behavior: 'smooth' });
      }
    });
    prevAiSmartEnabled.current = aiSmartEnabled;
  }, [aiSmartEnabled]);

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
              <div className="settings-sub">维护题库与题目内容，支持新增、编辑与删除</div>
            </div>
            <Link to="/banks" className="btn-secondary flex-shrink-0 whitespace-nowrap">
              进入
            </Link>
          </div>
          <div className="settings-divider" />
          <div className="settings-row">
            <div>
              <div className="settings-title">导入题库</div>
              <div className="settings-sub">从 JSON 文件批量导入题库与题目数据</div>
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
              <div className="settings-sub">填空题失焦后立即匹配并提示结果</div>
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
          <div className="settings-row">
            <div>
              <div className="settings-title">AI智能</div>
              <div className="settings-sub">启用后可使用 AI 判题与解析功能</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={aiSmartEnabled}
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
                  <div className="settings-sub">基于 OpenAI 兼容接口进行智能判题</div>
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
                  <div className="settings-sub">开启后在答题页显示解析入口</div>
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
                  className="input-styled"
                  value={aiConfig.apiKey}
                  onChange={(e) => updateAiConfig({ apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </div>
              <div className="settings-field">
                <button
                  className="btn-secondary"
                  disabled={aiTesting}
                  onClick={async () => {
                    if (!aiConfig.apiKey || !aiConfig.baseUrl || !aiConfig.model) {
                      void alertDialog('请先填写 API Key / Base URL / 模型');
                      return;
                    }
                    try {
                      setAiTesting(true);
                      await testAiConnection(aiConfig);
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
              </div>
              <div className="settings-field">
                <label>Base URL</label>
                <input
                  type="text"
                  className="input-styled"
                  value={aiConfig.baseUrl}
                  onChange={(e) => updateAiConfig({ baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div className="settings-field">
                <label>模型</label>
                <input
                  type="text"
                  className="input-styled"
                  value={aiConfig.model}
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
                调用方式采用 OpenAI 兼容 API：`POST /chat/completions`
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
