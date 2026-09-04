/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PreviewToolbar } from '../components/PreviewToolbar';
import { SafeAreaOverlay } from '../components/SafeAreaOverlay';

// --- SafeAreaOverlay tests ---

describe('SafeAreaOverlay', () => {
  it('renders nothing when all insets are zero', () => {
    const { container } = render(
      <SafeAreaOverlay
        safeArea={{ top: 0, right: 0, bottom: 0, left: 0 }}
        viewport={{ width: 393, height: 852 }}
        zoom={1}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders overlay bars for non-zero insets', () => {
    const { container } = render(
      <SafeAreaOverlay
        safeArea={{ top: 59, right: 0, bottom: 34, left: 0 }}
        viewport={{ width: 393, height: 852 }}
        zoom={1}
      />
    );
    // Should have the wrapper div with aria-hidden
    const wrapper = container.querySelector('[aria-hidden="true"]');
    expect(wrapper).toBeInTheDocument();
    // Should have two bars (top and bottom)
    const bars = wrapper!.querySelectorAll('div');
    expect(bars.length).toBe(2);
  });

  it('scales bar dimensions by zoom', () => {
    const { container } = render(
      <SafeAreaOverlay
        safeArea={{ top: 59, right: 0, bottom: 34, left: 0 }}
        viewport={{ width: 393, height: 852 }}
        zoom={0.5}
      />
    );
    const wrapper = container.querySelector('[aria-hidden="true"]');
    const topBar = wrapper!.querySelector('div');
    expect(topBar).toHaveStyle({ height: '29.5px' }); // 59 * 0.5
  });

  it('has aria-hidden for assistive technology', () => {
    const { container } = render(
      <SafeAreaOverlay
        safeArea={{ top: 59, right: 0, bottom: 0, left: 0 }}
        viewport={{ width: 393, height: 852 }}
        zoom={1}
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
    onFit: vi.fn(),
    zoom: 0.667,
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

    // Check total options = 13 devices + 1 placeholder
    const options = select.querySelectorAll('option');
    expect(options.length).toBe(14); // 13 devices + "Select device..."
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

  it('calls onFit when fit button clicked', async () => {
    const onFit = vi.fn();
    render(<PreviewToolbar {...defaultProps} onFit={onFit} />);

    await userEvent.click(screen.getByLabelText('Fit preview to container'));
    expect(onFit).toHaveBeenCalled();
  });

  it('displays zoom percentage from engine', () => {
    render(<PreviewToolbar {...defaultProps} zoom={0.667} />);
    expect(screen.getByText('67%')).toBeInTheDocument();
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
});
