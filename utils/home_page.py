import json
import os
import urllib.parse
import urllib.request

import folium
import streamlit as st
from streamlit_folium import st_folium

from utils.drive_sync import get_folder_id, load_locations_from_drive, save_locations_to_drive
from utils.project_portfolio import CHARGER_STATUS_COLORS, SITE_STATUS_COLORS, filter_projects, load_portfolio_projects
from utils.ui_settings import load_ui_settings

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOC_FILE = os.path.join(APP_DIR, "locations.json")


def load_locations():
    folder_id = get_folder_id()
    if folder_id:
        try:
            drive_data = load_locations_from_drive(folder_id)
            if isinstance(drive_data, dict):
                return drive_data
        except Exception:
            pass

    if os.path.exists(LOC_FILE):
        with open(LOC_FILE, "r", encoding="utf-8") as file:
            return json.load(file)
    return {}


def save_locations(data):
    folder_id = get_folder_id()
    if folder_id:
        try:
            save_locations_to_drive(data, folder_id)
        except Exception:
            pass

    with open(LOC_FILE, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def geocode(address: str):
    try:
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": address, "format": "json", "limit": 1, "countrycodes": "br"}
        )
        request = urllib.request.Request(url, headers={"User-Agent": "UbyRecharge/1.0"})
        with urllib.request.urlopen(request, timeout=5) as response:
            data = json.loads(response.read())
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        pass
    return None


def gmaps_link(address: str) -> str:
    return "https://www.google.com/maps/search/" + urllib.parse.quote(address)


@st.cache_data(ttl=10)
def load_portfolio():
    return load_portfolio_projects()


def _sync_locations(projects: list[dict], locations: dict) -> tuple[list[dict], dict, bool]:
    changed = False
    synced = []
    current_names = {project["name"] for project in projects}

    for stale_name in list(locations.keys()):
        if stale_name not in current_names:
            del locations[stale_name]
            changed = True

    for project in projects:
        entry = locations.get(
            project["name"],
            {
                "endereco_completo": project.get("address", ""),
                "lat": project.get("lat"),
                "lon": project.get("lon"),
                "status": project.get("site_status", "planejado"),
            },
        )

        address = project.get("address", "") or entry.get("endereco_completo", "")
        lat = project.get("lat") if project.get("lat") is not None else entry.get("lat")
        lon = project.get("lon") if project.get("lon") is not None else entry.get("lon")
        site_status = project.get("site_status", entry.get("status", "planejado"))

        if address and (lat is None or lon is None):
            coords = geocode(address)
            if coords:
                lat, lon = coords
                changed = True

        normalized = {
            "endereco_completo": address,
            "lat": lat,
            "lon": lon,
            "status": site_status,
        }
        if locations.get(project["name"]) != normalized:
            locations[project["name"]] = normalized
            changed = True

        synced.append(
            {
                **project,
                "address": address,
                "lat": lat,
                "lon": lon,
                "site_status": site_status,
                "site_color": SITE_STATUS_COLORS.get(site_status, "#00c8ff"),
            }
        )

    return synced, locations, changed


def _charger_badges(project: dict) -> str:
    items = []
    for charger in project.get("chargers", [])[:6]:
        color = CHARGER_STATUS_COLORS.get(charger.get("status"), "#7f8c8d")
        items.append(
            f"<span style='display:inline-block;background:{color};color:#fff;border-radius:999px;"
            f"padding:3px 8px;margin:0 6px 6px 0;font-size:11px;'>"
            f"{charger.get('id', 'CH')} - {charger.get('status', 'sem status')}</span>"
        )
    if len(project.get("chargers", [])) > 6:
        items.append(
            f"<span style='display:inline-block;background:#2d3748;color:#fff;border-radius:999px;"
            f"padding:3px 8px;margin:0 6px 6px 0;font-size:11px;'>+{len(project['chargers']) - 6} carregadores</span>"
        )
    return "".join(items) if items else "<span style='font-size:11px;color:#999;'>Sem telemetria por carregador</span>"


