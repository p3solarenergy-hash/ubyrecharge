"""
Financial calculation engine — recalculates projections from raw inputs.
All calculations in Python, independent of Excel formulas.
"""
import unicodedata

from utils.project_schema import schema_to_calc_inputs


def ascii_key(s):
    s = unicodedata.normalize("NFKD", str(s))
    return s.encode("ascii", errors="ignore").decode().lower().strip()


def safe_float(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _get(inputs, *keywords):
    """Find a value by matching any keyword against ascii-normalized labels."""
    for kw in keywords:
        kw_n = ascii_key(kw)
        for label, info in inputs.items():
            akey = info.get("akey") or ascii_key(label)
            if kw_n in akey:
                return safe_float(info["value"])
    return 0.0


def _weighted_energy_cost(inputs):
    """Compute weighted average energy cost from Ponta/Fora ponta/Madrugada rows."""
    rates = {}
    pcts = {}
    for label, info in inputs.items():
        akey = info.get("akey") or ascii_key(label)
        for slot in ["ponta", "fora ponta", "madrugada"]:
            if akey == slot:
                price = safe_float(info.get("value", 0))
                pct = safe_float(info.get("conservador", 0))
                if price > 0:
                    rates[slot] = price
                    pcts[slot] = pct
    total = sum(pcts.values())
    if total > 0 and rates:
        return sum(rates.get(k, 0) * pcts.get(k, 0) for k in rates) / total
    return 0.0


def _inputs_to_params(inputs):
    """Extract all needed parameters from the inputs dict."""
    if isinstance(inputs, dict) and "operational" in inputs and "pricing" in inputs:
        return schema_to_calc_inputs(inputs)

    p = {}
    # Support both new format (DC/AC split) and old format (single charger type)
    p["n_dc"] = _get(inputs, "n carregadores dc", "no carregadores dc", "numero de carregadores")
    p["n_ac"] = _get(inputs, "n carregadores ac", "no carregadores ac")
    p["pot_dc"] = _get(inputs, "potencia por carregador dc", "potencia media por carregador")
    p["pot_ac"] = _get(inputs, "potencia por carregador ac")
    p["horas"] = _get(inputs, "horas disponiveis por dia") or 24
    p["dias"] = _get(inputs, "dias por mes") or 30
    p["eficiencia"] = _get(inputs, "eficiencia") or 1.0
    p["preco_dc"] = _get(inputs, "preco de venda dc", "preco venda dc")
    p["preco_ac"] = _get(inputs, "preco de venda ac", "preco venda ac")
    # Prefer explicit field; fall back to weighted time-of-use calculation
    p["custo_kwh"] = (
        _get(inputs, "custo energia efetivo", "custo energia")
        or _weighted_energy_cost(inputs)
        or 0.88
    )
    p["pct_area"] = _get(inputs, "participacao area")
    p["pct_gestao"] = _get(inputs, "gestao p3", "gestao") or 0.15
    p["pct_imp"] = _get(inputs, "impostos sobre receita") or 0.05
    # "Custos fixos ajustados" has the scenario-correct total; fall back to base total
    p["custos_fixos"] = (
        _get(inputs, "custos fixos ajustados")
        or _get(inputs, "total custos fixos")
    )
    p["capex"] = _get(inputs, "capex total")
    p["capex_repos"] = _get(inputs, "capex reposito", "capex repos")
    p["horizonte"] = _get(inputs, "horizonte do projeto") or 60
    p["tma"] = _get(inputs, "taxa de desconto") or 0.1475
    p["ocup_dc"] = _get(inputs, "ocupacao dc", "ocupacao dc (% do tempo)") or 0.3
    p["ocup_ac"] = _get(inputs, "ocupacao ac") or 0.2
    p["cresc_energia"] = _get(inputs, "crescimento custo energia") or 0.05
    p["cresc_preco"] = _get(inputs, "crescimento preco venda") or 0.05
    p["inflacao_fixos"] = _get(inputs, "inflacao custos fixos") or 0.0
    return p


def calc_monthly(inputs: dict) -> dict:
    """Compute monthly financials from inputs dict."""
    p = _inputs_to_params(inputs)

    kwh_dc = p["n_dc"] * p["pot_dc"] * p["horas"] * p["dias"] * p["eficiencia"] * p["ocup_dc"]
    kwh_ac = p["n_ac"] * p["pot_ac"] * p["horas"] * p["dias"] * p["eficiencia"] * p["ocup_ac"]
    kwh = kwh_dc + kwh_ac

    receita_dc = kwh_dc * p["preco_dc"]
    receita_ac = kwh_ac * p["preco_ac"]
    receita = receita_dc + receita_ac

    custo_energia = kwh * p["custo_kwh"]
    pct_var = p["pct_area"] + p["pct_gestao"] + p["pct_imp"]
    custo_var = receita * pct_var
    custos_fixos = p["custos_fixos"]

    ebitda = receita - custo_energia - custo_var - custos_fixos
    margem = ebitda / receita if receita > 0 else 0
    payback = p["capex"] / ebitda if ebitda > 0 else None
    retorno_am = ebitda / p["capex"] if p["capex"] > 0 else 0

    return {
        "receita": round(receita, 2),
        "kwh_total": round(kwh, 2),
        "custo_energia": round(custo_energia, 2),
        "custo_variavel": round(custo_var, 2),
        "custo_area": round(receita * p["pct_area"], 2),
        "custo_gestao": round(receita * p["pct_gestao"], 2),
        "custo_impostos": round(receita * p["pct_imp"], 2),
        "custos_fixos": round(custos_fixos, 2),
        "ebitda": round(ebitda, 2),
        "margem_ebitda": margem,
        "payback_meses": payback,
        "retorno_am": retorno_am,
        "capex": p["capex"],
        "ocupacao_dc": p["ocup_dc"],
    }


def calc_annual_projection(inputs: dict, anos: int = 10) -> list:
    """Project financials year by year with growth rates."""
    p = _inputs_to_params(inputs)

    capex = p["capex"]
    fluxo_acum = -capex
    ocup_dc_ini = p["ocup_dc"]
    ocup_ac = p["ocup_ac"]
    results = []

    # Ramp-up: occupancy grows from initial to 65% over the projection period
    ocup_dc_target = min(0.65, max(ocup_dc_ini, 0.65))

    for ano in range(1, anos + 1):
        # Linear occupancy ramp
        if anos > 1:
            step = (ocup_dc_target - ocup_dc_ini) / (anos - 1)
            ocup_dc = min(ocup_dc_target, ocup_dc_ini + step * (ano - 1))
        else:
            ocup_dc = ocup_dc_ini

        preco_dc_y = p["preco_dc"] * ((1 + p["cresc_preco"]) ** (ano - 1))
        preco_ac_y = p["preco_ac"] * ((1 + p["cresc_preco"]) ** (ano - 1))
        custo_kwh_y = p["custo_kwh"] * ((1 + p["cresc_energia"]) ** (ano - 1))
        fixos_y = p["custos_fixos"] * ((1 + p["inflacao_fixos"]) ** (ano - 1))

        kwh_dc = p["n_dc"] * p["pot_dc"] * p["horas"] * p["dias"] * p["eficiencia"] * ocup_dc * 12
        kwh_ac = p["n_ac"] * p["pot_ac"] * p["horas"] * p["dias"] * p["eficiencia"] * ocup_ac * 12

        receita = kwh_dc * preco_dc_y + kwh_ac * preco_ac_y
        custo_energia = (kwh_dc + kwh_ac) * custo_kwh_y
        pct_var = p["pct_area"] + p["pct_gestao"] + p["pct_imp"]
        custo_var = receita * pct_var
        ebitda = receita - custo_energia - custo_var - fixos_y
        fluxo_acum += ebitda

        results.append({
            "Ano": f"Ano {ano}",
            "Receita": round(receita, 2),
            "Custo Energia": round(custo_energia, 2),
            "Custos Variáveis": round(custo_var, 2),
            "Custos Fixos": round(fixos_y, 2),
            "EBITDA": round(ebitda, 2),
            "Fluxo Acumulado": round(fluxo_acum, 2),
            "Ocupação DC": round(ocup_dc * 100, 1),
            "Margem EBITDA": round(ebitda / receita * 100, 1) if receita > 0 else 0,
        })

    return results


def calc_sensitivity(inputs: dict, steps: int = 21) -> list:
    """Sensitivity table varying occupancy from 0% to 100%."""
    p = _inputs_to_params(inputs)
    ocupacoes = [i / (steps - 1) for i in range(steps)]
    rows = []

    for occ in ocupacoes:
        kwh_dc = p["n_dc"] * p["pot_dc"] * p["horas"] * p["dias"] * p["eficiencia"] * occ
        kwh_ac = p["n_ac"] * p["pot_ac"] * p["horas"] * p["dias"] * p["eficiencia"] * occ
        receita = kwh_dc * p["preco_dc"] + kwh_ac * p["preco_ac"]
        custo_energia = (kwh_dc + kwh_ac) * p["custo_kwh"]
        pct_var = p["pct_area"] + p["pct_gestao"] + p["pct_imp"]
        custo_var = receita * pct_var
        ebitda = receita - custo_energia - custo_var - p["custos_fixos"]
        margem = ebitda / receita if receita > 0 else 0
        payback = p["capex"] / ebitda if ebitda > 0 else None
        retorno_am = ebitda / p["capex"] if p["capex"] > 0 else 0
        horas_dia = p["horas"] * occ

        rows.append({
            "Ocupação": f"{occ*100:.0f}%",
            "Horas/dia": f"{horas_dia:.1f}h",
            "kWh/mês": int(kwh_dc + kwh_ac),
            "Receita (R$)": round(receita, 2),
            "EBITDA (R$)": round(ebitda, 2),
            "Margem EBITDA": f"{margem*100:.1f}%",
            "Payback (meses)": round(payback, 1) if payback else "—",
            "Retorno a.m.": f"{retorno_am*100:.2f}%",
        })
    return rows
