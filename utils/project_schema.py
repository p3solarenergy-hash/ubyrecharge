from __future__ import annotations

import copy
import re
import unicodedata
from typing import Any


PROJECT_STATUS_LABELS = {
    "prospeccao": "Prospecção",
    "em_estudo": "Em Estudo",
    "estudo_realizado_viavel": "Estudo Realizado (Viável)",
    "fase_de_contrato": "Fase de Contrato",
    "em_obra": "Em Obra",
    "ativo": "Ativo",
}
LEGACY_STATUS_ALIASES = {
    "planejado": "Prospecção",
    "implantacao": "Em Estudo",
    "em_obra": "Em Obra",
    "comissionamento": "Fase de Contrato",
    "operacao_assistida": "Ativo",
    "gestao": "Ativo",
    "inativo": "Fase de Contrato",
    "alerta": "Fase de Contrato",
}
MANAGEMENT_STATUSES = {"ativo"}
CHARGER_STATUSES = ("livre", "ocupado", "offline", "falha", "planejado", "em_obra", "comissionamento", "ativo")


def normalize_text(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.replace("Âº", "o").replace("Âª", "a")
    return text.encode("ascii", errors="ignore").decode().lower().strip()


def _status_key(value: Any) -> str:
    normalized = normalize_text(value)
    normalized = normalized.replace("(", " ").replace(")", " ")
    return re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")


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


def _extract_text(raw_inputs: dict, *keywords: str, default: str = "") -> str:
    info = _find_input(raw_inputs, *keywords)
    if not info:
        return default
    value = info.get("value")
    return str(value).strip() if value is not None else default


def _tokenize_path(path: str) -> list[Any]:
    tokens: list[Any] = []
    for chunk in str(path or "").split("."):
        if not chunk:
            continue
        match = re.findall(r"([^\[\]]+)|\[(\d+)\]", chunk)
        for name, index in match:
            if name:
                tokens.append(name)
            elif index:
                tokens.append(int(index))
    return tokens


def get_schema_value(schema: dict, path: str, default=None):
    current: Any = schema
    for token in _tokenize_path(path):
        if isinstance(token, int):
            if not isinstance(current, list) or token >= len(current):
                return default
            current = current[token]
            continue
        if not isinstance(current, dict) or token not in current:
            return default
        current = current[token]
    return current


def set_schema_value(schema: dict, path: str, value):
    tokens = _tokenize_path(path)
    if not tokens:
        return

    current: Any = schema
    for index, token in enumerate(tokens[:-1]):
        next_token = tokens[index + 1]
        if isinstance(token, int):
            while len(current) <= token:
                current.append({} if not isinstance(next_token, int) else [])
            current = current[token]
            continue

        if token not in current or current[token] is None:
            current[token] = [] if isinstance(next_token, int) else {}
        current = current[token]

    last = tokens[-1]
    if isinstance(last, int):
        while len(current) <= last:
            current.append(None)
        current[last] = value
    else:
        current[last] = value


def canonical_project_status(value: Any, default: str = "Em Estudo") -> str:
    key = _status_key(value)
    if key in PROJECT_STATUS_LABELS:
        return PROJECT_STATUS_LABELS[key]
    if key in LEGACY_STATUS_ALIASES:
        return LEGACY_STATUS_ALIASES[key]
    return default


def humanize_stage(stage: str) -> str:
    return canonical_project_status(stage, default=stage or "Nao definido")


def is_management_stage(stage: str) -> bool:
    return _status_key(stage) in MANAGEMENT_STATUSES


def is_implantation_stage(stage: str) -> bool:
    return not is_management_stage(stage)


def default_project_schema(project_name: str = "", address: str = "", capex_total: float | None = None) -> dict:
    return {
        "project_name": project_name,
        "address": address,
        "project": {
            "name": project_name,
            "status": "Em Estudo",
        },
        "implantation": {
            "address": address,
            "city": "",
            "state": "",
            "capex_total": float(capex_total or 0.0),
            "timeline_status": "Em Estudo",
        },
        "management": {
            "partner_name": "",
        },
        "operations": {
            "sessions_monthly": 0.0,
            "energy_kwh_monthly": 0.0,
            "availability_pct": 0.0,
        },
        "finance": {
            "revenue_monthly": 0.0,
            "ebitda_monthly": 0.0,
            "gross_result_monthly": 0.0,
            "net_result_monthly": 0.0,
        },
        "integration": {
            "source_type": "planilha",
            "partner_name": "",
        },
        "map": {
            "lat": None,
            "lon": None,
            "site_status": "Em Estudo",
        },
        "chargers": [],
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
            "dc_base": 0.3,
            "ac_base": 0.1,
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


def _copy_schema(schema: dict) -> dict:
    return copy.deepcopy(schema)


def _build_default_chargers(schema: dict, stage: str, site_status: str, partner_name: str) -> list[dict]:
    chargers = get_schema_value(schema, "chargers", [])
    if isinstance(chargers, list) and chargers:
        normalized = []
        for index, charger in enumerate(chargers, start=1):
            if not isinstance(charger, dict):
                continue
            status = normalize_text(charger.get("status") or "")
            if status not in CHARGER_STATUSES:
                status = site_status if site_status in CHARGER_STATUSES else "ativo"
            normalized.append(
                {
                    "id": charger.get("id") or f"CH-{index:02d}",
                    "type": charger.get("type") or "DC",
                    "power_kw": safe_float(charger.get("power_kw"), 0.0),
                    "status": status,
                    "connector_count": int(round(safe_float(charger.get("connector_count"), 1.0))),
                    "partner_ref": charger.get("partner_ref") or partner_name,
                }
            )
        if normalized:
            return normalized

    generated = []
    total_dc = int(round(safe_float(get_schema_value(schema, "operational.chargers_dc", 0.0), 0.0)))
    total_ac = int(round(safe_float(get_schema_value(schema, "operational.chargers_ac", 0.0), 0.0)))
    dc_power = safe_float(get_schema_value(schema, "operational.power_dc_kw", 0.0), 0.0)
    ac_power = safe_float(get_schema_value(schema, "operational.power_ac_kw", 0.0), 0.0)

    charger_status = site_status
    if is_management_stage(stage) and charger_status not in {"livre", "ocupado", "offline", "falha"}:
        charger_status = "ativo"

    for index in range(total_dc):
        generated.append(
            {
                "id": f"DC-{index + 1}",
                "type": "DC",
                "power_kw": dc_power,
                "status": charger_status,
                "connector_count": 1,
                "partner_ref": partner_name,
            }
        )

    for index in range(total_ac):
        generated.append(
            {
                "id": f"AC-{index + 1}",
                "type": "AC",
                "power_kw": ac_power,
                "status": charger_status,
                "connector_count": 1,
                "partner_ref": partner_name,
            }
        )

    return generated


def _derive_project_status(schema: dict, monthly: dict | None) -> str:
    explicit = get_schema_value(schema, "project.status", "")
    if explicit:
        return canonical_project_status(explicit)

    legacy_stage = get_schema_value(schema, "project.stage", "")
    if legacy_stage:
        return canonical_project_status(legacy_stage)

    timeline_status = get_schema_value(schema, "implantation.timeline_status", "")
    if timeline_status:
        return canonical_project_status(timeline_status)

    sessions = safe_float(get_schema_value(schema, "operations.sessions_monthly", 0.0), 0.0)
    revenue = safe_float(get_schema_value(schema, "finance.revenue_monthly", 0.0), 0.0)
    if not revenue and monthly:
        revenue = safe_float(monthly.get("receita"), 0.0)

    return "Ativo" if sessions > 0 or revenue > 0 else "Em Estudo"


def _extract_city_state(address: str) -> tuple[str, str]:
    text = str(address or "").strip()
    if not text:
        return "", ""

    parts = [part.strip() for part in text.split(",") if part.strip()]
    state = ""
    city = ""

    if len(parts) >= 2:
        city_state = parts[-1].replace("-", " ").split()
        if city_state:
            candidate = city_state[-1].upper()
            if len(candidate) == 2:
                state = candidate
                city = " ".join(city_state[:-1]).strip()

    if not city and len(parts) >= 2:
        city = parts[-2].replace("-", " ").strip()

    return city, state


def finalize_project_schema(
    schema: dict,
    project_name: str = "",
    address: str = "",
    capex_total: float | None = None,
    monthly: dict | None = None,
    source_type: str = "planilha",
) -> dict:
    final = _copy_schema(schema or {})
    baseline = default_project_schema(project_name=project_name, address=address, capex_total=capex_total)

    for key, value in baseline.items():
        if key not in final:
            final[key] = value
        elif isinstance(value, dict):
            merged = value.copy()
            merged.update(final.get(key) or {})
            final[key] = merged

    final["project_name"] = project_name or final.get("project_name") or get_schema_value(final, "project.name", "")
    final["address"] = address or final.get("address") or get_schema_value(final, "implantation.address", "")

    final["project"]["name"] = final.get("project_name", "")
    status = _derive_project_status(final, monthly)
    final["project"]["status"] = status
    final["project"].pop("stage", None)

    final["implantation"]["address"] = final.get("address", "")
    if capex_total is not None:
        final["investment"]["capex_total"] = safe_float(capex_total, 0.0)
    final["implantation"]["capex_total"] = safe_float(
        get_schema_value(final, "implantation.capex_total", get_schema_value(final, "investment.capex_total", 0.0)),
        0.0,
    )

    city = get_schema_value(final, "implantation.city", "")
    state = get_schema_value(final, "implantation.state", "")
    if not city and not state:
        derived_city, derived_state = _extract_city_state(final["implantation"]["address"])
        final["implantation"]["city"] = derived_city
        final["implantation"]["state"] = derived_state

    final["implantation"]["timeline_status"] = canonical_project_status(
        get_schema_value(final, "implantation.timeline_status", status),
        default=status,
    )

    partner_name = (
        str(get_schema_value(final, "management.partner_name", "") or "").strip()
        or str(get_schema_value(final, "integration.partner_name", "") or "").strip()
    )
    final["management"]["partner_name"] = partner_name
    final["integration"]["partner_name"] = partner_name
    final["integration"]["source_type"] = str(get_schema_value(final, "integration.source_type", "") or source_type or "planilha")

    monthly = monthly or {}
    final["operations"]["energy_kwh_monthly"] = safe_float(
        get_schema_value(final, "operations.energy_kwh_monthly", monthly.get("kwh_total", 0.0)),
        0.0,
    )
    final["operations"]["sessions_monthly"] = safe_float(
        get_schema_value(final, "operations.sessions_monthly", 0.0),
        0.0,
    )
    final["operations"]["availability_pct"] = safe_float(
        get_schema_value(final, "operations.availability_pct", 1.0 if is_management_stage(status) else 0.0),
        0.0,
    )

    revenue = safe_float(get_schema_value(final, "finance.revenue_monthly", monthly.get("receita", 0.0)), 0.0)
    ebitda = safe_float(get_schema_value(final, "finance.ebitda_monthly", monthly.get("ebitda", 0.0)), 0.0)
    gross_result = safe_float(
        get_schema_value(
            final,
            "finance.gross_result_monthly",
            revenue - safe_float(monthly.get("custo_energia", 0.0), 0.0) - safe_float(monthly.get("custo_variavel", 0.0), 0.0),
        ),
        0.0,
    )
    net_result = safe_float(get_schema_value(final, "finance.net_result_monthly", ebitda), 0.0)
    final["finance"]["revenue_monthly"] = revenue
    final["finance"]["ebitda_monthly"] = ebitda
    final["finance"]["gross_result_monthly"] = gross_result
    final["finance"]["net_result_monthly"] = net_result

    final["map"]["site_status"] = status

    chargers = _build_default_chargers(final, status, normalize_text(status), partner_name)
    final["chargers"] = chargers
    return final


def build_project_schema(raw_inputs: dict, project_name: str = "", address: str = "", capex_total: float | None = None) -> dict:
    capex_value = capex_total if capex_total else _extract_value(raw_inputs, "capex total")
    schema = default_project_schema(project_name=project_name, address=address, capex_total=capex_total)
    schema["operational"].update(
        {
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
        }
    )
    schema["pricing"].update(
        {
            "sale_price_dc": _extract_value(raw_inputs, "preco de venda dc", "preco venda dc"),
            "sale_price_ac": _extract_value(raw_inputs, "preco de venda ac", "preco venda ac"),
            "energy_cost_kwh": (
                _extract_value(raw_inputs, "custo energia efetivo", "custo energia")
                or _extract_value(raw_inputs, "ponta", scenario="value", default=0.0)
            ),
            "other_variable_cost_kwh": _extract_value(raw_inputs, "outros custos variaveis"),
        }
    )
    schema["occupancy"].update(
        {
            "dc_base": _extract_value(raw_inputs, "ocupacao dc", scenario="conservador", default=0.3),
            "ac_base": _extract_value(raw_inputs, "ocupacao ac", scenario="conservador", default=0.1),
        }
    )
    schema["costs"].update(
        {
            "area_share_pct": _extract_value(raw_inputs, "participacao area"),
            "management_pct": _extract_value(raw_inputs, "gestao p3", "gestao", default=0.15),
            "taxes_pct": _extract_value(raw_inputs, "impostos sobre receita", default=0.05),
            "fixed_costs_monthly": (
                _extract_value(raw_inputs, "custos fixos ajustados", scenario="conservador")
                or _extract_value(raw_inputs, "custos fixos ajustados")
                or _extract_value(raw_inputs, "total custos fixos")
            ),
            "replacement_capex_monthly": _extract_value(raw_inputs, "capex repos"),
        }
    )
    schema["investment"].update(
        {
            "capex_total": capex_value,
            "project_horizon_months": _extract_value(raw_inputs, "horizonte do projeto", default=60),
            "discount_rate_annual": _extract_value(raw_inputs, "taxa de desconto", default=0.1475),
        }
    )
    schema["growth"].update(
        {
            "energy_cost_annual": _extract_value(raw_inputs, "crescimento custo energia", default=0.05),
            "sale_price_annual": _extract_value(raw_inputs, "crescimento preco venda", default=0.05),
            "fixed_costs_annual": _extract_value(raw_inputs, "inflacao custos fixos", default=0.0),
        }
    )
    schema["units"].update(
        {
            "sale_price_dc": _extract_unit(raw_inputs, "preco de venda dc", "preco venda dc"),
            "sale_price_ac": _extract_unit(raw_inputs, "preco de venda ac", "preco venda ac"),
            "energy_cost_kwh": _extract_unit(raw_inputs, "custo energia efetivo", "custo energia"),
            "capex_total": _extract_unit(raw_inputs, "capex total"),
        }
    )
    schema["management"]["partner_name"] = _extract_text(raw_inputs, "parceiro operacao", "parceiro", default="")
    return finalize_project_schema(schema, project_name=project_name, address=address, capex_total=capex_total)


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


DISPLAY_FIELDS = [
    ("Numero de carregadores DC", "operational.chargers_dc", ""),
    ("Numero de carregadores AC", "operational.chargers_ac", ""),
    ("Potencia por carregador DC", "operational.power_dc_kw", "kW"),
    ("Potencia por carregador AC", "operational.power_ac_kw", "kW"),
    ("Numero de vagas / plugs", "operational.plugs_total", "vagas"),
    ("Potencia total", "operational.power_total_kw", "kW"),
    ("Horas disponiveis por dia", "operational.hours_per_day", "h/dia"),
    ("Dias por mes", "operational.days_per_month", "dias"),
    ("Eficiencia / perdas (fator)", "operational.efficiency_factor", "fator"),
    ("Capacidade media da bateria", "operational.battery_capacity_kwh", "kWh"),
    ("Preco de venda DC", "pricing.sale_price_dc", "R$/kWh"),
    ("Preco de venda AC", "pricing.sale_price_ac", "R$/kWh"),
    ("Custo energia efetivo", "pricing.energy_cost_kwh", "R$/kWh"),
    ("Outros custos variaveis", "pricing.other_variable_cost_kwh", "R$/kWh"),
    ("Ocupacao DC (% do tempo)", "occupancy.dc_base", ""),
    ("Ocupacao AC (% do tempo)", "occupancy.ac_base", ""),
    ("Participacao Area (% receita)", "costs.area_share_pct", "%"),
    ("Gestao P3 / Adquirencia (% receita)", "costs.management_pct", "%"),
    ("Impostos sobre receita (% receita)", "costs.taxes_pct", "%"),
    ("Custos fixos ajustados", "costs.fixed_costs_monthly", "R$/mes"),
    ("CAPEX total", "investment.capex_total", "R$"),
    ("CAPEX reposicao mensal", "costs.replacement_capex_monthly", "R$/mes"),
    ("Horizonte do projeto", "investment.project_horizon_months", "meses"),
    ("Taxa de desconto (a.a.)", "investment.discount_rate_annual", "% a.a."),
    ("Crescimento custo energia (a.a.)", "growth.energy_cost_annual", "%"),
    ("Crescimento preco venda (a.a.)", "growth.sale_price_annual", "%"),
    ("Inflacao custos fixos (a.a.)", "growth.fixed_costs_annual", "%"),
]


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
    updated = _copy_schema(schema)
    for label, path, _unit in DISPLAY_FIELDS:
        if label in edited_inputs:
            set_schema_value(updated, path, safe_float(edited_inputs[label], 0.0))
    return finalize_project_schema(
        updated,
        project_name=updated.get("project_name", ""),
        address=updated.get("address", ""),
        capex_total=get_schema_value(updated, "investment.capex_total", 0.0),
    )


def schema_to_rows(schema: dict) -> list[list]:
    rows = [["campo", "valor"]]
    ordered_paths = [
        "project.name",
        "project.status",
        "implantation.address",
        "implantation.city",
        "implantation.state",
        "implantation.capex_total",
        "management.partner_name",
        "operations.sessions_monthly",
        "operations.energy_kwh_monthly",
        "operations.availability_pct",
        "finance.revenue_monthly",
        "finance.ebitda_monthly",
        "finance.gross_result_monthly",
        "finance.net_result_monthly",
        "integration.source_type",
        "map.lat",
        "map.lon",
        "operational.chargers_dc",
        "operational.chargers_ac",
        "operational.power_dc_kw",
        "operational.power_ac_kw",
        "operational.plugs_total",
        "operational.power_total_kw",
        "operational.hours_per_day",
        "operational.days_per_month",
        "operational.efficiency_factor",
        "operational.battery_capacity_kwh",
        "pricing.sale_price_dc",
        "pricing.sale_price_ac",
        "pricing.energy_cost_kwh",
        "pricing.other_variable_cost_kwh",
        "occupancy.dc_base",
        "occupancy.ac_base",
        "costs.area_share_pct",
        "costs.management_pct",
        "costs.taxes_pct",
        "costs.fixed_costs_monthly",
        "costs.replacement_capex_monthly",
        "investment.capex_total",
        "investment.project_horizon_months",
        "investment.discount_rate_annual",
        "growth.energy_cost_annual",
        "growth.sale_price_annual",
        "growth.fixed_costs_annual",
    ]

    for path in ordered_paths:
        rows.append([path, get_schema_value(schema, path, "")])

    for index, charger in enumerate(get_schema_value(schema, "chargers", [])):
        rows.extend(
            [
                [f"chargers[{index}].id", charger.get("id", "")],
                [f"chargers[{index}].type", charger.get("type", "")],
                [f"chargers[{index}].power_kw", charger.get("power_kw", 0.0)],
                [f"chargers[{index}].status", charger.get("status", "")],
                [f"chargers[{index}].connector_count", charger.get("connector_count", 1)],
                [f"chargers[{index}].partner_ref", charger.get("partner_ref", "")],
            ]
        )
    return rows
