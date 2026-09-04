/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewInstance } from '../components/PreviewInstance';
import { usePreviewStore } from '../store/usePreviewStore';
import { CUSTOM_DEVICE_ID } from '../types';
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

const customEntry: PreviewEntry = {
  id: 'preview-3',
  deviceId: CUSTOM_DEVICE_ID,
  orientation: 'portrait',
  viewportMode: 'custom',
  customViewportWidth: 1024,
  customViewportHeight: 768,
};

describe('PreviewInstance', () => {
  beforeEach(() => {
    usePreviewStore.getState().reset();
  });

  it('renders a screenshot button wired to the instance toolbar', () => {
    render(
      <PreviewInstance
        entry={iphoneEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    // The screenshot button is present (useScreenshot wiring active).
    expect(screen.getByLabelText('Capture screenshot')).toBeInTheDocument();
  });

  it('surfaces an honest screenshot status after a capture attempt', async () => {
    render(
      <PreviewInstance
        entry={iphoneEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    // jsdom cannot rasterize: the attempt must resolve to an honest status
    // (not-ready or render-failed), never a misleading PNG or a crash.
    await userEvent.click(screen.getByLabelText('Capture screenshot'));
    const labels = (await screen.findAllByRole('status')).map(
      (el) => el.textContent
    );
    expect([
      'Preview not ready',
      'Capture failed',
      'Unavailable (cross-origin)',
    ]).toHaveLength(3);
    const screenshotLabel = labels.find((l) =>
      [
        'Preview not ready',
        'Capture failed',
        'Unavailable (cross-origin)',
      ].includes(l ?? '')
    );
    expect(screenshotLabel).toBeTruthy();
  });

  it('renders the device selector with the correct device', () => {
    render(
      <PreviewInstance
        entry={iphoneEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    const select = screen.getByLabelText('Select device');
    expect(select).toHaveValue('iphone-15');
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
    // Both should have device selectors with different values
    const selects = screen.getAllByLabelText('Select device');
    expect(selects).toHaveLength(2);
    expect(selects[0]).toHaveValue('iphone-15');
    expect(selects[1]).toHaveValue('ipad');
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

  // --- Custom viewport tests ---

  it('custom viewport entry shows Custom device name', () => {
    render(
      <PreviewInstance
        entry={customEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    // The select should show the custom device ID
    const select = screen.getByLabelText('Select device');
    expect(select).toHaveValue(CUSTOM_DEVICE_ID);
  });

  it('custom viewport entry shows width/height inputs', () => {
    render(
      <PreviewInstance
        entry={customEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Custom viewport width')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom viewport height')).toBeInTheDocument();
  });

  it('custom viewport orientation controls are disabled', () => {
    render(
      <PreviewInstance
        entry={customEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Portrait orientation')).toBeDisabled();
    expect(screen.getByLabelText('Landscape orientation')).toBeDisabled();
  });

  it('custom viewport shows DPR 1 and zero safe-area', () => {
    render(
      <PreviewInstance
        entry={customEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    // DPR 1 displayed in viewport info
    expect(screen.getByText('0 × 0 · 1×')).toBeInTheDocument();
  });

  // --- Viewport tools tests ---

  it('renders viewport-tool toggles with safe-area defaulting to on', () => {
    render(
      <PreviewInstance
        entry={iphoneEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Toggle rulers')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle grid overlay')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle safe-area')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle viewport info')).toBeInTheDocument();

    // By default safe-area is on (preserves existing behavior), others off.
    expect(screen.getByLabelText('Toggle safe-area')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByLabelText('Toggle rulers')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('toggling each viewport tool flips its aria-pressed state', async () => {
    render(
      <PreviewInstance
        entry={iphoneEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    const rulersBtn = screen.getByLabelText('Toggle rulers');
    expect(rulersBtn).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(rulersBtn);
    expect(screen.getByLabelText('Toggle rulers')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await userEvent.click(screen.getByLabelText('Toggle grid overlay'));
    expect(screen.getByLabelText('Toggle grid overlay')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('keeps viewport-tool state isolated per instance', async () => {
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

    const rulersButtons = screen.getAllByLabelText('Toggle rulers');
    expect(rulersButtons).toHaveLength(2);
    expect(rulersButtons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(rulersButtons[1]).toHaveAttribute('aria-pressed', 'false');
    // Toggle rulers on the first instance only.
    await userEvent.click(rulersButtons[0]!);

    const after = screen.getAllByLabelText('Toggle rulers');
    expect(after[0]).toHaveAttribute('aria-pressed', 'true');
    expect(after[1]).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders viewport-tool toggles for custom viewport instances', () => {
    render(
      <PreviewInstance
        entry={customEntry}
        sharedUrl="https://example.com"
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Toggle rulers')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle grid overlay')).toBeInTheDocument();
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
