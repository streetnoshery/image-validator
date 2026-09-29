/**
 * Simple async mutex built on a promise chain.
 * Used to serialize the "check perceptual-hash against known hashes,
 * then register this one" critical section so concurrently-processed
 * uploads in the same batch can't both slip past the duplicate check.
 */
class Mutex {
  constructor() {
    this._chain = Promise.resolve();
  }

  /**
   * Acquire the lock. Returns a release function — caller MUST call it
   * (ideally in a finally block) or the mutex deadlocks forever.
   * @returns {Promise<() => void>}
   */
  lock() {
    let release;
    const previous = this._chain;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    this._chain = previous.then(() => current);
    return previous.then(() => release);
  }
}

module.exports = Mutex;
