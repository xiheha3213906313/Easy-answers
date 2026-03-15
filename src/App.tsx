import React, { Suspense, lazy, useEffect, useMemo, useRef } from 'react';
import { HashRouter, Routes, Route, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style as StatusBarStyle } from '@capacitor/status-bar';
import { useQuestionBankStore } from './store/questionBankStore';
import { useRecordStore } from './store/recordStore';
import { useSettingsStore } from './store/settingsStore';
import { useStudyStore } from './store/studyStore';
import ConfirmHost from './components/ConfirmHost';
import PromptHost from './components/PromptHost';
import { ConfigBridge } from './native/configBridge';
import { alertDialog } from './store/confirmStore';
import { promptDialog } from './store/promptStore';

const Home = lazy(() => import('./pages/Home'));
const BankList = lazy(() => import('./pages/BankList'));
const QuestionBankDetail = lazy(() => import('./pages/QuestionBankDetail'));
const Exam = lazy(() => import('./pages/Exam'));
const Result = lazy(() => import('./pages/Result'));
const Records = lazy(() => import('./pages/Records'));
const Import = lazy(() => import('./pages/Import'));
const Settings = lazy(() => import('./pages/Settings'));
const ChapterSelect = lazy(() => import('./pages/ChapterSelect'));
const Logs = lazy(() => import('./pages/Logs'));
const Config = lazy(() => import('./pages/Config'));

const PageLoader: React.FC = () => (
  <div className="page-loading-fallback">
    <div className="page-loading-spinner"></div>
    <p className="text-gray-500 mt-4">加载中...</p>
  </div>
);

