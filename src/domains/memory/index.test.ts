import { afterAll, beforeAll, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { useHarness } from "../../utils/harness.ts";
import type { AppConfig } from "../../services/config.ts";
import { extractMemories, makeMemoryDomain, MemoryDomain } from "./index.ts";
import type { CategorizedMemories, Memory } from "./schema.ts";
import { DateTime } from "luxon";
import type { Database } from "../../services/database.ts";
import { silentLogger } from "../../../tests/fixtures/mocks.ts";
import type { PluginConfig } from "../plugins/index.ts";

describe("Memory Domain", () => {
  describe("extractMemories", () => {
    it("should extract createMemories from message", () => {
      const message = `Here's my response
<createMemories>[{"text": "Remember to buy milk", "date": "2024-01-15"}]</createMemories>`;

      const result = extractMemories(message);
      expect(result.isOk()).toBe(true);
      const analysis = result._unsafeUnwrap();
      expect(analysis.memories).toHaveLength(1);
      expect(analysis.memories[0].text).toBe("Remember to buy milk");
      expect(analysis.memories[0].date).toBe("2024-01-15");
      expect(analysis.response).toBe("Here's my response");
    });

    it("should extract editMemories from message", () => {
      const message = `Updated!
<editMemories>[{"id": "abc123", "text": "Updated text"}]</editMemories>`;

      const result = extractMemories(message);
      expect(result.isOk()).toBe(true);
      const analysis = result._unsafeUnwrap();
      expect(analysis.editMemories).toHaveLength(1);
      expect(analysis.editMemories[0].id).toBe("abc123");
      expect(analysis.editMemories[0].text).toBe("Updated text");
    });

    it("should extract deleteMemories from message", () => {
      const message = `Deleted those memories
<deleteMemories>["abc123", "def456"]</deleteMemories>`;

      const result = extractMemories(message);
      expect(result.isOk()).toBe(true);
      const analysis = result._unsafeUnwrap();
      expect(analysis.deleteMemories).toEqual(["abc123", "def456"]);
    });

    it("should handle all three operations in one message", () => {
      const message = `Done!
<createMemories>[{"text": "New one"}]</createMemories>
<editMemories>[{"id": "xyz", "text": "Changed"}]</editMemories>
<deleteMemories>["old1"]</deleteMemories>`;

      const result = extractMemories(message);
      expect(result.isOk()).toBe(true);
      const analysis = result._unsafeUnwrap();
      expect(analysis.memories).toHaveLength(1);
      expect(analysis.editMemories).toHaveLength(1);
      expect(analysis.deleteMemories).toHaveLength(1);
      expect(analysis.response).toBe("Done!");
    });

    it("should return empty arrays for no memory tags", () => {
      const message = "Just a regular response with no memory operations.";

      const result = extractMemories(message);
      expect(result.isOk()).toBe(true);
      const analysis = result._unsafeUnwrap();
      expect(analysis.memories).toEqual([]);
      expect(analysis.editMemories).toEqual([]);
      expect(analysis.deleteMemories).toEqual([]);
      expect(analysis.response).toBe(message);
    });

    it("should handle invalid JSON gracefully", () => {
      const message = `Response
<createMemories>invalid json here</createMemories>`;

      const result = extractMemories(message);
      expect(result.isOk()).toBe(true);
      const analysis = result._unsafeUnwrap();
      expect(analysis.memories).toEqual([]);
      expect(analysis.response).toBe("Response");
    });

    it("should validate schema and reject invalid memory objects", () => {
      const message = `Response
<createMemories>[{"wrongField": "value"}]</createMemories>`;

      const result = extractMemories(message);
      expect(result.isOk()).toBe(true);
      const analysis = result._unsafeUnwrap();
      expect(analysis.memories).toEqual([]);
    });

    it("should collapse excessive newlines in response", () => {
      const message = `First line


<createMemories>[{"text": "test"}]</createMemories>


Last line`;

      const result = extractMemories(message);
      expect(result.isOk()).toBe(true);
      const analysis = result._unsafeUnwrap();
      expect(analysis.response).not.toContain("\n\n\n");
    });
  });

  describe("formatMemoriesForPrompt", () => {
    it("should format dated and undated memories correctly", () => {
      const { formatMemoriesForPrompt } = makeMemoryDomain({
        config: {} as AppConfig,
        db: {} as Database,
        log: silentLogger,
      });

      const memories: Memory[] = [
        {
          id: 1,
          text: "Dated memory",
          date: new Date("2023-10-27T00:00:00.000Z"),
          source: null,
          tags: null,
          createdAt: "2023-10-27T00:00:00.000Z",
          lastModified: "2023-10-27T00:00:00.000Z",
          sourcePluginId: null,
          externalId: null,
          original: null,
        },
        {
          id: 2,
          text: "Undated memory",
          date: null,
          source: null,
          tags: null,
          createdAt: "2023-10-27T00:00:00.000Z",
          lastModified: "2023-10-27T00:00:00.000Z",
          sourcePluginId: null,
          externalId: null,
          original: null,
        },
      ];

      const result = formatMemoriesForPrompt(memories);

      expect(result).toContain("Dated memories:");
      expect(result).toContain("2023-10-27 - Dated memory");
      expect(result).toContain("General memories:");
      expect(result).toContain("- Undated memory");
    });

    it("should include tags as parentheticals", () => {
      const { formatMemoriesForPrompt } = makeMemoryDomain({
        config: {} as AppConfig,
        db: {} as Database,
        log: silentLogger,
      });

      const memories: Memory[] = [
        {
          id: 1,
          text: "To do: Buy milk",
          date: new Date("2024-01-15T00:00:00.000Z"),
          source: null,
          tags: ["groceries"],
          createdAt: "2024-01-15T00:00:00.000Z",
          lastModified: "2024-01-15T00:00:00.000Z",
          sourcePluginId: null,
          externalId: null,
          original: null,
        },
        {
          id: 2,
          text: "To do: Fix bug",
          date: null,
          source: null,
          tags: ["Work", "urgent"],
          createdAt: "2024-01-15T00:00:00.000Z",
          lastModified: "2024-01-15T00:00:00.000Z",
          sourcePluginId: null,
          externalId: null,
          original: null,
        },
      ];

      const result = formatMemoriesForPrompt(memories);
      expect(result).toContain("To do: Buy milk (groceries)");
      expect(result).toContain("To do: Fix bug (Work, urgent)");
    });

    it("should return fallback message when no memories", () => {
      const { formatMemoriesForPrompt } = makeMemoryDomain({
        config: {} as AppConfig,
        db: {} as Database,
        log: silentLogger,
      });
      expect(formatMemoriesForPrompt([])).toBe("No stored memories are available.");
    });
  });

  describe("formatCategorizedMemoriesForPrompt", () => {
    const makeMemory = (overrides: Partial<Memory>): Memory => ({
      id: 1,
      text: "test",
      date: null,
      source: null,
      tags: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      lastModified: "2024-01-01T00:00:00.000Z",
      sourcePluginId: null,
      externalId: null,
      original: null,
      ...overrides,
    });

    const { formatCategorizedMemoriesForPrompt } = makeMemoryDomain({
      config: {} as AppConfig,
      db: {} as Database,
      log: silentLogger,
    });

    it("should format all categories", () => {
      const categorized: CategorizedMemories = {
        today: [makeMemory({ id: 1, text: "Today thing", date: new Date("2024-06-15") })],
        lastWeek: [makeMemory({ id: 2, text: "Watched: Film", date: new Date("2024-06-12") })],
        nextWeek: [makeMemory({ id: 3, text: "Dentist", date: new Date("2024-06-18") })],
        general: [makeMemory({ id: 4, text: "Likes tea" })],
      };

      const result = formatCategorizedMemoriesForPrompt(categorized);

      expect(result).toContain("Today:");
      expect(result).toContain("Today thing");
      expect(result).toContain("Recent (past week):");
      expect(result).toContain("Watched: Film");
      expect(result).toContain("Upcoming (next week):");
      expect(result).toContain("Dentist");
      expect(result).toContain("General background:");
      expect(result).toContain("Likes tea");
    });

    it("should omit empty categories", () => {
      const categorized: CategorizedMemories = {
        today: [],
        lastWeek: [],
        nextWeek: [makeMemory({ id: 1, text: "Dentist", date: new Date("2024-06-18") })],
        general: [makeMemory({ id: 2, text: "Likes tea" })],
      };

      const result = formatCategorizedMemoriesForPrompt(categorized);

      expect(result).not.toContain("Today:");
      expect(result).not.toContain("Recent (past week):");
      expect(result).toContain("Upcoming (next week):");
      expect(result).toContain("General background:");
    });

    it("should return fallback when all categories empty", () => {
      const categorized: CategorizedMemories = {
        today: [],
        lastWeek: [],
        nextWeek: [],
        general: [],
      };

      expect(formatCategorizedMemoriesForPrompt(categorized)).toBe(
        "No stored memories are available.",
      );
    });
  });

  describe("database operations", () => {
    const harness = useHarness();
    let memoryDomain: MemoryDomain;

    beforeAll(async () => {
      await harness.setup();
    });

    beforeEach(async () => {
      await harness.reset();
      memoryDomain = makeMemoryDomain({
        config: {} as AppConfig,
        db: harness.db,
        log: silentLogger,
      });
    });

    afterAll(async () => {
      await harness.teardown();
    });

    describe("getAllMemories", () => {
      it("should return dated memories within range and all undated", async () => {
        await harness.db.insertInto("memories").values([
          { text: "Old memory", date: "2023-01-01" },
          { text: "Future memory", date: "2023-12-31" },
          { text: "Undated", date: null },
        ]).execute();

        const result = await memoryDomain.getAllMemories({
          includeDate: true,
          startDate: "2023-01-01",
        });
        const memories = result._unsafeUnwrap();
        const texts = memories.map((m) => m.text);

        expect(texts.join(",")).toContain("Old memory");
        expect(texts.join(",")).toContain("Undated");
        expect(texts.includes("Future memory")).toBe(false);
      });
    });

    describe("getRelevantMemories", () => {
      it("should categorize memories into today, lastWeek, nextWeek, general", async () => {
        const today = DateTime.fromISO("2024-06-15", { zone: "utc" }).startOf("day");
        const todayStr = today.toFormat("yyyy-MM-dd");
        const tomorrowStr = today.plus({ days: 1 }).toFormat("yyyy-MM-dd");
        const threeDaysAgoStr = today.minus({ days: 3 }).toFormat("yyyy-MM-dd");

        await harness.db.insertInto("memories").values([
          { text: "Today memory", date: todayStr },
          { text: "Tomorrow memory", date: tomorrowStr },
          { text: "Past memory", date: threeDaysAgoStr },
          { text: "Undated", date: null },
        ]).execute();

        const result = await memoryDomain.getRelevantMemories(today);
        const categorized = result._unsafeUnwrap();

        expect(categorized.today.map((m) => m.text)).toEqual(["Today memory"]);
        expect(categorized.nextWeek.map((m) => m.text)).toEqual(["Tomorrow memory"]);
        expect(categorized.lastWeek.map((m) => m.text)).toEqual(["Past memory"]);
        expect(categorized.general.map((m) => m.text)).toEqual(["Undated"]);
      });

      it("should exclude memories older than 7 days", async () => {
        const today = DateTime.fromISO("2024-06-15", { zone: "utc" }).startOf("day");
        const oldStr = today.minus({ days: 10 }).toFormat("yyyy-MM-dd");

        await harness.db.insertInto("memories").values([
          { text: "Old memory", date: oldStr },
        ]).execute();

        const result = await memoryDomain.getRelevantMemories(today);
        const categorized = result._unsafeUnwrap();

        expect(categorized.lastWeek).toHaveLength(0);
        expect(categorized.today).toHaveLength(0);
        expect(categorized.nextWeek).toHaveLength(0);
      });

      it("should always include all undated memories", async () => {
        const today = DateTime.fromISO("2024-06-15", { zone: "utc" }).startOf("day");

        await harness.db.insertInto("memories").values([
          { text: "Background 1", date: null },
          { text: "Background 2", date: null },
        ]).execute();

        const result = await memoryDomain.getRelevantMemories(today);
        const categorized = result._unsafeUnwrap();

        expect(categorized.general.map((m) => m.text)).toEqual(["Background 1", "Background 2"]);
      });
    });

    describe("updateMemories", () => {
      const pluginConfig = { pluginName: "test-plugin", id: 1 } as PluginConfig;

      it("should upsert memories with externalId on repeated runs", async () => {
        const analysis = {
          memories: [{
            date: "2024-06-15",
            text: "Calendar: Standup (9:00 AM - 9:30 AM)",
            externalId: "gcal-abc123",
            original: '{"summary":"Standup"}',
          }],
          editMemories: [],
          deleteMemories: [],
          response: "",
        };

        const first = await memoryDomain.updateMemories(analysis, pluginConfig);
        expect(first.isOk()).toBe(true);

        const second = await memoryDomain.updateMemories(analysis, pluginConfig);
        expect(second.isOk()).toBe(true);

        const all = await memoryDomain.getAllMemories();
        expect(all._unsafeUnwrap()).toHaveLength(1);
      });

      it("should update text/date when externalId matches", async () => {
        const initial = {
          memories: [{
            date: "2024-06-15",
            text: "Calendar: Standup (9:00 AM)",
            externalId: "gcal-abc123",
          }],
          editMemories: [],
          deleteMemories: [],
          response: "",
        };
        await memoryDomain.updateMemories(initial, pluginConfig);

        const updated = {
          memories: [{
            date: "2024-06-16",
            text: "Calendar: Standup (10:00 AM)",
            externalId: "gcal-abc123",
          }],
          editMemories: [],
          deleteMemories: [],
          response: "",
        };
        const result = await memoryDomain.updateMemories(updated, pluginConfig);
        expect(result.isOk()).toBe(true);

        const all = (await memoryDomain.getAllMemories())._unsafeUnwrap();
        expect(all).toHaveLength(1);
        expect(all[0].text).toBe("Calendar: Standup (10:00 AM)");
      });

      it("should upsert tags with externalId", async () => {
        const analysis = {
          memories: [{
            date: "2024-06-15",
            text: "To do: Buy milk",
            tags: ["groceries"],
            externalId: "tt-001",
          }],
          editMemories: [],
          deleteMemories: [],
          response: "",
        };

        await memoryDomain.updateMemories(analysis, pluginConfig);
        const first = (await memoryDomain.getAllMemories())._unsafeUnwrap();
        expect(first[0].tags).toEqual(["groceries"]);

        const updated = {
          memories: [{
            date: "2024-06-15",
            text: "To do: Buy milk",
            tags: ["shopping"],
            externalId: "tt-001",
          }],
          editMemories: [],
          deleteMemories: [],
          response: "",
        };
        await memoryDomain.updateMemories(updated, pluginConfig);
        const second = (await memoryDomain.getAllMemories())._unsafeUnwrap();
        expect(second).toHaveLength(1);
        expect(second[0].tags).toEqual(["shopping"]);
      });

      it("should deduplicate memories without externalId by source/date/text", async () => {
        const analysis = {
          memories: [{ date: "2024-06-15", text: "Weather: Sunny" }],
          editMemories: [],
          deleteMemories: [],
          response: "",
        };

        await memoryDomain.updateMemories(analysis, pluginConfig);
        await memoryDomain.updateMemories(analysis, pluginConfig);

        const all = (await memoryDomain.getAllMemories())._unsafeUnwrap();
        expect(all).toHaveLength(1);
      });
    });
  });
});
