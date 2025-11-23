# Bell Pull

Bell Pull is a personal AI assistant. It uses a simple architecture: a single SQLite table serving as a "butler's notebook" that stores memories (text entries with optional dates), which are populated by scheduled cron jobs that pull data from various sources like Google Calendar, weather APIs, forwarded emails (OCR'd using Claude), and inbound messages. Each morning, a cron job queries the memory table for entries dated for the coming week plus any undated background information, feeds this context to Claude to generate a formatted daily brief, and sends it via Telegram. The system is easily extensible—any process can add memories to the table, and those memories become context for future LLM interactions. The key insight is that you don't need fancy AI frameworks or RAG systems; just a simple memory store and data importers feeding into LLM prompts can create a genuinely useful personal assistant.

## Guidelines

- Be extremely concise in all your communications and your commit messages. Sacrifice grammar for the sake of concision.
- Do not add emojis.
- Do not add comments in any code unless it is extremely complicated.
- Use `mise` to run tasks, for example `mise run dev` to start the API with file watching
- State is the mind-killer. I'm going for "FP light", so call out any choices made around impure functions/architecture. No in-memory state if at all possible. The golden rule: "If it's not in the DB, it doesn't exist."

## Cap'n Web RPC

We use Cap'n Web in HTTP batch mode (stateless sessions).

### Core Concepts

- **Schema-less**: Uses TypeScript interfaces/types shared between client/server.
- **Pass-by-reference**: Objects extending `RpcTarget` are passed by reference (stubs).
- **Pipelining**: Pass RPC promises to other RPC calls. Executed on server in one round-trip.

### Usage

1. **Define Types** (`src/types/shared.ts`):
   Create interface extending `RpcTarget` (optional) or just define method signatures.

   ```typescript
   export interface MyMethods {
     hello(name: string): Promise<string>;
   }
   ```

2. **Server** (`src/services/`):
   Implement class extending `RpcTarget`.

   ```typescript
   class MyService extends RpcTarget implements MyMethods {
     /* ... */
   }
   ```

   Serve with `newHttpBatchRpcResponse(req, new MyService())`.

3. **Client** (Batch Mode):
   `newHttpBatchRpcSession` creates a **single-use** batch.

   - Create session -> Queue calls -> Await results -> Session ends.
   - **Do not await** intermediate calls if pipelining.
   - Stubs returned in a batch die when the batch completes (unless using WebSockets).

4. **Interactive UI**:
   For independent UI events (clicks), create a **new session** for each event handler. Do not reuse a global batch session for sequential user interactions.
