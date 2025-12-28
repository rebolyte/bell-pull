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
    plugins: [new CamelCasePlugin()],
  });
