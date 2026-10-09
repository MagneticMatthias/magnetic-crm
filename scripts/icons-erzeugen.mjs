// Erzeugt alle App-Icons und Favicons aus dem Trichter-Symbol.
// Aufruf: node scripts/icons-erzeugen.mjs
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const BLAU = '#2f6df6';
// Trichter aus zwei Teilen: oberer Rand und Trichterkoerper, dazwischen ein Spalt.
const TRICHTER = 'M110 140H402L367.3 181H144.7Z M156.5 195H355.5L292 270V372L220 404V270Z';

// App-Icon: weisser Trichter auf blauer Kachel
const kachel = (rx, scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rx}" fill="${BLAU}"/>
  <g transform="translate(256 272) scale(${scale}) translate(-256 -272)"><path d="${TRICHTER}" fill="#fff"/></g>
</svg>`;
// Favicon: blauer Trichter auf transparentem Grund, formatfuellend
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="100 116 312 312">
  <path d="${TRICHTER}" fill="${BLAU}"/>
</svg>`;

const png = (svg, size) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toBuffer();
const dir = 'public/icons';

writeFileSync(`${dir}/icon.svg`, kachel(112));
writeFileSync(`${dir}/favicon.svg`, favicon);
writeFileSync(`${dir}/icon-192.png`, await png(kachel(112), 192));
writeFileSync(`${dir}/icon-512.png`, await png(kachel(112), 512));
// iOS rundet selbst ab, daher volle Flaeche
writeFileSync(`${dir}/apple-touch-icon.png`, await png(kachel(0), 180));
// Android "maskable": Symbol in der sicheren Mitte (80 %)
writeFileSync(`${dir}/maskable-512.png`, await png(kachel(0, 0.8), 512));
writeFileSync(`${dir}/favicon-32.png`, await png(favicon, 32));

// favicon.ico mit 16, 32 und 48 px (PNG-Eintraege)
const groessen = [16, 32, 48];
const bilder = await Promise.all(groessen.map((s) => png(favicon, s)));
const kopf = Buffer.alloc(6 + 16 * bilder.length);
kopf.writeUInt16LE(0, 0); kopf.writeUInt16LE(1, 2); kopf.writeUInt16LE(bilder.length, 4);
let offset = kopf.length;
bilder.forEach((b, i) => {
  const e = 6 + 16 * i;
  kopf.writeUInt8(groessen[i], e); kopf.writeUInt8(groessen[i], e + 1);
  kopf.writeUInt16LE(1, e + 4); kopf.writeUInt16LE(32, e + 6);
  kopf.writeUInt32LE(b.length, e + 8); kopf.writeUInt32LE(offset, e + 12);
  offset += b.length;
});
writeFileSync('src/app/favicon.ico', Buffer.concat([kopf, ...bilder]));
console.log('Icons erzeugt.');
