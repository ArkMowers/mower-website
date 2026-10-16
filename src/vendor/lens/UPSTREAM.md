# Lens runtime

The JavaScript files in this directory were copied from
[ruiqichenbiec/design-systems](https://github.com/ruiqichenbiec/design-systems),
directory `lens/lab/design-system/`, at commit
[`7a424c93b9be13cf835b91ea67495fec2ec0584e`](https://github.com/ruiqichenbiec/design-systems/tree/7a424c93b9be13cf835b91ea67495fec2ec0584e/lens/lab/design-system).
The upstream runtime version is `1.1.0-showcase.1`.

Only `runtime.js` and its transitive JavaScript dependencies are included.
The original MIT license is preserved in `LICENSE`; copyright belongs to
DayDreamInAReverie, 2026.

`runtime.d.ts` is maintained by this project and describes the runtime API subset
used by the application. It is based on the upstream `index.d.ts` declarations.
Application integration and styles remain outside this directory.

Local integration patches are confined to `runtime.js`,
`internal/renderer.js`, `internal/jelly.js`, and `internal/context-budget.js`:
opt-in transparent output retains full optical scene
RGB and shadow coverage in ping-pong targets, then resolves foreground RGBA
against an immutable backdrop. This preserves the upstream pressure-driven
shadow and overlapping refraction without drawing rectangular stage backgrounds;
transparent hosts apply optical brightness only to uncovered background samples,
avoiding repeated dimming of earlier lenses. The first optical image is submitted
before publishing `webgl-ready`. Optional eager initialization flushes the shared
GPU budget after controls are mounted, preserving its context limit. Canvas geometry and
pointer positions are normalized through ancestor scales; nested stages have
exclusive control ownership; supplied artwork and static scenes are not warped;
links use the same drag limit as buttons; tethers use that local travel limit
instead of the lab stage's inset, so viewport edges cannot force a resting
button to jump or suppress its spring motion. Segmented radio controls share the
upstream indicator gesture and resynchronize on resize. The original Snell
refraction, material shading, dispersion, and spring physics are retained.

The renderer runs locally in the browser with WebGL2. It requires no remote API,
API key, CDN, or additional runtime package. The application supplies its existing
light-field canvas pixels through Lens's `artwork` callback. Lens refracts these
pixels; it does not capture arbitrary DOM content.

Upstream documentation:

- [Integration and API](https://github.com/ruiqichenbiec/design-systems/blob/7a424c93b9be13cf835b91ea67495fec2ec0584e/lens/lab/design-system/README.md)
- [Project license](https://github.com/ruiqichenbiec/design-systems/blob/7a424c93b9be13cf835b91ea67495fec2ec0584e/LICENSE)
