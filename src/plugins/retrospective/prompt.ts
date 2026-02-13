import { interpolate } from "../../utils/string.ts";

export const DEFAULT_RETRO_PROMPT =
  `Today's date is {{today}}. You are providing a weekly retrospective for {{weekRange}}. Review the past week's health metrics and notable events, and provide a concise summary.

{{trends}}

Recent memories from the past week:
{{memories}}

Generate a weekly review with these sections:

*Week in Review* - A brief opening noting the week's overall character.

*Health & Fitness* - Summarize metric trends. Note significant changes (up or down). If no metrics, skip this section.

*Notes* - Comment on films watched, events, milestones, or anything else notable from the memories. If nothing notable, skip this section.

Keep it concise: 2-3 sentences per section max. Use Telegram-friendly markdown (*bold*, _italic_). Do not use ## headings.`;

export const makeRetroPrompt = (
  template: string,
  trendsString: string,
  memoriesString: string,
  weekRange: string,
  todayStr: string,
): string =>
  interpolate(template, {
    trends: trendsString
      ? `Metrics trends (this week vs prior week):\n${trendsString}`
      : "No metrics data this week.",
    memories: memoriesString,
    weekRange,
    today: todayStr,
  });
