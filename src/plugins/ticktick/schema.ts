import * as z from "@zod/zod";
import { cron, managed, secret } from "../../services/config-schema.ts";

export const configSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: secret(z.string().min(1)),
  "ticktick-sync-schedule": cron(z.string().default("0 */6 * * *")),
  accessToken: managed(z.string().optional()),
  refreshToken: managed(z.string().optional()),
  tokenExpiresAt: managed(z.string().optional()),
});

export type TickTickConfig = z.infer<typeof configSchema>;

export type TickTickProject = {
  id: string;
  name: string;
};

export type TickTickTask = {
  id: string;
  title: string;
  content?: string;
  projectId: string;
  dueDate?: string;
  priority: number;
  status: number;
};

export type TickTickProjectData = {
  tasks: TickTickTask[];
};
