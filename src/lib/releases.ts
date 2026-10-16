export const RELEASES_URL = 'https://github.com/ArkMowers/arknights-mower/releases'
export const ANDROID_RELEASES_URL = 'https://github.com/ALEXsun0/arknights-mower-android/releases'
const DESKTOP_REPO = 'ArkMowers/arknights-mower'
const ANDROID_REPO = 'ALEXsun0/arknights-mower-android'
const releasesApi = (repo: string) => `https://api.github.com/repos/${repo}/releases?per_page=100`

export type DownloadPlatform = 'windows' | 'macos' | 'linux' | 'android'
export type DownloadArchitecture = 'x64' | 'arm64' | 'x86' | 'universal' | 'unspecified'

export const DOWNLOAD_PLATFORMS: { id: DownloadPlatform; label: string }[] = [
  { id: 'windows', label: 'Windows' },
  { id: 'macos', label: 'macOS' },
  { id: 'linux', label: 'Linux' },
  { id: 'android', label: 'Android' },
]

export interface DownloadAsset {
  id: string
  name: string
  url: string
  size: number
  platform: DownloadPlatform
  architecture: DownloadArchitecture
  format: string
  displaySize?: string
  checksum?: string
}

export interface DownloadRelease {
  id: string
  tag: string
  pageUrl: string
  publishedAt: string
  prerelease: boolean
  /** Confirmed by GitHub's /releases/latest endpoint, rather than inferred from dates. */
  isLatest?: boolean
  assets: DownloadAsset[]
}

