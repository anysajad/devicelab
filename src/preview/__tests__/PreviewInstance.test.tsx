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

const ipadEntry: PreviewEntry = {
  id: 'preview-2',
  deviceId: 'ipad',
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

  // --- readOnly URL tests ---

  it('URL input is readOnly in PreviewInstance', () => {
    render(
      <PreviewInstance
        entry={iphoneEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    const input = screen.getByLabelText('Preview URL (read-only)');
    expect(input).toHaveAttribute('readonly');
  });

  // --- State independence tests ---

  it('two instances render independently', () => {
    render(
      <>
        <PreviewInstance
          entry={iphoneEntry}
          sharedUrl="https://a.example.com"
          onRemove={vi.fn()}
        />
        <PreviewInstance
          entry={ipadEntry}
          sharedUrl="https://b.example.com"
          onRemove={vi.fn()}
        />
      </>
    );
    expect(screen.getByText('iPhone 15')).toBeInTheDocument();
    expect(screen.getByText('iPad')).toBeInTheDocument();
  });

  it('each instance maintains independent zoom controls', () => {
    render(
      <>
        <PreviewInstance
          entry={iphoneEntry}
          sharedUrl="https://example.com"
          onRemove={vi.fn()}
        />
        <PreviewInstance
          entry={ipadEntry}
          sharedUrl="https://example.com"
          onRemove={vi.fn()}
        />
      </>
    );

    // Both should have independent zoom controls
    const zoomInButtons = screen.getAllByLabelText('Zoom in');
    const zoomOutButtons = screen.getAllByLabelText('Zoom out');
    expect(zoomInButtons).toHaveLength(2);
    expect(zoomOutButtons).toHaveLength(2);
  });

  it('customUrl instance shows custom URL not shared URL', () => {
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
    expect(
      screen.queryByDisplayValue('https://shared.example.com')
    ).not.toBeInTheDocument();
  });

  // --- Lifecycle cleanup test ---

  it('removing an entry does not create orphaned lifecycleStatus', () => {
    // Add entries to the store
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');

    // Simulate lifecycle status
    usePreviewStore.getState().updateLifecycleStatus(id1, 'ready');
    expect(usePreviewStore.getState().lifecycleStatus[id1]).toBe('ready');

    // Remove the entry
    usePreviewStore.getState().removeEntry(id1);

    // The lifecycleStatus should be cleaned up by removeEntry
    expect(usePreviewStore.getState().lifecycleStatus[id1]).toBeUndefined();

    // Verify no orphaned entry was created
    const allKeys = Object.keys(usePreviewStore.getState().lifecycleStatus);
    expect(allKeys).not.toContain(id1);
  });
});
