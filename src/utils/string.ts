import * as R from "@remeda/remeda";

/**
 * Chunk the string by lines into segments < max length, splitting long
 * lines if needed
 */
export const chunkByLines = (maxLength: number, str: string): string[] =>
  str.length <= maxLength ? [str] : str
    .split("\n")
    .flatMap((line) => {
      const newLine = line + "\n";
      return newLine.length > maxLength
        ? R.chunk([...newLine], maxLength).map((chars) => chars.join(""))
        : [newLine];
    })
    .reduce((acc, segment) => {
      const lastChunk = acc.at(-1) ?? "";
      return (lastChunk + segment).length > maxLength
        ? [...acc, segment]
        : [...acc.slice(0, -1), lastChunk + segment];
    }, [""])
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
