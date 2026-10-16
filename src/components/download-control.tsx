import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ANDROID_RELEASES_URL, RELEASES_URL, VERIFIED_RELEASES, fetchReleases, formatAssetSize } from '@/lib/releases'
import type { DownloadArchitecture, DownloadAsset, DownloadPlatform, DownloadRelease } from '@/lib/releases'
import { detectDevice, detectDeviceSync } from '@/lib/device'
import type { DetectedDevice } from '@/lib/device'

export type Channel = 'stable' | 'beta'

export interface DownloadTarget {
  id: string
  platform: DownloadPlatform
  architecture: DownloadArchitecture
  os: string
  arch: string
  hint: string
  /** Android ships a first-install APK and an in-app hot-update ZIP */
  kind?: 'apk' | 'update'
}

export const TARGETS: DownloadTarget[] = [
  { id: 'windows-x64', platform: 'windows', architecture: 'x64', os: 'Windows', arch: 'x64', hint: '适用于绝大多数 Windows 电脑' },
  { id: 'macos-arm64', platform: 'macos', architecture: 'arm64', os: 'macOS', arch: 'Apple 芯片', hint: 'M1 及之后的 Mac' },
  { id: 'macos-x64', platform: 'macos', architecture: 'x64', os: 'macOS', arch: 'Intel 芯片', hint: '2020 年及更早的 Mac' },
  { id: 'linux-x64', platform: 'linux', architecture: 'x64', os: 'Linux', arch: 'x64', hint: '常见台式机与笔记本' },
  { id: 'linux-arm64', platform: 'linux', architecture: 'arm64', os: 'Linux', arch: 'ARM64', hint: '树莓派、ARM 服务器' },
  { id: 'android-apk', platform: 'android', architecture: 'arm64', os: 'Android', arch: 'APK', hint: '首次安装请选这个', kind: 'apk' },
  { id: 'android-update', platform: 'android', architecture: 'arm64', os: 'Android', arch: '更新包', hint: '已安装后在应用内导入', kind: 'update' },
]

const CHANNEL_LABEL: Record<Channel, string> = { stable: '正式版', beta: '测试版' }

export interface ResolvedDownload {
  asset?: DownloadAsset
  release: DownloadRelease
}

