// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { DemoBar } from './DemoBar';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

test('says that the demo data is not saved', () => {
  render(<DemoBar />);

  expect(screen.getByText('Demo data. Nothing here is saved.')).toBeInTheDocument();
});

test('the Exit demo link goes to the same address without the demo parameter', () => {
  window.history.replaceState(null, '', '/?demo&view=now#top');
  render(<DemoBar />);

  expect(screen.getByRole('link', { name: 'Exit demo' })).toHaveAttribute('href', '/?view=now#top');
});

test('the Exit demo link is the bare address when demo is the only parameter', () => {
  window.history.replaceState(null, '', '/?demo');
  render(<DemoBar />);

  expect(screen.getByRole('link', { name: 'Exit demo' })).toHaveAttribute('href', '/');
});
