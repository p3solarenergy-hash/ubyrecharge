# UBY_SCHEMA

Use a aba `UBY_SCHEMA` com duas colunas:

- Coluna A: `campo`
- Coluna B: `valor`

Exemplo:

```text
campo	valor
project.name	POSTO EXEMPLO
project.status	Em Estudo
implantation.address	Av. Brasil, 469 - Centro, Faxinal - PR, 86840-000
implantation.city	Faxinal
implantation.state	PR
implantation.capex_total	128000
management.partner_name	Planilha
operations.sessions_monthly	0
operations.energy_kwh_monthly	64800
operations.availability_pct	0
finance.revenue_monthly	115992
finance.ebitda_monthly	44233.6
finance.gross_result_monthly	47433.6
finance.net_result_monthly	26044.41
integration.source_type	planilha
map.lat	-23.310551
map.lon	-51.162843
operational.chargers_dc	1
operational.chargers_ac	0
operational.power_dc_kw	60
operational.power_ac_kw	7
operational.plugs_total	1
operational.power_total_kw	60
operational.hours_per_day	24
operational.days_per_month	30
operational.efficiency_factor	1
operational.battery_capacity_kwh	30
pricing.sale_price_dc	1.79
pricing.sale_price_ac	1.59
pricing.energy_cost_kwh	0.70
pricing.other_variable_cost_kwh	0
occupancy.dc_base	0.30
occupancy.ac_base	0.10
costs.area_share_pct	0.10
costs.management_pct	0.15
costs.taxes_pct	0.05
costs.fixed_costs_monthly	568
costs.replacement_capex_monthly	0
investment.capex_total	128000
investment.project_horizon_months	60
investment.discount_rate_annual	0.1475
growth.energy_cost_annual	0.05
growth.sale_price_annual	0.05
growth.fixed_costs_annual	0
chargers[0].id	DC-1
chargers[0].type	DC
chargers[0].power_kw	60
chargers[0].status	ativo
chargers[0].connector_count	1
chargers[0].partner_ref	Planilha
```

Regras:

- O app prioriza `UBY_SCHEMA` quando essa aba existir.
- Se `UBY_SCHEMA` nao existir, o app cai no modo legado e le `Inputs`, `Cenarios` e `Orcamento`.
- O contrato novo usa apenas o `cenario base`; pessimista e otimista ficam fora da fonte oficial do app.
- Latitude e longitude devem ser persistidas na `UBY_SCHEMA`, preferencialmente via sincronizacao com Google Geocoding.
- As abas antigas podem continuar existindo para calculo interno da planilha, mas a plataforma passa a usar `UBY_SCHEMA` como fonte oficial.
