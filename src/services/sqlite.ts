import { CompiledQuery, type DatabaseConnection, type Driver, type QueryResult } from "kysely";
import { DatabaseSync } from "node:sqlite";

// https://docs.deno.com/examples/sqlite/
// https://www.kysely.dev/docs/runtimes/deno
// https://www.kysely.dev/docs/getting-started?package-manager=deno&dialect=sqlite
// "Kysely's built-in SQLite dialect does not work in Deno because the driver
// library it uses, "better-sqlite3", doesn't. You have to use a community
// SQLite dialect that works in Deno, or implement your own."

/**
 * A custom Kysely Driver that uses the native "node:sqlite" module
 * available in Deno v2.x.
 */
export class DenoSqliteDriver implements Driver {
  readonly #db: DatabaseSync;

  constructor(filename: string) {
    this.#db = new DatabaseSync(filename);
  }

  async init(): Promise<void> {
    // Native SQLite is synchronous and opens immediately in constructor
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return new DenoSqliteConnection(this.#db);
  }

  async beginTransaction(conn: DatabaseConnection): Promise<void> {
    await conn.executeQuery(CompiledQuery.raw("BEGIN"));
  }

  async commitTransaction(conn: DatabaseConnection): Promise<void> {
    await conn.executeQuery(CompiledQuery.raw("COMMIT"));
  }

  async rollbackTransaction(conn: DatabaseConnection): Promise<void> {
    await conn.executeQuery(CompiledQuery.raw("ROLLBACK"));
  }

  async releaseConnection(_conn: DatabaseConnection): Promise<void> {
    // Single connection mode for SQLite, nothing to release back to pool
  }

  async destroy(): Promise<void> {
    this.#db.close();
  }
}

export class DenoSqliteConnection implements DatabaseConnection {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  async executeQuery<R>(compiledQuery: CompiledQuery<unknown>): Promise<QueryResult<R>> {
    const { sql, parameters } = compiledQuery;
    const stmt = this.#db.prepare(sql);

    // Heuristic: SELECT or RETURNING returns rows, others return changes
    if (isSelectQuery(sql)) {
      const rows = stmt.all(...(parameters as any[])) as R[];
      return { rows };
    } else {
      const result = stmt.run(...(parameters as any[]));
      return {
        rows: [],
        numAffectedRows: result.changes,
        insertId: result.lastInsertRowid,
      } as QueryResult<R>;
    }
  }

  async *streamQuery<R>(
    _compiledQuery: unknown,
    _chunkSize: number,
  ): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("Streaming not supported by this driver yet");
  }
}

function isSelectQuery(sql: string): boolean {
  const s = sql.trim().toLowerCase();
  return s.startsWith("select") || s.includes("returning");
}
