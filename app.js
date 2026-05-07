// import { CountUp } from 'countup.js'; // Using global from CDN

/**
 * SOM Institutional Dashboard - Core Logic
 * Handles state, rendering, and complex visualizations.
 */

class Dashboard {
  constructor() {
    this.universe = 'nifty50';
    this.activeTab = 'overview';
    this.charts = {};
    this.visibleLayers = new Set(['Base', 'ULTRA_HEDGE', 'COMBO_HEDGE', 'Bench']);
    
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
    this.renderAll();
    this.setupEventListeners();
  }

  initParticles() {
    if (window.particlesJS) {
      window.particlesJS('particles-js', {
        particles: {
          number: { value: 50, density: { enable: true, value_area: 800 } },
          color: { value: ['#22d3ee', '#fbbf24'] },
          shape: { type: 'circle' },
          opacity: { value: 0.2, random: true },
          size: { value: 2, random: true },
          line_linked: { enable: true, distance: 150, color: '#22d3ee', opacity: 0.1, width: 1 },
          move: { enable: true, speed: 0.8, direction: 'none', random: true, out_mode: 'out' }
        },
        interactivity: {
          events: { onhover: { enable: true, mode: 'grab' } }
        },
        retina_detect: true
      });
    }
  }

  setupChartDefaults() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.1)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
  }

  setupEventListeners() {
    window.switchUniverse = (u) => {
      this.universe = u;
      document.getElementById('btn-n50').classList.toggle('active', u === 'nifty50');
      document.getElementById('btn-n500').classList.toggle('active', u === 'nifty500');
      this.renderAll();
    };

    window.switchTab = (tab) => {
      this.activeTab = tab;
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('onclick').includes(tab)));
      this.renderTabContent(tab);
    };
  }

  renderAll() {
    const data = DASHBOARD_DATA[this.universe];
    document.getElementById('last-refresh').textContent = `Terminal Updated: ${DASHBOARD_DATA.last_update || 'N/A'}`;
    this.renderTabContent(this.activeTab);
  }

  renderTabContent(tab) {
    const data = DASHBOARD_DATA[this.universe];
    if (tab === 'overview') this.renderOverview(data);
    if (tab === 'layers') this.renderLayers(data);
    if (tab === 'equity') this.renderEquity(data);
    if (tab === 'heatmap') this.renderHeatmap(data);
  }

  renderLayers(data) {
    const layers = Object.keys(this.LAYER_META).filter(l => l !== 'Bench');
    const tbody = document.getElementById('layerTableBody');
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

  // ── VISUALIZATIONS ───────────────────────────────────────

  renderOverview(data) {
    const base = data.layer_metrics.Base;
    const kpis = [
      { label: 'CAGR (Base)', val: base.CAGR, unit: '%', color: 'cyan' },
      { label: 'Ex-Ante Sharpe', val: data.avg_ex_ante_sr, unit: '', color: 'gold' },
      { label: 'Max Drawdown', val: base.Max_DD, unit: '%', color: 'rose' },
      { label: 'Total Return', val: base.Total_Return, unit: '%', color: 'emerald' }
    ];

    const row = document.getElementById('kpi-row');
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
        document.getElementById(`kpi-val-${i}`).textContent = k.val.toFixed(2) + k.unit;
      }
    });

    this.renderEquityOverview(data);
    this.renderBetaChart(data);
  }

  renderBetaChart(data) {
    const ctx = document.getElementById('betaChart').getContext('2d');
    if (this.charts['betaChart']) this.charts['betaChart'].destroy();

    const md = data.monthly_detail.slice(-12); // Last 12 months
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

  renderEquityOverview(data) {
    const ctx = document.getElementById('equityOverview').getContext('2d');
    if (this.charts['equityOverview']) this.charts['equityOverview'].destroy();

    const ec = data.equity_curves;
    this.charts['equityOverview'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ec.months,
        datasets: Object.keys(this.LAYER_META).map(l => ({
          label: this.LAYER_META[l].label,
          data: ec[l],
          borderColor: this.LAYER_META[l].color,
          borderWidth: l === 'Bench' ? 1 : 2,
          borderDash: l === 'Bench' ? [5, 5] : [],
          pointRadius: 0,
          tension: 0.3
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  /**
   * Heatmap Engine
   * Generates a grid of monthly returns by year.
   */
  renderHeatmap(data) {
    const container = document.getElementById('heatmap-container');
    const monthlyData = data.monthly_detail; // Assuming this contains monthly returns
    
    // Group by year
    const grid = {};
    monthlyData.forEach(row => {
      const [year, month] = row.Month.split('-');
      if (!grid[year]) grid[year] = new Array(12).fill(null);
      grid[year][parseInt(month) - 1] = row.ULTRA_HEDGE * 100; // Use ULTRA_HEDGE for heatmap
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
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new Dashboard();
});
