# Deno + Hono + CapnWeb API

A modern API built with Deno, Hono web framework, and Cap'n Web RPC system featuring an interactive AlpineJS dashboard.

## Features

- **Deno Runtime**: Modern, secure JavaScript/TypeScript runtime
- **Hono Framework**: Lightweight, fast web framework with JSX support
- **Cap'n Web**: Schema-free RPC with object-capability security
- **AlpineJS**: Lightweight reactive frontend framework
- **TypeScript**: Full type safety with shared types across frontend/backend
- **Interactive Dashboard**: Beautiful UI demonstrating typed RPC calls
- **Type Sharing**: Single source of truth for types used in both JSX and services

## Prerequisites

- [Deno](https://deno.land/) (v1.37 or later)

## Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd studious-umbrella
```

No package installation needed - Deno handles dependencies automatically!

2. Install [mise](https://mise.jdx.dev/):

```shell
brew install mise
```

If you haven't set up Mise before:

```shell
# set up shell
echo 'eval "$(mise activate bash)"' >> ~/.bashrc

# trust config file in this project
mise trust

mise activate
```

## Running the Server

### Development Mode (with auto-reload)

```bash
deno task dev
```

### Production Mode

```bash
deno task start
```

The server will start on `http://localhost:8000` by default.

## Project Structure

```
.
├── deno.json                 # Deno configuration and tasks
├── src/
│   ├── main.ts              # Application entry point
│   ├── routes/
│   │   └── api.tsx          # API routes with JSX + Cap'n Web
│   ├── services/
│   │   └── example-rpc.ts   # RPC service (extends RpcTarget)
│   ├── middleware/          # Custom middleware (future)
│   └── types/
│       └── shared.ts        # Shared types (frontend + backend)
└── README.md
```

## Quick Start

1. Start the server:

   ```bash
   deno task dev
   ```

2. Open the interactive dashboard:

   ```
   http://localhost:8000/api/dashboard
   ```

3. Try the interactive features:
   - **Counter**: Simple AlpineJS reactivity example
   - **RPC Calculator**: Add numbers via RPC calls
   - **RPC Greeting**: Send personalized greetings
   - **Batch Processing**: Process arrays through RPC
   - **User Creation**: Create users with typed RPC (demonstrates type sharing)
   - **Todo Manager**: Full CRUD operations with complex types

## API Endpoints

### Dashboard

- `GET /api/dashboard` - Interactive dashboard with AlpineJS

### Root Endpoints

- `GET /` - API information
- `GET /health` - Health check

### RPC Endpoint

- `POST /api/rpc` - **Single RPC endpoint** for all method calls

All RPC methods are called through this one endpoint using the format:

```json
{
  "method": "methodName",
  "params": [param1, param2, ...]
}
```

**Available Methods:**

**Basic:**

- `hello(name)` - Returns greeting
- `add(a, b)` - Add two numbers
- `multiply(a, b)` - Multiply with typed result
- `processBatch(items)` - Process array of items

**User Management (Typed):**

- `createUser(name, email)` - Create user
- `getUserInfo(userId)` - Get user info
- `updateUserPreferences(userId, prefs)` - Update preferences

**Todo Management (Typed):**

- `createTodo(userId, title, priority)` - Create todo
- `getTodos(userId)` - Get all todos for user
- `toggleTodo(todoId)` - Toggle todo completion

## Usage Examples

### Interactive Dashboard

Visit `http://localhost:8000/api/dashboard` in your browser to interact with the RPC API through a beautiful UI.

### RPC API (cURL)

All RPC calls go to the single `/api/rpc` endpoint:

```bash
# Call hello method
curl -X POST http://localhost:8000/api/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "hello", "params": ["World"]}'
# Response: {"result": "Hello, World! This is a Cap'n Web RPC response."}

# Add two numbers
curl -X POST http://localhost:8000/api/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "add", "params": [5, 3]}'
# Response: {"result": 8}

# Create a user (typed RPC)
curl -X POST http://localhost:8000/api/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "createUser", "params": ["Alice", "alice@example.com"]}'
# Response: {"result": {"id": "...", "name": "Alice", "email": "alice@example.com", ...}}

# Process batch
curl -X POST http://localhost:8000/api/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "processBatch", "params": [["hello", "world", "deno"]]}'
# Response: {"result": {"processed": 3, "results": ["HELLO", "WORLD", "DENO"]}}

# Create a todo
curl -X POST http://localhost:8000/api/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "createTodo", "params": ["demo-user", "Learn RPC", "high"]}'
# Response: {"result": {"id": "...", "title": "Learn RPC", "priority": "high", ...}}
```

### Using Cap'n Web Client Library (Browser - No Build Step!)

The dashboard uses Cap'n Web directly in the browser via ES modules - **no build step required**:

```html
<script type="module">
  import { newHttpBatchRpcSession } from "https://cdn.jsdelivr.net/npm/capnweb@0.2.0/+esm";

  // Create global RPC stub
  window.rpcStub = newHttpBatchRpcSession("/api/rpc");

  // Helper for simple calls
  window.rpc = async function (method, ...params) {
    return await window.rpcStub[method](...params);
  };
</script>
```

Then use it in your JavaScript:

```javascript
// Simple call
const greeting = await window.rpc("hello", "Alice");

// Batched calls - all in ONE HTTP request!
const sum = window.rpcStub.add(5, 3);
const product = window.rpcStub.multiply(10, 4);
const greeting = window.rpcStub.hello("Batching");
const [sumResult, productResult, greetingResult] = await Promise.all([
  sum,
  product,
  greeting,
]);
```

**Benefits:**

- ✅ Full batching support (multiple calls in one HTTP request)
- ✅ Promise pipelining (dependent calls in one round trip)
- ✅ No build step, no bundler needed
- ✅ Works directly in the browser with ES modules

### Using Cap'n Web Client Library (Node.js/Bundled Apps)

For applications with a build step (Vite, esbuild, etc.), use the Cap'n Web client library:

```typescript
import { newHttpBatchRpcSession, type RpcStub } from "capnweb";
import type { ExampleRpcMethods } from "./types/shared";

// Create typed RPC session
using stub: RpcStub<ExampleRpcMethods> = newHttpBatchRpcSession<ExampleRpcMethods>(
  "/api/rpc",
);

// Single call
const greeting = await stub.hello("Alice");

// Batched calls - all in ONE HTTP request!
let sum = stub.add(5, 3);
let product = stub.multiply(10, 4);
let batch = stub.processBatch(["hello", "world"]);
let [sumResult, productResult, batchResult] = await Promise.all([sum, product, batch]);

// Promise pipelining - dependent calls in ONE round trip!
let user = stub.createUser("Bob", "bob@example.com");
let todos = stub.getTodos(user.id); // Uses user.id before resolved!
let [userData, todosData] = await Promise.all([user, todos]);
```

See `src/client-example.ts` for more examples.

## Shared Types Between Frontend and Backend

One of the key features of this setup is **type sharing** between the frontend JSX components and backend RPC services. This ensures type safety across your entire stack.

### How It Works

**1. Define shared types** (`src/types/shared.ts`):

```typescript
export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  preferences: UserPreferences;
};

export type UserPreferences = {
  theme: "light" | "dark";
  notifications: boolean;
  language: string;
};

export interface ExampleRpcMethods {
  getUserInfo(userId: string): Promise<User>;
  createUser(name: string, email: string): Promise<User>;
}
```

**2. Use types in backend service** (`src/services/example-rpc.ts`):

```typescript
import type { ExampleRpcMethods, User } from "../types/shared.ts";

export class ExampleRpcService implements ExampleRpcMethods {
  async getUserInfo(userId: string): Promise<User> {
    // TypeScript ensures we return the correct shape
    return {
      /* ... */
    };
  }
}
```

**3. Use types in frontend** (`src/routes/api.tsx`):

```typescript
import type { User } from "../types/shared.ts";

api.get("/rpc/user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const user: User = await rpcService.getUserInfo(userId);
  return c.json(user); // Type-safe!
});
```

### Benefits

✅ **Compile-time safety**: Catch type errors before runtime
✅ **Single source of truth**: Types defined once, used everywhere
✅ **Refactoring confidence**: Change a type and see all usages update
✅ **IDE autocomplete**: Full IntelliSense support across frontend and backend
✅ **Documentation**: Types serve as inline documentation

### Available RPC Methods

The dashboard demonstrates these typed RPC methods:

- **User Management**

  - `createUser(name, email)` → Returns typed `User`
  - `getUserInfo(userId)` → Returns typed `User`
  - `updateUserPreferences(userId, prefs)` → Updates with type safety

- **Todo Management**

  - `getTodos(userId)` → Returns typed `Todo[]`
  - `createTodo(userId, title, priority)` → Returns typed `Todo`
  - `toggleTodo(todoId)` → Returns typed `Todo`

- **Math Operations**
  - `add(a, b)` → Returns `number`
  - `multiply(a, b)` → Returns typed `CalculationResult`

All types are defined in `src/types/shared.ts` and used consistently across the application.

## AlpineJS with JSX

The dashboard uses Hono's JSX mode with AlpineJS for reactive frontend:

```typescript
// JSX component with AlpineJS
<div class="card" x-data="{ count: 0 }">
  <div class="counter" x-text="count"></div>
  <button x-on:click="count++">Increment</button>
</div>;
```

AlpineJS provides reactive state management directly in HTML, making it perfect for:

- Interactive forms
- Dynamic content updates
- API calls with loading states
- Client-side data manipulation

## About Cap'n Web

[Cap'n Web](https://github.com/cloudflare/capnweb) is a lightweight RPC framework that brings object-capability security patterns to JavaScript. Key features:

- **Bidirectional RPC**: Both client and server can initiate calls
- **Pass-by-reference**: Objects are passed by reference with automatic proxying
- **Promise Pipelining**: Chain dependent calls in a single network round trip
- **Multiple Transports**: HTTP, WebSocket, and postMessage support
- **Tiny Footprint**: Under 10KB minified and gzipped

### Cap'n Web Integration

This project uses the **real Cap'n Web library** (`npm:capnweb`):

**Server Side** (`src/services/example-rpc.ts`):

```typescript
import { RpcTarget } from "capnweb";

export class ExampleRpcService extends RpcTarget {
  async hello(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }

  async add(a: number, b: number): Promise<number> {
    return a + b;
  }
}
```

**Route Handler** (`src/routes/api.tsx`):

```typescript
import { newHttpBatchRpcResponse } from "capnweb";

api.all("/rpc", async (c) => {
  const request = c.req.raw;
  const response = await newHttpBatchRpcResponse(
    request,
    new ExampleRpcService(),
  );
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
});
```

**Client Side** (JavaScript):

```typescript
import { newHttpBatchRpcSession } from "capnweb";

// Create RPC session
using stub = newHttpBatchRpcSession("/api/rpc");

// Make batched calls - all sent in one HTTP request!
let greeting1 = stub.hello("Alice");
let greeting2 = stub.hello("Bob");
let sum = stub.add(5, 3);

// Await all at once
let [g1, g2, result] = await Promise.all([greeting1, greeting2, sum]);
```

### Promise Pipelining Example

Cap'n Web's killer feature - chain dependent calls in a single round trip:

```typescript
// All of this happens in ONE HTTP request!
let user = stub.getUserInfo("user123");
let todos = stub.getTodos(user.id); // Uses result from first call
let count = await todos.length; // Pipeline through the array
```

## Environment Variables

- `PORT` - Server port (default: 8000)

Create a `.env` file if needed:

```env
PORT=8000
```

## Development

### Run Tests

```bash
deno task test
```

### Format Code

```bash
deno fmt
```

### Lint Code

```bash
deno lint
```

## Learn More

- [Deno Documentation](https://deno.land/manual)
- [Hono Documentation](https://hono.dev/)
- [AlpineJS Documentation](https://alpinejs.dev/)
- [Cap'n Web GitHub](https://github.com/cloudflare/capnweb)

## Inspiration

https://www.geoffreylitt.com/2025/04/12/how-i-made-a-useful-ai-assistant-with-one-sqlite-table-and-a-handful-of-cron-jobs

https://www.val.town/x/geoffreylitt/stevensDemo

## License

MIT
