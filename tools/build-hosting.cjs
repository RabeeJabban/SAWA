const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'public');
const files = [
  'index.html', 'ui.css', 'app.js', 'booking.js', 'collaboration.js', 'i18n.js',
  'startup.js', 'sw.js', 'manifest.webmanifest'
];
const icons = fs.readdirSync(path.join(root, 'icons'), { withFileTypes: true })
  .filter(file => file.isFile() && /^icon[\w.-]*\.(png|svg)$/.test(file.name))
  .map(file => path.join('icons', file.name));
for (const required of ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png']) {
  if (!icons.includes(path.join('icons', required))) {
    throw new Error(`Erforderliches App-Symbol fehlt: ${required}`);
  }
}
const assets = [...files, ...icons];
for (const asset of assets) {
  if (!fs.lstatSync(path.join(root, asset)).isFile()) {
    throw new Error(`App-Datei fehlt oder ist keine normale Datei: ${asset}`);
  }
}

// Only this generated directory inside the project may be replaced.
if (path.relative(root, output) !== 'public' ||
    (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink())) {
  throw new Error('Der Veröffentlichungsordner muss direkt im Projekt liegen.');
}
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'icons'), { recursive: true });
for (const asset of assets) {
  fs.copyFileSync(path.join(root, asset), path.join(output, asset));
}
console.log(`Orbyx: ${assets.length} App-Dateien für Firebase Hosting in ${output} vorbereitet.`);
