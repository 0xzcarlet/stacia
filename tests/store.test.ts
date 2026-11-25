import { expect, it } from "vitest";
import { Store } from "../src/store.js";
import { schema } from "../src/config.js";
const config = () =>
  schema.parse({
    quota: {
      timezone: "Asia/Jakarta",
      per_user_daily: 2,
      global_daily: 1,
      unlimited_numbers: [],
    },
    media: {
      max_input_bytes: 20971520,
      max_duration_seconds: 5,
      sticker_max_bytes: 500000,
      audio_max_bytes: 262144,
    },
    storage: {
      database_path: ":memory:",
      session_path: "session",
      temp_path: "tmp",
    },
  });
it("reserves the final global slot once and refunds failed processing", () => {
  const store = new Store(":memory:");
  try {
    const c = config();
    expect(store.admit("a", "628111111111", c)).toBe(true);
    expect(store.admit("a", "628111111111", c)).toBe(false);
    expect(() => store.admit("b", "628222222222", c)).toThrow("global");
    store.transition("a", "reserved", "processing");
    store.transition("a", "processing", "failed");
    expect(store.admit("b", "628222222222", c)).toBe(true);
  } finally {
    store.db.close();
  }
});
it("allows exempt users without adding to the global budget", () => {
  const store = new Store(":memory:");
  try {
    const c = config();
    c.quota.unlimited_numbers = ["+628111111111"];
    store.admit("a", "628111111111", c);
    expect(store.admit("b", "628222222222", c)).toBe(true);
    expect(() => store.admit("c", "628111111111", c)).toThrow("diproses");
  } finally {
    store.db.close();
  }
});
