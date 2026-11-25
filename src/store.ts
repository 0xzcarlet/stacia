import type { AppConfig } from "./config.js";

type RequestState =
  "reserved" | "processing" | "sending" | "succeeded" | "failed" | "unknown";

import Database from "better-sqlite3";
export class Store {
  db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS requests(key TEXT PRIMARY KEY,sender TEXT NOT NULL,day TEXT NOT NULL,exempt INTEGER NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL);`,
    );
    this.db
      .prepare(
        "UPDATE requests SET state='failed' WHERE state IN ('reserved','processing')",
      )
      .run();
    this.db
      .prepare("UPDATE requests SET state='unknown' WHERE state='sending'")
      .run();
  }
  has(key: string): boolean {
    return Boolean(
      this.db.prepare("SELECT 1 FROM requests WHERE key=?").get(key),
    );
  }
  usage(sender: string, day: string) {
    return this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM requests WHERE sender=? AND day=? AND state IN ('reserved','processing','sending','unknown','succeeded')",
      )
      .get(sender, day) as { n: number };
  }
  global(day: string) {
    return this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM requests WHERE day=? AND exempt=0 AND state IN ('reserved','processing','sending','unknown','succeeded')",
      )
      .get(day) as { n: number };
  }
  admit(key: string, sender: string, config: AppConfig) {
    return this.db
      .transaction(() => {
        if (this.db.prepare("SELECT 1 FROM requests WHERE key=?").get(key))
          return false;
        if (
          this.db
            .prepare(
              "SELECT 1 FROM requests WHERE sender=? AND state IN ('reserved','processing','sending')",
            )
            .get(sender)
        )
          throw Error("Masih ada permintaan Anda yang diproses.");
        const day = new Intl.DateTimeFormat("en-CA", {
          timeZone: config.quota.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        const exempt = config.quota.unlimited_numbers.includes("+" + sender);
        if (!exempt) {
          if (
            config.quota.per_user_daily !== null &&
            this.usage(sender, day).n >= config.quota.per_user_daily
          )
            throw Error("Kuota pribadi habis.");
          if (
            config.quota.global_daily !== null &&
            this.global(day).n >= config.quota.global_daily
          )
            throw Error("Kuota global habis.");
        }
        this.db
          .prepare("INSERT INTO requests VALUES(?,?,?,?,?,?)")
          .run(key, sender, day, Number(exempt), "reserved", Date.now());
        return true;
      })
      .immediate();
  }
  transition(key: string, from: RequestState, to: RequestState) {
    return (
      this.db
        .prepare("UPDATE requests SET state=? WHERE key=? AND state=?")
        .run(to, key, from).changes === 1
    );
  }
}
