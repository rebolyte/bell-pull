import { Hono } from "hono";
import { ExampleRpcService } from "../services/example-rpc.ts";
import { createRpcHandler } from "../utils/capnweb-setup.ts";
import type { User, Todo, CalculationResult } from "../types/shared.ts";

const api = new Hono();

// Initialize RPC service
const rpcService = new ExampleRpcService();
const rpcHandler = createRpcHandler(rpcService);

// Layout component
type LayoutProps = {
  title: string;
  children?: any;
};

const Layout = (props: LayoutProps) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{props.title}</title>
      <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
      <style dangerouslySetInnerHTML={{
        __html: `
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 2rem;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 1rem;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 2rem;
          }
          h1 {
            color: #667eea;
            margin-bottom: 1.5rem;
            font-size: 2.5rem;
          }
          h2 {
            color: #333;
            margin-top: 2rem;
            margin-bottom: 1rem;
            font-size: 1.5rem;
          }
          .card {
            background: #f8f9fa;
            border-radius: 0.5rem;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            border-left: 4px solid #667eea;
          }
          button {
            background: #667eea;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 600;
            transition: all 0.3s;
            margin-right: 0.5rem;
          }
          button:hover {
            background: #764ba2;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
          }
          input {
            padding: 0.75rem;
            border: 2px solid #e0e0e0;
            border-radius: 0.5rem;
            font-size: 1rem;
            margin-right: 0.5rem;
            width: 100px;
          }
          input:focus {
            outline: none;
            border-color: #667eea;
          }
          .result {
            margin-top: 1rem;
            padding: 1rem;
            background: #e3f2fd;
            border-radius: 0.5rem;
            font-weight: 600;
            color: #1976d2;
          }
          .counter {
            font-size: 3rem;
            font-weight: bold;
            color: #667eea;
            text-align: center;
            margin: 1rem 0;
          }
          .badge {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 0.25rem 0.75rem;
            border-radius: 1rem;
            font-size: 0.875rem;
            margin-left: 0.5rem;
          }
        `,
      }}
      />
    </head>
    <body>
      <div class="container">
        {props.children}
      </div>
    </body>
  </html>
);

