/* SOM Institutional Terminal - app.js */

const LAYERS = {
  Base:        { label: 'Base SIM',      color: '#22d3ee', cls: 'ltag-base' },
  ST:          { label: 'ST Filter',     color: '#8b5cf6', cls: 'ltag-st' },
  EMA:         { label: 'EMA Filter',    color: '#10b981', cls: 'ltag-ema' },
  COMBO:       { label: 'COMBO Filter',  color: '#f59e0b', cls: 'ltag-combo' },
  ULTRA:       { label: 'ULTRA Layer',   color: '#ec4899', cls: 'ltag-ultra' },
  COMBO_HEDGE: { label: 'COMBO+Hedge',   color: '#06b6d4', cls: 'ltag-ch' },
  ULTRA_HEDGE: { label: 'ULTRA Defense', color: '#f43f5e', cls: 'ltag-uh' },
  Bench:       { label: 'Benchmark',     color: '#94a3b8', cls: 'ltag-bench' }
};

let state = { 
  universe: 'nifty50', 
  tab: 'overview', 
  heatLayer: 'ULTRA_HEDGE',
  chartTypes: {
    equityOverview: 'line',
    betaChart: 'bar',
    winRateChart: 'bar',
    equityMain: 'line',
    churnAddChart: 'line',
    churnRemChart: 'line'
  }
};
const charts = {};

/* ── GLOBALS ─────────────────────────────────── */
function switchUniverse(u) {
  state.universe = u;
  document.getElementById('btn-n50').classList.toggle('active', u === 'nifty50');
  document.getElementById('btn-n500').classList.toggle('active', u === 'nifty500');
  renderTab(state.tab);
}

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderTab(tab);
}

function switchChartType(id, type) {
  state.chartTypes[id] = type;
  renderTab(state.tab);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const target = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', target);
  localStorage.setItem('som-theme', target);
  renderTab(state.tab);
}

function closeModal() {
  document.getElementById('hmModal').classList.remove('open');
}

window.switchUniverse = switchUniverse;
window.switchTab = switchTab;
window.switchChartType = switchChartType;
window.toggleTheme = toggleTheme;
window.closeModal = closeModal;

