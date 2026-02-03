import { rpc } from "./api.js";

document.addEventListener("alpine:init", () => {
  Alpine.data("dashboard", () => ({
    currentView: "general",
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

    navigate(view) {
      this.currentView = view;
      this.message = null;
      if (view.startsWith("plugin:")) {
        this.selectPlugin(view.split(":")[1]);
      } else {
        this.selectedPlugin = null;
      }
    },

    isActive(view) {
      return this.currentView === view;
    },

    async loadPlugins() {
      this.plugins = await rpc("getPlugins");
    },

    async selectPlugin(name) {
      this.selectedPlugin = this.plugins.find((p) => p.name === name);
      this.config = await rpc("getPluginConfig", name) || {};
      this.oauthStatus = await rpc("getOAuthStatus", name);
    },

    async saveConfig() {
      this.saving = true;
      const result = await rpc("setPluginConfig", this.selectedPlugin.name, this.config);
      this.saving = false;
      this.message = result.success
        ? { type: "success", text: "Saved!" }
        : { type: "error", text: result.error };
    },

    async toggleEnabled(name, enabled) {
      await rpc("setPluginEnabled", name, enabled);
      await this.loadPlugins();
      if (this.selectedPlugin?.name === name) {
        this.selectedPlugin = this.plugins.find((p) => p.name === name);
      }
    },

    getInputType(field) {
      if (field.type === "secret") return this.showSecrets[field.key] ? "text" : "password";
      if (field.type === "number") return "number";
      return "text";
    },
  }));
});
