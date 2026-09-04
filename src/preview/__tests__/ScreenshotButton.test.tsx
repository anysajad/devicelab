import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ScreenshotButton } from '../components/ScreenshotButton';
import type { ScreenshotStatus } from '../../screenshot';

function renderButton(
  props: {
    hasDevice?: boolean;
    isBusy?: boolean;
    status?: ScreenshotStatus | null;
    onCapture?: () => void;
  } = {}
) {
  const {
    hasDevice = true,
    isBusy = false,
    status = null,
    onCapture = vi.fn(),
  } = props;
  return {
    onCapture,
    ...render(
      <ScreenshotButton
        hasDevice={hasDevice}
        isBusy={isBusy}
        status={status}
        onCapture={onCapture}
      />
    ),
  };
}

describe('ScreenshotButton', () => {
  it('renders a screenshot trigger labelled for accessibility', () => {
    renderButton();
    expect(
      screen.getByRole('button', { name: 'Capture screenshot' })
    ).toBeTruthy();
  });

  it('is disabled when there is no device loaded', () => {
    renderButton({ hasDevice: false });
    expect(
      screen.getByRole('button', { name: 'Capture screenshot' })
    ).toBeDisabled();
  });

  it('triggers capture on click', () => {
    const { onCapture } = renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Capture screenshot' }));
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it('is disabled and shows a spinner while busy', () => {
    renderButton({ isBusy: true });
    const button = screen.getByRole('button', { name: 'Capture screenshot' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('shows no status label before any capture', () => {
    renderButton({ status: null });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each([
    ['ok', 'Captured'],
    ['cross-origin', 'Unavailable (cross-origin)'],
    ['not-ready', 'Preview not ready'],
    ['render-failed', 'Capture failed'],
  ] as const)('labels a %s status honestly', (status, label) => {
    renderButton({ status });
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });

  it('annotates failure statuses as errors visually', () => {
    renderButton({ status: 'cross-origin' });
    // The status element carries an amber error style class for failures.
    expect(screen.getByRole('status').className).toContain('text-amber-600');
  });
});
