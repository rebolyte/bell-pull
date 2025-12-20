import { DateTime } from "https://esm.sh/luxon@3.4.4";
import { Result, ResultAsync } from "neverthrow";
import { sql } from "kysely";
import { MemoryModel, parseMemoryRow } from "./schema.ts";
import { toError } from "../../utils/validate.ts";
import { Database } from "../../services/database.ts";

type MemoryDeps = { db: Database };

const getAllMemories = ({ db }: MemoryDeps) =>
(
  { includeDate = true, startDate = null }: { includeDate?: boolean; startDate?: string | null } =
    {},
) => {
  const datedQuery = () => {
    let query = db.selectFrom("memories")
      .selectAll()
      .where("date", "is not", null)
      .orderBy("date", "asc");

    if (startDate) {
      query = query
        .where("date", ">=", startDate)
        .where(sql`date(date)`, "<=", sql`date(${startDate}, '+7 days')`);
    }
    return query.execute();
  };

  const datelessQuery = () =>
    db.selectFrom("memories").selectAll().where("date", "is", null).execute();

  const fetchDated = includeDate
    ? ResultAsync.fromPromise(datedQuery(), toError)
    : ResultAsync.fromPromise(Promise.resolve([]), toError);

  return fetchDated
    .andThen((dated) =>
      ResultAsync.fromPromise(datelessQuery(), toError)
        .map((dateless) => [...dated, ...dateless])
    )
    .andThen((rows) => Result.combine(rows.map(parseMemoryRow)));
};

const getRelevantMemories = (deps: MemoryDeps) => () => {
  const today = DateTime.now().setZone("America/New_York").startOf("day");
  const todayFormatted = today.toFormat("yyyy-MM-dd");
  return getAllMemories(deps)({ includeDate: true, startDate: todayFormatted });
};

const formatMemoriesForPrompt = (memories: MemoryModel[]) => {
  if (!memories || memories.length === 0) {
    return "No stored memories are available.";
  }

  const datedMemories = memories
    .filter((memory) => memory.date)
    .map((memory) => {
      const date = DateTime.fromJSDate(memory.date!).setZone("utc");
      return `- ${date.toFormat("yyyy-MM-dd")} [ID: ${memory.id}]: ${memory.text}`;
    });

  const datelessMemories = memories
    .filter((memory) => !memory.date)
    .map((memory) => `- [ID: ${memory.id}]: ${memory.text}`);

  let result = "";

  if (datedMemories.length > 0) {
    result += "Dated memories:\n" + datedMemories.join("\n") + "\n\n";
  }

  if (datelessMemories.length > 0) {
    result += "General memories:\n" + datelessMemories.join("\n");
  }

  return result;
};

export const makeMemoryDomain = (deps: MemoryDeps) => ({
  getAllMemories: getAllMemories(deps),
  getRelevantMemories: getRelevantMemories(deps),
  formatMemoriesForPrompt,
});

export type MemoryDomain = ReturnType<typeof makeMemoryDomain>;
