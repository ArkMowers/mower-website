/** Watch density changes even when the CSS viewport keeps the same dimensions. */
export function observeDevicePixelRatio(onChange: () => void) {
  let resolution: MediaQueryList

  const watch = () => {
    resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    resolution.addEventListener('change', changed)
  }
  const changed = () => {
    resolution.removeEventListener('change', changed)
    watch()
    onChange()
  }

  watch()
  return () => resolution.removeEventListener('change', changed)
}
