import json
import os
import time
import urllib.parse
import urllib.request

import folium
import streamlit as st
from streamlit_folium import st_folium

from utils.calculations import calc_monthly
from utils.drive_sync import get_folder_id, load_locations_from_drive, save_locations_to_drive
from utils.excel_reader import EXCEL_DIR, get_all_projects, parse_full_project
from utils.manager_auth import is_manager_authenticated
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
        except Exception as exc:
            with open(LOC_FILE, "w", encoding="utf-8") as file:
                json.dump(data, file, ensure_ascii=False, indent=2)
            raise RuntimeError(
                "Não foi possível salvar as localizações no Google Drive. "
                f"O app usou fallback local temporário. Detalhe: {exc}"
            ) from exc

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
def load_kpis():
    result = {}
    for filename in get_all_projects():
        filepath = os.path.join(EXCEL_DIR, filename)
        project = parse_full_project(filepath)
        if project["inputs"]:
            result[project["name"]] = calc_monthly(project["inputs"])
    return result


def render_home():
    ui_settings = load_ui_settings()
    brand = ui_settings["brand"]
    cards = ui_settings["home_cards"]

    st.set_page_config(
        page_title=brand["app_title"],
        page_icon="⚡",
        layout="wide",
        initial_sidebar_state="expanded",
    )

    st.markdown(
        """
    <style>
        [data-testid="stSidebar"] {background: #0f1117;}
        [data-testid="stSidebar"] * {color: #e0e0e0 !important;}
        div[data-testid="metric-container"] {
            background: #1e2130;
            border-radius: 8px;
            padding: 12px;
            border-left: 3px solid #00c8ff;
        }
        .pin-card {
            background: #1e2130;
            border-radius: 10px;
            padding: 14px 18px;
            border-left: 4px solid #00c8ff;
            margin-bottom: 8px;
        }
        .pin-card h5 { margin: 0 0 2px; font-size: 0.85rem; color: #00c8ff; }
        .pin-card p  { margin: 0; font-size: 0.82rem; color: #aaa; }
    </style>
    """,
        unsafe_allow_html=True,
    )

    locations = load_locations()
    current_names = {os.path.splitext(os.path.basename(filename))[0] for filename in get_all_projects()}

    stale = [name for name in locations if name not in current_names]
    for name in stale:
        del locations[name]

    changed = bool(stale)
    for name in current_names:
        if name not in locations:
            locations[name] = {"endereco_completo": "", "lat": None, "lon": None, "status": "ativo"}
            changed = True

    if changed:
        try:
            save_locations(locations)
        except RuntimeError as exc:
            st.warning(str(exc))

    kpis = load_kpis()
    is_manager = is_manager_authenticated()

    st.title(f"⚡ {brand['app_title']}")
    st.caption(brand["app_caption"])
    st.markdown("---")

    c1, c2, c3, c4, c5, c6 = st.columns(6)
    c1.info(f"🏠 **{cards['home_title']}**\n{cards['home_subtitle']}")
    c2.info(f"📊 **{cards['dashboard_title']}**\n{cards['dashboard_subtitle']}")
    c3.info(f"📁 **{cards['projects_title']}**\n{cards['projects_subtitle']}")
    c4.info(f"🔄 **{cards['comparison_title']}**\n{cards['comparison_subtitle']}")
    c5.info(f"🔒 **{cards['manager_title']}**\n{cards['manager_subtitle']}")
    c6.info(f"🔌 **{cards['integrations_title']}**\n{cards['integrations_subtitle']}")
    st.markdown("---")

    st.markdown("### 📍 Pontos de Recarga")
    valid_locs = {name: value for name, value in locations.items() if value.get("lat") and value.get("lon")}

    if valid_locs:
        lats = [value["lat"] for value in valid_locs.values()]
        lons = [value["lon"] for value in valid_locs.values()]
        center = [sum(lats) / len(lats), sum(lons) / len(lons)]

        map_object = folium.Map(location=center, zoom_start=7, tiles=None)
        folium.TileLayer(
            tiles="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
            attr="Google Maps",
            name="Google Maps",
            max_zoom=20,
        ).add_to(map_object)
        folium.TileLayer(
            tiles="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
            attr="Google Satellite",
            name="Satélite",
            max_zoom=20,
        ).add_to(map_object)
        folium.LayerControl(position="topright").add_to(map_object)

        status_color = {"ativo": "#00c8ff", "inativo": "#ff4b4b", "obra": "#ffa500"}

        for name, loc in valid_locs.items():
            kpi = kpis.get(name, {})
            receita = kpi.get("receita", 0)
            ebitda = kpi.get("ebitda", 0)
            payback = kpi.get("payback_meses")
            capex = kpi.get("capex", 0)
            status = loc.get("status", "ativo")
            color = status_color.get(status, "#00c8ff")
            address = loc.get("endereco_completo", "") or "Endereço não cadastrado"
            gmaps = gmaps_link(address) if address != "Endereço não cadastrado" else "#"

            financial_rows = ""
            if is_manager:
                financial_rows = (
                    f"<tr style='border-bottom:1px solid #eee;'><td style='padding:4px 0;color:#888;'>CAPEX</td>"
                    f"<td style='text-align:right;font-weight:600;'>R$ {capex:,.0f}</td></tr>"
                    f"<tr><td style='padding:4px 0;color:#888;'>Payback</td>"
                    f"<td style='text-align:right;font-weight:600;'>{f'{payback:.1f} meses' if payback else '—'}</td></tr>"
                )

            popup_html = f"""
            <div style="font-family:Arial,sans-serif;min-width:240px;background:#fff;color:#222;padding:0;border-radius:8px;overflow:hidden;">
                <div style="background:{color};padding:10px 14px;">
                    <div style="font-weight:700;font-size:13px;color:#fff;">⚡ {name}</div>
                </div>
                <div style="padding:12px 14px;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                        <span style="font-size:13px;">📍</span>
                        <span style="font-size:12px;color:#555;">{address}</span>
                    </div>
                    <a href="{gmaps}" target="_blank"
                       style="display:inline-block;background:#4285F4;color:#fff;font-size:11px;padding:4px 10px;border-radius:4px;text-decoration:none;margin-bottom:10px;">
                        Ver no Google Maps ↗
                    </a>
                    <table style="width:100%;font-size:12px;border-collapse:collapse;">
                        <tr style="border-bottom:1px solid #eee;">
                            <td style="padding:4px 0;color:#888;">Receita/mês</td>
                            <td style="text-align:right;color:#1a7a40;font-weight:600;">R$ {receita:,.0f}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #eee;">
                            <td style="padding:4px 0;color:#888;">EBITDA/mês</td>
                            <td style="text-align:right;color:#1565C0;font-weight:600;">R$ {ebitda:,.0f}</td>
                        </tr>
                        {financial_rows}
                    </table>
                    <div style="margin-top:10px;">
                        <span style="background:{color};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;">
                            {status.upper()}
                        </span>
                    </div>
                </div>
            </div>
            """

            icon_html = f"""
            <div style="background:{color};width:36px;height:36px;border-radius:50%;
                        border:3px solid #fff;display:flex;align-items:center;justify-content:center;
                        font-size:17px;box-shadow:0 2px 8px rgba(0,0,0,0.4);">⚡</div>
            """

            folium.Marker(
                location=[loc["lat"], loc["lon"]],
                popup=folium.Popup(popup_html, max_width=270),
                tooltip=f"⚡ {name}",
                icon=folium.DivIcon(html=icon_html, icon_size=(36, 36), icon_anchor=(18, 18)),
            ).add_to(map_object)

        map_col, list_col = st.columns([3, 1])
        with map_col:
            st_folium(map_object, width=None, height=500, returned_objects=[])

        with list_col:
            st.markdown("**Locais cadastrados**")
            for name, loc in valid_locs.items():
                address = loc.get("endereco_completo", "") or "—"
                ebitda = kpis.get(name, {}).get("ebitda", 0)
                status = loc.get("status", "ativo")
                emoji = {"ativo": "🟢", "inativo": "🔴", "obra": "🟡"}.get(status, "🔵")
                gmaps = gmaps_link(address) if address != "—" else "#"
                st.markdown(
                    f"""
                <div class="pin-card">
                    <h5>{emoji} {name[:28]}</h5>
                    <p>📍 <a href="{gmaps}" target="_blank" style="color:#4285F4;text-decoration:none;font-size:11px;">
                        {address[:40]}{'…' if len(address) > 40 else ''}
                    </a></p>
                    <p style="color:#00c8ff;margin-top:4px;">EBITDA R$ {ebitda:,.0f}/mês</p>
                </div>
                """,
                    unsafe_allow_html=True,
                )
    else:
        st.info("Nenhum ponto com localização configurada. Adicione os endereços abaixo.")

    st.markdown("---")
    st.markdown("### ⚙️ Gerenciar Localizações")
    st.caption("Digite o endereço no formato Google Maps. O sistema busca as coordenadas automaticamente.")

    with st.form("form_locations"):
        updated = {}

        for name in sorted(locations.keys()):
            loc = locations[name]
            address = loc.get("endereco_completo", "")
            lat = loc.get("lat")
            lon = loc.get("lon")

            st.markdown(f"**⚡ {name}**")
            col_addr, col_status = st.columns([4, 1])
            new_address = col_addr.text_input(
                "Endereço completo (ex: Av. Brasil, 469 - Centro, Faxinal - PR, 86840-000)",
                value=address,
                key=f"addr_{name}",
                placeholder="Cole o endereço do Google Maps aqui...",
            )
            new_status = col_status.selectbox(
                "Status",
                ["ativo", "obra", "inativo"],
                index=["ativo", "obra", "inativo"].index(loc.get("status", "ativo")),
                key=f"sta_{name}",
            )

            if lat and lon:
                st.caption(f"📌 Coordenadas: {lat:.4f}, {lon:.4f} — [Ver no Google Maps]({gmaps_link(new_address or address)})")
            else:
                st.caption("⚠️ Sem coordenadas — salve o endereço para geocodificar.")

            updated[name] = {
                "endereco_completo": new_address,
                "lat": lat,
                "lon": lon,
                "status": new_status,
                "_needs_geocode": new_address != address and bool(new_address),
            }
            st.markdown("<hr style='margin:8px 0;border-color:#2a2d3e;'>", unsafe_allow_html=True)

        submitted = st.form_submit_button("💾 Salvar e Geocodificar", type="primary")

    if submitted:
        with st.spinner("Buscando coordenadas..."):
            for name, data in updated.items():
                if data.pop("_needs_geocode", False):
                    result = geocode(data["endereco_completo"])
                    if result:
                        data["lat"], data["lon"] = result
                        st.success(f"✅ {name}: {result[0]:.4f}, {result[1]:.4f}")
                    else:
                        st.warning(f"⚠️ {name}: não encontrado. Tente um endereço mais simples.")
                else:
                    data.pop("_needs_geocode", None)

            try:
                save_locations(updated)
                st.success("Localizações salvas.")
            except RuntimeError as exc:
                st.warning(str(exc))
                st.success("Localizações salvas localmente.")
            st.cache_data.clear()
            time.sleep(1)
            st.rerun()

    st.markdown("---")
    if not is_manager:
        st.info("Custos de implantação, CAPEX e indicadores de retorno ficam protegidos na Área do Gestor.")
    st.markdown("> Use o menu lateral para navegar entre as seções.")
