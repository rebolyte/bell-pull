/**
 * Shared types between frontend and backend
 * These types can be imported by both JSX components and RPC services
 */

// User-related types
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

// Todo-related types
export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  priority: Priority;
  createdAt: Date;
};

export type Priority = "low" | "medium" | "high";

// Calculator result types
export type CalculationResult = {
  result: number;
  operation: string;
  timestamp: Date;
};

// Batch processing types
export type BatchProcessResult<T> = {
  processed: number;
  results: T[];
  errors?: string[];
};

// API response wrappers
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

// Plugin config types
export type FieldType =
  | "text"
  | "secret"
  | "cron"
  | "number"
  | "boolean"
  | "enum"
  | "oauth-managed";

export type FieldInfo = {
  key: string;
  type: FieldType;
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
};

export type PluginInfo = {
  name: string;
  displayName: string;
  hasOAuth: boolean;
  enabled: boolean;
  configured: boolean;
  fields: FieldInfo[];
  jsonSchema: unknown;
};

export interface PluginRpcMethods {
  getPlugins(): Promise<PluginInfo[]>;
  getPluginConfig(pluginName: string): Promise<Record<string, unknown> | null>;
  setPluginConfig(
    pluginName: string,
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; error?: string }>;
  setPluginEnabled(
    pluginName: string,
    enabled: boolean,
  ): Promise<{ success: boolean; error?: string }>;
  getOAuthStatus(pluginName: string): Promise<{
    connected: boolean;
    expiresAt?: string;
  }>;
}

// RPC method interfaces (for documentation and type safety)
export interface ExampleRpcMethods {
  // Simple greeting
  hello(name: string): Promise<string>;

  // Math operations
  add(a: number, b: number): Promise<number>;
  multiply(a: number, b: number): Promise<CalculationResult>;

  // Counter operations
  getCounter(): Promise<number>;
  incrementCounter(): Promise<number>;
  decrementCounter(): Promise<number>;
  resetCounter(): Promise<number>;

  // User operations
  getUserInfo(userId: string): Promise<User>;
  createUser(name: string, email: string): Promise<User>;
  updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<User>;

  // Todo operations
  getTodos(userId: string): Promise<Todo[]>;
  createTodo(userId: string, title: string, priority?: Priority): Promise<Todo>;
  toggleTodo(todoId: string): Promise<Todo>;

  // Batch processing
  processBatch(items: string[]): Promise<BatchProcessResult<string>>;
  filterAndMap<T>(items: T[], operation: "uppercase" | "lowercase" | "reverse"): Promise<T[]>;
}
