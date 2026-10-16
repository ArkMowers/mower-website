import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const root = fileURLToPath(new URL('../', import.meta.url))
const outputDirectory = path.join(root, '.taste-skill', 'releases')
const desktopRepo = 'ArkMowers/arknights-mower'
const androidRepo = 'ALEXsun0/arknights-mower-android'
const desktopPage = tag => `https://github.com/${desktopRepo}/releases/tag/${tag}`
const githubRelease = (tag, { assets = [], prerelease = false, published = '2026-10-01T00:00:00Z', repo = desktopRepo } = {}) => ({
  tag_name: tag, html_url: `https://github.com/${repo}/releases/tag/${tag}`,
  published_at: published, prerelease, draft: false,
  assets: assets.map((name, index) => ({
    id: index + 1, name, size: 100,
    browser_download_url: `https://github.com/${repo}/releases/download/${tag}/${name}`,
  })),
})
const stable415 = githubRelease('v4.1.5', { published: '2026-04-08T15:38:59Z' })
const stable412 = githubRelease('v4.1.2', { published: '2026-01-09T00:00:00Z', assets: ['v4.1.2_Windows.rar'] })
const beta12 = githubRelease('v4.1.6-alpha.12', { published: '2026-10-10T00:00:00Z', prerelease: true, assets: ['mower_macos_arm64.dmg', 'mower_windows_x64.zip', 'mower_android_arm64.zip'] })
const beta11 = githubRelease('v4.1.6-alpha.11', { published: '2026-10-09T00:00:00Z', prerelease: true, assets: ['mower_macos_x64.dmg'] })
const androidStable = githubRelease('v0.2.19', { repo: androidRepo, published: '2026-10-10T00:00:00Z', assets: ['mower_android_arm64.apk'] })
const summary = { checks: [] }
let moduleNumber = 0

async function freshReleases() {
  return import(`${pathToFileURL(path.join(runtimeDirectory, 'releases.mjs'))}?case=${moduleNumber++}`)
}

async function withMockFetch(handler, run) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input, options) => {
    const url = String(input)
    calls.push(url)
    assert.equal(options.headers.Accept, 'application/vnd.github+json')
    assert.ok(options.signal instanceof AbortSignal)
    const { status = 200, json } = handler(url)
    return Response.json(json ?? { message: 'Fixture request failure' }, { status })
  }
  try { return await run(calls) } finally { globalThis.fetch = original }
}

function standardResponse(url) {
  const latest = url.endsWith('/latest')
  return { json: url.includes(`/${androidRepo}/`) ? latest ? androidStable : [androidStable]
    : latest ? stable415 : [stable415, stable412, beta12, beta11] }
}

