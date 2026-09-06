/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePreviewStore } from '../store/usePreviewStore';
import { InspectionsPanel } from '../components/InspectionsPanel';

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

describe('InspectionsPanel', () => {
  const onClose = vi.fn();
  const getController = vi.fn();

  beforeEach(() => {
    usePreviewStore.getState().reset();
    onClose.mockClear();
    getController.mockReset();
  });

  it('renders empty state when no inspections have run', () => {
    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );
    expect(
      screen.getByText(/Click Inspect or Rescan to check for issues/)
    ).toBeInTheDocument();
  });

  it('renders "No issues found" when diagnostics array is empty', () => {
    const id = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().setInspectionResult(id, {
      phase: 'ready',
      inspectedAt: 1000,
      diagnostics: [],
      elementsScanned: 20,
    });

    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );
    expect(screen.getByText('No issues found')).toBeInTheDocument();
    expect(screen.getByText('20 elements scanned')).toBeInTheDocument();
  });

  it('renders summary badges for errors and warnings', () => {
    const id = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().setInspectionResult(id, {
      phase: 'ready',
      inspectedAt: 1000,
      diagnostics: [
        {
          id: 'd1',
          type: 'horizontal-overflow',
          severity: 'error',
          message: 'Element overflows',
        },
        {
          id: 'd2',
          type: 'off-viewport',
          severity: 'warning',
          message: 'Off viewport',
        },
        {
          id: 'd3',
          type: 'text-overflow',
          severity: 'info',
          message: 'Info item',
        },
      ],
      elementsScanned: 10,
    });

    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );
    expect(screen.getByText('1 error')).toBeInTheDocument();
    expect(screen.getByText('1 warning')).toBeInTheDocument();
    expect(screen.getByText('1 info')).toBeInTheDocument();
  });

  it('renders device name from entry', () => {
    const id = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().setInspectionResult(id, {
      phase: 'ready',
      inspectedAt: 1000,
      diagnostics: [
        {
          id: 'd1',
          type: 'horizontal-overflow',
          severity: 'error',
          message: 'Issue',
        },
      ],
      elementsScanned: 5,
    });

    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );
    expect(screen.getByText('iPhone 15')).toBeInTheDocument();
  });

  it('renders inaccessible banner when any entry is inaccessible', () => {
    const id = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().setInspectionResult(id, {
      phase: 'inaccessible',
      inaccessibleReason: 'cross-origin',
    });

    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );
    expect(
      screen.getByText(/cross-origin and cannot be inspected/)
    ).toBeInTheDocument();
  });

  it('shows running state', () => {
    const id = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().setInspectionResult(id, { phase: 'running' });

    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );
    expect(screen.getByText('Scanning...')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );
    await userEvent.click(screen.getByLabelText('Close inspection panel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls requestInspection when Rescan is clicked', async () => {
    const requestInspection = vi.spyOn(
      usePreviewStore.getState(),
      'requestInspection'
    );
    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );
    await userEvent.click(screen.getByLabelText('Rescan'));
    expect(requestInspection).toHaveBeenCalledTimes(1);
    requestInspection.mockRestore();
  });

  it('shows only active entry in focus mode', () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    const id2 = usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().setLayoutMode('focus');
    usePreviewStore.getState().setActiveId(id1);
    usePreviewStore.getState().setInspectionResult(id1, {
      phase: 'ready',
      inspectedAt: 1000,
      diagnostics: [
        {
          id: 'd1',
          type: 'horizontal-overflow',
          severity: 'error',
          message: 'Active issue',
        },
      ],
      elementsScanned: 5,
    });
    usePreviewStore.getState().setInspectionResult(id2, {
      phase: 'ready',
      inspectedAt: 1000,
      diagnostics: [
        {
          id: 'd2',
          type: 'off-viewport',
          severity: 'warning',
          message: 'Inactive issue',
        },
      ],
      elementsScanned: 5,
    });

    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );
    expect(screen.getByText('Active issue')).toBeInTheDocument();
    expect(screen.queryByText('Inactive issue')).not.toBeInTheDocument();
  });

  it('shows only compare entries in compare mode', () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    const id2 = usePreviewStore.getState().addEntry('ipad');
    const id3 = usePreviewStore.getState().addEntry('iphone-15-pro');
    usePreviewStore.getState().enterCompareMode([id1, id2]);
    usePreviewStore.getState().setInspectionResult(id1, {
      phase: 'ready',
      inspectedAt: 1000,
      diagnostics: [
        {
          id: 'd1',
          type: 'horizontal-overflow',
          severity: 'error',
          message: 'Compare issue',
        },
      ],
      elementsScanned: 5,
    });
    usePreviewStore.getState().setInspectionResult(id3, {
      phase: 'ready',
      inspectedAt: 1000,
      diagnostics: [
        {
          id: 'd2',
          type: 'off-viewport',
          severity: 'warning',
          message: 'Non-selected issue',
        },
      ],
      elementsScanned: 5,
    });

    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );
    expect(screen.getByText('Compare issue')).toBeInTheDocument();
    expect(screen.queryByText('Non-selected issue')).not.toBeInTheDocument();
  });

  it('does not claim "No issues" for an unscanned device (honest idle state)', () => {
    const id = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().setInspectionResult(id, { phase: 'idle' });

    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );

    expect(screen.getByText('Not scanned')).toBeInTheDocument();
    expect(screen.queryByText('No issues found')).not.toBeInTheDocument();
    // No "scanned" badge while the device has not been scanned.
    expect(screen.queryByText(/device scanned/)).not.toBeInTheDocument();
  });

  it('labels a cross-origin page as such instead of "No issues"', () => {
    const id = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().setInspectionResult(id, {
      phase: 'inaccessible',
      inaccessibleReason: 'cross-origin',
    });

    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );

    expect(
      screen.getByText(/Some pages are cross-origin and cannot be inspected/)
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cross-origin — cannot be inspected')
    ).toBeInTheDocument();
    expect(screen.queryByText('No issues found')).not.toBeInTheDocument();
  });

  it('labels a contentDocument-unavailable page distinctly', () => {
    const id = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().setInspectionResult(id, {
      phase: 'inaccessible',
      inaccessibleReason: 'contentDocument-unavailable',
    });

    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );

    expect(
      screen.getByText(/browser could not access the page/)
    ).toBeInTheDocument();
    expect(screen.queryByText('No issues found')).not.toBeInTheDocument();
  });

  it('labels a failed inspection with its message instead of "No issues"', () => {
    const id = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().setInspectionResult(id, {
      phase: 'error',
      errorMessage: 'Inspection crashed',
    });

    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );

    expect(screen.getByText('Inspection failed')).toBeInTheDocument();
    expect(screen.getByText('Inspection crashed')).toBeInTheDocument();
    expect(screen.queryByText('No issues found')).not.toBeInTheDocument();
  });

  it('gates the "scanned" badge on ALL visible devices being scanned', () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().setInspectionResult(id1, {
      phase: 'ready',
      inspectedAt: 1000,
      diagnostics: [],
      elementsScanned: 3,
    });
    // id2 has no result yet (phase idle).

    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );

    // Not all visible devices are scanned => no "N devices scanned" badge and
    // no "No issues found" claim (the unscanned device is shown honestly).
    expect(screen.queryByText(/device scanned/)).not.toBeInTheDocument();
    expect(screen.queryByText('No issues found')).not.toBeInTheDocument();
    expect(screen.getByText('Not scanned')).toBeInTheDocument();
  });

  it('scoped badge for focus mode reflects the active device only', () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().setLayoutMode('focus');
    usePreviewStore.getState().setActiveId(id1);
    usePreviewStore.getState().setInspectionResult(id1, {
      phase: 'ready',
      inspectedAt: 1000,
      diagnostics: [],
      elementsScanned: 3,
    });

    render(
      <InspectionsPanel getController={getController} onClose={onClose} />
    );

    expect(screen.getByText('1 device scanned')).toBeInTheDocument();
  });
});
