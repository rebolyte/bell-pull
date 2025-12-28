import { afterAll, beforeAll, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { useHarness } from "../../utils/harness.ts";
import { extractMemories, makeMemoryDomain, MemoryDomain } from "./index.ts";
import { DateTime } from "luxon";
import type { Database } from "../../services/database.ts";

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
      const { formatMemoriesForPrompt } = makeMemoryDomain({ db: {} as Database });

      const memories = [
        { id: 1, text: "Dated memory", date: new Date("2023-10-27T00:00:00.000Z") },
        { id: 2, text: "Undated memory", date: null },
      ];

      const result = formatMemoriesForPrompt(memories);

      expect(result).toContain("Dated memories:");
      expect(result).toContain("2023-10-27 [ID: 1]: Dated memory");
      expect(result).toContain("General memories:");
      expect(result).toContain("[ID: 2]: Undated memory");
    });

    it("should return fallback message when no memories", () => {
      const { formatMemoriesForPrompt } = makeMemoryDomain({ db: {} as Database });
      expect(formatMemoriesForPrompt([])).toBe("No stored memories are available.");
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
      memoryDomain = makeMemoryDomain({ db: harness.db });
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
      it("should return memories for current week plus undated", async () => {
        const today = DateTime.now().setZone("America/New_York").startOf("day");
        const todayStr = today.toFormat("yyyy-MM-dd");
        const tomorrowStr = today.plus({ days: 1 }).toFormat("yyyy-MM-dd");

        await harness.db.insertInto("memories").values([
          { text: "Today memory", date: todayStr },
          { text: "Tomorrow memory", date: tomorrowStr },
          { text: "Undated", date: null },
        ]).execute();

        const result = await memoryDomain.getRelevantMemories();
        const memories = result._unsafeUnwrap();
        const texts = memories.map((m) => m.text);

        expect(texts.join(",")).toContain("Today memory");
        expect(texts.join(",")).toContain("Tomorrow memory");
        expect(texts.join(",")).toContain("Undated");
      });
    });
  });
});
