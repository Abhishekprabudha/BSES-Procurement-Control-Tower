const DATA_FILES = {
  materials: 'data/materials.json',
  marketPrices: 'data/market-prices.json',
  demandHistory: 'data/demand-history.json',
  projects: 'data/projects.json',
  vendors: 'data/vendors.json',
  contracts: 'data/contracts.json',
  purchaseOrders: 'data/purchase-orders.json',
  invoices: 'data/invoices.json',
  publicSources: 'data/public-sources.json',
  evidence: 'data/evidence.json'
};

const state = { data: {}, charts: {}, activeView: 'dashboard' };
const localEvidenceKey = 'bsesProcurementOsintCaptures';

const $ = (id) => document.getElementById(id);
const byId = (arr, id) => arr.find((x) => x.id === id);
const fmt = new Intl.NumberFormat('en-IN');
const money = (value) => `₹${fmt.format(Math.round(value))}`;
const cr = (value) => `₹${(value / 10000000).toFixed(2)} Cr`;
const pct = (value) => `${Number(value).toFixed(1)}%`;

function optionList(items, labelFn = (x) => x.name, valueFn = (x) => x.id) {
  return items.map((item) => `<option value="${valueFn(item)}">${labelFn(item)}</option>`).join('');
}

function setHtml(id, html) { $(id).innerHTML = html; }

