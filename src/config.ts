import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
const allowance = z.number().int().nonnegative().nullable();
export const schema = z.object({
  quota: z.object({
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
    per_user_daily: allowance,
    global_daily: allowance,
    unlimited_numbers: z.array(z.string().regex(/^\+[1-9]\d{7,14}$/)),
  }),
  media: z.object({
    max_input_bytes: z.number().int().positive().max(104857600),
    max_duration_seconds: z.number().positive().max(10),
    sticker_max_bytes: z.number().int().positive(),
    audio_max_bytes: z.number().int().positive(),
  }),
  storage: z.object({
    database_path: z.string().min(1),
    session_path: z.string().min(1),
    temp_path: z.string().min(1),
  }),
});
export type AppConfig = z.infer<typeof schema>;

export async function loadConfig(file = "config.yaml") {
  const c = schema.parse(parse(await readFile(file, "utf8")));
  for (const key of ["database_path", "session_path", "temp_path"] as const)
    c.storage[key] = resolve(dirname(resolve(file)), c.storage[key]);
  if (new Set(Object.values(c.storage)).size !== 3)
    throw Error("Storage paths must differ");
  return c;
}
