import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../src/store/useAppStore'

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState({ theme: 'system' })
  })

  it('has default theme of system', () => {
    const { theme } = useAppStore.getState()
    expect(theme).toBe('system')
  })

  it('updates theme', () => {
    const { setTheme } = useAppStore.getState()
    setTheme('dark')
    expect(useAppStore.getState().theme).toBe('dark')
  })

  it('supports light theme', () => {
    const { setTheme } = useAppStore.getState()
    setTheme('light')
    expect(useAppStore.getState().theme).toBe('light')
  })
})
