export type ErrorType = "db" | "llm" | "telegram" | "plugin" | "validation" | "unexpected";

const serializeError = (err: unknown): unknown => {
  if (err instanceof Error) {
    return {
      ...err,
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause ? serializeError(err.cause) : undefined,
    };
  }
  return err;
};

export class AppError extends Error {
  readonly _tag = "AppError";

  constructor(
    readonly type: ErrorType,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = `AppError.${type}`;
  }

  toJSON() {
    return {
      _tag: this._tag,
      type: this.type,
      name: this.name,
      message: this.message,
      cause: serializeError(this.cause),
    };
  }
}

export const appError = (type: ErrorType, message: string, cause?: unknown) =>
  new AppError(type, message, { cause });

export const toAppError = (type: ErrorType, message: string) => (cause: unknown) =>
  appError(type, message, cause);

export const dbError = (msg: string) => toAppError("db", msg);
export const llmError = (msg: string) => toAppError("llm", msg);
export const validationError = (msg: string) => toAppError("validation", msg);
export const telegramError = (msg: string) => toAppError("telegram", msg);
export const pluginError = (msg: string) => toAppError("plugin", msg);
