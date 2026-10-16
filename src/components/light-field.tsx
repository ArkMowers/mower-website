import { useLayoutEffect, useRef } from 'react'
import { observeDevicePixelRatio } from '@/lib/observe-device-pixel-ratio'
import type { Theme } from '@/lib/theme'

/**
 * Monochrome light field. The shader only computes luminance; a single hue is
 * applied at the end, so every variation on the page comes from light, shadow
 * and blur rather than from additional colours.
 */
export function LightField({ theme }: { theme: Theme }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const themeRef = useRef(theme)
  const syncThemeRef = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    themeRef.current = theme
    syncThemeRef.current?.()
  }, [theme])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const shell = canvas.closest('.site-shell')
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' })
    if (!gl) return

    const vsSource = `#version 300 es
    in vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`

    const fsSource = `#version 300 es
    precision highp float;
    out vec4 fragColor;
    uniform float u_time;
    uniform float u_intro;
    uniform vec2 u_resolution;
    uniform vec2 u_mouse;
    uniform float u_stage;   // y (0 = bottom) of the product window's top edge
    uniform float u_light;   // 1 = white paper, 0 = dark ink

    // The one hue of the page
    const vec3 HUE = vec3(0.32, 0.88, 0.70);

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i = 0; i < 4; i++) { v += a * noise(p); p = r * p * 2.02; a *= 0.5; }
      return v;
    }
    float ellipse(vec2 d, vec2 r) { return exp(-dot(d / r, d / r)); }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float aspect = u_resolution.x / u_resolution.y;
      vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
      float t = u_time * 0.045;
      vec2 m = u_mouse - 0.5;

      // Ground: near black, rising very slightly toward the top
      float L = 0.012 + 0.018 * uv.y;

      // Veils of light: low-frequency warped noise reads as light through frosted glass
      vec2 w = vec2(fbm(p * 0.9 + vec2(t, -t * 0.6)), fbm(p * 0.9 + vec2(-t * 0.7, t * 0.8) + 7.1));
      float veil = fbm(p * 1.2 + w * 1.8 + vec2(0.0, -t * 0.4));
      veil = smoothstep(0.35, 0.85, veil);

      // Key light above the title, breathing slowly
      float breathe = 0.92 + 0.08 * sin(u_time * 0.35);
      float key = ellipse(vec2(p.x - m.x * 0.12, uv.y - 1.06), vec2(0.62, 0.40)) * breathe;
      L += key * (0.14 + 0.20 * veil) * u_intro;
      L += pow(key, 5.0) * 0.16 * u_intro;

      // Veils spread down the page, fading out toward the bottom
      L += veil * 0.035 * smoothstep(0.2, 1.0, uv.y) * u_intro;

      // Horizon halo where the product window meets the light
      float halo = ellipse(vec2(p.x, uv.y - u_stage), vec2(0.62 * aspect * 0.55, 0.075));
      L += halo * (0.12 + 0.08 * veil) * u_intro;
      float haloWide = ellipse(vec2(p.x, uv.y - u_stage), vec2(1.1 * aspect * 0.55, 0.28));
      L += haloWide * 0.04 * u_intro;

      // A faint second source that trails the pointer
      L += ellipse(vec2(p.x - m.x * aspect, uv.y - 0.5 - m.y), vec2(0.45, 0.38)) * 0.035;

      // Shadowed edges
      float vig = smoothstep(1.25, 0.2, length(vec2((uv.x - 0.5) * 1.1, (uv.y - 0.62) * 1.2)));
      L *= 0.45 + 0.55 * vig;

      // Single-hue tone mapping: brightness changes, hue does not
      vec3 dark = 1.0 - exp(-HUE * L * 2.4);
      // Light: white paper; shadow is the hue's complement subtracted, so shade stays mint-tinted.
      // Lit areas stay near white, the edges and the space below the light fall into soft shade.
      float shade = clamp(0.30 - L * 1.25, 0.0, 1.0);
      vec3 light = vec3(1.0) - (vec3(1.0) - HUE) * shade * 0.55 - vec3(shade * 0.10);
      vec3 col = mix(dark, light, u_light);
      col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;
      fragColor = vec4(col, 1.0);
    }`

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vs = compile(gl.VERTEX_SHADER, vsSource)
    const fs = compile(gl.FRAGMENT_SHADER, fsSource)
    if (!vs || !fs) return
    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const posLoc = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(program, 'u_time')
    const uIntro = gl.getUniformLocation(program, 'u_intro')
    const uRes = gl.getUniformLocation(program, 'u_resolution')
    const uMouse = gl.getUniformLocation(program, 'u_mouse')
    const uStage = gl.getUniformLocation(program, 'u_stage')
    const uLight = gl.getUniformLocation(program, 'u_light')
    gl.uniform1f(uLight, themeRef.current === 'light' ? 1 : 0)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const target = { x: 0.5, y: 0.5 }
    const mouse = { x: 0.5, y: 0.5 }
    const preview = shell?.querySelector('.stage-window')
    let stageY = 0.45

    const onPointer = (e: PointerEvent) => {
      const field = canvas.getBoundingClientRect()
      target.x = (e.clientX - field.left) / Math.max(1, field.width)
      target.y = 1 - (e.clientY - field.top) / Math.max(1, field.height)
    }

    // Keep the halo locked to the product window's top edge
    const measureStage = () => {
      if (!preview) return
      const field = canvas.getBoundingClientRect()
      const top = preview.getBoundingClientRect().top
      stageY = 1 - (top - field.top) / Math.max(1, field.height)
    }

    const start = performance.now()
    let raf = 0
    let syncRaf = 0
    let resizePending = false
    let redrawPending = false
    let disposed = false
    let lastMaterialFrame = 0
    let lastFieldFrame = 0
    const draw = (now: number, notifyMaterial = false) => {
      const pointerEase = 1 - Math.exp(-Math.min(now - lastFieldFrame, 100) * 0.0018)
      lastFieldFrame = now
      const elapsed = (now - start) / 1000
      const intro = reduced ? 1 : 1 - Math.pow(1 - Math.min(elapsed / 2.8, 1), 3)
      mouse.x += (target.x - mouse.x) * pointerEase
      mouse.y += (target.y - mouse.y) * pointerEase
      gl.uniform1f(uTime, reduced ? 20 : elapsed + 20)
      gl.uniform1f(uIntro, 0.25 + 0.75 * intro)
      gl.uniform2f(uMouse, mouse.x, mouse.y)
      gl.uniform1f(uStage, stageY)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      // The slow environment needs fewer updates than the interactive lenses.
      if (notifyMaterial || reduced || now - lastMaterialFrame >= 100) {
        lastMaterialFrame = now
        canvas.dispatchEvent(new Event('mower:light-frame'))
      }
    }

    // Low-frequency field: half resolution is visually identical and much cheaper
    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.5
      const width = Math.max(1, Math.floor(canvas.clientWidth * scale))
      const height = Math.max(1, Math.floor(canvas.clientHeight * scale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(uRes, canvas.width, canvas.height)
    }

    // Layout changes and scrolling also occur with motion disabled. Coalesce
    // them into one frame, keeping the expensive field paused during springs.
    const syncLayout = (now: number) => {
      syncRaf = 0
      if (disposed) return
      if (resizePending) {
        resizePending = false
        resize()
      }
      measureStage()
      if (document.hidden) return
      if (shell?.querySelector('.jelly-moving, [data-held="true"]')) {
        syncRaf = requestAnimationFrame(syncLayout)
        return
      }
      if (redrawPending) {
        redrawPending = false
        draw(now)
      } else canvas.dispatchEvent(new Event('mower:light-frame'))
    }
    const scheduleLayout = (resize = false) => {
      if (disposed) return
      resizePending ||= resize
      redrawPending ||= resize || reduced
      if (!syncRaf) syncRaf = requestAnimationFrame(syncLayout)
    }
    const onResize = () => scheduleLayout(true)
    const onLayout = () => scheduleLayout()
    const layoutObserver = new ResizeObserver(onLayout)
    for (const element of [shell, preview, shell?.querySelector('.hero-copy')]) {
      if (element) layoutObserver.observe(element)
    }
    // A newly appearing document scrollbar can resize the fixed field without
    // a window resize event (for example after fonts or footer links wrap).
    const fieldObserver = new ResizeObserver(onResize)
    fieldObserver.observe(canvas)

    const loop = (now: number) => {
      // Keep full-viewport noise work out of a spring's critical frames. The
      // environment moves very slowly, so a brief hold has no visible jump.
      const interacting = shell?.querySelector('.jelly-moving, [data-held="true"]')
      if (!document.hidden && !interacting && now - lastFieldFrame >= 1000 / 24) {
        // The window settles during the intro, so track it for the first seconds
        if (now - start < 4000) measureStage()
        draw(now)
      }
      raf = requestAnimationFrame(loop)
    }

    window.addEventListener('resize', onResize, { passive: true })
    const stopObservingDensity = observeDevicePixelRatio(onResize)
    window.addEventListener('scroll', onLayout, { capture: true, passive: true })
    document.addEventListener('visibilitychange', onLayout)
    // Child layout effects run before the parent's Lens mount: its first
    // artwork sample must contain a rendered field, rather than an empty GPU.
    resize()
    measureStage()
    draw(performance.now())
    if (!reduced) {
      window.addEventListener('pointermove', onPointer, { passive: true })
      raf = requestAnimationFrame(loop)
    }
    canvas.dataset.ready = 'true'
    canvas.dispatchEvent(new Event('mower:light-frame'))
    syncThemeRef.current = () => {
      gl.uniform1f(uLight, themeRef.current === 'light' ? 1 : 0)
      if (document.hidden) {
        redrawPending = true
        return
      }
      // A theme change needs one immediate paint even while a spring holds the
      // animated field. Keep the context, intro progress and normal frame caps.
      measureStage()
      draw(performance.now(), true)
    }

    return () => {
      disposed = true
      syncThemeRef.current = null
      cancelAnimationFrame(raf)
      cancelAnimationFrame(syncRaf)
      layoutObserver.disconnect()
      fieldObserver.disconnect()
      window.removeEventListener('resize', onResize)
      stopObservingDensity()
      window.removeEventListener('scroll', onLayout, true)
      document.removeEventListener('visibilitychange', onLayout)
      window.removeEventListener('pointermove', onPointer)
      delete canvas.dataset.ready
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [])

  return (
    <div className="light-field" aria-hidden="true">
      <canvas ref={canvasRef} className="light-field-canvas" />
      <div className="light-field-grain" />
    </div>
  )
}
