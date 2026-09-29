const AsyncQueue = require('../src/utils/AsyncQueue');

function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

describe('AsyncQueue', () => {
  test('never runs more than `concurrency` tasks at once', async () => {
    const queue = new AsyncQueue(2);
    let active = 0;
    let maxActive = 0;

    const task = () => {
      active++;
      maxActive = Math.max(maxActive, active);
      return delay(20).then(() => {
        active--;
      });
    };

    await Promise.all([task, task, task, task, task].map((t) => queue.add(t)));

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  test('resolves each add() with its task result', async () => {
    const queue = new AsyncQueue(3);
    const results = await Promise.all([
      queue.add(() => delay(5, 'a')),
      queue.add(() => delay(1, 'b')),
      queue.add(() => Promise.resolve('c')),
    ]);
    expect(results).toEqual(['a', 'b', 'c']);
  });

  test('a rejected task does not block subsequent tasks', async () => {
    const queue = new AsyncQueue(1);
    const first = queue.add(() => Promise.reject(new Error('boom'))).catch((e) => e.message);
    const second = queue.add(() => Promise.resolve('ok'));

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toBe('boom');
    expect(secondResult).toBe('ok');
  });

  test('rejects with concurrency < 1', () => {
    expect(() => new AsyncQueue(0)).toThrow();
  });
});
