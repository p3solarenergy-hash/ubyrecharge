# UBY_SCHEMA

Use a aba `UBY_SCHEMA` com duas colunas:

- Coluna A: `campo`
- Coluna B: `valor`

Exemplo:

```text
campo	valor
project_name	POSTO EXEMPLO
address	Av. Brasil, 469 - Centro, Faxinal
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
occupancy.dc_pessimistic	0.15
occupancy.dc_base	0.30
occupancy.dc_optimistic	0.45
occupancy.ac_pessimistic	0.10
occupancy.ac_base	0.10
occupancy.ac_optimistic	0.10
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
```

Regras:

- O app prioriza `UBY_SCHEMA` quando essa aba existir.
- Se `UBY_SCHEMA` não existir, o app cai no modo legado e lê `Inputs`, `Cenários` e `Orçamento`.
- Você pode manter as abas antigas para cálculo interno da planilha, mas a plataforma passa a usar `UBY_SCHEMA` como fonte oficial.
