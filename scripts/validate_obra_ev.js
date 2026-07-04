const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const obraDir = path.join(root, "docs", "obra-ev");

const jsFiles = [
  "auth.js",
  "backup_guard.js",
  "supabase_bridge.js",
  "app_store.js",
  "sidebar.js"
].map(file => path.join(obraDir, file));

const htmlWithInlineScripts = [
  "recargas.html",
  "index.html",
  "login.html"
].map(file => path.join(obraDir, file));

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function checkScript(source, label) {
  new vm.Script(source, { filename: label });
}

function inlineScriptsFromHtml(file) {
  const html = read(file);
  const scripts = [];
  const regex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html))) scripts.push(match[1]);
  return scripts;
}

function assertNoFrontendSecrets(file) {
  const source = read(file);
  const forbidden = [/service_role/i, /service[_-]?key/i, /SUPABASE_SERVICE/i];
  forbidden.forEach(pattern => {
    if (pattern.test(source)) {
      throw new Error(`Possivel segredo exposto em ${path.relative(root, file)}: ${pattern}`);
    }
  });
}

function main() {
  jsFiles.forEach(file => {
    checkScript(read(file), path.relative(root, file));
    assertNoFrontendSecrets(file);
  });

  htmlWithInlineScripts.forEach(file => {
    inlineScriptsFromHtml(file).forEach((script, index) => {
      checkScript(script, `${path.relative(root, file)}#inline-${index + 1}`);
    });
    assertNoFrontendSecrets(file);
  });

  console.log("obra-ev validation ok");
}

main();
