export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'mower-theme'
const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark'

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const preview = new URLSearchParams(window.location.search).get('theme')
  if (isTheme(preview)) return preview
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (isTheme(saved)) return saved
  } catch { /* The switch still works when browser storage is unavailable. */ }
  return 'light'
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#030806' : '#eaf3ef')
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme)
}

export function persistTheme(theme: Theme) {
  try { window.localStorage.setItem(STORAGE_KEY, theme) } catch { /* Optional preference storage. */ }
  // Keep explicit preview URLs consistent with the selected theme on reload.
  const url = new URL(window.location.href)
  if (url.searchParams.has('theme')) {
    url.searchParams.set('theme', theme)
    window.history.replaceState(window.history.state, '', url)
  }
}

export const INITIAL_THEME = initialTheme()
applyTheme(INITIAL_THEME)

