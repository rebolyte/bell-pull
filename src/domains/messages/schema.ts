import * as z from "@zod/zod";
import { safeParse } from "../../utils/validate.ts";

// TODO we may also want to do kysely's helper here or in db service
// type Memory = Selectable<MemoriesTable>;

export const MessageRowSchema = z.object({
  id: z.number(),
  chat_id: z.string(),
  sender_id: z.string(),
  sender_name: z.string(),
  is_bot: z.literal(0).or(z.literal(1)),
  message: z.string(),
  created_at: z.string(),
});

export const MessageModelSchema = MessageRowSchema.transform((row) => ({
  id: row.id,
  chatId: row.chat_id,
  senderId: row.sender_id,
  senderName: row.sender_name,
  isBot: row.is_bot === 1,
  message: row.message,
  createdAt: new Date(row.created_at),
}));

export const CreateMessageInputSchema = z.object({
  chatId: z.string().min(1),
  senderId: z.string().min(1),
  senderName: z.string().min(1),
  message: z.string().min(1).max(4000),
  isBot: z.boolean().default(false),
});

export type MessageRow = z.infer<typeof MessageRowSchema>;
export type MessageModel = z.output<typeof MessageModelSchema>;
export type CreateMessageInput = z.input<typeof CreateMessageInputSchema>;

export const parseMessageRow = safeParse(MessageModelSchema);
export const parseMessageInput = safeParse(CreateMessageInputSchema);

export const toRowInsert = (
  msg: z.output<typeof CreateMessageInputSchema>,
): Omit<MessageRow, "id" | "created_at"> => ({
  chat_id: msg.chatId,
  sender_id: msg.senderId,
  sender_name: msg.senderName,
  is_bot: msg.isBot ? 1 : 0,
  message: msg.message,
});
