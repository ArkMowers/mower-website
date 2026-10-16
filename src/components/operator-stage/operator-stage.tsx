import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Popover } from 'radix-ui'
import type { Theme } from '@/lib/theme'
import { OPERATOR_ACTIONS, OPERATOR_SKINS, posterUrl } from './models'
import type { OperatorAction } from './models'
import type { SpineRenderer } from './spine-renderer'
import './operator-stage.css'

type LoadState = 'loading' | 'ready' | 'fallback'
type MotionState = 'running' | 'paused' | 'reduced'

interface Controller {
  changeSkin: (index: number) => void
  playAction: (action?: OperatorAction) => void
  syncTheme: () => void
}

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

/** Self-contained Proviso companion: a canvas scene and one native, moving hit target. */
export function OperatorStage({ theme }: { theme: Theme }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<Controller | null>(null)
  const themeRef = useRef(theme)
  const requestedSkin = useRef(0)
  const menuOpenRef = useRef(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [currentAction, setCurrentAction] = useState<OperatorAction>(() => theme === 'dark' ? 'Sleep' : 'Relax')
  const [skinIndex, setSkinIndex] = useState(0)
  const [state, setState] = useState<LoadState>('loading')
  const [busy, setBusy] = useState(false)
  const [motion, setMotion] = useState<MotionState>('paused')
  const skin = OPERATOR_SKINS[skinIndex]
  const availableActions = OPERATOR_ACTIONS.filter(action => skin.actions.includes(action.id))

  useLayoutEffect(() => {
    themeRef.current = theme
    controllerRef.current?.syncTheme()
  }, [theme])

  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    const button = buttonRef.current
    const controls = controlsRef.current
    if (!stage || !canvas || !button || !controls) return

    let renderer: SpineRenderer | null = null
    let disposed = false
    let lost = false
    let ready = false
    let switching = false
    let request = 0
    let raf = 0
    let lastFrame = 0
    let width = 1
    let bodyHeight = 84
    let hitWidth = 96
    let x = 0
    let positioned = false
    let facing = 1
    let hovered = false
    let focused = false
    let intersecting = true
    let action: OperatorAction = themeRef.current === 'dark' ? 'Sleep' : 'Relax'
    let remaining = action === 'Sleep' ? Infinity : randomBetween(2.5, 5)
    let target = 0
    let manual = false
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')

    const placeButton = () => {
      controls.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`
    }
    const horizontalRange = () => {
      const bounds = renderer?.getHorizontalBounds(facing) ?? { min: -hitWidth / 2, max: hitWidth / 2 }
      return {
        min: Math.max(0, 2 - bounds.min - hitWidth / 2),
        max: Math.min(width - hitWidth, width - 2 - bounds.max - hitWidth / 2),
      }
    }
    const constrainPosition = () => {
      const range = horizontalRange()
      if (range.max >= range.min) {
        x = clamp(x, range.min, range.max)
        target = clamp(target, range.min, range.max)
      } else x = target = Math.max(0, (width - hitWidth) / 2)
    }
    const paint = (delta = 0) => {
      renderer?.draw(delta, x + hitWidth / 2, facing)
      placeButton()
    }
    const setAction = (next: OperatorAction, duration: number, immediate = false) => {
      action = next
      setCurrentAction(next)
      const animationDuration = renderer?.setAction(next, immediate) ?? 0
      remaining = next === 'Interact' || next === 'Special' || manual ? Math.max(animationDuration, duration, 1) : duration
      constrainPosition()
    }
    const canRun = () => ready && !lost && !switching && !document.hidden && intersecting && (!media.matches || manual)
    const restingAction = (): OperatorAction => themeRef.current === 'dark' ? 'Sleep' : 'Relax'
    const rest = (immediate = media.matches, duration = randomBetween(2.5, 5)) => {
      manual = false
      target = x
      const next = restingAction()
      setAction(next, next === 'Sleep' ? Infinity : duration, immediate)
    }

    const walk = () => {
      const max = Math.max(0, width - hitWidth)
      const stride = randomBetween(Math.min(64, max / 2), Math.min(240, max))
      facing = x < 24 ? 1 : x > max - 24 ? -1 : Math.random() >= 0.5 ? 1 : -1
      target = clamp(x + stride * facing, 0, max)
      if (Math.abs(target - x) < 12) {
        facing *= -1
        target = clamp(x + stride * facing, 0, max)
      }
      setAction('Move', 12)
    }

    const chooseAction = () => {
      manual = false
      if (themeRef.current === 'dark') {
        rest()
        return
      }
      const roll = Math.random()
      if (roll > 0.92 && OPERATOR_SKINS[requestedSkin.current].actions.includes('Special')) setAction('Special', 0)
      else if (roll < 0.3) setAction('Relax', randomBetween(2.5, 5))
      else if (roll < 0.7 && width > hitWidth + 16) {
        walk()
      } else if (roll < 0.82) setAction('Interact', 0)
      else if (roll < 0.94) setAction('Sit', randomBetween(5, 9))
      else setAction('Sleep', randomBetween(7, 12))
    }

    const frame = (now: number) => {
      raf = 0
      if (!canRun()) return
      if (!lastFrame) lastFrame = now
      const elapsed = now - lastFrame
      if (elapsed >= 1000 / 30) {
        const delta = Math.min(elapsed / 1000, 0.1)
        lastFrame = now
        // Stay still under the pointer or keyboard focus, so the control is easy to use.
        if (manual || (!hovered && !focused && !menuOpenRef.current)) {
          remaining -= delta
          if (action === 'Move' && !menuOpenRef.current && (manual || (!hovered && !focused))) {
            const step = Math.min(Math.abs(target - x), 26 * delta)
            x += step * facing
            constrainPosition()
            if (Math.abs(target - x) < 0.5) {
              rest(media.matches, randomBetween(2, 4))
              syncMotion()
            }
          }
          if (remaining <= 0) {
            if (manual || action === 'Special') {
              rest()
              syncMotion()
            } else chooseAction()
          }
        }
        paint(delta)
      }
      if (canRun() && !raf) raf = requestAnimationFrame(frame)
    }
    const syncMotion = () => {
      cancelAnimationFrame(raf)
      raf = 0
      lastFrame = 0
      setMotion(media.matches ? 'reduced' : canRun() ? 'running' : 'paused')
      if (media.matches && ready && !manual) {
        rest(true)
        paint()
      }
      if (canRun()) raf = requestAnimationFrame(frame)
    }
    const measure = () => {
      width = stage.clientWidth
      hitWidth = button.offsetWidth
      bodyHeight = Number.parseFloat(getComputedStyle(stage).getPropertyValue('--operator-body-height')) || 84
      if (!positioned && width > hitWidth) {
        x = (width - hitWidth) * 0.22
        positioned = true
      }
      renderer?.resize(width, 224, bodyHeight, 36)
      constrainPosition()
      paint()
    }
    const fallback = () => {
      if (disposed) return
      ready = false
      switching = false
      manual = false
      renderer?.dispose()
      renderer = null
      setBusy(false)
      setState('fallback')
      setSkinIndex(requestedSkin.current)
      rest(true)
      syncMotion()
    }
    const changeSkin = async (index: number) => {
      const currentRequest = ++request
      if (!renderer || lost) {
        if (lost) fallback()
        else if (ready) setSkinIndex(index)
        return
      }
      switching = true
      manual = false
      setBusy(true)
      syncMotion()
      try {
        const loaded = await renderer.load(OPERATOR_SKINS[index])
        if (disposed || currentRequest !== request || !loaded) return
        ready = true
        switching = false
        rest()
        measure()
        paint()
        setSkinIndex(index)
        setState('ready')
        setBusy(false)
        syncMotion()
      } catch {
        if (!disposed && currentRequest === request) fallback()
      }
    }
    controllerRef.current = {
      syncTheme() {
        manual = false
        if (!ready || lost || switching) {
          setCurrentAction(restingAction())
          return
        }
        rest()
        paint()
        syncMotion()
      },
      changeSkin(index) {
        if (renderer && !lost) void changeSkin(index)
        else if (lost || stage.dataset.state === 'fallback') setSkinIndex(index)
      },
      playAction(next) {
        if (!ready || !renderer || lost || switching) return
        const supported = OPERATOR_SKINS[requestedSkin.current].actions
        if (next && !supported.includes(next)) return
        const alternatives = OPERATOR_ACTIONS.filter(item => supported.includes(item.id) && item.id !== 'Move' && item.id !== action)
        const selected = next ?? alternatives[Math.floor(Math.random() * alternatives.length)].id
        manual = true
        if (selected === 'Move') walk()
        else setAction(selected, 0, media.matches)
        paint()
        syncMotion()
      },
    }

    const enter = () => {
      hovered = true
      if (action === 'Move' && !manual) rest()
    }
    const leave = () => { hovered = false }
    const focus = () => {
      focused = controls.matches(':has(:focus-visible)')
      if (action === 'Move' && !manual) rest()
    }
    const blur = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !controls.contains(event.relatedTarget)) focused = false
    }
    const onLost = (event: Event) => {
      event.preventDefault()
      lost = true
      request++
      fallback()
    }
    const resize = new ResizeObserver(measure)
    resize.observe(stage)
    const observer = new IntersectionObserver(entries => {
      intersecting = entries[0]?.isIntersecting ?? true
      syncMotion()
    })
    observer.observe(stage)
    controls.addEventListener('pointerenter', enter)
    controls.addEventListener('pointerleave', leave)
    controls.addEventListener('focusin', focus)
    controls.addEventListener('focusout', blur)
    canvas.addEventListener('webglcontextlost', onLost)
    document.addEventListener('visibilitychange', syncMotion)
    media.addEventListener('change', syncMotion)
    measure()

    // The renderer and its legacy runtime are a separate, lazy-loaded bundle.
    void import('./spine-renderer').then(module => {
      if (disposed) return
      renderer = new module.SpineRenderer(canvas)
      measure()
      return changeSkin(requestedSkin.current)
    }).catch(fallback)

    return () => {
      disposed = true
      request++
      controllerRef.current = null
      cancelAnimationFrame(raf)
      resize.disconnect()
      observer.disconnect()
      controls.removeEventListener('pointerenter', enter)
      controls.removeEventListener('pointerleave', leave)
      controls.removeEventListener('focusin', focus)
      controls.removeEventListener('focusout', blur)
      canvas.removeEventListener('webglcontextlost', onLost)
      document.removeEventListener('visibilitychange', syncMotion)
      media.removeEventListener('change', syncMotion)
      renderer?.dispose()
    }
  }, [])

  const toggleMenu = (open: boolean) => {
    menuOpenRef.current = open
    setMenuOpen(open)
  }
  const chooseSkin = (index: number) => {
    requestedSkin.current = index
    controllerRef.current?.changeSkin(index)
    toggleMenu(false)
  }
  const chooseAction = (action: OperatorAction) => {
    controllerRef.current?.playAction(action)
    toggleMenu(false)
  }

  return (
    <div ref={stageRef} className="operator-stage" data-state={state}>
      <canvas ref={canvasRef} className="operator-pet-canvas" aria-hidden="true" />
      <div ref={controlsRef} className="operator-pet-controls" data-menu-open={menuOpen}>
      <button
        ref={buttonRef}
        className="operator-pet"
        type="button"
        onClick={() => controllerRef.current?.playAction()}
        data-state={state}
        data-skin={skin.id}
        data-action={currentAction}
        data-motion={motion}
        aria-busy={busy}
        aria-label={`但书，${skin.name}时装。点击触发随机动作`}
        title={`但书 · ${skin.name}｜点击互动`}
      >
        <img className="operator-pet-poster" src={posterUrl(skin)} alt="" width="128" height="128" draggable={false} />
      </button>
      <Popover.Root open={menuOpen} onOpenChange={toggleMenu}>
        <Popover.Trigger asChild>
          <button className="operator-menu-trigger" type="button" aria-label="小人菜单" title="动作与时装">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
            </svg>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="operator-menu" aria-label="但书动作与时装" aria-labelledby={undefined} side="top" align="center" sideOffset={8} collisionPadding={12}>
            <div className="operator-menu-heading">
              <Popover.Title>但书</Popover.Title>
              <Popover.Close className="operator-menu-close" aria-label="关闭小人菜单">×</Popover.Close>
            </div>
            <p className="operator-menu-section">动作</p>
            <div className="operator-menu-actions">
              {availableActions.map(item => (
                <button key={item.id} type="button" aria-pressed={currentAction === item.id} disabled={state !== 'ready' || busy} onClick={() => chooseAction(item.id)}>{item.name}</button>
              ))}
            </div>
            <p className="operator-menu-section">时装</p>
            <div className="operator-menu-skins">
              {OPERATOR_SKINS.map((item, index) => (
                <button key={item.id} type="button" aria-pressed={skinIndex === index} onClick={() => chooseSkin(index)}>
                  {item.name}
                  {skinIndex === index && <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>}
                </button>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      </div>
      <span className="operator-stage-status" role="status">但书 · {skin.name}</span>
    </div>
  )
}