export function resolveDownload(releases: DownloadRelease[], target: DownloadTarget, channel: Channel): ResolvedDownload | undefined {
  const repoUrl = fallbackUrl(target)
  const candidates = releases.filter(release => release.prerelease === (channel === 'beta') && release.pageUrl.startsWith(`${repoUrl}/tag/`))
    .sort((a, b) => (Number(b.isLatest === true) - Number(a.isLatest === true))
      || (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
  for (const release of candidates) {
    const asset = release.assets.find(
      (item) =>
        item.platform === target.platform &&
        item.architecture === target.architecture &&
        (target.kind === undefined || (target.kind === 'apk' ? item.format === 'APK' : item.format !== 'APK')),
    )
    // Stable always means the current release. Missing packages open its release
    // page; never silently substitute an older stable or a different channel.
    if (asset || channel === 'stable') return { asset, release }
  }
  // Beta keeps older compatible architecture builds, with their actual version
  // shown in the UI. If none exist, the latest release page remains available.
  return candidates[0] ? { release: candidates[0] } : undefined
}

function fallbackUrl(target: DownloadTarget) {
  return target.platform === 'android' && target.kind === 'apk' ? ANDROID_RELEASES_URL : RELEASES_URL
}

function targetForDevice(device: DetectedDevice): DownloadTarget | undefined {
  if (!device.platform) return undefined
  if (device.platform === 'android') return TARGETS.find((t) => t.id === 'android-apk')
  return TARGETS.find((t) => t.platform === device.platform && t.architecture === device.architecture)
}

/** Prefer the current stable release, including its official release notes. */
function preferredChannel(releases: DownloadRelease[], target: DownloadTarget | undefined): Channel {
  if (!target) return 'stable'
  return resolveDownload(releases, target, 'stable') ? 'stable' : 'beta'
}

/* ---------- Data hooks ---------- */

export function useReleases() {
  const [releases, setReleases] = useState<DownloadRelease[]>(VERIFIED_RELEASES)

  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    fetchReleases(controller.signal)
      .then((data) => {
        if (!disposed && data.length > 0) setReleases(data)
      })
      .catch(() => {})
      .finally(() => window.clearTimeout(timeout))
    return () => {
      disposed = true
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  return releases
}

export function useDevice() {
  const [device, setDevice] = useState<DetectedDevice>(detectDeviceSync)
  useEffect(() => {
    let active = true
    detectDevice().then((next) => active && setDevice(next))
    return () => {
      active = false
    }
  }, [])
  return device
}

/**
 * One source of truth for the hero button and the header menu. The channel is
 * only "chosen" once the visitor touches it; until then it follows availability.
 */
export function useDownloadState(releases: DownloadRelease[]) {
  const device = useDevice()
  const target = targetForDevice(device)
  const [userChannel, setUserChannel] = useState<Channel | null>(null)
  const autoChannel = preferredChannel(releases, target)
  const channel = userChannel ?? autoChannel
  return { device, target, channel, autoChannel, setChannel: setUserChannel }
}

/* ---------- Icons ---------- */

export function PlatformIcon({ platform, size = 16 }: { platform: DownloadPlatform; size?: number }) {
  switch (platform) {
    case 'windows':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
          <path d="M3 5.557L10.371 4.5v6.862H3V5.557zm0 12.886l7.371 1.057v-6.862H3v5.805zm8.486 1.214L21 21V11.362h-9.514v8.295zM21 3l-9.514 1.343v7.019H21V3z" />
        </svg>
      )
    case 'macos':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.38c.62-.75 1.04-1.8.93-2.85-.9.04-1.99.6-2.63 1.35-.57.65-1.06 1.72-.93 2.74 1.01.08 2.03-.5 2.63-1.24z" />
        </svg>
      )
    case 'linux':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
          <path d="M12 2C9.5 2 7.5 4 7.5 6.5c0 1.2.5 2.3 1.3 3.1-.3.9-.8 2.5-.8 4.4 0 2.2 1.3 4 3 4.8-.4.5-.8 1.1-1 1.7-.5.2-1.5.5-2.2 1.1-.9.8-1 2-.2 2.4.9.4 2.4-.2 3.2-1 .7-.7 1.2-1.6 1.2-2.5.7.1 1.3.1 2 0 0 .9.5 1.8 1.2 2.5.8.8 2.3 1.4 3.2 1 .8-.4.7-1.6-.2-2.4-.7-.6-1.7-.9-2.2-1.1-.2-.6-.6-1.2-1-1.7 1.7-.8 3-2.6 3-4.8 0-1.9-.5-3.5-.8-4.4.8-.8 1.3-1.9 1.3-3.1C16.5 4 14.5 2 12 2z" />
        </svg>
      )
    case 'android':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
          <path d="M17.52 15.34c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1m-11.04 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1m11.4-6.02l2-3.46a.42.42 0 00-.15-.57.42.42 0 00-.57.15l-2.02 3.5C15.59 8.36 13.85 8 12 8s-3.59.36-5.14.95L4.84 5.45a.42.42 0 00-.57-.15.42.42 0 00-.15.57l2 3.46C2.69 11.19.34 14.66 0 18.76h24c-.34-4.1-2.69-7.57-6.12-9.44" />
        </svg>
      )
  }
}

function sizeLabel(asset: DownloadAsset) {
  return asset.displaySize ?? formatAssetSize(asset.size)
}

function shortVersion(tag: string) {
  return tag.replace(/^v?/, 'v')
}

/* ---------- Channel switch ---------- */

