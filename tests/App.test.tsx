import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from '../src/App'

describe('App', () => {
  it('renders the DeviceLab heading', () => {
    render(<App />)
    const headings = screen.getAllByText('DeviceLab')
    expect(headings.length).toBeGreaterThanOrEqual(1)
  })

  it('renders the preview workspace', () => {
    render(<App />)
    expect(
      screen.getByLabelText('Shared preview URL'),
    ).toBeInTheDocument()
  })

  it('renders the header with brand name', () => {
    render(<App />)
    const header = document.querySelector('header')
    expect(header).toBeInTheDocument()
    expect(header?.textContent).toContain('DeviceLab')
  })
})
