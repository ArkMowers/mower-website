/** Project-native vector illustrations. Buildings and task routes echo Mower's automation. */
export function AutomationArtwork() {
  return (
    <div className="automation-artwork" aria-hidden="true">
      <svg className="base-artwork" viewBox="0 0 360 360" fill="none">
        <g strokeLinejoin="round" strokeLinecap="round" strokeWidth="2.5">
          <path className="art-shadow" d="m32 266 149-86 149 86-149 86Z" />
          <path className="art-platform-side" d="m32 246 149 86 149-86v18l-149 86-149-86Z" />
          <path className="art-platform" d="m32 246 149-86 149 86-149 86Z" />
          <path className="art-route" d="m72 246 109 63 109-63M181 309v-38M126 277l109-63" />

          <path className="art-side" d="m78 176 62 36v75l-62-36Z" />
          <path className="art-front" d="m140 212 62-36v75l-62 36Z" />
          <path className="art-roof" d="m78 176 62-36 62 36-62 36Z" />
          <path className="art-roof-inset" d="m95 176 45-26 45 26-45 26Z" />
          <path className="art-detail" d="m153 228 34-20v27l-34 20Zm-58-25 28 16v25l-28-16Z" />
          <path className="art-accent" d="m160 235 20-12m-20 22 20-12" />

          <path className="art-side" d="m168 109 65 38v113l-65-38Z" />
          <path className="art-front" d="m233 147 65-38v113l-65 38Z" />
          <path className="art-roof" d="m168 109 65-38 65 38-65 38Z" />
          <path className="art-roof-inset" d="m186 109 47-27 47 27-47 27Z" />
          <path className="art-accent" d="m218 106 15-9 15 9-15 9Z" />
          <path className="art-detail" d="m247 168 36-21v23l-36 21Zm0 40 36-21v23l-36 21Z" />
          <path className="art-window" d="m182 140 11 6v19l-11-6Zm20 12 11 6v19l-11-6Zm-20 29 11 6v19l-11-6Zm20 12 11 6v19l-11-6Z" />
          <path className="art-outline" d="M233 71V41m-8 5 8-5 8 5" />
          <path className="art-signal signal-rise-one" d="m222 28 11-6 11 6" />
          <path className="art-signal signal-rise-two" d="m222 13 11-6 11 6" />

          <path className="art-flow-line" d="m289 279 48-28h31" />
          <circle className="art-packet signal-forward" cx="318" cy="262" r="4" stroke="none" />
        </g>
      </svg>

      <svg className="task-artwork" viewBox="0 0 340 360" fill="none">
        <g strokeLinejoin="round" strokeLinecap="round" strokeWidth="2.5">
          <path className="art-flow-line" d="M18 273h48q18 0 18-18v-41q0-18 18-18h30M273 121v53q0 22-22 22h-28M184 248v53q0 18 18 18h52" />
          <path className="art-shadow" d="m116 218 68-39 68 39-68 39Z" />
          <path className="art-platform-side" d="m112 157 72 42 72-42v69l-72 42-72-42Z" />
          <path className="art-front" d="m184 199 72-42v69l-72 42Z" />
          <path className="art-roof" d="m112 157 72-42 72 42-72 42Z" />
          <path className="art-roof-inset" d="m133 157 51-29 51 29-51 30Z" />
          <path className="art-accent" d="m164 157 14 8 26-15" strokeWidth="4" />
          <path className="art-detail" d="m126 188 42 24m-42-11 42 24" />
          <path className="art-window" d="m199 218 11-6v17l-11 6Zm20-12 11-6v17l-11 6Z" />

          <path className="art-platform-side" d="m226 65 47 27 47-27v40l-47 27-47-27Z" />
          <path className="art-front" d="m273 92 47-27v40l-47 27Z" />
          <path className="art-roof" d="m226 65 47-27 47 27-47 27Z" />
          <path className="art-accent" d="m253 65 20-12 20 12-20 12Z" />
          <path className="art-outline" d="m273 53 10 6m-10-6v-8" />

          <path className="art-platform-side" d="m19 126 38 22 38-22v31l-38 22-38-22Z" />
          <path className="art-front" d="m57 148 38-22v31l-38 22Z" />
          <path className="art-roof" d="m19 126 38-22 38 22-38 22Z" />
          <path className="art-accent" d="m46 126 8 5 16-9" strokeWidth="3" />
          <path className="art-flow-line" d="m95 140 28 16M254 319h41" />
          <path className="art-outline" d="m287 312 8 7-8 7" />
          <circle className="art-packet signal-forward" cx="35" cy="273" r="4.5" stroke="none" />
          <circle className="art-packet signal-down" cx="273" cy="148" r="4.5" stroke="none" />
          <circle className="art-packet signal-forward-delayed" cx="224" cy="319" r="4.5" stroke="none" />
        </g>
      </svg>
    </div>
  )
}

export function MobileTaskRoute() {
  return (
    <svg className="mobile-task-route" viewBox="0 0 320 110" fill="none" aria-hidden="true">
      <g strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
        <path className="art-flow-line" d="M62 22v22q0 14 14 14h168q14 0 14-14V22M160 22v67" />
        <rect className="art-roof" x="49" y="9" width="26" height="26" rx="7" />
        <rect className="art-roof" x="147" y="9" width="26" height="26" rx="7" />
        <rect className="art-roof" x="245" y="9" width="26" height="26" rx="7" />
        <path className="art-accent" d="m56 22 4 4 8-8m86 4 4 4 8-8m86 4 4 4 8-8M153 82l7 7 7-7" />
        <circle className="art-packet signal-down" cx="160" cy="56" r="4" stroke="none" />
      </g>
    </svg>
  )
}
