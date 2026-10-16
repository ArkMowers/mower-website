import spine from '@/vendor/spine/spine-webgl.js'
import { modelUrl, OPERATOR_ACTIONS } from './models'
import type { OperatorAction, OperatorSkin } from './models'

interface ModelAssets {
  atlas: string
  binary: Uint8Array
  image: HTMLImageElement
}

interface Model {
  skin: OperatorSkin
  atlas: spine.TextureAtlas
  skeleton: spine.Skeleton
  state: spine.AnimationState
  idleHeight: number
  idleFloor: number
  bounds: Partial<Record<OperatorAction, HorizontalBounds>>
}

export interface HorizontalBounds {
  min: number
  max: number
}

/** Measure whole animations, including visible props, instead of the click target. */
function measureHorizontalBounds(data: spine.SkeletonData) {
  const skeleton = new spine.Skeleton(data)
  const state = new spine.AnimationState(new spine.AnimationStateData(data))
  const vertices: number[] = []
  const bounds: Partial<Record<OperatorAction, HorizontalBounds>> = {}
  const supported = new Set<string>(OPERATOR_ACTIONS.map(action => action.id))
  for (const animation of data.animations) {
    if (!supported.has(animation.name)) continue
    const action = animation.name as OperatorAction
    skeleton.setToSetupPose()
    state.clearTracks()
    state.setAnimation(0, action, false)
    const duration = animation.duration
    const samples = Math.max(1, Math.ceil(duration * 60))
    let min = Infinity
    let max = -Infinity
    for (let frame = 0; frame <= samples; frame++) {
      if (frame) state.update(duration / samples)
      state.apply(skeleton)
      skeleton.updateWorldTransform()
      for (const slot of skeleton.drawOrder) {
        if (!slot.bone.active || slot.color.a <= 0) continue
        const attachment = slot.getAttachment()
        let length = 0
        if (attachment instanceof spine.RegionAttachment) {
          if (attachment.color.a <= 0) continue
          length = 8
          attachment.computeWorldVertices(slot.bone, vertices, 0, 2)
        } else if (attachment instanceof spine.MeshAttachment) {
          if (attachment.color.a <= 0) continue
          length = attachment.worldVerticesLength
          attachment.computeWorldVertices(slot, 0, length, vertices, 0, 2)
        }
        for (let index = 0; index < length; index += 2) {
          min = Math.min(min, vertices[index])
          max = Math.max(max, vertices[index])
        }
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error(`Invalid ${action} bounds`)
    bounds[action] = { min, max }
  }
  return bounds
}

// Only decoded source assets are shared. GPU objects belong to one mounted stage.
const assets = new Map<string, Promise<ModelAssets>>()
// Envelopes contain CPU geometry only; changing back to a loaded skin reuses
// the full-animation samples without retaining any disposed GPU resources.
const animationBounds = new Map<string, Partial<Record<OperatorAction, HorizontalBounds>>>()

function loadAssets(skin: OperatorSkin) {
  const cached = assets.get(skin.id)
  if (cached) return cached

  const pending = (async () => {
    const fetchAsset = async (extension: string) => {
      const response = await fetch(modelUrl(skin, extension), { signal: AbortSignal.timeout(15_000) })
      if (!response.ok) throw new Error(`Failed to load operator ${extension}: ${response.status}`)
      return response
    }
    const [atlas, binary, texture] = await Promise.all([
      fetchAsset('atlas').then(response => response.text()),
      fetchAsset('skel').then(response => response.arrayBuffer()),
      fetchAsset('png').then(response => response.blob()),
    ])
    const image = new Image()
    const url = URL.createObjectURL(texture)
    try {
      image.src = url
      await image.decode()
    } finally {
      URL.revokeObjectURL(url)
    }
    return { atlas, binary: new Uint8Array(binary), image }
  })()
  assets.set(skin.id, pending)
  void pending.catch(() => assets.delete(skin.id))
  return pending
}

/** A single transparent scene. React and the behavior controller own no WebGL details. */
export class SpineRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGLRenderingContext
  private readonly context: spine.webgl.ManagedWebGLRenderingContext
  private readonly shader: spine.webgl.Shader
  private readonly batcher: spine.webgl.PolygonBatcher
  private readonly skeletonRenderer: spine.webgl.SkeletonRenderer
  private readonly matrix = new spine.webgl.Matrix4()
  private model: Model | null = null
  private width = 1
  private height = 128
  private bodyHeight = 84
  private ground = 4
  private floor = 0
  private targetFloor = 0
  private generation = 0
  private disposed = false
  private action: OperatorAction = 'Relax'
  private previousBounds: HorizontalBounds | null = null
  private mixRemaining = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      powerPreference: 'low-power',
    })
    if (!gl) throw new Error('WebGL is unavailable')
    this.gl = gl
    this.context = new spine.webgl.ManagedWebGLRenderingContext(gl)
    // Ark-Models supplies premultiplied PNG pixels; never premultiply them twice.
    spine.webgl.GLTexture.DISABLE_UNPACK_PREMULTIPLIED_ALPHA_WEBGL = true
    this.shader = spine.webgl.Shader.newTwoColoredTextured(this.context)
    this.batcher = new spine.webgl.PolygonBatcher(this.context, true)
    this.skeletonRenderer = new spine.webgl.SkeletonRenderer(this.context, true)
    this.skeletonRenderer.premultipliedAlpha = true
  }

  async load(skin: OperatorSkin) {
    const generation = ++this.generation
    const source = await loadAssets(skin)
    if (this.disposed || generation !== this.generation) return false

    const texture = new spine.webgl.GLTexture(this.context, source.image, false)
    let atlas: spine.TextureAtlas | undefined
    try {
      atlas = new spine.TextureAtlas(source.atlas, () => texture)
      const binary = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas))
      const data = binary.readSkeletonData(source.binary)
      const skeleton = new spine.Skeleton(data)
      const stateData = new spine.AnimationStateData(data)
      stateData.defaultMix = 0.18
      const state = new spine.AnimationState(stateData)
      state.setAnimation(0, 'Relax', true)
      state.apply(skeleton)
      skeleton.updateWorldTransform()
      const offset = new spine.Vector2()
      const size = new spine.Vector2()
      skeleton.getBounds(offset, size, [])
      if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('Invalid operator bounds')

      let bounds = animationBounds.get(skin.id)
      if (!bounds) {
        bounds = measureHorizontalBounds(data)
        animationBounds.set(skin.id, bounds)
      }
      this.model?.atlas.dispose()
      this.model = { skin, atlas, skeleton, state, idleHeight: size.y, idleFloor: offset.y, bounds }
      this.floor = this.targetFloor = offset.y
      this.action = 'Relax'
      this.previousBounds = null
      this.mixRemaining = 0
      return true
    } catch (error) {
      if (atlas) atlas.dispose()
      else texture.dispose()
      throw error
    }
  }

  setAction(action: OperatorAction, immediate = false) {
    const model = this.model
    if (!model) return 0
    const animation = model.skeleton.data.findAnimation(action)
    if (!animation) return 0
    const outgoing = model.bounds[this.action]
    this.previousBounds = immediate || !outgoing ? null : this.previousBounds
      ? { min: Math.min(outgoing.min, this.previousBounds.min), max: Math.max(outgoing.max, this.previousBounds.max) }
      : outgoing
    this.mixRemaining = immediate ? 0 : model.state.data.defaultMix
    this.action = action
    if (immediate) {
      model.state.clearTracks()
      model.skeleton.setToSetupPose()
    }
    model.state.setAnimation(0, action, action !== 'Interact' && action !== 'Special')
    // Sleep rests its body on the surface; Sit anchors its seat there instead.
    this.targetFloor = model.skin.floor[action] ?? model.idleFloor
    if (immediate) this.floor = this.targetFloor
    return animation.duration
  }

  /** Current animation envelope in CSS pixels, relative to the character center. */
  getHorizontalBounds(facing: number): HorizontalBounds {
    const model = this.model
    if (!model) return { min: -36, max: 36 }
    const active = model.bounds[this.action]
    if (!active) return { min: -36, max: 36 }
    const previous = this.previousBounds
    const min = previous ? Math.min(active.min, previous.min) : active.min
    const max = previous ? Math.max(active.max, previous.max) : active.max
    const scale = this.bodyHeight / model.idleHeight
    // Sampling at 60Hz plus a 2px guard keeps subpixel outlines inside the scene.
    return facing < 0 ? { min: -max * scale - 2, max: -min * scale + 2 }
      : { min: min * scale - 2, max: max * scale + 2 }
  }

  resize(width: number, height: number, bodyHeight: number, ground = 4) {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.bodyHeight = bodyHeight
    this.ground = ground
    // A small supersampled scene preserves fine outlines when the 400px model
    // is displayed at ~80px, including on standard-density desktop screens.
    const ratio = 2
    const pixelWidth = Math.round(this.width * ratio)
    const pixelHeight = Math.round(this.height * ratio)
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth
      this.canvas.height = pixelHeight
    }
    this.matrix.ortho2d(0, 0, this.width, this.height)
  }

  draw(delta: number, center: number, facing: number) {
    if (this.disposed || !this.model) return
    const { gl, model } = this
    const scale = this.bodyHeight / model.idleHeight
    this.floor += (this.targetFloor - this.floor) * (1 - Math.exp(-delta * 18))
    model.state.update(delta)
    model.state.apply(model.skeleton)
    model.skeleton.scaleX = scale * facing
    model.skeleton.scaleY = scale
    model.skeleton.x = center
    model.skeleton.y = this.ground - this.floor * scale
    model.skeleton.updateWorldTransform()
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    this.shader.bind()
    this.shader.setUniformi(spine.webgl.Shader.SAMPLER, 0)
    this.shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, this.matrix.values)
    this.batcher.begin(this.shader)
    this.skeletonRenderer.draw(this.batcher, model.skeleton)
    this.batcher.end()
    this.shader.unbind()
    this.mixRemaining = Math.max(0, this.mixRemaining - delta)
    if (!this.mixRemaining) this.previousBounds = null
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.generation++
    this.model?.state.clearListeners()
    this.model?.atlas.dispose()
    this.model = null
    this.batcher.dispose()
    this.shader.dispose()
  }
}
