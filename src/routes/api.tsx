import { Hono } from "hono";
import { newHttpBatchRpcResponse } from "capnweb";
import { PluginsRpcService } from "../services/plugins-rpc.ts";
import type { HonoEnv, Plugin } from "../types/index.ts";

const api = new Hono<HonoEnv>();

// Layout component
type LayoutProps = {
  title: string;
  children?: any;
};

const Layout = (props: LayoutProps) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{props.title}</title>
      <link
        rel="icon"
        href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22 fill=%22%23007d9c%22>🛎️</text></svg>"
      />
      <link rel="stylesheet" href="/static/styles/main.css" />
      <script type="module" src="/static/js/main.js"></script>
      {/* deno-fmt-ignore */}
      <script
        defer
        src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"
      />
    </head>
    <body>
      <div class="container">{props.children}</div>
    </body>
  </html>
);

// Dashboard route with AlpineJS
api.get("/dashboard", (c) => {
  return c.html(
    <Layout title="Bell Pull">
      <h1>Bell Pull</h1>

      {/* Plugin Configuration */}
      <div class="card plugin-card" x-data="pluginConfig">
        <h2>
          Plugin Configuration <span class="badge">Data Sources</span>
        </h2>

        <div class="mb-3">
          <select
            x-on:change="selectPlugin($event.target.value)"
            class="select-plugin"
          >
            <option value="">Select a plugin...</option>
            <template x-for="plugin in plugins" x-bind:key="plugin.name">
              <option
                x-bind:value="plugin.name"
                x-text="plugin.displayName + (plugin.enabled ? '' : ' (disabled)')"
              ></option>
            </template>
          </select>
        </div>

        <template x-if="selectedPlugin">
          <div>
            <div class="flex-row">
              <strong x-text="selectedPlugin.displayName"></strong>
              <span
                x-show="selectedPlugin.hasOAuth"
                class="badge"
                x-bind:class="oauthStatus.connected ? 'badge-success' : 'badge-warning'"
                x-text="oauthStatus.connected ? 'Connected' : 'Not connected'"
              ></span>
            </div>

            <template x-if="selectedPlugin.hasOAuth">
              <div class="form-group mb-3">
                <label>Callback URL (for OAuth app config)</label>
                <div class="callback-url-input">
                  <input
                    type="text"
                    readonly
                    x-bind:value="window.location.origin + '/oauth/' + selectedPlugin.name + '/callback'"
                  />
                  <button
                    type="button"
                    class="toggle-btn"
                    x-on:click="navigator.clipboard.writeText(window.location.origin + '/oauth/' + selectedPlugin.name + '/callback')"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </template>

            <template x-if="selectedPlugin.hasOAuth && !oauthStatus.connected">
              <div class="mb-3">
                <a
                  x-bind:href="'/oauth/' + selectedPlugin.name + '/authorize'"
                  class="button"
                >
                  Connect
                </a>
              </div>
            </template>

            <template
              x-for="field in selectedPlugin.fields.filter(f => f.type !== 'oauth-managed')"
              x-bind:key="field.key"
            >
              <div class="form-group">
                <label x-text="field.key + (field.required ? ' *' : '')"></label>
                <template x-if="field.enumValues">
                  <select x-model="config[field.key]" class="select-full">
                    <template x-for="opt in field.enumValues" x-bind:key="opt">
                      <option x-bind:value="opt" x-text="opt"></option>
                    </template>
                  </select>
                </template>
                <template x-if="!field.enumValues && field.type !== 'boolean'">
                  <span class="input-group">
                    <input
                      x-bind:type="getInputType(field)"
                      x-model="config[field.key]"
                      x-bind:placeholder="field.defaultValue || ''"
                    />
                    <template x-if="field.type === 'secret'">
                      <button
                        type="button"
                        class="toggle-btn"
                        x-on:click="showSecrets[field.key] = !showSecrets[field.key]"
                        x-text="showSecrets[field.key] ? 'Hide' : 'Show'"
                      ></button>
                    </template>
                  </span>
                </template>
                <template x-if="field.type === 'boolean'">
                  <input type="checkbox" x-model="config[field.key]" />
                </template>
              </div>
            </template>

            <button
              type="button"
              x-on:click="saveConfig()"
              x-bind:disabled="saving"
              x-text="saving ? 'Saving...' : 'Save Configuration'"
            ></button>

            <template x-if="message">
              <div x-bind:class="message.type" x-text="message.text"></div>
            </template>
          </div>
        </template>
      </div>

      {/* Counter Example */}
      <div class="card" x-data="counter">
        <h2>
          Counter Example <span class="badge">Server-side State</span>
        </h2>
        <div class="counter" x-text="count"></div>
        <button
          type="button"
          x-on:click="increment()"
          x-bind:disabled="loading"
          x-bind:style="loading ? 'opacity: 0.5; cursor: not-allowed;' : ''"
        >
          Increment
        </button>
        <button
          type="button"
          x-on:click="decrement()"
          x-bind:disabled="loading"
          x-bind:style="loading ? 'opacity: 0.5; cursor: not-allowed;' : ''"
        >
          Decrement
        </button>
        <button
          type="button"
          x-on:click="reset()"
          x-bind:disabled="loading"
          x-bind:style="loading ? 'opacity: 0.5; cursor: not-allowed;' : ''"
        >
          Reset
        </button>
      </div>
    </Layout>
  );
});

// Store chat message
api.post("/messages", async (c) => {
  const body = await c.req.json();
  // const { chatId, senderId, senderName, message, isBot } = body;

  const container = c.get("container");

  // Call the domain method
  // Note: We await the result of match() because the handlers might be async or return promises
  return container.messages.storeChatMessage(body).match(
    (result) => c.json({ success: true, result }),
    (error) => {
      console.error("Failed to store message:", error);
      return c.json({ success: false, error: JSON.parse(error.message) }, 500);
    }
  );
});

export const makeApiRoutes = (plugins: Plugin[]) => {
  // RPC endpoint with all methods (example + plugins)
  api.all("/rpc", async (c) => {
    const container = c.get("container");
    const request = c.req.raw;
    const response = await newHttpBatchRpcResponse(
      request,
      new PluginsRpcService(container, plugins)
    );
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  });

  return api;
};

export default api;