// Dashboard route with AlpineJS
api.get("/dashboard", (c) => {
  return c.html(
    <Layout title="RPC Dashboard - Deno + Hono + CapnWeb">
      <h1>RPC Dashboard <span class="badge">Powered by Cap'n Web</span></h1>

      {/* Counter Example */}
      <div class="card" x-data="{ count: 0 }">
        <h2>Counter Example</h2>
        <div class="counter" x-text="count"></div>
        <button x-on:click="count++">Increment</button>
        <button x-on:click="count--">Decrement</button>
        <button x-on:click="count = 0">Reset</button>
      </div>

      {/* RPC Calculator */}
      <div class="card" x-data="{ a: 5, b: 3, result: null, loading: false }">
        <h2>RPC Calculator</h2>
        <div>
          <input type="number" x-model="a" />
          +
          <input type="number" x-model="b" />
          <button
            x-on:click={`
              loading = true;
              fetch('/api/rpc/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ a: Number(a), b: Number(b) })
              })
              .then(r => r.json())
              .then(data => { result = data.result; loading = false; })
              .catch(() => loading = false)
            `}
          >
            Calculate via RPC
          </button>
        </div>
        <div x-show="loading" style="margin-top: 1rem;">Loading...</div>
        <div x-show="result !== null" class="result">
          Result: <span x-text="result"></span>
        </div>
      </div>

      {/* RPC Hello */}
      <div class="card" x-data="{ name: 'World', message: null }">
        <h2>RPC Greeting</h2>
        <div>
          <input type="text" x-model="name" placeholder="Enter name" style="width: 200px;" />
          <button
            x-on:click={`
              fetch('/api/rpc/hello/' + name)
              .then(r => r.json())
              .then(data => message = data.result)
            `}
          >
            Say Hello via RPC
          </button>
        </div>
        <div x-show="message" class="result" x-text="message"></div>
      </div>

      {/* Batch Processing */}
      <div class="card" x-data="{ items: ['hello', 'world', 'deno'], processed: null }">
        <h2>RPC Batch Processing</h2>
        <div>
          <button
            x-on:click={`
              fetch('/api/rpc/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items })
              })
              .then(r => r.json())
              .then(data => processed = data)
            `}
          >
            Process Batch via RPC
          </button>
        </div>
        <div x-show="processed" class="result">
          Processed <span x-text="processed?.processed"></span> items:
          <span x-text="processed?.results?.join(', ')"></span>
        </div>
      </div>

      {/* User Creation - Demonstrates shared types */}
      <div class="card" x-data="{ name: 'Alice', email: 'alice@example.com', user: null }">
        <h2>Create User (Typed RPC) <span class="badge">Shared Types</span></h2>
        <div>
          <input type="text" x-model="name" placeholder="Name" style="width: 150px;" />
          <input type="email" x-model="email" placeholder="Email" style="width: 200px;" />
          <button
            x-on:click={`
              fetch('/api/rpc/user/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email })
              })
              .then(r => r.json())
              .then(data => user = data)
            `}
          >
            Create User via RPC
          </button>
        </div>
        <div x-show="user" class="result">
          <div><strong>Created User:</strong></div>
          <div>ID: <span x-text="user?.id"></span></div>
          <div>Name: <span x-text="user?.name"></span></div>
          <div>Email: <span x-text="user?.email"></span></div>
          <div>Theme: <span x-text="user?.preferences?.theme"></span></div>
        </div>
      </div>

      {/* Todo Management - Demonstrates complex types */}
      <div class="card" x-data="{ userId: 'demo-user', title: 'Learn Cap\\'n Web', priority: 'high', todos: [], newTodo: null }">
        <h2>Todo Manager (Complex Types) <span class="badge">Shared Types</span></h2>
        <div style="margin-bottom: 1rem;">
          <input type="text" x-model="title" placeholder="Todo title" style="width: 200px;" />
          <select x-model="priority" style="padding: 0.75rem; border: 2px solid #e0e0e0; border-radius: 0.5rem; margin-right: 0.5rem;">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button
            x-on:click={`
              fetch('/api/rpc/todo/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, title, priority })
              })
              .then(r => r.json())
              .then(data => {
                newTodo = data;
                // Refresh todos list
                fetch('/api/rpc/todos/' + userId)
                  .then(r => r.json())
                  .then(data => todos = data);
              })
            `}
          >
            Add Todo
          </button>
          <button
            x-on:click={`
              fetch('/api/rpc/todos/' + userId)
                .then(r => r.json())
                .then(data => todos = data)
            `}
          >
            Load Todos
          </button>
        </div>
        <div x-show="todos.length > 0" class="result">
          <div><strong>Todos:</strong></div>
          <template x-for="todo in todos" :key="todo.id">
            <div style="padding: 0.5rem; margin: 0.5rem 0; background: white; border-radius: 0.25rem;">
              <span x-text="todo.title"></span>
              <span x-text="' [' + todo.priority + ']'" style="font-size: 0.875rem; color: #666;"></span>
              <span x-show="todo.completed" style="color: green; margin-left: 0.5rem;">✓ Done</span>
            </div>
          </template>
        </div>
      </div>
    </Layout>,
  );
});

// RPC endpoints
api.post("/rpc", async (c) => {
  try {
    const body = await c.req.json();
    const result = await rpcHandler(body);
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Invalid request",
    }, 400);
  }
});

api.get("/rpc/hello/:name", async (c) => {
  const name = c.req.param("name");
  const result = await rpcService.hello(name);
  return c.json({ result });
});

api.post("/rpc/add", async (c) => {
  const { a, b } = await c.req.json();
  const result = await rpcService.add(a, b);
  return c.json({ result });
});

api.post("/rpc/batch", async (c) => {
  const { items } = await c.req.json();
  const result = await rpcService.processBatch(items);
  return c.json(result);
});

// New RPC endpoints
api.post("/rpc/multiply", async (c) => {
  const { a, b } = await c.req.json();
  const result: CalculationResult = await rpcService.multiply(a, b);
  return c.json(result);
});

api.post("/rpc/user/create", async (c) => {
  const { name, email } = await c.req.json();
  const user: User = await rpcService.createUser(name, email);
  return c.json(user);
});

api.get("/rpc/user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const user: User = await rpcService.getUserInfo(userId);
  return c.json(user);
});

api.post("/rpc/todo/create", async (c) => {
  const { userId, title, priority } = await c.req.json();
  const todo: Todo = await rpcService.createTodo(userId, title, priority);
  return c.json(todo);
});

api.get("/rpc/todos/:userId", async (c) => {
  const userId = c.req.param("userId");
  const todos: Todo[] = await rpcService.getTodos(userId);
  return c.json(todos);
});

api.post("/rpc/todo/toggle", async (c) => {
  const { todoId } = await c.req.json();
  const todo: Todo = await rpcService.toggleTodo(todoId);
  return c.json(todo);
});

export default api;
