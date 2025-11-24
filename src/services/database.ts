import { Generated, Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from "kysely";
import { DenoSqliteDriver } from "./sqlite.ts";

export interface MemoriesTable {
  id: Generated<number>;
  date: string | null;
  text: string;
}

export interface MessagesTable {
  id: Generated<number>;
  chat_id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  is_bot: number; // 0 or 1
  created_at: Generated<string>;
}

export interface DatabaseSchema {
  memories: MemoriesTable;
  messages: MessagesTable;
}

export type Database = Kysely<DatabaseSchema>;

export const db = new Kysely<DatabaseSchema>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DenoSqliteDriver("bell-pull.db"),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});
