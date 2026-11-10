// Turn dist/ into a claude.ai artifact page: inline CSS, no html/head/body wrapper.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const css = [...html.matchAll(/href="\.\/(assets\/[^"]+\.css)"/g)].map((m) => fs.readFileSync(path.join(dist, m[1]), 'utf8').replace(/url\(\.\//g, 'url(./assets/')).join('\n');
const js = html.match(/src="\.\/(assets\/index-[^"]+\.js)"/)[1];
const page = `<title>MonthLens</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="A plain-English monthly business review for online business owners.">
<style>${css}</style>
<div id="root"></div>
<script type="module" src="${js}"></script>
`;
fs.writeFileSync(path.join(dist, 'artifact.html'), page);
const files = {};
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return walk(p);
  const rel = path.relative(dist, p);
  // the offline worker and manifest only apply to the standalone web app
  if (rel === 'index.html' || rel === 'artifact.html' || rel.endsWith('.css') || rel.endsWith('.map') || rel === 'sw.js' || rel.startsWith('workbox-') || rel === 'manifest.webmanifest') return;
  files[rel] = rel.endsWith('.mjs') ? { from: rel, contentType: 'text/javascript' }  : rel;
});
walk(dist);
fs.writeFileSync(path.join(dist, 'artifact-files.json'), JSON.stringify(files, null, 1));
console.log(Object.keys(files).length, 'files', (fs.statSync(path.join(dist, 'artifact.html')).size / 1024).toFixed(1) + 'KB page');
