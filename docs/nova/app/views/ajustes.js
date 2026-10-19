/* Ajustes — preferências deste aparelho (notificações no celular). Não mexe em cálculo nenhum. */
(function () {
  "use strict";

  function render(target) {
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Ajustes</p><h1>Ajustes deste aparelho</h1>
        <p class="lead">Preferências que valem só para o celular ou computador que você está usando agora.</p></div></div>
      <div id="ajPush"></div>`;
    if (UBY.push) UBY.push.mount(target.querySelector("#ajPush"));
  }

  UBY.register("ajustes", { render });
})();
