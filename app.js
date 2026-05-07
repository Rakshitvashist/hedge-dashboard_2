/**
 * SOM Institutional Dashboard - Core Logic
 * Handles state, rendering, and complex visualizations.
 */

class Dashboard {
  constructor() {
    this.universe = 'nifty50';
    this.activeTab = 'overview';
    this.charts = {};
    
    this.LAYER_META = {
      Base:        { label: 'Base SIM',      color: '#94a3b8', cls: 'ltag-base' },
      ST:          { label: 'ST Filter',     color: '#22d3ee', cls: 'ltag-st' },
      EMA:         { label: 'EMA Filter',    color: '#10b981', cls: 'ltag-ema' },
      COMBO:       { label: 'COMBO Filter',  color: '#fbbf24', cls: 'ltag-combo' },
      ULTRA:       { label: 'ULTRA Layer',   color: '#a855f7', cls: 'ltag-ultra' },
      COMBO_HEDGE: { label: 'COMBO+Hedge',   color: '#06b6d4', cls: 'ltag-ch' },
      ULTRA_HEDGE: { label: 'ULTRA Defense', color: '#f43f5e', cls: 'ltag-uh' },
      Bench:       { label: 'Benchmark',     color: 'rgba(255,255,255,0.2)', cls: '' }
    };

    this.init();
  }

  init() {
    this.setupChartDefaults();
    this.initParticles();
    this.bindGlobals();
    this.renderAll();
  }

  bindGlobals() {
    window.switchUniverse = (u) => {
      console.log('Switching Universe:', u);
      this.universe = u;
      document.getElementById('btn-n50').classList.toggle('active', u === 'nifty50');
      document.getElementById('btn-n500').classList.toggle('active', u === 'nifty500');
      this.renderAll();
    };

    window.switchTab = (tab) => {
      console.log('Switching Tab:', tab);
      this.activeTab = tab;
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
      document.querySelectorAll('.tab-btn').forEach(b => {
        const onclick = b.getAttribute('onclick') || '';
        b.classList.toggle('active', onclick.includes(`'${tab}'` || `"${tab}"`));
      });
      this.renderTabContent(tab);
    };
  }

  setupChartDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.1)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
  }

  initParticles() {
    if (window.particlesJS) {
      window.particlesJS('particles-js', {
        particles: {
          number: { value: 30, density: { enable: true, value_area: 800 } },
          color: { value: ['#22d3ee', '#fbbf24'] },
          shape: { type: 'circle' },
          opacity: { value: 0.1, random: true },
          size: { value: 1.5, random: true },
          line_linked: { enable: true, distance: 150, color: '#22d3ee', opacity: 0.05, width: 1 },
          move: { enable: true, speed: 0.5, direction: 'none', random: true, out_mode: 'out' }
        },
        interactivity: { events: { onhover: { enable: true, mode: 'grab' } } },
        retina_detect: true
      });
    }
  }

  renderAll() {
    const data = DASHBOARD_DATA[this.universe];
    if (!data) {
      console.error('No data found for universe:', this.universe);
      return;
    }
    document.getElementById('last-refresh').textContent = `Terminal Updated: ${DASHBOARD_DATA.last_update || 'N/A'}`;
    this.renderTabContent(this.activeTab);
  }

  renderTabContent(tab) {
    const data = DASHBOARD_DATA[this.universe];
    if (!data) return;

    if (tab === 'overview')  this.renderOverview(data);
    if (tab === 'layers')    this.renderLayers(data);
    if (tab === 'equity')    this.renderEquity(data);
    if (tab === 'heatmap')   this.renderHeatmap(data);
    if (tab === 'churning')  this.renderChurning(data);
    if (tab === 'portfolio') this.renderPortfolio(data);
    if (tab === 'trades')    this.renderTrades(data);
  }

  // ── RENDERERS ──────────────────────────────────────────

  renderOverview(data) {
    const base = data.layer_metrics.Base;
    const kpis = [
      { label: 'CAGR (Base)', val: base.CAGR, unit: '%', color: 'cyan' },
      { label: 'Ex-Ante Sharpe', val: data.avg_ex_ante_sr, unit: '', color: 'gold' },
      { label: 'Max Drawdown', val: base.Max_DD, unit: '%', color: 'rose' },
      { label: 'Total Return', val: base.Total_Return, unit: '%', color: 'emerald' }
    ];

    const row = document.getElementById('kpi-row');
    if (row) {
      row.innerHTML = kpis.map((k, i) => `
        <div class="glass kpi-card animate-in" style="animation-delay: ${i * 0.1}s">
          <span class="kpi-label">${k.label}</span>
          <span class="kpi-value text-${k.color}" id="kpi-val-${i}">0</span>
          <span class="kpi-trend ${k.val >= 0 ? 'pos' : 'neg'}">${k.val >= 0 ? '▲' : '▼'} ${Math.abs(k.val).toFixed(2)}${k.unit}</span>
        </div>
      `).join('');

      kpis.forEach((k, i) => {
        if (window.countUp) {
          new window.countUp.CountUp(`kpi-val-${i}`, k.val, { decimalPlaces: 2, suffix: k.unit }).start();
        } else {
          const el = document.getElementById(`kpi-val-${i}`);
          if (el) el.textContent = k.val.toFixed(2) + k.unit;
        }
      });
    }

    this.renderEquityOverview(data);
    this.renderBetaChart(data);
    this.renderSectorPie('overviewSectorPie', data.current_portfolio || []);
  }

  renderLayers(data) {
    const layers = Object.keys(this.LAYER_META).filter(l => l !== 'Bench');
    const tbody = document.getElementById('layerTableBody');
    if (!tbody) return;
    tbody.innerHTML = layers.map(l => {
      const m = data.layer_metrics[l];
      return `
        <tr class="animate-in">
          <td><span class="ltag ${this.LAYER_META[l].cls}">${this.LAYER_META[l].label}</span></td>
          <td class="mono ${m.CAGR >= 0 ? 'text-emerald' : 'text-rose'}">${m.CAGR.toFixed(2)}%</td>
          <td class="mono">${m.Sharpe.toFixed(2)}</td>
          <td class="mono">${m.Sortino.toFixed(2)}</td>
          <td class="mono text-rose">${m.Max_DD.toFixed(2)}%</td>
          <td class="mono text-emerald">${m.Total_Return.toFixed(2)}%</td>
        </tr>
      `;
    }).join('');
  }

  renderHeatmap(data) {
    const container = document.getElementById('heatmap-container');
    if (!container) return;
    const monthlyData = data.monthly_detail;
    
    const grid = {};
    monthlyData.forEach(row => {
      if (!row.Month) return;
      const parts = row.Month.split('-');
      if (parts.length < 2) return;
      const year = parts[0];
      const month = parts[1];
      if (!grid[year]) grid[year] = new Array(12).fill(null);
      grid[year][parseInt(month) - 1] = row.ULTRA_HEDGE * 100;
    });

    const years = Object.keys(grid).sort((a, b) => b - a);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let html = `
      <div class="heatmap-grid">
        <div class="hm-head">Year</div>
        ${months.map(m => `<div class="hm-head">${m}</div>`).join('')}
    `;

    years.forEach(year => {
      html += `<div class="hm-year mono">${year}</div>`;
      grid[year].forEach(val => {
        const color = this.getHeatmapColor(val);
        html += `
          <div class="hm-cell" style="background: ${color}; color: ${Math.abs(val) > 5 ? '#fff' : 'rgba(255,255,255,0.5)'}">
            ${val !== null ? val.toFixed(1) : ''}
          </div>`;
      });
    });

    html += '</div>';
    container.innerHTML = html;
  }

  getHeatmapColor(val) {
    if (val === null) return 'rgba(255,255,255,0.02)';
    if (val > 0) {
      const alpha = Math.min(val / 10, 0.8);
      return `rgba(16, 185, 129, ${alpha})`;
    } else {
      const alpha = Math.min(Math.abs(val) / 10, 0.8);
      return `rgba(244, 63, 94, ${alpha})`;
    }
  }

  renderChurning(d) {
    const churn = d.churning_data || [];
    const tbody = document.getElementById('churningBody');
    if (!tbody) return;
    tbody.innerHTML = [...churn].reverse().map(r => `
      <tr>
        <td>${r.Month}</td>
        <td class="mono">${r.Stock_Count}</td>
        <td class="text-emerald">${r['Base Add']}</td><td class="text-emerald">${r['ST Add']}</td><td class="text-emerald">${r['EMA Add']}</td>
        <td class="text-rose">${r['Base Rem']}</td><td class="text-rose">${r['ST Rem']}</td>
      </tr>`).join('');

    this.renderLineChart('churnAddChart', churn, ['Base Add','ST Add','EMA Add'], ['#94a3b8','#22d3ee','#10b981']);
    this.renderLineChart('churnRemChart', churn, ['Base Rem','ST Rem','EMA Rem'], ['#94a3b8','#22d3ee','#10b981']);
  }

  renderPortfolio(d) {
    const port = d.current_portfolio || [];
    const latest = d.monthly_detail[d.monthly_detail.length - 1] || {};
    const avgChg = port.length ? port.reduce((a, s) => a + (s.change_pct || 0), 0) / port.length : 0;

    const kpiEl = document.getElementById('portKpis');
    if (kpiEl) {
      kpiEl.innerHTML = [
        { label: 'Holdings', val: port.length, unit: '', color: 'cyan' },
        { label: 'Portfolio Beta', val: latest.Port_Beta || 0, unit: '', color: 'gold' },
        { label: 'Avg Today %', val: avgChg, unit: '%', color: avgChg >= 0 ? 'emerald' : 'rose' }
      ].map((k, i) => `
        <div class="glass kpi-card animate-in">
          <span class="kpi-label">${k.label}</span>
          <span class="kpi-value text-${k.color}">${k.val.toFixed(2)}${k.unit}</span>
        </div>`).join('');
    }

    const tbody = document.getElementById('holdingsBody');
    if (tbody) {
      tbody.innerHTML = port.map(s => `
        <tr>
          <td class="mono">${s.clean_symbol}</td>
          <td class="text-muted" style="font-size:0.7rem">${s.sector}</td>
          <td class="mono">${((s.weight || 0) * 100).toFixed(1)}%</td>
          <td class="mono">₹${(s.ltp || 0).toFixed(2)}</td>
          <td class="mono ${s.change_pct >= 0 ? 'text-emerald' : 'text-rose'}">${(s.change_pct || 0).toFixed(2)}%</td>
          <td class="mono ${s.action?.includes('BUY') ? 'text-emerald' : 'text-rose'}">${s.action || '—'}</td>
        </tr>`).join('');
    }

    this.renderSectorPie('portSector', port);
  }

  renderTrades(d) {
    const tbody = document.getElementById('tradesBody');
    if (!tbody) return;
    tbody.innerHTML = [...d.exec_history].reverse().slice(0, 50).map(t => `
      <tr>
        <td class="text-muted">${t.month}</td>
        <td class="mono">${t.symbol.split('_')[0]}</td>
        <td class="${t.action?.includes('BUY') ? 'text-emerald' : 'text-rose'}">${t.action}</td>
        <td class="mono">${(t.qty || 0).toLocaleString()}</td>
        <td class="mono">₹${(t.price || 0).toFixed(2)}</td>
        <td class="mono ${t.return >= 0 ? 'text-emerald' : 'text-rose'}">${(t.return * 100).toFixed(2)}%</td>
      </tr>`).join('');
  }

  renderEquity(data) {
    this.renderLineChart('equityMain', data.equity_curves, Object.keys(this.LAYER_META), Object.values(this.LAYER_META).map(m => m.color), true);
  }

  // ── CHART HELPERS ──────────────────────────────────────

  renderLineChart(canvasId, data, keys, colors, isEquity = false) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    if (this.charts[canvasId]) this.charts[canvasId].destroy();

    const labels = isEquity ? data.months : data.map(r => r.Month);
    const datasets = keys.map((k, i) => ({
      label: isEquity ? (this.LAYER_META[k]?.label || k) : k,
      data: isEquity ? data[k] : data.map(r => r[k]),
      borderColor: colors[i],
      borderWidth: 2,
      pointRadius: isEquity ? 0 : 2,
      tension: 0.3
    }));

    this.charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  renderSectorPie(canvasId, portfolio) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    if (this.charts[canvasId]) this.charts[canvasId].destroy();

    const counts = {};
    portfolio.forEach(s => { counts[s.sector] = (counts[s.sector] || 0) + 1; });
    const labels = Object.keys(counts);
    const vals = Object.values(counts);

    this.charts[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: vals,
          backgroundColor: ['#22d3ee','#fbbf24','#10b981','#f43f5e','#8b5cf6','#06b6d4','#a855f7'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 9 } } } }
      }
    });
  }

  renderEquityOverview(data) {
    this.renderLineChart('equityOverview', data.equity_curves, Object.keys(this.LAYER_META), Object.values(this.LAYER_META).map(m => m.color), true);
  }

  renderBetaChart(data) {
    const el = document.getElementById('betaChart');
    if (!el) return;
    const ctx = el.getContext('2d');
    if (this.charts['betaChart']) this.charts['betaChart'].destroy();

    const md = data.monthly_detail.slice(-12);
    this.charts['betaChart'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: md.map(r => r.Month),
        datasets: [{
          label: 'Portfolio Beta',
          data: md.map(r => r.Port_Beta),
          backgroundColor: 'rgba(34, 211, 238, 0.4)',
          borderColor: 'var(--cyan)',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 2, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new Dashboard();
});
