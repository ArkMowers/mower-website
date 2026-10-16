import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

/** Align a screenshot's local mask with the background's full-page canvas. */
export function useSceneMask(ref: RefObject<HTMLElement | null>, enabled = true) {
  useLayoutEffect(() => {
    const frame = ref.current
    const scene = frame?.closest<HTMLElement>('.site-shell')

    if (!enabled || !frame || !scene) return

    let pendingFrame = 0

    const measure = () => {
      pendingFrame = 0
      if (!frame.isConnected || !scene.isConnected) return

      // Layout offsets ignore the entrance scale and the gentle image float.
      // Both the page background and mask therefore share a stable origin.
      let x = 0
      let y = 0
      let element: HTMLElement | null = frame

      while (element && element !== scene) {
        x += element.offsetLeft
        y += element.offsetTop
        element = element.offsetParent as HTMLElement | null
      }

      if (element !== scene) {
        const frameRect = frame.getBoundingClientRect()
        const sceneRect = scene.getBoundingClientRect()
        x = frameRect.left - sceneRect.left
        y = frameRect.top - sceneRect.top
      }

      frame.style.setProperty('--scene-width', `${scene.clientWidth}px`)
      frame.style.setProperty('--scene-height', `${scene.clientHeight}px`)
      frame.style.setProperty('--scene-x', `${x}px`)
      frame.style.setProperty('--scene-y', `${y}px`)
    }

    const scheduleMeasure = () => {
      if (!pendingFrame) pendingFrame = window.requestAnimationFrame(measure)
    }

    measure()

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(frame)
    observer.observe(scene)

    const viewport = window.visualViewport
    window.addEventListener('resize', scheduleMeasure, { passive: true })
    viewport?.addEventListener('resize', scheduleMeasure, { passive: true })
    const settledRefresh = window.setTimeout(scheduleMeasure, 1800)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
      viewport?.removeEventListener('resize', scheduleMeasure)
      window.clearTimeout(settledRefresh)
      if (pendingFrame) window.cancelAnimationFrame(pendingFrame)
      for (const property of ['--scene-width', '--scene-height', '--scene-x', '--scene-y']) {
        frame.style.removeProperty(property)
      }
    }
  }, [ref, enabled])
}
