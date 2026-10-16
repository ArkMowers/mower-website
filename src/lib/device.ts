import type { DownloadArchitecture, DownloadPlatform } from '@/lib/releases'

export interface DetectedDevice {
  platform: DownloadPlatform | null
  architecture: DownloadArchitecture
  /** False when we fell back to the most common architecture without evidence */
  certain: boolean
  /** Windows on ARM runs the x64 build through emulation */
  emulated?: boolean
  /** A known platform Mower does not ship for */
  unsupported?: 'ios'
}

interface UADataLike {
  platform?: string
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; bitness?: string; platform?: string }>
}

function uaData(): UADataLike | undefined {
  return (navigator as Navigator & { userAgentData?: UADataLike }).userAgentData
}

function platformFromUA(): DownloadPlatform | null {
  // The UA string is more trustworthy than navigator.platform, which some browsers freeze
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return null
  if (/Macintosh|Mac OS X/i.test(ua)) {
    // iPadOS requests desktop sites with a Mac UA; a real Mac has no touch screen
    return navigator.maxTouchPoints > 1 && /^(iPad|MacIntel)$/.test(navigator.platform) && 'ontouchend' in document ? null : 'macos'
  }
  if (/Windows/i.test(ua)) return 'windows'
  if (/Linux|X11|CrOS/i.test(ua)) return 'linux'
  const hint = uaData()?.platform ?? navigator.platform
  if (/win/i.test(hint)) return 'windows'
  if (/mac/i.test(hint)) return 'macos'
  if (/linux/i.test(hint)) return 'linux'
  return null
}

/** Safari and Firefox hide the CPU on macOS, but the GPU name reveals Apple silicon. */
function macArchFromGPU(): { architecture: DownloadArchitecture; certain: boolean } | null {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl')
    if (!gl) return null
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    if (/Apple M\d/i.test(renderer)) return { architecture: 'arm64', certain: true }
    if (/Intel|AMD|Radeon|NVIDIA/i.test(renderer)) return { architecture: 'x64', certain: true }
    // Safari reports a generic "Apple GPU" on every Mac: most likely Apple silicon, but not proven
    if (/Apple GPU/i.test(renderer)) return { architecture: 'arm64', certain: false }
  } catch {
    // fall through
  }
  return null
}

/** Synchronous best guess, used for the first paint. */
export function detectDeviceSync(): DetectedDevice {
  const platform = platformFromUA()
  const ua = navigator.userAgent
  if (platform === 'android') return { platform, architecture: 'arm64', certain: true }
  if (platform === 'windows') return { platform, architecture: 'x64', certain: /Win64|WOW64|x64/i.test(ua) }
  if (platform === 'linux') {
    if (/aarch64|arm64|armv8/i.test(ua)) return { platform, architecture: 'arm64', certain: true }
    return { platform, architecture: 'x64', certain: /x86_64|amd64/i.test(ua) }
  }
  if (platform === 'macos') return { platform, architecture: 'arm64', certain: false }
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1 && 'ontouchend' in document)
  return { platform: null, architecture: 'unspecified', certain: false, unsupported: ios ? 'ios' : undefined }
}

/** Refines the guess with Client Hints (Chromium) and the GPU name (macOS). */
export async function detectDevice(): Promise<DetectedDevice> {
  const base = detectDeviceSync()
  if (!base.platform || base.platform === 'android') return base

  try {
    const hints = await uaData()?.getHighEntropyValues?.(['architecture', 'bitness'])
    if (hints?.architecture) {
      const arm = /arm/i.test(hints.architecture)
      if (base.platform === 'windows') return { platform: 'windows', architecture: 'x64', certain: true, emulated: arm }
      return { ...base, architecture: arm ? 'arm64' : 'x64', certain: true }
    }
  } catch {
    // Client Hints unavailable
  }

  if (base.platform === 'macos') {
    const gpu = macArchFromGPU()
    if (gpu) return { platform: 'macos', ...gpu }
  }
  return base
}
