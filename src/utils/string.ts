import * as R from "@remeda/remeda";

export const extractTag = (tag: string) => (text: string): string | null => {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const match = text.match(regex);
  return match ? match[1] : null;
};

export const stripTag = (tag: string) => (text: string): string =>
  text.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`), "").trim();

export const stripTags = (tags: string[]) => (text: string): string =>
  tags.map(stripTag)
    .reduce((text, strip) => strip(text), text);

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
