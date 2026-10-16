/** Project-owned declarations for the vendored Lens runtime subset. */
export type MaterialName = 'thick' | 'clear' | 'soft'
export type SceneName = 'aurora' | 'sunset' | 'ocean' | 'grid'

export interface Material {
  refraction: number
  blur: number
  dispersion: number
}

export interface ArtworkInfo {
  width: number
  height: number
  dpr: number
  scene: SceneName
}

export type ArtworkRenderer = (context: CanvasRenderingContext2D, info: ArtworkInfo) => void

export interface SoundState {
  enabled: boolean
  volume: number
  status: 'idle' | 'ready' | 'unavailable'
  played: number
  activeVoices: number
  frictionActive: boolean
}

export interface SoundOptions {
  enabled?: boolean
  volume?: number
  storageKey?: string
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  contextFactory?: () => AudioContext | null
  now?: () => number
  onChange?: (state: SoundState) => void
}

export interface RendererOptions extends Partial<Material> {
  scene?: SceneName
  artwork?: ArtworkRenderer
  brightness?: number
  motion?: boolean
  /** Composite lenses and optical shadows over the host; retain its background for refraction. */
  transparent?: boolean
  opaque?: boolean
  compare?: boolean
  onState?: (state: string) => void
}

export interface GlassRenderer {
  readonly canvas: HTMLCanvasElement
  readonly stage: HTMLElement
  readonly width: number
  readonly height: number
  readonly dpr: number
  readonly geometry: Array<{
    el: HTMLElement
    kind: string
    x: number
    y: number
    w: number
    h: number
    localW: number
    localH: number
  }>
  set(options: RendererOptions): void
  setScene(scene: SceneName): void
  resize(): void
  readGeometry(): void
  invalidate(duration?: number, geometry?: boolean): void
  destroy(): void
}

export interface JellyController {
  setIntensity(value: number, explicit?: boolean): void
  target(element: HTMLElement, x: number, y?: number, options?: { snap?: boolean }): void
  pulse(element: HTMLElement, amount?: number): void
  reset(): void
  cancel(snap?: boolean): void
  destroy(): void
}

export interface GlassSound {
  readonly enabled: boolean
  readonly volume: number
  readonly status: SoundState['status']
  snapshot(): SoundState
  set(options: Partial<Pick<SoundState, 'enabled' | 'volume'>>): void
  play(name?: string): Promise<boolean>
  stop(): void
  destroy(): void
}

export interface GlassSystem {
  renderer?: GlassRenderer
  jelly: JellyController
  sound: GlassSound
  mount(root?: HTMLElement): this
  setMaterial(value: MaterialName | Partial<Material>): void
  setScene(value: SceneName): void
  destroy(): void
}

export function createGlassSystem(stage: HTMLElement, options?: {
  canvas?: HTMLCanvasElement
  material?: MaterialName | Partial<Material>
  scene?: SceneName
  artwork?: ArtworkRenderer
  motion?: boolean
  transparent?: boolean
  /** Acquire a shared GPU lease and draw synchronously after controls mount. */
  eager?: boolean
  elasticity?: number
  audio?: SoundOptions
  onFallback?: (error: Error) => void
}): GlassSystem
