import { create } from 'zustand';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  confirmTone?: 'default' | 'danger';
}

interface ConfirmState {
  current: { id: string; options: ConfirmOptions; resolve: (value: boolean) => void } | null;
  request: (options: ConfirmOptions) => Promise<boolean>;
  confirm: () => void;
  cancel: () => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  current: null,
  request: (options) =>
    new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      set({ current: { id, options, resolve } });
    }),
  confirm: () => {
    const current = get().current;
    if (!current) return;
    current.resolve(true);
    set({ current: null });
  },
  cancel: () => {
    const current = get().current;
    if (!current) return;
    current.resolve(false);
    set({ current: null });
  }
}));

export const confirmDialog = (options: ConfirmOptions) => useConfirmStore.getState().request(options);

export const alertDialog = (
  message: string,
  options: Omit<ConfirmOptions, 'message' | 'showCancel' | 'cancelText'> = {}
) =>
  useConfirmStore
    .getState()
    .request({
      title: options.title ?? '提示',
      message,
      confirmText: options.confirmText ?? '知道了',
      showCancel: false
    })
    .then(() => undefined);
