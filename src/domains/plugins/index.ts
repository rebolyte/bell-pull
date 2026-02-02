import * as R from "@remeda/remeda";
import { ok, Result, ResultAsync } from "neverthrow";
import { parsePluginConfigRow, type PluginConfigRow } from "./schema.ts";
import { type AppError, dbError } from "../../errors.ts";
import type { Database } from "../../services/database.ts";
import type { Logger } from "../../services/logger.ts";

type PluginsDeps = { db: Database; log: Logger };

export type PluginConfig<T = unknown> = {
  id: number;
  pluginName: string;
  config: T;
  enabled: boolean;
  createdAt: string;
  lastModified: string;
};

const getConfig =
  ({ db }: PluginsDeps) =>
  <T = unknown>(pluginName: string): ResultAsync<PluginConfig<T> | null, AppError> =>
    ResultAsync.fromPromise(
      db.selectFrom("pluginConfigs")
        .selectAll()
        .where("pluginName", "=", pluginName)
        .executeTakeFirst(),
      dbError("Failed to fetch plugin config"),
    ).andThen((row) => {
      if (!row) return ok(null);
      return parsePluginConfigRow(row).map((parsed) => ({
        id: parsed.id,
        pluginName: parsed.pluginName,
        config: JSON.parse(parsed.config) as T,
        enabled: parsed.enabled,
        createdAt: parsed.createdAt,
        lastModified: parsed.lastModified,
      }));
    });

const setConfig =
  ({ db, log }: PluginsDeps) =>
  <T>(pluginName: string, config: T, enabled?: boolean): ResultAsync<void, AppError> => {
    const configJson = JSON.stringify(config);
    return ResultAsync.fromPromise(
      db.insertInto("pluginConfigs")
        .values({
          pluginName,
          config: configJson,
          enabled: enabled !== undefined ? (enabled ? 1 : 0) : 1,
        })
        .onConflict((oc) =>
          oc.column("pluginName").doUpdateSet({
            config: configJson,
            ...(enabled !== undefined ? { enabled: enabled ? 1 : 0 } : {}),
          })
        )
        .execute(),
      dbError("Failed to save plugin config"),
    ).map(() => {
      log.info`Saved config for plugin ${pluginName}`;
    });
  };

const setEnabled =
  ({ db, log }: PluginsDeps) =>
  (pluginName: string, enabled: boolean): ResultAsync<void, AppError> =>
    ResultAsync.fromPromise(
      db.updateTable("pluginConfigs")
        .set({ enabled: enabled ? 1 : 0 })
        .where("pluginName", "=", pluginName)
        .execute(),
      dbError("Failed to update plugin enabled state"),
    ).map(() => {
      log.info`Set plugin ${pluginName} enabled=${enabled}`;
    });

const listConfigs = ({ db }: PluginsDeps) => (): ResultAsync<PluginConfigRow[], AppError> =>
  ResultAsync.fromPromise(
    db.selectFrom("pluginConfigs").selectAll().execute(),
    dbError("Failed to list plugin configs"),
  ).andThen((rows) => Result.combine(rows.map(parsePluginConfigRow)));

const deleteConfig =
  ({ db, log }: PluginsDeps) => (pluginName: string): ResultAsync<void, AppError> =>
    ResultAsync.fromPromise(
      db.deleteFrom("pluginConfigs")
        .where("pluginName", "=", pluginName)
        .execute(),
      dbError("Failed to delete plugin config"),
    ).map(() => {
      log.info`Deleted config for plugin ${pluginName}`;
    });

// TS errors?
// export const makePluginsDomain = (deps: PluginsDeps) =>
//   R.pipe(
//     {
//       getConfig,
//       setConfig,
//       setEnabled,
//       listConfigs,
//       deleteConfig,
//     },
//     R.mapValues((f) => f(deps)),
//   );

export const makePluginsDomain = (deps: PluginsDeps) => (
  {
    getConfig: getConfig(deps),
    setConfig: setConfig(deps),
    setEnabled: setEnabled(deps),
    listConfigs: listConfigs(deps),
    deleteConfig: deleteConfig(deps),
  }
);

export type PluginsDomain = ReturnType<typeof makePluginsDomain>;