// Packages verified against public GitHub expanded_assets pages on 2026-10-14;
// latest stable metadata rechecked against its official release page on 2026-10-16.
// Rounded sizes are exactly as displayed by GitHub; no byte counts are inferred.
export const VERIFIED_RELEASES: DownloadRelease[] = [
  {
    id: 'android-v0.2.20-dev.40', tag: 'v0.2.20-dev.40', prerelease: true,
    pageUrl: 'https://github.com/ALEXsun0/arknights-mower-android/releases/tag/v0.2.20-dev.40',
    publishedAt: '2026-10-11T08:10:39Z',
    assets: [
      {
        id: 'android-dev40-apk', platform: 'android', architecture: 'arm64', format: 'APK', size: 390081182,
        name: 'arknights-mower-android-v0.2.20-dev.40-arm64.apk',
        url: 'https://github.com/ALEXsun0/arknights-mower-android/releases/download/v0.2.20-dev.40/arknights-mower-android-v0.2.20-dev.40-arm64.apk',
        checksum: 'f9c6efd716bada37493904c3884d108f2eabdaacf3a1007f5afea7ae093d1286',
      },
    ],
  },
  {
    id: 'android-v0.2.19', tag: 'v0.2.19', prerelease: false,
    pageUrl: 'https://github.com/ALEXsun0/arknights-mower-android/releases/tag/v0.2.19',
    publishedAt: '2026-10-10T11:19:24Z',
    assets: [
      {
        id: 'android-0219-apk', platform: 'android', architecture: 'arm64', format: 'APK', size: 389504566,
        name: 'arknights-mower-android-v0.2.19-arm64.apk',
        url: 'https://github.com/ALEXsun0/arknights-mower-android/releases/download/v0.2.19/arknights-mower-android-v0.2.19-arm64.apk',
        checksum: '9caaa7ead0aeb3d4572175ea700824b050c286a71a30321e0fba3060584fdd9c',
      },
    ],
  },
  {
    id: 'v4.1.5', tag: 'v4.1.5', prerelease: false,
    pageUrl: 'https://github.com/ArkMowers/arknights-mower/releases/tag/v4.1.5',
    publishedAt: '2026-04-08T15:38:59Z',
    // GitHub supplies source archives only; preserve the release without inventing a package.
    assets: [],
  },
  {
    id: 'v4.1.6-alpha.12', tag: 'v4.1.6-alpha.12', prerelease: true,
    pageUrl: 'https://github.com/ArkMowers/arknights-mower/releases/tag/v4.1.6-alpha.12',
    publishedAt: '2026-10-10T11:12:05Z',
    assets: [
      {
        id: 'alpha12-windows-x64', platform: 'windows', architecture: 'x64', format: 'ZIP', size: 0, displaySize: '132 MB',
        name: 'arknights-mower_4.1.6-alpha.12_windows_x64.zip',
        url: 'https://github.com/ArkMowers/arknights-mower/releases/download/v4.1.6-alpha.12/arknights-mower_4.1.6-alpha.12_windows_x64.zip',
        checksum: '52841d714270a009a8864ea33e98c5ee4a4401fefb34417c37f6cda78b191b1d',
      },
      {
        id: 'alpha12-macos-arm64', platform: 'macos', architecture: 'arm64', format: 'DMG', size: 0, displaySize: '211 MB',
        name: 'arknights-mower_4.1.6-alpha.12_macos_arm64.dmg',
        url: 'https://github.com/ArkMowers/arknights-mower/releases/download/v4.1.6-alpha.12/arknights-mower_4.1.6-alpha.12_macos_arm64.dmg',
        checksum: 'cd964757d9f0cb0b76c1fe141ffc82a81d92d47620719187ed9c69081b8e3a3b',
      },
      {
        id: 'alpha12-linux-x64', platform: 'linux', architecture: 'x64', format: 'TAR.GZ', size: 0, displaySize: '227 MB',
        name: 'arknights-mower_4.1.6-alpha.12_linux_x64.tar.gz',
        url: 'https://github.com/ArkMowers/arknights-mower/releases/download/v4.1.6-alpha.12/arknights-mower_4.1.6-alpha.12_linux_x64.tar.gz',
        checksum: '2f1912d0f5e495c4a53900e0d56f8b63116c6d857ab9399e0fa2e5bd56ba5aa8',
      },
      {
        id: 'alpha12-linux-arm64', platform: 'linux', architecture: 'arm64', format: 'TAR.GZ', size: 0, displaySize: '200 MB',
        name: 'arknights-mower_4.1.6-alpha.12_linux_arm64.tar.gz',
        url: 'https://github.com/ArkMowers/arknights-mower/releases/download/v4.1.6-alpha.12/arknights-mower_4.1.6-alpha.12_linux_arm64.tar.gz',
        checksum: '75a2cf0fcaa8157c0104506e16e32107cddfcac132c294863ac879d5c3501efd',
      },
      {
        id: 'alpha12-android-arm64', platform: 'android', architecture: 'arm64', format: 'ZIP', size: 0, displaySize: '181 MB',
        name: 'arknights-mower_4.1.6-alpha.12_android_arm64.zip',
        url: 'https://github.com/ArkMowers/arknights-mower/releases/download/v4.1.6-alpha.12/arknights-mower_4.1.6-alpha.12_android_arm64.zip',
        checksum: '4ed20bcc77b1025bbfd20d545f30bec9ece65c6e19031ed1c847aec9aedb5d76',
      },
    ],
  },
  {
    id: 'v4.1.6-alpha.11', tag: 'v4.1.6-alpha.11', prerelease: true,
    pageUrl: 'https://github.com/ArkMowers/arknights-mower/releases/tag/v4.1.6-alpha.11',
    publishedAt: '2026-10-09T05:24:54Z',
    assets: [
      {
        id: 'alpha11-windows-x64', platform: 'windows', architecture: 'x64', format: 'ZIP', size: 0, displaySize: '132 MB',
        name: 'arknights-mower_4.1.6-alpha.11_windows_x64.zip',
        url: 'https://github.com/ArkMowers/arknights-mower/releases/download/v4.1.6-alpha.11/arknights-mower_4.1.6-alpha.11_windows_x64.zip',
        checksum: '9411994e3574ead86c9e2ce7bde7f1476954a7bdcab4f076e7e6e9982bac83fe',
      },
      {
        id: 'alpha11-macos-arm64', platform: 'macos', architecture: 'arm64', format: 'DMG', size: 0, displaySize: '202 MB',
        name: 'arknights-mower_4.1.6-alpha.11_macos_arm64.dmg',
        url: 'https://github.com/ArkMowers/arknights-mower/releases/download/v4.1.6-alpha.11/arknights-mower_4.1.6-alpha.11_macos_arm64.dmg',
        checksum: '2062778978b35eb697b280a9ac8cdd1d5a905b5fb96db17ea5ba9ada2b9c42ca',
      },
      {
        id: 'alpha11-macos-x64', platform: 'macos', architecture: 'x64', format: 'DMG', size: 0, displaySize: '233 MB',
        name: 'arknights-mower_4.1.6-alpha.11_macos_x64.dmg',
        url: 'https://github.com/ArkMowers/arknights-mower/releases/download/v4.1.6-alpha.11/arknights-mower_4.1.6-alpha.11_macos_x64.dmg',
        checksum: 'ac60705f6f226078c6ba8a4dbf95a33014e83bddfa48afdb27add307c1990782',
      },
      {
        id: 'alpha11-linux-x64', platform: 'linux', architecture: 'x64', format: 'TAR.GZ', size: 0, displaySize: '227 MB',
        name: 'arknights-mower_4.1.6-alpha.11_linux_x64.tar.gz',
        url: 'https://github.com/ArkMowers/arknights-mower/releases/download/v4.1.6-alpha.11/arknights-mower_4.1.6-alpha.11_linux_x64.tar.gz',
        checksum: '4c905f9c29f13b37595b1f4300d83e1f077e3bcea3a50565429ad0b80c3df6f7',
      },
      {
        id: 'alpha11-linux-arm64', platform: 'linux', architecture: 'arm64', format: 'TAR.GZ', size: 0, displaySize: '199 MB',
        name: 'arknights-mower_4.1.6-alpha.11_linux_arm64.tar.gz',
        url: 'https://github.com/ArkMowers/arknights-mower/releases/download/v4.1.6-alpha.11/arknights-mower_4.1.6-alpha.11_linux_arm64.tar.gz',
        checksum: 'aa3def54fe9ab19bb1ef925d094fdaca61530f6a43faeb7eef143c95edaa229e',
      },
      {
        id: 'alpha11-android-arm64', platform: 'android', architecture: 'arm64', format: 'ZIP', size: 0, displaySize: '181 MB',
        name: 'arknights-mower_4.1.6-alpha.11_android_arm64.zip',
        url: 'https://github.com/ArkMowers/arknights-mower/releases/download/v4.1.6-alpha.11/arknights-mower_4.1.6-alpha.11_android_arm64.zip',
        checksum: '465b242e4dd3113107d18379153f85446ba5831e89e52398ee0172ead02d88eb',
      },
    ],
  },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isReleaseUrl(value: unknown, repo: string, asset = false): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    const prefix = `/${repo}/releases/${asset ? 'download' : 'tag'}/`
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.startsWith(prefix)
  } catch {
    return false
  }
}

