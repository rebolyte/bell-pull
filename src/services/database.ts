import {
  CamelCasePlugin,
  Generated,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import { DenoSqliteDriver } from "./sqlite.ts";

export interface MemoriesTable {
  id: Generated<number>;
  date: string | null;
  text: string;
  source: string | null;
  tags: string | null; // JSON array
  createdAt: Generated<string>;
  lastModified: Generated<string>;
  sourcePluginId: number | null;
  externalId: string | null;
  original: string | null;
}

export interface MessagesTable {
  id: Generated<number>;
  chatId: string;
  senderId: string;
  senderName: string;
  message: string;
  isBot: number;
  createdAt: Generated<string>;
}

export interface PluginConfigsTable {
  id: Generated<number>;
  pluginName: string;
  config: string; // JSON object
  enabled: number;
  createdAt: Generated<string>;
  lastModified: Generated<string>;
}

export interface ArchiveTable {
  id: Generated<number>;
  tableName: string;
  recordId: string;
  data: string; // JSON
  archivedAt: Generated<string>;
  causedByTable: string | null;
  causedById: string | null;
}

export interface MetricsTable {
  id: Generated<number>;
  date: string;
  metric: string;
  value: number;
  unit: string | null;
  description: string | null;
  source: string;
  sourcePluginId: number | null;
  createdAt: Generated<string>;
  lastModified: Generated<string>;
}

export interface DatabaseSchema {
  memories: MemoriesTable;
  messages: MessagesTable;
  pluginConfigs: PluginConfigsTable;
  archive: ArchiveTable;
  metrics: MetricsTable;
}

export type Database = Kysely<DatabaseSchema>;

export const createDatabase = (path: string): Database =>
  new Kysely<DatabaseSchema>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () => new DenoSqliteDriver(path),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createQueryCompiler: () => new SqliteQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
  });
