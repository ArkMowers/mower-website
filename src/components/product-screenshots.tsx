import { useEffect } from 'react'
import type { Theme } from '@/lib/theme'

const previewSizes = '(max-width: 1280px) 92vw, 1180px'
const previews = {
  light: { width: 1924, height: 1084, label: '亮色' },
  dark: { width: 1920, height: 1080, label: '暗色' },
}

function previewSource(theme: Theme) {
  const src = `/images/mower-screenshot-${theme}-clean.webp`
  return { src, srcSet: `/images/mower-screenshot-${theme}-clean-960.webp 960w, ${src} ${previews[theme].width}w` }
}

export function ProductPreview({ theme }: { theme: Theme }) {
  const image = previews[theme]
  const source = previewSource(theme)

  useEffect(() => {
    // Warm the other theme's image without blocking the current main preview.
    const alternate = new Image()
    const other = previewSource(theme === 'light' ? 'dark' : 'light')
    alternate.sizes = previewSizes
    alternate.srcset = other.srcSet
    alternate.src = other.src
  }, [theme])

  return (
    <figure className="stage-window" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
      <img
        {...source}
        sizes={previewSizes}
        alt={`Mower 明日方舟长草助手 ${image.label}运行界面`}
        width={image.width}
        height={image.height}
        fetchPriority="high"
      />
    </figure>
  )
}

export function ScheduleBackdrop({ theme }: { theme: Theme }) {
  const src = `/images/mower-schedule-${theme}.webp`
  return (
    <div className="schedule-backdrop" aria-hidden="true">
      <img
        src={src}
        srcSet={`/images/mower-schedule-${theme}-960.webp 960w, ${src} 1470w`}
        sizes="(max-width: 560px) 140vw, (max-width: 1280px) 110vw, 1240px"
        width="1470"
        height="700"
        alt=""
        decoding="async"
        fetchPriority="low"
      />
    </div>
  )
}
