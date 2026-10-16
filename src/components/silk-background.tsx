import { useEffect, useRef } from 'react'

export function SilkBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
    })

    if (!gl) {
      console.warn('WebGL2 not supported, falling back to CSS background.')
      return
    }

    const vsSource = `#version 300 es
    in vec2 a_position;
    out vec2 vUv;
    void main() {
      vUv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }`

    const fsSource = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;

    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_motion;

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
                 i.z + vec4(0.0, i1.z, i2.z, 1.0))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0))
               + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
    }

    vec2 rotate(vec2 p, float a) {
      float c = cos(a);
      float s = sin(a);
      return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      float aspect = u_resolution.x / u_resolution.y;
      vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

      // DeepSeek diagonal silk orientation
      p = rotate(p, -0.38);

      float t = u_time * 0.12 * u_motion;

      // Silk drapery: undulating organic vertical/diagonal cloth folds
      float n1 = snoise(vec3(p.x * 0.8, p.y * 0.4, t * 0.3));
      float n2 = snoise(vec3(p.x * 1.6 + 1.2, p.y * 0.8, t * 0.4));

      float clothCoord = p.x * 3.2 + n1 * 1.2 + n2 * 0.4 + sin(p.y * 1.5 + t * 0.5) * 0.6;

      float wave = sin(clothCoord);
      float waveFine = sin(clothCoord * 2.0 + t * 0.8) * 0.25;
      float height = wave + waveFine;

      // Normal estimation for anisotropic lighting
      float dx = dFdx(height) * 7.0;
      float dy = dFdy(height) * 7.0;
      vec3 normal = normalize(vec3(-dx, -dy, 1.0));

      // Oblique light source (from top-right, illuminating one side of the folds)
      vec3 lightDir = normalize(vec3(0.65, 0.75, 0.55));
      vec3 viewDir = vec3(0.0, 0.0, 1.0);

      // Diffuse cloth lighting
      float diffuse = clamp(dot(normal, lightDir), 0.0, 1.0);

      // Anisotropic satin/silk specular reflection
      vec3 halfDir = normalize(lightDir + viewDir);
      float spec = pow(clamp(dot(normal, halfDir), 0.0, 1.0), 18.0);
      float sheen = pow(1.0 - abs(dot(normal, viewDir)), 2.6) * 0.65;

      // Proviso (但书) Matcha-Olive Sage hair palette (clear green undertone, eliminating grey flatness)
      vec3 ambientBlack = vec3(0.028, 0.048, 0.034); // deep matcha-slate shadow in hair folds
      vec3 deepValley = vec3(0.060, 0.105, 0.070);   // rich olive-sage fold transition
      vec3 ridgeColor = vec3(0.16, 0.29, 0.19);      // vivid matcha-tea sage hair body
      vec3 silkLuster = vec3(0.38, 0.58, 0.42);      // luminous matcha silk sheen
      vec3 specularHighlight = vec3(0.82, 0.94, 0.85); // platinum-sage bangs highlight

      // Blend based on fold illumination
      vec3 color = mix(ambientBlack, deepValley, smoothstep(0.0, 0.35, diffuse));
      color = mix(color, ridgeColor, smoothstep(0.25, 0.8, diffuse));

      // Add silk luster and specular reflections to the crests
      color += silkLuster * (pow(diffuse, 1.4) * 0.54 + sheen * 0.56);
      color += specularHighlight * spec * 0.62;

      // Atmospheric ambient lighting matching Proviso's soft matcha aesthetic
      // 1. Top-right subtle radiant warm matcha glow
      float trDist = length(uv - vec2(0.88, 0.88));
      float trGlow = exp(-trDist * 1.8) * 0.30;
      color += vec3(0.22, 0.38, 0.25) * trGlow;

      // 2. Center-top subtle crest glow
      float topDist = length(uv - vec2(0.5, 1.0));
      float topGlow = exp(-topDist * 2.2) * 0.18;
      color += vec3(0.20, 0.34, 0.22) * topGlow;

      // Vignette to keep bottom and edges deep & focused
      float vignette = smoothstep(1.2, 0.35, length(uv - 0.5));
      color *= (0.62 + 0.38 * vignette);

      // Micro dither noise to prevent 8-bit banding
      float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * (1.0 / 255.0);
      color += dither;

      fragColor = vec4(color, 1.0);
    }`

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader error:', gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vs = createShader(gl.VERTEX_SHADER, vsSource)
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource)
    if (!vs || !fs) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program))
      return
    }

    gl.useProgram(program)

    // Fullscreen quad buffer
    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    )

    const posLoc = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const uTimeLoc = gl.getUniformLocation(program, 'u_time')
    const uResLoc = gl.getUniformLocation(program, 'u_resolution')
    const uMotionLoc = gl.getUniformLocation(program, 'u_motion')

    let animationFrameId: number
    let startTime = performance.now()

    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
      if (uResLoc) {
        gl.uniform2f(uResLoc, canvas.width, canvas.height)
      }
    }

    window.addEventListener('resize', resize)
    resize()

    const render = () => {
      if (document.hidden) {
        animationFrameId = requestAnimationFrame(render)
        return
      }

      const now = performance.now()
      const elapsed = (now - startTime) * 0.001

      gl.useProgram(program)
      if (uTimeLoc) gl.uniform1f(uTimeLoc, elapsed)
      if (uMotionLoc) gl.uniform1f(uMotionLoc, isReducedMotion ? 0.0 : 1.0)

      gl.drawArrays(gl.TRIANGLES, 0, 6)

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', resize)
      gl.deleteBuffer(positionBuffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [])

  return (
    <div className="deepseek-silk-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} className="silk-webgl-canvas" />
      <div className="silk-vignette-overlay" />
    </div>
  )
}
