// deno-lint-ignore-file no-explicit-any

import { Kysely, sql } from "kysely";

export async function hasColumn(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ name: string }>`
    SELECT name FROM pragma_table_info(${table}) WHERE name = ${column}
  `.execute(db);
  return result.rows.length > 0;
}
