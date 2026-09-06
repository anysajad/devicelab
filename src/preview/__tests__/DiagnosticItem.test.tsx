/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Diagnostic } from '@/inspection';
import type { PreviewBackend } from '../backend';
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

/** A backend mock that exposes only the abstract inspection surface. */
function makeBackend(doc: Document | null): PreviewBackend {
  return {
    kind: 'iframe',
    getInspectionAccess: () =>
      doc ? { status: 'available', document: doc } : { status: 'pending' },
  } as unknown as PreviewBackend;
}

function renderItem(
  diagnostic: Diagnostic,
  backend: PreviewBackend,
  highlightedId: string | null
) {
  return render(
    <DiagnosticItem
      diagnostic={diagnostic}
      backend={backend}
      highlightedId={highlightedId}
      onToggleHighlight={vi.fn()}
    />
  );
}

describe('DiagnosticItem', () => {
  it('renders the touch-target label', () => {
    const { doc } = createIframeWithDoc('<button id="b">Tap</button>');
    const backend = makeBackend(doc);
    renderItem(
      {
        id: 't1',
        type: 'touch-target',
        severity: 'warning',
        message: 'Small target',
      },
      backend,
      null
    );
    expect(screen.getByText('Touch target')).toBeInTheDocument();
  });

  it('renders a related-element chip when present', () => {
    const { doc } = createIframeWithDoc('<div></div>');
    const backend = makeBackend(doc);
    renderItem(
      {
        id: 'f1',
        type: 'fixed-overlap',
        severity: 'warning',
        message: 'Overlap',
        element: { tagName: 'button', id: 'a', selector: '#a' },
        relatedElement: { tagName: 'button', id: 'b', selector: '#b' },
      },
      backend,
      null
    );
    expect(screen.getByText('button#a')).toBeInTheDocument();
    expect(screen.getByText('+ button#b')).toBeInTheDocument();
  });

  it('not rendered for missing source', () => {
    const { doc } = createIframeWithDoc('<div></div>');
    const backend = makeBackend(doc);
    // No element ref — the source chip must be omitted.
    renderItem(
      {
        id: 'x',
        type: 'off-viewport',
        severity: 'info',
        message: 'No source',
      },
      backend,
      null
    );
    expect(screen.queryByText(/button#a/)).not.toBeInTheDocument();
  });

  it('highlights both the primary and related element on click', async () => {
    const { doc } = createIframeWithDoc(
      '<button id="a">A</button><button id="b">B</button>'
    );
    const backend = makeBackend(doc);
    renderItem(
      {
        id: 'f1',
        type: 'fixed-overlap',
        severity: 'warning',
        message: 'Overlap',
        element: { tagName: 'button', id: 'a', selector: '#a' },
        relatedElement: { tagName: 'button', id: 'b', selector: '#b' },
      },
      backend,
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
    const { doc } = createIframeWithDoc(
      '<button id="a">A</button><button id="b">B</button>'
    );
    const backend = makeBackend(doc);
    renderItem(
      {
        id: 'f1',
        type: 'fixed-overlap',
        severity: 'warning',
        message: 'Overlap',
        element: { tagName: 'button', id: 'a', selector: '#a' },
        relatedElement: { tagName: 'button', id: 'b', selector: '#b' },
      },
      backend,
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
