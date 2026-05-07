// ============================================================
// SOM INSTITUTIONAL DASHBOARD — app.js
// ============================================================

'use strict';

let universe = 'nifty50';
let activeTab = 'overview';
const charts = {};

const LAYER_META = {
  Base:        { label: 'Base SIM',      tag: 'tag-base',  color: '#94a3b8' },
  ST:          { label: 'ST Filter',     tag: 'tag-st',    color: '#60a5fa' },
  EMA:         { label: 'EMA Filter',    tag: 'tag-ema',   color: '#34d399' },
  COMBO:       { label: 'COMBO Filter',  tag: 'tag-combo', color: '#fbbf24' },
  ULTRA:       { label: 'ULTRA Layer',   tag: 'tag-ultra', color: '#a78bfa' },
  COMBO_HEDGE: { label: 'COMBO+Hedge',   tag: 'tag-ch',    color: '#00c6ff' },
  ULTRA_HEDGE: { label: 'ULTRA Defense', tag: 'tag-uh',    color: '#f472b6' },
  Bench:       { label: 'Benchmark',     tag: '',          color: 'rgba(255,255,255,0.25)' }
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── CHART DEFAULTS ──────────────────────────────────────────
Chart.defaults.color = '#64748b';
Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding = 16;

function chartOpts(extra = {}) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#94a3b8' } },
      tooltip: { backgroundColor: '#0d1321', borderColor: '#1e293b', borderWidth: 1, padding: 10 }
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { maxTicksLimit: 12, color: '#64748b' } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b' } }
    },
    ...extra
  };
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

// ── UNIVERSE SWITCH ─────────────────────────────────────────
function switchUniverse(u) {
  universe = u;
  document.getElementById('btn-n50').classList.toggle('active', u === 'nifty50');
  document.getElementById('btn-n500').classList.toggle('active', u === 'nifty500');
  renderAll();
}

// ── TAB SWITCH ──────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    const ids = ['overview','layers','equity','heatmap','portfolio','trades'];
    b.classList.toggle('active', ids[i] === tab);
  });
  document.getElementById(`tab-${tab}`).classList.add('active');
  renderTabContent(tab);
}

// ── MAIN RENDER ─────────────────────────────────────────────
function renderAll() {
  document.getElementById('last-refresh').textContent = `Last update: ${DASHBOARD_DATA.last_update}`;
  renderTabContent(activeTab);
}

function renderTabContent(tab) {
  const d = DASHBOARD_DATA[universe];
  if (tab === 'overview')   renderOverview(d);
  if (tab === 'layers')     renderLayers(d);
  if (tab === 'equity')     renderEquity(d);
  if (tab === 'heatmap')    renderHeatmap();
  if (tab === 'portfolio')  renderPortfolio(d);
  if (tab === 'trades')     renderTrades(d);
}

// ── FMT HELPERS ─────────────────────────────────────────────
const pct = (v, dec=2) => v == null ? '—' : `${(+v >= 0 ? '+' : '')}${(+v).toFixed(dec)}%`;
const num = (v, dec=2) => v == null ? '—' : (+v).toFixed(dec);
const cls = v => +v >= 0 ? 'pos' : 'neg';

