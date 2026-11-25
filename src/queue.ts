interface Job {
  run: () => Promise<void>;
  expire: () => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Single-worker FIFO; admission and push must run without an await between them. */
export class JobQueue {
  private waiting: Job[] = [];
  private active?: Promise<void>;
  private stopped = false;

  constructor(
    private maxWaiting = 10,
    private maxWaitMs = 120000,
  ) {}

  get hasCapacity() {
    return (
      !this.stopped && (!this.active || this.waiting.length < this.maxWaiting)
    );
  }

  push(run: () => Promise<void>, expire: () => void) {
    if (!this.hasCapacity) throw new Error("Antrean penuh. Coba lagi nanti.");
    if (!this.active) {
      this.start(run);
      return;
    }
    const job: Job = {
      run,
      expire,
      timer: setTimeout(() => {
        const index = this.waiting.indexOf(job);
        if (index !== -1) {
          this.waiting.splice(index, 1);
          expire();
        }
      }, this.maxWaitMs),
    };
    this.waiting.push(job);
  }

  private start(run: () => Promise<void>) {
    // Defer execution until the synchronous admission section has completed.
    this.active = Promise.resolve()
      .then(run)
      .finally(() => {
        this.active = undefined;
        const next = this.waiting.shift();
        if (next) {
          clearTimeout(next.timer);
          this.start(next.run);
        }
      });
  }

  async stop() {
    this.stopped = true;
    for (const job of this.waiting.splice(0)) {
      clearTimeout(job.timer);
      job.expire();
    }
    await this.active;
  }
}
