/**
 * Example RPC service using Cap'n Web
 * Demonstrates type sharing between frontend and backend
 */

import { RpcTarget } from "capnweb";
import type {
  BatchProcessResult,
  CalculationResult,
  ExampleRpcMethods,
  Priority,
  Todo,
  User,
  UserPreferences,
} from "../types/shared.ts";

// In-memory storage (for demo purposes)
const users = new Map<string, User>();
const todos = new Map<string, Todo[]>();
let counter = 0;

export class ExampleRpcService extends RpcTarget implements ExampleRpcMethods {
  // Counter operations
  async getCounter(): Promise<number> {
    return counter;
  }

  async incrementCounter(): Promise<number> {
    counter++;
    return counter;
  }

  async decrementCounter(): Promise<number> {
    counter--;
    return counter;
  }

  async resetCounter(): Promise<number> {
    counter = 0;
    return counter;
  }

  // Simple greeting
  async hello(name: string): Promise<string> {
    return `Hello, ${name}! This is a Cap'n Web RPC response.`;
  }

  // Math operations
  async add(a: number, b: number): Promise<number> {
    return a + b;
  }

  async multiply(a: number, b: number): Promise<CalculationResult> {
    return {
      result: a * b,
      operation: `${a} × ${b}`,
      timestamp: new Date(),
    };
  }

  // User operations
  async getUserInfo(userId: string): Promise<User> {
    let user = users.get(userId);
    if (!user) {
      // Create a default user if not found
      user = {
        id: userId,
        name: `User ${userId}`,
        email: `user${userId}@example.com`,
        createdAt: new Date(),
        preferences: {
          theme: "light",
          notifications: true,
          language: "en",
        },
      };
      users.set(userId, user);
    }
    return user;
  }

  async createUser(name: string, email: string): Promise<User> {
    const userId = crypto.randomUUID();
    const user: User = {
      id: userId,
      name,
      email,
      createdAt: new Date(),
      preferences: {
        theme: "light",
        notifications: true,
        language: "en",
      },
    };
    users.set(userId, user);
    return user;
  }

  async updateUserPreferences(
    userId: string,
    preferences: Partial<UserPreferences>,
  ): Promise<User> {
    const user = await this.getUserInfo(userId);
    user.preferences = { ...user.preferences, ...preferences };
    users.set(userId, user);
    return user;
  }

  // Todo operations
  async getTodos(userId: string): Promise<Todo[]> {
    return todos.get(userId) || [];
  }

  async createTodo(userId: string, title: string, priority: Priority = "medium"): Promise<Todo> {
    const todo: Todo = {
      id: crypto.randomUUID(),
      title,
      completed: false,
      priority,
      createdAt: new Date(),
    };

    const userTodos = todos.get(userId) || [];
    userTodos.push(todo);
    todos.set(userId, userTodos);

    return todo;
  }

  async toggleTodo(todoId: string): Promise<Todo> {
    // Find the todo across all users
    for (const [userId, userTodos] of todos.entries()) {
      const todo = userTodos.find((t) => t.id === todoId);
      if (todo) {
        todo.completed = !todo.completed;
        todos.set(userId, userTodos); // Update storage
        return todo;
      }
    }
    throw new Error(`Todo with id ${todoId} not found`);
  }

  // Batch processing
  async processBatch(items: string[]): Promise<BatchProcessResult<string>> {
    const results = items.map((item) => item.toUpperCase());
    return {
      processed: items.length,
      results,
    };
  }

  async filterAndMap<T>(
    items: T[],
    operation: "uppercase" | "lowercase" | "reverse",
  ): Promise<T[]> {
    return items.map((item) => {
      if (typeof item === "string") {
        switch (operation) {
          case "uppercase":
            return item.toUpperCase() as T;
          case "lowercase":
            return item.toLowerCase() as T;
          case "reverse":
            return item.split("").reverse().join("") as T;
        }
      }
      return item;
    });
  }
}
