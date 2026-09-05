/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Diagnostic } from '@/inspection';
import type { PreviewController } from '../types';
import { DiagnosticItem } from '../components/DiagnosticItem';
import { HIGHLIGHT_CLASS } from '../inspection/highlight';

function createIframeWithDoc(bodyHtml: string): {
  iframe: HTMLIFrameElement;
  doc: Document;
} {
  const iframe = document.createElement('iframe');
  const doc = document.implementation.createHTMLDocument('preview');
  doc.body.innerHTML = bodyHtml;
  Object.defineProperty(iframe, 'contentDocument', {
    value: doc,
    configurable: true,
  });
  return { iframe, doc };
}

function renderItem(
  diagnostic: Diagnostic,
  controller: PreviewController,
  highlightedId: string | null
) {
  return render(
    <DiagnosticItem
      diagnostic={diagnostic}
      controller={controller}
      highlightedId={highlightedId}
      onToggleHighlight={vi.fn()}
    />
  );
}

describe('DiagnosticItem', () => {
  it('renders the touch-target label', () => {
    const { iframe } = createIframeWithDoc('<button id="b">Tap</button>');
    const controller = { getIframe: () => iframe } as PreviewController;
    renderItem(
      {
        id: 't1',
        type: 'touch-target',
        severity: 'warning',
        message: 'Small target',
      },
      controller,
      null
    );
    expect(screen.getByText('Touch target')).toBeInTheDocument();
  });

  it('renders a related-element chip when present', () => {
    const { iframe } = createIframeWithDoc('<div></div>');
    const controller = { getIframe: () => iframe } as PreviewController;
    renderItem(
      {
        id: 'f1',
        type: 'fixed-overlap',
        severity: 'warning',
        message: 'Overlap',
        element: { tagName: 'button', id: 'a', selector: '#a' },
        relatedElement: { tagName: 'button', id: 'b', selector: '#b' },
      },
      controller,
      null
    );
    expect(screen.getByText('button#a')).toBeInTheDocument();
    expect(screen.getByText('+ button#b')).toBeInTheDocument();
  });

  it('not rendered for missing source', () => {
    const { iframe } = createIframeWithDoc('<div></div>');
    const controller = { getIframe: () => iframe } as PreviewController;
    renderItem(
      {
        id: 'x',
        type: 'off-viewport',
        severity: 'info',
        message: 'No source',
      },
      controller,
      null
    );
    expect(screen.queryByText(/button#a/)).not.toBeInTheDocument();
  });

  it('highlights both the primary and related element on click', async () => {
    const { iframe, doc } = createIframeWithDoc(
      '<button id="a">A</button><button id="b">B</button>'
    );
    const controller = { getIframe: () => iframe } as PreviewController;
    renderItem(
      {
        id: 'f1',
        type: 'fixed-overlap',
        severity: 'warning',
        message: 'Overlap',
        element: { tagName: 'button', id: 'a', selector: '#a' },
        relatedElement: { tagName: 'button', id: 'b', selector: '#b' },
      },
      controller,
      null
    );

    await userEvent.click(
      screen.getByRole('button', { name: /Highlight element in preview/ })
    );

    expect(doc.querySelector('#a')!.classList.contains(HIGHLIGHT_CLASS)).toBe(
      true
    );
    expect(doc.querySelector('#b')!.classList.contains(HIGHLIGHT_CLASS)).toBe(
      true
    );
  });

  it('clears both highlights when un-highlighting', async () => {
    const { iframe, doc } = createIframeWithDoc(
      '<button id="a">A</button><button id="b">B</button>'
    );
    const controller = { getIframe: () => iframe } as PreviewController;
    renderItem(
      {
        id: 'f1',
        type: 'fixed-overlap',
        severity: 'warning',
        message: 'Overlap',
        element: { tagName: 'button', id: 'a', selector: '#a' },
        relatedElement: { tagName: 'button', id: 'b', selector: '#b' },
      },
      controller,
      'f1'
    );

    await userEvent.click(
      screen.getByRole('button', { name: /Remove highlight/ })
    );

    expect(doc.querySelector('#a')!.classList.contains(HIGHLIGHT_CLASS)).toBe(
      false
    );
    expect(doc.querySelector('#b')!.classList.contains(HIGHLIGHT_CLASS)).toBe(
      false
    );
  });
});
