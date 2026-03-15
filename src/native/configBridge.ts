import { registerPlugin } from '@capacitor/core';

export interface ConfigMeta {
  enabled: boolean;
  configHash?: string;
  updatedAt?: number;
}

export interface ConfigBridgePlugin {
  getConfigMeta(): Promise<ConfigMeta>;
  decryptAndStoreConfig(options?: { password?: string }): Promise<{
    baseUrl?: string;
    model?: string;
    maskedApiKey?: string;
    needsPassword?: boolean;
    error?: string;
  }>;
  getStoredConfigMeta(): Promise<{
    hasConfig: boolean;
    baseUrl?: string;
    model?: string;
    maskedApiKey?: string;
  }>;
  storeDecryptedConfig(options: { jsonString: string }): Promise<{
    baseUrl?: string;
    model?: string;
    maskedApiKey?: string;
    error?: string;
  }>;
  clearDecryptedConfig(): Promise<void>;
  aiProxyChat(options: {
    url: string;
    body: string;
    headers?: Record<string, string>;
  }): Promise<{
    status: number;
    statusText?: string;
    contentType?: string;
    requestId?: string | null;
    retryAfter?: string | null;
    bodyText?: string;
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
