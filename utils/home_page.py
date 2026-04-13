from __future__ import annotations

import urllib.parse

import folium
import streamlit as st
from streamlit_folium import st_folium

from utils.drive_sync import get_folder_id, get_google_maps_api_key, sync_all, update_google_sheet_geodata
from utils.excel_reader import EXCEL_DIR
from utils.project_portfolio import CHARGER_STATUS_COLORS, load_portfolio_projects
from utils.ui_settings import load_ui_settings


def gmaps_link(address: str) -> str:
    return "https://www.google.com/maps/search/" + urllib.parse.quote(address or "")


@st.cache_data(ttl=60)
def load_portfolio():
    return load_portfolio_projects()


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


def _refresh_portfolio_data():
    load_portfolio.clear()
    st.cache_data.clear()
    st.rerun()


def _render_map(projects: list[dict]):
    valid_projects = [project for project in projects if project.get("lat") is not None and project.get("lon") is not None]
    if not valid_projects:
        st.info("Nenhum eletroposto com coordenadas válidas na UBY_SCHEMA.")
        return

    center = [
        sum(float(project["lat"]) for project in valid_projects) / len(valid_projects),
        sum(float(project["lon"]) for project in valid_projects) / len(valid_projects),
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
        address = project.get("address", "") or "Endereço não cadastrado"
        popup_html = f"""
        <div style="font-family:Arial,sans-serif;min-width:290px;color:#222;">
            <div style="background:{color};padding:10px 14px;border-radius:10px 10px 0 0;color:#fff;">
                <strong>{project['name']}</strong><br>
                <span style="font-size:12px;">{project['site_status_label']}</span>
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


def _render_geo_fix_panel(project: dict):
    source = project.get("source") or {}
    spreadsheet_id = source.get("id", "")
    address_value = st.text_input(
        "Endereço ou link do Google Maps",
        value=project.get("address", "") or "",
        key=f"geo-address-{project['relative_path']}",
        placeholder="Cole aqui o endereço ou o link do Google Maps",
    )

    if st.button("Buscar localização e salvar", key=f"geo-save-{project['relative_path']}", use_container_width=True):
        if not spreadsheet_id:
            st.error("Esse posto não está vinculado a uma planilha de origem no Drive.")
            return

        try:
            geocoded = update_google_sheet_geodata(spreadsheet_id, address_value, get_folder_id())
            sync_all(folder_id=get_folder_id(), dest_dir=EXCEL_DIR)
            st.success(
                f"Localização atualizada para {geocoded.get('formatted_address', address_value)} "
                f"({geocoded.get('lat')}, {geocoded.get('lon')})"
            )
            _refresh_portfolio_data()
        except Exception as exc:
            st.error(f"Não foi possível atualizar a localização: {exc}")


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

    projects = load_portfolio()
    total_sites = len(projects)
    implantation_sites = len([project for project in projects if project["group"] == "Implantacao"])
    management_sites = len([project for project in projects if project["group"] == "Gestao"])
    total_chargers = sum(project["charger_count"] for project in projects)
    active_chargers = sum(
        project["charger_status_counts"].get("livre", 0) + project["charger_status_counts"].get("ocupado", 0)
        for project in projects
    )
    pending_geo = [project for project in projects if project.get("lat") is None or project.get("lon") is None]

    st.title(f"⚡ {brand['app_title']}")
    st.caption("Mapa operacional dos eletropostos com foco no cenário base e localização corrigida pela UBY_SCHEMA.")
    st.markdown("---")

    top_cards = st.columns(6)
    top_cards[0].metric(cards["home_title"], total_sites)
    top_cards[1].metric(cards["implantation_title"], implantation_sites)
    top_cards[2].metric(cards["management_title"], management_sites)
    top_cards[3].metric("Carregadores", total_chargers)
    top_cards[4].metric("Ativos agora", active_chargers)
    top_cards[5].metric("Pendentes de mapa", len(pending_geo))

    statuses = sorted({project["site_status_label"] for project in projects})
    partners = sorted({project["partner_name"] for project in projects})
    cities = sorted({project["city"] for project in projects if project["city"]})

    st.markdown("---")
    filter_col1, filter_col2, filter_col3, filter_col4 = st.columns([1.1, 1.4, 1.3, 2])
    group_filter = filter_col1.multiselect("Bloco", ["Implantacao", "Gestao"], default=["Implantacao", "Gestao"])
    status_filter = filter_col2.multiselect("Status do projeto", statuses, default=statuses)
    partner_filter = filter_col3.multiselect("Parceiro", partners, default=partners)
    search_filter = filter_col4.text_input(
        "Busca por posto, cidade, estado ou endereço",
        placeholder="Ex.: Londrina, contrato, Robert Koch",
    )

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
    filtered_pending = [project for project in filtered if project.get("lat") is None or project.get("lon") is None]

    map_col, list_col = st.columns([3, 1.2])
    with map_col:
        st.markdown("### Mapa dos eletropostos")
        _render_map(filtered)

    with list_col:
        st.markdown("### Resumo dos postos")
        if not filtered:
            st.info("Nenhum posto encontrado com os filtros atuais.")
        for project in filtered:
            link = gmaps_link(project["address"]) if project.get("address") else ""
            link_html = f"<a href='{link}' target='_blank' style='color:#00c8ff;'>Abrir no Google Maps</a>" if link else ""
            st.markdown(
                f"""
                <div class="project-card" style="border-left-color:{project['site_color']};">
                    <div style="font-weight:700;color:#fff;margin-bottom:6px;">{project['name']}</div>
                    <div style="font-size:12px;color:#b0b7c3;margin-bottom:8px;">📍 {project['address'] or 'Endereço não informado'}</div>
                    <div style="margin-bottom:8px;">
                        <span class="status-chip" style="background:{project['site_color']};">{project['site_status_label']}</span>
                        <span class="status-chip" style="background:#2d3748;">{project['group']}</span>
                    </div>
                    <div style="font-size:12px;color:#d6d9e0;">🤝 {project['partner_name']}</div>
                    <div style="font-size:12px;color:#d6d9e0;">🔌 {project['charger_count']} carregador(es)</div>
                    <div style="font-size:12px;color:#d6d9e0;">💸 Receita: R$ {project['revenue_monthly']:,.0f}</div>
                    <div style="font-size:12px;color:#00c8ff;margin-bottom:6px;">EBITDA: R$ {project['ebitda_monthly']:,.0f}</div>
                    <div style="font-size:12px;">{link_html}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    st.markdown("---")
    pending_col, region_col = st.columns([1.4, 1])
    with pending_col:
        st.markdown("### Pendências de coordenadas")
        if not filtered_pending:
            st.success("Todos os postos filtrados já têm latitude e longitude válidas na UBY_SCHEMA.")
        else:
            st.caption("Você pode colar o endereço do Google Maps aqui e o app salva a localização certa na planilha.")
            if not get_google_maps_api_key():
                st.warning("Configure `google_maps.api_key` nos secrets para habilitar a busca automática da localização.")
            for project in filtered_pending:
                with st.container(border=True):
                    st.markdown(f"**{project['name']}**")
                    st.caption(project["address"] or "Endereço ausente na planilha")
                    _render_geo_fix_panel(project)

    with region_col:
        st.markdown("### Cobertura")
        if cities:
            for city in cities:
                count = sum(1 for project in filtered if project["city"] == city)
                if count:
                    st.markdown(f"- **{city}**: {count} posto(s)")
        else:
            st.info("As cidades serão preenchidas automaticamente pela geocodificação Google.")
