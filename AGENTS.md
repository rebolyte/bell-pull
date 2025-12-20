# Bell Pull

Bell Pull is a personal AI assistant. It uses a simple architecture: a single SQLite table serving as a "butler's notebook" that stores memories (text entries with optional dates), which are populated by scheduled cron jobs that pull data from various sources like Google Calendar, weather APIs, forwarded emails (OCR'd using Claude), and inbound messages. Each morning, a cron job queries the memory table for entries dated for the coming week plus any undated background information, feeds this context to Claude to generate a formatted daily brief, and sends it via Telegram. The system is easily extensible—any process can add memories to the table, and those memories become context for future LLM interactions. The key insight is that you don't need fancy AI frameworks or RAG systems; just a simple memory store and data importers feeding into LLM prompts can create a genuinely useful personal assistant.

## Validate your changes

* start the API with file watching: `mise run dev`
* run tests: `mise run test`, `mise run test:watch`, `mise run test --filter <test name string/regexp>` (ex: `--filter "my"` or `--filter "/.*Memories$/"`), or `mise run test --reporter dot` (for quick verification)
* validate types: `deno check`
* validate style: `deno lint`
* run formatter: `deno fmt`

see other tasks available in mise.toml if needed.

## Guidelines

- Be extremely concise in all your communications and your commit messages. Sacrifice grammar for the sake of concision.
- Do not add emojis.
- Do not add comments in any code unless it is extremely complicated.

## FP "light"

State is the mind-killer. I'm going for "FP light", so call out any choices made around impure functions/architecture.

Avoid:

* Classes (unless wrapping a stateful resource like a connection pool)
* `this`
* Mutation (use Remeda's set, merge, omit for immutable updates)
* Throwing errors in business logic (return Result)
* God services that do multiple things

The theme: data in, data out, effects at the edges. 