def _render_map(projects: list[dict]):
    valid_projects = [project for project in projects if project.get("lat") is not None and project.get("lon") is not None]
    if not valid_projects:
        st.info("Nenhum eletroposto com coordenadas configuradas.")
        return

    center = [
        sum(project["lat"] for project in valid_projects) / len(valid_projects),
        sum(project["lon"] for project in valid_projects) / len(valid_projects),
    ]

    map_object = folium.Map(location=center, zoom_start=6, tiles=None)
    folium.TileLayer(
        tiles="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
        attr="Google Maps",
        name="Google Maps",
        max_zoom=20,
    ).add_to(map_object)
    folium.TileLayer(
        tiles="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        attr="Google Satellite",
        name="Google Satellite",
        max_zoom=20,
    ).add_to(map_object)
    folium.LayerControl(position="topright").add_to(map_object)

    for project in valid_projects:
        color = project["site_color"]
        address = project.get("address", "") or "Endereco nao cadastrado"
        popup_html = f"""
        <div style="font-family:Arial,sans-serif;min-width:280px;color:#222;">
            <div style="background:{color};padding:10px 14px;border-radius:10px 10px 0 0;color:#fff;">
                <strong>{project['name']}</strong><br>
                <span style="font-size:12px;">{project['stage_label']} - {project['site_status_label']}</span>
            </div>
            <div style="padding:12px 14px;background:#fff;border-radius:0 0 10px 10px;">
                <div style="font-size:12px;margin-bottom:8px;">📍 {address}</div>
                <div style="font-size:12px;margin-bottom:8px;">🤝 Parceiro: {project['partner_name']}</div>
                <div style="font-size:12px;margin-bottom:8px;">🔌 {project['charger_count']} carregador(es)</div>
                <div style="font-size:12px;margin-bottom:10px;">💸 Receita: R$ {project['revenue_monthly']:,.0f} | EBITDA: R$ {project['ebitda_monthly']:,.0f}</div>
                <div style="font-size:12px;font-weight:600;margin-bottom:6px;">Carregadores</div>
                <div>{_charger_badges(project)}</div>
            </div>
        </div>
        """

        icon_html = (
            f"<div style='background:{color};width:38px;height:38px;border-radius:50%;border:3px solid #fff;"
            "display:flex;align-items:center;justify-content:center;font-size:16px;"
            "box-shadow:0 2px 10px rgba(0,0,0,0.35);'>⚡</div>"
        )

        folium.Marker(
            location=[project["lat"], project["lon"]],
            tooltip=f"{project['name']} - {project['site_status_label']}",
            popup=folium.Popup(popup_html, max_width=320),
            icon=folium.DivIcon(html=icon_html, icon_size=(38, 38), icon_anchor=(19, 19)),
        ).add_to(map_object)

    st_folium(map_object, width=None, height=560, returned_objects=[])


