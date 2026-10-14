const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('src/renderer/index.html', 'utf8');
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
if (!inlineScript) throw new Error('Could not find the original inline renderer script');

for (const file of ['src/main.js', 'src/preload.js']) {
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
}
new vm.Script(inlineScript, { filename: 'src/renderer/index.html' });
const integration = fs.readFileSync('src/renderer/native-integration.js', 'utf8');
new vm.Script(integration, { filename: 'src/renderer/native-integration.js' });
if (!html.includes('<script src="native-integration.js"></script>')) throw new Error('Native renderer integration is not loaded');
if (!fs.existsSync('src/renderer/native.css')) throw new Error('Native renderer styles are missing');
JSON.parse(fs.readFileSync('package.json', 'utf8'));

const icon = fs.readFileSync('assets/notch.ico');
if (icon.readUInt16LE(0) !== 0 || icon.readUInt16LE(2) !== 1) throw new Error('assets/notch.ico is not a valid Windows icon');
console.log('Notch source syntax, package metadata, and Windows icon are valid.');