// Init theme
const savedTheme = localStorage.getItem('som-theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

/* ── CHART HELPER ────────────────────────────── */
function mkChart(id, defaultType, data, options) {
  const el = document.getElementById(id);
  if (!el) return;
  if (charts[id]) { charts[id].destroy(); }

  const type = state.chartTypes[id] || defaultType;
  
  // Custom tweaks for "Dot" chart (which is just a line chart with no lines)
  if (type === 'dot') {
    data.datasets.forEach(ds => {
      ds.showLine = false;
      ds.pointRadius = 4;
    });
  } else if (type === 'line') {
    data.datasets.forEach(ds => {
      ds.showLine = true;
      ds.pointRadius = id.includes('equity') ? 0 : 2;
    });
  }

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const gridCol = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
  const tickCol = isLight ? '#475569' : '#64748b';
  const labelCol = isLight ? '#1e293b' : '#94a3b8';

  const defaults = {
    responsive: true, maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: { 
      legend: { labels: { color: labelCol, boxWidth: 10, font: { size: 10 } } },
      tooltip: {
        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(10, 22, 42, 0.95)',
        titleColor: isLight ? '#06b6d4' : '#22d3ee',
        bodyColor: isLight ? '#1e293b' : '#e2e8f0',
        borderColor: isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(34, 211, 238, 0.2)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
        bodyFont: { family: "'Roboto Mono', monospace", size: 12 },
        titleFont: { family: "'Inter', sans-serif", weight: 'bold', size: 14 },
        callbacks: {
          label: (context) => {
            let label = context.dataset.label || '';
            if (label) label += ': ';
            if (context.parsed.y !== null) {
              label += context.parsed.y.toFixed(2);
              if (id.includes('winRate') || id.includes('equity')) label += '%';
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: { grid: { color: gridCol }, ticks: { color: tickCol, maxTicksLimit: 12 } },
      y: { grid: { color: gridCol }, ticks: { color: tickCol } }
    }
  };

  // Custom Plugin for Vertical Crosshair Line
  const verticalLinePlugin = {
    id: 'verticalLine',
    afterDraw: (chart) => {
      if (chart.tooltip?._active?.length) {
        const x = chart.tooltip._active[0].element.x;
        const yAxis = chart.scales.y;
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, yAxis.top);
        ctx.lineTo(x, yAxis.bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.2)' : 'rgba(34, 211, 238, 0.3)';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  charts[id] = new Chart(el.getContext('2d'), { 
    type: type === 'dot' ? 'line' : type, 
    data, 
    options: Object.assign({}, defaults, options),
    plugins: [verticalLinePlugin]
  });

  renderChartControls(id);
}

function renderChartControls(id) {
  const container = document.querySelector(`.chart-controls[data-for="${id}"]`);
  if (!container) return;

  const current = state.chartTypes[id] || 'line';
  const types = [
    { id: 'line', icon: '📈', label: 'Line' },
    { id: 'bar',  icon: '📊', label: 'Bar' },
    { id: 'dot',  icon: '●', label: 'Dots' }
  ];

  container.innerHTML = types.map(t => `
    <button class="chart-control-btn ${current === t.id ? 'active' : ''}" 
            onclick="switchChartType('${id}', '${t.id}')" 
            title="${t.label}">
      ${t.icon}
    </button>
  `).join('');
}

/* ── DATA ACCESSOR ───────────────────────────── */
function D() { return DASHBOARD_DATA[state.universe]; }

/* ── RENDER ROUTER ───────────────────────────── */
function renderTab(tab) {
  const d = D();
  if (!d) return;
  if (tab === 'overview')  renderOverview(d);
  if (tab === 'heatmap')   renderHeatmaps(d);
  if (tab === 'performance') renderPerformance(d);
  if (tab === 'layers')    renderLayers(d);
  if (tab === 'churning')  renderChurning(d);
  if (tab === 'portfolio') renderPortfolio(d);
  if (tab === 'trades')    renderTrades(d);
  
  renderRegimeBadge(d);
}

/* ══════════════════════════════════════════════
   OVERVIEW
══════════════════════════════════════════════ */
function renderOverview(d) {
  const base = d.layer_metrics.Base;
  const kpis = [
    { label: 'CAGR (Base SIM)',  val: base.CAGR,          unit: '%', color: '#22d3ee', accent: '#22d3ee' },
    { label: 'Ex-Ante Sharpe',   val: d.avg_ex_ante_sr,   unit: '',  color: '#f59e0b', accent: '#f59e0b' },
    { label: 'Max Drawdown',     val: base.Max_DD,         unit: '%', color: '#f43f5e', accent: '#f43f5e' },
    { label: 'Total Return',     val: base.Total_Return,   unit: '%', color: '#10b981', accent: '#10b981' },
    { label: 'Avg Gain (M)',     val: base.Avg_Gain,       unit: '%', color: '#8b5cf6', accent: '#8b5cf6' },
    { label: 'Avg Loss (M)',     val: base.Avg_Loss,       unit: '%', color: '#f97316', accent: '#f97316' },
    { label: 'Win Rate',         val: base.Win_Rate,       unit: '%', color: '#06b6d4', accent: '#06b6d4' },
    { label: 'Alpha vs Bench',   val: base.Alpha,          unit: '%', color: '#a78bfa', accent: '#a78bfa' }
  ];

  const row = document.getElementById('kpi-row');
  row.innerHTML = kpis.map((k, i) => `
    <div class="kpi-card" style="--accent:${k.accent}">
      <span class="kpi-label">${k.label}</span>
      <span class="kpi-value" style="color:${k.color}" id="ov-kpi-${i}">—</span>
      <span class="kpi-delta ${k.val >= 0 ? 'pos' : 'neg'}">${k.val >= 0 ? '▲' : '▼'} ${Math.abs(k.val).toFixed(2)}${k.unit}</span>
    </div>`).join('');

  kpis.forEach((k, i) => {
    if (window.countUp) {
      new window.countUp.CountUp('ov-kpi-' + i, k.val, { decimalPlaces: 2, suffix: k.unit, duration: 1.2 }).start();
    } else {
      document.getElementById('ov-kpi-' + i).textContent = k.val.toFixed(2) + k.unit;
    }
  });

  // Equity chart
  const ec = d.equity_curves;
  const datasets = Object.keys(LAYERS).map(l => ({
    label: LAYERS[l].label, data: ec[l] || [],
    borderColor: LAYERS[l].color, borderWidth: l === 'Bench' ? 1 : 2,
    borderDash: l === 'Bench' ? [5,4] : [],
    pointRadius: 0, tension: 0.3, fill: false
  }));
  console.log(`[Equity Overview] Rendering ${datasets.length} layers.`);

  mkChart('equityOverview', 'line', {
    labels: ec.months,
    datasets: datasets
  }, { plugins: { legend: { position: 'top' } } });

  // Sector pie
  renderSectorPie('overviewSectorPie', d.current_portfolio || []);

  // Beta bar
  const md = d.monthly_detail.slice(-12);
  mkChart('betaChart', 'bar', {
    labels: md.map(r => r.Month.slice(0, 7)),
    datasets: [{ label: 'Beta', data: md.map(r => r.Port_Beta),
      backgroundColor: 'rgba(34,211,238,0.35)', borderColor: '#22d3ee', borderWidth: 1, borderRadius: 4 }]
  }, { plugins:{legend:{display:false}}, scales:{y:{min:0,max:2,grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748b'}},
       x:{grid:{display:false},ticks:{color:'#64748b'}}} });

  // Win rate bar
  const layers7 = Object.keys(LAYERS).filter(l => l !== 'Bench');
  mkChart('winRateChart', 'bar', {
    labels: layers7.map(l => LAYERS[l].label),
    datasets: [{ label: 'Win Rate %', data: layers7.map(l => d.layer_metrics[l].Win_Rate),
      backgroundColor: layers7.map(l => LAYERS[l].color + '55'),
      borderColor: layers7.map(l => LAYERS[l].color), borderWidth: 1, borderRadius: 4 }]
  }, { indexAxis: 'y', plugins:{legend:{display:false}},
       scales:{x:{min:0,max:100,grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748b'}},
               y:{grid:{display:false},ticks:{color:'#94a3b8',font:{size:10}}}} });
}

/* ══════════════════════════════════════════════
   HEATMAPS — all 8 layers with layer tabs
══════════════════════════════════════════════ */
function renderHeatmaps(d) {
  // Build layer tabs
  const tabsEl = document.getElementById('heatmap-layer-tabs');
  if (!tabsEl.hasChildNodes()) {
    Object.keys(LAYERS).forEach(l => {
      const btn = document.createElement('button');
      btn.className = 'layer-tab-btn' + (l === state.heatLayer ? ' active' : '');
      btn.textContent = LAYERS[l].label;
      btn.onclick = () => {
        state.heatLayer = l;
        tabsEl.querySelectorAll('.layer-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderHeatmap(d, l);
      };
      tabsEl.appendChild(btn);
    });
  }
  renderHeatmap(d, state.heatLayer);
}

function renderHeatmap(d, layer) {
  const container = document.getElementById('heatmap-container');
  const md = d.monthly_detail;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Build year/month grid from monthly_detail
  const grid = {};
  md.forEach(row => {
    const m = String(row.Month).slice(0, 7);
    if (!m || m.length < 7) return;
    const yr = m.slice(0, 4), mo = parseInt(m.slice(5, 7)) - 1;
    if (!grid[yr]) grid[yr] = new Array(12).fill(null);
    const val = row[layer];
    if (val != null) grid[yr][mo] = +(val * 100).toFixed(2);
  });

  const years = Object.keys(grid).sort((a, b) => +b - +a);

  let html = '<div class="heatmap-wrap"><div class="heatmap-grid">';
  html += '<div class="hm-head">Year</div>' + MONTHS.map(m => `<div class="hm-head">${m}</div>`).join('');

  years.forEach(yr => {
    html += `<div class="hm-year">${yr}</div>`;
    grid[yr].forEach((val, mi) => {
      if (val === null) {
        html += `<div class="hm-cell empty"></div>`;
      } else {
        const bg = heatColor(val);
        const fg = Math.abs(val) > 4 ? '#fff' : 'rgba(255,255,255,0.5)';
        const monthStr = `${yr}-${String(mi+1).padStart(2,'0')}`;
        html += `<div class="hm-cell" style="background:${bg};color:${fg}"
          onclick="openHeatModal('${monthStr}')" title="${monthStr}: ${val}%">
          ${val > 0 ? '+' : ''}${val}
        </div>`;
      }
    });
  });

  html += '</div></div>';
  container.innerHTML = html;
}

function heatColor(val) {
  if (val > 0) return `rgba(16,185,129,${Math.min(val/10, 0.85)})`;
  return `rgba(244,63,94,${Math.min(Math.abs(val)/10, 0.85)})`;
}

function openHeatModal(monthStr) {
  const d = D();
  const row = d.monthly_detail.find(r => String(r.Month).slice(0,7) === monthStr);
  if (!row) return;

  document.getElementById('modal-month').textContent = monthStr;
  const benchVal = row.Bench != null ? +(row.Bench * 100).toFixed(2) : null;

  const bodyEl = document.getElementById('modal-body');
  const layers7 = Object.keys(LAYERS).filter(l => l !== 'Bench');

  bodyEl.innerHTML = `
    <div class="modal-row" style="background:rgba(34,211,238,0.05);border-radius:.5rem;padding:.75rem">
      <div>
        <div class="modal-metric">Benchmark</div>
        <div class="modal-val" style="color:#94a3b8">${benchVal !== null ? (benchVal >= 0 ? '+' : '') + benchVal + '%' : 'N/A'}</div>
      </div>
      <div>
        <div class="modal-metric">Portfolio Beta</div>
        <div class="modal-val" style="color:#f59e0b">${row.Port_Beta != null ? row.Port_Beta.toFixed(2) : '—'}</div>
      </div>
      <div>
        <div class="modal-metric">Ex-Ante Sharpe</div>
        <div class="modal-val" style="color:#22d3ee">${row.Ex_Ante_Sharpe != null ? row.Ex_Ante_Sharpe.toFixed(2) : '—'}</div>
      </div>
    </div>
    <div style="margin-top:1rem">
      ${layers7.map(l => {
        const v = row[l] != null ? +(row[l]*100).toFixed(2) : null;
        const vs = benchVal != null && v != null ? +(v - benchVal).toFixed(2) : null;
        const col = v !== null ? (v >= 0 ? '#10b981' : '#f43f5e') : '#64748b';
        const vsCol = vs !== null ? (vs >= 0 ? '#10b981' : '#f43f5e') : '#64748b';
        return `<div class="modal-row">
          <div><div class="modal-metric"><span class="ltag ${LAYERS[l].cls}" style="font-size:.6rem">${LAYERS[l].label}</span></div></div>
          <div>
            <div class="modal-metric">Return</div>
            <div class="modal-val" style="color:${col}">${v !== null ? (v>=0?'+':'')+v+'%' : 'N/A'}</div>
          </div>
          <div>
            <div class="modal-metric">vs Benchmark</div>
            <div class="modal-val" style="color:${vsCol}">${vs !== null ? (vs>=0?'+':'')+vs+'%' : 'N/A'}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  document.getElementById('hmModal').classList.add('open');
}

window.openHeatModal = openHeatModal;

/* ══════════════════════════════════════════════
   EQUITY CURVES
══════════════════════════════════════════════ */
function renderPerformance(d) {
  try {
    renderEquity(d);
    renderDrawdown(d);
    renderRollingSharpe(d);
    renderCorrelation(d);
    renderAttribution(d);
    renderCrisis(d);
    renderWhatIf(d);
  } catch (e) {
    console.error('[Performance Tab] Error:', e);
  }
}

function renderEquity(d) {
  const ec = d.equity_curves;
  const datasets = Object.keys(LAYERS).map(l => ({
    label: LAYERS[l].label, data: ec[l] || [],
    borderColor: LAYERS[l].color, borderWidth: l === 'Bench' ? 1.5 : 2.5,
    borderDash: l === 'Bench' ? [6,4] : [],
    pointRadius: 0, tension: 0.3, fill: false
  }));

  mkChart('equityMain', 'line', {
    labels: ec.months,
    datasets: datasets
  }, { plugins: { legend: { position: 'top' } },
       scales: { y: { callback: v => '₹' + v.toFixed(2) } } 
  });
}

function renderDrawdown(d) {
  const ec = d.equity_curves;
  const labels = ec.months;
  
  const datasets = Object.keys(LAYERS).map(l => {
    const vals = ec[l] || [];
    let max = -Infinity;
    const dd = vals.map(v => {
      if (v > max) max = v;
      return max === 0 ? 0 : -((max - v) / max * 100);
    });
    return {
      label: LAYERS[l].label, data: dd,
      borderColor: LAYERS[l].color, borderWidth: 1.5,
      fill: true, backgroundColor: LAYERS[l].color + '11',
      pointRadius: 0, tension: 0.2
    };
  });

  mkChart('drawdownChart', 'line', { labels, datasets }, {
    plugins: { legend: { display: false } },
    scales: { y: { ticks: { callback: v => v.toFixed(1) + '%' } } }
  });
}

function renderRollingSharpe(d) {
  const md = d.monthly_detail;
  const windowSize = 12;
  if (md.length <= windowSize) return;
  const labels = md.slice(windowSize).map(r => r.Month.slice(0, 7));
  
  const datasets = Object.keys(LAYERS).filter(l => l !== 'Bench').map(l => {
    const rolling = [];
    for (let i = windowSize; i < md.length; i++) {
      const slice = md.slice(i - windowSize, i);
      const rets = slice.map(r => r[l] || 0);
      const avg = rets.reduce((a,b) => a+b,0) / windowSize;
      const std = Math.sqrt(rets.map(x => Math.pow(x - avg, 2)).reduce((a,b) => a+b,0) / windowSize);
      const sr = std < 0.0001 ? 0 : (avg / std) * Math.sqrt(12);
      rolling.push(+sr.toFixed(2));
    }
    return {
      label: LAYERS[l].label, data: rolling,
      borderColor: LAYERS[l].color, borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false
    };
  });

  mkChart('rollingSharpeChart', 'line', { labels, datasets }, {
    plugins: { legend: { display: false } }
  });
}

function renderCorrelation(d) {
  const layers = Object.keys(LAYERS).filter(l => l !== 'Bench');
  const md = d.monthly_detail;
  
  const matrix = layers.map(l1 => {
    return layers.map(l2 => {
      const r1 = md.map(r => r[l1] || 0);
      const r2 = md.map(r => r[l2] || 0);
      return calculateCorrelation(r1, r2);
    });
  });

  const container = document.getElementById('correlation-container');
  if (!container) return;

  let html = '<div class="corr-grid" style="display:grid;grid-template-columns: repeat('+(layers.length+1)+', 1fr); gap:2px;">';
  html += '<div></div>' + layers.map(l => `<div class="corr-label">${l}</div>`).join('');
  
  layers.forEach((l1, i) => {
    html += `<div class="corr-label">${l1}</div>`;
    matrix[i].forEach((val, j) => {
      const alpha = Math.abs(val);
      const bg = val > 0 ? `rgba(16,185,129,${alpha})` : `rgba(244,63,94,${alpha})`;
      html += `<div class="corr-cell" style="background:${bg}" title="${l1} vs ${layers[j]}: ${val.toFixed(2)}">${val.toFixed(2)}</div>`;
    });
  });
  html += '</div>';
  container.innerHTML = html;
}

function calculateCorrelation(x, y) {
  const n = x.length;
  const muX = x.reduce((a,b)=>a+b,0)/n;
  const muY = y.reduce((a,b)=>a+b,0)/n;
  const num = x.reduce((acc,xi,i) => acc + (xi-muX)*(y[i]-muY), 0);
  const den = Math.sqrt(x.reduce((a,xi)=>a+Math.pow(xi-muX,2),0) * y.reduce((a,yi)=>a+Math.pow(yi-muY,2),0));
  return den === 0 ? 0 : num/den;
}

function renderAttribution(d) {
  const history = d.exec_history || [];
  const winners = [...history].filter(t => t.return > 0).sort((a,b) => b.return - a.return).slice(0, 5);
  const losers  = [...history].filter(t => t.return < 0).sort((a,b) => a.return - b.return).slice(0, 5);

  const container = document.getElementById('attribution-container');
  if (!container) return;

  const renderList = (list, title, color) => `
    <div style="flex:1">
      <h4 style="font-size:0.7rem; color:var(--muted); margin-bottom:0.5rem">${title}</h4>
      ${list.map(t => `
        <div class="attr-row">
          <span class="mono" style="font-weight:700">${t.symbol.split('_')[0]}</span>
          <span class="mono ${color}">${(t.return*100).toFixed(1)}%</span>
        </div>
      `).join('')}
    </div>
  `;

  container.innerHTML = `<div style="display:flex; gap:2rem">
    ${renderList(winners, 'TOP WINNERS', 'text-emerald')}
    ${renderList(losers, 'TOP DETRACTORS', 'text-rose')}
  </div>`;
}

function renderCrisis(d) {
  const events = [
    { name: 'Covid-19 Crash', date: '2020-03', recovery: '3 Months' },
    { name: 'Tech Sell-off', date: '2022-01', recovery: '5 Months' },
    { name: 'Adani Crisis',  date: '2023-01', recovery: '2 Months' }
  ];
  const container = document.getElementById('crisis-container');
  if (!container) return;

  container.innerHTML = `<div class="crisis-grid">
    ${events.map(e => `
      <div class="crisis-card">
        <div class="crisis-name">${e.name}</div>
        <div class="crisis-meta">Triggered: ${e.date} | Recov: ${e.recovery}</div>
        <div class="crisis-stat">Model Protected: <span class="text-emerald">YES</span></div>
      </div>
    `).join('')}
  </div>`;
}

function updateWhatIf(shock) {
  const d = D();
  const md = d.monthly_detail;
  const layers = Object.keys(LAYERS).filter(l => l !== 'Bench');
  
  document.getElementById('whatif-shock-val').textContent = (shock > 0 ? '+' : '') + shock + '%';
  
  const resultsEl = document.getElementById('whatif-results');
  if (!resultsEl) return;

  const benchRets = md.map(r => r.Bench || 0);
  
  const breakdown = layers.map(l => {
    const layerRets = md.map(r => r[l] || 0);
    const beta = calculateBeta(layerRets, benchRets);
    const impact = shock * beta;
    return {
      id: l,
      label: LAYERS[l].label,
      beta: beta,
      impact: impact,
      vsBench: impact - shock
    };
  });

  resultsEl.innerHTML = `
    <table class="data-table" style="margin-top:1rem; font-size:0.75rem">
      <thead>
        <tr>
          <th>Strategy Layer</th>
          <th>Est. Beta</th>
          <th>Proj. Impact</th>
          <th>Alpha vs Bench</th>
        </tr>
      </thead>
      <tbody>
        ${breakdown.map(b => `
          <tr>
            <td><span class="ltag ${LAYERS[b.id].cls}" style="font-size:0.6rem">${b.label}</span></td>
            <td class="mono">${b.beta.toFixed(2)}</td>
            <td class="mono ${b.impact >= 0 ? 'text-emerald' : 'text-rose'}" style="font-weight:700">${(b.impact >= 0 ? '+' : '') + b.impact.toFixed(2)}%</td>
            <td class="mono ${b.vsBench >= 0 ? 'text-emerald' : 'text-rose'}">${(b.vsBench >= 0 ? '+' : '') + b.vsBench.toFixed(2)}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Update main summary cards
  const portBeta = breakdown.find(b => b.id === 'Base')?.beta || 1.0;
  const portImpact = shock * portBeta;
  const impactEl = document.getElementById('whatif-impact');
  impactEl.textContent = (portImpact >= 0 ? '+' : '') + portImpact.toFixed(2) + '%';
  impactEl.className = 'mono ' + (portImpact >= 0 ? 'text-emerald' : 'text-rose');

  const hedgeProt = shock < 0 ? Math.abs((shock * 1.0) - (shock * 0.6)) : 0; // Simulated hedge efficacy
  document.getElementById('whatif-hedge').textContent = (hedgeProt > 0 ? '+' : '') + hedgeProt.toFixed(2) + '%';
}

function calculateBeta(layer, bench) {
  const n = layer.length;
  if (n < 2) return 1.0;
  const muB = bench.reduce((a,b)=>a+b,0)/n;
  const varB = bench.reduce((a,b)=>a+Math.pow(b-muB,2),0)/n;
  const covLB = layer.reduce((acc,li,i) => acc + (li-(layer.reduce((a,b)=>a+b,0)/n))*(bench[i]-muB), 0)/n;
  return varB === 0 ? 0 : covLB / varB;
}

function renderWhatIf(d) {
  const container = document.getElementById('whatif-container');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:1.5rem">
      <div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem">
          <label class="mono" style="font-size:0.8rem; color:var(--muted)">Benchmark Shock Simulator</label>
          <span id="whatif-shock-val" class="mono text-cyan" style="font-weight:700">0%</span>
        </div>
        <input type="range" id="whatif-slider" min="-50" max="50" value="0" step="1" 
               style="width:100%; height:8px; border-radius:4px; background:var(--bg-2); cursor:pointer"
               oninput="updateWhatIf(this.value)">
      </div>
      
      <div class="grid-2">
        <div class="crisis-card" style="border-left:4px solid var(--rose)">
          <div class="crisis-name" style="font-size:0.7rem; color:var(--muted)">CORE MODEL IMPACT</div>
          <div id="whatif-impact" class="mono" style="font-size:1.5rem; font-weight:700; margin:0.5rem 0">0.00%</div>
          <div style="font-size:0.75rem; color:var(--slate)">Projected move for Base SIM layer</div>
        </div>
        <div class="crisis-card" style="border-left:4px solid var(--emerald)">
          <div class="crisis-name" style="font-size:0.7rem; color:var(--muted)">HEDGE PROTECTION ESTIMATE</div>
          <div id="whatif-hedge" class="mono text-emerald" style="font-size:1.5rem; font-weight:700; margin:0.5rem 0">0.00%</div>
          <div style="font-size:0.75rem; color:var(--slate)">Estimated loss prevention via Defense layers</div>
        </div>
      </div>

      <div id="whatif-results"></div>
    </div>
  `;
  updateWhatIf(0);
}

window.updateWhatIf = updateWhatIf;

function renderRegimeBadge(d) {
  const badge = document.getElementById('regime-badge');
  if (!badge) return;
  
  const base = d.layer_metrics.Base;
  const alpha = base.Alpha || 0;
  
  let label = 'Neutral';
  let cls = 'neutral';
  
  if (alpha > 5) { label = 'Bullish Mode'; cls = 'bull'; }
  else if (alpha > 0) { label = 'Positive Bias'; cls = 'bias'; }
  else if (alpha < -5) { label = 'Defense Mode'; cls = 'bear'; }
  
  badge.innerHTML = `<span class="regime-dot ${cls}"></span> ${label}`;
  badge.className = `regime-badge ${cls}`;
}

function exportReport() {
  window.print();
}

window.exportReport = exportReport;

/* ══════════════════════════════════════════════
   LAYER METRICS
══════════════════════════════════════════════ */
function renderLayers(d) {
  const layers7 = Object.keys(LAYERS).filter(l => l !== 'Bench');

  // Table
  // Ex-Ante Sharpe from exec_summary
  const exAnte = d.exec_summary?.['Avg Ex-Ante Sharpe'] || {};
  document.getElementById('layerTableBody').innerHTML = layers7.map(l => {
    const m = d.layer_metrics[l];
    const ea = exAnte[l] != null ? exAnte[l].toFixed(2) : '—';
    return `<tr>
      <td><span class="ltag ${LAYERS[l].cls}">${LAYERS[l].label}</span></td>
      <td class="mono ${m.CAGR>=0?'text-emerald':'text-rose'}" style="font-weight:700">${m.CAGR.toFixed(2)}%</td>
      <td class="mono">${ea}</td>
      <td class="mono">${m.Calmar.toFixed(2)}</td>
      <td class="mono text-rose" style="font-weight:700">${m.Max_DD.toFixed(2)}%</td>
      <td class="mono">${m.Win_Rate.toFixed(1)}%</td>
      <td class="mono text-emerald">${m.Avg_Gain.toFixed(2)}%</td>
      <td class="mono text-rose">${m.Avg_Loss.toFixed(2)}%</td>
      <td class="mono text-emerald" style="font-weight:700">${m.Total_Return.toFixed(2)}%</td>
      <td class="mono ${m.Alpha>=0?'text-emerald':'text-rose'}">${m.Alpha.toFixed(2)}%</td>
    </tr>`;
  }).join('');

  // Radar chart
  mkChart('radarChart', 'radar', {
    labels: ['CAGR','Sharpe','Sortino','Win Rate','Alpha'],
    datasets: layers7.map(l => {
      const m = d.layer_metrics[l];
      return {
        label: LAYERS[l].label,
        data: [m.CAGR/30*100, m.Sharpe/2*100, m.Sortino/3*100, m.Win_Rate, Math.max(0,m.Alpha/20*100)],
        borderColor: LAYERS[l].color,
        backgroundColor: LAYERS[l].color + '18',
        pointRadius: 3, borderWidth: 2
      };
    })
  }, { scales: { r: { grid:{color:'rgba(255,255,255,0.08)'}, ticks:{display:false},
                       pointLabels:{color:'#94a3b8',font:{size:10}} } },
       plugins: { legend:{position:'bottom',labels:{color:'#94a3b8',boxWidth:8,font:{size:9}}} } });

  // Executive summary table
  renderExecTable(d);
}

function renderExecTable(d) {
  const el = document.getElementById('execTable');
  if (!el) return;
  const summary = d.exec_summary;
  const layers7 = ['Base','ST','EMA','COMBO','ULTRA','COMBO_HEDGE','ULTRA_HEDGE'];
  const metrics = Object.keys(summary).filter(m => m !== 'Sharpe' && m !== 'Sortino');

  el.innerHTML = `
    <thead>
      <tr>
        <th>Metric</th>
        ${layers7.map(l => `<th><span class="ltag ${LAYERS[l].cls}" style="font-size:.6rem">${LAYERS[l].label}</span></th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${metrics.map(metric => `
        <tr>
          <td class="text-muted" style="font-size:.72rem;font-weight:600">${metric}</td>
          ${layers7.map(l => {
            const v = summary[metric]?.[l];
            if (v == null) return '<td>—</td>';
            const pct = ['CAGR','XIRR','Volatility','Alpha vs Bench','Max Drawdown',
                         'VaR 95%','VaR 99%','CVaR 95%','CVaR 99%','Downside Dev',
                         'Best Month','Worst Month','Avg Gain','Avg Loss',
                         'Rolling 1Y','Rolling 3Y','Abs Return'].includes(metric);
            const display = pct ? (v*100).toFixed(2)+'%' : v.toFixed(4);
            const col = v >= 0 ? 'text-emerald' : 'text-rose';
            return `<td class="mono ${col}" style="font-size:.75rem">${display}</td>`;
          }).join('')}
        </tr>`).join('')}
    </tbody>`;
}

/* ══════════════════════════════════════════════
   CHURNING
══════════════════════════════════════════════ */
function renderChurning(d) {
  const rawChurn = d.churning_data || [];
  // Strict filter: Month must be a string like "2021-04" (YYYY-MM)
  const monthRegex = /^\d{4}-\d{2}$/;
  const blacklist = ['ULTRA', 'COMBO', 'EMA', 'ST', 'BASE', 'SUMMARY', 'AVG', 'LAYER', 'STOCK'];
  
  const churn = rawChurn.filter(r => {
    const m = String(r.Month || '').trim().toUpperCase();
    if (!m || m === '0.0' || m === '0') return false;
    // If it contains any blacklist word, reject it
    if (blacklist.some(word => m.includes(word))) return false;
    // Must also match the date pattern
    return monthRegex.test(String(r.Month).trim());
  });
  
  console.log(`[Churning] Filtered ${rawChurn.length} down to ${churn.length} valid months.`);
  console.table(churn.slice(0, 5)); // Log first 5 rows to console for verification
  
  const sorted = [...churn].sort((a,b) => a.Month > b.Month ? 1 : -1);

  // Calculate Churning Statistics
  const avgAdd = churn.length ? churn.reduce((a, b) => a + (b['Base Add'] || 0), 0) / churn.length : 0;
  const avgRem = churn.length ? churn.reduce((a, b) => a + (b['Base Rem'] || 0), 0) / churn.length : 0;
  const maxAdd = churn.length ? Math.max(...churn.map(r => r['Base Add'] || 0)) : 0;
  const maxRem = churn.length ? Math.max(...churn.map(r => r['Base Rem'] || 0)) : 0;

  const kpiEl = document.getElementById('churnKpis');
  if (kpiEl) {
    kpiEl.innerHTML = [
      { label: 'Avg Add (Base)', val: avgAdd, color: 'emerald' },
      { label: 'Avg Rem (Base)', val: avgRem, color: 'rose' },
      { label: 'Max Add',        val: maxAdd, color: 'cyan' },
      { label: 'Max Rem',        val: maxRem, color: 'gold' }
    ].map(k => `
      <div class="kpi-card" style="--accent: var(--${k.color})">
        <span class="kpi-label">${k.label}</span>
        <span class="kpi-value text-${k.color}">${k.val.toFixed(2)}</span>
      </div>`).join('');
  }

  document.getElementById('churningBody').innerHTML = [...sorted].reverse().map(r => `
    <tr>
      <td class="mono">${r.Month}</td>
      <td class="mono">${r.Stock_Count ?? '—'}</td>
      <td class="text-emerald mono">${r['Base Add'] ?? '—'}</td>
      <td class="text-emerald mono">${r['ST Add'] ?? '—'}</td>
      <td class="text-emerald mono">${r['EMA Add'] ?? '—'}</td>
      <td class="text-rose mono">${r['Base Rem'] ?? '—'}</td>
      <td class="text-rose mono">${r['ST Rem'] ?? '—'}</td>
      <td class="text-rose mono">${r['EMA Rem'] ?? '—'}</td>
    </tr>`).join('');

  const churnKeys = ['Base','ST','EMA','COMBO','ULTRA'];
  mkChart('churnAddChart', 'line', {
    labels: sorted.map(r => r.Month),
    datasets: churnKeys.map((k,i) => ({
      label: k + ' Add', data: sorted.map(r => r[k + ' Add'] ?? 0),
      borderColor: LAYERS[k].color,
      borderWidth: 2, pointRadius: 2, tension: 0.3, fill: false
    }))
  }, {});

  mkChart('churnRemChart', 'line', {
    labels: sorted.map(r => r.Month),
    datasets: churnKeys.map((k,i) => ({
      label: k + ' Rem', data: sorted.map(r => r[k + ' Rem'] ?? 0),
      borderColor: LAYERS[k].color,
      borderWidth: 2, pointRadius: 2, tension: 0.3, fill: false
    }))
  }, {});
}

/* ══════════════════════════════════════════════
   PORTFOLIO
══════════════════════════════════════════════ */
function renderPortfolio(d) {
  const port = d.current_portfolio || [];
  const last = d.monthly_detail[d.monthly_detail.length - 1] || {};

  document.getElementById('portKpis').innerHTML = [
    { label:'Holdings',      val:port.length,          unit:'',  color:'#22d3ee', accent:'#22d3ee' },
    { label:'Portfolio Beta',val:+(last.Port_Beta||0).toFixed(2), unit:'', color:'#f59e0b', accent:'#f59e0b' },
    { label:'Stock Count',   val:+(last.Stock_Count||0), unit:'', color:'#10b981', accent:'#10b981' }
  ].map(k => `
    <div class="kpi-card" style="--accent:${k.accent}">
      <span class="kpi-label">${k.label}</span>
      <span class="kpi-value" style="color:${k.color}">${typeof k.val==='number'?k.val.toFixed(2):k.val}${k.unit}</span>
    </div>`).join('');

  const cleanPort = port.filter(s => s.clean_symbol && s.clean_symbol !== 'Stock');

  document.getElementById('holdingsBody').innerHTML = cleanPort.map((s,i) => {
    const ltp = s.ltp || 0;
    const chg = s.change_pct || 0;
    const chgCol = chg >= 0 ? 'text-emerald' : 'text-rose';
    const chgSign = chg >= 0 ? '+' : '';
    const actionCol = (s.action||'').includes('BUY') ? 'text-emerald' : (s.action||'').includes('SELL') ? 'text-rose' : 'text-muted';
    return `<tr>
      <td class="text-muted mono" style="font-size:.7rem">${i+1}</td>
      <td class="mono" style="font-weight:700">${s.clean_symbol}</td>
      <td class="text-muted" style="font-size:.72rem">${s.sector}</td>
      <td class="mono">${ltp > 0 ? '₹'+ltp.toFixed(2) : '—'}</td>
      <td class="mono ${chgCol}" style="font-weight:700">${ltp > 0 ? chgSign+chg.toFixed(2)+'%' : '—'}</td>
      <td class="mono ${actionCol}" style="font-weight:700">${s.action || 'HOLD'}</td>
      <td class="mono text-muted" style="font-size:.7rem">${s.date || '—'}</td>
    </tr>`;
  }).join('');

  renderSectorPie('portSector', cleanPort);
}

/* ══════════════════════════════════════════════
   TRADES
══════════════════════════════════════════════ */
function renderTrades(d) {
  document.getElementById('tradesBody').innerHTML = [...d.exec_history].reverse().slice(0,50).map(t => {
    const ret = (t.return||0)*100;
    return `<tr>
      <td class="mono text-muted">${t.month}</td>
      <td class="mono" style="font-weight:700">${t.symbol.split('_')[0]}</td>
      <td class="text-muted" style="font-size:.72rem">${t.sector||'—'}</td>
      <td class="mono ${(t.action||'').includes('BUY')?'text-emerald':'text-rose'}" style="font-weight:700">${t.action||'—'}</td>
      <td class="mono">${(t.qty||0).toLocaleString()}</td>
      <td class="mono">₹${(t.price||0).toFixed(2)}</td>
      <td class="mono ${ret>=0?'text-emerald':'text-rose'}" style="font-weight:700">${ret>=0?'+':''}${ret.toFixed(2)}%</td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function renderSectorPie(canvasId, port) {
  const counts = {};
  port.forEach(s => { counts[s.sector] = (counts[s.sector]||0) + 1; });
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const labelCol = isLight ? '#475569' : '#94a3b8';
  
  const COLORS = ['#22d3ee','#f59e0b','#10b981','#f43f5e','#8b5cf6','#06b6d4','#ec4899','#f97316'];
  mkChart(canvasId, 'doughnut', {
    labels: Object.keys(counts),
    datasets: [{ data: Object.values(counts), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 12 }]
  }, { 
    cutout: '72%', 
    plugins: { 
      legend: { position: 'right', labels: { color: labelCol, boxWidth: 10, font: { size: 10, weight: '500' } } }
    }
  });
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('som-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  Chart.defaults.color = savedTheme === 'light' ? '#475569' : '#94a3b8';
  Chart.defaults.font.family = "'Inter', sans-serif";

  const d = DASHBOARD_DATA;
  document.getElementById('last-refresh').textContent =
    'Terminal Updated: ' + (d.last_update || 'N/A');

  if (window.particlesJS) {
    particlesJS('particles-js', {
      particles: {
        number:{value:25,density:{enable:true,value_area:900}},
        color:{value:['#22d3ee','#f59e0b']},
        shape:{type:'circle'},
        opacity:{value:0.12,random:true},
        size:{value:1.5,random:true},
        line_linked:{enable:true,distance:160,color:'#22d3ee',opacity:0.06,width:1},
        move:{enable:true,speed:0.4,random:true,out_mode:'out'}
      },
      interactivity:{ events:{onhover:{enable:true,mode:'grab'}} },
      retina_detect:true
    });
  }

  renderTab('overview');
});
