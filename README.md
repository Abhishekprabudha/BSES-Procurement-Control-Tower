# BSES Metals Procurement Intelligence Demo

A fully static, GitHub Pages-ready procurement intelligence control tower for a power distribution client such as BSES.

The app demonstrates an end-to-end intelligent procurement flow:

```text
Open source evidence → market intelligence → demand forecasting → should-costing → vendor discovery → smart contract recommendation → invoice validation
```

## Why this is static

This codebase has **no backend, no database and no server-side crawler**. It can be uploaded directly to GitHub Pages.

A pure browser application cannot reliably scrape arbitrary public websites because most portals block direct browser fetches through CORS and some sources require user sessions or anti-bot controls. Therefore, the app implements a practical static pattern:

1. Curated open-source source registry in `data/public-sources.json`.
2. Seeded evidence in `data/evidence.json`.
3. Browser-generated search links for BSES, GeM, CPPP, LME, MCX, World Bank and GST e-invoice sources.
4. User evidence capture into `localStorage`.
5. Export/import-ready JSON files.

## Main modules

- **Control Tower**: executive KPIs, invoice risk, metal exposure and AI recommendations.
- **Market Intelligence**: client-side metal price trend and 90-day forecast.
- **Demand Forecast**: zone-wise material demand forecasting using mocked historical consumption and CAPEX project uplift.
- **Should-Cost**: BOM-backed cost waterfall for aluminium cable, transformers, RMUs and galvanized structures.
- **Vendor Discovery**: vendor scoring across quality, delivery, price, compliance, financial and capacity dimensions.
- **Contract Builder**: indexed pricing clause recommendation tied to commodity movement.
- **Invoice Validator**: PO, GRN, HSN, GST IRN/QR mock checks, duplicate detection and contract escalation validation.
- **Open Source Search**: browser-safe OSINT workspace with JSON capture and export.
- **JSON Data Room**: download all demo datasets.

## Folder structure

```text
bses-procurement-intelligence/
├── index.html
├── assets/
│   └── styles.css
├── src/
│   └── app.js
├── data/
│   ├── materials.json
│   ├── market-prices.json
│   ├── demand-history.json
│   ├── projects.json
│   ├── vendors.json
│   ├── contracts.json
│   ├── purchase-orders.json
│   ├── invoices.json
│   ├── public-sources.json
│   └── evidence.json
└── README.md
```

## Local preview

Because the app loads JSON with `fetch`, run it through a local static server:

```bash
cd bses-procurement-intelligence
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Deploy to GitHub Pages

1. Create a GitHub repository, for example `bses-procurement-intelligence`.
2. Upload all files in this folder to the repository root.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
5. Save.
6. Open the GitHub Pages URL after deployment.

## Demo storyline for the client

Use this story during the demo:

1. BSES needs 33kV aluminium conductor cable for upcoming feeder reinforcement.
2. The system forecasts zone-wise demand using historical consumption and project drivers.
3. It predicts aluminium market movement and recommends buying strategy.
4. It calculates a BOM-backed should-cost and identifies negotiation room.
5. It discovers and ranks vendors, including new challenger vendors.
6. It generates an indexed contract clause with cap/floor and invoice validation logic.
7. It catches a mock vendor invoice where quantity exceeds GRN and escalation claim exceeds contract allowance.

## Important disclaimer

All BSES procurement, contract, invoice, vendor and market data inside this demo is synthetic or curated for demonstration purposes. Public source references are used only as navigational/evidence anchors. Replace the mock JSON files with real enterprise data when moving to production.
