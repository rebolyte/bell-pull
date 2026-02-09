import { http, HttpResponse } from "msw";
import { DateTime } from "luxon";

const BASE_URL = "https://letterboxd.com/:username/rss/";

type DiaryItem = {
  title: string;
  link: string;
  pubDate?: string;
  watchedDate?: string;
  contentSnippet?: string;
};

const toRFC2822 = (iso: string) => DateTime.fromISO(iso).toRFC2822();

const defaultPubDate = () => toRFC2822(DateTime.now().toISODate()!);

const buildItem = (item: DiaryItem) => {
  const pubDate = item.pubDate ?? defaultPubDate();
  const watchedDate = item.watchedDate
    ? `<letterboxd:watchedDate>${item.watchedDate}</letterboxd:watchedDate>`
    : "";
  const description = item.contentSnippet
    ? `<description><![CDATA[<p>${item.contentSnippet}</p>]]></description>`
    : "";
  return `<item>
  <title>${item.title}</title>
  <link>${item.link}</link>
  <pubDate>${pubDate}</pubDate>
  ${watchedDate}
  ${description}
</item>`;
};

const buildFeed = (items: DiaryItem[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:letterboxd="https://letterboxd.com">
<channel>
  <title>Letterboxd</title>
  ${items.map(buildItem).join("\n  ")}
</channel>
</rss>`;

const defaultItems: DiaryItem[] = [
  {
    title: "The Brutalist, 2024",
    link: "https://letterboxd.com/user/film/the-brutalist/",
    watchedDate: DateTime.now().minus({ days: 2 }).toISODate()!,
  },
];

export const letterboxdSuccess = (items: DiaryItem[] = defaultItems) =>
  http.get(BASE_URL, () =>
    new HttpResponse(buildFeed(items), {
      headers: { "Content-Type": "application/rss+xml" },
    }));

export const letterboxdEmpty = () => letterboxdSuccess([]);

export const letterboxdError = (status: number) =>
  http.get(BASE_URL, () => new HttpResponse(null, { status }));

export const letterboxdWithItems = (...items: DiaryItem[]) => letterboxdSuccess(items);
