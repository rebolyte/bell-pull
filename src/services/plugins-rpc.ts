import { zodToJsonSchema } from "zod-to-json-schema";
import type { Container, Plugin } from "../types/index.ts";
import type { PluginInfo, PluginRpcMethods } from "../types/shared.ts";
import { extractFieldsFromSchema, maskSecrets, mergeWithExistingSecrets } from "./config-schema.ts";
import { ExampleRpcService } from "./example-rpc.ts";

export class PluginsRpcService extends ExampleRpcService implements PluginRpcMethods {
  constructor(
    private container: Container,
    private plugins: Plugin[],
  ) {
    super();
  }

  async getPlugins(): Promise<PluginInfo[]> {
    const configsResult = await this.container.plugins.listConfigs();
    const configs = configsResult.isOk() ? configsResult.value : [];

    return this.plugins.map((plugin) => {
      const stored = configs.find((c) => c.pluginName === plugin.name);
      const fields = plugin.configSchema ? extractFieldsFromSchema(plugin.configSchema) : [];

      return {
        name: plugin.name,
        displayName: plugin.displayName ?? plugin.name,
        hasOAuth: !!plugin.oauth,
        enabled: stored?.enabled ?? false,
        configured: !!stored,
        fields,
        jsonSchema: plugin.configSchema ? zodToJsonSchema(plugin.configSchema) : null,
      };
    });
  }

  async getPluginConfig(pluginName: string): Promise<Record<string, unknown> | null> {
    const plugin = this.plugins.find((p) => p.name === pluginName);
    if (!plugin) return null;

    const result = await this.container.plugins.getConfig(pluginName);
    if (result.isErr() || !result.value) return null;

    const fields = plugin.configSchema ? extractFieldsFromSchema(plugin.configSchema) : [];

    return maskSecrets(result.value.config as Record<string, unknown>, fields);
  }

  async setPluginConfig(
    pluginName: string,
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; error?: string }> {
    const plugin = this.plugins.find((p) => p.name === pluginName);
    if (!plugin) {
      return { success: false, error: "Plugin not found" };
    }

    if (plugin.configSchema) {
      const parseResult = plugin.configSchema.safeParse(config);
      if (!parseResult.success) {
        return {
          success: false,
          error: parseResult.error.issues[0]?.message ?? "Validation failed",
        };
      }
    }

    const existingResult = await this.container.plugins.getConfig(pluginName);
    const existingConfig = existingResult.isOk() && existingResult.value
      ? (existingResult.value.config as Record<string, unknown>)
      : {};

    const fields = plugin.configSchema ? extractFieldsFromSchema(plugin.configSchema) : [];

    const mergedConfig = mergeWithExistingSecrets(config, existingConfig, fields);

    const result = await this.container.plugins.setConfig(pluginName, mergedConfig);
    if (result.isErr()) {
      return { success: false, error: result.error.message };
    }

    return { success: true };
  }

  async setPluginEnabled(
    pluginName: string,
    enabled: boolean,
  ): Promise<{ success: boolean; error?: string }> {
    const plugin = this.plugins.find((p) => p.name === pluginName);
    if (!plugin) {
      return { success: false, error: "Plugin not found" };
    }

    const result = await this.container.plugins.setEnabled(pluginName, enabled);
    if (result.isErr()) {
      return { success: false, error: result.error.message };
    }

    return { success: true };
  }

  async getOAuthStatus(pluginName: string): Promise<{
    connected: boolean;
    expiresAt?: string;
  }> {
    const result = await this.container.plugins.getConfig<{
      accessToken?: string;
      tokenExpiresAt?: string;
    }>(pluginName);

    if (result.isErr() || !result.value) {
      return { connected: false };
    }

    const { accessToken, tokenExpiresAt } = result.value.config;
    return {
      connected: !!accessToken,
      expiresAt: tokenExpiresAt,
    };
  }
}
