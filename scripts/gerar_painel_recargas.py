import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd


DEFAULT_INPUT = r"C:\Users\Eduardo\Downloads\relatorio-recargas-2026-5-22.xlsx"
DEFAULT_OUTPUT = "painel_recargas_uby.html"


def money(value):
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def pct(value):
    return f"{value:.2f}%".replace(".", ",")


def number(value, digits=2):
    return f"{value:,.{digits}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def duration_label(hours):
    total_minutes = int(round(hours * 60))
    return f"{total_minutes // 60}h{total_minutes % 60:02d}"


def parse_duration_hours(series):
    return pd.to_timedelta(series.astype(str), errors="coerce").dt.total_seconds().fillna(0) / 3600


def parse_duration_minutes(series):
    return pd.to_timedelta(series.astype(str), errors="coerce").dt.total_seconds().fillna(0) / 60


def load_recargas(path):
    df = pd.read_excel(path, sheet_name="Recargas")
    df.columns = [str(col).strip() for col in df.columns]

    interval = df["Início - Fim"].astype(str).str.split(" - ", n=1, expand=True)
    df["inicio"] = pd.to_datetime(interval[0], format="%d/%m/%Y %H:%M", errors="coerce")
    df["fim"] = pd.to_datetime(interval[1], format="%d/%m/%Y %H:%M", errors="coerce")
    df["mes"] = df["inicio"].dt.to_period("M").astype(str)
    df["dia"] = df["inicio"].dt.date.astype(str)
    df["receita"] = pd.to_numeric(df["Receita(R$)"], errors="coerce").fillna(0)
    df["energia"] = pd.to_numeric(df["Energia(kWh)"], errors="coerce").fillna(0)
    df["duracao_h"] = parse_duration_hours(df["Duração"])
    df["potencia_real_kw"] = (df["energia"] / df["duracao_h"].replace(0, pd.NA)).fillna(0)
    df["ociosidade_min"] = parse_duration_minutes(df["Tempo de ociosidade"])
    df["usuario"] = df["Usuário(Nome)"].astype(str).str.strip()
    df["estacao"] = df["Estação"].astype(str).str.strip()
    return df.dropna(subset=["inicio", "fim"])


def month_end(dt):
    normalized = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    first_next = (normalized.replace(day=28) + timedelta(days=4)).replace(day=1)
    return first_next


def occupancy_percent(kwh, kw, hours):
    if not kw or not hours:
        return 0
    return (kwh / (kw * hours)) * 100


