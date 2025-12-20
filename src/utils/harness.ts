import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  FileMigrationProvider,
  Kysely,
  Migrator,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import { DenoSqliteDriver } from "../services/sqlite.ts";
import type { DatabaseSchema } from "../services/database.ts";

export async function createTestDb() {
  const db = new Kysely<DatabaseSchema>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () => new DenoSqliteDriver(":memory:"),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createQueryCompiler: () => new SqliteQueryCompiler(),
    },
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(Deno.cwd(), "migrations"),
    }),
  });

  const { error } = await migrator.migrateToLatest();

  if (error) {
    throw error;
  }

  return db;
}

export function useHarness() {
  let db: Kysely<DatabaseSchema>;

  return {
    get db() {
      return db;
    },

    async setup() {
      db = await createTestDb();
    },

    async reset() {
      await db.deleteFrom("memories").execute();
      await db.deleteFrom("messages").execute();
    },

    async teardown() {
      await db.destroy();
    },
  };
}
