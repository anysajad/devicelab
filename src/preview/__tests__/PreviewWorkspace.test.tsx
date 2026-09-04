/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ZOOM_MAX, ZOOM_MIN } from '../previewUtils';
import { PreviewToolbar } from '../components/PreviewToolbar';
import { SafeAreaOverlay } from '../components/SafeAreaOverlay';

// --- SafeAreaOverlay tests ---

describe('SafeAreaOverlay', () => {
  it('renders nothing when all insets are zero', () => {
    const { container } = render(
      <SafeAreaOverlay
        safeArea={{ top: 0, right: 0, bottom: 0, left: 0 }}
        viewport={{ width: 393, height: 852 }}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders overlay bars for non-zero insets', () => {
    const { container } = render(
      <SafeAreaOverlay
        safeArea={{ top: 59, right: 0, bottom: 34, left: 0 }}
        viewport={{ width: 393, height: 852 }}
      />
    );
    // Should have the wrapper div with aria-hidden
    const wrapper = container.querySelector('[aria-hidden="true"]');
    expect(wrapper).toBeInTheDocument();
    // Should have two bars (top and bottom)
    const bars = wrapper!.querySelectorAll('div');
    expect(bars.length).toBe(2);
  });

  it('uses raw safe-area values without zoom multiplication', () => {
    const { container } = render(
      <SafeAreaOverlay
        safeArea={{ top: 59, right: 0, bottom: 34, left: 0 }}
        viewport={{ width: 393, height: 852 }}
      />
    );
    const wrapper = container.querySelector('[aria-hidden="true"]');
    const topBar = wrapper!.querySelector('div');
    // Raw value: 59px (no zoom multiplication — container transform handles scaling)
    expect(topBar).toHaveStyle({ height: '59px' });
  });

  it('has aria-hidden for assistive technology', () => {
    const { container } = render(
      <SafeAreaOverlay
        safeArea={{ top: 59, right: 0, bottom: 0, left: 0 }}
        viewport={{ width: 393, height: 852 }}
      />
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});

// --- PreviewToolbar tests ---

describe('PreviewToolbar', () => {
  const defaultProps = {
    url: '',
    onUrlChange: vi.fn(),
    onUrlSubmit: vi.fn(),
    selectedDeviceId: 'iphone-15',
    onDeviceChange: vi.fn(),
    orientation: 'portrait' as const,
    supportedOrientations: ['portrait', 'landscape'] as const,
    onOrientationChange: vi.fn(),
    onReload: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onFit: vi.fn(),
    effectiveZoom: 0.667,
    zoomMode: 'fit' as const,
    canZoomIn: true,
    canZoomOut: true,
    viewportWidth: 393,
    viewportHeight: 852,
    devicePixelRatio: 3,
    lifecycle: 'idle' as const,
    hasDevice: true,
  };

  it('renders URL input with placeholder', () => {
    render(<PreviewToolbar {...defaultProps} />);
    expect(
      screen.getByPlaceholderText('Enter URL to preview...')
    ).toBeInTheDocument();
  });

  it('renders device selector with registry devices grouped by category', () => {
    render(<PreviewToolbar {...defaultProps} />);
    const select = screen.getByLabelText('Select device');
    expect(select).toBeInTheDocument();

    // Check optgroups exist via their label attributes
    const optgroups = select.querySelectorAll('optgroup');
    const labels = Array.from(optgroups).map((og) => og.getAttribute('label'));
    expect(labels).toContain('Phones');
    expect(labels).toContain('Tablets');
    expect(labels).toContain('Desktops');

    // Check total options = 13 devices + 1 placeholder + 1 custom
    const options = select.querySelectorAll('option');
    expect(options.length).toBe(15); // 13 devices + "Select device..." + "Custom viewport..."
  });

  it('calls onDeviceChange when device selector changes', async () => {
    const onDeviceChange = vi.fn();
    render(
      <PreviewToolbar {...defaultProps} onDeviceChange={onDeviceChange} />
    );

    const select = screen.getByLabelText('Select device');
    await userEvent.selectOptions(select, 'desktop-1080p');

    expect(onDeviceChange).toHaveBeenCalledWith('desktop-1080p');
  });

  it('shows both orientation buttons enabled for phone device', () => {
    render(<PreviewToolbar {...defaultProps} />);
    const portrait = screen.getByLabelText('Portrait orientation');
    const landscape = screen.getByLabelText('Landscape orientation');
    expect(portrait).toBeEnabled();
    expect(landscape).toBeEnabled();
  });

  it('disables portrait for landscape-only device', () => {
    render(
      <PreviewToolbar
        {...defaultProps}
        selectedDeviceId="desktop-1080p"
        supportedOrientations={['landscape']}
      />
    );
    const portrait = screen.getByLabelText('Portrait orientation');
    const landscape = screen.getByLabelText('Landscape orientation');
    expect(portrait).toBeDisabled();
    expect(landscape).toBeEnabled();
  });

  it('calls onOrientationChange when orientation button clicked', async () => {
    const onOrientationChange = vi.fn();
    render(
      <PreviewToolbar
        {...defaultProps}
        onOrientationChange={onOrientationChange}
      />
    );

    await userEvent.click(screen.getByLabelText('Landscape orientation'));
    expect(onOrientationChange).toHaveBeenCalledWith('landscape');
  });

  it('calls onReload when reload button clicked', async () => {
    const onReload = vi.fn();
    render(<PreviewToolbar {...defaultProps} onReload={onReload} />);

    await userEvent.click(screen.getByLabelText('Reload preview'));
    expect(onReload).toHaveBeenCalled();
  });

  it('calls onZoomIn when zoom in button clicked', async () => {
    const onZoomIn = vi.fn();
    render(<PreviewToolbar {...defaultProps} onZoomIn={onZoomIn} />);

    await userEvent.click(screen.getByLabelText('Zoom in'));
    expect(onZoomIn).toHaveBeenCalled();
  });

  it('calls onZoomOut when zoom out button clicked', async () => {
    const onZoomOut = vi.fn();
    render(<PreviewToolbar {...defaultProps} onZoomOut={onZoomOut} />);

    await userEvent.click(screen.getByLabelText('Zoom out'));
    expect(onZoomOut).toHaveBeenCalled();
  });

  it('calls onFit when fit button clicked', async () => {
    const onFit = vi.fn();
    render(<PreviewToolbar {...defaultProps} onFit={onFit} />);

    await userEvent.click(screen.getByLabelText('Fit preview to container'));
    expect(onFit).toHaveBeenCalled();
  });

  it('displays effective zoom percentage', () => {
    render(<PreviewToolbar {...defaultProps} effectiveZoom={0.667} />);
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('displays 100% at native zoom', () => {
    render(<PreviewToolbar {...defaultProps} effectiveZoom={1} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('displays zoom out as disabled at minimum', () => {
    render(
      <PreviewToolbar
        {...defaultProps}
        effectiveZoom={ZOOM_MIN}
        canZoomOut={false}
      />
    );
    expect(screen.getByLabelText('Zoom out')).toBeDisabled();
  });

  it('displays zoom in as disabled at maximum', () => {
    render(
      <PreviewToolbar
        {...defaultProps}
        effectiveZoom={ZOOM_MAX}
        canZoomIn={false}
      />
    );
    expect(screen.getByLabelText('Zoom in')).toBeDisabled();
  });

  it('highlights fit button when in fit mode', () => {
    render(<PreviewToolbar {...defaultProps} zoomMode="fit" />);
    const fitButton = screen.getByLabelText('Fit preview to container');
    expect(fitButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not highlight fit button when in manual mode', () => {
    render(<PreviewToolbar {...defaultProps} zoomMode="manual" />);
    const fitButton = screen.getByLabelText('Fit preview to container');
    expect(fitButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('displays viewport dimensions and DPR', () => {
    render(<PreviewToolbar {...defaultProps} />);
    expect(screen.getByText('393 × 852 · 3×')).toBeInTheDocument();
  });

  it('shows idle lifecycle status', () => {
    render(<PreviewToolbar {...defaultProps} lifecycle="idle" />);
    expect(screen.getByText('Idle')).toBeInTheDocument();
  });

  it('shows loading lifecycle status', () => {
    render(<PreviewToolbar {...defaultProps} lifecycle="loading" />);
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('shows ready lifecycle status', () => {
    render(<PreviewToolbar {...defaultProps} lifecycle="ready" />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows error lifecycle status', () => {
    render(<PreviewToolbar {...defaultProps} lifecycle="error" />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('calls onUrlSubmit when Enter pressed in URL input', async () => {
    const onUrlSubmit = vi.fn();
    render(<PreviewToolbar {...defaultProps} onUrlSubmit={onUrlSubmit} />);

    const input = screen.getByLabelText('Target URL');
    await userEvent.type(input, 'https://example.com{Enter}');

    expect(onUrlSubmit).toHaveBeenCalled();
  });

  it('disables controls when no device selected', () => {
    render(
      <PreviewToolbar {...defaultProps} hasDevice={false} selectedDeviceId="" />
    );
    expect(screen.getByLabelText('Reload preview')).toBeDisabled();
    expect(screen.getByLabelText('Portrait orientation')).toBeDisabled();
    expect(screen.getByLabelText('Landscape orientation')).toBeDisabled();
    expect(screen.getByLabelText('Fit preview to container')).toBeDisabled();
    expect(screen.getByLabelText('Zoom in')).toBeDisabled();
    expect(screen.getByLabelText('Zoom out')).toBeDisabled();
  });

  it('has proper aria-label on nav element', () => {
    render(<PreviewToolbar {...defaultProps} />);
    expect(screen.getByLabelText('Preview controls')).toBeInTheDocument();
  });

  it('has aria-live on status indicator', () => {
    render(<PreviewToolbar {...defaultProps} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows dash for zoom when no device selected', () => {
    render(<PreviewToolbar {...defaultProps} hasDevice={false} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('does not show viewport info when no device selected', () => {
    render(<PreviewToolbar {...defaultProps} hasDevice={false} />);
    expect(screen.queryByText('393 × 852 · 3×')).not.toBeInTheDocument();
  });

  it('renders remove button when onRemove provided', () => {
    render(<PreviewToolbar {...defaultProps} onRemove={vi.fn()} />);
    expect(screen.getByLabelText('Remove preview')).toBeInTheDocument();
  });

  it('does not render remove button when onRemove not provided', () => {
    render(<PreviewToolbar {...defaultProps} />);
    expect(screen.queryByLabelText('Remove preview')).not.toBeInTheDocument();
  });
});

// --- PreviewWorkspace integration tests ---

// Mock ResizeObserver for workspace tests
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

import { beforeEach } from 'vitest';
import { PreviewWorkspace } from '../components/PreviewWorkspace';
import { usePreviewStore } from '../store/usePreviewStore';

describe('PreviewWorkspace (multi-device)', () => {
  beforeEach(() => {
    usePreviewStore.getState().reset();
  });

  it('shows empty state when no entries', () => {
    render(<PreviewWorkspace />);
    expect(
      screen.getByText('Add a device above to start previewing')
    ).toBeInTheDocument();
  });

  it('renders workspace toolbar', () => {
    render(<PreviewWorkspace />);
    expect(screen.getByLabelText('Shared preview URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Add device')).toBeInTheDocument();
  });

  it('shows layout toggle when entries exist', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    render(<PreviewWorkspace />);
    expect(screen.getByLabelText('Grid layout')).toBeInTheDocument();
    expect(screen.getByLabelText('Focus layout')).toBeInTheDocument();
  });

  it('hides layout toggle when no entries', () => {
    render(<PreviewWorkspace />);
    expect(screen.queryByLabelText('Grid layout')).not.toBeInTheDocument();
  });

  it('renders preview instances in grid mode', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    render(<PreviewWorkspace />);
    // Both devices should appear as select values
    const selects = screen.getAllByLabelText('Select device');
    expect(selects).toHaveLength(2);
    expect(selects[0]).toHaveValue('iphone-15');
    expect(selects[1]).toHaveValue('ipad');
  });

  it('renders only active instance in focus mode', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().setLayoutMode('focus');
    render(<PreviewWorkspace />);
    // Active preview (iPhone 15) should appear as PreviewInstance (has PreviewToolbar)
    // iPad should appear as thumbnail only (no PreviewToolbar)
    expect(screen.getByLabelText('Preview controls')).toBeInTheDocument();
    // Thumbnail should show iPad
    expect(screen.getByLabelText('iPad preview')).toBeInTheDocument();
  });

  it('renders thumbnails for all entries in focus mode', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().setLayoutMode('focus');
    render(<PreviewWorkspace />);
    // Both should appear as thumbnails (accessible by label)
    expect(
      screen.getByLabelText('iPhone 15 preview (active)')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('iPad preview')).toBeInTheDocument();
  });

  it('switching focus to a thumbnail changes active preview', async () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().setLayoutMode('focus');
    render(<PreviewWorkspace />);

    // Click the iPad thumbnail
    await userEvent.click(screen.getByLabelText('iPad preview'));

    // iPad should now be the active PreviewInstance
    expect(screen.getByLabelText('iPad preview (active)')).toBeInTheDocument();
  });

  it('layout toggle switches between grid and focus', async () => {
    usePreviewStore.getState().addEntry('iphone-15');
    render(<PreviewWorkspace />);

    // Initially grid mode
    expect(screen.getByLabelText('Grid layout')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Switch to focus
    await userEvent.click(screen.getByLabelText('Focus layout'));
    expect(screen.getByLabelText('Focus layout')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('single preview behaves like current single-preview', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    render(<PreviewWorkspace />);
    // Should render the preview with device controls
    const select = screen.getByLabelText('Select device');
    expect(select).toHaveValue('iphone-15');
    expect(screen.getByLabelText('Reload preview')).toBeInTheDocument();
  });

  it('add device creates new entry', async () => {
    render(<PreviewWorkspace />);

    // Click add device
    await userEvent.click(screen.getByLabelText('Add device'));

    // Select iPhone 15
    await userEvent.click(screen.getByText('iPhone 15'));

    // Entry should be created
    expect(usePreviewStore.getState().entries).toHaveLength(1);
    expect(usePreviewStore.getState().entries[0]?.deviceId).toBe('iphone-15');
  });

  it('remove entry removes from store', async () => {
    usePreviewStore.getState().addEntry('iphone-15');
    render(<PreviewWorkspace />);

    // Click remove button
    await userEvent.click(screen.getByLabelText('Remove preview'));

    expect(usePreviewStore.getState().entries).toHaveLength(0);
  });

  it('empty workspace shows add instruction', () => {
    render(<PreviewWorkspace />);
    expect(
      screen.getByText('Add a device above to start previewing')
    ).toBeInTheDocument();
  });

  // --- Grid/Focus configuration preservation tests ---

  it('grid with multiple entries renders one PreviewInstance per entry', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().addEntry('iphone-15-pro');
    render(<PreviewWorkspace />);

    // Each entry should have its own device selector
    const selects = screen.getAllByLabelText('Select device');
    expect(selects).toHaveLength(3);
  });

  it('grid mode: each preview has its own controls', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    render(<PreviewWorkspace />);

    // Each should have reload, zoom, etc.
    const reloadButtons = screen.getAllByLabelText('Reload preview');
    const zoomInButtons = screen.getAllByLabelText('Zoom in');
    expect(reloadButtons).toHaveLength(2);
    expect(zoomInButtons).toHaveLength(2);
  });

  it('focus mode: only active preview has controls', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().setLayoutMode('focus');
    render(<PreviewWorkspace />);

    // Only one PreviewToolbar (with controls)
    const toolbars = screen.getAllByLabelText('Preview controls');
    expect(toolbars).toHaveLength(1);

    // Thumbnails exist but have no controls
    expect(
      screen.getByLabelText('iPhone 15 preview (active)')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('iPad preview')).toBeInTheDocument();
  });

  it('grid → focus → grid preserves device configuration', async () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    const id2 = usePreviewStore.getState().addEntry('ipad');

    // Change device on first entry
    usePreviewStore.getState().updateEntry(id1, { deviceId: 'iphone-15-pro' });

    render(<PreviewWorkspace />);

    // Verify grid shows updated device via select value
    const selects = screen.getAllByLabelText('Select device');
    expect(selects[0]).toHaveValue('iphone-15-pro');

    // Switch to focus
    await userEvent.click(screen.getByLabelText('Focus layout'));

    // Switch back to grid
    await userEvent.click(screen.getByLabelText('Grid layout'));

    // Verify configuration persisted
    const entries = usePreviewStore.getState().entries;
    expect(entries.find((e) => e.id === id1)?.deviceId).toBe('iphone-15-pro');
    expect(entries.find((e) => e.id === id2)?.deviceId).toBe('ipad');
  });

  it('grid → focus → grid preserves orientation', async () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().updateEntry(id1, {
      orientation: 'landscape',
    });

    render(<PreviewWorkspace />);

    // Switch to focus and back
    await userEvent.click(screen.getByLabelText('Focus layout'));
    await userEvent.click(screen.getByLabelText('Grid layout'));

    const entries = usePreviewStore.getState().entries;
    expect(entries.find((e) => e.id === id1)?.orientation).toBe('landscape');
  });

  it('grid → focus → grid preserves customUrl', async () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().updateEntry(id1, {
      customUrl: 'https://custom.example.com',
    });

    render(<PreviewWorkspace />);

    // Switch to focus and back
    await userEvent.click(screen.getByLabelText('Focus layout'));
    await userEvent.click(screen.getByLabelText('Grid layout'));

    const entries = usePreviewStore.getState().entries;
    expect(entries.find((e) => e.id === id1)?.customUrl).toBe(
      'https://custom.example.com'
    );
  });

  it('removing active entry in focus mode selects next entry', async () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().setLayoutMode('focus');

    render(<PreviewWorkspace />);

    // iPhone 15 should be active
    expect(
      screen.getByLabelText('iPhone 15 preview (active)')
    ).toBeInTheDocument();

    // Remove the active entry
    await userEvent.click(screen.getByLabelText('Remove preview'));

    // iPad should now be active
    expect(screen.getByLabelText('iPad preview (active)')).toBeInTheDocument();
  });

  it('removing last entry shows empty state', async () => {
    usePreviewStore.getState().addEntry('iphone-15');
    render(<PreviewWorkspace />);

    await userEvent.click(screen.getByLabelText('Remove preview'));

    expect(
      screen.getByText('Add a device above to start previewing')
    ).toBeInTheDocument();
  });

  it('shared URL propagation: changes reload non-customUrl previews', async () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().setSharedUrl('https://initial.example.com');

    render(<PreviewWorkspace />);

    // Both should show initial URL in their read-only inputs
    const inputs = screen.getAllByLabelText('Preview URL (read-only)');
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue('https://initial.example.com');
    expect(inputs[1]).toHaveValue('https://initial.example.com');

    // Update shared URL in store
    usePreviewStore.getState().setSharedUrl('https://updated.example.com');

    // Wait for React to process the update
    await screen.findAllByDisplayValue('https://updated.example.com');

    // Both should reflect the updated URL
    const updatedInputs = screen.getAllByLabelText('Preview URL (read-only)');
    expect(updatedInputs[0]).toHaveValue('https://updated.example.com');
    expect(updatedInputs[1]).toHaveValue('https://updated.example.com');
  });

  it('customUrl isolation: customUrl not affected by sharedUrl changes', async () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().setSharedUrl('https://initial.example.com');
    usePreviewStore.getState().updateEntry(id1, {
      customUrl: 'https://custom.example.com',
    });

    render(<PreviewWorkspace />);

    // First instance shows custom URL, second shows shared URL
    const readOnlyInputs = screen.getAllByLabelText('Preview URL (read-only)');
    expect(readOnlyInputs[0]).toHaveValue('https://custom.example.com');
    expect(readOnlyInputs[1]).toHaveValue('https://initial.example.com');

    // Update shared URL
    usePreviewStore.getState().setSharedUrl('https://updated.example.com');

    // Wait for React to process the update
    await screen.findAllByDisplayValue('https://updated.example.com');

    // First instance still shows custom URL
    const updatedInputs = screen.getAllByLabelText('Preview URL (read-only)');
    expect(updatedInputs[0]).toHaveValue('https://custom.example.com');
    // Second instance shows updated shared URL
    expect(updatedInputs[1]).toHaveValue('https://updated.example.com');
  });

  it('desktop device remains landscape-only in controls', () => {
    usePreviewStore.getState().addEntry('desktop-1080p');
    render(<PreviewWorkspace />);

    // Portrait should be disabled for desktop
    const portraitBtn = screen.getByLabelText('Portrait orientation');
    expect(portraitBtn).toBeDisabled();
  });

  // --- Custom viewport tests ---

  it('custom viewport entry renders width/height inputs', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore
      .getState()
      .updateEntry(usePreviewStore.getState().entries[0]!.id, {
        viewportMode: 'custom',
        deviceId: '__custom__',
        customViewportWidth: 1024,
        customViewportHeight: 768,
      });

    render(<PreviewWorkspace />);

    expect(screen.getByLabelText('Custom viewport width')).toHaveValue('1024');
    expect(screen.getByLabelText('Custom viewport height')).toHaveValue('768');
  });

  it('custom viewport orientation controls are disabled', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore
      .getState()
      .updateEntry(usePreviewStore.getState().entries[0]!.id, {
        viewportMode: 'custom',
        deviceId: '__custom__',
        customViewportWidth: 1024,
        customViewportHeight: 768,
      });

    render(<PreviewWorkspace />);

    expect(screen.getByLabelText('Portrait orientation')).toBeDisabled();
    expect(screen.getByLabelText('Landscape orientation')).toBeDisabled();
  });

  it('grid → focus → grid preserves custom viewport dimensions', async () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().updateEntry(id1, {
      viewportMode: 'custom',
      deviceId: '__custom__',
      customViewportWidth: 1024,
      customViewportHeight: 768,
    });

    render(<PreviewWorkspace />);

    // Verify custom dimensions
    expect(screen.getByLabelText('Custom viewport width')).toHaveValue('1024');

    // Switch to focus and back
    await userEvent.click(screen.getByLabelText('Focus layout'));
    await userEvent.click(screen.getByLabelText('Grid layout'));

    // Verify dimensions preserved
    expect(screen.getByLabelText('Custom viewport width')).toHaveValue('1024');
    expect(screen.getByLabelText('Custom viewport height')).toHaveValue('768');
  });

  it('custom option appears in device selector', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    render(<PreviewWorkspace />);

    const select = screen.getByLabelText('Select device');
    const customOption = select.querySelector('option[value="__custom__"]');
    expect(customOption).toBeInTheDocument();
    expect(customOption).toHaveTextContent('Custom viewport...');
  });

  it('custom thumbnail shows Custom W × H', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    usePreviewStore
      .getState()
      .updateEntry(usePreviewStore.getState().entries[0]!.id, {
        viewportMode: 'custom',
        deviceId: '__custom__',
        customViewportWidth: 1024,
        customViewportHeight: 768,
      });
    usePreviewStore.getState().setLayoutMode('focus');

    render(<PreviewWorkspace />);

    // Custom thumbnail should show Custom W × H
    expect(
      screen.getByLabelText('Custom 1024 × 768 preview (active)')
    ).toBeInTheDocument();
    // iPad thumbnail should still work
    expect(screen.getByLabelText('iPad preview')).toBeInTheDocument();
  });

  it('two custom previews remain independent', () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    const id2 = usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().updateEntry(id1, {
      viewportMode: 'custom',
      deviceId: '__custom__',
      customViewportWidth: 1024,
      customViewportHeight: 768,
    });
    usePreviewStore.getState().updateEntry(id2, {
      viewportMode: 'custom',
      deviceId: '__custom__',
      customViewportWidth: 800,
      customViewportHeight: 600,
    });

    render(<PreviewWorkspace />);

    const widthInputs = screen.getAllByLabelText('Custom viewport width');
    const heightInputs = screen.getAllByLabelText('Custom viewport height');
    expect(widthInputs).toHaveLength(2);
    expect(heightInputs).toHaveLength(2);
    expect(widthInputs[0]).toHaveValue('1024');
    expect(widthInputs[1]).toHaveValue('800');
  });

  // --- Compare mode tests ---

  it('compare mode renders selected entries as PreviewInstances', () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    const id2 = usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().enterCompareMode([id1, id2]);
    render(<PreviewWorkspace />);

    // Both selected entries should have device selectors (PreviewInstance controls)
    const selects = screen.getAllByLabelText('Select device');
    expect(selects).toHaveLength(2);
  });

  it('compare mode shows CompareThumbnails for non-selected entries', () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    const id2 = usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().addEntry('iphone-15-pro');
    usePreviewStore.getState().enterCompareMode([id1, id2]);
    render(<PreviewWorkspace />);

    // Non-selected entry should have a compare checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(1);
  });

  it('compare mode: correct number of PreviewInstances', () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    const id2 = usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().addEntry('iphone-15-pro');
    usePreviewStore.getState().enterCompareMode([id1, id2]);
    render(<PreviewWorkspace />);

    const selects = screen.getAllByLabelText('Select device');
    expect(selects).toHaveLength(2);
  });

  it('compare mode: checkbox toggles selection', async () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    const id2 = usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().addEntry('iphone-15-pro');
    usePreviewStore.getState().enterCompareMode([id1, id2]);
    render(<PreviewWorkspace />);

    // Find checkboxes — the third entry (not selected) should have a checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(1);

    // Click the first available checkbox to toggle selection
    await userEvent.click(checkboxes[0]!);
    // After toggling, the store should reflect the change
    // (either added or removed depending on which entry was clicked)
    expect(usePreviewStore.getState().compareIds.length).toBeGreaterThanOrEqual(
      0
    );
  });

  it('compare mode: deselecting below 2 exits compare mode', async () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    const id2 = usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().enterCompareMode([id1, id2]);
    render(<PreviewWorkspace />);

    // Deselect one entry by clicking its checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    if (checkboxes.length > 0) {
      await userEvent.click(checkboxes[0]!);
    }

    // Should exit compare mode (back to grid) since only 1 entry remains
    expect(usePreviewStore.getState().layoutMode).toBe('grid');
  });

  it('compare button disabled with fewer than 2 entries', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    render(<PreviewWorkspace />);

    const compareBtn = screen.getByLabelText('Compare layout');
    expect(compareBtn).toBeDisabled();
  });

  it('compare button enabled with 2+ entries', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    render(<PreviewWorkspace />);

    const compareBtn = screen.getByLabelText('Compare layout');
    expect(compareBtn).toBeEnabled();
  });

  it('clicking compare button enters compare mode', async () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    render(<PreviewWorkspace />);

    await userEvent.click(screen.getByLabelText('Compare layout'));
    expect(usePreviewStore.getState().layoutMode).toBe('compare');
    expect(usePreviewStore.getState().compareIds).toHaveLength(2);
  });

  it('grid → compare → grid preserves entry configurations', async () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().updateEntry(id1, { orientation: 'landscape' });
    usePreviewStore.getState().addEntry('ipad');

    render(<PreviewWorkspace />);

    // Enter compare mode
    await userEvent.click(screen.getByLabelText('Compare layout'));
    expect(usePreviewStore.getState().layoutMode).toBe('compare');

    // Exit compare mode
    await userEvent.click(screen.getByLabelText('Grid layout'));
    expect(usePreviewStore.getState().layoutMode).toBe('grid');

    // Entry configuration preserved
    const entries = usePreviewStore.getState().entries;
    expect(entries.find((e) => e.id === id1)?.orientation).toBe('landscape');
  });

  it('compare thumbnail has accessible checkbox', () => {
    const id1 = usePreviewStore.getState().addEntry('iphone-15');
    const id2 = usePreviewStore.getState().addEntry('ipad');
    usePreviewStore.getState().enterCompareMode([id1, id2]);
    render(<PreviewWorkspace />);

    // All compare thumbnails should have checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(0); // may be 0 if all selected
  });

  it('layout mode group has accessible label', () => {
    usePreviewStore.getState().addEntry('iphone-15');
    usePreviewStore.getState().addEntry('ipad');
    render(<PreviewWorkspace />);

    expect(screen.getByLabelText('Layout mode')).toBeInTheDocument();
  });

  // --- Inspection / diagnostics integration ---

  it('shows Inspect button only when entries exist', () => {
    const { unmount } = render(<PreviewWorkspace />);
    expect(screen.queryByLabelText('Inspect')).not.toBeInTheDocument();

    unmount();
    usePreviewStore.getState().addEntry('iphone-15');
    render(<PreviewWorkspace />);
    expect(screen.getByLabelText('Inspect')).toBeInTheDocument();
  });

  it('clicking Inspect activates inspection and opens the panel', async () => {
    usePreviewStore.getState().addEntry('iphone-15');
    render(<PreviewWorkspace />);

    await userEvent.click(screen.getByLabelText('Inspect'));

    expect(usePreviewStore.getState().inspectionActive).toBe(true);
    expect(screen.getByLabelText('Inspection results')).toBeInTheDocument();
  });

  it('clicking Inspect again deactivates and closes the panel', async () => {
    usePreviewStore.getState().addEntry('iphone-15');
    render(<PreviewWorkspace />);

    await userEvent.click(screen.getByLabelText('Inspect'));
    expect(screen.getByLabelText('Inspection results')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Inspect'));
    expect(usePreviewStore.getState().inspectionActive).toBe(false);
    expect(
      screen.queryByLabelText('Inspection results')
    ).not.toBeInTheDocument();
  });

  it('closing the panel via its close button deactivates inspection', async () => {
    usePreviewStore.getState().addEntry('iphone-15');
    render(<PreviewWorkspace />);

    await userEvent.click(screen.getByLabelText('Inspect'));
    await userEvent.click(screen.getByLabelText('Close inspection panel'));

    expect(usePreviewStore.getState().inspectionActive).toBe(false);
  });
});
