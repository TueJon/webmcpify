// Generates the README artwork (banner + pipeline) in light and dark variants.
// Both variants share one layout; only the color tokens differ, so they cannot drift.
// Run: node assets/readme/build.mjs  (tests/readme-art.test.mjs fails on stale output)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const themes = {
  light: {
    panel: '#f8f7fd', panelStroke: '#e4e2ee', ink: '#14121c', muted: '#555365',
    hairline: '#d9d6e6', primary: '#653ec7', primaryInk: '#4c279f', tint: '#efebfd',
    node: '#ffffff', gate: '#653ec7', onGate: '#ffffff', logoFill: '#f5f3fb', skeleton: '#c9c6d6',
  },
  dark: {
    panel: '#12111c', panelStroke: '#2c2a3b', ink: '#eeedf5', muted: '#a4a2b7',
    hairline: '#3a3850', primary: '#a492fb', primaryInk: '#c3b6ff', tint: '#1d1930',
    node: '#0d0c15', gate: '#7a58ea', onGate: '#ffffff', logoFill: '#1d1930', skeleton: '#3c3a4e',
  },
};

const SANS = "'Familjen Grotesk','Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif";
const MONO = "'Spline Sans Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function styles(t) {
  return `<style>
    .sans{font-family:${SANS}} .mono{font-family:${MONO}}
    .ink{fill:${t.ink}} .muted{fill:${t.muted}} .pink{fill:${t.primaryInk}}
    .line{fill:none;stroke:${t.ink};stroke-width:1.5}
    .flow{fill:none;stroke:${t.primary};stroke-width:2}
    .head{fill:${t.primary}}
  </style>`;
}

const arrowHead = (x, y, dir) => {
  // Small filled triangle whose tip sits at (x, y).
  const d = { right: `M${x} ${y} l-9 -4.5 v9 z`, down: `M${x} ${y} l-4.5 -9 h9 z`, left: `M${x} ${y} l9 -4.5 v9 z` };
  return `<path class="head" d="${d[dir]}"/>`;
};

