import { rpc } from './api.js';

document.addEventListener('alpine:init', () => {
  Alpine.data('pluginConfig', () => ({
    plugins: [],
    selectedPlugin: null,
    config: {},
    oauthStatus: {},
    saving: false,
    message: null,
    showSecrets: {},

    async init() {
      await this.loadPlugins();
    },

    async loadPlugins() {
      this.plugins = await rpc('getPlugins');
    },

    async selectPlugin(name) {
      this.selectedPlugin = this.plugins.find(p => p.name === name);
      this.config = await rpc('getPluginConfig', name) || {};
      this.oauthStatus = await rpc('getOAuthStatus', name);
      this.message = null;
    },

    async saveConfig() {
      this.saving = true;
      const result = await rpc('setPluginConfig', this.selectedPlugin.name, this.config);
      this.saving = false;
      this.message = result.success ? { type: 'success', text: 'Saved!' } : { type: 'error', text: result.error };
    },

    async toggleEnabled(name, enabled) {
      await rpc('setPluginEnabled', name, enabled);
      await this.loadPlugins();
    },

    getInputType(field) {
      if (field.type === 'secret') return this.showSecrets[field.key] ? 'text' : 'password';
      if (field.type === 'number') return 'number';
      return 'text';
    }
  }));

  Alpine.data('counter', () => ({
    count: 0,
    loading: false,

    async init() {
      this.count = await rpc('getCounter');
    },

    async increment() {
      this.loading = true;
      this.count = await rpc('incrementCounter');
      this.loading = false;
    },

    async decrement() {
      this.loading = true;
      this.count = await rpc('decrementCounter');
      this.loading = false;
    },

    async reset() {
      this.loading = true;
      this.count = await rpc('resetCounter');
      this.loading = false;
    }
  }));
});