def build_model(df, charger_kw):
    start = df["inicio"].min()
    end = df["fim"].max()
    period_hours = (end - start).total_seconds() / 3600
    total_kwh = float(df["energia"].sum())
    total_revenue = float(df["receita"].sum())
    connected_hours = float(df["duracao_h"].sum())
    real_avg_kw = total_kwh / connected_hours if connected_hours else 0
    real_median_kw = float(df.loc[df["potencia_real_kw"] > 0, "potencia_real_kw"].median()) if len(df.loc[df["potencia_real_kw"] > 0]) else 0
    real_peak_kw = float(df["potencia_real_kw"].max()) if len(df) else 0
    equivalent_full_power_hours = total_kwh / charger_kw if charger_kw else 0
    full_power_kwh = charger_kw * period_hours
    month_start = end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_elapsed_hours = (end - month_start).total_seconds() / 3600
    full_month_hours = (month_end(end) - month_start).total_seconds() / 3600

    monthly_rows = []
    for month, group in df.groupby("mes"):
        month_dt = group["inicio"].min().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        group_end = group["fim"].max()
        elapsed_hours = (group_end - month_dt).total_seconds() / 3600
        calendar_hours = (month_end(month_dt) - month_dt).total_seconds() / 3600
        kwh = float(group["energia"].sum())
        revenue = float(group["receita"].sum())
        monthly_rows.append(
            {
                "mes": month,
                "recargas": int(len(group)),
                "clientes": int(group["usuario"].nunique()),
                "kwh": kwh,
                "receita": revenue,
                "ticket": revenue / len(group) if len(group) else 0,
                "ocupacao_mtd": occupancy_percent(kwh, charger_kw, elapsed_hours),
                "ocupacao_mes_cheio": occupancy_percent(kwh, charger_kw, calendar_hours),
                "horas_base_mtd": elapsed_hours,
                "horas_base_mes": calendar_hours,
            }
        )

    daily = (
        df.groupby("dia")
        .agg(
            recargas=("Recarga(ID)", "count"),
            kwh=("energia", "sum"),
            receita=("receita", "sum"),
            conectado_h=("duracao_h", "sum"),
        )
        .reset_index()
        .to_dict("records")
    )

    users = (
        df.groupby("usuario")
        .agg(
            recargas=("Recarga(ID)", "count"),
            kwh=("energia", "sum"),
            receita=("receita", "sum"),
            ultima=("inicio", "max"),
        )
        .reset_index()
        .sort_values(["receita", "kwh"], ascending=False)
        .head(10)
        .to_dict("records")
    )

    idle = (
        df.sort_values("ociosidade_min", ascending=False)
        .head(6)[["Recarga(ID)", "usuario", "inicio", "energia", "receita", "ociosidade_min"]]
        .to_dict("records")
    )
    payment_summary = []
    payments = df.groupby(["Pagamento(Tipo)", "Pagamento(Status)"], dropna=False).size().reset_index(name="qtd")
    for row in payments.to_dict("records"):
        qty = int(row["qtd"])
        payment_summary.append(
            {
                "tipo": str(row["Pagamento(Tipo)"]),
                "status": str(row["Pagamento(Status)"]),
                "qtd": qty,
                "pct": qty / len(df) * 100 if len(df) else 0,
            }
        )

    return {
        "generated_at": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "station": ", ".join(sorted(df["estacao"].dropna().unique())),
        "charger_kw": charger_kw,
        "start": start.strftime("%d/%m/%Y %H:%M"),
        "end": end.strftime("%d/%m/%Y %H:%M"),
        "period_hours": period_hours,
        "month_elapsed_hours": month_elapsed_hours,
        "full_month_hours": full_month_hours,
        "full_power_kwh": full_power_kwh,
        "total": {
            "sessions": int(len(df)),
            "users": int(df["usuario"].nunique()),
            "kwh": total_kwh,
            "revenue": total_revenue,
            "avg_ticket": total_revenue / len(df) if len(df) else 0,
            "avg_kwh": total_kwh / len(df) if len(df) else 0,
            "revenue_per_kwh": total_revenue / total_kwh if total_kwh else 0,
            "connected_hours": connected_hours,
            "avg_duration_hours": connected_hours / len(df) if len(df) else 0,
            "idle_minutes": float(df["ociosidade_min"].sum()),
            "real_avg_kw": real_avg_kw,
            "real_median_kw": real_median_kw,
            "real_peak_kw": real_peak_kw,
            "charger_delivery_ratio": real_avg_kw / charger_kw * 100 if charger_kw else 0,
            "equivalent_full_power_hours": equivalent_full_power_hours,
            "revenue_per_connected_hour": total_revenue / connected_hours if connected_hours else 0,
            "sessions_per_day": len(df) / (period_hours / 24) if period_hours else 0,
            "projected_month_revenue": total_revenue / month_elapsed_hours * full_month_hours if month_elapsed_hours else 0,
            "projected_month_kwh": total_kwh / month_elapsed_hours * full_month_hours if month_elapsed_hours else 0,
            "occupancy_export_period": occupancy_percent(total_kwh, charger_kw, period_hours),
            "occupancy_month_to_date": occupancy_percent(total_kwh, charger_kw, month_elapsed_hours),
            "occupancy_full_month": occupancy_percent(total_kwh, charger_kw, full_month_hours),
        },
        "monthly": monthly_rows,
        "daily": daily,
        "users": users,
        "idle": idle,
        "payments": payment_summary,
        "ratings": df["Avaliação"].fillna("Sem avaliação").value_counts().to_dict(),
    }


def table_rows(rows, columns):
    html = []
    for row in rows:
        cells = "".join(f"<td>{row.get(key, '')}</td>" for key, _ in columns)
        html.append(f"<tr>{cells}</tr>")
    return "\n".join(html)