def render_home():
    ui_settings = load_ui_settings()
    brand = ui_settings["brand"]
    cards = ui_settings["home_cards"]

    st.set_page_config(page_title=brand["app_title"], page_icon="⚡", layout="wide", initial_sidebar_state="expanded")
    st.markdown(
        """
        <style>
            [data-testid="stSidebar"] { background: #0f1117; }
            [data-testid="stSidebar"] * { color: #e0e0e0 !important; }
            div[data-testid="metric-container"] {
                background: #1e2130;
                border-radius: 10px;
                padding: 12px;
                border-left: 4px solid #00c8ff;
            }
            .project-card {
                background: #1e2130;
                border-radius: 12px;
                padding: 14px 16px;
                margin-bottom: 10px;
                border-left: 4px solid #00c8ff;
            }
            .status-chip {
                display: inline-block;
                color: #fff;
                border-radius: 999px;
                padding: 3px 10px;
                font-size: 11px;
                margin-right: 6px;
            }
        </style>
        """,
        unsafe_allow_html=True,
    )

    projects, locations, changed = _sync_locations(load_portfolio(), load_locations())
    if changed:
        save_locations(locations)

    total_sites = len(projects)
    implantation_sites = len(filter_projects(projects, "Implantacao"))
    management_sites = len(filter_projects(projects, "Gestao"))
    total_chargers = sum(project["charger_count"] for project in projects)
    active_chargers = sum(project["charger_status_counts"].get("livre", 0) + project["charger_status_counts"].get("ocupado", 0) for project in projects)
    alert_sites = sum(1 for project in projects if project["site_status"] == "alerta")

    st.title(f"⚡ {brand['app_title']}")
    st.caption(brand["app_caption"])
    st.markdown("---")

    top_cards = st.columns(6)
    top_cards[0].metric(cards["home_title"], total_sites)
    top_cards[1].metric(cards["implantation_title"], implantation_sites)
    top_cards[2].metric(cards["management_title"], management_sites)
    top_cards[3].metric("Carregadores", total_chargers)
    top_cards[4].metric("Ativos agora", active_chargers)
    top_cards[5].metric("Postos em alerta", alert_sites)

    st.markdown("---")
    filter_col1, filter_col2, filter_col3, filter_col4 = st.columns([1.2, 1.2, 1.2, 2])
    group_filter = filter_col1.multiselect("Fase", ["Implantacao", "Gestao"], default=["Implantacao", "Gestao"])
    status_filter = filter_col2.multiselect(
        "Status do posto",
        sorted({project["site_status_label"] for project in projects}),
        default=sorted({project["site_status_label"] for project in projects}),
    )
    partner_filter = filter_col3.multiselect(
        "Parceiro",
        sorted({project["partner_name"] for project in projects}),
        default=sorted({project["partner_name"] for project in projects}),
    )
    search_filter = filter_col4.text_input("Busca por posto, cidade ou estado", placeholder="Ex.: Faxinal, Londrina, obra...")

    filtered = [
        project
        for project in projects
        if project["group"] in group_filter
        and project["site_status_label"] in status_filter
        and project["partner_name"] in partner_filter
        and (
            not search_filter.strip()
            or search_filter.lower() in project["name"].lower()
            or search_filter.lower() in project["city"].lower()
            or search_filter.lower() in project["state"].lower()
            or search_filter.lower() in project["address"].lower()
        )
    ]

    map_col, list_col = st.columns([3, 1.2])
    with map_col:
        st.markdown("### Mapa operacional dos eletropostos")
        _render_map(filtered)

    with list_col:
        st.markdown("### Resumo dos postos")
        if not filtered:
            st.info("Nenhum posto encontrado com os filtros atuais.")
        for project in filtered:
            st.markdown(
                f"""
                <div class="project-card" style="border-left-color:{project['site_color']};">
                    <div style="font-weight:700;color:#fff;margin-bottom:6px;">{project['name']}</div>
                    <div style="font-size:12px;color:#b0b7c3;margin-bottom:8px;">📍 {project['address'] or 'Endereco nao informado'}</div>
                    <div style="margin-bottom:8px;">
                        <span class="status-chip" style="background:{project['site_color']};">{project['site_status_label']}</span>
                        <span class="status-chip" style="background:#2d3748;">{project['stage_label']}</span>
                    </div>
                    <div style="font-size:12px;color:#d6d9e0;">🤝 {project['partner_name']}</div>
                    <div style="font-size:12px;color:#d6d9e0;">🔌 {project['charger_count']} carregador(es)</div>
                    <div style="font-size:12px;color:#d6d9e0;">💸 Receita: R$ {project['revenue_monthly']:,.0f}</div>
                    <div style="font-size:12px;color:#00c8ff;">EBITDA: R$ {project['ebitda_monthly']:,.0f}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    st.markdown("---")
    st.markdown("### Gerenciar localizacoes")
    st.caption("Ajuste endereco, coordenadas e status agregado do posto quando necessario.")

    with st.form("form_locations"):
        updated = {}
        for project in projects:
            st.markdown(f"**{project['name']}**")
            col_a, col_b, col_c, col_d = st.columns([3.2, 1, 1, 1.2])
            new_address = col_a.text_input(
                "Endereco completo",
                value=project.get("address", ""),
                key=f"addr_{project['name']}",
            )
            new_lat = col_b.text_input("Latitude", value="" if project.get("lat") is None else str(project["lat"]), key=f"lat_{project['name']}")
            new_lon = col_c.text_input("Longitude", value="" if project.get("lon") is None else str(project["lon"]), key=f"lon_{project['name']}")
            new_status = col_d.selectbox(
                "Status",
                options=list(SITE_STATUS_COLORS.keys()),
                index=list(SITE_STATUS_COLORS.keys()).index(project.get("site_status", "planejado")),
                key=f"status_{project['name']}",
            )
            updated[project["name"]] = {
                "endereco_completo": new_address.strip(),
                "lat": float(new_lat) if new_lat not in {"", None} else None,
                "lon": float(new_lon) if new_lon not in {"", None} else None,
                "status": new_status,
            }

        submitted = st.form_submit_button("Salvar localizacoes", type="primary")

    if submitted:
        save_locations(updated)
        st.success("Localizacoes atualizadas.")
        st.cache_data.clear()
        st.rerun()
