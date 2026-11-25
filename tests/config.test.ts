import { describe, it, expect } from "vitest";
import { schema } from "../src/config.js";
const input = {
  quota: {
    timezone: "Asia/Jakarta",
    per_user_daily: 0,
    global_daily: null,
    unlimited_numbers: [],
  },
  media: {
    max_input_bytes: 20971520,
    max_duration_seconds: 5,
    sticker_max_bytes: 500000,
    audio_max_bytes: 262144,
  },
  storage: {
    database_path: "data/db",
    session_path: "data/session",
    temp_path: "data/tmp",
  },
};
describe("configuration", () => {
  it("preserves zero and disabled quotas", () => {
    expect(schema.parse(input).quota).toEqual(input.quota);
  });
  it("rejects invalid timezone", () => {
    expect(() =>
      schema.parse({
        ...input,
        quota: { ...input.quota, timezone: "invalid" },
      }),
    ).toThrow();
  });
  it("rejects negative quota", () => {
    expect(() =>
      schema.parse({ ...input, quota: { ...input.quota, per_user_daily: -1 } }),
    ).toThrow();
  });
});