def render_html(model):
    total = model["total"]
    monthly = [
        {
            "Mês": row["mes"],
            "Recargas": row["recargas"],
            "Clientes": row["clientes"],
            "kWh": number(row["kwh"], 2),
            "Receita": money(row["receita"]),
            "Ticket médio": money(row["ticket"]),
            "Ocup. parcial": pct(row["ocupacao_mtd"]),
            "Ocup. mês cheio": pct(row["ocupacao_mes_cheio"]),
        }
        for row in model["monthly"]
    ]
    users = [
        {
            "Cliente": row["usuario"],
            "Recargas": row["recargas"],
            "kWh": number(row["kwh"], 2),
            "Receita": money(row["receita"]),
            "Última recarga": row["ultima"].strftime("%d/%m/%Y %H:%M"),
        }
        for row in model["users"]
    ]
    idle = [
        {
            "ID": int(row["Recarga(ID)"]),
            "Cliente": row["usuario"],
            "Início": row["inicio"].strftime("%d/%m/%Y %H:%M"),
            "kWh": number(row["energia"], 2),
            "Receita": money(row["receita"]),
            "Ociosidade": f"{int(row['ociosidade_min'] // 60)}h {int(row['ociosidade_min'] % 60)}min",
        }
        for row in model["idle"]
    ]
    max_user_revenue = max([row["receita"] for row in model["users"]] or [1])
    user_bars = "\n".join(
        f"""<div class="user-row">
          <span>{row["usuario"].split()[0] if row["usuario"] else "Cliente"}</span>
          <div class="track"><i style="width:{(row["receita"] / max_user_revenue * 100):.1f}%"></i></div>
          <strong>{money(row["receita"])}</strong>
        </div>"""
        for row in model["users"][:6]
    )
    payment_chips = "\n".join(
        f"""<div class="pay-chip"><strong>{row["tipo"]}</strong><span>{row["qtd"]} recargas · {pct(row["pct"])}</span></div>"""
        for row in model["payments"]
    )
    top_two_revenue = sum(row["receita"] for row in model["users"][:2])
    top_two_share = top_two_revenue / total["revenue"] * 100 if total["revenue"] else 0
    technical_rows = [
        {"Indicador": "Potência nominal configurada", "Valor": f"{number(model['charger_kw'], 1)} kW", "Leitura": "Base do cálculo de ocupação"},
        {"Indicador": "Potência real média entregue", "Valor": f"{number(total['real_avg_kw'], 2)} kW", "Leitura": "kWh total dividido pelas horas conectadas"},
        {"Indicador": "Potência real mediana", "Valor": f"{number(total['real_median_kw'], 2)} kW", "Leitura": "Sessão típica, menos afetada por extremos"},
        {"Indicador": "Maior potência média em sessão", "Valor": f"{number(total['real_peak_kw'], 2)} kW", "Leitura": "Melhor sessão do arquivo"},
        {"Indicador": "Entrega vs nominal", "Valor": pct(total["charger_delivery_ratio"]), "Leitura": "Potência real média comparada aos 7 kW"},
        {"Indicador": "Horas equivalentes a plena carga", "Valor": f"{number(total['equivalent_full_power_hours'], 1)} h", "Leitura": "Energia vendida convertida em horas a 7 kW"},
        {"Indicador": "Receita por hora conectada", "Valor": money(total["revenue_per_connected_hour"]), "Leitura": "Receita bruta dividida por duração total"},
        {"Indicador": "Ritmo de uso", "Valor": f"{number(total['sessions_per_day'], 2)} recargas/dia", "Leitura": "Média no período exportado"},
    ]

    chart_data = json.dumps(model["daily"], ensure_ascii=False, default=str)
    payment_chart_data = json.dumps(model["payments"], ensure_ascii=False, default=str)
    user_chart_data = json.dumps(model["users"][:6], ensure_ascii=False, default=str)

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Painel de Recargas UBY</title>
  <link rel="icon" type="image/svg+xml" href="assets/brand/04_simbolo_badge.svg">
  <link rel="stylesheet" href="sidebar.css">
  <link rel="stylesheet" href="brand.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {{
      --p3-primary: #3FB66B;
      --p3-primary-deep: #0F3D2E;
      --p3-accent: #5BC882;
      --p3-accent-2: #FFD66B;
      --p3-bg: #0E1813;
      --p3-card: #16221E;
      --p3-card-soft: #1A2622;
      --p3-text: #E8EFEB;
      --p3-muted: #8FA39A;
      --p3-border: #2A3530;
      --p3-warn: #F2A93D;
      --p3-shadow: 0 1px 3px rgba(0,0,0,.4), 0 4px 12px rgba(0,0,0,.5);
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: Inter, "Segoe UI", Arial, sans-serif; background: var(--p3-bg); color: var(--p3-text); font-size: 14px; line-height: 1.55; }}
    .wrap {{ max-width: 1540px; margin: 0 auto; padding: 32px 36px 80px; }}
    .hero {{ background: linear-gradient(135deg, #0F3D2E 0%, #1A5C42 100%); color: #fff; border-radius: 14px; padding: 28px 32px; display: grid; grid-template-columns: 1.35fr .85fr; gap: 22px; align-items: end; box-shadow: var(--p3-shadow); position: relative; overflow: hidden; }}
    .hero::after {{ content: ""; position: absolute; right: -70px; top: -70px; width: 260px; height: 260px; background: radial-gradient(circle, rgba(46,168,92,.36), transparent 70%); border-radius: 50%; }}
    .hero > * {{ position: relative; z-index: 1; }}
    .brand {{ display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }}
    .logo-mark {{ width: 54px; height: 54px; border-radius: 12px; background: #071527; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,.22); }}
    .logo-mark img {{ width: 100%; height: 100%; object-fit: cover; }}
    .brand-name {{ font-size: 13px; letter-spacing: 3px; text-transform: uppercase; opacity: .86; }}
    .brand-tag {{ font-size: 11px; opacity: .72; letter-spacing: 1px; }}
    h1 {{ margin: 0 0 6px; font-size: 26px; font-weight: 700; letter-spacing: 0; }}
    .meta {{ color: rgba(255,255,255,.84); font-size: 14px; line-height: 1.7; }}
    .formula {{ background: rgba(7,21,39,.28); border: 1px solid rgba(255,255,255,.14); border-radius: 10px; padding: 16px 18px; font-size: 13px; color: #E8EFEB; backdrop-filter: blur(8px); }}
    .grid {{ display: grid; gap: 14px; }}
    .kpis {{ grid-template-columns: repeat(6, minmax(150px, 1fr)); margin-top: 24px; }}
    .card {{ background: var(--p3-card); border: 1px solid var(--p3-border); border-radius: 12px; padding: 18px; box-shadow: var(--p3-shadow); }}
    .label {{ color: var(--p3-muted); font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: .8px; min-height: 18px; overflow-wrap: anywhere; }}
    .value {{ font-size: clamp(22px, 2.1vw, 30px); font-weight: 700; color: var(--p3-primary); margin-top: 6px; line-height: 1.1; white-space: nowrap; }}
    .sub {{ color: var(--p3-muted); font-size: 11px; margin-top: 6px; }}
    .section {{ margin-top: 18px; display: grid; grid-template-columns: 1.15fr .85fr; gap: 18px; align-items: start; }}
    .section-3 {{ grid-template-columns: 1.1fr .95fr .95fr; }}
    .tech-section {{ margin-top: 28px; }}
    h2 {{ margin: 0 0 14px; font-size: 16px; color: var(--p3-primary); padding-bottom: 10px; border-bottom: 1px solid var(--p3-border); }}
    table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
    th, td {{ padding: 10px 10px; border-bottom: 1px solid var(--p3-border); text-align: left; vertical-align: top; }}
    th {{ background: #1F2A26; color: var(--p3-primary); font-size: 11px; text-transform: uppercase; letter-spacing: .7px; }}
    td {{ color: var(--p3-text); }}
    .note {{ border-left: 4px solid var(--p3-warn); background: #2E2310; padding: 14px 18px; border-radius: 8px; font-size: 13px; color: #F2D77F; line-height: 1.55; }}
    .bar {{ height: 9px; background: #26332e; border-radius: 999px; overflow: hidden; margin-top: 10px; }}
    .bar span {{ display: block; height: 100%; background: var(--p3-primary); width: {min(total["occupancy_export_period"], 100):.2f}%; }}
    .user-bars {{ display: grid; gap: 12px; }}
    .user-row {{ display: grid; grid-template-columns: 82px 1fr 92px; align-items: center; gap: 12px; color: var(--p3-muted); font-size: 12px; }}
    .user-row strong {{ color: var(--p3-text); text-align: right; }}
    .track {{ height: 20px; background: #26332e; border-radius: 6px; overflow: hidden; }}
    .track i {{ display: block; height: 100%; background: linear-gradient(90deg, #2EA85C, #5BC882); border-radius: 6px; }}
    .pay-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }}
    .pay-chip {{ background: #121d18; border: 1px solid var(--p3-border); border-left: 3px solid var(--p3-primary); border-radius: 8px; padding: 11px 12px; }}
    .pay-chip strong {{ display: block; color: var(--p3-text); font-size: 12px; }}
    .pay-chip span {{ color: var(--p3-muted); font-size: 11px; }}
    .pie-card canvas {{ min-height: 260px; max-height: 300px; }}
    canvas {{ width: 100%; max-height: 320px; }}
    @media (max-width: 1180px) {{
      .kpis {{ grid-template-columns: repeat(3, minmax(0, 1fr)); }}
      .section-3 {{ grid-template-columns: 1fr; }}
    }}
    @media (max-width: 960px) {{
      .hero, .section, .kpis {{ grid-template-columns: 1fr; }}
      .wrap {{ padding: 16px; }}
      .value {{ white-space: normal; }}
      .user-row {{ grid-template-columns: 72px 1fr; }}
      .user-row strong {{ grid-column: 2; text-align: left; }}
    }}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <div>
        <div class="brand">
          <div class="logo-mark"><img src="assets/brand/04_simbolo_badge.svg" alt=""></div>
          <div>
            <div class="brand-name">UBY Recharge</div>
            <div class="brand-tag">Energia Solar & Mobilidade Eletrica</div>
          </div>
        </div>
        <h1>Painel de Recargas</h1>
        <div class="meta">
          Estação: <strong>{model["station"]}</strong><br>
          Período da planilha: <strong>{model["start"]}</strong> até <strong>{model["end"]}</strong><br>
          Gerado em {model["generated_at"]}
        </div>
      </div>
      <div class="formula">
        <strong>Ocupação real</strong><br>
        kWh carregados ÷ (potência real × horas do período)<br>
        {number(total["kwh"], 2)} kWh ÷ ({number(model["charger_kw"], 1)} kW × {number(model["period_hours"], 1)} h)
      </div>
    </section>

    <section class="grid kpis">
      <div class="card"><div class="label">Receita total</div><div class="value">{money(total["revenue"])}</div><div class="sub">projeção {money(total["projected_month_revenue"])}</div></div>
      <div class="card"><div class="label">Ocupação real</div><div class="value">{pct(total["occupancy_export_period"])}</div><div class="bar"><span></span></div><div class="sub">MTD {pct(total["occupancy_month_to_date"])} · mês cheio {pct(total["occupancy_full_month"])}</div></div>
      <div class="card"><div class="label">Ticket médio</div><div class="value">{money(total["avg_ticket"])}</div><div class="sub">{number(total["avg_kwh"], 1)} kWh por sessão</div></div>
      <div class="card"><div class="label">R$/kWh médio</div><div class="value">{money(total["revenue_per_kwh"])}</div><div class="sub">receita ÷ energia</div></div>
      <div class="card"><div class="label">Total recargas</div><div class="value">{total["sessions"]}</div><div class="sub">{total["users"]} clientes únicos</div></div>
      <div class="card"><div class="label">Energia entregue</div><div class="value">{number(total["kwh"], 1)} kWh</div><div class="sub">projeção {number(total["projected_month_kwh"], 0)} kWh</div></div>
    </section>

    <section class="section section-3">
      <div class="card">
        <h2>Receita por dia</h2>
        <canvas id="dailyChart"></canvas>
      </div>
      <div class="card pie-card">
        <h2>Forma de pagamento</h2>
        <canvas id="paymentPie"></canvas>
        <div class="pay-grid">{payment_chips}</div>
      </div>
      <div class="card pie-card">
        <h2>Concentração por cliente</h2>
        <canvas id="userPie"></canvas>
      </div>
    </section>

    <section class="section">
      <div class="card">
        <h2>Top usuários — receita</h2>
        <div class="user-bars">{user_bars}</div>
      </div>
      <div class="card">
        <h2>Leitura financeira</h2>
        <div class="note">
          O painel recalcula automaticamente quando a nova planilha for anexada.
          Nesta parcial, os dois maiores usuários concentram <strong>{pct(top_two_share)}</strong> da receita.
          Isso torna o acompanhamento de recorrência e retenção tão importante quanto o volume total.
        </div>
      </div>
    </section>

    <section class="section">
      <div class="card">
        <h2>Mensal e acumulado</h2>
        <table>
          <thead><tr>{''.join(f'<th>{label}</th>' for _, label in [("Mês","Mês"),("Recargas","Recargas"),("Clientes","Clientes"),("kWh","kWh"),("Receita","Receita"),("Ticket médio","Ticket médio"),("Ocup. parcial","Ocup. parcial"),("Ocup. mês cheio","Ocup. mês cheio")])}</tr></thead>
          <tbody>{table_rows(monthly, [(k, k) for k in monthly[0].keys()])}</tbody>
        </table>
      </div>
      <div class="card">
        <h2>Base da análise</h2>
        <table>
          <tbody>
            <tr><td>Estação</td><td>{model["station"]}</td></tr>
            <tr><td>Período exportado</td><td>{model["start"]} a {model["end"]}</td></tr>
            <tr><td>Dias cobertos</td><td>{number(model["period_hours"] / 24, 1)} dias</td></tr>
            <tr><td>Potência nominal usada</td><td>{number(model["charger_kw"], 1)} kW</td></tr>
            <tr><td>Tipo de leitura</td><td>Parcial, atualizável na virada do mês</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <div class="card">
        <h2>Clientes</h2>
        <table>
          <thead><tr>{''.join(f'<th>{key}</th>' for key in users[0].keys())}</tr></thead>
          <tbody>{table_rows(users, [(k, k) for k in users[0].keys()])}</tbody>
        </table>
      </div>
      <div class="card">
        <h2>Alertas de ociosidade</h2>
        <table>
          <thead><tr>{''.join(f'<th>{key}</th>' for key in idle[0].keys())}</tr></thead>
          <tbody>{table_rows(idle, [(k, k) for k in idle[0].keys()])}</tbody>
        </table>
      </div>
    </section>

    <section class="section tech-section">
      <div class="card" style="grid-column:1/-1">
        <h2>Diagnóstico técnico e operacional</h2>
        <table>
          <thead><tr><th>Indicador</th><th>Valor</th><th>Leitura</th></tr></thead>
          <tbody>{table_rows(technical_rows, [(k, k) for k in technical_rows[0].keys()])}</tbody>
        </table>
      </div>
    </section>
  </main>
  <script src="sidebar.js"></script>
  <script src="backup_guard.js"></script>
  <script>
    const daily = {chart_data};
    const payments = {payment_chart_data};
    const users = {user_chart_data};
    const chartColors = ["#5BC882", "#246BFE", "#FFD66B", "#00E5FF", "#F2A93D", "#8BD7A8"];
    new Chart(document.getElementById("dailyChart"), {{
      type: "bar",
      data: {{
        labels: daily.map(d => d.dia.slice(5).split("-").reverse().join("/")),
        datasets: [
          {{ label: "Receita (R$)", data: daily.map(d => d.receita), backgroundColor: "#5BC882", yAxisID: "y" }}
        ]
      }},
      options: {{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {{ legend: {{ position: "bottom", labels: {{ color: "#E8EFEB" }} }} }},
        scales: {{
          y: {{ beginAtZero: true, position: "left", ticks: {{ color: "#8FA39A" }}, grid: {{ color: "#2A3530" }} }},
          x: {{ ticks: {{ color: "#8FA39A" }}, grid: {{ color: "#2A3530" }} }}
        }}
      }}
    }});
    new Chart(document.getElementById("paymentPie"), {{
      type: "doughnut",
      data: {{
        labels: payments.map(p => p.tipo),
        datasets: [{{ data: payments.map(p => p.qtd), backgroundColor: chartColors, borderColor: "#16221E", borderWidth: 3 }}]
      }},
      options: {{ responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: {{ legend: {{ position: "bottom", labels: {{ color: "#E8EFEB" }} }} }} }}
    }});
    new Chart(document.getElementById("userPie"), {{
      type: "doughnut",
      data: {{
        labels: users.map(u => (u.usuario || "Cliente").split(" ")[0]),
        datasets: [{{ data: users.map(u => u.receita), backgroundColor: chartColors, borderColor: "#16221E", borderWidth: 3 }}]
      }},
      options: {{ responsive: true, maintainAspectRatio: false, cutout: "58%", plugins: {{ legend: {{ position: "bottom", labels: {{ color: "#E8EFEB" }} }} }} }}
    }});
  </script>
</body>
</html>"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=DEFAULT_INPUT)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--charger-kw", type=float, default=7.0)
    args = parser.parse_args()

    df = load_recargas(args.input)
    model = build_model(df, args.charger_kw)
    output = Path(args.output)
    output.write_text(render_html(model), encoding="utf-8")
    output.with_suffix(".json").write_text(json.dumps(model, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(output.resolve())
    print(output.with_suffix(".json").resolve())
    print(json.dumps(model["total"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
