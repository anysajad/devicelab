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
});