export function ChannelSwitch({
  releases,
  target,
  channel,
  onChange,
  size = 'md',
}: {
  releases: DownloadRelease[]
  target: DownloadTarget | undefined
  channel: Channel
  onChange: (channel: Channel) => void
  size?: 'sm' | 'md'
}) {
  const options: Channel[] = ['stable', 'beta']
  const group = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = group.current
    if (!element) return
    const onCommit = (event: Event) => {
      const value = (event as CustomEvent<{ value: string }>).detail.value
      if (value === 'stable' || value === 'beta') onChange(value)
    }
    element.addEventListener('lg:set', onCommit)
    return () => element.removeEventListener('lg:set', onCommit)
  }, [onChange])

  useEffect(() => {
    const element = group.current
    const bar = element?.querySelector<HTMLElement>('.channel-bar')
    const indicator = element?.querySelector<HTMLElement>('.channel-indicator')
    if (!element || !bar || !indicator) return
    const align = () => {
      const selected = bar.querySelector<HTMLElement>('[aria-checked="true"]')
      if (!selected) return
      indicator.style.width = `${selected.offsetWidth}px`
      indicator.style.setProperty('--lg-segment-x', `${selected.offsetLeft}px`)
      element.dispatchEvent(new Event('lg:sync', { bubbles: true }))
    }
    align()
    const observer = new ResizeObserver(align)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [channel])

  return (
    <div ref={group} className={`channel-switch channel-${size}`} data-lg-segments role="radiogroup" aria-label="版本通道" data-active={channel}>
      <div className="lg-segment-bar channel-bar">
        <span className="lg-surface lg-segment-indicator channel-indicator" data-glass="tab" aria-hidden="true" />
      {options.map((option) => {
        const available = !target || Boolean(resolveDownload(releases, target, option))
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={channel === option}
            disabled={!available}
            title={available ? undefined : `${target?.os ?? ''} 暂无${CHANNEL_LABEL[option]}`}
            className="channel-option"
            data-value={option}
            tabIndex={channel === option ? 0 : -1}
            onClick={() => onChange(option)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const buttons = Array.from(group.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
              const index = buttons.indexOf(event.currentTarget)
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
                : (index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length
              const button = buttons[next]
              if (button) {
                onChange(button.dataset.value as Channel)
                button.focus()
              }
            }}
          >
            {CHANNEL_LABEL[option]}
          </button>
        )
      })}
      </div>
    </div>
  )
}

/* ---------- Hero download ---------- */

type DownloadState = ReturnType<typeof useDownloadState>

export function HeroDownload({
  releases,
  state,
  onOpenMenu,
}: {
  releases: DownloadRelease[]
  state: DownloadState
  onOpenMenu: () => void
}) {
  const { target, channel, setChannel } = state
  const pkg = target ? resolveDownload(releases, target, channel) : undefined
  const href = pkg?.asset?.url ?? pkg?.release.pageUrl ?? (target ? fallbackUrl(target) : RELEASES_URL)
  const content = (
    <>
      <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="cta-icon" aria-hidden="true">
        <line x1="10" y1="2.5" x2="10" y2="12" />
        <polyline points="6.5 8.5 10 12 13.5 8.5" />
        <path d="M4 13.5v2a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-2" />
      </svg>
      <span>{target ? pkg?.asset ? '下载 Mower' : `查看${CHANNEL_LABEL[channel]}` : '选择版本'}</span>
      {target && (
        <>
          <span className="lens-divider" aria-hidden="true" />
          <span className="cta-target" aria-hidden="true">
            <PlatformIcon platform={target.platform} size={14} />
            <span>{target.platform === 'android' ? 'ARM64' : target.arch}</span>
          </span>
        </>
      )}
    </>
  )

  return (
    <div className="download lens-stage" data-lens-stage>
      {target ? (
        <a
          href={href}
          className="lg-surface lens-button lens-cta"
          data-glass="button"
          data-lg-drag="tether"
          aria-label={`${pkg?.asset ? '下载' : '查看'} Mower ${CHANNEL_LABEL[channel]}，${target.os} ${target.arch}${pkg ? `，${shortVersion(pkg.release.tag)}` : ''}${pkg && !pkg.asset ? '，暂无安装包，查看发布说明' : ''}`}
          title={pkg ? `${target.os} · ${target.arch} · ${shortVersion(pkg.release.tag)} · ${pkg.asset ? sizeLabel(pkg.asset) : '暂无安装包，查看发布说明'}` : undefined}
        >
          {content}
        </a>
      ) : (
        // Unknown or unsupported system (e.g. iOS): never guess, open the full list instead
        <button type="button" className="lg-surface lens-button lens-cta" data-glass="button" data-lg-drag="tether" onClick={onOpenMenu}>
          {content}
        </button>
      )}

      {target && <ChannelSwitch releases={releases} target={target} channel={channel} onChange={setChannel} />}
    </div>
  )
}

