/**
 * Shared types between frontend and backend
 * These types can be imported by both JSX components and RPC services
 */

// Plugin config types
export type FieldType =
  | "text"
  | "secret"
  | "cron"
  | "number"
  | "boolean"
  | "enum"
  | "oauth-managed";

export type FieldInfo = {
  key: string;
  type: FieldType;
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
};

export type PluginInfo = {
  name: string;
  displayName: string;
  hasOAuth: boolean;
  enabled: boolean;
  configured: boolean;
  fields: FieldInfo[];
  jsonSchema: unknown;
};

export interface PluginRpcMethods {
  getPlugins(): Promise<PluginInfo[]>;
  getPluginConfig(pluginName: string): Promise<Record<string, unknown> | null>;
  setPluginConfig(
    pluginName: string,
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; error?: string }>;
  setPluginEnabled(
    pluginName: string,
    enabled: boolean,
  ): Promise<{ success: boolean; error?: string }>;
  getOAuthStatus(pluginName: string): Promise<{
    connected: boolean;
    expiresAt?: string;
  }>;
}

export interface ExampleRpcMethods {
  getCounter(): Promise<number>;
  incrementCounter(): Promise<number>;
  decrementCounter(): Promise<number>;
  resetCounter(): Promise<number>;
}
