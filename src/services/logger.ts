export type Logger = {
  info: (msg: string) => void;
  error: (msg: string, cause?: unknown) => void;
  warn: (msg: string) => void;
};

export const makeLogger = (): Logger => ({
  info: (msg) => console.log(msg),
  error: (msg, cause) => console.error(msg, cause),
  warn: (msg) => console.warn(msg),
});
