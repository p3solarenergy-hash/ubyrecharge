import streamlit as st
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import folium
from streamlit_folium import st_folium

sys.path.insert(0, os.path.dirname(__file__))
from utils.excel_reader import get_all_projects, parse_full_project, EXCEL_DIR
from utils.calculations import calc_monthly

st.set_page_config(
    page_title="UBY RECHARGE — Gestão",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
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
    .gmaps-row {
        display: flex; align-items: center; gap: 10px;
        background: #1e2130; border-radius: 8px;
        padding: 10px 16px; margin-bottom: 6px;
    }
</style>
""", unsafe_allow_html=True)

# ── Paths ──────────────────────────────────────────────────────────
APP_DIR  = os.path.dirname(__file__)
LOC_FILE = os.path.join(APP_DIR, "locations.json")

# ── Helpers ────────────────────────────────────────────────────────
def load_locations():
    if os.path.exists(LOC_FILE):
        with open(LOC_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_locations(data):
    with open(LOC_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def geocode(address: str):
    """Geocodifica usando Nominatim (OpenStreetMap). Retorna (lat, lon) ou None."""
    try:
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
            "q": address, "format": "json", "limit": 1, "countrycodes": "br"
        })
        req = urllib.request.Request(url, headers={"User-Agent": "UbyRecharge/1.0"})
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
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
    for f in get_all_projects():
        fp = os.path.join(EXCEL_DIR, f)
        p  = parse_full_project(fp)
        if p["inputs"]:
            result[p["name"]] = calc_monthly(p["inputs"])
    return result

# ── Sincroniza projetos (adiciona novos, remove obsoletos) ────────
locations = load_locations()
current_names = {f.replace(".xlsx", "") for f in get_all_projects()}

# Remove entradas sem xlsx correspondente
stale = [k for k in locations if k not in current_names]
for k in stale:
    del locations[k]

# Adiciona novos projetos
changed = bool(stale)
for name in current_names:
    if name not in locations:
        locations[name] = {"endereco_completo": "", "lat": None, "lon": None, "status": "ativo"}
        changed = True

if changed:
    save_locations(locations)

kpis = load_kpis()

# ══════════════════════════════════════════════════════════════════
#  HEADER
# ══════════════════════════════════════════════════════════════════
st.title("⚡ UBY RECHARGE — Plataforma de Gestão")
st.caption("Gerencie, analise e compare seus projetos de recarga elétrica.")
st.markdown("---")

c1, c2, c3, c4, c5 = st.columns(5)
c1.info("📊 **Dashboard**\nVisão geral")
c2.info("📁 **Projetos**\nEdite inputs")
c3.info("🔀 **Comparação**\nLado a lado")
c4.info("🔬 **Análise**\nCenários")
c5.info("🔌 **Integrações**\nEm breve")
st.markdown("---")

# ══════════════════════════════════════════════════════════════════
#  MAPA
# ══════════════════════════════════════════════════════════════════
st.markdown("### 📍 Pontos de Recarga")

valid_locs = {
    k: v for k, v in locations.items()
    if v.get("lat") and v.get("lon")
}

if valid_locs:
    lats = [v["lat"] for v in valid_locs.values()]
    lons = [v["lon"] for v in valid_locs.values()]
    center = [sum(lats) / len(lats), sum(lons) / len(lons)]

    # ── Mapa com tiles Google Maps ────────────────────────────────
    m = folium.Map(location=center, zoom_start=7, tiles=None)

    # Camada Google Maps (Street)
    folium.TileLayer(
        tiles="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
        attr="Google Maps",
        name="Google Maps",
        max_zoom=20,
    ).add_to(m)

    # Camada Google Satélite
    folium.TileLayer(
        tiles="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        attr="Google Satellite",
        name="Satélite",
        max_zoom=20,
    ).add_to(m)

    folium.LayerControl(position="topright").add_to(m)

    STATUS_COLOR = {"ativo": "#00c8ff", "inativo": "#ff4b4b", "obra": "#ffa500"}

    for name, loc in valid_locs.items():
        kpi     = kpis.get(name, {})
        receita = kpi.get("receita", 0)
        ebitda  = kpi.get("ebitda",  0)
        payback = kpi.get("payback_meses")
        capex   = kpi.get("capex",   0)
        status  = loc.get("status", "ativo")
        color   = STATUS_COLOR.get(status, "#00c8ff")
        addr    = loc.get("endereco_completo", "") or "Endereço não cadastrado"
        glink   = gmaps_link(addr) if addr != "Endereço não cadastrado" else "#"

        popup_html = f"""
        <div style="font-family:Arial,sans-serif;min-width:240px;
                    background:#fff;color:#222;padding:0;border-radius:8px;overflow:hidden;">
            <div style="background:{color};padding:10px 14px;">
                <div style="font-weight:700;font-size:13px;color:#fff;">⚡ {name}</div>
            </div>
            <div style="padding:12px 14px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                    <span style="font-size:13px;">📍</span>
                    <span style="font-size:12px;color:#555;">{addr}</span>
                </div>
                <a href="{glink}" target="_blank"
                   style="display:inline-block;background:#4285F4;color:#fff;
                          font-size:11px;padding:4px 10px;border-radius:4px;
                          text-decoration:none;margin-bottom:10px;">
                    Ver no Google Maps ↗
                </a>
                <table style="width:100%;font-size:12px;border-collapse:collapse;">
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:4px 0;color:#888;">CAPEX</td>
                        <td style="text-align:right;font-weight:600;">R$ {capex:,.0f}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:4px 0;color:#888;">Receita/mês</td>
                        <td style="text-align:right;color:#1a7a40;font-weight:600;">R$ {receita:,.0f}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:4px 0;color:#888;">EBITDA/mês</td>
                        <td style="text-align:right;color:#1565C0;font-weight:600;">R$ {ebitda:,.0f}</td>
                    </tr>
                    <tr>
                        <td style="padding:4px 0;color:#888;">Payback</td>
                        <td style="text-align:right;font-weight:600;">
                            {f'{payback:.1f} meses' if payback else '—'}
                        </td>
                    </tr>
                </table>
                <div style="margin-top:10px;">
                    <span style="background:{color};color:#fff;padding:3px 10px;
                                 border-radius:12px;font-size:11px;font-weight:600;">
                        {status.upper()}
                    </span>
                </div>
            </div>
        </div>
        """

        icon_html = f"""
        <div style="background:{color};width:36px;height:36px;border-radius:50%;
                    border:3px solid #fff;display:flex;align-items:center;
                    justify-content:center;font-size:17px;
                    box-shadow:0 2px 8px rgba(0,0,0,0.4);">⚡</div>
        """

        folium.Marker(
            location=[loc["lat"], loc["lon"]],
            popup=folium.Popup(popup_html, max_width=270),
            tooltip=f"⚡ {name}",
            icon=folium.DivIcon(html=icon_html, icon_size=(36, 36), icon_anchor=(18, 18)),
        ).add_to(m)

    map_col, list_col = st.columns([3, 1])

    with map_col:
        st_folium(m, width=None, height=500, returned_objects=[])

    with list_col:
        st.markdown("**Locais cadastrados**")
        for name, loc in valid_locs.items():
            addr  = loc.get("endereco_completo", "") or "—"
            ebitda = kpis.get(name, {}).get("ebitda", 0)
            status = loc.get("status", "ativo")
            emoji  = {"ativo": "🟢", "inativo": "🔴", "obra": "🟡"}.get(status, "🔵")
            glink  = gmaps_link(addr) if addr != "—" else "#"
            st.markdown(f"""
            <div class="pin-card">
                <h5>{emoji} {name[:28]}</h5>
                <p>📍 <a href="{glink}" target="_blank"
                        style="color:#4285F4;text-decoration:none;font-size:11px;">
                    {addr[:40]}{'…' if len(addr) > 40 else ''}
                </a></p>
                <p style="color:#00c8ff;margin-top:4px;">EBITDA R$ {ebitda:,.0f}/mês</p>
            </div>
            """, unsafe_allow_html=True)

else:
    st.info("Nenhum ponto com localização configurada. Adicione os endereços abaixo.")

# ══════════════════════════════════════════════════════════════════
#  EDITOR DE LOCALIZAÇÕES — Estilo Google Maps
# ══════════════════════════════════════════════════════════════════
st.markdown("---")
st.markdown("### ⚙️ Gerenciar Localizações")
st.caption("Digite o endereço no formato Google Maps. O sistema busca as coordenadas automaticamente.")

with st.form("form_locations"):
    updated = {}

    for name in sorted(locations.keys()):
        loc  = locations[name]
        addr = loc.get("endereco_completo", "")
        lat  = loc.get("lat")
        lon  = loc.get("lon")

        st.markdown(f"**⚡ {name}**")
        col_addr, col_status = st.columns([4, 1])

        new_addr = col_addr.text_input(
            "Endereço completo (ex: Av. Brasil, 469 - Centro, Faxinal - PR, 86840-000)",
            value=addr,
            key=f"addr_{name}",
            placeholder="Cole o endereço do Google Maps aqui...",
        )
        new_status = col_status.selectbox(
            "Status",
            ["ativo", "obra", "inativo"],
            index=["ativo", "obra", "inativo"].index(loc.get("status", "ativo")),
            key=f"sta_{name}",
        )

        # Mostra coords atuais se existirem
        if lat and lon:
            st.caption(f"📌 Coordenadas: {lat:.4f}, {lon:.4f} — "
                       f"[Ver no Google Maps]({gmaps_link(new_addr or addr)})")
        else:
            st.caption("⚠️ Sem coordenadas — salve o endereço para geocodificar.")

        updated[name] = {
            "endereco_completo": new_addr,
            "lat": lat,
            "lon": lon,
            "status": new_status,
            "_needs_geocode": new_addr != addr and bool(new_addr),
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
        save_locations(updated)
        st.success("Localizações salvas!")
        st.cache_data.clear()
        time.sleep(1)
        st.rerun()

st.markdown("---")
st.markdown("> Use o menu lateral para navegar entre as seções.")
