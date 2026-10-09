import { expect, test } from 'vitest';
import { systemClock } from './clock';

test('the system clock returns the current time', () => {
  const before = Date.now();
  const now = systemClock().getTime();
  expect(now).toBeGreaterThanOrEqual(before);
});
