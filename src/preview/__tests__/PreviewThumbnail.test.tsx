/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PreviewThumbnail } from '../components/PreviewThumbnail';
import type { PreviewEntry } from '../types';

const iphoneEntry: PreviewEntry = {
  id: 'preview-1',
  deviceId: 'iphone-15',
  orientation: 'portrait',
};

const desktopEntry: PreviewEntry = {
  id: 'preview-2',
  deviceId: 'desktop-1080p',
  orientation: 'landscape',
};

describe('PreviewThumbnail', () => {
  it('renders device name', () => {
    render(
      <PreviewThumbnail
        entry={iphoneEntry}
        isActive={false}
        lifecycle="idle"
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('iPhone 15')).toBeInTheDocument();
  });

  it('renders viewport dimensions', () => {
    render(
      <PreviewThumbnail
        entry={iphoneEntry}
        isActive={false}
        lifecycle="idle"
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('393 × 852')).toBeInTheDocument();
  });

  it('renders portrait orientation badge', () => {
    render(
      <PreviewThumbnail
        entry={iphoneEntry}
        isActive={false}
        lifecycle="idle"
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('renders landscape orientation badge', () => {
    render(
      <PreviewThumbnail
        entry={desktopEntry}
        isActive={false}
        lifecycle="idle"
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('L')).toBeInTheDocument();
  });

  it('renders lifecycle status for loading', () => {
    render(
      <PreviewThumbnail
        entry={iphoneEntry}
        isActive={false}
        lifecycle="loading"
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('renders lifecycle status for ready', () => {
    render(
      <PreviewThumbnail
        entry={iphoneEntry}
        isActive={false}
        lifecycle="ready"
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('renders lifecycle status for error', () => {
    render(
      <PreviewThumbnail
        entry={iphoneEntry}
        isActive={false}
        lifecycle="error"
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('shows active state', () => {
    render(
      <PreviewThumbnail
        entry={iphoneEntry}
        isActive={true}
        lifecycle="idle"
        onClick={vi.fn()}
      />
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows inactive state', () => {
    render(
      <PreviewThumbnail
        entry={iphoneEntry}
        isActive={false}
        lifecycle="idle"
        onClick={vi.fn()}
      />
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(
      <PreviewThumbnail
        entry={iphoneEntry}
        isActive={false}
        lifecycle="idle"
        onClick={onClick}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });

  it('has accessible label with device name and active state', () => {
    render(
      <PreviewThumbnail
        entry={iphoneEntry}
        isActive={true}
        lifecycle="idle"
        onClick={vi.fn()}
      />
    );
    expect(
      screen.getByLabelText('iPhone 15 preview (active)')
    ).toBeInTheDocument();
  });

  it('has accessible label without active state', () => {
    render(
      <PreviewThumbnail
        entry={iphoneEntry}
        isActive={false}
        lifecycle="idle"
        onClick={vi.fn()}
      />
    );
    expect(screen.getByLabelText('iPhone 15 preview')).toBeInTheDocument();
  });

  it('renders Unknown for unknown device', () => {
    const badEntry: PreviewEntry = {
      id: 'preview-bad',
      deviceId: 'nonexistent-device',
      orientation: 'portrait',
    };
    render(
      <PreviewThumbnail
        entry={badEntry}
        isActive={false}
        lifecycle="idle"
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('0 × 0')).toBeInTheDocument();
  });
});
