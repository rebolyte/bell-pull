import type { CronJobInfo, FieldInfo, PluginInfo } from "../../../types/shared.ts";
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
  customUI?: unknown;
};

export const PluginSettings = ({
  plugin,
  config,
  oauthStatus,
  baseUrl,
  flash,
  flashMessage,
  customUI,
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
      {plugin.hasOAuth && (
        <OAuthSection
          plugin={plugin}
          oauthStatus={oauthStatus}
          baseUrl={baseUrl}
        />
      )}

      {plugin.fields
        .filter((f) => f.type !== "cron" && f.type !== "hidden" && f.type !== "textarea")
        .map((field) => <ConfigField key={field.key} field={field} value={config[field.key]} />)}

      <CronJobsSection plugin={plugin} config={config} />

      {plugin.fields
        .filter((f) => f.type === "textarea")
        .map((field) => <TextareaField key={field.key} field={field} value={config[field.key]} />)}

      <div class="full-width">
        <button type="submit">Save Configuration</button>
      </div>
    </form>

    {customUI}
  </div>
);

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
            href={`${baseUrl}/oauth/${plugin.name}/authorize`}
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
        : field.type === "managed"
        ? <input type="text" value={(value as string) ?? ""} disabled />
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

const TextareaField = ({ field, value }: ConfigFieldProps) => (
  <fieldset class="textarea-fieldset full-width">
    <legend>{field.key}</legend>
    <textarea
      name={field.key}
      rows={10}
    >
      {(value as string) ?? String(field.defaultValue ?? "")}
    </textarea>
    {field.description && <p class="field-description">{field.description}</p>}
  </fieldset>
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

const CronJobsSection = (
  { plugin, config }: { plugin: PluginInfo; config: Record<string, unknown> },
) => {
  if (!plugin.cronJobs?.length) return null;

  return (
    <div class="cron-jobs-section">
      {plugin.cronJobs.map((job) => (
        <CronJobFieldset
          key={job.name}
          pluginName={plugin.name}
          job={job}
          config={config}
        />
      ))}
    </div>
  );
};

type CronJobFieldsetProps = {
  pluginName: string;
  job: CronJobInfo;
  config: Record<string, unknown>;
};

const CronJobFieldset = ({ pluginName, job, config }: CronJobFieldsetProps) => {
  const enabledName = `${job.name}-enabled`;
  const fieldsetId = `cron-fieldset-${job.name}`;

  return (
    <fieldset class="cron-job-fieldset full-width" id={fieldsetId}>
      <legend>
        <label class="cron-enabled-toggle">
          <input
            type="checkbox"
            name={enabledName}
            checked={job.enabled}
            onclick={`
              const body = document.querySelector('#${fieldsetId} .cron-body');
              const disabled = !this.checked;
              body.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = disabled);
              body.classList.toggle('cron-disabled', disabled);
            `}
          />
          {job.name}
        </label>
      </legend>
      <div class={`cron-body${job.enabled ? "" : " cron-disabled"}`}>
        <label>Schedule</label>
        <div class="field cron-job-field">
          <input
            type="text"
            name={job.scheduleField}
            value={job.schedule}
            placeholder="0 * * * *"
            disabled={!job.enabled}
          />
          <CronJobRow pluginName={pluginName} jobName={job.name} disabled={!job.enabled} />
        </div>

        {job.fields
          .filter((f) => f.type === "textarea")
          .map((field) => (
            <div class="cron-textarea-wrapper" key={field.key}>
              <label>{field.key}</label>
              <div class="field">
                <textarea
                  name={field.key}
                  rows={10}
                  disabled={!job.enabled}
                >
                  {(config[field.key] as string) ?? String(field.defaultValue ?? "")}
                </textarea>
              </div>
              {field.description && <p class="field-description">{field.description}</p>}
            </div>
          ))}

        {job.fields
          .filter((f) => f.type !== "textarea")
          .map((field) => (
            <ConfigField key={field.key} field={field} value={config[field.key]} />
          ))}
      </div>
    </fieldset>
  );
};

type CronJobRowProps = {
  pluginName: string;
  jobName: string;
  status?: "success" | "error";
  message?: string;
  disabled?: boolean;
};

export const CronJobRow = ({
  pluginName,
  jobName,
  status,
  message,
  disabled,
}: CronJobRowProps) => {
  const rowId = `cron-run-${pluginName}-${jobName}`;

  return (
    <div class="cron-run-area" id={rowId}>
      {status === "success" && <span class="badge badge-success">Done</span>}
      {status === "error" && (
        <span class="badge badge-error" title={message}>
          Error
        </span>
      )}
      <button
        type="button"
        class="toggle-btn"
        hx-post={`/dashboard/plugins/${pluginName}/cron/${jobName}/run`}
        hx-target={`#${rowId}`}
        hx-swap="outerHTML"
        hx-indicator={`#${rowId}`}
        disabled={disabled}
      >
        Run
      </button>
    </div>
  );
};
