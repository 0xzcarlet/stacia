import { expect, it } from "vitest";
import { replyFor } from "../src/commands.js";
it("matches trimmed case-insensitive commands", () =>
  expect(replyFor(" .PING ")).toContain("Pong"));
it("ignores unrelated messages and command prefixes", () => {
  expect(replyFor("hello")).toBeUndefined();
  expect(replyFor(".ping extra")).toBeUndefined();
});
it("routes conversion outside the text reply handler", () =>
  expect(replyFor(".s")).toBeUndefined());