function readAsset(value: unknown, repo: string): DownloadAsset | null {
  if (!isRecord(value) || typeof value.name !== 'string' || !isReleaseUrl(value.browser_download_url, repo, true)) return null
  const name = value.name.toLowerCase()
  const platform: DownloadPlatform | undefined = /(?:^|[_\-.])windows(?:[_\-.]|$)|(?:^|[_\-.])win(?:32|64)?(?:[_\-.]|$)/.test(name) ? 'windows'
    : /(?:^|[_\-.])(?:macos|darwin|osx)(?:[_\-.]|$)/.test(name) ? 'macos'
      : /(?:^|[_\-.])linux(?:[_\-.]|$)/.test(name) ? 'linux'
        : /(?:^|[_\-.])android(?:[_\-.]|$)/.test(name) || name.endsWith('.apk') ? 'android' : undefined
  const format = name.match(/\.(tar\.gz|tar\.xz|zip|rar|7z|dmg|exe|msi|appimage|deb|rpm|apk)$/)?.[1]
  if (!platform || !format) return null
  const architecture: DownloadArchitecture = /(?:^|[_\-.])(?:arm64|aarch64)(?:[_\-.]|$)/.test(name) ? 'arm64'
    : /(?:^|[_\-.])(?:x64|x86_64|amd64)(?:[_\-.]|$)/.test(name) ? 'x64'
      : /(?:^|[_\-.])(?:x86|ia32|i686)(?:[_\-.]|$)/.test(name) ? 'x86'
        : /(?:^|[_\-.])universal(?:[_\-.]|$)/.test(name) ? 'universal'
          // Stable Windows packages (e.g. v4.1.2_Windows.rar) omit the arch; they have only ever been x64
          : platform === 'windows' ? 'x64' : 'unspecified'
  return {
    id: String(value.id ?? value.name),
    name: value.name,
    url: value.browser_download_url,
    size: typeof value.size === 'number' && Number.isFinite(value.size) ? Math.max(0, value.size) : 0,
    platform,
    architecture,
    format: format.toUpperCase(),
    checksum: typeof value.digest === 'string' && /^sha256:[a-f0-9]{64}$/i.test(value.digest) ? value.digest.slice(7) : undefined,
  }
}

