/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorkspaceToolbar } from '../components/WorkspaceToolbar';
import { usePreviewStore } from '../store/usePreviewStore';

describe('WorkspaceToolbar', () => {
  beforeEach(() => {
    usePreviewStore.getState().reset();
  });

  it('renders the shared URL input and core controls', () => {
    render(<WorkspaceToolbar hasEntries={false} />);
    expect(screen.getByLabelText('Shared preview URL')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add device' })
    ).toBeInTheDocument();
  });

  it('commits a valid localhost URL to the store on Enter', async () => {
    const user = userEvent.setup();
    render(<WorkspaceToolbar hasEntries={false} />);

    const input = screen.getByLabelText('Shared preview URL');
    await user.type(input, 'http://localhost:3000');
    await user.keyboard('{Enter}');

    expect(usePreviewStore.getState().sharedUrl).toBe('http://localhost:3000');
    // No validation warning for a valid URL.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an inline warning for malformed input without blocking submission', async () => {
    const user = userEvent.setup();
    render(<WorkspaceToolbar hasEntries={false} />);

    const input = screen.getByLabelText('Shared preview URL');
    await user.type(input, 'this is not a url');
    await user.keyboard('{Enter}');

    // Submission is intentionally not blocked (clearing must stay possible),
    // but the invalid value is surfaced as a warning.
    expect(usePreviewStore.getState().sharedUrl).toBe('this is not a url');
    expect(screen.getByRole('alert')).toHaveTextContent(
      "That doesn't look like a valid URL."
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not warn when the URL is cleared', async () => {
    const user = userEvent.setup();
    render(<WorkspaceToolbar hasEntries={false} />);

    const input = screen.getByLabelText('Shared preview URL');
    input.focus();
    await user.keyboard('{Enter}');

    expect(usePreviewStore.getState().sharedUrl).toBe('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('dismisses the warning as soon as the user edits the input', async () => {
    const user = userEvent.setup();
    render(<WorkspaceToolbar hasEntries={false} />);

    const input = screen.getByLabelText('Shared preview URL');
    await user.type(input, 'this is not a url');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.type(input, 'h');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
