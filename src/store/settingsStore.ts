import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AiGradingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export type AiConfigSource = 'none' | 'manual' | 'app2';
export type App2SyncSource = 'manual' | 'forced';

interface SettingsState {
  themeMode: ThemeMode;
  aiSmartEnabled: boolean;
  aiGradingEnabled: boolean;
  aiExplainEnabled: boolean;
  realtimeCheckEnabled: boolean;
  showDebugButton: boolean;
  aiConfig: AiGradingConfig;
  aiConfigSource: AiConfigSource;
  aiNativeReady: boolean;
  lastConfigHash: string;
  pendingConfigHash: string;
  awaitingApp2Return: boolean;
  firstLaunchPrompted: boolean;
  pendingSettingsRoute: boolean;
  aiSecurityDisabled: boolean;
  lastApp2SyncAt: number;
  app2SyncMaxSeenAt: number;
  app2SyncOverdue: boolean;
  app2SyncRequestId: number;
  app2SyncRequestSource: App2SyncSource | null;
  pendingAiPanelFocus: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setAiSmartEnabled: (enabled: boolean) => void;
  setAiGradingEnabled: (enabled: boolean) => void;
  setAiExplainEnabled: (enabled: boolean) => void;
  setRealtimeCheckEnabled: (enabled: boolean) => void;
  setShowDebugButton: (enabled: boolean) => void;
  updateAiConfig: (updates: Partial<AiGradingConfig>) => void;
  setLastConfigHash: (hash: string) => void;
  setPendingConfigHash: (hash: string) => void;
  setAwaitingApp2Return: (awaiting: boolean) => void;
  setFirstLaunchPrompted: (prompted: boolean) => void;
  setPendingSettingsRoute: (pending: boolean) => void;
  setAiSecurityDisabled: (disabled: boolean) => void;
  setAiConfigSource: (source: AiConfigSource) => void;
  setAiNativeReady: (ready: boolean) => void;
  clearAiConfig: () => void;
  setLastApp2SyncAt: (timestamp: number) => void;
  setApp2SyncMaxSeenAt: (timestamp: number) => void;
  setApp2SyncOverdue: (overdue: boolean) => void;
  requestApp2Sync: (source: App2SyncSource) => void;
  clearApp2SyncRequest: () => void;
  setPendingAiPanelFocus: (pending: boolean) => void;
}

const defaultAiConfig: AiGradingConfig = {
  apiKey: '',
  baseUrl: '',
  model: '',
  temperature: 0.6,
  maxTokens: 512
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'light',
      aiSmartEnabled: false,
      aiGradingEnabled: false,
      aiExplainEnabled: false,
      realtimeCheckEnabled: false,
      showDebugButton: false,
      aiConfig: defaultAiConfig,
      aiConfigSource: 'none',
      aiNativeReady: false,
      lastConfigHash: '',
      pendingConfigHash: '',
      awaitingApp2Return: false,
      firstLaunchPrompted: false,
      pendingSettingsRoute: false,
      aiSecurityDisabled: false,
      lastApp2SyncAt: 0,
      app2SyncMaxSeenAt: 0,
      app2SyncOverdue: false,
      app2SyncRequestId: 0,
      app2SyncRequestSource: null,
      pendingAiPanelFocus: false,
      setThemeMode: (mode) => set({ themeMode: mode }),
      setAiSmartEnabled: (enabled) => set((state) => ({
        aiSmartEnabled: enabled,
        aiGradingEnabled: enabled ? state.aiGradingEnabled : false,
        aiExplainEnabled: enabled ? state.aiExplainEnabled : false
      })),
      setAiGradingEnabled: (enabled) => set({ aiGradingEnabled: enabled }),
      setAiExplainEnabled: (enabled) => set({ aiExplainEnabled: enabled }),
      setRealtimeCheckEnabled: (enabled) => set({ realtimeCheckEnabled: enabled }),
      setShowDebugButton: (enabled) => set({ showDebugButton: enabled }),
      updateAiConfig: (updates) =>
        set((state) => ({
          aiConfig: {
            ...state.aiConfig,
            ...updates
          }
        })),
      setLastConfigHash: (hash) => set({ lastConfigHash: hash }),
      setPendingConfigHash: (hash) => set({ pendingConfigHash: hash }),
      setAwaitingApp2Return: (awaiting) => set({ awaitingApp2Return: awaiting }),
      setFirstLaunchPrompted: (prompted) => set({ firstLaunchPrompted: prompted }),
      setPendingSettingsRoute: (pending) => set({ pendingSettingsRoute: pending }),
      setAiSecurityDisabled: (disabled) => set({ aiSecurityDisabled: disabled }),
      setAiConfigSource: (source) => set({ aiConfigSource: source }),
      setAiNativeReady: (ready) => set({ aiNativeReady: ready }),
      clearAiConfig: () => set({ aiConfig: defaultAiConfig, aiConfigSource: 'none', aiNativeReady: false }),
      setLastApp2SyncAt: (timestamp) => set({ lastApp2SyncAt: timestamp }),
      setApp2SyncMaxSeenAt: (timestamp) => set({ app2SyncMaxSeenAt: timestamp }),
      setApp2SyncOverdue: (overdue) => set({ app2SyncOverdue: overdue }),
      requestApp2Sync: (source) =>
        set({
          app2SyncRequestId: Date.now(),
          app2SyncRequestSource: source
        }),
      clearApp2SyncRequest: () =>
        set({
          app2SyncRequestId: 0,
          app2SyncRequestSource: null
        }),
      setPendingAiPanelFocus: (pending) => set({ pendingAiPanelFocus: pending })
    }),
    {
      name: 'app-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        themeMode: state.themeMode,
        aiSmartEnabled: state.aiSmartEnabled,
        aiGradingEnabled: state.aiGradingEnabled,
        aiExplainEnabled: state.aiExplainEnabled,
        realtimeCheckEnabled: state.realtimeCheckEnabled,
        showDebugButton: state.showDebugButton,
        aiConfig: {
          ...state.aiConfig,
          apiKey: ''
        },
        aiConfigSource: state.aiConfigSource,
        aiNativeReady: state.aiNativeReady,
        lastConfigHash: state.lastConfigHash,
        pendingConfigHash: state.pendingConfigHash,
        awaitingApp2Return: state.awaitingApp2Return,
        firstLaunchPrompted: state.firstLaunchPrompted,
        aiSecurityDisabled: state.aiSecurityDisabled,
        lastApp2SyncAt: state.lastApp2SyncAt,
        app2SyncMaxSeenAt: state.app2SyncMaxSeenAt,
        app2SyncOverdue: state.app2SyncOverdue
      })
    }
  )
);
