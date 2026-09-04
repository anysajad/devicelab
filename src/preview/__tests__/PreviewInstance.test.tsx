/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewInstance } from '../components/PreviewInstance';
import { usePreviewStore } from '../store/usePreviewStore';
import type { PreviewEntry } from '../types';

// jsdom does not implement ResizeObserver — provide a minimal mock.
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = MockResizeObserver;
}

const iphoneEntry: PreviewEntry = {
  id: 'preview-1',
  deviceId: 'iphone-15',
  orientation: 'portrait',
};

describe('PreviewInstance', () => {
  beforeEach(() => {
    usePreviewStore.getState().reset();
  });

  it('renders the preview toolbar with device info', () => {
    render(
      <PreviewInstance
        entry={iphoneEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText('iPhone 15')).toBeInTheDocument();
  });

  it('renders with the shared URL', () => {
    render(
      <PreviewInstance
        entry={iphoneEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument();
  });

  it('uses customUrl when provided', () => {
    const entryWithCustom: PreviewEntry = {
      ...iphoneEntry,
      customUrl: 'https://custom.example.com',
    };
    render(
      <PreviewInstance
        entry={entryWithCustom}
        sharedUrl="https://shared.example.com"
        onRemove={vi.fn()}
      />
    );
    expect(
      screen.getByDisplayValue('https://custom.example.com')
    ).toBeInTheDocument();
  });

  it('renders orientation controls', () => {
    render(
      <PreviewInstance
        entry={iphoneEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Portrait orientation')).toBeInTheDocument();
    expect(screen.getByLabelText('Landscape orientation')).toBeInTheDocument();
  });

  it('renders zoom controls', () => {
    render(
      <PreviewInstance
        entry={iphoneEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Fit preview to container')
    ).toBeInTheDocument();
  });

  it('renders reload button', () => {
    render(
      <PreviewInstance
        entry={iphoneEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Reload preview')).toBeInTheDocument();
  });

  it('renders remove button when onRemove provided', () => {
    render(
      <PreviewInstance
        entry={iphoneEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Remove preview')).toBeInTheDocument();
  });

  it('does not render remove button when onRemove not provided', () => {
    render(
      <PreviewInstance entry={iphoneEntry} sharedUrl="https://example.com" />
    );
    expect(screen.queryByLabelText('Remove preview')).not.toBeInTheDocument();
  });

  it('calls onRemove when remove button clicked', async () => {
    const onRemove = vi.fn();
    render(
      <PreviewInstance
        entry={iphoneEntry}
        sharedUrl="https://example.com"
        onRemove={onRemove}
      />
    );
    await userEvent.click(screen.getByLabelText('Remove preview'));
    expect(onRemove).toHaveBeenCalledWith('preview-1');
  });

  it('does not render for unknown device', () => {
    const badEntry: PreviewEntry = {
      id: 'preview-bad',
      deviceId: 'nonexistent-device',
      orientation: 'portrait',
    };
    const { container } = render(
      <PreviewInstance
        entry={badEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
