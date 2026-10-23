// Regrava docs/nova/app/data/mercado.json a partir de docs/nova/legado/obra-ev/mercado.html.
// A tela Mercado EV da Nova usa esse resumo pronto enquanto a impressão digital (SHA-1) da página
// original bater; se não bater, lê a página original na hora (mais lento). Rodar depois de editar
// mercado.html (ex.: atualização mensal da ABVE). Usa o mesmo leitor da tela (reader em
// app/views/mercado.js) dentro de um Chromium sem janela (Playwright).
//
// Uso: node scripts/gerar_mercado_snapshot.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const NOVA = path.join(__dirname, '..', 'docs', 'nova');
const SRC = 'legado/obra-ev/mercado.html';
const OUT = path.join(NOVA, 'app', 'data', 'mercado.json');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };

// O leitor é a função reader(w) da própria tela: copiada do arquivo, para não manter duas versões.
function readerSource() {
  const js = fs.readFileSync(path.join(NOVA, 'app', 'views', 'mercado.js'), 'utf8');
  const start = js.indexOf('  function reader(w) {');
  const end = js.indexOf('\n  }\n', start);
  if (start < 0 || end < 0) throw new Error('Função reader não encontrada em app/views/mercado.js.');
  return js.slice(start, end + 4);
}

// Os arquivos da Nova são servidos por interceptação (endereço fictício http://nova.local), sem
// servidor local: atrás de proxy, o Chromium mandaria até o 127.0.0.1 para o proxy.
const HOST = 'http://nova.local';

async function main() {
  const html = fs.readFileSync(path.join(NOVA, SRC));
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy; // para o Chart.js do CDN
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.route(`${HOST}/**`, route => {
      const file = path.join(NOVA, path.normalize(decodeURIComponent(new URL(route.request().url()).pathname)));
      // Barra lateral e guarda de backup exigem login e mandariam para login.html; não têm dados do painel.
      if (/[\\/](sidebar|backup_guard)\.js$/.test(file)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      if (!file.startsWith(NOVA) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await page.goto(`${HOST}/${SRC}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500); // mesma espera da tela (gráficos e contadores)
    const data = await page.evaluate(src => JSON.parse(JSON.stringify(new Function(`${src}; return reader;`)()(window))), readerSource());
    if (!data.pages?.length) throw new Error('A página original não devolveu nenhuma aba.');
    const snap = { generatedAt: new Date().toISOString(), source: SRC, sourceHash: crypto.createHash('sha1').update(html).digest('hex'), data };
    fs.writeFileSync(OUT, JSON.stringify(snap));
    console.log(`Gravado ${path.relative(process.cwd(), OUT)}: ${data.pages.length} abas, ${Object.keys(data.charts).length} gráficos, "${data.updated}".`);
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
