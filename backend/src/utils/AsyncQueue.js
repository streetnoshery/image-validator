/**
 * Minimal in-process, concurrency-limited task queue.
 * No external infra (Redis/SQS) required — good enough to keep upload
 * requests from blocking on the full validation pipeline while still
 * bounding how many CPU-heavy jobs (sharp/face-api) run at once.
 */
class AsyncQueue {
  constructor(concurrency = 3) {
    if (concurrency < 1) throw new Error('concurrency must be >= 1');
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  /**
   * Enqueue a task. Resolves/rejects when the task itself settles.
   * @param {() => Promise<any>} task
   * @returns {Promise<any>}
   */
  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this._drain();
    });
  }

  _drain() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();
      this.running++;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          this.running--;
          this._drain();
        });
    }
  }

  get size() {
    return this.queue.length;
  }

  get pending() {
    return this.running;
  }
}

module.exports = AsyncQueue;
