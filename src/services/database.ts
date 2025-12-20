import { Generated, Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from "kysely";
import { DenoSqliteDriver } from "./sqlite.ts";
import { MemoryRow } from "../domains/memory/schema.ts";
import { MessageRow } from "../domains/messages/schema.ts";

export type MemoriesTable = {
  [K in keyof MemoryRow]: K extends "id" ? Generated<MemoryRow[K]>
    : MemoryRow[K];
};

export type MessagesTable = {
  [K in keyof MessageRow]: K extends "id" | "created_at" ? Generated<MessageRow[K]>
    : MessageRow[K];
};

export interface DatabaseSchema {
  memories: MemoriesTable;
  messages: MessagesTable;
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
  });
