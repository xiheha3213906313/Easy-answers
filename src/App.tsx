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
import { alertDialog, confirmDialog } from './store/confirmStore';
import { promptDialog } from './store/promptStore';
import { useLogStore } from './store/logStore';

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
  const { pendingSettingsRoute, setPendingSettingsRoute } = useSettingsStore();
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

  useEffect(() => {
    if (!pendingSettingsRoute) return;
    navigate('/settings');
    setPendingSettingsRoute(false);
  }, [navigate, pendingSettingsRoute, setPendingSettingsRoute]);

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
  const { addLog } = useLogStore();
  const {
    themeMode,
    showDebugButton,
    aiSmartEnabled,
    setAiSmartEnabled,
    updateAiConfig,
    lastConfigHash,
    pendingConfigHash,
    setLastConfigHash,
    setPendingConfigHash,
    aiConfigSource,
    setAiConfigSource,
    setAiNativeReady,
    clearAiConfig,
    awaitingApp2Return,
    setAwaitingApp2Return,
    firstLaunchPrompted,
    setFirstLaunchPrompted,
    setPendingSettingsRoute,
    setAiSecurityDisabled,
    lastApp2SyncAt,
    app2SyncMaxSeenAt,
    app2SyncOverdue,
    app2SyncRequestId,
    setLastApp2SyncAt,
    setApp2SyncMaxSeenAt,
    setApp2SyncOverdue,
    requestApp2Sync,
    clearApp2SyncRequest,
    setPendingAiPanelFocus
  } = useSettingsStore();
  const { loadStudy } = useStudyStore();
  const syncingConfig = useRef(false);
  const app2ReturnPrompting = useRef(false);
  const overduePrompting = useRef(false);

  const notifyApp2SyncResult = (status: 'success' | 'nochange' | 'failed' | 'cancelled', detail?: string) => {
    if (!app2SyncRequestId) return;
    clearApp2SyncRequest();
    let title = '同步完成';
    let message = '同步成功';
    if (status === 'nochange') {
      title = '无需更新';
      message = '配置已是最新';
    } else if (status === 'failed') {
      title = '同步失败';
      message = detail ? `同步失败：${detail}` : '同步失败，请稍后重试';
    } else if (status === 'cancelled') {
      title = '已取消';
      message = '已取消同步操作';
    }
    void alertDialog(message, { title, confirmText: '我知道了' });
  };

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
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('ConfigBridge')) return;
    if (import.meta.env.DEV) {
      setAiSecurityDisabled(false);
      return;
    }
    const syncSecurity = async () => {
      try {
        const state = await ConfigBridge.getSecurityState();
        const shouldDisable = Boolean(state?.compromised && !state?.debuggable);
        setAiSecurityDisabled(shouldDisable);
        if (shouldDisable) {
          setAiSmartEnabled(false);
        }
      } catch {
        setAiSecurityDisabled(false);
      }
    };
    syncSecurity();
  }, [setAiSecurityDisabled, setAiSmartEnabled]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('ConfigBridge')) return;
    let cancelled = false;
    const run = async () => {
      try {
        const launch = await ConfigBridge.getLaunchSource();
        if (cancelled) return;
        if (launch?.fromApp2) {
          setAiSmartEnabled(true);
          setAwaitingApp2Return(true);
          setPendingSettingsRoute(true);
          setFirstLaunchPrompted(true);
          return;
        }
        if (firstLaunchPrompted) return;
        const res = await ConfigBridge.isConfigAppInstalled();
        if (!res?.installed) return;
        const ok = await confirmDialog({
          title: '提示',
          message: '检测到轻松秘钥存在，是否前往获取AI配置',
          confirmText: '确定',
          cancelText: '取消'
        });
        if (cancelled) return;
        setFirstLaunchPrompted(true);
        if (!ok) return;
        setAiSmartEnabled(true);
        setAwaitingApp2Return(true);
        await ConfigBridge.openConfigApp();
      } catch {
        // no-op
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    firstLaunchPrompted,
    setAiSmartEnabled,
    setAwaitingApp2Return,
    setFirstLaunchPrompted,
    setPendingSettingsRoute
  ]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('ConfigBridge')) return;
    const runReturnFlow = () => {
      if (!awaitingApp2Return || app2ReturnPrompting.current) return;
      app2ReturnPrompting.current = true;
      syncingConfig.current = true;
      const run = async () => {
        try {
          const syncRequested = app2SyncRequestId > 0;
          const meta = await ConfigBridge.getConfigMeta();
          if (!meta.enabled || !meta.configHash) {
            addLog({
              level: 'warn',
              message: `分发配置不可用（返回流程）| enabled=${String(meta.enabled)} | hash=${meta.configHash || 'empty'} | updatedAt=${meta.updatedAt ?? 'empty'}`,
              source: 'config-sync'
            });
            setAwaitingApp2Return(false);
            if (syncRequested) {
              notifyApp2SyncResult('failed', '分发配置不可用');
            }
            return;
          }
          const hash = meta.configHash;
          const sameHash = hash === lastConfigHash;
          let result = null as null | { baseUrl?: string; model?: string; maskedApiKey?: string; needsPassword?: boolean; error?: string };
          if (sameHash) {
            result = await ConfigBridge.decryptAndStoreConfig();
          }
          if (!result || result.needsPassword) {
            const pwd = await promptDialog({
              title: '获取配置',
              message: '请输入秘钥以解密 AI 配置',
              confirmText: '解密',
              cancelText: '取消',
              inputType: 'password',
              placeholder: '请输入秘钥'
            });
            if (!pwd) {
              setPendingConfigHash(hash);
              setAwaitingApp2Return(false);
              if (syncRequested) {
                notifyApp2SyncResult('cancelled');
              }
              return;
            }
            result = await ConfigBridge.decryptAndStoreConfig({ password: pwd });
          }
          if (!result || result.error) {
            clearAiConfig();
            setLastConfigHash('');
            setPendingConfigHash(hash);
            addLog({
              level: 'warn',
              message: `秘钥解密失败（返回流程）| hash=${hash} | error=${result?.error || 'unknown'}`,
              source: 'config-sync'
            });
            void alertDialog('解密失败，请检查秘钥', { title: '解密失败', confirmText: '我知道了' });
            setAwaitingApp2Return(false);
            if (syncRequested) {
              notifyApp2SyncResult('failed', '解密失败');
            }
            return;
          }
          if (!result.baseUrl || !result.model) {
            clearAiConfig();
            setLastConfigHash('');
            setPendingConfigHash(hash);
            addLog({
              level: 'warn',
              message: `分发配置无效（返回流程）| hash=${hash} | baseUrl=${result.baseUrl || 'empty'} | model=${result.model || 'empty'}`,
              source: 'config-sync'
            });
            void alertDialog('配置格式无效，缺少必要字段', { title: '配置无效', confirmText: '我知道了' });
            setAwaitingApp2Return(false);
            if (syncRequested) {
              notifyApp2SyncResult('failed', '配置无效');
            }
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
          setPendingSettingsRoute(true);
          setPendingAiPanelFocus(true);
          const now = Date.now();
          setLastApp2SyncAt(now);
          setApp2SyncOverdue(false);
          setApp2SyncMaxSeenAt(Math.max(now, app2SyncMaxSeenAt));
          if (syncRequested) {
            notifyApp2SyncResult(sameHash ? 'nochange' : 'success');
          }
          setAwaitingApp2Return(false);
        } catch {
          setAwaitingApp2Return(false);
          if (app2SyncRequestId > 0) {
            notifyApp2SyncResult('failed');
          }
        }
      };
      run().finally(() => {
        app2ReturnPrompting.current = false;
        syncingConfig.current = false;
      });
    };
    const handler = CapApp.addListener('appStateChange', (state) => {
      if (!state.isActive) return;
      runReturnFlow();
    });
    const resumeHandler = CapApp.addListener('resume', () => {
      runReturnFlow();
    });
    return () => {
      handler.then((h) => h.remove());
      resumeHandler.then((h) => h.remove());
    };
  }, [
    awaitingApp2Return,
    setAwaitingApp2Return,
    setPendingConfigHash,
    setLastConfigHash,
    setAiConfigSource,
    setAiNativeReady,
    updateAiConfig,
    clearAiConfig,
    addLog,
    app2SyncRequestId,
    app2SyncMaxSeenAt,
    setLastApp2SyncAt,
    setApp2SyncOverdue,
    setApp2SyncMaxSeenAt,
    clearApp2SyncRequest,
    setPendingAiPanelFocus,
    setPendingSettingsRoute
  ]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('ConfigBridge')) return;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const checkOverdue = async () => {
      if (aiConfigSource !== 'app2') {
        if (app2SyncOverdue) {
          setApp2SyncOverdue(false);
        }
        return;
      }
      const now = Date.now();
      const maxSeen = Math.max(now, app2SyncMaxSeenAt || 0);
      if (maxSeen !== app2SyncMaxSeenAt) {
        setApp2SyncMaxSeenAt(maxSeen);
      }
      if (!lastApp2SyncAt) return;
      const overdue = maxSeen - lastApp2SyncAt > SEVEN_DAYS_MS;
      if (!overdue) {
        if (app2SyncOverdue) setApp2SyncOverdue(false);
        return;
      }
      if (!app2SyncOverdue) {
        setApp2SyncOverdue(true);
      }
      if (overduePrompting.current) return;
      overduePrompting.current = true;
      await alertDialog('已超过7天未与配置应用同步，系统将强制拉起同步。', {
        title: '需要同步',
        confirmText: '立即同步'
      });
      requestApp2Sync('forced');
      setAwaitingApp2Return(true);
      try {
        await ConfigBridge.openConfigApp();
      } catch {
        // no-op
      } finally {
        overduePrompting.current = false;
      }
    };

    checkOverdue();
    const handler = CapApp.addListener('appStateChange', (state) => {
      if (!state.isActive) return;
      checkOverdue();
    });
    const resumeHandler = CapApp.addListener('resume', () => {
      checkOverdue();
    });
    return () => {
      handler.then((h) => h.remove());
      resumeHandler.then((h) => h.remove());
    };
  }, [
    aiConfigSource,
    app2SyncOverdue,
    app2SyncMaxSeenAt,
    lastApp2SyncAt,
    setApp2SyncMaxSeenAt,
    setApp2SyncOverdue,
    setAwaitingApp2Return,
    requestApp2Sync
  ]);

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
            let diag = null as null | {
              reason?: string;
              details?: string;
              enabled?: boolean;
              configHash?: string;
              updatedAt?: number;
              callerUid?: number;
              callerPackages?: string;
              providerFound?: boolean;
              providerPackage?: string;
              appInstalled?: boolean;
            };
            try {
              diag = await ConfigBridge.getConfigDiagnostics();
            } catch {
              diag = null;
            }

            const providerUnavailable =
              diag?.reason === 'no_cursor' && diag?.providerFound && diag?.appInstalled;

            if (providerUnavailable) {
              // App2 provider is temporarily unavailable (e.g. app was force-stopped).
              // Keep existing config and wait for app2 to come back.
              return;
            }

            addLog({
              level: 'warn',
              message: `分发配置不可用（自动同步）| enabled=${String(meta.enabled)} | hash=${meta.configHash || 'empty'} | updatedAt=${meta.updatedAt ?? 'empty'} | lastHash=${lastConfigHash || 'empty'} | pendingHash=${pendingConfigHash || 'empty'}`,
              source: 'config-sync'
            });

            if (diag) {
              addLog({
                level: 'warn',
                message: `分发配置诊断 | reason=${diag.reason || 'empty'} | details=${diag.details || 'empty'} | enabled=${String(diag.enabled)} | hash=${diag.configHash || 'empty'} | updatedAt=${diag.updatedAt ?? 'empty'} | callerUid=${diag.callerUid ?? 'empty'} | callerPackages=${diag.callerPackages || 'empty'} | providerFound=${String(diag.providerFound)} | providerPackage=${diag.providerPackage || 'empty'} | appInstalled=${String(diag.appInstalled)}`,
                source: 'config-sync'
              });
            } else {
              addLog({
                level: 'warn',
                message: '分发配置诊断获取失败',
                source: 'config-sync'
              });
            }

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
          addLog({
            level: 'info',
            message: `分发配置变更 | newHash=${hash} | lastHash=${lastConfigHash || 'empty'}`,
            source: 'config-sync'
          });
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
          addLog({
            level: 'warn',
            message: `秘钥解密失败（自动同步）| hash=${hash} | error=${result.error}`,
            source: 'config-sync'
          });
          void alertDialog(`解密失败：${result.error}`, { title: '解密失败', confirmText: '我知道了' });
          return;
        }
        if (result.needsPassword) {
          clearAiConfig();
          setLastConfigHash('');
          setPendingConfigHash(hash);
          addLog({
            level: 'warn',
            message: `秘钥缺失或已过期（自动同步）| hash=${hash}`,
            source: 'config-sync'
          });
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
        setPendingSettingsRoute(true);
        setPendingAiPanelFocus(true);
        const now = Date.now();
        setLastApp2SyncAt(now);
        setApp2SyncOverdue(false);
        setApp2SyncMaxSeenAt(Math.max(now, app2SyncMaxSeenAt));
        if (app2SyncRequestId > 0) {
          const sameHash = hash === lastConfigHash;
          notifyApp2SyncResult(sameHash ? 'nochange' : 'success');
        }
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
    clearAiConfig,
    addLog,
    app2SyncRequestId,
    app2SyncMaxSeenAt,
    setLastApp2SyncAt,
    setApp2SyncOverdue,
    setApp2SyncMaxSeenAt,
    clearApp2SyncRequest
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
