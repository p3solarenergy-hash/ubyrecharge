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


def default_project_schema(project_name: str = "", address: str = "", capex_total: float | None = None) -> dict:
    return {
        "project_name": project_name,
        "address": address,
        "operational": {
            "chargers_dc": 0.0,
            "chargers_ac": 0.0,
            "power_dc_kw": 0.0,
            "power_ac_kw": 0.0,
            "plugs_total": 0.0,
            "power_total_kw": 0.0,
            "hours_per_day": 24.0,
            "days_per_month": 30.0,
            "efficiency_factor": 1.0,
            "battery_capacity_kwh": 0.0,
        },
        "pricing": {
            "sale_price_dc": 0.0,
            "sale_price_ac": 0.0,
            "energy_cost_kwh": 0.88,
            "other_variable_cost_kwh": 0.0,
        },
        "occupancy": {
            "dc_pessimistic": 0.15,
            "dc_base": 0.3,
            "dc_optimistic": 0.45,
            "ac_pessimistic": 0.1,
            "ac_base": 0.1,
            "ac_optimistic": 0.1,
        },
        "costs": {
            "area_share_pct": 0.0,
            "management_pct": 0.15,
            "taxes_pct": 0.05,
            "fixed_costs_monthly": 0.0,
            "replacement_capex_monthly": 0.0,
        },
        "investment": {
            "capex_total": float(capex_total or 0.0),
            "project_horizon_months": 60.0,
            "discount_rate_annual": 0.1475,
        },
        "growth": {
            "energy_cost_annual": 0.05,
            "sale_price_annual": 0.05,
            "fixed_costs_annual": 0.0,
        },
        "units": {
            "sale_price_dc": "R$/kWh",
            "sale_price_ac": "R$/kWh",
            "energy_cost_kwh": "R$/kWh",
            "capex_total": "R$",
        },
    }


DISPLAY_FIELDS = [
    ("Número de carregadores DC", "operational.chargers_dc", ""),
    ("Número de carregadores AC", "operational.chargers_ac", ""),
    ("Potência por carregador DC", "operational.power_dc_kw", "kW"),
    ("Potência por carregador AC", "operational.power_ac_kw", "kW"),
    ("Número de vagas / plugs", "operational.plugs_total", "vagas"),
    ("Potência total", "operational.power_total_kw", "kW"),
    ("Horas disponíveis por dia", "operational.hours_per_day", "h/dia"),
    ("Dias por mês", "operational.days_per_month", "dias"),
    ("Eficiência / perdas (fator)", "operational.efficiency_factor", "fator"),
    ("Capacidade média da bateria", "operational.battery_capacity_kwh", "kWh"),
    ("Preço de venda DC", "pricing.sale_price_dc", "R$/kWh"),
    ("Preço de venda AC", "pricing.sale_price_ac", "R$/kWh"),
    ("Custo energia efetivo", "pricing.energy_cost_kwh", "R$/kWh"),
    ("Outros custos variáveis", "pricing.other_variable_cost_kwh", "R$/kWh"),
    ("Ocupação DC (% do tempo)", "occupancy.dc_base", ""),
    ("Ocupação AC (% do tempo)", "occupancy.ac_base", ""),
    ("Participação Área (% receita)", "costs.area_share_pct", "%"),
    ("Gestão P3 / Adquirência (% receita)", "costs.management_pct", "%"),
    ("Impostos sobre receita (% receita)", "costs.taxes_pct", "%"),
    ("Custos fixos ajustados", "costs.fixed_costs_monthly", "R$/mês"),
    ("CAPEX total", "investment.capex_total", "R$"),
    ("CAPEX reposição mensal", "costs.replacement_capex_monthly", "R$/mês"),
    ("Horizonte do projeto", "investment.project_horizon_months", "meses"),
    ("Taxa de desconto (a.a.)", "investment.discount_rate_annual", "% a.a."),
    ("Crescimento custo energia (a.a.)", "growth.energy_cost_annual", "%"),
    ("Crescimento preço venda (a.a.)", "growth.sale_price_annual", "%"),
    ("Inflação custos fixos (a.a.)", "growth.fixed_costs_annual", "%"),
]


def get_schema_value(schema: dict, path: str, default=None):
    current = schema
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return default
        current = current[part]
    return current


def set_schema_value(schema: dict, path: str, value):
    current = schema
    parts = path.split(".")
    for part in parts[:-1]:
        current = current.setdefault(part, {})
    current[parts[-1]] = value


def schema_to_display_inputs(schema: dict) -> dict:
    inputs = {}
    for label, path, unit in DISPLAY_FIELDS:
        value = get_schema_value(schema, path, 0.0)
        inputs[label] = {
            "value": value,
            "unit": unit,
            "akey": normalize_text(label),
        }
    return inputs


def apply_display_inputs_to_schema(schema: dict, edited_inputs: dict) -> dict:
    updated = default_project_schema(
        project_name=schema.get("project_name", ""),
        address=schema.get("address", ""),
        capex_total=get_schema_value(schema, "investment.capex_total", 0.0),
    )
    for key, value in schema.items():
        if isinstance(value, dict):
            updated[key] = dict(value)
        else:
            updated[key] = value

    for label, path, _unit in DISPLAY_FIELDS:
        if label in edited_inputs:
            set_schema_value(updated, path, safe_float(edited_inputs[label], 0.0))
    return updated


def schema_to_rows(schema: dict) -> list[list]:
    rows = [["campo", "valor"]]
    rows.append(["project_name", schema.get("project_name", "")])
    rows.append(["address", schema.get("address", "")])

    for label, path, _unit in DISPLAY_FIELDS:
        rows.append([path, get_schema_value(schema, path, "")])

    rows.extend(
        [
            ["occupancy.dc_pessimistic", get_schema_value(schema, "occupancy.dc_pessimistic", 0.0)],
            ["occupancy.dc_optimistic", get_schema_value(schema, "occupancy.dc_optimistic", 0.0)],
            ["occupancy.ac_pessimistic", get_schema_value(schema, "occupancy.ac_pessimistic", 0.0)],
            ["occupancy.ac_optimistic", get_schema_value(schema, "occupancy.ac_optimistic", 0.0)],
        ]
    )
    return rows