/** Keep release metadata even when GitHub has no supported installation packages. */
export function parseReleases(value: unknown, repo = DESKTOP_REPO): DownloadRelease[] {
  if (!Array.isArray(value)) throw new Error('GitHub returned an invalid release list')
  return value.flatMap((release): DownloadRelease[] => {
    if (!isRecord(release) || release.draft || typeof release.tag_name !== 'string'
      || !isReleaseUrl(release.html_url, repo) || !Array.isArray(release.assets)) return []
    const assets = release.assets.map((asset) => readAsset(asset, repo)).filter((asset): asset is DownloadAsset => asset !== null)
    return [{
      id: release.tag_name,
      tag: release.tag_name,
      pageUrl: release.html_url,
      publishedAt: typeof release.published_at === 'string' ? release.published_at : '',
      prerelease: release.prerelease === true,
      assets,
    }]
  }).sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
}

let releaseCache: { releases: DownloadRelease[]; fetchedAt: number } | undefined

async function fetchRepo(repo: string, signal: AbortSignal): Promise<DownloadRelease[]> {
  const request = async (latest: boolean) => {
    const url = latest ? `https://api.github.com/repos/${repo}/releases/latest` : releasesApi(repo)
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, signal })
    if (!response.ok) throw new Error(`GitHub releases request failed: ${response.status}`)
    const data: unknown = await response.json()
    return parseReleases(latest ? [data] : data, repo)
  }
  // Frequent prereleases can push the current stable beyond the first 100 entries.
  const [list, latest] = await Promise.allSettled([request(false), request(true)])
  if (list.status === 'rejected' && latest.status === 'rejected') throw list.reason
  const fallback = VERIFIED_RELEASES.filter(release => release.pageUrl.startsWith(`https://github.com/${repo}/releases/tag/`))
  const entries = list.status === 'fulfilled' && list.value.length ? list.value : fallback
  const stable = latest.status === 'fulfilled'
    ? latest.value.filter(release => !release.prerelease).map(release => ({ ...release, isLatest: true }))
    : []
  return [...new Map([
    ...fallback.filter(release => !release.prerelease),
    ...entries,
    ...stable,
  ].map(release => [release.pageUrl, release])).values()]
}

/**
 * Desktop and Android builds live in separate repositories. A repository that
 * fails to load keeps its verified fallback entries instead of disappearing.
 */
export async function fetchReleases(signal: AbortSignal): Promise<DownloadRelease[]> {
  if (releaseCache && Date.now() - releaseCache.fetchedAt < 5 * 60 * 1000) return releaseCache.releases
  const [desktop, android] = await Promise.allSettled([fetchRepo(DESKTOP_REPO, signal), fetchRepo(ANDROID_REPO, signal)])
  const isAndroidRelease = (release: DownloadRelease) => release.pageUrl.includes(`/${ANDROID_REPO}/`)
  const pick = (result: PromiseSettledResult<DownloadRelease[]>, fallback: DownloadRelease[]) =>
    result.status === 'fulfilled' && result.value.length ? result.value : fallback
  const releases = [
    ...pick(desktop, VERIFIED_RELEASES.filter((release) => !isAndroidRelease(release))),
    ...pick(android, VERIFIED_RELEASES.filter(isAndroidRelease)),
  ].sort((x, y) => (Date.parse(y.publishedAt) || 0) - (Date.parse(x.publishedAt) || 0))
  if (desktop.status === 'rejected' && android.status === 'rejected') throw desktop.reason
  releaseCache = { releases, fetchedAt: Date.now() }
  return releases
}

export function detectPlatform(): DownloadPlatform | null {
  if (typeof navigator === 'undefined') return null
  const platform = `${navigator.platform} ${navigator.userAgent}`
  if (/android/i.test(platform)) return 'android'
  if (/iPhone|iPad|iPod/i.test(platform)) return null
  if (/win/i.test(platform)) return 'windows'
  if (/mac/i.test(platform)) return 'macos'
  if (/linux/i.test(platform)) return 'linux'
  return null
}

export function architectureLabel(architecture: DownloadArchitecture, platform: DownloadPlatform): string {
  if (platform === 'macos') {
    if (architecture === 'arm64') return 'Apple 芯片 · ARM64'
    if (architecture === 'x64') return 'Intel 芯片 · x64'
    if (architecture === 'universal') return 'Apple / Intel 通用'
  }
  return { x64: 'Intel / AMD · x64', arm64: 'ARM64', x86: '32 位 · x86', universal: '通用架构', unspecified: '架构见发行说明' }[architecture]
}

export function formatAssetSize(bytes: number): string {
  if (bytes <= 0) return '大小见发行页面'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes / (1024 * 1024))} MB`
}
