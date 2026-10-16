# Proviso / 但书基建模型

These three Spine models are excerpts from
[isHarryh/Ark-Models](https://github.com/isHarryh/Ark-Models), pinned to
[`8a3857c250a5c271429aefa82c660ff35803166e`](https://github.com/isHarryh/Ark-Models/tree/8a3857c250a5c271429aefa82c660ff35803166e).
The nine `.skel`, `.atlas`, and `.png` files were retrieved on 2026-10-15.
Skeleton and PNG bytes are unchanged. The holiday/autumn local file names use
`-` in place of `#`, and the texture-page filename in each corresponding atlas
has the same substitution. This avoids Vite's public-file lookup returning the
SPA HTML document for encoded `%23` paths. No other atlas content is changed.

| Local directory | Outfit | Upstream `models/` directory | Texture | Total bytes |
| --- | --- | --- | --- | ---: |
| `default` | 默认 | `4032_provs` | 548 × 548 | 448,085 |
| `holiday` | 悠然假日 HD78 | `4032_provs_summer#17` | 812 × 812 | 851,133 |
| `autumn` | 秋高气爽 | `4032_provs_wild#7` | 748 × 748 | 719,250 |

All three binary skeleton headers identify **Spine 3.8.99**. The atlas texture
sizes match the downloaded PNG dimensions. The skeletons were also parsed with
the vendored Spine 3.8 runtime to verify their animation names and durations:

| Animation | Default, 107 bones | Holiday, 208 bones | Autumn, 146 bones |
| --- | ---: | ---: | ---: |
| `Default` | 0 s | 0 s | 0 s |
| `Interact` | 1.900 s | 2.767 s | 2.833 s |
| `Move` | 4.267 s | 5.333 s | 4.000 s |
| `Relax` | 6.667 s | 6.667 s | 5.333 s |
| `Sit` | 5.333 s | 6.000 s | 3.333 s |
| `Sleep` | 3.000 s | 3.000 s | 3.000 s |
| `Special` | — | 12.233 s | 8.133 s |

The skeleton header bounds are unsuitable for layout: the holiday model has
zero bounds, and autumn includes distant props. Measure an evaluated `Relax`
pose for a consistent character scale. Autumn's `Interact` and `Special`
animations include effects that extend well beyond the standing character.

For the homepage's 84 px standing character height, `Relax` at time zero gives:

| Outfit | Relax bounds `(x, y, width, height)` | Model-to-CSS-pixel scale |
| --- | --- | ---: |
| Default | `(-131.721, -1.498, 240.856, 432.465)` | 0.1942352931 |
| Holiday | `(-124.943, -2.940, 217.287, 438.265)` | 0.1916649240 |
| Autumn | `(-117.496, -2.464, 208.882, 435.608)` | 0.1928337664 |

The following visible minimum Y coordinates were sampled every 1/15 second
through each animation. Invisible slots/attachments (`alpha < 0.001`) were
excluded. Sleep uses its sampled lowest point to rest on the surface. Sit uses
the root/seat anchor at Y = 0, leaving its legs approximately 20–24 CSS pixels
below the titlebar edge instead of lifting its feet onto the surface.

| Animation | Default minimum Y | Holiday minimum Y | Autumn minimum Y |
| --- | ---: | ---: | ---: |
| `Relax` | -1.57 | -2.94 | -2.46 |
| `Move` | -4.34 | -6.05 | -4.77 |
| `Interact` | -7.62 | -7.97 | -3.23 |
| `Sit` | -102.70 | -116.62 | -122.61 |
| `Sleep` | -32.88 | -30.77 | -21.63 |

At the standing scale above, autumn's visible `Interact` spans approximately
174 × 107 px. Its `Special` spans approximately 213 × 163 px, with effects
extending mostly to one side. The homepage exposes `Relax`, `Move`, `Interact`,
`Sit`, and `Sleep` for every outfit, plus `Special` for the holiday and autumn
outfits. Special plays once for its full duration. The scene has 188 CSS pixels
above the standing baseline and 36 below it at the default 84px character size;
horizontal limits include the complete animation and its visible props.

The upstream [README at this revision](https://github.com/isHarryh/Ark-Models/blob/8a3857c250a5c271429aefa82c660ff35803166e/README.md)
states that all model textures have been forced to **premultiplied alpha (PMA)**
since March 2025. Render with PMA enabled, without premultiplying the PNG again.
It also records that these newer models come from the PC game assets.

## Rights

Character artwork, model data, and animation copyright belongs to
**上海鹰角网络有限公司 / Shanghai Hypergryph Network Technology Co., Ltd.**
The upstream repository's copyright notice prohibits commercial use and use
that harms the rights holder's interests. These excerpts are game assets, not
assets covered by this website's source-code license.

The Spine runtime has its own license, retained in `src/vendor/spine/`.

## Reproducible download

Run `node scripts/fetch-proviso-assets.mjs` from the project checkout. The script
downloads only the nine files above from the pinned revision and verifies
the upstream SHA-256 checksums before applying the filename transformation and
writing each file. Local stems are `build_char_4032_provs`,
`build_char_4032_provs_summer-17`, and `build_char_4032_provs_wild-7`.

Each outfit's `poster.webp` is a derived transparent still of its `Relax` pose
at time zero, rendered with this project's `SpineRenderer`. The canvas uses
2× sampling: the files are 256 × 256 px, displayed at 128 × 128 CSS px with an
84 CSS px standing character and the same baseline as the animated component.
This preserves thin outlines on high-density screens. Their lossless WebP
sizes are 16,688 bytes (default), 15,822 bytes (holiday), and 16,168 bytes (autumn).
These lossless WebP files serve the initial frame and WebGL fallback; the
reduced-motion mode renders a still pose. The same artwork rights apply to them.
Run `node scripts/generate-operator-posters.mjs` to rebuild all three. This
requires Microsoft Edge (or `MOWER_BROWSER_EXECUTABLE` pointing to Chromium),
and starts a temporary local Vite server for rendering.

No asset service or third-party CDN is contacted by the website at runtime.
