# Bell Pull

Bell Pull is a personal AI assistant. It uses a simple architecture: a single SQLite table serving as a "butler's notebook" that stores memories (text entries with optional dates), which are populated by scheduled cron jobs that pull data from various sources like Google Calendar, weather APIs, forwarded emails (OCR'd using Claude), and inbound messages. Each morning, a cron job queries the memory table for entries dated for the coming week plus any undated background information, feeds this context to Claude to generate a formatted daily brief, and sends it via Telegram. The system is easily extensible—any process can add memories to the table, and those memories become context for future LLM interactions. The key insight is that you don't need fancy AI frameworks or RAG systems; just a simple memory store and data importers feeding into LLM prompts can create a genuinely useful personal assistant.

## Guidelines

- Be extremely concise in all your communications and your commit messages. Sacrifice grammar for the sake of concision.
- Do not add emojis.
- Do not add comments in any code unless it is extremely complicated.
- Use `mise` to run tasks, for example `mise run dev` to start the API with file watching
