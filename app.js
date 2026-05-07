let currentMode = 'nifty50';
let equityChart, sectorChart;

function init() {
    renderDashboard();
}

function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.btn-toggle').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.toLowerCase().replace(' ', '') === mode);
    });
    renderDashboard();
}

function renderDashboard() {
    const data = DASHBOARD_DATA[currentMode];
    const liveData = DASHBOARD_DATA.live_stock_data;
    const sectorMap = DASHBOARD_DATA.sector_map;

    // Update Last Refresh time
    document.getElementById('last-refresh').innerText = `Last Update: ${DASHBOARD_DATA.last_update}`;

    // 1. Summary Stats
    const statsContainer = document.getElementById('summary-stats');
    statsContainer.innerHTML = `
        <div class="stat-card">
            <p class="stat-label">CAGR</p>
            <p class="stat-value">${data.summary.CAGR}</p>
        </div>
        <div class="stat-card">
            <p class="stat-label">Sharpe Ratio</p>
            <p class="stat-value">${data.summary.Sharpe}</p>
        </div>
        <div class="stat-card">
            <p class="stat-label">Max Drawdown</p>
            <p class="stat-value" style="color: var(--negative)">${data.summary.Max_Drawdown}</p>
        </div>
        <div class="stat-card">
            <p class="stat-label">Total Strategy Return</p>
            <p class="stat-value" style="color: var(--positive)">${data.summary.Total_Return}</p>
        </div>
    `;

    // 2. Live Portfolio Monitoring
    const liveBody = document.getElementById('liveBody');
    liveBody.innerHTML = '';
    let totalDayChange = 0;
    let count = 0;

    data.holdings.forEach(h => {
        const live = liveData[h.Symbol] || { last_price: 0, change_pct: 0, date: 'N/A' };
        const row = document.createElement('tr');
        const changeClass = live.change_pct >= 0 ? 'status-buy' : 'status-sell';
        
        totalDayChange += live.change_pct;
        count++;

        row.innerHTML = `
            <td style="font-weight: 600">${h.Symbol}</td>
            <td>${live.last_price.toFixed(2)}</td>
            <td class="${changeClass}">${live.change_pct > 0 ? '+' : ''}${live.change_pct}%</td>
            <td>${live.date}</td>
            <td style="color: var(--text-secondary)">${h.Qty}</td>
        `;
        liveBody.appendChild(row);
    });

    const avgChange = count > 0 ? (totalDayChange / count).toFixed(2) : 0;
    document.getElementById('portfolio-day-change').innerText = `${avgChange > 0 ? '+' : ''}${avgChange}%`;
    document.getElementById('portfolio-day-change').className = `stat-value ${avgChange >= 0 ? 'status-buy' : 'status-sell'}`;

    // 3. Equity Chart
    const ts = data.time_series;
    const labels = ts.map(d => d.Month);
    const equityData = ts.map(d => d.Equity_Ultra_H);
    const benchData = ts.map(d => d.Bench_Equity);

    if (equityChart) equityChart.destroy();
    const ctx = document.getElementById('equityChart').getContext('2d');
    equityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Ultra Hedge',
                    data: equityData,
                    borderColor: '#00d2ff',
                    backgroundColor: 'rgba(0, 210, 255, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3
                },
                {
                    label: 'Benchmark',
                    data: benchData,
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true, labels: { color: '#a0aec0' } } },
            scales: {
                x: { ticks: { color: '#718096', maxTicksLimit: 10 }, grid: { display: false } },
                y: { ticks: { color: '#718096' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            }
        }
    });

    // 4. Sector Chart
    const sectorCounts = {};
    data.holdings.forEach(h => {
        const sym = h.Symbol.split('_')[0];
        const sector = sectorMap[sym] || 'Other';
        sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
    });

    const sectorLabels = Object.keys(sectorCounts);
    const sectorValues = Object.values(sectorCounts);

    if (sectorChart) sectorChart.destroy();
    const ctxS = document.getElementById('sectorChart').getContext('2d');
    sectorChart = new Chart(ctxS, {
        type: 'doughnut',
        data: {
            labels: sectorLabels,
            datasets: [{
                data: sectorValues,
                backgroundColor: [
                    '#00d2ff', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    position: 'right',
                    labels: { color: '#a0aec0', padding: 20, boxWidth: 12 } 
                } 
            },
            cutout: '70%'
        }
    });
}

window.onload = init;
