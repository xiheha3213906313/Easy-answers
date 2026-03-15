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
  setThemeMode: (mode: ThemeMode) => void;
  setAiSmartEnabled: (enabled: boolean) => void;
  setAiGradingEnabled: (enabled: boolean) => void;
  setAiExplainEnabled: (enabled: boolean) => void;
  setRealtimeCheckEnabled: (enabled: boolean) => void;
  setShowDebugButton: (enabled: boolean) => void;
  updateAiConfig: (updates: Partial<AiGradingConfig>) => void;
  setLastConfigHash: (hash: string) => void;
  setPendingConfigHash: (hash: string) => void;
  setAiConfigSource: (source: AiConfigSource) => void;
  setAiNativeReady: (ready: boolean) => void;
  clearAiConfig: () => void;
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
      setAiConfigSource: (source) => set({ aiConfigSource: source }),
      setAiNativeReady: (ready) => set({ aiNativeReady: ready }),
      clearAiConfig: () => set({ aiConfig: defaultAiConfig, aiConfigSource: 'none', aiNativeReady: false })
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
        pendingConfigHash: state.pendingConfigHash
      })
    }
  )
);