function rowLinks(markup) {
  return [...markup.matchAll(/<a\b[^>]*>/g)]
    .map(match => match[0])
    .filter(tag => /class="pm-row(?:\s|")/.test(tag))
    .map(tag => ({ href: tag.match(/href="([^"]+)"/)?.[1], tag }))
}

async function check(name, run) {
  try {
    await run()
    summary.checks.push({ name, passed: true })
    console.log(`PASS ${name}`)
  } catch (error) {
    summary.checks.push({ name, passed: false, error: error.message })
    console.error(`FAIL ${name}: ${error.message}`)
  }
}

// Transpile the actual source files without changing their business logic. Native
// ESM loading avoids Vite 8's Windows SSR/CommonJS package-resolution issue.
const runtimeDirectory = path.join(outputDirectory, 'runtime')
await mkdir(runtimeDirectory, { recursive: true })
for (const [source, target] of [
  ['src/lib/releases.ts', 'releases.mjs'],
  ['src/lib/device.ts', 'device.mjs'],
  ['src/components/download-control.tsx', 'download-control.mjs'],
]) {
  const input = await readFile(path.join(root, source), 'utf8')
  const transformed = ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    fileName: source,
  }).outputText.replaceAll("'@/lib/releases'", "'./releases.mjs'").replaceAll("'@/lib/device'", "'./device.mjs'")
  await writeFile(path.join(runtimeDirectory, target), transformed)
}
try {
  const releases = await import(pathToFileURL(path.join(runtimeDirectory, 'releases.mjs')))
  const download = await import(pathToFileURL(path.join(runtimeDirectory, 'download-control.mjs')))
  const windows = download.TARGETS.find(target => target.id === 'windows-x64')
  await check('assetless latest stable release survives parsing', () => {
    assert.deepEqual(releases.parseReleases([stable415, stable412]).map(release => release.tag), ['v4.1.5', 'v4.1.2'])
  })
  await check('stable selection never silently downloads the older v4.1.2 package', () => {
    // Use independent parse calls so the selection regression remains visible
    // even if the parser itself mistakenly discards the newest empty release.
    const latest = { id: 'v4.1.5', tag: 'v4.1.5', pageUrl: desktopPage('v4.1.5'), publishedAt: stable415.published_at, prerelease: false, assets: [] }
    const older = releases.parseReleases([stable412])[0]
    const result = download.resolveDownload([latest, older], windows, 'stable')
    assert.equal(result?.release.tag, 'v4.1.5')
    assert.equal(result?.asset, undefined)
  })
  const fixtureReleases = [
    ...releases.parseReleases([stable412, beta11, stable415, beta12]),
    ...releases.parseReleases([androidStable], androidRepo),
  ]
  const target = id => {
    const result = download.TARGETS.find(candidate => candidate.id === id)
    assert.ok(result, `Unknown fixture target: ${id}`)
    return result
  }
  await check('stable selection sorts release dates without mutating its input', () => {
    const input = [...fixtureReleases].reverse()
    const tags = input.map(release => release.tag)
    assert.equal(download.resolveDownload(input, windows, 'stable')?.release.tag, 'v4.1.5')
    assert.deepEqual(input.map(release => release.tag), tags)
  })
  await check('a release with only unsupported attachments still keeps its release page', () => {
    const parsed = releases.parseReleases([githubRelease('v4.1.5', { assets: ['README.txt', 'mower-source.tar'] })])
    assert.equal(parsed.length, 1)
    assert.deepEqual(parsed[0].assets, [])
    assert.equal(download.resolveDownload(parsed, windows, 'stable')?.release.pageUrl, desktopPage('v4.1.5'))
  })
  await check('a current stable installation package remains a direct download', () => {
    const parsed = releases.parseReleases([githubRelease('v4.1.5', { assets: ['mower_windows_x64.zip'] })])
    assert.match(download.resolveDownload(parsed, windows, 'stable')?.asset?.url ?? '', /\/download\/v4\.1\.5\//)
  })
  await check('beta keeps the older compatible Intel Mac package and its real version', () => {
    const result = download.resolveDownload(fixtureReleases, target('macos-x64'), 'beta')
    assert.equal(result?.release.tag, 'v4.1.6-alpha.11')
    assert.equal(result?.asset?.architecture, 'x64')
  })
  await check('beta uses its latest compatible Windows package', () => {
    assert.equal(download.resolveDownload(fixtureReleases, windows, 'beta')?.release.tag, 'v4.1.6-alpha.12')
  })
  await check('a beta without any compatible packages still resolves its latest release page', () => {
    const result = download.resolveDownload(fixtureReleases, target('linux-arm64'), 'beta')
    assert.equal(result?.release.tag, 'v4.1.6-alpha.12')
    assert.equal(result?.asset, undefined)
  })
  await check('Android APKs are isolated from the newer desktop repository release', () => {
    const result = download.resolveDownload(fixtureReleases, target('android-apk'), 'stable')
    assert.equal(result?.release.tag, 'v0.2.19')
    assert.equal(result?.asset?.format, 'APK')
    assert.ok(result.release.pageUrl.includes(`/${androidRepo}/`))
  })
  await check('Android update ZIPs follow the desktop release without substituting an APK', () => {
    const stable = download.resolveDownload(fixtureReleases, target('android-update'), 'stable')
    assert.equal(stable?.release.tag, 'v4.1.5')
    assert.equal(stable?.asset, undefined)
    const beta = download.resolveDownload(fixtureReleases, target('android-update'), 'beta')
    assert.equal(beta?.asset?.format, 'ZIP')
    assert.ok(beta.release.pageUrl.includes(`/${desktopRepo}/`))
  })
  await check('a missing repository or channel never becomes a package from another repository', () => {
    const onlyDesktop = fixtureReleases.filter(release => release.pageUrl.includes(`/${desktopRepo}/`))
    assert.equal(download.resolveDownload(onlyDesktop, target('android-apk'), 'stable'), undefined)
    assert.equal(download.resolveDownload(releases.parseReleases([stable415]), windows, 'beta'), undefined)
  })
  await check('parsing rejects drafts and unsafe release or attachment URLs', () => {
    const unsafe = githubRelease('v-unsafe', { assets: ['mower_windows_x64.zip'] })
    unsafe.assets[0].browser_download_url = 'javascript:alert(1)'
    const parsed = releases.parseReleases([
      { ...stable415, draft: true },
      { ...stable415, html_url: 'https://example.org/release/v4.1.5' }, unsafe,
    ])
    assert.deepEqual(parsed.map(release => release.tag), ['v-unsafe'])
    assert.deepEqual(parsed[0].assets, [])
    assert.throws(() => releases.parseReleases({}), /invalid release list/)
  })
  await check('the verified offline stable fallback is v4.1.5 with no invented package', () => {
    const result = download.resolveDownload(releases.VERIFIED_RELEASES, windows, 'stable')
    assert.equal(result?.release.tag, 'v4.1.5')
    assert.equal(result?.release.publishedAt, stable415.published_at)
    assert.equal(result?.asset, undefined)
  })
  await check('latest endpoint finds stable beyond the first 100 prereleases', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => githubRelease(`v4.1.6-alpha.${100 - index}`, {
      prerelease: true, published: '2026-10-10T00:00:00Z', assets: ['mower_windows_x64.zip'],
    }))
    await withMockFetch(url => url.includes(`/${desktopRepo}/`) && !url.endsWith('/latest') ? { json: firstPage } : standardResponse(url), async calls => {
      const module = await freshReleases()
      const data = await module.fetchReleases(new AbortController().signal)
      assert.equal(download.resolveDownload(data, windows, 'stable')?.release.tag, 'v4.1.5')
      assert.ok(calls.includes(`https://api.github.com/repos/${desktopRepo}/releases/latest`))
      assert.ok(calls.includes(`https://api.github.com/repos/${androidRepo}/releases/latest`))
      assert.equal(calls.length, 4)
    })
  })
  await check('list and latest responses deduplicate releases by their exact page URL', async () => {
    await withMockFetch(standardResponse, async () => {
      const module = await freshReleases()
      const data = await module.fetchReleases(new AbortController().signal)
      assert.equal(data.filter(release => release.pageUrl === desktopPage('v4.1.5')).length, 1)
      assert.equal(new Set(data.map(release => release.pageUrl)).size, data.length)
    })
  })
  await check('a list failure still uses the successful latest response', async () => {
    await withMockFetch(url => url.includes(`/${desktopRepo}/`) && !url.endsWith('/latest') ? { status: 503 } : standardResponse(url), async () => {
      const module = await freshReleases()
      const data = await module.fetchReleases(new AbortController().signal)
      assert.equal(download.resolveDownload(data, windows, 'stable')?.release.tag, 'v4.1.5')
      assert.equal(download.resolveDownload(data, target('android-apk'), 'stable')?.release.tag, 'v0.2.19')
    })
  })
  await check('latest failure preserves the verified stable even when the list contains only betas', async () => {
    await withMockFetch(url => url.includes(`/${desktopRepo}/`) ? url.endsWith('/latest') ? { status: 403 } : { json: [beta12] } : standardResponse(url), async () => {
      const module = await freshReleases()
      const data = await module.fetchReleases(new AbortController().signal)
      assert.equal(download.resolveDownload(data, windows, 'stable')?.release.tag, 'v4.1.5')
      assert.ok(download.resolveDownload(data, windows, 'beta')?.asset)
    })
  })
  await check('a failed latest request never overwrites live list attachments with the empty fallback', async () => {
    const live415 = githubRelease('v4.1.5', { published: stable415.published_at, assets: ['mower_windows_x64.zip'] })
    await withMockFetch(url => url.includes(`/${desktopRepo}/`) ? url.endsWith('/latest') ? { status: 403 } : { json: [live415] } : standardResponse(url), async () => {
      const module = await freshReleases()
      const data = await module.fetchReleases(new AbortController().signal)
      assert.match(download.resolveDownload(data, windows, 'stable')?.asset?.url ?? '', /\/download\/v4\.1\.5\//)
    })
  })
  await check('GitHub latest remains authoritative over a backport with a later publication date', async () => {
    const backport = githubRelease('v4.0.99', { published: '2026-10-15T00:00:00Z', assets: ['mower_windows_x64.zip'] })
    await withMockFetch(url => url.includes(`/${desktopRepo}/`) && !url.endsWith('/latest') ? { json: [backport, stable415] } : standardResponse(url), async () => {
      const module = await freshReleases()
      const data = await module.fetchReleases(new AbortController().signal)
      const result = download.resolveDownload(data, windows, 'stable')
      assert.equal(result?.release.tag, 'v4.1.5')
      assert.equal(result?.release.isLatest, true)
      assert.equal(result?.asset, undefined)
    })
  })
  await check('a newer live stable list wins over the verified fallback when latest is unavailable', async () => {
    const live416 = githubRelease('v4.1.6', { published: '2026-10-16T00:00:00Z', assets: ['mower_windows_x64.zip'] })
    await withMockFetch(url => url.includes(`/${desktopRepo}/`) ? url.endsWith('/latest') ? { status: 403 } : { json: [live416] } : standardResponse(url), async () => {
      const module = await freshReleases()
      const data = await module.fetchReleases(new AbortController().signal)
      const result = download.resolveDownload(data, windows, 'stable')
      assert.equal(result?.release.tag, 'v4.1.6')
      assert.ok(result.asset)
    })
  })
  await check('one failed repository keeps its own fallback while the other remains live', async () => {
    await withMockFetch(url => url.includes(`/${desktopRepo}/`) ? { status: 503 } : standardResponse(url), async () => {
      const module = await freshReleases()
      const data = await module.fetchReleases(new AbortController().signal)
      assert.equal(download.resolveDownload(data, windows, 'stable')?.release.tag, 'v4.1.5')
      assert.equal(download.resolveDownload(data, target('android-apk'), 'stable')?.asset?.format, 'APK')
    })
  })
  await check('complete API failure rejects cleanly and leaves a correct offline fallback', async () => {
    await withMockFetch(() => ({ status: 503 }), async () => {
      const module = await freshReleases()
      await assert.rejects(module.fetchReleases(new AbortController().signal), /GitHub releases request failed/)
      assert.equal(download.resolveDownload(module.VERIFIED_RELEASES, windows, 'stable')?.release.tag, 'v4.1.5')
    })
  })
  await check('the five-minute release cache avoids repeated API requests', async () => {
    await withMockFetch(standardResponse, async calls => {
      const module = await freshReleases()
      const first = await module.fetchReleases(new AbortController().signal)
      const second = await module.fetchReleases(new AbortController().signal)
      assert.equal(first, second)
      assert.equal(calls.length, 4)
    })
  })
  const state = channel => ({ device: { platform: 'windows', architecture: 'x64', certain: true }, target: windows, channel, autoChannel: channel, setChannel() {} })
  await check('the actual hero renders a v4.1.5 release-page link with an honest label and title', () => {
    const markup = renderToStaticMarkup(createElement(download.HeroDownload, { releases: releases.VERIFIED_RELEASES, state: state('stable'), onOpenMenu() {} }))
    assert.ok(markup.includes(`href="${desktopPage('v4.1.5')}"`))
    assert.ok(markup.includes('查看正式版'))
    assert.match(markup, /title="[^"]*v4\.1\.5[^"]*暂无安装包，查看发布说明/)
    assert.match(markup, /aria-label="[^"]*v4\.1\.5[^"]*暂无安装包/)
    assert.ok(!markup.includes('/releases/download/'))
  })
  await check('the actual beta hero continues to link directly to its package', () => {
    const markup = renderToStaticMarkup(createElement(download.HeroDownload, { releases: releases.VERIFIED_RELEASES, state: state('beta'), onOpenMenu() {} }))
    assert.ok(markup.includes('下载 Mower'))
    assert.match(markup, /href="https:\/\/github\.com\/ArkMowers\/arknights-mower\/releases\/download\/v4\.1\.6-alpha\.12\//)
  })
  await check('the actual stable platform menu explains six release links and retains the Android APK', () => {
    const markup = renderToStaticMarkup(createElement(download.PlatformMenu, { releases: releases.VERIFIED_RELEASES, state: state('stable'), open: true, setOpen() {} }))
    const links = rowLinks(markup)
    assert.equal(links.length, 7)
    assert.equal(links.filter(link => link.href === desktopPage('v4.1.5')).length, 6)
    assert.equal(links.filter(link => link.href?.includes(`/${androidRepo}/releases/download/`)).length, 1)
    assert.equal((markup.match(/此版本未附该平台安装包/g) ?? []).length, 6)
    assert.ok(!markup.includes('v4.1.2'))
  })
  await check('the actual beta platform menu keeps all seven verified direct packages', () => {
    const markup = renderToStaticMarkup(createElement(download.PlatformMenu, { releases: releases.VERIFIED_RELEASES, state: state('beta'), open: true, setOpen() {} }))
    const links = rowLinks(markup)
    assert.equal(links.length, 7)
    assert.ok(links.every(link => link.href?.includes('/releases/download/')))
  })
} finally {
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(path.join(outputDirectory, 'verification.json'), `${JSON.stringify(summary, null, 2)}\n`)
}
const failed = summary.checks.filter(check => !check.passed)
console.log(`${summary.checks.length - failed.length}/${summary.checks.length} release checks passed`)
if (failed.length) process.exitCode = 1