const AppShell: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = useMemo(
    () => [
      { to: '/', label: '学习' },
      { to: '/settings', label: '设置' }
    ],
    []
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handler = CapApp.addListener('backButton', () => {
      if (location.pathname === '/') {
        CapApp.exitApp();
      } else {
        navigate(-1);
      }
    });
    return () => {
      handler.then((h) => h.remove());
    };
  }, [location.pathname, navigate]);

  return (
    <div className="app-shell">
      <div className="app-content">
        <Outlet />
      </div>
      <nav className="bottom-nav">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.to;
          return (
            <Link key={tab.to} to={tab.to} className={`bottom-nav-item ${isActive ? 'active' : ''}`}>
              <span className="bottom-nav-icon">
                {tab.label === '学习' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0-6v2m0 14v2m-6-6H4m16 0h-2M6.34 6.34l-1.42-1.42m12.73 12.73l-1.42-1.42M17.66 6.34l1.42-1.42M7.76 16.24l-1.42 1.42" />
                  </svg>
                )}
              </span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

const App: React.FC = () => {
  const { loadBanks } = useQuestionBankStore();
  const { loadRecords } = useRecordStore();
  const {
    themeMode,
    showDebugButton,
    aiSmartEnabled,
    updateAiConfig,
    lastConfigHash,
    pendingConfigHash,
    setLastConfigHash,
    setPendingConfigHash,
    aiConfigSource,
    setAiConfigSource,
    setAiNativeReady,
    clearAiConfig
  } = useSettingsStore();
  const { loadStudy } = useStudyStore();
  const syncingConfig = useRef(false);

  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([loadBanks(), loadRecords(), loadStudy()]);
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };
    init();
  }, [loadBanks, loadRecords]);

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = themeMode === 'dark' || (themeMode === 'system' && prefersDark);
      root.classList.toggle('dark', isDark);
      root.setAttribute('data-theme', themeMode);
      const computed = getComputedStyle(root).getPropertyValue('--app-bg').trim();
      const themeColor = computed || (isDark ? '#0b1220' : '#ffffff');
      let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
      }
      meta.content = themeColor;

      if (Capacitor.isNativePlatform()) {
        StatusBar.setBackgroundColor({ color: themeColor }).catch(() => undefined);
        StatusBar.setStyle({ style: isDark ? StatusBarStyle.Dark : StatusBarStyle.Light }).catch(() => undefined);
      }
    };

    applyTheme();

    if (themeMode === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme();
      media.addEventListener('change', handler);
      return () => media.removeEventListener('change', handler);
    }
  }, [themeMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('debug-visible', showDebugButton);
  }, [showDebugButton]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('ConfigBridge')) return;
    const syncStored = async () => {
      try {
        const meta = await ConfigBridge.getStoredConfigMeta();
        if (meta.hasConfig) {
          updateAiConfig({
            apiKey: meta.maskedApiKey || '********',
            baseUrl: meta.baseUrl || '',
            model: meta.model || ''
          });
          setAiNativeReady(true);
        } else {
          setAiNativeReady(false);
        }
      } catch {
        setAiNativeReady(false);
      }
    };
    syncStored();
  }, [setAiNativeReady, updateAiConfig]);

  useEffect(() => {
    if (!aiSmartEnabled) return;
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('ConfigBridge')) return;
    if (syncingConfig.current) return;

    syncingConfig.current = true;
    const sync = async () => {
      try {
        const meta = await ConfigBridge.getConfigMeta();
        if (!meta.enabled || !meta.configHash) {
          if (aiConfigSource === 'app2') {
            clearAiConfig();
            setLastConfigHash('');
            await ConfigBridge.clearDecryptedConfig();
            void alertDialog('你的分发配置可能已停止服务或已过期', {
              title: 'AI分发配置已被删除',
              confirmText: '我知道了'
            });
          }
          setPendingConfigHash('');
          return;
        }

        const hash = meta.configHash;
        if (hash !== lastConfigHash && aiConfigSource === 'app2') {
          clearAiConfig();
          setLastConfigHash('');
          await ConfigBridge.clearDecryptedConfig();
          void alertDialog('检测到分发配置变更', { title: '提示', confirmText: '我知道了' });
        }

        if (hash === pendingConfigHash) {
          return;
        }

        if (aiConfigSource === 'manual') {
          return;
        }

        let result = null as null | { baseUrl?: string; model?: string; maskedApiKey?: string; needsPassword?: boolean; error?: string };

        if (hash === lastConfigHash) {
          result = await ConfigBridge.decryptAndStoreConfig();
          if (result?.needsPassword) {
            const pwd = await promptDialog({
              title: '配置解密',
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
        } else {
          const pwd = await promptDialog({
            title: '检测到新的AI配置',
            message: '请输入密码进行解密',
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

        if (!result) return;
        if (result.error) {
          clearAiConfig();
          setLastConfigHash('');
          setPendingConfigHash(hash);
          void alertDialog(`解密失败：${result.error}`, { title: '解密失败', confirmText: '我知道了' });
          return;
        }
        if (result.needsPassword) {
          clearAiConfig();
          setLastConfigHash('');
          setPendingConfigHash(hash);
          void alertDialog('需要密码才能解密配置', { title: '解密失败', confirmText: '我知道了' });
          return;
        }
        updateAiConfig({
          apiKey: result.maskedApiKey || '********',
          baseUrl: result.baseUrl || '',
          model: result.model || ''
        });
        setAiNativeReady(true);
        setLastConfigHash(hash);
        setPendingConfigHash('');
        setAiConfigSource('app2');
      } catch (error) {
        void alertDialog('读取配置失败，请稍后重试', { title: '配置读取失败', confirmText: '我知道了' });
      }
    };

    sync().finally(() => {
      syncingConfig.current = false;
    });
  }, [
    aiSmartEnabled,
    lastConfigHash,
    pendingConfigHash,
    aiConfigSource,
    setLastConfigHash,
    setPendingConfigHash,
    setAiConfigSource,
    setAiNativeReady,
    updateAiConfig,
    clearAiConfig
  ]);

  return (
    <HashRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/chapter/:mode" element={<ChapterSelect />} />
        </Route>
        <Route path="/banks" element={<BankList />} />
        <Route path="/bank/:id" element={<QuestionBankDetail />} />
        <Route path="/exam/:bankId" element={<Exam />} />
        <Route path="/practice/:mode" element={<Exam />} />
        <Route path="/result/:id" element={<Result />} />
        <Route path="/records" element={<Records />} />
          <Route path="/import" element={<Import />} />
          <Route path="/config" element={<Config />} />
          <Route path="/logs" element={<Logs />} />
        </Routes>
      </Suspense>
      <ConfirmHost />
      <PromptHost />
    </HashRouter>
  );
};

export default App;
