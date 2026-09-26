/*
  Isola o armazenamento do navegador da Nova Plataforma.
  Publicada no mesmo domínio da plataforma atual, a nova dividiria o
  localStorage (sessão, rascunhos, caches). Aqui toda chave da nova ganha o
  prefixo "nova:" — a plataforma atual nunca vê nem altera o que é da nova,
  e vice-versa. Precisa ser o PRIMEIRO script de cada página.
*/
(function () {
  "use strict";
  try {
    var S = window.Storage && window.Storage.prototype;
    if (!S || S.__novaNs) return;
    var P = "nova:";
    var get = S.getItem, set = S.setItem, rem = S.removeItem, key = S.key, clr = S.clear;
    var lenGet = Object.getOwnPropertyDescriptor(S, "length").get;
    var isLocal = function (st) { try { return st === window.localStorage; } catch (e) { return false; } };
    var ownKeys = function (st) {
      var out = [], n = lenGet.call(st);
      for (var i = 0; i < n; i += 1) {
        var k = key.call(st, i);
        if (k && k.indexOf(P) === 0) out.push(k.slice(P.length));
      }
      return out;
    };
    S.getItem = function (k) { return get.call(this, isLocal(this) ? P + k : k); };
    S.setItem = function (k, v) { return set.call(this, isLocal(this) ? P + k : k, v); };
    S.removeItem = function (k) { return rem.call(this, isLocal(this) ? P + k : k); };
    S.key = function (i) {
      if (!isLocal(this)) return key.call(this, i);
      var ks = ownKeys(this);
      return i >= 0 && i < ks.length ? ks[i] : null;
    };
    S.clear = function () {
      if (!isLocal(this)) return clr.call(this);
      var self = this;
      ownKeys(this).forEach(function (k) { rem.call(self, P + k); });
    };
    Object.defineProperty(S, "length", { configurable: true, get: function () { return isLocal(this) ? ownKeys(this).length : lenGet.call(this); } });
    S.__novaNs = true;
  } catch (e) { console.error("[nova] isolamento de armazenamento indisponível", e); }
})();
