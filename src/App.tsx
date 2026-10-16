import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'
import { HeroDownload, PlatformMenu, useDownloadState, useReleases } from '@/components/download-control'
import { LightField } from '@/components/light-field'
import { OperatorStage } from '@/components/operator-stage/operator-stage'
import { SiteFooter } from '@/components/site-footer'
import { ThemeToggle } from '@/components/theme-toggle'
import { ProductPreview, ScheduleBackdrop } from '@/components/product-screenshots'
import { INITIAL_THEME, applyTheme, persistTheme } from '@/lib/theme'
import { useLensMaterial } from '@/lib/use-lens-material'
import './App.css'

gsap.registerPlugin(SplitText, useGSAP)

const DOCS_URL = 'https://arkmowers.github.io/arknights-mower/'
const GITHUB_URL = 'https://github.com/ArkMowers/arknights-mower'

/* Bespoke GitHub Octocat SVG */
function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  )
}

/* Bespoke Documentation / Tech Manual SVG */
function DocsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h10" />
      <path d="M6 10h10" />
      <path d="M6 14h6" />
    </svg>
  )
}

/* Bespoke GitHub Octicon Star SVG */
function StarIcon({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true" className="star-icon">
      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" />
    </svg>
  )
}

function useGitHubStars(repo = 'ArkMowers/arknights-mower', fallback = 703) {
  const [stars, setStars] = useState<number>(() => {
    try {
      const cached = sessionStorage.getItem(`gh_stars_${repo}`)
      if (cached) {
        const parsed = parseInt(cached, 10)
        if (!isNaN(parsed) && parsed > 0) return parsed
      }
    } catch {
      // sessionStorage unavailable
    }
    return fallback
  })

  useEffect(() => {
    let active = true

    async function fetchStars() {
      // 1. Try shields.io first (no GitHub IP rate limit, reliable CDN)
      try {
        const res = await fetch(`https://img.shields.io/github/stars/${repo}.json`)
        if (res.ok) {
          const data = await res.json()
          const count = parseInt(String(data.value || data.message).replace(/[^0-9]/g, ''), 10)
          if (active && !isNaN(count) && count > 0) {
            setStars(count)
            try {
              sessionStorage.setItem(`gh_stars_${repo}`, String(count))
            } catch {
              // ignore
            }
            return
          }
        }
      } catch {
        // continue to direct GitHub API
      }

      // 2. Direct GitHub API fallback
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}`)
        if (res.ok) {
          const data = await res.json()
          if (active && typeof data?.stargazers_count === 'number') {
            setStars(data.stargazers_count)
            try {
              sessionStorage.setItem(`gh_stars_${repo}`, String(data.stargazers_count))
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // gracefully keep existing fallback
      }
    }

    fetchStars()

    return () => {
      active = false
    }
  }, [repo])

  return stars
}

function App() {
  const [theme, setTheme] = useState(INITIAL_THEME)
  const [motionActive, setMotionActive] = useState(() => document.visibilityState === 'visible')
  const releases = useReleases()
  const download = useDownloadState(releases)
  const [menuOpen, setMenuOpen] = useState(false)
  const stars = useGitHubStars()
  const scope = useRef<HTMLDivElement>(null)
  useLensMaterial(scope, theme)

  useLayoutEffect(() => applyTheme(theme), [theme])

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    persistTheme(next)
    setTheme(next)
  }

  useEffect(() => {
    const syncVisibility = () => setMotionActive(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', syncVisibility)
    return () => document.removeEventListener('visibilitychange', syncVisibility)
  }, [])

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const split = SplitText.create('.hero-title', { type: 'chars', charsClass: 'char', mask: 'chars' })
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
        const syncLenses = () => scope.current?.dispatchEvent(new Event('mower:lens-layout'))
        const settleControls = (selector: string, clearProps: string) => {
          gsap.set(selector, { clearProps })
          syncLenses()
        }

        // Animate parents, preserving each glass surface's own spring transform.
        // Opacity keeps native controls and their viewport GPU leases active.
        tl.from('.site-header-inner', { opacity: 0.12, top: 10, duration: 1.1,
            onUpdate: syncLenses, onComplete: () => settleControls('.site-header-inner', 'top,opacity') }, 0.05)
          .from(split.chars, { yPercent: 110, duration: 1.5, stagger: 0.035 }, 0.3)
          .from('.schedule-backdrop', { opacity: 0, duration: 1.8,
            onComplete: () => gsap.set('.schedule-backdrop', { clearProps: 'opacity' }) }, 0.45)
          .from('.hero-tagline', { autoAlpha: 0, y: 12, filter: 'blur(8px)', duration: 1.4 }, 0.75)
          .from('.hero-summary', { autoAlpha: 0, y: 10, filter: 'blur(8px)', duration: 1.4 }, 0.9)
          .from('.hero-action-row', { opacity: 0.08, y: 12, duration: 1.2,
            onUpdate: syncLenses, onComplete: () => settleControls('.hero-action-row', 'transform,opacity') }, 0.7)
          .from('.stage', { autoAlpha: 0, y: 70, scale: 0.94, filter: 'blur(18px)', duration: 2.4 }, 0.55)

        return () => split.revert()
      })
    },
    { scope },
  )

  return (
    <div ref={scope} className="site-shell" data-theme={theme} data-motion={motionActive ? 'running' : 'paused'}>
      <LightField theme={theme} />

      <a className="skip-link" href="#main-content">跳至主要内容</a>

      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href="/" aria-label="Mower 首页">
            <img src="/brand/mower-logo-original.png" width="42" height="42" alt="" className="brand-logo" />
            <span className="brand-rule" aria-hidden="true" />
            <span className="brand-type">
              <span className="brand-name">Mower</span>
              <span className="brand-sub">Arknights</span>
            </span>
          </a>

          <nav className="header-nav lens-stage" aria-label="主要导航" data-lens-stage>
            <PlatformMenu releases={releases} state={download} open={menuOpen} setOpen={setMenuOpen} />

            <a className="nav-item docs-nav" href={DOCS_URL} target="_blank" rel="noreferrer" aria-label="使用文档" title="使用文档">
              <DocsIcon size={15} />
              <span className="nav-text">使用文档</span>
            </a>

            <ThemeToggle theme={theme} onToggle={toggleTheme} />

            <a className="lg-surface lens-button lens-pill github-nav" data-glass="button" data-lg-drag="tether" href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label={`GitHub 仓库，当前 ${stars} 颗星`} title={`GitHub (${stars} stars)`}>
              <GithubIcon size={15} />
              <span className="nav-text">GitHub</span>
              <span className="lens-divider" aria-hidden="true" />
              <StarIcon size={12} />
              <span className="github-stars" aria-hidden="true">{stars.toLocaleString()}</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="hero" id="main-content" tabIndex={-1}>
        <div className="hero-copy">
          <div className="hero-heading">
            <ScheduleBackdrop theme={theme} />
            <h1 className="hero-title">Arknights Mower</h1>
          </div>
          <p className="hero-tagline">明日方舟 长草助手</p>
          <p className="hero-summary">
            支持基建跑单、动态换班、自动专精与全自动清日常，省心托管方舟长草期。全平台原生编译，开箱即用。
          </p>
          <div className="hero-action-row">
            <HeroDownload releases={releases} state={download} onOpenMenu={() => setMenuOpen(true)} />
          </div>
        </div>

        <div className="stage">
          <OperatorStage theme={theme} />
          <ProductPreview theme={theme} />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

export default App