async function loadData() {
  const entries = await Promise.all(Object.entries(DATA_FILES).map(async ([key, path]) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Could not load ${path}`);
    return [key, await res.json()];
  }));
  state.data = Object.fromEntries(entries);
}

function destroyChart(id) {
  if (state.charts[id]) {
    state.charts[id].destroy();
    delete state.charts[id];
  }
}

function drawChart(id, config) {
  destroyChart(id);
  const canvas = $(id);
  if (!canvas || !window.Chart) return;
  state.charts[id] = new Chart(canvas, config);
}

function baseChartOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { labels: { color: '#dce8f7' } },
      tooltip: { intersect: false, mode: 'index' }
    },
    scales: {
      x: { ticks: { color: '#9fb1ca' }, grid: { color: 'rgba(255,255,255,0.07)' } },
      y: { ticks: { color: '#9fb1ca' }, grid: { color: 'rgba(255,255,255,0.07)' } }
    },
    ...extra
  };
}

function latestPrice(commodity) {
  const series = state.data.marketPrices
    .filter((x) => x.commodity === commodity)
    .sort((a, b) => a.date.localeCompare(b.date));
  return series.at(-1)?.priceInrPerKg || 0;
}

function commoditySeries(commodity) {
  return state.data.marketPrices
    .filter((x) => x.commodity === commodity)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function linearForecast(series, monthsAhead = 3) {
  if (series.length < 2) {
    const price = series[0]?.priceInrPerKg || 0;
    return { forecast: price, slope: 0, volatility: 0, changePct: 0 };
  }
  const n = series.length;
  const xs = series.map((_, i) => i + 1);
  const ys = series.map((x) => x.priceInrPerKg);
  const xbar = xs.reduce((a, b) => a + b, 0) / n;
  const ybar = ys.reduce((a, b) => a + b, 0) / n;
  const numerator = xs.reduce((sum, x, i) => sum + (x - xbar) * (ys[i] - ybar), 0);
  const denominator = xs.reduce((sum, x) => sum + (x - xbar) ** 2, 0);
  const slope = denominator ? numerator / denominator : 0;
  const last = ys.at(-1);
  const forecast = Math.max(0, last + slope * monthsAhead);
  const changes = ys.slice(1).map((y, i) => (y - ys[i]) / ys[i]);
  const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
  const variance = changes.reduce((sum, v) => sum + (v - avg) ** 2, 0) / changes.length;
  const volatility = Math.sqrt(variance);
  return { forecast, slope, volatility, changePct: ((forecast - last) / last) * 100 };
}

function materialExposure(material, quantity = 1) {
  const rows = material.bom.map((line) => {
    const price = latestPrice(line.commodity);
    const cost = line.kgPerUnit * quantity * price * (1 + line.wastage);
    return { ...line, price, cost };
  });
  const metals = rows.reduce((sum, x) => sum + x.cost, 0);
  return { rows, metals };
}

function calculateShouldCost(materialId, quantity) {
  const material = byId(state.data.materials, materialId);
  const exposure = materialExposure(material, quantity);
  const base = exposure.metals;
  const adders = material.costAdders;
  const conversion = base * adders.conversionPct;
  const testing = base * adders.testingPct;
  const freight = base * adders.freightPct;
  const overheads = base * adders.overheadsPct;
  const preMargin = base + conversion + testing + freight + overheads;
  const margin = preMargin * adders.vendorMarginPct;
  const total = preMargin + margin;
  const unit = total / quantity;
  return { material, quantity, lines: exposure.rows, base, conversion, testing, freight, overheads, margin, total, unit };
}

function vendorScore(vendor, materialId = null) {
  const fitBonus = materialId && vendor.materials.includes(materialId) ? 6 : 0;
  const score = vendor.capacityScore * 0.18 + vendor.qualityScore * 0.24 + vendor.deliveryScore * 0.18 + vendor.financialScore * 0.12 + vendor.priceScore * 0.16 + vendor.complianceScore * 0.12 + fitBonus - vendor.riskFlags.length * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getOsintCaptures() {
  try { return JSON.parse(localStorage.getItem(localEvidenceKey) || '[]'); }
  catch { return []; }
}

function setOsintCaptures(rows) { localStorage.setItem(localEvidenceKey, JSON.stringify(rows, null, 2)); }

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadText(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function monthAdd(yearMonth, offset) {
  const [year, month] = yearMonth.split('-').map(Number);
  const d = new Date(year, month - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function forecastDemand(materialId, zone, horizon = 6) {
  const history = state.data.demandHistory
    .filter((x) => x.materialId === materialId && x.zone === zone)
    .sort((a, b) => a.month.localeCompare(b.month));
  const lastMonth = history.at(-1)?.month || '2026-06';
  const recent = history.slice(-6).map((x) => Number(x.actualQuantity));
  const weights = [1, 1.05, 1.1, 1.15, 1.22, 1.3].slice(-recent.length);
  const weightedAvg = recent.reduce((sum, q, i) => sum + q * weights[i], 0) / weights.reduce((a, b) => a + b, 0);
  const relevantProjects = state.data.projects.filter((p) => p.zone === zone && p.materials[materialId]);
  const rows = [];
  for (let i = 1; i <= horizon; i++) {
    const month = monthAdd(lastMonth, i);
    const projectQty = relevantProjects
      .filter((p) => p.startMonth <= month)
      .reduce((sum, p) => sum + (p.materials[materialId] || 0) / 3, 0);
    const season = 1 + 0.08 * Math.sin((i + 2) / 12 * 2 * Math.PI);
    const p50 = Math.max(0, weightedAvg * season + projectQty);
    const p90 = p50 * 1.22;
    rows.push({ month, p50, p90, projectQty });
  }
  return { history, rows, relevantProjects, weightedAvg };
}

function allowedEscalationPct(contract, invoice) {
  if (!contract || !contract.baseCommodity) return 0;
  if (contract.capPct === 0 && contract.floorPct === 0) return 0;
  const current = latestPrice(contract.baseCommodity);
  const raw = ((current - contract.baseCommodityPrice) / contract.baseCommodityPrice) * 100;
  return Math.max(contract.floorPct, Math.min(contract.capPct, raw));
}

function validateInvoiceModel(invoice) {
  const po = byId(state.data.purchaseOrders, invoice.poId);
  const contract = po ? byId(state.data.contracts, po.contractId) : null;
  const material = byId(state.data.materials, invoice.materialId);
  const duplicates = state.data.invoices.filter((x) => x.id !== invoice.id && (x.invoiceNumber === invoice.invoiceNumber || x.irn === invoice.irn));
  const allowedEsc = allowedEscalationPct(contract, invoice);
  const expectedUnit = contract ? contract.baseUnitPrice * (1 + allowedEsc / 100) : invoice.unitPriceClaimed;
  const unitVariancePct = expectedUnit ? ((invoice.unitPriceClaimed - expectedUnit) / expectedUnit) * 100 : 0;
  const quantityFailQty = po ? Math.max(0, invoice.quantity - po.grnQuantity) : 0;
  const priceOverbill = Math.max(0, invoice.unitPriceClaimed - expectedUnit) * Math.min(invoice.quantity, po?.grnQuantity || invoice.quantity);
  const quantityOverbill = quantityFailQty * invoice.unitPriceClaimed;
  const taxMultiplier = 1 + (invoice.taxRatePct || 0) / 100;
  const potentialOverbilling = (priceOverbill + quantityOverbill) * taxMultiplier;

  const checks = [
    { name: 'PO exists and vendor matches', passed: !!po && po.vendorId === invoice.vendorId, detail: po ? `${po.id} found` : 'PO not found' },
    { name: 'GRN quantity match', passed: !!po && invoice.quantity <= po.grnQuantity, detail: po ? `Invoice ${invoice.quantity}, GRN ${po.grnQuantity}` : 'No GRN' },
    { name: 'HSN code match', passed: !!material && invoice.hsn === material.hsn, detail: `Invoice ${invoice.hsn}, material ${material?.hsn || '-'}` },
    { name: 'Tax rate match', passed: !!po && invoice.taxRatePct === po.taxRatePct, detail: `Invoice ${invoice.taxRatePct}%, PO ${po?.taxRatePct || '-'}%` },
    { name: 'IRN / QR basic validity', passed: invoice.irn?.length === 64 && /^Valid/.test(invoice.qrStatus), detail: invoice.qrStatus },
    { name: 'Duplicate invoice / IRN check', passed: duplicates.length === 0, detail: duplicates.length ? `Duplicate candidates: ${duplicates.map((d) => d.id).join(', ')}` : 'No duplicate found' },
    { name: 'Escalation within contract', passed: invoice.claimedEscalationPct <= allowedEsc + (contract?.tolerancePct || 0), detail: `Claimed ${pct(invoice.claimedEscalationPct)}, allowed ${pct(allowedEsc)} + tolerance ${pct(contract?.tolerancePct || 0)}` },
    { name: 'Unit price within expected band', passed: unitVariancePct <= (contract?.tolerancePct || 0), detail: `Claimed ${money(invoice.unitPriceClaimed)}, expected ${money(expectedUnit)} (${pct(unitVariancePct)} variance)` }
  ];
  const failed = checks.filter((x) => !x.passed);
  const status = failed.length ? 'HOLD_FOR_REVIEW' : 'PASS';
  const riskScore = Math.min(100, failed.length * 14 + (potentialOverbilling > 0 ? 18 : 0));
  return { invoice, po, contract, material, duplicates, allowedEsc, expectedUnit, unitVariancePct, potentialOverbilling, checks, failed, status, riskScore };
}

function initNavigation() {
  $('navTabs').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-view]');
    if (!button) return;
    state.activeView = button.dataset.view;
    document.querySelectorAll('.nav button').forEach((btn) => btn.classList.toggle('active', btn === button));
    document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
    $(`view-${state.activeView}`).classList.add('active');
    renderActiveView();
  });
}

function populateControls() {
  const materials = state.data.materials;
  const materialOptions = optionList(materials, (m) => `${m.name} (${m.uom})`);
  ['demandMaterial', 'costMaterial', 'vendorMaterial', 'contractMaterial'].forEach((id) => setHtml(id, materialOptions));
  setHtml('invoiceSelect', optionList(state.data.invoices, (i) => `${i.invoiceNumber} — ${byId(state.data.vendors, i.vendorId)?.name || i.vendorId}`));
  const zones = [...new Set(state.data.demandHistory.map((x) => x.zone))].sort();
  setHtml('demandZone', optionList(zones, (z) => z, (z) => z));
  const commodities = [...new Set(state.data.marketPrices.map((x) => x.commodity))].sort();
  setHtml('commoditySelect', optionList(commodities, (c) => c, (c) => c));
  $('commoditySelect').value = 'Aluminium';
  $('demandZone').value = 'Dwarka';
  $('demandMaterial').value = 'MAT-AL-CABLE-33KV';
  $('costMaterial').value = 'MAT-AL-CABLE-33KV';
  $('vendorMaterial').value = 'MAT-AL-CABLE-33KV';
  $('contractMaterial').value = 'MAT-AL-CABLE-33KV';
  populateContractVendors();
}

function bindInputs() {
  $('commoditySelect').addEventListener('change', renderMarket);
  $('demandMaterial').addEventListener('change', renderDemand);
  $('demandZone').addEventListener('change', renderDemand);
  $('runShouldCost').addEventListener('click', renderShouldCost);
  $('costMaterial').addEventListener('change', renderShouldCost);
  $('costQuantity').addEventListener('input', renderShouldCost);
  $('vendorSearch').addEventListener('input', renderVendors);
  $('vendorMaterial').addEventListener('change', renderVendors);
  $('contractMaterial').addEventListener('change', () => { populateContractVendors(); renderContracts(); });
  $('contractVendor').addEventListener('change', renderContracts);
  $('generateContract').addEventListener('click', renderContracts);
  $('validateInvoice').addEventListener('click', renderInvoices);
  $('invoiceSelect').addEventListener('change', renderInvoices);
  $('validateAllInvoices').addEventListener('click', () => downloadJson('invoice-validation-report.json', state.data.invoices.map(validateInvoiceModel)));
  $('runOsint').addEventListener('click', renderOsintSearch);
  $('saveCapture').addEventListener('click', saveOsintCapture);
  $('exportOsint').addEventListener('click', () => downloadJson('osint-captures.json', getAllEvidence()));
  $('clearOsint').addEventListener('click', () => { setOsintCaptures([]); renderStoredEvidence(); });
}

function renderActiveView() {
  const renders = {
    dashboard: renderDashboard,
    market: renderMarket,
    demand: renderDemand,
    shouldcost: renderShouldCost,
    vendors: renderVendors,
    contracts: renderContracts,
    invoices: renderInvoices,
    osint: () => { renderOsintSearch(); renderStoredEvidence(); },
    data: renderDataRoom
  };
  renders[state.activeView]?.();
}

function renderDashboard() {
  const validations = state.data.invoices.map(validateInvoiceModel);
  const hold = validations.filter((v) => v.status !== 'PASS');
  const overbilling = validations.reduce((sum, v) => sum + v.potentialOverbilling, 0);
  const upcomingCable = forecastDemand('MAT-AL-CABLE-33KV', 'Dwarka').rows[0].p50 + forecastDemand('MAT-AL-CABLE-33KV', 'Najafgarh').rows[0].p50;
  const discovered = state.data.vendors.filter((v) => /New/.test(v.status)).length;
  const marketRisk = linearForecast(commoditySeries('Aluminium'), 3).changePct;
  setHtml('kpiGrid', `
    <div class="kpi-card"><span>Potential invoice hold</span><strong>${cr(overbilling)}</strong><small>From duplicate, GRN and index checks</small></div>
    <div class="kpi-card"><span>Upcoming 33kV cable demand</span><strong>${upcomingCable.toFixed(1)} km</strong><small>Next forecast month, Dwarka + Najafgarh</small></div>
    <div class="kpi-card"><span>New vendor opportunities</span><strong>${discovered}</strong><small>Mock OSINT and public tender discovery</small></div>
    <div class="kpi-card"><span>Aluminium 90-day risk</span><strong>${pct(marketRisk)}</strong><small>Client-side linear forecast</small></div>
  `);
  setHtml('recommendationList', `
    <div class="rec"><strong>Lock 60% of aluminium cable demand now</strong><p>Aluminium trend is upward. Use an indexed contract for the balance so BSES avoids overpaying if the market softens.</p></div>
    <div class="rec"><strong>Qualify Northstar Metals as a challenger vendor</strong><p>Strong price score and local proximity, but route through factory audit before approval.</p></div>
    <div class="rec"><strong>Hold Alpha Cables invoice AIC/26/0621</strong><p>Invoice quantity exceeds GRN and escalation claimed is above the contract-linked metal index allowance.</p></div>
    <div class="rec"><strong>Use transformer framework agreement</strong><p>For copper-heavy transformer procurement, lock conversion margin and index only copper/CRGO pass-through.</p></div>
  `);
  drawChart('riskChart', {
    type: 'bar',
    data: { labels: validations.map((v) => v.invoice.invoiceNumber), datasets: [{ label: 'Risk score', data: validations.map((v) => v.riskScore) }] },
    options: baseChartOptions({ scales: { y: { beginAtZero: true, suggestedMax: 100, ticks: { color: '#9fb1ca' }, grid: { color: 'rgba(255,255,255,0.07)' } }, x: { ticks: { color: '#9fb1ca' }, grid: { color: 'rgba(255,255,255,0.07)' } } } })
  });
  const exposure = state.data.materials.map((m) => ({ name: m.family, value: materialExposure(m, 1).metals }));
  drawChart('exposureChart', {
    type: 'doughnut',
    data: { labels: exposure.map((x) => x.name), datasets: [{ label: 'Metal exposure', data: exposure.map((x) => x.value) }] },
    options: { responsive: true, plugins: { legend: { labels: { color: '#dce8f7' } } } }
  });
  setHtml('evidencePreview', state.data.evidence.slice(0, 4).map(evidenceCard).join(''));
}

function renderMarket() {
  const selected = $('commoditySelect').value || 'Aluminium';
  const series = commoditySeries(selected);
  const forecast = linearForecast(series, 3);
  const labels = series.map((x) => x.date.slice(0, 7)).concat(['+90d']);
  const data = series.map((x) => x.priceInrPerKg).concat(Math.round(forecast.forecast));
  drawChart('marketChart', {
    type: 'line',
    data: { labels, datasets: [{ label: `${selected} INR/kg`, data, tension: 0.32 }] },
    options: baseChartOptions()
  });
  const cards = [...new Set(state.data.marketPrices.map((x) => x.commodity))].sort().map((commodity) => {
    const fc = linearForecast(commoditySeries(commodity), 3);
    const last = latestPrice(commodity);
    const tone = fc.changePct > 3 ? 'warn' : fc.changePct < -1 ? 'good' : '';
    const action = fc.changePct > 3 ? 'Prefer indexed contract / early lock' : fc.changePct < -1 ? 'Consider staggered buying' : 'Stable buying window';
    return `<div class="mini-card"><h4>${commodity}</h4><strong>${money(last)}/kg</strong><p>90-day forecast: <span class="badge ${tone}">${pct(fc.changePct)}</span></p><p>${action}</p></div>`;
  }).join('');
  setHtml('commodityCards', cards);
}

function renderDemand() {
  const materialId = $('demandMaterial').value;
  const zone = $('demandZone').value;
  const material = byId(state.data.materials, materialId);
  const forecast = forecastDemand(materialId, zone);
  const recent = forecast.history.slice(-6);
  drawChart('demandChart', {
    type: 'line',
    data: {
      labels: recent.map((x) => x.month).concat(forecast.rows.map((x) => x.month)),
      datasets: [
        { label: `Actual ${material.uom}`, data: recent.map((x) => x.actualQuantity).concat(Array(forecast.rows.length).fill(null)), tension: 0.3 },
        { label: `Forecast P50 ${material.uom}`, data: Array(recent.length).fill(null).concat(forecast.rows.map((x) => Number(x.p50.toFixed(2)))), tension: 0.3 },
        { label: `Forecast P90 ${material.uom}`, data: Array(recent.length).fill(null).concat(forecast.rows.map((x) => Number(x.p90.toFixed(2)))), tension: 0.3 }
      ]
    },
    options: baseChartOptions()
  });
  const projectNames = forecast.relevantProjects.map((p) => p.name).join(', ') || 'No direct project uplift in mock data';
  setHtml('demandNarrative', `<strong>${material.name} in ${zone}:</strong> next month P50 is <strong>${forecast.rows[0].p50.toFixed(2)} ${material.uom}</strong>, with P90 buffer <strong>${forecast.rows[0].p90.toFixed(2)} ${material.uom}</strong>. Drivers: recent consumption weighted average, seasonality and project uplift. Projects: ${projectNames}.`);
  setHtml('demandTable', `<thead><tr><th>Month</th><th>P50 demand</th><th>P90 buffer</th><th>Project uplift</th><th>Recommended action</th></tr></thead><tbody>${forecast.rows.map((r) => `<tr><td>${r.month}</td><td>${r.p50.toFixed(2)} ${material.uom}</td><td>${r.p90.toFixed(2)} ${material.uom}</td><td>${r.projectQty.toFixed(2)} ${material.uom}</td><td>${r.p90 > r.p50 * 1.18 ? 'Buy safety stock / split delivery' : 'Normal procurement window'}</td></tr>`).join('')}</tbody>`);
}

function renderShouldCost() {
  const materialId = $('costMaterial').value;
  const quantity = Math.max(0.1, Number($('costQuantity').value || 1));
  const result = calculateShouldCost(materialId, quantity);
  const mockQuote = result.total * 1.068;
  const variance = mockQuote - result.total;
  setHtml('shouldCostSummary', `
    <h4>${result.material.name}</h4>
    <span class="big">${money(result.total)}</span>
    <p>AI fair unit price: <strong>${money(result.unit)}</strong> per ${result.material.uom}</p>
    <p>Mock vendor quote: <strong>${money(mockQuote)}</strong> | Negotiation room: <span class="money-warn"><strong>${money(variance)}</strong></span></p>
    <div class="badges"><span class="badge good">BOM backed</span><span class="badge warn">Market-indexed</span><span class="badge">${result.material.preferredContract}</span></div>
  `);
  const labels = ['Metals/BOM', 'Conversion', 'Testing', 'Freight', 'Overheads', 'Vendor margin'];
  const data = [result.base, result.conversion, result.testing, result.freight, result.overheads, result.margin];
  drawChart('costChart', {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Cost component INR', data: data.map((x) => Math.round(x)) }] },
    options: baseChartOptions({ plugins: { legend: { display: false } } })
  });
}

function renderVendors() {
  const materialId = $('vendorMaterial').value;
  const q = ($('vendorSearch').value || '').toLowerCase().trim();
  const vendors = state.data.vendors
    .filter((v) => !materialId || v.materials.includes(materialId))
    .filter((v) => !q || JSON.stringify(v).toLowerCase().includes(q))
    .map((v) => ({ ...v, score: vendorScore(v, materialId) }))
    .sort((a, b) => b.score - a.score);
  setHtml('vendorCards', vendors.map((v) => `
    <div class="vendor-card">
      <div class="vendor-top">
        <div><h4>${v.name}</h4><span class="badge ${v.status.includes('New') ? 'good' : v.status.includes('Watch') ? 'bad' : ''}">${v.status}</span></div>
        <div class="score-ring" style="--score:${v.score}"><span>${v.score}</span></div>
      </div>
      <p>${v.city}, ${v.state} · ${v.discoveredFrom}</p>
      <div class="badges">${v.categories.map((c) => `<span class="badge">${c}</span>`).join('')}${v.msme ? '<span class="badge good">MSME</span>' : ''}</div>
      <p><strong>Certifications:</strong> ${v.certifications.join(', ')}</p>
      <p><strong>Risk flags:</strong> ${v.riskFlags.length ? v.riskFlags.join('; ') : 'None'}</p>
    </div>
  `).join('') || '<p class="muted">No vendors match the current filter.</p>');
}

function populateContractVendors() {
  const materialId = $('contractMaterial').value;
  const vendors = state.data.vendors.filter((v) => v.materials.includes(materialId)).sort((a, b) => vendorScore(b, materialId) - vendorScore(a, materialId));
  setHtml('contractVendor', optionList(vendors, (v) => `${v.name} — score ${vendorScore(v, materialId)}`));
}

function renderContracts() {
  const materialId = $('contractMaterial').value;
  const vendorId = $('contractVendor').value;
  const material = byId(state.data.materials, materialId);
  const vendor = byId(state.data.vendors, vendorId);
  const primaryCommodity = material.bom[0].commodity;
  const fc = linearForecast(commoditySeries(primaryCommodity), 3);
  const vol = fc.volatility * 100;
  const type = fc.changePct > 2.5 || vol > 2.5 ? 'Indexed Rate Contract' : material.preferredContract;
  const basePrice = latestPrice(primaryCommodity);
  const cap = fc.changePct > 4 ? 8 : 5;
  const should = calculateShouldCost(materialId, material.uom === 'MT' ? 10 : 5);
  setHtml('contractOutput', `
    <h4>${type}</h4>
    <p><strong>Material:</strong> ${material.name}</p>
    <p><strong>Vendor:</strong> ${vendor.name} · score ${vendorScore(vendor, materialId)}</p>
    <p><strong>Recommended base index:</strong> ${primaryCommodity} at ${money(basePrice)}/kg, with World Bank/LME/MCX evidence attached where available.</p>
    <p><strong>Commercial recommendation:</strong> Lock conversion, testing, freight and vendor margin. Pass through ${primaryCommodity} movement only beyond ±2% from base date. Cap upward movement at ${cap}% and allow downward reset to protect BSES.</p>
    <p><strong>Invoice validation rule:</strong> invoice escalation must be mathematically recomputed from the agreed index before payment release.</p>
    <pre>Clause draft\nBase ${primaryCommodity} Index = ${money(basePrice)}/kg.\nPayable Unit Price = Base Unit Price + BOM Metal Weight × (Current ${primaryCommodity} Index - Base ${primaryCommodity} Index) × Wastage Factor.\nEscalation band: ±2%. Upward cap: ${cap}%. Downward reset: -4%.\nDelay LD: 0.5% per week capped at 5%.\nQuality hold: payment released only after GRN + inspection + GST IRN/QR validation.</pre>
    <p><strong>Should-cost anchor:</strong> ${money(should.unit)} per ${material.uom} for demo quantity baseline.</p>
  `);
}

function renderInvoices() {
  const invoice = byId(state.data.invoices, $('invoiceSelect').value);
  const report = validateInvoiceModel(invoice);
  const statusClass = report.status === 'PASS' ? 'status-pass' : 'status-hold';
  setHtml('invoiceReport', `
    <h4>${invoice.invoiceNumber} — ${byId(state.data.vendors, invoice.vendorId)?.name}</h4>
    <span class="big ${statusClass}">${report.status.replaceAll('_', ' ')}</span>
    <p>Risk score: <strong>${report.riskScore}/100</strong> · Potential overbilling/hold: <span class="money-warn"><strong>${money(report.potentialOverbilling)}</strong></span></p>
    <p>Expected payable unit price from contract: <strong>${money(report.expectedUnit)}</strong>; claimed unit price: <strong>${money(invoice.unitPriceClaimed)}</strong>.</p>
    <div class="table-wrap"><table><thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead><tbody>
      ${report.checks.map((c) => `<tr><td>${c.name}</td><td>${c.passed ? '<span class="badge good">PASS</span>' : '<span class="badge bad">FAIL</span>'}</td><td>${c.detail}</td></tr>`).join('')}
    </tbody></table></div>
  `);
}

function evidenceCard(e) {
  return `<div class="evidence-item"><strong>${e.title}</strong><p>${e.summary}</p><a href="${e.url}" target="_blank" rel="noopener">Open source</a><div class="badges">${(e.tags || []).slice(0, 5).map((t) => `<span class="badge">${t}</span>`).join('')}<span class="badge ${e.confidence === 'High' ? 'good' : ''}">${e.confidence || 'Captured'}</span></div></div>`;
}

function getAllEvidence() {
  return [...state.data.evidence, ...getOsintCaptures()];
}

function renderOsintSearch() {
  const query = $('osintQuery').value.trim();
  const q = query.toLowerCase();
  const sourceLinks = state.data.publicSources.map((s) => {
    const site = s.url.replace(/^https?:\/\//, '').split('/')[0];
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${query} site:${site}`)}`;
    return `<div class="source-link"><div><strong>${s.name}</strong><span>${s.usage}</span></div><a href="${searchUrl}" target="_blank" rel="noopener">Search</a></div>`;
  }).join('');
  setHtml('sourceLinks', sourceLinks);
  const results = getAllEvidence().filter((e) => !q || JSON.stringify(e).toLowerCase().includes(q) || q.split(/\s+/).some((token) => JSON.stringify(e).toLowerCase().includes(token))).slice(0, 12);
  setHtml('osintResults', results.length ? results.map(evidenceCard).join('') : '<p class="muted">No stored evidence matched. Use source links, then capture findings as JSON.</p>');
  renderStoredEvidence();
}

function saveOsintCapture() {
  const title = $('captureTitle').value.trim();
  const url = $('captureUrl').value.trim();
  const summary = $('captureSummary').value.trim();
  const tags = $('captureTags').value.split(',').map((x) => x.trim()).filter(Boolean);
  if (!title || !url || !summary) {
    alert('Please provide title, URL and summary before saving.');
    return;
  }
  const rows = getOsintCaptures();
  rows.push({ id: `CAP-${Date.now()}`, title, url, summary, tags, capturedDate: new Date().toISOString().slice(0, 10), confidence: 'User captured', sourceId: 'USER-CAPTURE' });
  setOsintCaptures(rows);
  ['captureTitle', 'captureUrl', 'captureSummary', 'captureTags'].forEach((id) => $(id).value = '');
  renderStoredEvidence();
  renderOsintSearch();
}

function renderStoredEvidence() {
  const rows = getAllEvidence();
  setHtml('storedEvidence', `<table><thead><tr><th>Title</th><th>Captured</th><th>Tags</th><th>Summary</th><th>URL</th></tr></thead><tbody>${rows.map((e) => `<tr><td>${e.title}</td><td>${e.capturedDate || '-'}</td><td>${(e.tags || []).join(', ')}</td><td>${e.summary}</td><td><a href="${e.url}" target="_blank" rel="noopener">Open</a></td></tr>`).join('')}</tbody></table>`);
}

function renderDataRoom() {
  const buttons = Object.keys(state.data).map((key) => `<button data-download="${key}">Download ${key}.json</button>`).join('');
  setHtml('dataDownloads', `<button class="primary" data-download="all">Export all demo data</button>${buttons}`);
  $('dataDownloads').onclick = (event) => {
    const btn = event.target.closest('button[data-download]');
    if (!btn) return;
    const key = btn.dataset.download;
    if (key === 'all') downloadJson('bses-procurement-intelligence-data.json', { ...state.data, osintCaptures: getOsintCaptures() });
    else downloadJson(`${key}.json`, state.data[key]);
  };
  setHtml('dataManifest', JSON.stringify({ files: DATA_FILES, recordCounts: Object.fromEntries(Object.entries(state.data).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v).length])), localOsintCaptures: getOsintCaptures().length }, null, 2));
}

function initialRender() {
  populateControls();
  bindInputs();
  renderDashboard();
  renderMarket();
  renderDemand();
  renderShouldCost();
  renderVendors();
  renderContracts();
  renderInvoices();
  renderStoredEvidence();
  renderDataRoom();
}

(async function boot() {
  initNavigation();
  try {
    await loadData();
    $('loading').classList.add('hidden');
    initialRender();
  } catch (err) {
    $('loading').classList.add('hidden');
    $('errorBox').classList.remove('hidden');
    $('errorBox').textContent = `${err.message}. Open this folder with a static server such as: python -m http.server 8080, or deploy to GitHub Pages.`;
    console.error(err);
  }
})();
