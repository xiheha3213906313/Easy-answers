import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AppLog {
  id: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  stack?: string;
  time: string;
  source?: string;
}

interface LogState {
  logs: AppLog[];
  addLog: (log: Omit<AppLog, 'id' | 'time'>) => void;
  clearLogs: () => void;
}

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

export const useLogStore = create<LogState>()(
  persist(
    (set) => ({
      logs: [],
      addLog: (log) =>
        set((state) => ({
          logs: [
            {
              id: generateId(),
              time: new Date().toISOString(),
              ...log
            },
            ...state.logs
          ].slice(0, 200)
        })),
      clearLogs: () => set({ logs: [] })
    }),
    {
      name: 'app-logs',
      storage: createJSONStorage(() => localStorage)
    }
  )
);
