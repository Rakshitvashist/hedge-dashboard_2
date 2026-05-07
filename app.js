'use strict';

// ── STATE ────────────────────────────────────────────────
let universe = 'nifty50';
let activeTab = 'overview';
const charts = {};
let visibleLayers = new Set(['Base','ULTRA_HEDGE','COMBO_HEDGE','Bench']);

const LAYER_META = {
  Base:        { label:'Base SIM',      color:'#94a3b8', cls:'ltag-base'  },
  ST:          { label:'ST Filter',     color:'#60a5fa', cls:'ltag-st'    },
  EMA:         { label:'EMA Filter',    color:'#00ff88', cls:'ltag-ema'   },
  COMBO:       { label:'COMBO Filter',  color:'#d4af37', cls:'ltag-combo' },
  ULTRA:       { label:'ULTRA Layer',   color:'#c39bd3', cls:'ltag-ultra' },
  COMBO_HEDGE: { label:'COMBO+Hedge',   color:'#00fff9', cls:'ltag-ch'    },
  ULTRA_HEDGE: { label:'ULTRA Defense', color:'#ff6b9d', cls:'ltag-uh'    },
  Bench:       { label:'Benchmark',     color:'rgba(255,255,255,0.3)', cls:'' }
};
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── PARTICLES ────────────────────────────────────────────
particlesJS('particles-js', {
  particles: {
    number: { value: 60, density: { enable: true, value_area: 800 } },
    color: { value: ['#00fff9','#d4af37','#00ff88'] },
    shape: { type: 'circle' },
    opacity: { value: 0.25, random: true, anim: { enable: true, speed: 0.5, opacity_min: 0.05 } },
    size: { value: 2, random: true },
    line_linked: { enable: true, distance: 130, color: '#00fff9', opacity: 0.06, width: 1 },
    move: { enable: true, speed: 0.6, direction: 'none', random: true, out_mode: 'out' }
  },
  interactivity: {
    detect_on: 'canvas',
    events: { onhover: { enable: true, mode: 'grab' }, onclick: { enable: false } }
  },
  retina_detect: true
});

// ── CHART DEFAULTS ───────────────────────────────────────
Chart.defaults.color = '#64748b';
Chart.defaults.font.family = 'Roboto Mono, monospace';
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.padding = 14;

const chartBase = (extra={}) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
    tooltip: { backgroundColor: '#0a0e27', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10,
      titleFont: { family: 'Roboto Mono', size: 11 }, bodyFont: { family: 'Roboto Mono', size: 11 } }
  },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { maxTicksLimit: 12, color: '#475569', font: { size: 10 } } },
    y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#475569', font: { size: 10 } } }
  },
  elements: { line: { tension: 0.4 } },
  ...extra
});

// ── HELPERS ──────────────────────────────────────────────
const $  = id => document.getElementById(id);
const pct = (v, d=2) => v==null ? '—' : `${+v>=0?'+':''}${(+v).toFixed(d)}%`;
const num = (v, d=2) => v==null ? '—' : (+v).toFixed(d);
const cls = v => +v>=0 ? 'pos' : 'neg';
const destroyChart = id => { if(charts[id]){ charts[id].destroy(); delete charts[id]; } };

function countUp(elId, val, opts={}) {
  try {
    const cu = new countUp.CountUp(elId, Math.abs(+val), {
      duration: 2, decimalPlaces: 2, separator: ',', ...opts
    });
    if (!cu.error) cu.start();
  } catch(e) {
    const el = $(elId); if(el) el.textContent = val;
  }
}

// ── SWITCH ───────────────────────────────────────────────
function switchUniverse(u) {
  universe = u;
  $('btn-n50').classList.toggle('active', u==='nifty50');
  $('btn-n500').classList.toggle('active', u==='nifty500');
  renderAll();
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((b,i) => {
    b.classList.toggle('active', ['overview','layers','equity','heatmap','portfolio','trades'][i]===tab);
  });
  $(`tab-${tab}`).classList.add('active');
  renderTabContent(tab);
}

function renderAll() {
  $('last-refresh').textContent = `Updated: ${DASHBOARD_DATA.last_update}`;
  renderTabContent(activeTab);
}

