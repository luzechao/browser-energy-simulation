// Figure 1 — ASHRAE 140-2023 Section 7 annual acceptance comparisons.
//
// Data provenance:
//   - normative bounds/counts: test/ep-reference/ashrae140-2023/ashrae140_2023_ranges.json
//   - measured WASM values: paper1/data/ashrae140_2023_results.json
//
// Output: paper1/figures/fig1_ashrae140.svg and fig1_ashrae140.png
// Run: node paper1/figures/make_fig1.mjs
import fs from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const criteria = JSON.parse(
  fs.readFileSync(new URL('test/ep-reference/ashrae140-2023/ashrae140_2023_ranges.json', ROOT), 'utf8'),
);
const results = JSON.parse(
  fs.readFileSync(new URL('paper1/data/ashrae140_2023_results.json', ROOT), 'utf8'),
);

const W = 1200;
const H = 1450;
const DOMAIN = [-3.4, 7.0];
const FONT = 'Arial, Helvetica, sans-serif';
const COLORS = {
  heat: '#1f5a94',
  cool: '#c45b16',
  band: '#cbd3dc',
  bandEdge: '#7f8b99',
  grid: '#e7eaee',
  text: '#18202a',
  muted: '#59636f',
};

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function expressionValue(test) {
  const current = results.cases[test.expression.case][test.metric];
  return test.expression.minus
    ? current - results.cases[test.expression.minus][test.metric]
    : current;
}

function testLabel(test) {
  const expression = test.expression.minus
    ? `${test.expression.case}−${test.expression.minus}`
    : test.expression.case;
  return `${expression} · ${test.metric === 'heating' ? 'H' : 'C'}`;
}

const panelX = 38;
const panelW = W - panelX * 2;
const plotX0 = 226;
const plotX1 = 1018;
const valueX = 1162;
const axisYPad = 68;
const panelHeight = 650;
const panelTops = [40, 735];
const X = (value) => plotX0 + ((value - DOMAIN[0]) / (DOMAIN[1] - DOMAIN[0])) * (plotX1 - plotX0);

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<rect width="${W}" height="${H}" fill="white"/>
`;

criteria.groups.forEach((group, groupIndex) => {
  const top = panelTops[groupIndex];
  const tests = group.tests;
  const rowTop = top + axisYPad;
  const rowBottom = top + panelHeight - 50;
  const rowStep = (rowBottom - rowTop) / tests.length;
  const groupResult = results.groups[group.id];

  svg += `<rect x="${panelX}" y="${top}" width="${panelW}" height="${panelHeight}" rx="8" fill="#fbfcfd" stroke="#aeb7c2"/>
<text x="${panelX + 18}" y="${top + 30}" font-size="23" font-weight="700" fill="${COLORS.text}">${groupIndex === 0 ? '(a)' : '(b)'} ${esc(group.label)}</text>
<text x="${valueX}" y="${top + 30}" font-size="19" font-weight="700" text-anchor="end" fill="#1b6b3a">${groupResult.passing}/${groupResult.total} pass; minimum ${groupResult.minimum}</text>
<text x="${plotX0}" y="${top + 53}" font-size="16" fill="${COLORS.muted}">Annual load or case difference (MWh)</text>
<text x="${valueX}" y="${top + 53}" font-size="16" text-anchor="end" fill="${COLORS.muted}">WASM result</text>
`;

  for (const tick of [-3, 0, 3, 6]) {
    const x = X(tick);
    svg += `<line x1="${x}" y1="${rowTop - 10}" x2="${x}" y2="${rowBottom + 10}" stroke="${tick === 0 ? '#aab2bc' : COLORS.grid}" stroke-width="${tick === 0 ? 1.5 : 1}" ${tick === 0 ? 'stroke-dasharray="5 4"' : ''}/>