// ── OVERVIEW ────────────────────────────────────────────────
function renderOverview(d) {
  const uh = d.layer_metrics.ULTRA_HEDGE;

  // KPIs
  document.getElementById('kpi-row').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">CAGR (ULTRA Defense)</div>
      <div class="kpi-value ${uh.CAGR >= 0 ? 'pos' : 'neg'}">${pct(uh.CAGR)}</div>
      <div class="kpi-sub">Annualized Return</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Avg Ex-Ante Sharpe</div>
      <div class="kpi-value" style="color:var(--accent)">${num(d.avg_ex_ante_sr)}</div>
      <div class="kpi-sub">Forward-looking, avg across all months</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Realized Sharpe</div>
      <div class="kpi-value" style="color:var(--accent)">${num(uh.Sharpe)}</div>
      <div class="kpi-sub">Risk-adjusted performance</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Max Drawdown</div>
      <div class="kpi-value neg">${pct(uh.Max_DD)}</div>
      <div class="kpi-sub">Peak-to-trough</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Return</div>
      <div class="kpi-value ${uh.Total_Return >= 0 ? 'pos' : 'neg'}">${pct(uh.Total_Return)}</div>
      <div class="kpi-sub">${d.total_months} months</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Win Rate</div>
      <div class="kpi-value" style="color:var(--warn)">${num(uh.Win_Rate)}%</div>
      <div class="kpi-sub">Months with positive return</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Alpha vs Benchmark</div>
      <div class="kpi-value ${uh.Alpha >= 0 ? 'pos' : 'neg'}">${pct(uh.Alpha)}</div>
      <div class="kpi-sub">Annual excess return</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Sortino Ratio</div>
      <div class="kpi-value" style="color:var(--accent2)">${num(uh.Sortino)}</div>
      <div class="kpi-sub">Downside-adjusted return</div>
    </div>
  `;

  // Equity overview chart (all layers)
  destroyChart('equityOverview');
  const ec = d.equity_curves;
  const layers = ['Base','ST','EMA','COMBO','ULTRA','COMBO_HEDGE','ULTRA_HEDGE','Bench'];
  const datasets = layers.map(l => ({
    label: LAYER_META[l].label,
    data: ec[l],
    borderColor: LAYER_META[l].color,
    backgroundColor: 'transparent',
    borderWidth: l === 'ULTRA_HEDGE' ? 2.5 : (l === 'Bench' ? 1.5 : 1.2),
    borderDash: l === 'Bench' ? [4,4] : [],
    pointRadius: 0, tension: 0.3
  }));

  charts['equityOverview'] = new Chart(
    document.getElementById('equityOverview').getContext('2d'),
    { type: 'line', data: { labels: ec.months, datasets }, options: chartOpts() }
  );

  // Sector pie
  renderSectorPie('sectorPie', d.current_portfolio);

  // Bar monthly (ULTRA_HEDGE)
  destroyChart('barMonthly');
  const md = d.monthly_detail;
  const barColors = md.map(r => r.ULTRA_HEDGE >= 0 ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)');
  charts['barMonthly'] = new Chart(
    document.getElementById('barMonthly').getContext('2d'),
    {
      type: 'bar',
      data: {
        labels: md.map(r => r.Month),
        datasets: [{ label: 'ULTRA Defense', data: md.map(r => +(r.ULTRA_HEDGE*100).toFixed(2)),
          backgroundColor: barColors, borderRadius: 3 }]
      },
      options: chartOpts({ scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 15, color: '#64748b' } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', callback: v => v+'%' } }
      }})
    }
  );
}

// ── SECTOR PIE ──────────────────────────────────────────────
function renderSectorPie(canvasId, portfolio) {
  destroyChart(canvasId);
  const counts = {};
  portfolio.forEach(s => { counts[s.sector] = (counts[s.sector] || 0) + 1; });
  const COLORS = ['#00c6ff','#60a5fa','#a78bfa','#f472b6','#34d399','#fbbf24','#f87171','#818cf8','#2dd4bf'];
  charts[canvasId] = new Chart(
    document.getElementById(canvasId).getContext('2d'),
    {
      type: 'doughnut',
      data: {
        labels: Object.keys(counts),
        datasets: [{ data: Object.values(counts), backgroundColor: COLORS, borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: {
          legend: { position: 'right', labels: { color: '#94a3b8', padding: 14, boxWidth: 10, font: { size: 11 } } },
          tooltip: { backgroundColor: '#0d1321', borderColor: '#1e293b', borderWidth: 1 }
        }
      }
    }
  );
}

// ── ALL LAYERS ──────────────────────────────────────────────
function renderLayers(d) {
  const layers = ['Base','ST','EMA','COMBO','ULTRA','COMBO_HEDGE','ULTRA_HEDGE'];
  const metrics = ['CAGR','Volatility','Sharpe','Sortino','Calmar','Max_DD','Win_Rate','Avg_Gain','Avg_Loss','Alpha','Total_Return'];

  // Find best value per metric
  const best = {};
  metrics.forEach(m => {
    const vals = layers.map(l => d.layer_metrics[l][m]);
    best[m] = m === 'Max_DD' || m === 'Volatility' ? Math.max(...vals) : Math.max(...vals);
  });

  // Layer comparison table
  const tbody = document.getElementById('layerTableBody');
  tbody.innerHTML = layers.map(l => {
    const m = d.layer_metrics[l];
    const isBest = {};
    metrics.forEach(k => {
      if (k === 'Max_DD') isBest[k] = m[k] === Math.max(...layers.map(ll => d.layer_metrics[ll][k]));
      else if (k === 'Volatility') isBest[k] = m[k] === Math.min(...layers.map(ll => d.layer_metrics[ll][k]));
      else isBest[k] = m[k] === Math.max(...layers.map(ll => d.layer_metrics[ll][k]));
    });
    const td = (k, fmt, isNum=false) =>
      `<td class="${isBest[k] ? 'best' : ''} ${isNum ? cls(m[k]) : ''}">${fmt(m[k])}</td>`;

    return `<tr>
      <td><span class="layer-tag ${LAYER_META[l].tag}">${LAYER_META[l].label}</span></td>
      ${td('CAGR', v => pct(v), true)}
      ${td('Volatility', v => `${num(v)}%`)}
      ${td('Sharpe', v => num(v))}
      ${td('Sortino', v => num(v))}
      ${td('Calmar', v => num(v))}
      ${td('Max_DD', v => pct(v), true)}
      ${td('Win_Rate', v => `${num(v)}%`)}
      ${td('Avg_Gain', v => pct(v), true)}
      ${td('Avg_Loss', v => pct(v), true)}
      ${td('Alpha', v => pct(v), true)}
      ${td('Total_Return', v => pct(v), true)}
    </tr>`;
  }).join('');

  // Executive summary table
  const execData = d.exec_summary;
  const execLayers = ['Base','ST','EMA','COMBO','ULTRA','COMBO_HEDGE','ULTRA_HEDGE'];
  const execLayerLabels = ['Base SIM','ST Filter','EMA Filter','COMBO Filter','ULTRA Layer','COMBO+Hedge','ULTRA Defense'];
  
  document.getElementById('execTableHead').innerHTML = `<tr>
    <th>Metric</th>
    ${execLayerLabels.map(l => `<th>${l}</th>`).join('')}
  </tr>`;

  const metrics_exec = Object.keys(execData);
  document.getElementById('execTableBody').innerHTML = metrics_exec.map(metric => {
    const row = execData[metric];
    const vals = execLayers.map(l => row[l] || 0);
    return `<tr>
      <td>${metric}</td>
      ${execLayers.map((l, i) => {
        const v = vals[i];
        const isNum = typeof v === 'number';
        const display = isNum ? (Math.abs(v) < 2 ? num(v) : (v > 0.5 ? pct(v*100) : num(v))) : v;
        return `<td>${display}</td>`;
      }).join('')}
    </tr>`;
  }).join('');
}

// ── EQUITY CURVES ────────────────────────────────────────────
let visibleLayers = new Set(['Base','ULTRA_HEDGE','COMBO_HEDGE','Bench']);

function renderEquity(d) {
  // Layer toggle buttons
  const togglesEl = document.getElementById('equityLayerToggles');
  const layers = ['Base','ST','EMA','COMBO','ULTRA','COMBO_HEDGE','ULTRA_HEDGE','Bench'];
  togglesEl.innerHTML = layers.map(l => `
    <button onclick="toggleLayer('${l}')" id="toggle-${l}"
      style="padding:4px 12px;border-radius:6px;border:1px solid ${LAYER_META[l].color};
      background:${visibleLayers.has(l) ? LAYER_META[l].color+'33' : 'transparent'};
      color:${LAYER_META[l].color};font-size:0.75rem;font-weight:700;cursor:pointer;transition:all 0.2s">
      ${LAYER_META[l].label}
    </button>`).join('');

  buildEquityChart(d);

  // Ex-Ante Sharpe chart
  destroyChart('sharpeChart');
  const md = d.monthly_detail;
  charts['sharpeChart'] = new Chart(
    document.getElementById('sharpeChart').getContext('2d'),
    {
      type: 'line',
      data: {
        labels: md.map(r => r.Month),
        datasets: [{
          label: 'Ex-Ante Sharpe',
          data: md.map(r => +num(r.Ex_Ante_Sharpe)),
          borderColor: '#00c6ff',
          backgroundColor: 'rgba(0,198,255,0.08)',
          fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0
        }, {
          label: `Avg (${d.avg_ex_ante_sr})`,
          data: md.map(() => d.avg_ex_ante_sr),
          borderColor: 'rgba(167,139,250,0.6)',
          borderDash: [5,5], borderWidth: 1.5, pointRadius: 0
        }]
      },
      options: chartOpts()
    }
  );
}

function buildEquityChart(d) {
  destroyChart('equityMain');
  const ec = d.equity_curves;
  const layers = ['Base','ST','EMA','COMBO','ULTRA','COMBO_HEDGE','ULTRA_HEDGE','Bench'];
  const datasets = layers
    .filter(l => visibleLayers.has(l))
    .map(l => ({
      label: LAYER_META[l].label,
      data: ec[l],
      borderColor: LAYER_META[l].color,
      backgroundColor: 'transparent',
      borderWidth: ['ULTRA_HEDGE','COMBO_HEDGE'].includes(l) ? 2.5 : 1.5,
      borderDash: l === 'Bench' ? [5,5] : [],
      pointRadius: 0, tension: 0.3
    }));

  charts['equityMain'] = new Chart(
    document.getElementById('equityMain').getContext('2d'),
    { type: 'line', data: { labels: ec.months, datasets }, options: chartOpts() }
  );
}

function toggleLayer(l) {
  if (visibleLayers.has(l)) visibleLayers.delete(l);
  else visibleLayers.add(l);
  const btn = document.getElementById(`toggle-${l}`);
  const on = visibleLayers.has(l);
  btn.style.background = on ? LAYER_META[l].color + '33' : 'transparent';
  buildEquityChart(DASHBOARD_DATA[universe]);
}

// ── HEATMAP ──────────────────────────────────────────────────
function renderHeatmap() {
  const layer = document.getElementById('heatmapLayerSelect')?.value || 'ULTRA_HEDGE';
  const data = DASHBOARD_DATA[universe]?.heatmap?.[layer];
  if (!data) return;

  const container = document.getElementById('heatmapContainer');
  const cols = ['year', ...MONTHS, 'total'];

  // Compute per-row totals
  const rows = data.map(row => {
    const vals = MONTHS.map(m => row[m]);
    const valid = vals.filter(v => v != null);
    const total = valid.length ? valid.reduce((a, b) => a + b, 0) : null;
    return { ...row, total: total != null ? +total.toFixed(2) : null };
  });

  // Color scale
  function heatColor(v) {
    if (v == null) return 'rgba(255,255,255,0.03)';
    const intensity = Math.min(Math.abs(v) / 10, 1);
    if (v > 0) return `rgba(34,197,94,${0.1 + intensity * 0.7})`;
    return `rgba(239,68,68,${0.1 + intensity * 0.7})`;
  }

  const gridCols = `70px repeat(12, 1fr) 80px`;
  let html = `<div style="display:grid;grid-template-columns:${gridCols};gap:3px;min-width:900px">`;

  // Header row
  html += `<div class="hm-col-header"></div>`;
  MONTHS.forEach(m => { html += `<div class="hm-col-header">${m}</div>`; });
  html += `<div class="hm-col-header">Total</div>`;

  // Data rows
  rows.forEach(row => {
    html += `<div class="hm-year">${row.year}</div>`;
    MONTHS.forEach(m => {
      const v = row[m];
      html += `<div class="hm-cell" style="background:${heatColor(v)};color:${v == null ? '#334155' : (v >= 0 ? '#4ade80' : '#f87171')}">
        ${v != null ? (v > 0 ? '+' : '') + v.toFixed(1) + '%' : '—'}
      </div>`;
    });
    const t = row.total;
    html += `<div class="hm-cell" style="background:${heatColor(t)};color:${t == null ? '#334155' : (t >= 0 ? '#4ade80' : '#f87171')};font-weight:800">
      ${t != null ? (t > 0 ? '+' : '') + t.toFixed(1) + '%' : '—'}
    </div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

// ── LIVE PORTFOLIO ────────────────────────────────────────────
function renderPortfolio(d) {
  const port = d.current_portfolio;
  if (!port || port.length === 0) {
    document.getElementById('liveTickerList').innerHTML = '<p style="color:var(--muted)">No portfolio data available.</p>';
    return;
  }

  // Portfolio KPIs
  const avgChg = port.reduce((a, s) => a + (s.change_pct || 0), 0) / port.length;
  const latest = d.monthly_detail[d.monthly_detail.length - 1] || {};

  document.getElementById('portfolioKpis').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Holdings</div>
      <div class="kpi-value">${port.length}</div>
      <div class="kpi-sub">Current month</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Avg Daily Change</div>
      <div class="kpi-value ${avgChg >= 0 ? 'pos' : 'neg'}">${avgChg >= 0 ? '+' : ''}${avgChg.toFixed(2)}%</div>
      <div class="kpi-sub">Portfolio average today</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Portfolio Beta</div>
      <div class="kpi-value" style="color:var(--accent)">${num(latest.Port_Beta)}</div>
      <div class="kpi-sub">Weighted market sensitivity</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Ex-Ante Sharpe</div>
      <div class="kpi-value" style="color:var(--accent)">${num(latest.Ex_Ante_Sharpe)}</div>
      <div class="kpi-sub">Latest month forward Sharpe</div>
    </div>
  `;

  // Live ticker list
  const sorted = [...port].sort((a, b) => (b.change_pct || 0) - (a.change_pct || 0));
  document.getElementById('liveTickerList').innerHTML = sorted.map(s => `
    <div class="live-ticker">
      <div>
        <div class="ticker-name">${s.clean_symbol}</div>
        <div class="ticker-sector">${s.sector}</div>
      </div>
      <div class="ticker-price">
        <div class="ticker-ltp">₹${s.ltp > 0 ? s.ltp.toFixed(2) : '—'}</div>
        <div class="ticker-chg ${s.change_pct >= 0 ? 'pos' : 'neg'}">
          ${s.change_pct >= 0 ? '▲' : '▼'} ${Math.abs(s.change_pct).toFixed(2)}%
        </div>
      </div>
    </div>
  `).join('');

  // Sector chart
  renderSectorPie('portfolioSector', port);

  // Holdings table
  document.getElementById('holdingsBody').innerHTML = port.map(s => `
    <tr>
      <td style="font-weight:700">${s.clean_symbol}</td>
      <td style="color:var(--muted)">${s.sector}</td>
      <td>${(s.weight * 100).toFixed(1)}%</td>
      <td>${num(s.beta)}</td>
      <td>${num(s.erb)}</td>
      <td>${s.ltp > 0 ? '₹' + s.ltp.toFixed(2) : '—'}</td>
      <td class="${s.change_pct >= 0 ? 'pos' : 'neg'}">${s.change_pct >= 0 ? '+' : ''}${s.change_pct.toFixed(2)}%</td>
      <td><span style="color:${s.status === 'Added' ? 'var(--positive)' : 'var(--light)';font-size:0.75rem}">${s.status}</span></td>
      <td class="${s.action.includes('BUY') ? 'badge-buy' : s.action.includes('SELL') ? 'badge-sell' : 'badge-hold'}">${s.action}</td>
    </tr>
  `).join('');
}

// ── EXECUTION LOG ─────────────────────────────────────────────
function renderTrades(d) {
  const trades = [...d.exec_history].reverse();
  document.getElementById('tradesBody').innerHTML = trades.map(t => `
    <tr>
      <td style="color:var(--muted)">${t.month}</td>
      <td style="font-weight:700">${t.symbol.split('_')[0]}</td>
      <td style="color:var(--muted);font-size:0.75rem">${t.sector}</td>
      <td class="${t.action.includes('BUY') ? 'badge-buy' : 'badge-sell'}">${t.action}</td>
      <td>${t.qty.toLocaleString()}</td>
      <td>₹${t.price.toFixed(2)}</td>
      <td class="${t.return >= 0 ? 'pos' : 'neg'}">${t.return >= 0 ? '+' : ''}${(t.return * 100).toFixed(2)}%</td>
    </tr>
  `).join('');
}

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  renderAll();
});
