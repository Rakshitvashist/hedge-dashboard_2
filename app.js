/* SOM Institutional Terminal - app.js */

const LAYERS = {
  Base:        { label: 'Base SIM',      color: '#94a3b8', cls: 'ltag-base' },
  ST:          { label: 'ST Filter',     color: '#22d3ee', cls: 'ltag-st' },
  EMA:         { label: 'EMA Filter',    color: '#10b981', cls: 'ltag-ema' },
  COMBO:       { label: 'COMBO Filter',  color: '#f59e0b', cls: 'ltag-combo' },
  ULTRA:       { label: 'ULTRA Layer',   color: '#8b5cf6', cls: 'ltag-ultra' },
  COMBO_HEDGE: { label: 'COMBO+Hedge',   color: '#06b6d4', cls: 'ltag-ch' },
  ULTRA_HEDGE: { label: 'ULTRA Defense', color: '#f43f5e', cls: 'ltag-uh' },
  Bench:       { label: 'Benchmark',     color: 'rgba(255,255,255,0.3)', cls: 'ltag-bench' }
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

function closeModal() {
  document.getElementById('hmModal').classList.remove('open');
}

window.switchUniverse = switchUniverse;
window.switchTab = switchTab;
window.switchChartType = switchChartType;
window.closeModal = closeModal;

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

  const defaults = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 10, font: { size: 10 } } } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', maxTicksLimit: 12 } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b' } }
    }
  };

  charts[id] = new Chart(el.getContext('2d'), { 
    type: type === 'dot' ? 'line' : type, 
    data, 
    options: Object.assign({}, defaults, options) 
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
  if (tab === 'equity')    renderEquity(d);
  if (tab === 'layers')    renderLayers(d);
  if (tab === 'churning')  renderChurning(d);
  if (tab === 'portfolio') renderPortfolio(d);
  if (tab === 'trades')    renderTrades(d);
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
  mkChart('equityOverview', 'line', {
    labels: ec.months,
    datasets: Object.keys(LAYERS).map(l => ({
      label: LAYERS[l].label, data: ec[l],
      borderColor: LAYERS[l].color, borderWidth: l === 'Bench' ? 1 : 2,
      borderDash: l === 'Bench' ? [5,4] : [],
      pointRadius: 0, tension: 0.3, fill: false
    }))
  }, { plugins: { legend: { position: 'bottom', labels: { color:'#94a3b8', boxWidth:10, font:{size:10} } } },
       scales: { x: { grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#64748b', maxTicksLimit:12} },
                 y: { grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#64748b'} } } });

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
function renderEquity(d) {
  const ec = d.equity_curves;
  mkChart('equityMain', 'line', {
    labels: ec.months,
    datasets: Object.keys(LAYERS).map(l => ({
      label: LAYERS[l].label, data: ec[l],
      borderColor: LAYERS[l].color, borderWidth: l === 'Bench' ? 1.5 : 2,
      borderDash: l === 'Bench' ? [6,4] : [],
      pointRadius: 0, tension: 0.3, fill: false
    }))
  }, { plugins: { legend: { position: 'bottom', labels:{color:'#94a3b8',boxWidth:10,font:{size:10}} } },
       scales: { x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748b',maxTicksLimit:12}},
                 y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748b',
                   callback: v => '₹' + v.toFixed(2)}} } });
}

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
  // Strict filter: Month must be a string like "2021-04"
  const monthRegex = /^\d{4}-\d{2}$/;
  const churn = rawChurn.filter(r => r.Month && typeof r.Month === 'string' && monthRegex.test(r.Month));
  
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

  mkChart('churnAddChart', 'line', {
    labels: sorted.map(r => r.Month),
    datasets: ['Base Add','ST Add','EMA Add'].map((k,i) => ({
      label: k, data: sorted.map(r => r[k] ?? 0),
      borderColor: ['#94a3b8','#22d3ee','#10b981'][i],
      borderWidth: 2, pointRadius: 2, tension: 0.3, fill: false
    }))
  }, {});

  mkChart('churnRemChart', 'line', {
    labels: sorted.map(r => r.Month),
    datasets: ['Base Rem','ST Rem','EMA Rem'].map((k,i) => ({
      label: k, data: sorted.map(r => r[k] ?? 0),
      borderColor: ['#94a3b8','#f43f5e','#f59e0b'][i],
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
  const COLORS = ['#22d3ee','#f59e0b','#10b981','#f43f5e','#8b5cf6','#06b6d4','#ec4899','#f97316'];
  mkChart(canvasId, 'doughnut', {
    labels: Object.keys(counts),
    datasets: [{ data: Object.values(counts), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 6 }]
  }, { cutout:'68%', plugins:{ legend:{ position:'right', labels:{color:'#94a3b8',boxWidth:8,font:{size:9}} } },
       scales:{ x:{display:false}, y:{display:false} } });
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  Chart.defaults.color = '#94a3b8';
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
