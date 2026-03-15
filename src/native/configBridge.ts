import { registerPlugin } from '@capacitor/core';

export interface ConfigMeta {
  enabled: boolean;
  configHash?: string;
  updatedAt?: number;
}

export interface ConfigBridgePlugin {
  getConfigMeta(): Promise<ConfigMeta>;
  decryptConfig(options?: { password?: string }): Promise<{
    jsonString?: string;
    needsPassword?: boolean;
    error?: string;
  }>;
}

export interface ConfigAdminState {
  enabled: boolean;
  hasPayload: boolean;
  configHash?: string;
  updatedAt?: number;
}

export interface ConfigAdminBridgePlugin {
  getConfigState(): Promise<ConfigAdminState>;
  setEnabled(options: { enabled: boolean }): Promise<void>;
  setPayload(options: { payload: string }): Promise<void>;
  clearConfig(): Promise<void>;
}

export const ConfigBridge = registerPlugin<ConfigBridgePlugin>('ConfigBridge');
export const ConfigAdminBridge = registerPlugin<ConfigAdminBridgePlugin>('ConfigAdminBridge');
