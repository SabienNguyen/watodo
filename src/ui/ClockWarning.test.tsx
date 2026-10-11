// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ClockWarning } from './ClockWarning';

// Renders the warning with a skew, and waits for the check to finish.
async function renderWithSkew(skew: number | null) {
  const check = vi.fn(() => Promise.resolve(skew));
  const result = render(<ClockWarning check={check} />);
  await act(async () => {});
  return { ...result, check };
}

test('renders nothing while the clock check has no answer', async () => {
  const { container } = await renderWithSkew(null);
  expect(container).toBeEmptyDOMElement();
});

test('renders nothing when the clocks agree', async () => {
  const { container } = await renderWithSkew(0);
  expect(container).toBeEmptyDOMElement();
});

test('renders nothing just under the two-minute threshold', async () => {
  const { container } = await renderWithSkew(119_000);
  expect(container).toBeEmptyDOMElement();
});

test('says the device is ahead, in whole minutes', async () => {
  await renderWithSkew(300_000);
  expect(screen.getByText(
    "This device's clock is 5 minutes ahead of your computer's. Fix the time here, or syncing may not work.",
  )).toBeInTheDocument();
});

test('says the device is behind when its skew is negative', async () => {
  await renderWithSkew(-180_000);
  expect(screen.getByText(
    "This device's clock is 3 minutes behind your computer's. Fix the time here, or syncing may not work.",
  )).toBeInTheDocument();
});

test('rounds the skew to whole minutes', async () => {
  await renderWithSkew(125_000);
  expect(screen.getByText(
    "This device's clock is 2 minutes ahead of your computer's. Fix the time here, or syncing may not work.",
  )).toBeInTheDocument();
});

test('checks again when the browser comes online', async () => {
  const { check } = await renderWithSkew(0);
  expect(check).toHaveBeenCalledTimes(1);

  await act(async () => {
    window.dispatchEvent(new Event('online'));
  });
  expect(check).toHaveBeenCalledTimes(2);
});
