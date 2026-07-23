const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'docs', 'obra-ev', 'recargas.html');
const appPath = path.join(root, 'docs', 'obra-ev', 'recargas_app.js');
const html = fs.readFileSync(htmlPath, 'utf8');
const markerMatch = html.match(/<script>\r?\nUBY_AUTH\.require\('recargas'\);/);
const start = markerMatch?.index ?? -1;
const endMatches = [...html.matchAll(/\r?\n<\/script>\r?\n<\/body>/g)];
const end = endMatches.length ? endMatches[endMatches.length - 1].index : -1;

if (start < 0 || end <= start) {
  throw new Error('Bloco principal de recargas nao encontrado ou ja extraido.');
}

const openingTagEnd = html.indexOf('>', start) + 1;
const script = html.slice(openingTagEnd, end).replace(/^\r?\n/, '').trimEnd() + '\n';
const replacement = '<script src="recargas_app.js?v=20260723-performance1"></script>';
const closingTagEnd = html.indexOf('</script>', end) + '</script>'.length;
const nextHtml = html.slice(0, start) + replacement + html.slice(closingTagEnd);

fs.writeFileSync(appPath, script, 'utf8');
fs.writeFileSync(htmlPath, nextHtml, 'utf8');
console.log(`Extraido ${script.length} bytes para ${path.relative(root, appPath)}.`);
