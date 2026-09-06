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

  it('add device menu exposes keyboard navigation and Escape close', async () => {
    const user = userEvent.setup();
    render(<WorkspaceToolbar hasEntries={false} />);

    const trigger = screen.getByRole('button', { name: 'Add device' });

    // Open the menu: first menuitem receives focus.
    await user.click(trigger);
    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveFocus();

    const firstFocusable = items[0]!;
    const lastFocusable = items[items.length - 1]!;

    // Arrow down wraps to the next item from the first.
    await user.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();

    // Arrow up wraps back to the first.
    await user.keyboard('{ArrowUp}');
    expect(firstFocusable).toHaveFocus();

    // End jumps to the last item.
    await user.keyboard('{End}');
    expect(lastFocusable).toHaveFocus();

    // Home jumps back to the first.
    await user.keyboard('{Home}');
    expect(firstFocusable).toHaveFocus();

    // Escape closes the menu and restores focus to the trigger.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('selecting a device closes the menu and adds the entry', async () => {
    const user = userEvent.setup();
    render(<WorkspaceToolbar hasEntries={false} />);

    await user.click(screen.getByRole('button', { name: 'Add device' }));
    await user.click(screen.getByRole('menuitem', { name: /^iPhone 15 \d/ }));

    expect(usePreviewStore.getState().entries).toHaveLength(1);
    expect(usePreviewStore.getState().entries[0]?.deviceId).toBe('iphone-15');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
