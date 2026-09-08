# Manufacturing Procurement Intelligence Demo

A fully static, GitHub Pages-ready procurement control tower designed for manufacturing organizations across automotive, industrial equipment, electronics, consumer goods and other sectors.

The application demonstrates an end-to-end intelligent procurement flow:

```text
Open-source evidence → market intelligence → demand forecasting → should-costing → vendor discovery → smart contract recommendation → invoice validation
```

## Manufacturing scope

The seeded scenario deliberately spans multiple manufacturing categories rather than a single company or industry: sheet steel, bearings, aluminium castings, copper winding wire, engineering resin and corrugated packaging. Procurement demand is modeled across four plants and includes automotive, motors, appliances and machining project drivers. The same JSON schemas can be extended with any direct material, component, packaging item, MRO category, plant or business unit.

## Why this is static

This codebase has **no backend, database or server-side crawler** and can be uploaded directly to GitHub Pages. Because browsers cannot reliably scrape arbitrary portals, the OSINT workspace generates targeted source searches, stores user evidence in `localStorage`, and exports reusable JSON.

## Main modules

- **Control Tower**: executive KPIs, invoice risk, commodity exposure and recommendations.
- **Market Intelligence**: client-side raw-material trends and 90-day forecasts.
- **Demand Forecast**: plant-wise forecasting using synthetic ERP history and production-project uplift.
- **Should-Cost**: BOM-backed cost waterfalls for materials and manufactured components.
- **Vendor Discovery**: scoring across quality, delivery, price, compliance, finance and capacity.
- **Contract Builder**: commodity-indexed pricing clauses with caps and downward resets.
- **Invoice Validator**: PO, receipt, tax document, duplicate and escalation checks.
- **Open Source Search**: browser-safe supplier and market research with evidence capture.
- **JSON Data Room**: downloads of every demo dataset.

## Local preview

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

## Deploy to GitHub Pages

1. Create a GitHub repository and upload these files to its root.
2. In **Settings → Pages**, select **Deploy from a branch**.
3. Select the branch and `/root` folder, then save.

## Demo storyline

1. Aggregate cold-rolled steel and bearing demand across plants and production programs.
2. Forecast commodity movement and choose a buying strategy.
3. Calculate a BOM-backed should-cost and negotiation range.
4. Discover and score incumbent and challenger suppliers.
5. Generate a contract that indexes only auditable raw-material exposure.
6. Validate invoices against PO, goods receipt, tax and contract terms before release.

## Disclaimer

All procurement, contract, invoice, supplier and market records in this demo are synthetic or curated for demonstration. Public sources are navigational evidence anchors only. Replace the JSON fixtures with governed enterprise data and approved integrations for production use.
