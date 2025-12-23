import { DateTime } from "https://esm.sh/luxon@3.4.4";
import * as z from "@zod/zod";
import { ok, Result, ResultAsync } from "neverthrow";
import { sql } from "kysely";
import {
  CreateMemoriesSchema,
  DeleteMemoriesSchema,
  EditMemoriesSchema,
  type LLMCreateMemory,
  LLMCreateMemorySchema,
  LLMDeleteMemoryIdsSchema,
  type LLMEditMemory,
  LLMEditMemorySchema,
  type MemoryModel,
  parseMemoryRow,
} from "./schema.ts";
import { extractTag, jsonParsed, stripTags, toError } from "../../utils/validate.ts";
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

export type MemoryMessageAnalysis = {
  memories: LLMCreateMemory[];
  editMemories: LLMEditMemory[];
  deleteMemories: string[];
  response: string;
};

const extractMemories = (
  messageText: string,
): Result<MemoryMessageAnalysis, Error> => {
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

const updateMemories = (_deps: MemoryDeps) =>
async (
  analysis: MemoryMessageAnalysis,
) => {
  // Create memories based on the analysis
  if (analysis.memories && analysis.memories.length > 0) {
    const { sqlite } = await import("https://esm.town/v/stevekrouse/sqlite");
    const { nanoid } = await import("https://esm.sh/nanoid@5.0.5");

    const createdIds = [];

    for (const memory of analysis.memories) {
      const memoryId = nanoid(10);
      createdIds.push(memoryId);
      await sqlite.execute({
        sql: `INSERT INTO memories (id, date, text, createdBy, createdDate, tags)
                VALUES (:id, :date, :text, :createdBy, :createdDate, :tags)`,
        args: {
          id: memoryId,
          date: memory.date ?? null,
          text: memory.text,
          createdBy: "telegram",
          createdDate: Date.now(),
          tags: "",
        },
      });
    }

    console.log(
      `Created ${analysis.memories.length} memories with IDs: ${createdIds.join(", ")}`,
    );
  }

  // Edit memories if requested
  if (analysis.editMemories && analysis.editMemories.length > 0) {
    const { sqlite } = await import("https://esm.town/v/stevekrouse/sqlite");

    const editedIds = [];

    for (const memory of analysis.editMemories) {
      if (!memory.id) {
        console.error("Cannot edit memory without ID:", memory);
        continue;
      }

      editedIds.push(memory.id);

      // Create the SET clause dynamically based on what fields are provided
      const updateFields = [];
      const args: Record<string, string | null> = { id: memory.id };

      if (memory.text !== undefined) {
        updateFields.push("text = :text");
        args.text = memory.text;
      }

      if (memory.date !== undefined) {
        updateFields.push("date = :date");
        args.date = memory.date;
      }

      if (memory.tags !== undefined) {
        updateFields.push("tags = :tags");
        args.tags = memory.tags;
      }

      // Only proceed if we have fields to update
      if (updateFields.length > 0) {
        const setClause = updateFields.join(", ");
        await sqlite.execute({
          sql: `UPDATE memories SET ${setClause} WHERE id = :id`,
          args,
        });
      }
    }

    console.log(
      `Edited ${editedIds.length} memories with IDs: ${editedIds.join(", ")}`,
    );
  }

  // Delete memories if requested
  if (analysis.deleteMemories && analysis.deleteMemories.length > 0) {
    const { sqlite } = await import("https://esm.town/v/stevekrouse/sqlite");

    for (const memoryId of analysis.deleteMemories) {
      await sqlite.execute({
        sql: `DELETE FROM memories WHERE id = :id`,
        args: { id: memoryId },
      });
    }

    console.log(
      `Deleted ${analysis.deleteMemories.length} memories with IDs: ${
        analysis.deleteMemories.join(", ")
      }`,
    );
  }
};

export const makeMemoryDomain = (deps: MemoryDeps) => ({
  getAllMemories: getAllMemories(deps),
  getRelevantMemories: getRelevantMemories(deps),
  updateMemories: updateMemories(deps),
  extractMemories,
  formatMemoriesForPrompt,
});

export { extractMemories };
export type MemoryDomain = ReturnType<typeof makeMemoryDomain>;