/* ---------- Header menu ---------- */

export function PlatformMenu({
  releases,
  state,
  open,
  setOpen,
}: {
  releases: DownloadRelease[]
  state: DownloadState
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { target: mine, channel, setChannel } = state
  const navRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])

  // Each row shows the build for the selected channel, or the other channel as a labelled fallback
  const rows = useMemo(
    () =>
      TARGETS.map((t) => {
        const exact = resolveDownload(releases, t, channel)
        const other: Channel = channel === 'stable' ? 'beta' : 'stable'
        const fallback = exact ? undefined : resolveDownload(releases, t, other)
        return { target: t, pkg: exact ?? fallback, channel: exact ? channel : fallback ? other : channel }
      }),
    [releases, channel],
  )

  return (
    <div className="pm" ref={navRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`nav-item pm-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="其他平台"
      >
        <span className="nav-text">其他平台</span>
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" className="pm-grid">
          <rect x="2" y="2" width="5" height="5" rx="1.4" />
          <rect x="9" y="2" width="5" height="5" rx="1.4" />
          <rect x="2" y="9" width="5" height="5" rx="1.4" />
          <rect x="9" y="9" width="5" height="5" rx="1.4" />
        </svg>
      </button>

      {open && (
        <div className="pm-panel lens-stage" data-lens-stage id={panelId} role="dialog" aria-label="选择平台与版本">
          <div className="pm-scroll">
            <div className="pm-head">
              <span className="pm-title">选择版本</span>
              <ChannelSwitch releases={releases} target={undefined} channel={channel} onChange={setChannel} size="sm" />
            </div>
            <p className="pm-channel-desc">
              {channel === 'stable' ? '正式版：显示最新发布；未附安装包时可查看发布说明。' : '测试版：抢先体验新功能，可能存在问题。'}
            </p>

            <ul className="pm-list">
              {rows.map(({ target, pkg, channel: rowChannel }) => {
                const isMine = mine?.id === target.id
                const body = (
                  <>
                    <span className="pm-icon"><PlatformIcon platform={target.platform} size={15} /></span>
                    <span className="pm-main">
                      <span className="pm-name">
                        {target.os}
                        <span className="pm-arch">{target.arch}</span>
                        {isMine && <span className="pm-mine">本机</span>}
                        {pkg && rowChannel !== channel && <span className="pm-fallback">仅{CHANNEL_LABEL[rowChannel]}</span>}
                      </span>
                      <span className="pm-hint">{pkg && !pkg.asset ? '此版本未附该平台安装包' : target.hint}</span>
                    </span>
                    <span className="pm-meta">
                      {pkg ? (
                        <>
                          <span>{shortVersion(pkg.release.tag)}</span>
                          <span>{pkg.asset ? `${pkg.asset.format} · ${sizeLabel(pkg.asset)}` : '发布说明'}</span>
                        </>
                      ) : (
                        <span>暂无{CHANNEL_LABEL[channel]}</span>
                      )}
                    </span>
                  </>
                )
                return (
                  <li key={target.id}>
                    {pkg ? (
                      <a className={`pm-row ${isMine ? 'is-mine' : ''}`} href={pkg.asset?.url ?? pkg.release.pageUrl} onClick={() => setOpen(false)}>
                        {body}
                      </a>
                    ) : (
                      <span className="pm-row is-empty" aria-disabled="true">{body}</span>
                    )}
                  </li>
                )
              })}
            </ul>

            <details className="pm-help">
              <summary>不知道怎么选？</summary>
              <ul>
                <li><b>Windows</b> 直接选 x64。Windows 11 的 ARM 设备也能运行。</li>
                <li><b>Mac</b> 点左上角苹果菜单 →「关于本机」：芯片显示 Apple M 系列选「Apple 芯片」，处理器显示 Intel 选「Intel 芯片」。</li>
                <li><b>Android</b> 第一次使用选 APK；更新包只用于已安装后在应用内导入。</li>
              </ul>
            </details>

            <a className="pm-foot" href={RELEASES_URL} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
              <span>在 GitHub 查看全部版本</span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
