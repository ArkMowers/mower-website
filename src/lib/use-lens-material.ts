import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { Theme } from '@/lib/theme'
import { createGlassSystem } from '@/vendor/lens/runtime.js'
import { observeDevicePixelRatio } from './observe-device-pixel-ratio'

/** Enhance the existing semantic controls with Lens's local optical renderer. */
export function useLensMaterial(scope: RefObject<HTMLDivElement | null>, theme: Theme) {
  const themeRef = useRef(theme)
  const syncThemeRef = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    themeRef.current = theme
    syncThemeRef.current?.()
  }, [theme])

  useLayoutEffect(() => {
    const root = scope.current
    const source = root?.querySelector<HTMLCanvasElement>('.light-field-canvas')
    if (!root || !source) return

    const systems = new Map<HTMLElement, ReturnType<typeof createGlassSystem>>()

    const reconcile = () => {
      for (const [stage, system] of systems) {
        if (!root.contains(stage)) {
          system.destroy()
          systems.delete(stage)
        }
      }
      for (const stage of root.querySelectorAll<HTMLElement>('[data-lens-stage]')) {
        const existing = systems.get(stage)
        if (existing) {
          // Device detection can replace the CTA button with a native link.
          // Mount only controls owned by this region, excluding nested menus.
          for (const control of stage.querySelectorAll<HTMLElement>('[data-lg-drag], [data-lg-segments]')) {
            if (control.closest('[data-lens-stage]') === stage) existing.mount(control)
          }
          continue
        }
        const system = createGlassSystem(stage, {
          scene: themeRef.current === 'dark' ? 'ocean' : 'aurora',
          material: 'thick',
          motion: false,
          transparent: true,
          eager: true,
          elasticity: 0.7,
          audio: { enabled: false, storage: null },
          artwork(ctx, { width, height }) {
            // Lens refracts canvas pixels. Sample this region of our real light
            // field so its material belongs to the page, without a second scene.
            ctx.fillStyle = getComputedStyle(root).backgroundColor
            ctx.fillRect(0, 0, width, height)
            if (source.dataset.ready !== 'true') return
            const field = source.getBoundingClientRect()
            const region = stage.getBoundingClientRect()
            if (!field.width || !field.height || !region.width || !region.height) return
            const sx = source.width / field.width
            const sy = source.height / field.height
            ctx.globalAlpha = Number.parseFloat(getComputedStyle(source).opacity)
            ctx.drawImage(source, (region.left - field.left) * sx, (region.top - field.top) * sy,
              region.width * sx, region.height * sy, 0, 0, width, height)
            ctx.globalAlpha = 1
          },
        })
        systems.set(stage, system)
      }
    }

    // React owns the controls. Only register/remove material systems when a
    // region mounts, including the platform popover, rather than replacing DOM.
    const observer = new MutationObserver(reconcile)
    observer.observe(root, { subtree: true, childList: true })
    reconcile()

    let refreshRaf = 0
    let resizePending = false
    let disposed = false
    const refreshSystems = (resize = false) => {
      const scene = themeRef.current === 'dark' ? 'ocean' : 'aurora'
      for (const [stage, system] of systems) {
        // Browser zoom can change DPR without changing a fixed-size button.
        if (resize) system.renderer?.resize()
        if (stage.dataset.scene !== scene) system.setScene(scene)
        else system.renderer?.setScene(scene)
      }
    }
    const scheduleRefresh = (resize = false) => {
      if (disposed) return
      resizePending ||= resize
      if (document.hidden || refreshRaf) return
      refreshRaf = requestAnimationFrame(() => {
        refreshRaf = 0
        if (disposed || document.hidden) return
        const resize = resizePending
        resizePending = false
        refreshSystems(resize)
      })
    }
    const refresh = () => scheduleRefresh()
    const resize = () => scheduleRefresh(true)
    source.addEventListener('mower:light-frame', refresh)
    root.addEventListener('mower:lens-layout', refresh)
    document.addEventListener('visibilitychange', refresh)
    // The field is viewport-fixed while controls move with the document.
    // Capture ancestor and nested scrolling, including in reduced-motion mode.
    window.addEventListener('scroll', refresh, { capture: true, passive: true })
    window.addEventListener('resize', resize, { passive: true })
    const stopObservingDensity = observeDevicePixelRatio(resize)
    const layoutObserver = new ResizeObserver(refresh)
    layoutObserver.observe(root)
    for (const element of root.querySelectorAll('.hero-copy, .stage-window')) layoutObserver.observe(element)
    const settle = (event: AnimationEvent) => {
      if (!(event.target instanceof HTMLElement) || !event.target.matches('[data-lens-stage]')) return
      scheduleRefresh(true)
    }
    root.addEventListener('animationend', settle)
    syncThemeRef.current = () => {
      if (document.hidden) return
      // Child layout effects have already painted the newly themed field.
      // Refresh every mounted region before paint, including an open menu.
      cancelAnimationFrame(refreshRaf)
      refreshRaf = 0
      const resize = resizePending
      resizePending = false
      refreshSystems(resize)
    }
    return () => {
      disposed = true
      syncThemeRef.current = null
      cancelAnimationFrame(refreshRaf)
      observer.disconnect()
      layoutObserver.disconnect()
      source.removeEventListener('mower:light-frame', refresh)
      root.removeEventListener('mower:lens-layout', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('scroll', refresh, true)
      window.removeEventListener('resize', resize)
      stopObservingDensity()
      root.removeEventListener('animationend', settle)
      for (const system of systems.values()) system.destroy()
      systems.clear()
    }
  }, [scope])
}
