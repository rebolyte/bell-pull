import * as z from "@zod/zod";
import { safeParse } from "../../utils/validate.ts";

export const MessageSchema = z.object({
  id: z.number(),
  chatId: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  isBot: z.number().transform((v) => v === 1),
  message: z.string(),
  createdAt: z.string().transform((v) => new Date(v)),
});

export const CreateMessageInputSchema = z.object({
  chatId: z.string().min(1),
  senderId: z.string().min(1),
  senderName: z.string().min(1),
  message: z.string().min(1).max(4000),
  isBot: z.boolean().default(false),
});

export type Message = z.output<typeof MessageSchema>;
export type CreateMessageInput = z.input<typeof CreateMessageInputSchema>;

export const parseMessage = safeParse(MessageSchema);
export const parseMessageInput = safeParse(CreateMessageInputSchema);

export const toInsert = (msg: z.output<typeof CreateMessageInputSchema>) => ({
  chatId: msg.chatId,
  senderId: msg.senderId,
  senderName: msg.senderName,
  isBot: msg.isBot ? 1 : 0,
  message: msg.message,
});
