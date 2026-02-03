import { Hono } from "hono";
import { newHttpBatchRpcResponse } from "capnweb";
import { PluginsRpcService } from "../services/plugins-rpc.ts";
import type { HonoEnv, Plugin } from "../types/index.ts";

const api = new Hono<HonoEnv>();

// Layout component
type LayoutProps = {
  title: string;
  // deno-lint-ignore no-explicit-any
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
    <body>{props.children}</body>
  </html>
);

// deno-lint-ignore no-explicit-any
const Sidebar = (props: { children: any }) => <aside class="sidebar">{props.children}</aside>;

// deno-lint-ignore no-explicit-any
const SidebarSection = (props: { title: string; children: any }) => (
  <div class="sidebar-section">
    <h3 class="sidebar-section-title">{props.title}</h3>
    <nav class="sidebar-nav">{props.children}</nav>
  </div>
);

const NavItem = (props: { view: string; label: string }) => (
  <button
    type="button"
    class="nav-item"
    x-on:click={`navigate('${props.view}')`}
    x-bind:class={`{ 'nav-item-active': isActive('${props.view}') }`}
  >
    {props.label}
  </button>
);

// deno-lint-ignore no-explicit-any
const ContentArea = (props: { children: any }) => <main class="content-area">{props.children}
</main>;

const GeneralSettings = () => (
  <div class="settings-screen">
    <h2>General Settings</h2>
    <p class="placeholder-text">General settings coming soon</p>
  </div>
);

const MemoriesScreen = () => (
  <div class="settings-screen">
    <h2>Memories</h2>
    <p class="placeholder-text">Memory management coming soon</p>
  </div>
);

const MessagesScreen = () => (
  <div class="settings-screen">
    <h2>Messages</h2>
    <p class="placeholder-text">Message history coming soon</p>
  </div>
);

// Dashboard route with AlpineJS
api.get("/dashboard", (c) => {
  return c.html(
    <Layout title="Bell Pull">
      <div class="dashboard-layout" x-data="dashboard">
        <Sidebar>
          <SidebarSection title="Settings">
            <NavItem view="general" label="General" />
            <NavItem view="memories" label="Memories" />
            <NavItem view="messages" label="Messages" />
          </SidebarSection>
          <SidebarSection title="Plugins">
            <template x-for="plugin in plugins" x-bind:key="plugin.name">
              <button
                type="button"
                class="nav-item"
                x-on:click="navigate('plugin:' + plugin.name)"
                x-bind:class="{ 'nav-item-active': currentView === 'plugin:' + plugin.name, 'nav-item-disabled': !plugin.enabled }"
              >
                <span x-text="plugin.displayName"></span>
                <span
                  x-show="!plugin.enabled"
                  class="badge badge-warning"
                >
                  disabled
                </span>
              </button>
            </template>
          </SidebarSection>
        </Sidebar>

        <ContentArea>
          <template x-if="currentView === 'general'">
            <GeneralSettings />
          </template>
          <template x-if="currentView === 'memories'">
            <MemoriesScreen />
          </template>
          <template x-if="currentView === 'messages'">
            <MessagesScreen />
          </template>
          <template x-if="currentView.startsWith('plugin:') && selectedPlugin">
            <div class="settings-screen">
              <div class="flex-row">
                <h2 x-text="selectedPlugin.displayName"></h2>
                <span
                  x-show="selectedPlugin.hasOAuth"
                  class="badge"
                  x-bind:class="oauthStatus.connected ? 'badge-success' : 'badge-warning'"
                  x-text="oauthStatus.connected ? 'Connected' : 'Not connected'"
                >
                </span>
              </div>

              <div class="settings-form">
                <label>Enabled</label>
                <div class="field">
                  <input
                    type="checkbox"
                    x-bind:checked="selectedPlugin.enabled"
                    x-on:change="toggleEnabled(selectedPlugin.name, $event.target.checked)"
                  />
                </div>

                <template x-if="selectedPlugin.hasOAuth">
                  <div class="form-row">
                    <label>Callback URL</label>
                    <div class="field">
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
                  <div class="field-only">
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
                  <div class="form-row">
                    <label x-text="field.key + (field.required ? ' *' : '')"></label>
                    <div class="field">
                      <template x-if="field.enumValues">
                        <select x-model="config[field.key]">
                          <template x-for="opt in field.enumValues" x-bind:key="opt">
                            <option x-bind:value="opt" x-text="opt"></option>
                          </template>
                        </select>
                      </template>
                      <template x-if="!field.enumValues && field.type !== 'boolean'">
                        <input
                          x-bind:type="getInputType(field)"
                          x-model="config[field.key]"
                          x-bind:placeholder="field.defaultValue || ''"
                        />
                      </template>
                      <template x-if="field.type === 'secret'">
                        <button
                          type="button"
                          class="toggle-btn"
                          x-on:click="showSecrets[field.key] = !showSecrets[field.key]"
                          x-text="showSecrets[field.key] ? 'Hide' : 'Show'"
                        >
                        </button>
                      </template>
                      <template x-if="field.type === 'boolean'">
                        <input type="checkbox" x-model="config[field.key]" />
                      </template>
                    </div>
                  </div>
                </template>

                <div class="full-width">
                  <button
                    type="button"
                    x-on:click="saveConfig()"
                    x-bind:disabled="saving"
                    x-text="saving ? 'Saving...' : 'Save Configuration'"
                  >
                  </button>
                </div>

                <template x-if="message">
                  <div class="full-width" x-bind:class="message.type" x-text="message.text"></div>
                </template>
              </div>
            </div>
          </template>
        </ContentArea>
      </div>
    </Layout>,
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
    },
  );
});

export const makeApiRoutes = (plugins: Plugin[]) => {
  // RPC endpoint with all methods (example + plugins)
  api.all("/rpc", async (c) => {
    const container = c.get("container");
    const request = c.req.raw;
    const response = await newHttpBatchRpcResponse(
      request,
      new PluginsRpcService(container, plugins),
    );
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  });

  return api;
};

export default api;
