import type { FieldInfo, PluginInfo } from "../../../types/shared.ts";
import { FlashMessage } from "../flash.tsx";

type OAuthStatus = {
  connected: boolean;
  expiresAt?: string;
};

type PluginSettingsProps = {
  plugin: PluginInfo;
  config: Record<string, unknown>;
  oauthStatus: OAuthStatus;
  baseUrl: string;
  flash?: string;
  flashMessage?: string;
};

export const PluginSettings = ({
  plugin,
  config,
  oauthStatus,
  baseUrl,
  flash,
  flashMessage,
}: PluginSettingsProps) => (
  <div class="settings-screen">
    <div class="flex-row">
      <h2>{plugin.displayName}</h2>
      {plugin.hasOAuth && (
        <span
          class={`badge ${oauthStatus.connected ? "badge-success" : "badge-warning"}`}
        >
          {oauthStatus.connected ? "Connected" : "Not connected"}
        </span>
      )}
    </div>

    <FlashMessage flash={flash} message={flashMessage} />

    <form
      method="post"
      action={`/dashboard/plugins/${plugin.name}/config`}
      class="settings-form"
    >
      <EnabledToggle plugin={plugin} />

      {plugin.hasOAuth && (
        <OAuthSection
          plugin={plugin}
          oauthStatus={oauthStatus}
          baseUrl={baseUrl}
        />
      )}

      {plugin.fields
        .filter((f) => f.type !== "oauth-managed")
        .map((field) => <ConfigField field={field} value={config[field.key]} />)}

      <div class="full-width">
        <button type="submit">Save Configuration</button>
      </div>
    </form>
  </div>
);

type EnabledToggleProps = {
  plugin: PluginInfo;
};

export const EnabledToggle = ({ plugin }: EnabledToggleProps) => {
  const needsConfirm = plugin.name === "telegram" && plugin.enabled;
  const dialogId = `disable-${plugin.name}-confirm`;

  return (
    <div class="form-row" id="enabled-toggle">
      <label>Enabled</label>
      <div class="field">
        <input
          type="checkbox"
          name="enabled"
          checked={plugin.enabled}
          {...(needsConfirm
            ? {
              onclick: `event.preventDefault(); document.getElementById('${dialogId}').showModal()`,
            }
            : {
              "hx-post": `/dashboard/plugins/${plugin.name}/toggle`,
              "hx-target": "#enabled-toggle",
              "hx-swap": "outerHTML",
              "hx-vals": JSON.stringify({ enabled: String(!plugin.enabled) }),
            })}
        />
      </div>
      {needsConfirm && (
        <dialog id={dialogId}>
          <p>Are you sure? Your bot will not respond to messages.</p>
          <div class="dialog-actions">
            <button
              type="button"
              onclick={`document.getElementById('${dialogId}').close()`}
            >
              Cancel
            </button>
            <button
              type="button"
              onclick={`
                document.getElementById('${dialogId}').close();
                htmx.ajax('POST', '/dashboard/plugins/${plugin.name}/toggle', {
                  target: '#enabled-toggle',
                  swap: 'outerHTML',
                  values: { enabled: 'false' }
                })
              `}
            >
              Disable
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
};

type OAuthSectionProps = {
  plugin: PluginInfo;
  oauthStatus: OAuthStatus;
  baseUrl: string;
};

const OAuthSection = ({ plugin, oauthStatus, baseUrl }: OAuthSectionProps) => {
  const callbackUrl = `${baseUrl}/oauth/${plugin.name}/callback`;
  const inputId = `callback-url-${plugin.name}`;

  return (
    <>
      <div class="form-row">
        <label>Callback URL</label>
        <div class="field">
          <input type="text" readonly value={callbackUrl} id={inputId} />
          <button
            type="button"
            class="toggle-btn"
            onclick={`navigator.clipboard.writeText(document.getElementById('${inputId}').value)`}
          >
            Copy
          </button>
        </div>
      </div>

      {!oauthStatus.connected && (
        <div class="field-only">
          <a
            href={`/oauth/${plugin.name}/authorize`}
            class="button"
            hx-boost="false"
          >
            Connect
          </a>
        </div>
      )}
    </>
  );
};

type ConfigFieldProps = {
  field: FieldInfo;
  value: unknown;
};

const ConfigField = ({ field, value }: ConfigFieldProps) => (
  <div class="form-row">
    <label>
      {field.key}
      {field.required && " *"}
    </label>
    <div class="field">
      {field.enumValues
        ? (
          <select name={field.key}>
            {field.enumValues.map((opt) => (
              <option value={opt} selected={value === opt}>
                {opt}
              </option>
            ))}
          </select>
        )
        : field.type === "boolean"
        ? <input type="checkbox" name={field.key} checked={!!value} />
        : field.type === "secret"
        ? <SecretField fieldKey={field.key} value={value as string} />
        : (
          <input
            type={field.type === "number" ? "number" : "text"}
            name={field.key}
            value={(value as string) ?? ""}
            placeholder={String(field.defaultValue ?? "")}
          />
        )}
    </div>
  </div>
);

type SecretFieldProps = {
  fieldKey: string;
  value: string;
};

const SecretField = ({ fieldKey, value }: SecretFieldProps) => {
  const inputId = `secret-${fieldKey}`;
  return (
    <>
      <input
        type="password"
        name={fieldKey}
        value={value ?? ""}
        id={inputId}
        class="secret-input"
      />
      <button
        type="button"
        class="toggle-btn"
        onclick={`
          const input = document.getElementById('${inputId}');
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          this.textContent = isPassword ? 'Hide' : 'Show';
        `}
      >
        Show
      </button>
    </>
  );
};
