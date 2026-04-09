from __future__ import annotations

import unicodedata
from typing import Any


def normalize_text(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.replace("º", "o").replace("ª", "a")
    return text.encode("ascii", errors="ignore").decode().lower().strip()


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _find_input(raw_inputs: dict, *keywords: str) -> dict | None:
    normalized_keywords = [normalize_text(keyword) for keyword in keywords]
    for label, info in raw_inputs.items():
        akey = info.get("akey") or normalize_text(label)
        if any(keyword in akey for keyword in normalized_keywords):
            return info
    return None


def _extract_value(raw_inputs: dict, *keywords: str, scenario: str = "value", default: float = 0.0) -> float:
    info = _find_input(raw_inputs, *keywords)
    if not info:
        return default
    return safe_float(info.get(scenario, info.get("value")), default)


def _extract_unit(raw_inputs: dict, *keywords: str) -> str:
    info = _find_input(raw_inputs, *keywords)
    return str(info.get("unit", "") or "") if info else ""


def build_project_schema(raw_inputs: dict, project_name: str = "", address: str = "", capex_total: float | None = None) -> dict:
    capex_value = capex_total if capex_total else _extract_value(raw_inputs, "capex total")
    schema = {
        "project_name": project_name,
        "address": address,
        "operational": {
            "chargers_dc": _extract_value(raw_inputs, "n carregadores dc", "no carregadores dc", "numero de carregadores"),
            "chargers_ac": _extract_value(raw_inputs, "n carregadores ac", "no carregadores ac"),
            "power_dc_kw": _extract_value(raw_inputs, "potencia por carregador dc", "potencia media por carregador"),
            "power_ac_kw": _extract_value(raw_inputs, "potencia por carregador ac"),
            "plugs_total": _extract_value(raw_inputs, "total de vagas", "vagas", "plugs"),
            "power_total_kw": _extract_value(raw_inputs, "potencia total instalada", "potencia total"),
            "hours_per_day": _extract_value(raw_inputs, "horas disponiveis por dia", default=24),
            "days_per_month": _extract_value(raw_inputs, "dias por mes", default=30),
            "efficiency_factor": _extract_value(raw_inputs, "eficiencia", default=1.0),
            "battery_capacity_kwh": _extract_value(raw_inputs, "capacidade media da bateria", "capacidade bateria"),
        },
        "pricing": {
            "sale_price_dc": _extract_value(raw_inputs, "preco de venda dc", "preco venda dc"),
            "sale_price_ac": _extract_value(raw_inputs, "preco de venda ac", "preco venda ac"),
            "energy_cost_kwh": (
                _extract_value(raw_inputs, "custo energia efetivo", "custo energia")
                or _extract_value(raw_inputs, "ponta", scenario="value", default=0.0)
            ),
            "other_variable_cost_kwh": _extract_value(raw_inputs, "outros custos variaveis"),
        },
        "occupancy": {
            "dc_pessimistic": _extract_value(raw_inputs, "ocupacao dc", scenario="pessimista"),
            "dc_base": _extract_value(raw_inputs, "ocupacao dc", scenario="conservador", default=0.3),
            "dc_optimistic": _extract_value(raw_inputs, "ocupacao dc", scenario="otimista"),
            "ac_pessimistic": _extract_value(raw_inputs, "ocupacao ac", scenario="pessimista"),
            "ac_base": _extract_value(raw_inputs, "ocupacao ac", scenario="conservador", default=0.1),
            "ac_optimistic": _extract_value(raw_inputs, "ocupacao ac", scenario="otimista"),
        },
        "costs": {
            "area_share_pct": _extract_value(raw_inputs, "participacao area"),
            "management_pct": _extract_value(raw_inputs, "gestao p3", "gestao", default=0.15),
            "taxes_pct": _extract_value(raw_inputs, "impostos sobre receita", default=0.05),
            "fixed_costs_monthly": (
                _extract_value(raw_inputs, "custos fixos ajustados", scenario="conservador")
                or _extract_value(raw_inputs, "custos fixos ajustados")
                or _extract_value(raw_inputs, "total custos fixos")
            ),
            "replacement_capex_monthly": _extract_value(raw_inputs, "capex repos"),
        },
        "investment": {
            "capex_total": capex_value,
            "project_horizon_months": _extract_value(raw_inputs, "horizonte do projeto", default=60),
            "discount_rate_annual": _extract_value(raw_inputs, "taxa de desconto", default=0.1475),
        },
        "growth": {
            "energy_cost_annual": _extract_value(raw_inputs, "crescimento custo energia", default=0.05),
            "sale_price_annual": _extract_value(raw_inputs, "crescimento preco venda", default=0.05),
            "fixed_costs_annual": _extract_value(raw_inputs, "inflacao custos fixos", default=0.0),
        },
        "units": {
            "sale_price_dc": _extract_unit(raw_inputs, "preco de venda dc", "preco venda dc"),
            "sale_price_ac": _extract_unit(raw_inputs, "preco de venda ac", "preco venda ac"),
            "energy_cost_kwh": _extract_unit(raw_inputs, "custo energia efetivo", "custo energia"),
            "capex_total": _extract_unit(raw_inputs, "capex total"),
        },
    }
    return schema


def schema_to_calc_inputs(schema: dict) -> dict:
    operational = schema.get("operational", {})
    pricing = schema.get("pricing", {})
    occupancy = schema.get("occupancy", {})
    costs = schema.get("costs", {})
    investment = schema.get("investment", {})
    growth = schema.get("growth", {})

    return {
        "n_dc": safe_float(operational.get("chargers_dc")),
        "n_ac": safe_float(operational.get("chargers_ac")),
        "pot_dc": safe_float(operational.get("power_dc_kw")),
        "pot_ac": safe_float(operational.get("power_ac_kw")),
        "horas": safe_float(operational.get("hours_per_day"), 24),
        "dias": safe_float(operational.get("days_per_month"), 30),
        "eficiencia": safe_float(operational.get("efficiency_factor"), 1.0),
        "preco_dc": safe_float(pricing.get("sale_price_dc")),
        "preco_ac": safe_float(pricing.get("sale_price_ac")),
        "custo_kwh": safe_float(pricing.get("energy_cost_kwh"), 0.88),
        "pct_area": safe_float(costs.get("area_share_pct")),
        "pct_gestao": safe_float(costs.get("management_pct"), 0.15),
        "pct_imp": safe_float(costs.get("taxes_pct"), 0.05),
        "custos_fixos": safe_float(costs.get("fixed_costs_monthly")),
        "capex": safe_float(investment.get("capex_total")),
        "capex_repos": safe_float(costs.get("replacement_capex_monthly")),
        "horizonte": safe_float(investment.get("project_horizon_months"), 60),
        "tma": safe_float(investment.get("discount_rate_annual"), 0.1475),
        "ocup_dc": safe_float(occupancy.get("dc_base"), 0.3),
        "ocup_ac": safe_float(occupancy.get("ac_base"), 0.1),
        "cresc_energia": safe_float(growth.get("energy_cost_annual"), 0.05),
        "cresc_preco": safe_float(growth.get("sale_price_annual"), 0.05),
        "inflacao_fixos": safe_float(growth.get("fixed_costs_annual"), 0.0),
    }
