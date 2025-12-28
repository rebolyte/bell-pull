import { DateTime } from "luxon";
import { ok, Result, ResultAsync } from "neverthrow";
import { sql } from "kysely";
import {
  CreateMemoriesSchema,
  DeleteMemoriesSchema,
  EditMemoriesSchema,
  type LLMCreateMemory,
  type LLMEditMemory,
  type Memory,
  parseMemory,
} from "./schema.ts";
import { extractTag, stripTags } from "../../utils/validate.ts";
import { type AppError, dbError } from "../../errors.ts";
import type { Database } from "../../services/database.ts";

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
    ? ResultAsync.fromPromise(datedQuery(), dbError("Failed to fetch dated memories"))
    : ResultAsync.fromPromise(Promise.resolve([]), dbError("Failed to fetch dated memories"));

  return fetchDated
    .andThen((dated) =>
      ResultAsync.fromPromise(datelessQuery(), dbError("Failed to fetch dateless memories"))
        .map((dateless) => [...dated, ...dateless])
    )
    .andThen((rows) => Result.combine(rows.map(parseMemory)));
};

const getRelevantMemories = (deps: MemoryDeps) => () => {
  const today = DateTime.now().setZone("America/New_York").startOf("day");
  const todayFormatted = today.toFormat("yyyy-MM-dd");
  return getAllMemories(deps)({ includeDate: true, startDate: todayFormatted });
};

const formatMemoriesForPrompt = (memories: Memory[]) => {
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

export type MemoryMessageAnalysis = {
  memories: LLMCreateMemory[];
  editMemories: LLMEditMemory[];
  deleteMemories: string[];
  response: string;
};

const extractMemories = (
  messageText: string,
): Result<MemoryMessageAnalysis, never> => {
  const createJSON = extractTag("createMemories")(messageText ?? "");
  const editJSON = extractTag("editMemories")(messageText ?? "");
  const deleteJSON = extractTag("deleteMemories")(messageText ?? "");

  const toCreate = createJSON ? CreateMemoriesSchema.safeParse(createJSON) : { success: false };
  const toEdit = editJSON ? EditMemoriesSchema.safeParse(editJSON) : { success: false };
  const toDelete = deleteJSON ? DeleteMemoriesSchema.safeParse(deleteJSON) : { success: false };

  const response = stripTags(["createMemories", "editMemories", "deleteMemories"])(messageText)
    .replace(/\n{3,}/g, "\n\n");

  return ok({
    memories: toCreate.success ? toCreate.data : [],
    editMemories: toEdit.success ? toEdit.data : [],
    deleteMemories: toDelete.success ? toDelete.data : [],
    response,
  });
};

const updateMemories = ({ db }: MemoryDeps) =>
(
  analysis: MemoryMessageAnalysis,
): ResultAsync<void, AppError> =>
  ResultAsync.fromPromise(
    (async () => {
      if (analysis.memories.length > 0) {
        await db
          .insertInto("memories")
          .values(analysis.memories.map((m) => ({ date: m.date ?? null, text: m.text })))
          .execute();
        console.log(`Created ${analysis.memories.length} memories`);
      }

      for (const memory of analysis.editMemories) {
        const id = parseInt(memory.id, 10);
        if (isNaN(id)) continue;

        let query = db.updateTable("memories").where("id", "=", id);
        if (memory.text !== undefined) query = query.set("text", memory.text);
        if (memory.date !== undefined) query = query.set("date", memory.date);
        await query.execute();
      }
      if (analysis.editMemories.length > 0) {
        console.log(`Edited ${analysis.editMemories.length} memories`);
      }

      if (analysis.deleteMemories.length > 0) {
        const ids = analysis.deleteMemories.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
        if (ids.length > 0) {
          await db.deleteFrom("memories").where("id", "in", ids).execute();
          console.log(`Deleted ${ids.length} memories`);
        }
      }
    })(),
    dbError("Failed to update memories"),
  );

export const makeMemoryDomain = (deps: MemoryDeps) => ({
  getAllMemories: getAllMemories(deps),
  getRelevantMemories: getRelevantMemories(deps),
  updateMemories: updateMemories(deps),
  extractMemories,
  formatMemoriesForPrompt,
});

export { extractMemories };
export type MemoryDomain = ReturnType<typeof makeMemoryDomain>;