<text x="${x}" y="${rowBottom + 34}" font-size="17" text-anchor="middle" fill="${COLORS.muted}">${tick}</text>
`;
  }

  tests.forEach((test, index) => {
    const y = rowTop + rowStep * (index + 0.5);
    const value = expressionValue(test);
    const minX = X(test.min);
    const maxX = X(test.max);
    const color = test.metric === 'heating' ? COLORS.heat : COLORS.cool;
    const pass = value >= test.min && value <= test.max;

    if (index % 2 === 1) {
      svg += `<rect x="${panelX + 1}" y="${y - rowStep / 2}" width="${panelW - 2}" height="${rowStep}" fill="#f5f7f9"/>\n`;
    }
    svg += `<text x="${plotX0 - 14}" y="${y + 6}" font-size="18" text-anchor="end" fill="${COLORS.text}">${esc(testLabel(test))}</text>
<line x1="${minX}" y1="${y}" x2="${maxX}" y2="${y}" stroke="${COLORS.band}" stroke-width="11" stroke-linecap="round"/>
<line x1="${minX}" y1="${y - 7}" x2="${minX}" y2="${y + 7}" stroke="${COLORS.bandEdge}" stroke-width="1.5"/>
<line x1="${maxX}" y1="${y - 7}" x2="${maxX}" y2="${y + 7}" stroke="${COLORS.bandEdge}" stroke-width="1.5"/>
`;
    if (test.metric === 'heating') {
      svg += `<circle cx="${X(value)}" cy="${y}" r="6" fill="${pass ? color : '#b42318'}" stroke="white" stroke-width="1.5"/>\n`;
    } else {
      const x = X(value);
      svg += `<path d="M ${x} ${y - 7} L ${x + 7} ${y} L ${x} ${y + 7} L ${x - 7} ${y} Z" fill="${pass ? color : '#b42318'}" stroke="white" stroke-width="1.5"/>\n`;
    }
    svg += `<text x="${valueX}" y="${y + 6}" font-size="18" text-anchor="end" fill="${COLORS.text}">${value.toFixed(3)}</text>\n`;
  });
});

const legendY = H - 28;
svg += `<line x1="50" y1="${legendY}" x2="98" y2="${legendY}" stroke="${COLORS.band}" stroke-width="11" stroke-linecap="round"/>
<text x="110" y="${legendY + 6}" font-size="18" fill="${COLORS.text}">ASHRAE 140-2023 inclusive acceptance range</text>
<circle cx="520" cy="${legendY}" r="6" fill="${COLORS.heat}"/>
<text x="534" y="${legendY + 6}" font-size="18" fill="${COLORS.text}">heating</text>
<path d="M 650 ${legendY - 7} L 657 ${legendY} L 650 ${legendY + 7} L 643 ${legendY} Z" fill="${COLORS.cool}"/>
<text x="666" y="${legendY + 6}" font-size="18" fill="${COLORS.text}">cooling</text>
<text x="1180" y="${legendY + 6}" font-size="17" text-anchor="end" fill="${COLORS.muted}">H/C = annual heating/cooling</text>
</svg>
`;

const svgUrl = new URL('paper1/figures/fig1_ashrae140.svg', ROOT);
const pngUrl = new URL('paper1/figures/fig1_ashrae140.png', ROOT);
fs.writeFileSync(svgUrl, svg);
console.log('wrote paper1/figures/fig1_ashrae140.svg');

try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    env: {
      ...process.env,
      LD_LIBRARY_PATH: ['/tmp/ashrae140-browser-libs/usr/lib/x86_64-linux-gnu', process.env.LD_LIBRARY_PATH || '']
        .filter(Boolean)
        .join(':'),
    },
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(svgUrl.href, { waitUntil: 'load' });
  await page.screenshot({ path: pngUrl.pathname, omitBackground: false });
  await browser.close();
  console.log('wrote paper1/figures/fig1_ashrae140.png');
} catch (error) {
  console.warn(`PNG render skipped: ${error.message}`);
}

for (const group of criteria.groups) {
  const passing = group.tests.filter((test) => {
    const value = expressionValue(test);
    return value >= test.min && value <= test.max;
  }).length;
  console.log(`${group.id}: ${passing}/${group.tests.length}, minimum ${group.minimum_passing}`);
}
