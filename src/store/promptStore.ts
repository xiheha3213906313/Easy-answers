import { create } from 'zustand';

export interface PromptOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  placeholder?: string;
  inputType?: 'text' | 'password';
}

interface PromptState {
  current: {
    id: string;
    options: PromptOptions;
    resolve: (value: string | null) => void;
  } | null;
  request: (options: PromptOptions) => Promise<string | null>;
  confirm: (value: string) => void;
  cancel: () => void;
}

export const usePromptStore = create<PromptState>((set, get) => ({
  current: null,
  request: (options) =>
    new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      set({ current: { id, options, resolve } });
    }),
  confirm: (value) => {
    const current = get().current;
    if (!current) return;
    current.resolve(value);
    set({ current: null });
  },
  cancel: () => {
    const current = get().current;
    if (!current) return;
    current.resolve(null);
    set({ current: null });
  }
}));

export const promptDialog = (options: PromptOptions) => usePromptStore.getState().request(options);
