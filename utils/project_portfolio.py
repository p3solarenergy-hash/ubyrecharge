from __future__ import annotations

import os

from utils.excel_reader import EXCEL_DIR, get_all_projects, parse_full_project
from utils.project_schema import canonical_project_status, get_schema_value, humanize_stage, is_management_stage, normalize_text


SITE_STATUS_LABELS = {
    "prospeccao": "Prospecção",
    "em_estudo": "Em Estudo",
    "estudo_realizado_viavel": "Estudo Realizado (Viável)",
    "fase_de_contrato": "Fase de Contrato",
    "em_obra": "Em Obra",
    "ativo": "Ativo",
}

SITE_STATUS_COLORS = {
    "prospeccao": "#64748b",
    "em_estudo": "#2563eb",
    "estudo_realizado_viavel": "#0891b2",
    "fase_de_contrato": "#d97706",
    "em_obra": "#ea580c",
    "ativo": "#00c853",
}

CHARGER_STATUS_COLORS = {
    "livre": "#00c853",
    "ocupado": "#1e88e5",
    "offline": "#95a5a6",
    "falha": "#ff5252",
    "planejado": "#7f8c8d",
    "em_obra": "#f39c12",
    "comissionamento": "#9b59b6",
    "ativo": "#00c853",
}


def load_portfolio_projects() -> list[dict]:
    projects = []
    for filename in get_all_projects():
        filepath = os.path.join(EXCEL_DIR, filename)
        project = parse_full_project(filepath)
        if project.get("inputs"):
            projects.append(build_project_record(project))
    return projects


def _count_charger_states(chargers: list[dict]) -> dict:
    counts = {key: 0 for key in CHARGER_STATUS_COLORS}
    for charger in chargers:
        status = normalize_text(charger.get("status", ""))
        if status in counts:
            counts[status] += 1
    return counts


def _group_for_stage(stage: str) -> str:
    return "Gestao" if is_management_stage(stage) else "Implantacao"


def build_project_record(project: dict) -> dict:
    schema = project.get("schema", {})
    status_label = canonical_project_status(
        get_schema_value(
            schema,
            "project.status",
            get_schema_value(schema, "map.site_status", get_schema_value(schema, "project.stage", "Em Estudo")),
        )
    )
    status_key = normalize_text(status_label).replace(" ", "_").replace("(", "").replace(")", "")
    chargers = get_schema_value(schema, "chargers", []) or []
    partner_name = (
        str(get_schema_value(schema, "management.partner_name", "") or "").strip()
        or str(get_schema_value(schema, "integration.partner_name", "") or "").strip()
        or "Planilha"
    )
    city = str(get_schema_value(schema, "implantation.city", "") or "").strip()
    state = str(get_schema_value(schema, "implantation.state", "") or "").strip()
    address = str(get_schema_value(schema, "implantation.address", project.get("address", "")) or "").strip()
    lat = get_schema_value(schema, "map.lat", None)
    lon = get_schema_value(schema, "map.lon", None)
    monthly = project.get("monthly", {})
    finance = schema.get("finance", {})
    operations = schema.get("operations", {})

    return {
        **project,
        "stage": status_label,
        "stage_label": humanize_stage(status_label),
        "group": _group_for_stage(status_label),
        "site_status": status_key,
        "site_status_label": SITE_STATUS_LABELS.get(status_key, status_label),
        "site_color": SITE_STATUS_COLORS.get(status_key, "#00c8ff"),
        "partner_name": partner_name,
        "city": city,
        "state": state,
        "address": address,
        "lat": lat,
        "lon": lon,
        "chargers": chargers,
        "charger_count": len(chargers),
        "charger_status_counts": _count_charger_states(chargers),
        "availability_pct": float(operations.get("availability_pct", 0.0) or 0.0),
        "sessions_monthly": float(operations.get("sessions_monthly", 0.0) or 0.0),
        "energy_kwh_monthly": float(operations.get("energy_kwh_monthly", monthly.get("kwh_total", 0.0)) or 0.0),
        "revenue_monthly": float(finance.get("revenue_monthly", monthly.get("receita", 0.0)) or 0.0),
        "ebitda_monthly": float(finance.get("ebitda_monthly", monthly.get("ebitda", 0.0)) or 0.0),
        "gross_result_monthly": float(finance.get("gross_result_monthly", 0.0) or 0.0),
        "net_result_monthly": float(finance.get("net_result_monthly", monthly.get("ebitda", 0.0)) or 0.0),
        "source_type": str(get_schema_value(schema, "integration.source_type", "planilha") or "planilha"),
    }


def filter_projects(projects: list[dict], group: str | None = None) -> list[dict]:
    if not group:
        return projects
    return [project for project in projects if project.get("group") == group]
