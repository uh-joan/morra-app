// pirate/art.ts — hand-authored SVG art for the ux-pirates skin: the four
// corsair figures, their stage scenery, the shared wave strip and the title
// wordmark. Every export is a CONSTANT string with zero interpolation —
// injecting them via innerHTML is the documented exception to the
// textContent-only rule (authored art, no data ever enters these strings).
// Animation is class-driven: CSS owns all movement (idle bob, kelp sway,
// lantern flicker, gull drift…), so nothing here ever touches timing.

/** The same figure SVG is injected in several places at once (select
 * cards, VS splash, fight stage). Duplicate ids would make every
 * url(#gradient) resolve to the FIRST copy in the document — which may sit
 * in a display:none subtree, where Chrome refuses to paint referenced
 * gradients (this is what made Nino's shirt vanish on the fight screen).
 * Suffix every id + url(#) reference per mount point. */
export function artWithUniqueIds(art: string, suffix: string): string {
  return art
    .replace(/id="([a-z0-9-]+)"/g, `id="$1-${suffix}"`)
    .replace(/url\(#([a-z0-9-]+)\)/g, `url(#$1-${suffix})`);
}

// ---------------------------------------------------------------- figures

// Nino, el Grumet — scrappy cabin kid, oversized tricorn, gap-tooth grin.
const NINO = `
<svg class="pirate-svg pirate-nino" viewBox="0 0 220 260" role="img" aria-label="Nino, el grumet">
  <defs>
    <linearGradient id="pn-shirt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4e9d2"/><stop offset="1" stop-color="#d8c9a8"/>
    </linearGradient>
    <radialGradient id="pn-glow" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0" stop-color="#ffd98a" stop-opacity=".35"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="110" cy="120" r="104" fill="url(#pn-glow)"/>
  <g class="fig">
    <path d="M60 258 L64 190 Q66 168 88 162 L132 162 Q154 168 156 190 L160 258 Z" fill="url(#pn-shirt)"/>
    <g fill="#c73e46">
      <path d="M62 206 L158 206 L159 220 L61 220 Z" opacity=".9"/>
      <path d="M61 234 L159 234 L160 248 L60 248 Z" opacity=".9"/>
      <path d="M65 178 L155 178 L156 192 L64 192 Z" opacity=".9"/>
    </g>
    <path d="M88 162 L110 184 L132 162 L124 158 L96 158 Z" fill="#b3342c"/>
    <path d="M104 180 L110 196 L118 179 L110 184 Z" fill="#992a24"/>
    <ellipse cx="110" cy="118" rx="46" ry="44" fill="#f2c49b"/>
    <path d="M66 118 Q64 132 74 140 L74 118 Z" fill="#f2c49b"/>
    <path d="M154 118 Q156 132 146 140 L146 118 Z" fill="#f2c49b"/>
    <path d="M70 96 Q74 80 88 78 Q80 90 82 98 Z" fill="#6b4423"/>
    <path d="M150 96 Q146 80 132 78 Q140 90 138 98 Z" fill="#6b4423"/>
    <circle cx="82" cy="128" r="8" fill="#eda27c" opacity=".55"/>
    <circle cx="138" cy="128" r="8" fill="#eda27c" opacity=".55"/>
    <g fill="#c98a5e"><circle cx="88" cy="122" r="1.6"/><circle cx="95" cy="126" r="1.6"/><circle cx="132" cy="122" r="1.6"/><circle cx="125" cy="126" r="1.6"/></g>
    <g class="eyes">
      <ellipse cx="92" cy="112" rx="7.5" ry="9" fill="#fff"/>
      <ellipse cx="128" cy="112" rx="7.5" ry="9" fill="#fff"/>
      <circle class="pupil" cx="94" cy="114" r="4.4" fill="#3c2a18"/>
      <circle class="pupil" cx="126" cy="114" r="4.4" fill="#3c2a18"/>
      <circle cx="95.5" cy="112" r="1.4" fill="#fff"/>
      <circle cx="127.5" cy="112" r="1.4" fill="#fff"/>
    </g>
    <g stroke="#6b4423" stroke-width="2.4" stroke-linecap="round" fill="none">
      <path d="M84 100 Q92 96 100 100"/>
      <path d="M120 100 Q128 96 136 100"/>
    </g>
    <path class="mouth" d="M92 138 Q110 152 128 138 Q120 148 110 148 Q100 148 92 138 Z" fill="#7c3a2d"/>
    <path d="M104 140.5 L110 140.5 L110 145.5 L104 145.5 Z" fill="#fff"/>
    <path d="M113 140.5 L119 140.5 L119 144 L113 144 Z" fill="#fff"/>
    <g class="hat" transform="rotate(-4 110 78)">
      <path d="M40 88 Q52 52 110 50 Q168 52 180 88 Q150 72 110 72 Q70 72 40 88 Z" fill="#22304a"/>
      <path d="M40 88 Q70 76 110 76 Q150 76 180 88 Q150 96 110 96 Q70 96 40 88 Z" fill="#2c3e60"/>
      <path d="M40 88 Q52 84 62 82 L58 92 Q48 92 40 88 Z" fill="#1a2438"/>
      <path d="M180 88 Q168 84 158 82 L162 92 Q172 92 180 88 Z" fill="#1a2438"/>
      <circle cx="110" cy="62" r="7" fill="#f4e9d2"/>
      <g fill="#22304a"><circle cx="107.5" cy="60.5" r="1.5"/><circle cx="112.5" cy="60.5" r="1.5"/><path d="M107 65 L113 65 L110 68 Z"/></g>
      <path d="M42 87 Q76 74 110 74 Q144 74 178 87" stroke="#e0b64f" stroke-width="2" fill="none"/>
    </g>
  </g>
</svg>`;

// Bru, el Contramestre — barrel-chested bosun, black beard, red bandana.
const BRU = `
<svg class="pirate-svg pirate-bru" viewBox="0 0 220 260" role="img" aria-label="Bru, el contramestre">
  <defs>
    <linearGradient id="pb-coat" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2c3e60"/><stop offset="1" stop-color="#1c2a44"/>
    </linearGradient>
    <radialGradient id="pb-glow" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0" stop-color="#9fd0ff" stop-opacity=".28"/><stop offset="1" stop-color="#9fd0ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="110" cy="120" r="104" fill="url(#pb-glow)"/>
  <g class="fig">
    <path d="M38 258 L46 178 Q50 150 82 144 L138 144 Q170 150 174 178 L182 258 Z" fill="url(#pb-coat)"/>
    <path d="M82 144 L94 258 L70 258 L60 170 Q64 150 82 144 Z" fill="#24345a"/>
    <path d="M138 144 L126 258 L150 258 L160 170 Q156 150 138 144 Z" fill="#24345a"/>
    <path d="M94 150 L126 150 L122 258 L98 258 Z" fill="#e8dcbe"/>
    <path d="M92 214 L128 214 L126 236 L94 236 Z" fill="#b3342c"/>
    <path d="M120 236 L134 254 L124 256 L114 238 Z" fill="#992a24"/>
    <path d="M46 178 Q30 196 32 232 L52 236 Q50 204 58 188 Z" fill="#24345a"/>
    <path d="M174 178 Q190 196 188 232 L168 236 Q170 204 162 188 Z" fill="#24345a"/>
    <ellipse cx="46" cy="232" rx="15" ry="13" fill="#e0a878"/>
    <ellipse cx="174" cy="232" rx="15" ry="13" fill="#e0a878"/>
    <g stroke="#365a80" stroke-width="2.2" fill="none" opacity=".85">
      <path d="M174 222 L174 236"/><path d="M168 232 Q174 240 180 232"/><circle cx="174" cy="219" r="2.6"/>
    </g>
    <ellipse cx="110" cy="104" rx="42" ry="40" fill="#e0a878"/>
    <path class="beard" d="M64 108 Q60 170 88 184 Q100 190 110 190 Q120 190 132 184 Q160 170 156 108 Q150 132 136 138 Q124 143 110 143 Q96 143 84 138 Q70 132 64 108 Z" fill="#241d16"/>
    <path d="M92 156 Q96 166 104 168 M128 156 Q124 166 116 168" stroke="#3a3026" stroke-width="2" fill="none"/>
    <path class="mouth" d="M98 146 Q110 152 122 146" stroke="#120d08" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M104 112 Q108 126 102 130 L116 130 Q112 120 114 110 Z" fill="#cf9264"/>
    <g class="eyes">
      <path d="M84 106 Q92 102 100 107 L98 111 Q91 108 86 110 Z" fill="#fff"/>
      <path d="M136 106 Q128 102 120 107 L122 111 Q129 108 134 110 Z" fill="#fff"/>
      <circle class="pupil" cx="93" cy="108" r="2.8" fill="#1c1610"/>
      <circle class="pupil" cx="127" cy="108" r="2.8" fill="#1c1610"/>
    </g>
    <path d="M78 98 Q92 90 102 96 L100 102 Q90 98 80 104 Z" fill="#241d16"/>
    <path d="M142 98 Q128 90 118 96 L120 102 Q130 98 140 104 Z" fill="#241d16"/>
    <path d="M134 92 L144 82 M137 87 L141 89" stroke="#b57d52" stroke-width="2" stroke-linecap="round"/>
    <path d="M66 92 Q70 60 110 58 Q150 60 154 92 Q130 80 110 80 Q90 80 66 92 Z" fill="#b3342c"/>
    <path d="M66 92 Q90 82 110 82 Q130 82 154 92 L152 100 Q130 88 110 88 Q90 88 68 100 Z" fill="#992a24"/>
    <path d="M64 94 Q52 102 50 116 L62 112 Q60 102 68 98 Z" fill="#b3342c"/>
    <circle cx="152" cy="122" r="7" fill="none" stroke="#e0b64f" stroke-width="3"/>
  </g>
</svg>`;

// Mercè, la Vella Corsària — retired legend, grey bun, clay pipe, shawl.
const MERCE = `
<svg class="pirate-svg pirate-merce" viewBox="0 0 220 260" role="img" aria-label="Mercè, la vella corsària">
  <defs>
    <linearGradient id="pm-shawl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a6f6a"/><stop offset="1" stop-color="#1b4a49"/>
    </linearGradient>
    <radialGradient id="pm-glow" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0" stop-color="#caa3ff" stop-opacity=".26"/><stop offset="1" stop-color="#caa3ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="110" cy="120" r="104" fill="url(#pm-glow)"/>
  <g class="fig">
    <path d="M52 258 L58 186 Q62 158 92 152 L128 152 Q158 158 162 186 L168 258 Z" fill="#2f2537"/>
    <path d="M50 200 Q56 154 96 148 L124 148 Q164 154 170 200 L156 194 Q150 162 124 158 L96 158 Q70 162 64 194 Z" fill="url(#pm-shawl)"/>
    <path d="M92 152 L110 214 L128 152 Q120 158 110 158 Q100 158 92 152 Z" fill="#26424a" opacity=".7"/>
    <g fill="#e0b64f"><circle cx="98" cy="168" r="4"/><circle cx="110" cy="174" r="4.6"/><circle cx="122" cy="168" r="4"/></g>
    <g transform="rotate(24 168 150)">
      <rect x="164" y="120" width="7" height="34" rx="3" fill="#6d4c2a"/>
      <path d="M156 152 Q168 166 180 152 L176 146 Q168 156 160 146 Z" fill="#c9b26a"/>
    </g>
    <path d="M72 106 Q70 148 92 158 Q102 163 110 163 Q118 163 128 158 Q150 148 148 106 Q148 74 110 72 Q72 74 72 106 Z" fill="#e8b98e"/>
    <g stroke="#c98f62" stroke-width="1.6" fill="none" opacity=".8">
      <path d="M86 134 Q92 138 98 136"/><path d="M134 134 Q128 138 122 136"/><path d="M104 92 Q110 90 116 92"/>
    </g>
    <g class="eyes">
      <path d="M84 110 Q92 104 102 110 Q92 116 84 110 Z" fill="#fff"/>
      <path d="M136 110 Q128 104 118 110 Q128 116 136 110 Z" fill="#fff"/>
      <circle class="pupil" cx="93" cy="110" r="3.4" fill="#27343b"/>
      <circle class="pupil" cx="127" cy="110" r="3.4" fill="#27343b"/>
      <path d="M82 106 Q92 100 104 106" stroke="#8c6b4f" stroke-width="2.4" fill="none"/>
      <path d="M138 106 Q128 100 116 106" stroke="#8c6b4f" stroke-width="2.4" fill="none"/>
    </g>
    <path d="M120 96 L134 88 M124 91 L128 95" stroke="#c07a52" stroke-width="2" stroke-linecap="round"/>
    <path class="mouth" d="M96 142 Q106 148 118 143" stroke="#7c3a2d" stroke-width="3" fill="none" stroke-linecap="round"/>
    <g class="pipe">
      <path d="M118 143 Q134 146 142 156" stroke="#8a6540" stroke-width="4" fill="none" stroke-linecap="round"/>
      <ellipse cx="145" cy="159" rx="6" ry="7" fill="#8a6540"/>
      <path class="smoke" d="M145 148 Q141 140 146 133 Q151 126 147 118" stroke="#cfd8d6" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>
    </g>
    <path d="M74 100 Q68 66 110 62 Q152 66 146 100 Q136 78 110 78 Q84 78 74 100 Z" fill="#b9bdc2"/>
    <circle cx="110" cy="60" r="17" fill="#b9bdc2"/>
    <path d="M96 62 Q104 50 118 54" stroke="#f2f4f6" stroke-width="4" fill="none"/>
    <path d="M122 48 L142 40 L138 50 L124 54 Z" fill="#c9b26a"/>
    <circle cx="74" cy="124" r="6" fill="none" stroke="#e0b64f" stroke-width="2.6"/>
    <circle cx="146" cy="124" r="6" fill="none" stroke="#e0b64f" stroke-width="2.6"/>
  </g>
</svg>`;

// El Rei del Fons — drowned pirate god: coral crown, kelp beard, glow eyes.
const REI = `
<svg class="pirate-svg pirate-rei" viewBox="0 0 220 260" role="img" aria-label="El Rei del Fons">
  <defs>
    <linearGradient id="pk-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1e5f63"/><stop offset=".65" stop-color="#123c44" stop-opacity=".92"/><stop offset="1" stop-color="#0a262e" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="pk-halo" cx="0.5" cy="0.4" r="0.62">
      <stop offset="0" stop-color="#3adfd2" stop-opacity=".33"/><stop offset="1" stop-color="#3adfd2" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="pk-eye" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#eafffb"/><stop offset=".5" stop-color="#7df5e8"/><stop offset="1" stop-color="#7df5e8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="110" cy="118" r="108" fill="url(#pk-halo)" class="halo"/>
  <g opacity=".5" stroke="#2f8f87" stroke-width="5" fill="none" stroke-linecap="round">
    <path d="M178 244 L178 93"/>
    <path d="M164 100 Q164 80 178 78 Q192 80 192 100"/>
    <path d="M164 100 L164 84 M192 100 L192 84 M178 96 L178 76"/>
  </g>
  <g class="fig">
    <path d="M48 252 Q52 172 76 152 L144 152 Q168 172 172 252 Q150 236 130 248 Q116 256 110 256 Q104 256 90 248 Q70 236 48 252 Z" fill="url(#pk-body)"/>
    <path d="M56 168 Q68 148 92 150 L88 166 Q70 164 62 176 Z" fill="#1b4f52"/>
    <path d="M164 168 Q152 148 128 150 L132 166 Q150 164 158 176 Z" fill="#1b4f52"/>
    <g fill="#d8c9a8" opacity=".8"><circle cx="70" cy="162" r="3.4"/><circle cx="78" cy="156" r="2.4"/><circle cx="148" cy="160" r="3.2"/><circle cx="156" cy="168" r="2.2"/></g>
    <path d="M70 104 Q68 148 92 158 Q102 164 110 164 Q118 164 128 158 Q152 148 150 104 Q150 70 110 68 Q70 70 70 104 Z" fill="#1e6a6b"/>
    <path d="M84 132 Q96 140 110 140 Q124 140 136 132 Q128 152 110 152 Q92 152 84 132 Z" fill="#144b50"/>
    <g class="eyes glow">
      <circle cx="92" cy="108" r="13" fill="url(#pk-eye)"/>
      <circle cx="128" cy="108" r="13" fill="url(#pk-eye)"/>
      <circle class="pupil" cx="92" cy="108" r="6" fill="#ffffff"/>
      <circle class="pupil" cx="128" cy="108" r="6" fill="#ffffff"/>
      <circle cx="92" cy="108" r="9" fill="none" stroke="#bffff6" stroke-width="1.6" opacity=".8"/>
      <circle cx="128" cy="108" r="9" fill="none" stroke="#bffff6" stroke-width="1.6" opacity=".8"/>
    </g>
    <path d="M80 96 Q92 88 102 94 M140 96 Q128 88 118 94" stroke="#0d3338" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path class="mouth" d="M96 144 Q110 140 124 144" stroke="#0a2a30" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <g class="kelp" stroke-linecap="round" fill="none">
      <path class="k1" d="M92 152 Q86 178 94 200 Q100 216 92 232" stroke="#2f8f6b" stroke-width="7"/>
      <path class="k2" d="M110 158 Q106 186 114 208 Q120 226 112 244" stroke="#3aa578" stroke-width="8"/>
      <path class="k3" d="M128 152 Q136 178 128 200 Q122 216 130 232" stroke="#2f8f6b" stroke-width="7"/>
      <path class="k2" d="M78 146 Q70 168 78 188" stroke="#26765c" stroke-width="5"/>
      <path class="k1" d="M142 146 Q150 168 142 188" stroke="#26765c" stroke-width="5"/>
    </g>
    <g class="crown">
      <path d="M74 84 Q72 62 82 52 Q86 66 92 60 Q90 44 104 38 Q106 54 112 50 Q114 34 128 40 Q126 56 134 58 Q140 48 146 54 Q150 68 146 84 Q128 74 110 74 Q92 74 74 84 Z" fill="#e2725b"/>
      <path d="M84 74 Q82 64 88 58 M110 68 Q110 56 116 50 M134 72 Q136 62 132 56" stroke="#f4977e" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="97" cy="64" r="2.4" fill="#ffd9c9"/><circle cx="122" cy="58" r="2.4" fill="#ffd9c9"/>
    </g>
  </g>
  <g class="fish" opacity=".7">
    <path d="M40 190 Q52 184 62 190 Q52 196 40 190 Z" fill="#7df5e8"/>
    <path d="M40 190 L32 184 L34 190 L32 196 Z" fill="#7df5e8"/>
    <circle cx="57" cy="189" r="1.4" fill="#0a262e"/>
  </g>
</svg>`;

export const PIRATE_ART: Record<string, string> = { L1: NINO, L2: BRU, L3: MERCE, L4: REI };

// ---------------------------------------------------------------- scenery
// Full-bleed prop layers (background gradients live in CSS per stage).
// viewBox 1200x700, sliced — safe zones keep props off the arena center.

const SCENE_TAVERNA = `
<svg class="scene" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect x="0" y="0" width="1200" height="34" fill="#2a1c10"/>
  <rect x="0" y="34" width="1200" height="8" fill="#1c1209"/>
  <rect x="140" y="0" width="26" height="120" fill="#2a1c10"/>
  <rect x="1020" y="0" width="26" height="120" fill="#2a1c10"/>
  <g transform="translate(1050 210)">
    <circle r="74" fill="#0d1626"/>
    <circle r="74" fill="none" stroke="#6d4c2a" stroke-width="12"/>
    <circle r="74" fill="none" stroke="#8a6540" stroke-width="4"/>
    <circle cx="-26" cy="-30" r="15" fill="#f4e9d2" opacity=".9"/>
    <path d="M-60 34 Q-30 26 0 34 Q30 42 60 34 L60 60 L-60 60 Z" fill="#14263c"/>
    <path d="M18 20 L18 -8 L38 12 Z" fill="#22304a"/><rect x="16" y="18" width="4" height="20" fill="#1a2438"/>
  </g>
  <g transform="translate(150 110)">
    <path d="M0 -110 L0 0" stroke="#3a2a18" stroke-width="4"/>
    <path d="M-18 6 Q-22 -12 0 -14 Q22 -12 18 6 L14 44 Q0 52 -14 44 Z" fill="#503a20"/>
    <ellipse class="flame" cx="0" cy="24" rx="11" ry="15" fill="#ffcf7a"/>
    <ellipse class="flame" cx="0" cy="27" rx="5.5" ry="8" fill="#fff3d0"/>
    <circle class="lantern-glow" r="58" cy="20" fill="#ffb84f" opacity=".10"/>
  </g>
  <g transform="translate(1005 545)">
    <g><ellipse cx="0" cy="96" rx="62" ry="14" fill="#000" opacity=".3"/>
    <path d="M-52 10 Q-58 55 -52 96 L52 96 Q58 55 52 10 Q30 2 0 2 Q-30 2 -52 10 Z" fill="#6d4c2a"/>
    <ellipse cx="0" cy="8" rx="52" ry="12" fill="#8a6540"/>
    <path d="M-55 34 L55 34 M-56 62 L56 62" stroke="#3a2a18" stroke-width="6"/></g>
    <g transform="translate(84 34)"><path d="M-38 8 Q-42 40 -38 66 L38 66 Q42 40 38 8 Q20 2 0 2 Q-20 2 -38 8 Z" fill="#5d4023"/>
    <ellipse cx="0" cy="7" rx="38" ry="9" fill="#795936"/>
    <path d="M-40 30 L40 30 M-40 48 L40 48" stroke="#33230f" stroke-width="5"/></g>
  </g>
  <g transform="translate(95 640)" stroke="#8a6540" fill="none" stroke-linecap="round">
    <ellipse rx="52" ry="15" stroke-width="9"/>
    <ellipse rx="34" ry="10" stroke-width="8"/>
    <path d="M40 -8 Q70 -26 96 -18" stroke-width="8"/>
  </g>
  <g transform="translate(238 655)" fill="#2b2b33">
    <ellipse rx="34" ry="15"/>
    <circle cx="26" cy="-8" r="12"/>
    <path d="M18 -16 L15 -26 L24 -19 Z"/><path d="M32 -17 L36 -27 L27 -20 Z"/>
    <path d="M-30 4 Q-48 2 -44 -12" stroke="#2b2b33" stroke-width="7" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;

const SCENE_COBERTA = `
<svg class="scene" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <circle cx="980" cy="110" r="52" fill="#ffe9b0" opacity=".95"/>
  <circle cx="980" cy="110" r="86" fill="#ffe9b0" opacity=".22"/>
  <rect x="0" y="368" width="1200" height="70" fill="#1b5f86" opacity=".85"/>
  <path d="M0 372 Q100 366 200 372 T400 372 T600 372 T800 372 T1000 372 T1200 372 L1200 380 L0 380 Z" fill="#bfe3e0" opacity=".5"/>
  <path d="M690 368 Q740 336 800 368 Z" fill="#2a5a70" opacity=".8"/>
  <g>
    <rect x="118" y="0" width="18" height="470" fill="#5d4023"/>
    <path d="M136 60 Q400 90 560 330 L136 330 Z" fill="#f0e6cc"/>
    <path d="M136 60 Q380 100 520 330" stroke="#d8c9a8" stroke-width="5" fill="none"/>
    <path d="M136 46 Q420 60 580 344" stroke="#3a2a18" stroke-width="7" fill="none"/>
    <g class="pennant">
      <path d="M136 18 L240 30 L136 44 Z" fill="#e0b64f"/>
      <path d="M136 22 L215 31 L136 27 Z M136 33 L215 31 L136 40 Z" fill="#c73e46"/>
    </g>
  </g>
  <g stroke="#3a2a18" stroke-width="4" opacity=".85">
    <path d="M1200 40 L980 470 M1200 120 L1040 470 M1200 210 L1105 470"/>
    <path d="M1035 240 L1200 300 M1005 330 L1200 390" stroke-width="3"/>
  </g>
  <g class="gull g1" stroke="#f4f6f8" stroke-width="5" fill="none" stroke-linecap="round">
    <path d="M300 150 Q315 138 330 150 M330 150 Q345 138 360 150"/>
  </g>
  <g class="gull g2" stroke="#e5eaee" stroke-width="4" fill="none" stroke-linecap="round">
    <path d="M760 100 Q772 91 784 100 M784 100 Q796 91 808 100"/>
  </g>
  <g>
    <rect x="0" y="560" width="1200" height="22" fill="#6d4c2a"/>
    <rect x="0" y="582" width="1200" height="118" fill="#5d4023"/>
    <g fill="#4a3117">
      <rect x="60" y="582" width="16" height="118"/><rect x="270" y="582" width="16" height="118"/>
      <rect x="480" y="582" width="16" height="118"/><rect x="700" y="582" width="16" height="118"/>
      <rect x="915" y="582" width="16" height="118"/><rect x="1120" y="582" width="16" height="118"/>
    </g>
    <path d="M0 588 L1200 588" stroke="#8a6540" stroke-width="3"/>
  </g>
</svg>`;

const SCENE_CALA = `
<svg class="scene" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <g fill="#f4f0ff" class="stars">
    <circle cx="140" cy="70" r="2.2"/><circle cx="330" cy="40" r="1.6"/><circle cx="520" cy="90" r="2"/>
    <circle cx="700" cy="50" r="1.5"/><circle cx="1080" cy="80" r="2.2"/><circle cx="920" cy="40" r="1.4"/>
  </g>
  <circle cx="600" cy="240" r="130" fill="#f2ecd8"/>
  <circle cx="560" cy="210" r="16" fill="#ddd5bc" opacity=".8"/>
  <circle cx="640" cy="270" r="22" fill="#ddd5bc" opacity=".7"/>
  <circle cx="615" cy="195" r="10" fill="#ddd5bc" opacity=".6"/>
  <circle cx="600" cy="240" r="170" fill="#f2ecd8" opacity=".14"/>
  <rect x="0" y="400" width="1200" height="300" fill="#141e38" opacity=".7"/>
  <g class="glints" stroke="#e9e2c8" stroke-linecap="round">
    <path d="M540 430 L660 430" stroke-width="5" opacity=".7"/>
    <path d="M560 460 L640 460" stroke-width="4" opacity=".5"/>
    <path d="M575 492 L625 492" stroke-width="4" opacity=".4"/>
    <path d="M555 530 L645 530" stroke-width="5" opacity=".3"/>
  </g>
  <path d="M0 0 L0 700 L260 700 L240 560 Q200 540 210 480 Q160 470 170 400 Q120 390 130 320 Q90 300 96 220 Q60 200 70 120 Q40 90 40 0 Z" fill="#131226"/>
  <path d="M1200 0 L1200 700 L950 700 L975 580 Q1020 560 1010 500 Q1060 480 1050 410 Q1100 390 1090 320 Q1140 290 1130 200 Q1170 160 1160 60 Q1190 40 1200 0 Z" fill="#131226"/>
  <path d="M0 700 L0 470 Q70 480 110 560 Q140 630 150 700 Z" fill="#ff9e4f" opacity=".22" class="cave-glow"/>
  <g transform="translate(880 610)">
    <path d="M-70 0 Q0 26 70 0 Q40 22 0 22 Q-40 22 -70 0 Z" fill="#0c0b18"/>
    <rect x="-4" y="-38" width="5" height="40" fill="#0c0b18"/>
  </g>
  <g transform="translate(170 640)" fill="#241d33">
    <rect x="-40" y="-34" width="52" height="40" rx="3"/>
    <rect x="16" y="-24" width="40" height="30" rx="3" fill="#1c1729"/>
    <path d="M-40 -14 L12 -14 M-14 -34 L-14 6" stroke="#3a3050" stroke-width="3"/>
  </g>
</svg>`;

const SCENE_ABISSAL = `
<svg class="scene" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <g class="shafts" fill="#3adfd2">
    <polygon points="220,0 320,0 190,700 40,700" opacity=".05"/>
    <polygon points="560,0 640,0 720,700 560,700" opacity=".04"/>
    <polygon points="900,0 1000,0 1140,700 980,700" opacity=".05"/>
  </g>
  <g fill="#061a20">
    <g transform="rotate(-12 200 560)">
      <rect x="192" y="240" width="14" height="360"/>
      <rect x="120" y="300" width="160" height="12"/>
      <path d="M206 260 L300 300 L206 330 Z" opacity=".85"/>
    </g>
    <g transform="rotate(9 1000 600)">
      <rect x="994" y="300" width="12" height="330"/>
      <rect x="930" y="360" width="140" height="10"/>
      <path d="M994 316 L910 352 L994 380 Z" opacity=".85"/>
    </g>
    <path d="M420 700 Q520 640 700 668 Q860 690 900 700 Z"/>
  </g>
  <g opacity=".045" fill="#7df5e8" transform="translate(600 330)">
    <circle r="150"/>
    <circle cx="-52" cy="-16" r="34" fill="#03161c"/>
    <circle cx="52" cy="-16" r="34" fill="#03161c"/>
    <path d="M-20 60 L20 60 L0 96 Z" fill="#03161c"/>
  </g>
  <g class="jelly j1" transform="translate(180 420)">
    <path d="M-30 0 Q0 -44 30 0 Q15 8 0 8 Q-15 8 -30 0 Z" fill="#9a7df5" opacity=".55"/>
    <g stroke="#9a7df5" stroke-width="3" fill="none" opacity=".4" stroke-linecap="round">
      <path d="M-18 6 Q-22 40 -14 68"/><path d="M0 8 Q4 44 -4 76"/><path d="M18 6 Q24 40 16 64"/>
    </g>
  </g>
  <g class="jelly j2" transform="translate(1050 300)">
    <path d="M-22 0 Q0 -34 22 0 Q11 6 0 6 Q-11 6 -22 0 Z" fill="#7df5e8" opacity=".4"/>
    <g stroke="#7df5e8" stroke-width="2.5" fill="none" opacity=".3" stroke-linecap="round">
      <path d="M-12 5 Q-16 30 -9 52"/><path d="M10 5 Q15 30 8 48"/>
    </g>
  </g>
  <g class="bubbles" fill="none" stroke="#7df5e8" opacity=".35">
    <circle cx="330" cy="600" r="6" stroke-width="2"/>
    <circle cx="352" cy="650" r="4" stroke-width="2"/>
    <circle cx="318" cy="662" r="3" stroke-width="1.6"/>
  </g>
  <g class="bubbles b2" fill="none" stroke="#7df5e8" opacity=".28">
    <circle cx="860" cy="580" r="5" stroke-width="2"/>
    <circle cx="884" cy="632" r="3.4" stroke-width="1.8"/>
  </g>
</svg>`;

export const SCENERY: Record<string, string> = {
  taverna: SCENE_TAVERNA,
  coberta: SCENE_COBERTA,
  cala: SCENE_CALA,
  abissal: SCENE_ABISSAL,
};

// ------------------------------------------------------------- wave strip
// Two parallax layers; CSS scrolls them. Path repeats every 150px over a
// 2400px width so a -1200px translate loops seamlessly.
export const WAVES_SVG = `
<svg class="waves-svg" viewBox="0 0 1200 90" preserveAspectRatio="none" aria-hidden="true">
  <path class="wave-b" d="M0 42 Q75 18 150 42 T300 42 T450 42 T600 42 T750 42 T900 42 T1050 42 T1200 42 T1350 42 T1500 42 T1650 42 T1800 42 T1950 42 T2100 42 T2250 42 T2400 42 L2400 90 L0 90 Z"/>
  <path class="wave-a" d="M0 58 Q75 38 150 58 T300 58 T450 58 T600 58 T750 58 T900 58 T1050 58 T1200 58 T1350 58 T1500 58 T1650 58 T1800 58 T1950 58 T2100 58 T2250 58 T2400 58 L2400 90 L0 90 Z"/>
</svg>`;

// --------------------------------------------------------------- wordmark
// Skull over two crossed forearms whose hands throw 5 and 2 — morra bones.
export const WORDMARK_SVG = `
<svg class="wordmark-svg" viewBox="0 0 560 300" role="img" aria-label="Morra — el duel dels corsaris">
  <defs>
    <linearGradient id="wm-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4d98a"/><stop offset=".55" stop-color="#e0b64f"/><stop offset="1" stop-color="#a87c22"/>
    </linearGradient>
  </defs>

  <!-- the word: letters placed one by one so the skull owns the O -->
  <g class="wm-text" fill="url(#wm-gold)" stroke="#161d2c" stroke-width="4" paint-order="stroke">
    <text x="88" y="188" text-anchor="middle">M</text>
    <text x="185" y="188" text-anchor="middle">O</text>
    <text x="275" y="188" text-anchor="middle">R</text>
    <text x="360" y="188" text-anchor="middle">R</text>
    <text x="448" y="188" text-anchor="middle">A</text>
  </g>

  <!-- crossed bones through the O — the hands call 2 i 5, a morra throw -->
  <g transform="translate(185 148)">
    <g stroke="#161d2c" stroke-width="16" stroke-linecap="round" opacity=".9">
      <path d="M-52 34 L52 -34"/>
      <path d="M52 34 L-52 -34"/>
    </g>
    <g stroke="#d8c9a8" stroke-width="11" stroke-linecap="round">
      <path d="M-52 34 L52 -34"/>
      <path d="M52 34 L-52 -34"/>
    </g>
    <!-- lower ends: bone knobs -->
    <g fill="#d8c9a8" stroke="#161d2c" stroke-width="2.5">
      <circle cx="-56" cy="30" r="7"/><circle cx="-49" cy="39" r="7"/>
      <circle cx="56" cy="30" r="7"/><circle cx="49" cy="39" r="7"/>
    </g>
    <!-- upper-left hand: FIVE -->
    <g transform="translate(-56 -38) rotate(-30)" fill="#d8c9a8" stroke="#161d2c" stroke-width="2">
      <ellipse rx="13" ry="10.5"/>
      <g stroke="#d8c9a8" stroke-width="5.5" stroke-linecap="round">
        <path d="M-7 -8 L-13 -23"/><path d="M-1 -10 L-2 -27"/><path d="M5 -9 L9 -25"/><path d="M10 -5 L18 -17"/><path d="M-11 -2 L-24 -7"/>
      </g>
    </g>
    <!-- upper-right hand: TWO -->
    <g transform="translate(56 -38) rotate(30)" fill="#d8c9a8" stroke="#161d2c" stroke-width="2">
      <ellipse rx="13" ry="10.5"/>
      <g stroke="#d8c9a8" stroke-width="5.5" stroke-linecap="round">
        <path d="M-4 -10 L-8 -27"/><path d="M4 -10 L8 -27"/>
      </g>
    </g>
  </g>

  <!-- the skull, on the O -->
  <g transform="translate(185 144)">
    <path d="M-30 -6 Q-30 -40 0 -40 Q30 -40 30 -6 Q30 10 19 15 L19 26 Q10 31 0 31 Q-10 31 -19 26 L-19 15 Q-30 10 -30 -6 Z" fill="#f0e6cc" stroke="#161d2c" stroke-width="3"/>
    <circle cx="-11.5" cy="-7" r="8.2" fill="#161d2c"/>
    <circle cx="11.5" cy="-7" r="8.2" fill="#161d2c"/>
    <path d="M0 1 L5 12 L-5 12 Z" fill="#161d2c"/>
    <path d="M-11 21 L-11 28 M-3.5 23 L-3.5 30 M3.5 23 L3.5 30 M11 21 L11 28" stroke="#161d2c" stroke-width="3" stroke-linecap="round"/>
  </g>

  <!-- the anchor, closing the word — turned 90 graus -->
  <g transform="translate(517 152) rotate(-90) scale(.95)">
    <g stroke="#161d2c" stroke-width="15" stroke-linecap="round" fill="none">
      <circle cx="0" cy="-36" r="9"/>
      <path d="M-19 -20 L19 -20"/>
      <path d="M0 -27 L0 34"/>
      <path d="M-27 8 Q0 42 27 8"/>
    </g>
    <g stroke="#e0b64f" stroke-width="8.5" stroke-linecap="round" fill="none">
      <circle cx="0" cy="-36" r="9"/>
      <path d="M-19 -20 L19 -20"/>
      <path d="M0 -27 L0 34"/>
      <path d="M-27 8 Q0 42 27 8"/>
    </g>
    <path d="M-27 8 L-38 16 L-24 22 Z" fill="#e0b64f" stroke="#161d2c" stroke-width="3" stroke-linejoin="round"/>
    <path d="M27 8 L38 16 L24 22 Z" fill="#e0b64f" stroke="#161d2c" stroke-width="3" stroke-linejoin="round"/>
  </g>

  <!-- the rope, under it all -->
  <g fill="none" stroke-linecap="round">
    <path id="wm-rope" d="M52 238 Q170 262 280 258 Q390 254 508 232" stroke="#161d2c" stroke-width="13"/>
    <path d="M52 238 Q170 262 280 258 Q390 254 508 232" stroke="#8a6540" stroke-width="10"/>
    <g stroke="#5f4527" stroke-width="2.6">
      <path d="M76 233 L84 245"/><path d="M108 238 L116 250"/><path d="M140 242 L148 254"/><path d="M172 245 L180 257"/>
      <path d="M204 247 L212 259"/><path d="M236 248 L244 260"/><path d="M268 248 L276 260"/><path d="M300 247 L308 259"/>
      <path d="M332 246 L340 258"/><path d="M364 244 L372 256"/><path d="M396 241 L404 253"/><path d="M428 237 L436 249"/>
      <path d="M460 232 L468 244"/><path d="M488 227 L496 239"/>
    </g>
    <path d="M52 238 q-10 -8 -4 -16 q7 -8 14 0 q5 8 -10 16 Z" fill="#8a6540" stroke="#161d2c" stroke-width="2.5"/>
    <path d="M508 232 q12 -6 8 -15 q-6 -9 -15 -2 q-7 7 7 17 Z" fill="#8a6540" stroke="#161d2c" stroke-width="2.5"/>
  </g>
</svg>`;
