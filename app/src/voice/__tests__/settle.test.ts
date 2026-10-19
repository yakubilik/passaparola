import { FakeRecognizer } from '../../test-utils/fakeRecognizer';
import { AnswerListener, type Recognizer } from '../listener';

// whenUp: the round's first host line waits for the mic's 'start' (the
// recognizer's audio engine, voice processing and all, is running).
const fake = new FakeRecognizer();
const rec: Recognizer = {
  start: (o) => fake.module.start(o),
  abort: () => fake.module.abort(),
  subscribe: (h) => {
    const subs = ['result', 'error', 'end', 'start'].map((e) => fake.module.addListener(e, (h as any)[e] ?? (() => {})));
    return () => subs.forEach((s) => s.remove());
  },
};

beforeEach(() => {
  jest.useFakeTimers();
  fake.reset();
});
afterEach(() => jest.useRealTimers());

test('whenUp resolves on the recognizer\'s start event, not when start() is called', async () => {
  const l = new AnswerListener(rec);
  let up = false;
  l.listen(() => {});
  expect(l.openings).toBe(1);
  expect(l.micUp).toBe(false);
  const p = l.whenUp(1500).then(() => { up = true; });
  expect(up).toBe(false);
  await p;
  expect(up).toBe(true);
  expect(l.micUp).toBe(true);
  // Already up: at once.
  await l.whenUp(1500);
});

test('a recognizer that never says start does not hold the round: whenUp gives up after maxMs', async () => {
  const silent: Recognizer = { ...rec, subscribe: (h) => rec.subscribe({ ...h, start: undefined }) };
  const l = new AnswerListener(silent);
  l.listen(() => {});
  let up = false;
  const p = l.whenUp(1500).then(() => { up = true; });
  await Promise.resolve();
  jest.advanceTimersByTime(1499);
  await Promise.resolve();
  expect(up).toBe(false);
  jest.advanceTimersByTime(1);
  await p;
  expect(up).toBe(true);
  expect(l.micUp).toBe(false);
});

test('closing the mic releases a waiter, and reopening it counts as a new opening that has to come up again', async () => {
  const l = new AnswerListener(rec);
  l.listen(() => {});
  await l.whenUp(1500);
  l.stop();
  expect(l.micUp).toBe(false);
  await l.whenUp(1500);  // closed: nothing to wait for
  l.listen(() => {});
  l.listen(() => {});  // a new handler on an open mic is not a new opening
  expect(l.openings).toBe(2);
  const p = l.whenUp(1500);
  l.stop();
  await p;
});