export function banner(t) {
  const chips = ['document.modelContext', 'zero dependencies', 'MIT'];
  let x = 44;
  const chipSvg = chips.map((label) => {
    const w = Math.round(label.length * 7.7 + 26);
    const out = `<rect x="${x}" y="232" width="${w}" height="28" rx="14" fill="${t.node}" stroke="${t.hairline}"/>`
      + `<text x="${x + w / 2}" y="250.5" text-anchor="middle" class="mono muted" font-size="12.5">${esc(label)}</text>`;
    x += w + 10;
    return out;
  }).join('');
  const rows = [110, 156, 202];
  const tools = ['search_products()', 'add_to_cart()', 'track_order()'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300" role="img" aria-labelledby="t d">
  <title id="t">webmcpify — the WebMCP agent skill</title>
  <desc id="d">Make any web app agent-ready, verifiably: an agent calls typed tools that webmcpify registers in your existing app.</desc>
  ${styles(t)}
  <rect x="0.75" y="0.75" width="998.5" height="298.5" rx="16" fill="${t.panel}" stroke="${t.panelStroke}" stroke-width="1.5"/>
  <g transform="translate(40 44)">
    <rect x="5" y="11" width="54" height="42" rx="10" fill="${t.logoFill}" stroke="${t.ink}" stroke-width="6"/>
    <circle cx="23" cy="32" r="6" fill="${t.primary}"/><circle cx="41" cy="32" r="6" fill="${t.primary}"/>
  </g>
  <text x="118" y="95" class="sans ink" font-size="50" font-weight="700" letter-spacing="-1">webmcpify</text>
  <text x="44" y="156" class="sans ink" font-size="25" font-weight="600">Make any web app agent-ready — verifiably.</text>
  <text x="44" y="190" class="sans muted" font-size="16">The WebMCP agent skill for existing web apps: inventory,</text>
  <text x="44" y="212" class="sans muted" font-size="16">approve, integrate, then verify every tool in real Chrome.</text>
  ${chipSvg}
  <rect x="610" y="40" width="240" height="220" rx="8" fill="${t.node}" class="line"/>
  <line x1="610" y1="70" x2="850" y2="70" class="line"/>
  <circle cx="628" cy="55" r="4" class="line"/><circle cx="642" cy="55" r="4" class="line"/><circle cx="656" cy="55" r="4" class="line"/>
  <text x="672" y="59" class="mono muted" font-size="12">your-app.example</text>
  <rect x="628" y="86" width="90" height="10" rx="2" fill="none" stroke="${t.skeleton}" stroke-width="1.5"/>
  ${rows.map((y, i) => `<rect x="628" y="${y}" width="204" height="36" rx="3" fill="none" stroke="${t.skeleton}" stroke-width="1.5"/>`
    + `<text x="640" y="${y + 23}" class="mono pink" font-size="12.5">${tools[i]}</text>`).join('\n  ')}
  <rect x="900" y="118" width="72" height="58" rx="8" fill="${t.node}" class="line"/>
  <circle cx="924" cy="140" r="3.5" class="ink"/><circle cx="948" cy="140" r="3.5" class="ink"/>
  <line x1="921" y1="158" x2="951" y2="158" class="line"/>
  <text x="936" y="196" text-anchor="middle" class="mono muted" font-size="12">agent</text>
  <text x="862" y="104" class="mono pink" font-size="12">tool calls</text>
  <path class="flow" d="M900 133 C875 131 860 129 838 128"/>${arrowHead(836, 128, 'left')}
  <path class="flow" d="M900 147 C875 155 860 168 838 174"/>${arrowHead(836, 174, 'left')}
  <path class="flow" d="M900 161 C878 180 862 208 838 220"/>${arrowHead(836, 220, 'left')}
  <g transform="rotate(-8 826 251)">
    <rect x="770" y="236" width="112" height="30" rx="4" fill="${t.panel}" stroke="${t.primary}" stroke-width="2"/>
    <text x="826" y="256" text-anchor="middle" class="mono pink" font-size="13" font-weight="700">VERIFIED ✓</text>
  </g>
</svg>
`;
}

const stages = [
  { name: 'DETECT', lines: ['stack, routes,', 'auth and state'] },
  { name: 'INVENTORY', lines: ['reads area by area,', 'proposes a tool', 'manifest'], loop: '↻ per area' },
  { name: 'YOU APPROVE', lines: ['names, schemas,', 'read-only or', 'mutating — per tool'], gate: true },
  { name: 'INTEGRATE', lines: ['vendored runtime,', 'built + typechecked'], loop: '↻ per batch' },
  { name: 'VERIFY', lines: ['real Chrome:', 'result + UI state'] },
  { name: 'HEAL', lines: ['fixes only that', 'tool, capped'] },
  { name: 'AUDIT', lines: ['every diff hunk', 'maps to the manifest'] },
];

export function pipeline(t) {
  const cx = (i) => 86 + i * 138;
  const half = 58;
  const top = 158;
  const parts = [];
  stages.forEach((s, i) => {
    const x = cx(i);
    parts.push(`<rect x="${x - half}" y="${top}" width="${half * 2}" height="48" rx="24" fill="${s.gate ? t.gate : t.node}" stroke="${s.gate ? t.gate : t.ink}" stroke-width="1.6"/>`);
    parts.push(`<text x="${x}" y="${top + 29}" text-anchor="middle" class="mono" font-size="13.5" font-weight="700" letter-spacing="0.4" fill="${s.gate ? t.onGate : t.ink}">${s.name}</text>`);
    s.lines.forEach((line, j) => parts.push(`<text x="${x}" y="${234 + j * 18}" text-anchor="middle" class="sans muted" font-size="13">${esc(line)}</text>`));
    parts.push(`<line x1="${x}" y1="${290}" x2="${x}" y2="${318}" stroke="${t.primary}" stroke-width="1.2" stroke-dasharray="3 4"/>`);
    if (i < stages.length - 1) {
      parts.push(`<line x1="${x + half + 3}" y1="182" x2="${cx(i + 1) - half - 4}" y2="182" class="flow"/>${arrowHead(cx(i + 1) - half - 2, 182, 'right')}`);
    }
    if (s.loop) {
      parts.push(`<path class="flow" d="M${x + 34} 155 C${x + 34} 124 ${x - 34} 124 ${x - 34} 150"/>${arrowHead(x - 34, 156, 'down')}`);
      parts.push(`<text x="${x}" y="116" text-anchor="middle" class="mono pink" font-size="12">${s.loop}</text>`);
    }
    if (s.gate) parts.push(`<text x="${x}" y="140" text-anchor="middle" class="mono pink" font-size="12" font-weight="700">◆ human gate</text>`);
  });
  // VERIFY ⇄ HEAL: failed tools go to HEAL, then back to VERIFY until they pass or hit the cap.
  const v = cx(4); const h = cx(5);
  parts.push(`<path class="flow" d="M${h - 8} 155 C${h - 14} 112 ${v + 14} 112 ${v + 8} 150"/>${arrowHead(v + 8, 156, 'down')}`);
  parts.push(`<text x="${(v + h) / 2}" y="106" text-anchor="middle" class="mono pink" font-size="12">↻ re-verify, capped</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 410" role="img" aria-labelledby="t d">
  <title id="t">The webmcpify pipeline</title>
  <desc id="d">Detect, inventory, human approval of the tool manifest, integrate, verify in real Chrome, heal failures with capped retries, audit. Every phase reads and writes .webmcpify/manifest.json.</desc>
  ${styles(t)}
  <rect x="0.75" y="0.75" width="998.5" height="408.5" rx="16" fill="${t.panel}" stroke="${t.panelStroke}" stroke-width="1.5"/>
  <text x="32" y="46" class="mono muted" font-size="12.5" letter-spacing="1.6">FIG. 2 — THE PIPELINE</text>
  <text x="968" y="46" text-anchor="end" class="mono muted" font-size="12.5">↻ loops over persisted state</text>
  <line x1="32" y1="62" x2="968" y2="62" stroke="${t.hairline}" stroke-width="1"/>
  ${parts.join('\n  ')}
  <rect x="32" y="318" width="936" height="64" rx="12" fill="${t.tint}" stroke="${t.primary}" stroke-width="1.2"/>
  <path d="M52 334 h14 l7 7 v23 h-21 z M66 334 v7 h7" fill="none" stroke="${t.primaryInk}" stroke-width="1.5" stroke-linejoin="round"/>
  <text x="88" y="346" class="mono pink" font-size="15" font-weight="700">.webmcpify/manifest.json</text>
  <text x="88" y="368" class="sans muted" font-size="13">single source of truth — every phase reads and writes it</text>
  <text x="948" y="346" text-anchor="end" class="sans ink" font-size="13.5">✓ resumes across sessions, context windows and agents</text>
  <text x="948" y="368" text-anchor="end" class="sans muted" font-size="13">✓ keeps verification evidence per tool</text>
</svg>
`;
}

export const outputs = {
  'banner-light.svg': () => banner(themes.light),
  'banner-dark.svg': () => banner(themes.dark),
  'pipeline-light.svg': () => pipeline(themes.light),
  'pipeline-dark.svg': () => pipeline(themes.dark),
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, render] of Object.entries(outputs)) writeFileSync(join(here, name), render());
}
