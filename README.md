# Deno + Hono + CapnWeb API

A modern API built with Deno, Hono web framework, and Cap'n Web RPC system featuring an interactive AlpineJS dashboard.

## Features

- **Deno Runtime**: Modern, secure JavaScript/TypeScript runtime
- **Hono Framework**: Lightweight, fast web framework with HTML templating
- **Cap'n Web**: Schema-free RPC with object-capability security
- **AlpineJS**: Lightweight reactive frontend framework
- **TypeScript**: Full type safety
- **Interactive Dashboard**: Beautiful UI demonstrating RPC calls

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
│   │   └── api.ts           # API routes
│   ├── services/
│   │   └── example-rpc.ts   # RPC service implementation
│   ├── middleware/          # Custom middleware (future)
│   ├── types/               # TypeScript type definitions
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

## API Endpoints

### Dashboard

- `GET /api/dashboard` - Interactive dashboard with AlpineJS

### Root Endpoints

- `GET /` - API information
- `GET /health` - Health check

### RPC Endpoints

- `POST /api/rpc` - Generic RPC endpoint (send `{method, args}`)
- `GET /api/rpc/hello/:name` - Hello RPC method
- `POST /api/rpc/add` - Add two numbers (send `{a, b}`)
- `POST /api/rpc/batch` - Process batch items (send `{items}`)

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

## AlpineJS Integration

The dashboard demonstrates how to use AlpineJS with Hono's HTML templating:

```typescript
import { html } from "hono/html";

const Layout = (props: LayoutProps) => html`<!DOCTYPE html>
<html>
  <head>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  </head>
  <body>
    <div x-data="{ count: 0 }">
      <button @click="count++">Increment</button>
      <span x-text="count"></span>
    </div>
  </body>
</html>`;
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
