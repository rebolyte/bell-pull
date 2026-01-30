import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { withRetry } from "./retry.ts";

describe("withRetry", () => {
  it("returns result on success", async () => {
    const result = await withRetry(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("retries on error and succeeds", async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      if (attempts === 1) {
        return Promise.reject(new Error("transient failure"));
      }
      return Promise.resolve("ok");
    };

    const result = await withRetry(fn, 3, 10);
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("retries up to max attempts then throws", async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      return Promise.reject(new Error("persistent failure"));
    };

    await expect(withRetry(fn, 3, 10)).rejects.toThrow("persistent failure");
    expect(attempts).toBe(3);
  });
});
