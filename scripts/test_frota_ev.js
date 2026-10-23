// Frota EV por município (scripts/atualizar_frota_ev.js): achar a planilha do mês e casar os nomes com o IBGE.
const assert = require('assert');
const { listFiles, loose, readPopulation } = require('./atualizar_frota_ev.js');

// Links como aparecem nas páginas da Senatran: "copy_of_", minúsculas, "Maro" sem o ç, outras planilhas no meio.
const html = `
  <a href="/transportes/pt-br/assuntos/transito/conteudo-Senatran/frota-de-veiculos-2026-2/D_Frota_por_UF_Municipio_COMBUSTIVEL_Setembro_2026.xlsx/@@download/file">set</a>
  <a href="/transportes/pt-br/assuntos/transito/conteudo-Senatran/frota-de-veiculos-2026-2/copy_of_D_Frota_por_UF_Municipio_COMBUSTIVEL_Julho_2026.xlsx/@@download/file">jul</a>
  <a href="/transportes/pt-br/assuntos/transito/conteudo-Senatran/frota-de-veiculos-2026-2/D_Frota_por_UF_Municipio_COMBUSTIVEL_Maro_2026.xlsx/@@download/file">mar</a>
  <a href="/transportes/pt-br/assuntos/transito/conteudo-Senatran/arquivos-renavam-2025/d_frota_por_uf_municipio_combustivel_agosto_2025-1.xlsx/@@download/file">ago</a>
  <a href="/transportes/pt-br/assuntos/transito/conteudo-Senatran/E_Frota_por_UF_Municipio_POTENCIA_Abril_2026.xlsx/@@download/file">potência</a>`;
const files = listFiles(html);
assert.deepStrictEqual([...files.keys()].sort(), ['2025-08', '2026-03', '2026-07', '2026-09']);
assert.ok(files.get('2026-09').startsWith('https://www.gov.br/transportes/'), 'link relativo vira absoluto');
assert.ok(/copy_of_D_Frota/.test(files.get('2026-07')));

// Grafias da Senatran × IBGE que precisam casar.
[['LAGEDO DO TABOCAL', 'Lajedo do Tabocal'], ['MUNHOZ DE MELLO', 'Munhoz de Melo'], ['BELA VISTA DO CAROBA', 'Bela Vista da Caroba'],
 ['BARAO D0 MONTE ALTO', 'Barão de Monte Alto'], ['SANTA ISABEL DO PARA', 'Santa Izabel do Pará'], ["ALTA FLORESTA D'OESTE", "Alta Floresta D'Oeste"]]
  .forEach(([senatran, ibge]) => assert.strictEqual(loose(senatran), loose(ibge), `${senatran} × ${ibge}`));
assert.notStrictEqual(loose('SANTA CRUZ'), loose('SANTA RITA'));

// População: exato, aproximado, renomeado; chave aproximada repetida no mesmo estado não casa.
const pop = readPopulation([{ D1N: 'Município' },
  { D1N: 'Maringá - PR', D1C: '4115200', V: '432635', D3N: '2026' },
  { D1N: 'Munhoz de Melo - PR', D1C: '4116307', V: '4000', D3N: '2026' },
  { D1N: 'Joca Claudino - PB', D1C: '2513653', V: '2700', D3N: '2026' },
  { D1N: 'São Luís - XX', D1C: '1', V: '1', D3N: '2026' }, { D1N: 'São Luiz - XX', D1C: '2', V: '2', D3N: '2026' }]);
assert.strictEqual(pop.year, '2026');
assert.strictEqual(pop.find('PR', 'MARINGA').pop, 432635);
assert.strictEqual(pop.find('PR', 'MUNHOZ DE MELLO').name, 'Munhoz de Melo');
assert.strictEqual(pop.find('PB', 'SANTAREM').name, 'Joca Claudino');
assert.strictEqual(pop.find('SP', 'MARINGA'), null, 'outro estado não casa');
assert.strictEqual(pop.find('XX', 'SAO LUYS'), null, 'ambíguo não casa');
console.log('test_frota_ev: ok');
