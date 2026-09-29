const Mutex = require('../src/utils/Mutex');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Mutex', () => {
  test('serializes concurrent critical sections (no interleaving)', async () => {
    const mutex = new Mutex();
    const events = [];

    async function criticalSection(label) {
      const release = await mutex.lock();
      try {
        events.push(`${label}-start`);
        await delay(10); // deliberate gap where interleaving would show up
        events.push(`${label}-end`);
      } finally {
        release();
      }
    }

    // Fire all three "concurrently" — without the mutex their start/end
    // events would interleave because of the delay above.
    await Promise.all([criticalSection('A'), criticalSection('B'), criticalSection('C')]);

    // Each label's start must be immediately followed by its own end.
    for (let i = 0; i < events.length; i += 2) {
      const label = events[i].split('-')[0];
      expect(events[i]).toBe(`${label}-start`);
      expect(events[i + 1]).toBe(`${label}-end`);
    }
  });

  test('a shared counter incremented under lock ends up correct despite async gaps', async () => {
    const mutex = new Mutex();
    let counter = 0;

    async function incrementWithGap() {
      const release = await mutex.lock();
      try {
        const current = counter;
        await delay(5); // read-then-write race window
        counter = current + 1;
      } finally {
        release();
      }
    }

    await Promise.all(Array.from({ length: 10 }, incrementWithGap));
    expect(counter).toBe(10);
  });
});
