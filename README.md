# Deno + Hono + CapnWeb API

A modern API built with Deno, Hono web framework, and Cap'n Web RPC system.

## Features

- **Deno Runtime**: Modern, secure JavaScript/TypeScript runtime
- **Hono Framework**: Lightweight, fast web framework
- **Cap'n Web**: Schema-free RPC with object-capability security
- **TypeScript**: Full type safety
- **REST & RPC**: Support for both traditional REST and RPC patterns

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

## API Endpoints

### Root Endpoints

- `GET /` - API information
- `GET /health` - Health check

### REST Endpoints

- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create a new user
- `GET /api/info` - API documentation

### RPC Endpoints

- `POST /api/rpc` - Generic RPC endpoint
- `GET /api/rpc/hello/:name` - Hello RPC method
- `POST /api/rpc/add` - Add two numbers
- `POST /api/rpc/batch` - Process batch items

## Usage Examples

### REST API

```bash
# Get user
curl http://localhost:8000/api/users/123

# Create user
curl -X POST http://localhost:8000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com"}'
```

### RPC API

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
- [Cap'n Web GitHub](https://github.com/cloudflare/capnweb)

## License

MIT
