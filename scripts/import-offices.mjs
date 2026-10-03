import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
// Read a locally downloaded public directory page; never execute its JavaScript.
const html = readFileSync('.tools/directory-page.html', 'utf8');
const decode = (value) =>
  value
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim();
const pattern =
  /var etude(\d+) = \{lat:([-\d.]+),lng:([-\d.]+)\};\s*var contentString\1 = '(<div>.*?)';/g;
const offices = [];
const seen = new Set();
for (const match of html.matchAll(pattern)) {
  const detail = match[4].match(
    /href="fiche\.aspx\?id=(\d+)">(.+?)<\/a><\/h1>\s*(\d{5}) - (.*?)<\/div>/,
  );
  if (!detail) continue;
  const lat = Number(match[2]),
    lng = Number(match[3]);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180 ||
    (lat === 0 && lng === 0)
  )
    continue;
  const id = `${detail[1]}-${lat}-${lng}`;
  if (seen.has(id)) continue;
  seen.add(id);
  offices.push({
    id,
    name: decode(detail[2]),
    city: decode(detail[4]),
    postalCode: detail[3],
    lat,
    lng,
    directoryUrl: `https://annuaire.commissaire-justice.fr/fiche.aspx?id=${detail[1]}`,
  });
}
if (offices.length < 100)
  throw new Error('Directory format changed or incomplete download; refusing to replace catalog.');
mkdirSync('public', { recursive: true });
writeFileSync(
  'public/offices.json',
  JSON.stringify({
    source: 'https://annuaire.commissaire-justice.fr/',
    retrievedAt: new Date().toISOString().slice(0, 10),
    offices,
  }),
);
console.log(`Imported ${offices.length} public office locations.`);
