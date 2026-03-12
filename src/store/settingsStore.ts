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

interface SettingsState {
  themeMode: ThemeMode;
  aiSmartEnabled: boolean;
  aiGradingEnabled: boolean;
  aiExplainEnabled: boolean;
  realtimeCheckEnabled: boolean;
  aiConfig: AiGradingConfig;
  setThemeMode: (mode: ThemeMode) => void;
  setAiSmartEnabled: (enabled: boolean) => void;
  setAiGradingEnabled: (enabled: boolean) => void;
  setAiExplainEnabled: (enabled: boolean) => void;
  setRealtimeCheckEnabled: (enabled: boolean) => void;
  updateAiConfig: (updates: Partial<AiGradingConfig>) => void;
}

const defaultAiConfig: AiGradingConfig = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
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
      aiConfig: defaultAiConfig,
      setThemeMode: (mode) => set({ themeMode: mode }),
      setAiSmartEnabled: (enabled) => set((state) => ({
        aiSmartEnabled: enabled,
        aiGradingEnabled: enabled ? state.aiGradingEnabled : false,
        aiExplainEnabled: enabled ? state.aiExplainEnabled : false
      })),
      setAiGradingEnabled: (enabled) => set({ aiGradingEnabled: enabled }),
      setAiExplainEnabled: (enabled) => set({ aiExplainEnabled: enabled }),
      setRealtimeCheckEnabled: (enabled) => set({ realtimeCheckEnabled: enabled }),
      updateAiConfig: (updates) =>
        set((state) => ({
          aiConfig: {
            ...state.aiConfig,
            ...updates
          }
        }))
    }),
    {
      name: 'app-settings',
      storage: createJSONStorage(() => localStorage)
    }
  )
);
