type FlashMessageProps = {
  flash?: string;
  message?: string;
};

const flashMessages: Record<string, { type: string; text: string }> = {
  saved: { type: "success", text: "Configuration saved!" },
  error: { type: "error", text: "Failed to save configuration" },
  connected: { type: "success", text: "OAuth connected successfully!" },
  "plugin-not-found": { type: "error", text: "Plugin not found" },
};

export const FlashMessage = ({ flash, message }: FlashMessageProps) => {
  if (!flash) return null;

  const msg = flashMessages[flash] ?? { type: "info", text: flash };
  const displayText = message ?? msg.text;

  return (
    <div class={`flash flash-${msg.type}`} role="alert">
      {displayText}
    </div>
  );
};
