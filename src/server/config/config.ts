import z from "zod";

export const configSchema = z.object({
  hideNoUserMessageSession: z.boolean().optional().default(true),
  unifySameTitleSession: z.boolean().optional().default(true),
  preventAutoScroll: z.boolean().optional().default(false),
});

export type Config = z.infer<typeof configSchema>;