function renderTabContent(tab) {
  const d = DASHBOARD_DATA[universe];
  if(tab==='overview')  renderOverview(d);
  if(tab==='layers')    renderLayers(d);
  if(tab==='equity')    renderEquity(d);
  if(tab==='churning')  renderChurning(d);
  if(tab==='portfolio') renderPortfolio(d);
  if(tab==='trades')    renderTrades(d);
}

// ── OVERVIEW ─────────────────────────────────────────────
function renderOverview(d) {
  const base = d.layer_metrics.Base;
  const kpis = [
    { icon:'📈', label:'CAGR (Base SIM)',      id:'kv0', val:base.CAGR, unit:'%', color:'green',  sub:'Annualized' },
    { icon:'⚡', label:'Avg Ex-Ante Sharpe',   id:'kv1', val:d.avg_ex_ante_sr, unit:'', color:'cyan', sub:'Forward-looking avg' },
    { icon:'📊', label:'Monthly Stock Count',  id:'kv2', val:d.monthly_detail[d.monthly_detail.length-1].Stock_Count, unit:'', color:'gold',  sub:'Active holdings' },
    { icon:'📉', label:'Max Drawdown (Base)',  id:'kv3', val:base.Max_DD, unit:'%', color:'red',   sub:'Peak-to-trough' },
    { icon:'💰', label:'Total Return (Base)',  id:'kv4', val:base.Total_Return, unit:'%', color:'green', sub:`${d.total_months}M backtest` },
    { icon:'🏆', label:'Win Rate (Base)',      id:'kv5', val:base.Win_Rate, unit:'%', color:'orange', sub:'Positive months' },
    { icon:'🔺', label:'Alpha vs Bench',       id:'kv6', val:base.Alpha, unit:'%', color:'cyan', sub:'Annual excess' },
    { icon:'🔵', label:'Sortino Ratio (Base)', id:'kv7', val:base.Sortino, unit:'', color:'purple', sub:'Downside-adjusted' }
  ];

  $('kpi-row').innerHTML = kpis.map((k,i) => `
    <div class="glass kpi-card anim-${i+1}">
      <span class="kpi-icon">${k.icon}</span>
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value ${k.color}" id="${k.id}">—</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');

  // Animate values after DOM settles
  setTimeout(() => {
    kpis.forEach(k => {
      const el = $(k.id);
      if(!el) return;
      const prefix = +k.val>=0 ? '+' : '-';
      el.textContent = prefix + Math.abs(+k.val).toFixed(2) + k.unit;
    });
  }, 100);

  // Equity overview
  destroyChart('equityOverview');
  const ec = d.equity_curves;
  const layers = Object.keys(LAYER_META);
  charts['equityOverview'] = new Chart($('equityOverview').getContext('2d'), {
    type: 'line',
    data: {
      labels: ec.months,
      datasets: layers.map(l => ({
        label: LAYER_META[l].label, data: ec[l],
        borderColor: LAYER_META[l].color, backgroundColor: 'transparent',
        borderWidth: ['ULTRA_HEDGE','COMBO_HEDGE'].includes(l) ? 2.5 : l==='Bench' ? 1 : 1.2,
        borderDash: l==='Bench' ? [4,4] : [], pointRadius: 0, tension: 0.3
      }))
    },
    options: chartBase()
  });

  renderSectorPie('sectorPie', d.current_portfolio);

  // Monthly bar
  destroyChart('barMonthly');
  const md = d.monthly_detail;
  charts['barMonthly'] = new Chart($('barMonthly').getContext('2d'), {
    type: 'bar',
    data: {
      labels: md.map(r=>r.Month),
      datasets: [{
        label: 'ULTRA Defense Monthly %',
        data: md.map(r => +(r.ULTRA_HEDGE*100).toFixed(2)),
        backgroundColor: md.map(r => r.ULTRA_HEDGE>=0 ? 'rgba(0,255,136,0.7)' : 'rgba(255,0,85,0.7)'),
        borderRadius: 4
      }]
    },
    options: chartBase({ scales: {
      x: { grid:{display:false}, ticks:{maxTicksLimit:16,color:'#475569',font:{size:9}} },
      y: { grid:{color:'rgba(255,255,255,0.03)'}, ticks:{color:'#475569',callback:v=>v+'%',font:{size:9}} }
    }})
  });
}

// ── SECTOR PIE ───────────────────────────────────────────
function renderSectorPie(canvasId, portfolio) {
  destroyChart(canvasId);
  if(!portfolio || !portfolio.length) return;
  const counts = {};
  portfolio.forEach(s => { counts[s.sector]=(counts[s.sector]||0)+1; });
  const COLS = ['#00fff9','#d4af37','#00ff88','#ff6b9d','#c39bd3','#60a5fa','#f87171','#fbbf24','#2dd4bf'];
  charts[canvasId] = new Chart($(canvasId).getContext('2d'), {
    type: 'doughnut',
    data: { labels:Object.keys(counts), datasets:[{ data:Object.values(counts), backgroundColor:COLS, borderWidth:0 }] },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'68%',
      plugins: {
        legend: { position:'right', labels:{color:'#94a3b8',padding:14,boxWidth:10,font:{size:11,family:'Inter'}} },
        tooltip: { backgroundColor:'#0a0e27', borderColor:'rgba(255,255,255,0.1)', borderWidth:1 }
      }
    }
  });
}

// ── ALL LAYERS ───────────────────────────────────────────
function renderLayers(d) {
  const layers = ['Base','ST','EMA','COMBO','ULTRA','COMBO_HEDGE','ULTRA_HEDGE'];
  const mkeys  = ['CAGR','Volatility','Sharpe','Sortino','Calmar','Max_DD','Win_Rate','Avg_Gain','Avg_Loss','Alpha','Total_Return'];

  const best = {};
  mkeys.forEach(k => {
    const vals = layers.map(l => d.layer_metrics[l][k]);
    best[k] = k==='Volatility' ? Math.min(...vals) : Math.max(...vals);
  });

  $('layerTableBody').innerHTML = layers.map(l => {
    const m = d.layer_metrics[l];
    const td = (k,fmt) => `<td class="${m[k]===best[k]?'best':''} ${cls(m[k])}">${fmt(m[k])}</td>`;
    return `<tr>
      <td><span class="ltag ${LAYER_META[l].cls}">${LAYER_META[l].label}</span></td>
      ${td('CAGR',v=>pct(v))} ${td('Volatility',v=>num(v)+'%')}
      ${td('Sharpe',num)} ${td('Sortino',num)} ${td('Calmar',num)}
      ${td('Max_DD',v=>pct(v))} ${td('Win_Rate',v=>num(v)+'%')}
      ${td('Avg_Gain',v=>pct(v))} ${td('Avg_Loss',v=>pct(v))}
      ${td('Alpha',v=>pct(v))} ${td('Total_Return',v=>pct(v))}
    </tr>`;
  }).join('');

  // Executive summary
  const lLabels = ['Base SIM','ST Filter','EMA Filter','COMBO Filter','ULTRA Layer','COMBO+Hedge','ULTRA Defense'];
  $('execHead').innerHTML = `<tr><th>Metric</th>${lLabels.map(l=>`<th>${l}</th>`).join('')}</tr>`;
  $('execBody').innerHTML = Object.entries(d.exec_summary).map(([metric, row]) => `
    <tr>
      <td>${metric}</td>
      ${layers.map(l => { const v=row[l]; return `<td>${typeof v==='number'?num(v):v||'—'}</td>`; }).join('')}
    </tr>`).join('');
}

// ── EQUITY CURVES ────────────────────────────────────────
function renderEquity(d) {
  const allLayers = [...Object.keys(LAYER_META)];
  $('layerToggles').innerHTML = allLayers.map(l => `
    <button class="l-toggle" id="lt-${l}"
      style="border-color:${LAYER_META[l].color};color:${LAYER_META[l].color};background:${visibleLayers.has(l)?LAYER_META[l].color+'22':'transparent'}"
      onclick="toggleLayer('${l}')">${LAYER_META[l].label}</button>`).join('');

  buildEquityChart(d);

  destroyChart('sharpeChart');
  const md = d.monthly_detail;
  charts['sharpeChart'] = new Chart($('sharpeChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: md.map(r=>r.Month),
      datasets: [
        { label:'Ex-Ante Sharpe', data:md.map(r=>+num(r.Ex_Ante_Sharpe)),
          borderColor:'#00fff9', backgroundColor:'rgba(0,255,249,0.07)',
          fill:true, tension:0.4, borderWidth:2, pointRadius:0 },
        { label:`Avg (${d.avg_ex_ante_sr})`, data:md.map(()=>d.avg_ex_ante_sr),
          borderColor:'rgba(212,175,55,0.6)', borderDash:[5,5], borderWidth:1.5, pointRadius:0 }
      ]
    },
    options: chartBase()
  });
}

function buildEquityChart(d) {
  destroyChart('equityMain');
  const ec = d.equity_curves;
  charts['equityMain'] = new Chart($('equityMain').getContext('2d'), {
    type: 'line',
    data: {
      labels: ec.months,
      datasets: Object.keys(LAYER_META).filter(l=>visibleLayers.has(l)).map(l => ({
        label: LAYER_META[l].label, data: ec[l],
        borderColor: LAYER_META[l].color, backgroundColor:'transparent',
        borderWidth: ['ULTRA_HEDGE','COMBO_HEDGE'].includes(l)?2.5:1.5,
        borderDash: l==='Bench'?[5,5]:[], pointRadius:0, tension:0.3
      }))
    },
    options: chartBase()
  });
}

function toggleLayer(l) {
  visibleLayers.has(l) ? visibleLayers.delete(l) : visibleLayers.add(l);
  const btn = $(`lt-${l}`);
  if(btn) btn.style.background = visibleLayers.has(l) ? LAYER_META[l].color+'22' : 'transparent';
  buildEquityChart(DASHBOARD_DATA[universe]);
}

// ── CHURNING ANALYSIS ──────────────────────────────────────
function renderChurning(d) {
  const churn = d.churning_data;
  if (!churn || !churn.length) {
    $('churningBody').innerHTML = '<tr><td colspan="12">No churning data available.</td></tr>';
    return;
  }

  // Churn Add Chart
  destroyChart('churnAddChart');
  charts['churnAddChart'] = new Chart($('churnAddChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: churn.map(r => r.Month),
      datasets: [
        { label: 'Base Add', data: churn.map(r => r['Base Add']), borderColor: '#94a3b8', tension: 0.4, pointRadius: 2 },
        { label: 'ST Add', data: churn.map(r => r['ST Add']), borderColor: '#60a5fa', tension: 0.4, pointRadius: 2 },
        { label: 'EMA Add', data: churn.map(r => r['EMA Add']), borderColor: '#00ff88', tension: 0.4, pointRadius: 2 },
        { label: 'COMBO Add', data: churn.map(r => r['COMBO Add']), borderColor: '#d4af37', tension: 0.4, pointRadius: 2 },
        { label: 'ULTRA Add', data: churn.map(r => r['ULTRA Add']), borderColor: '#c39bd3', tension: 0.4, pointRadius: 2 }
      ]
    },
    options: chartBase()
  });

  // Churn Rem Chart
  destroyChart('churnRemChart');
  charts['churnRemChart'] = new Chart($('churnRemChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: churn.map(r => r.Month),
      datasets: [
        { label: 'Base Rem', data: churn.map(r => r['Base Rem']), borderColor: '#94a3b8', tension: 0.4, pointRadius: 2 },
        { label: 'ST Rem', data: churn.map(r => r['ST Rem']), borderColor: '#60a5fa', tension: 0.4, pointRadius: 2 },
        { label: 'EMA Rem', data: churn.map(r => r['EMA Rem']), borderColor: '#00ff88', tension: 0.4, pointRadius: 2 },
        { label: 'COMBO Rem', data: churn.map(r => r['COMBO Rem']), borderColor: '#d4af37', tension: 0.4, pointRadius: 2 },
        { label: 'ULTRA Rem', data: churn.map(r => r['ULTRA Rem']), borderColor: '#c39bd3', tension: 0.4, pointRadius: 2 }
      ]
    },
    options: chartBase()
  });

  $('churningBody').innerHTML = [...churn].reverse().map(r => `
    <tr>
      <td>${r.Month}</td>
      <td style="font-weight:800">${r.Stock_Count}</td>
      <td class="green">${r['Base Add']}</td><td class="green">${r['ST Add']}</td><td class="green">${r['EMA Add']}</td><td class="green">${r['COMBO Add']}</td><td class="green">${r['ULTRA Add']}</td>
      <td class="red">${r['Base Rem']}</td><td class="red">${r['ST Rem']}</td><td class="red">${r['EMA Rem']}</td><td class="red">${r['COMBO Rem']}</td><td class="red">${r['ULTRA Rem']}</td>
    </tr>`).join('');
}

// ── LIVE PORTFOLIO ────────────────────────────────────────
function renderPortfolio(d) {
  const port = d.current_portfolio || [];
  const latest = d.monthly_detail[d.monthly_detail.length-1] || {};
  const avgChg = port.length ? port.reduce((a,s)=>a+(s.change_pct||0),0)/port.length : 0;

  $('portKpis').innerHTML = [
    { icon:'📦', label:'Holdings',         val:port.length,                    fmt:v=>v,           color:'cyan',   sub:'Current month' },
    { icon:'📊', label:'Avg Today Change', val:avgChg,                         fmt:v=>pct(v),       color:avgChg>=0?'green':'red',    sub:'Portfolio avg' },
    { icon:'β',  label:'Portfolio Beta',   val:latest.Port_Beta,               fmt:v=>num(v),       color:'gold',   sub:'Market sensitivity' },
    { icon:'⚡', label:'Ex-Ante Sharpe',   val:latest.Ex_Ante_Sharpe,          fmt:v=>num(v),       color:'cyan',   sub:'Latest month' }
  ].map((k,i)=>`
    <div class="glass kpi-card anim-${i+1}">
      <span class="kpi-icon">${k.icon}</span>
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value ${k.color}">${k.fmt(k.val)}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');

  $('liveList').innerHTML = [...port].sort((a,b)=>(b.change_pct||0)-(a.change_pct||0)).map(s => `
    <div class="ticker-row">
      <div>
        <div class="t-sym">${s.clean_symbol}</div>
        <div class="t-sec">${s.sector}</div>
      </div>
      <div class="t-price">
        <div class="t-ltp">${s.ltp>0?'₹'+s.ltp.toFixed(2):'—'}</div>
        <div class="t-chg ${s.change_pct>=0?'pos':'neg'}">${s.change_pct>=0?'▲':'▼'} ${Math.abs(s.change_pct||0).toFixed(2)}%</div>
      </div>
    </div>`).join('');

  renderSectorPie('portSector', port);

  $('holdingsBody').innerHTML = port.map(s => `
    <tr>
      <td style="font-weight:800;font-family:'Roboto Mono'">${s.clean_symbol}</td>
      <td style="color:rgba(255,255,255,0.45);font-size:0.75rem">${s.sector}</td>
      <td>${((s.weight||0)*100).toFixed(1)}%</td>
      <td>${num(s.beta)}</td><td>${num(s.erb)}</td>
      <td>${s.ltp>0?'₹'+s.ltp.toFixed(2):'—'}</td>
      <td class="${(s.change_pct||0)>=0?'pos':'neg'}">${pct(s.change_pct||0)}</td>
      <td style="color:${s.status==='Added'?'var(--green)':'rgba(255,255,255,0.5)'};font-size:0.75rem">${s.status||''}</td>
      <td class="${s.action?.includes('BUY')?'pos':s.action?.includes('SELL')?'neg':''}" style="font-weight:700">${s.action||'—'}</td>
    </tr>`).join('');
}

// ── TRADES ───────────────────────────────────────────────
function renderTrades(d) {
  $('tradesBody').innerHTML = [...d.exec_history].reverse().map(t => `
    <tr>
      <td style="color:rgba(255,255,255,0.45)">${t.month}</td>
      <td style="font-weight:800">${t.symbol.split('_')[0]}</td>
      <td style="color:rgba(255,255,255,0.45);font-size:0.75rem">${t.sector||''}</td>
      <td class="${t.action?.includes('BUY')?'pos':'neg'}" style="font-weight:700">${t.action}</td>
      <td>${(t.qty||0).toLocaleString()}</td>
      <td>₹${(t.price||0).toFixed(2)}</td>
      <td class="${(t.return||0)>=0?'pos':'neg'}">${pct((t.return||0)*100)}</td>
    </tr>`).join('');
}

// ── INIT ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', renderAll);
