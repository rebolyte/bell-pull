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

Clone the repository:

```bash
git clone <your-repo-url>
cd studious-umbrella
```

No package installation needed - Deno handles dependencies automatically!

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
│   │   └── api.tsx          # API routes with JSX
│   ├── services/
│   │   └── example-rpc.ts   # RPC service implementation
│   ├── middleware/          # Custom middleware (future)
│   ├── types/
│   │   └── shared.ts        # Shared types (frontend + backend)
│   └── utils/
│       └── capnweb-setup.ts # Cap'n Web utilities
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

### RPC Endpoints

**Basic RPC:**
- `POST /api/rpc` - Generic RPC endpoint (send `{method, args}`)
- `GET /api/rpc/hello/:name` - Hello RPC method
- `POST /api/rpc/add` - Add two numbers (send `{a, b}`)
- `POST /api/rpc/multiply` - Multiply with typed result (send `{a, b}`)
- `POST /api/rpc/batch` - Process batch items (send `{items}`)

**User Management (Typed):**
- `POST /api/rpc/user/create` - Create user (send `{name, email}`)
- `GET /api/rpc/user/:userId` - Get user info

**Todo Management (Typed):**
- `POST /api/rpc/todo/create` - Create todo (send `{userId, title, priority}`)
- `GET /api/rpc/todos/:userId` - Get all todos for user
- `POST /api/rpc/todo/toggle` - Toggle todo completion (send `{todoId}`)

## Usage Examples

### Interactive Dashboard

Visit `http://localhost:8000/api/dashboard` in your browser to interact with the RPC API through a beautiful UI.

### RPC API (cURL)

```bash
# Generic RPC call
curl -X POST http://localhost:8000/api/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "hello", "args": ["World"]}'

# Add numbers
curl -X POST http://localhost:8000/api/rpc/add \
  -H "Content-Type: application/json" \
  -d '{"a": 5, "b": 3}'

# Process batch
curl -X POST http://localhost:8000/api/rpc/batch \
  -H "Content-Type: application/json" \
  -d '{"items": ["hello", "world", "test"]}'
```

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
import type { User, ExampleRpcMethods } from "../types/shared.ts";

export class ExampleRpcService implements ExampleRpcMethods {
  async getUserInfo(userId: string): Promise<User> {
    // TypeScript ensures we return the correct shape
    return { /* ... */ };
  }
}
```

**3. Use types in frontend** (`src/routes/api.tsx`):
```typescript
import type { User } from "../types/shared.ts";

api.get("/rpc/user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const user: User = await rpcService.getUserInfo(userId);
  return c.json(user);  // Type-safe!
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
</div>
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

This project demonstrates Cap'n Web patterns through:

1. **RPC Service** (`src/services/example-rpc.ts`): Example service implementation
2. **RPC Handler** (`src/utils/capnweb-setup.ts`): Utilities for handling RPC calls
3. **RPC Routes** (`src/routes/api.ts`): HTTP endpoints exposing RPC methods

For production use with full Cap'n Web features, you would:

```typescript
import { RpcTarget, newWorkersRpcResponse } from "capnweb";

class MyApi extends RpcTarget {
  async hello(name: string) {
    return `Hello, ${name}!`;
  }
}

// For Cloudflare Workers or similar environments
export default {
  fetch(request: Request) {
    return newWorkersRpcResponse(request, new MyApi());
  }
};
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

## License

MIT
