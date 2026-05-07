import pandas as pd
import json
import os
import numpy as np
from datetime import datetime
import warnings
warnings.filterwarnings("ignore")

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def safe_float(v):
    try:
        f = float(v)
        return round(f, 6) if not (np.isnan(f) or np.isinf(f)) else 0.0
    except:
        return 0.0

def compute_metrics(returns_series, bench_series, rf_annual=0.06):
    """Compute full institutional metrics for a return series."""
    r = pd.Series(returns_series).dropna()
    b = pd.Series(bench_series).dropna()
    if len(r) == 0:
        return {}
    n = len(r)
    # Cumulative equity
    equity = (1 + r).cumprod()
    cagr = float(equity.iloc[-1]) ** (12 / n) - 1
    vol = r.std() * np.sqrt(12)
    sharpe = (cagr - rf_annual) / vol if vol > 0 else 0
    mdd = float((equity / equity.cummax() - 1).min())
    downside = r[r < 0].std() * np.sqrt(12)
    sortino = (cagr - rf_annual) / downside if downside > 0 else 0
    calmar = cagr / abs(mdd) if mdd != 0 else 0
    wins = (r > 0).sum()
    win_rate = wins / n
    avg_gain = float(r[r > 0].mean()) if wins > 0 else 0
    avg_loss = float(r[r < 0].mean()) if (r < 0).sum() > 0 else 0
    
    # Alpha vs bench
    common = r.index.intersection(b.index)
    alpha = (cagr - b.loc[common].mean() * 12) if len(common) > 0 else 0

    return {
        "CAGR": round(cagr * 100, 2),
        "Volatility": round(vol * 100, 2),
        "Sharpe": round(sharpe, 2),
        "Sortino": round(sortino, 2),
        "Calmar": round(calmar, 2),
        "Max_DD": round(mdd * 100, 2),
        "Win_Rate": round(win_rate * 100, 1),
        "Avg_Gain": round(avg_gain * 100, 2),
        "Avg_Loss": round(avg_loss * 100, 2),
        "Alpha": round(alpha * 100, 2),
        "Total_Return": round((float(equity.iloc[-1]) - 1) * 100, 2)
    }

def get_equity_curves(df_sum):
    """Build cumulative equity curves for ALL 7 layers + benchmark."""
    layers = ['Base', 'ST', 'EMA', 'COMBO', 'ULTRA', 'COMBO_HEDGE', 'ULTRA_HEDGE', 'Bench']
    equities = {l: [1.0] for l in layers}
    months = []

    for _, row in df_sum.iterrows():
        months.append(str(row['Month']))
        for l in layers:
            col = l if l != 'Bench' else 'Bench'
            equities[l].append(round(equities[l][-1] * (1 + safe_float(row[col])), 4))

    # Remove seed 1.0 and align with months
    return {
        "months": months,
        **{l: equities[l][1:] for l in layers}
    }

def get_heatmap_data(df_sum, layer_col):
    """Build year x month heatmap matrix for a given layer."""
    df = df_sum[['Month', layer_col]].copy()
    df['Date'] = pd.to_datetime(df['Month'])
    df['Year'] = df['Date'].dt.year
    df['MonthNum'] = df['Date'].dt.month
    pivot = df.pivot(index='Year', columns='MonthNum', values=layer_col)
    pivot = pivot.round(4)

    months_short = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    result = []
    for year in pivot.index:
        row = {'year': int(year)}
        for m in range(1, 13):
            val = pivot.at[year, m] if m in pivot.columns else None
            row[months_short[m-1]] = round(float(val)*100, 2) if val is not None and not np.isnan(val) else None
        result.append(row)
    return result

def get_current_portfolio(xl, sector_map):
    """Get the current live portfolio with sector mapping.
    
    Picks the LIVE_PERF_ sheet whose suffix matches the current calendar month
    (YYYY-MM).  If none matches (e.g. month just rolled), falls back to the
    most recent Port_ sheet so the dashboard never shows a future portfolio.
    """
    sheets = xl.sheet_names
    live_sheets = [s for s in sheets if s.startswith('LIVE_PERF_')]
    port_sheets = [s for s in sheets if s.startswith('Port_')]

    curr_month = datetime.now().strftime('%Y-%m')   # e.g. '2026-05'

    # Prefer the live sheet whose suffix is exactly the current month
    current_live = next(
        (s for s in live_sheets if s.endswith(curr_month)), None
    )
    # If no exact match, take the last live sheet that is NOT in the future
    if current_live is None:
        past_live = [s for s in live_sheets if s.replace('LIVE_PERF_', '') <= curr_month]
        current_live = past_live[-1] if past_live else None

    target_sheet = current_live if current_live else (port_sheets[-1] if port_sheets else None)
    if not target_sheet:
        return []

    df = pd.read_excel(xl, sheet_name=target_sheet, header=None)
    # Find header row
    header_row = -1
    for i in range(len(df)):
        if 'Stock' in str(df.iloc[i, 0]):
            header_row = i
            break
    if header_row == -1:
        return []

    cols = list(df.iloc[header_row])
    data = df.iloc[header_row+1:].copy()
    data.columns = range(len(data.columns))

    stocks = []
    beta_col = next((j for j, c in enumerate(cols) if c == 'Beta'), None)
    erb_col = next((j for j, c in enumerate(cols) if c == 'ERB'), None)
    wt_col = next((j for j, c in enumerate(cols) if c == 'SIM Weight'), None)
    action_col = next((j for j, c in enumerate(cols) if c == 'Action'), None)
    status_col = next((j for j, c in enumerate(cols) if c == 'Status'), None)

    for k in range(len(data)):
        sym = str(data.iloc[k, 0])
        if sym in ('nan', '', 'None') or 'Total' in sym:
            continue
        clean_sym = sym.split('_')[0]
        sector = sector_map.get(clean_sym, 'Other')
        stock_data = {
            'symbol': sym,
            'clean_symbol': clean_sym,
            'sector': sector,
            'weight': safe_float(data.iloc[k, wt_col]) if wt_col is not None else 0,
            'beta': safe_float(data.iloc[k, beta_col]) if beta_col is not None else 0,
            'erb': safe_float(data.iloc[k, erb_col]) if erb_col is not None else 0,
            'action': str(data.iloc[k, action_col]) if action_col is not None else '',
            'status': str(data.iloc[k, status_col]) if status_col is not None else ''
        }
        stocks.append(stock_data)
    return stocks

def get_live_prices(symbols):
    """Read last 2 rows of each CSV to get today's change."""
    results = {}
    for sym in symbols:
        ticker = sym.split('_')[0]
        found = False
        for folder in ['nifty50_host', 'nifty500_host']:
            path = os.path.join(folder, sym + '.csv') if not sym.endswith('.csv') else os.path.join(folder, sym)
            if not os.path.exists(path):
                # try without extension
                path2 = os.path.join(folder, sym.replace('.csv','') + '.csv')
                if os.path.exists(path2):
                    path = path2
                else:
                    continue
            try:
                df = pd.read_csv(path).tail(2)
                df.columns = [c.lower() for c in df.columns]
                if len(df) >= 2:
                    last = df.iloc[-1]
                    prev = df.iloc[-2]
                    last_close = safe_float(last.get('close', 0))
                    prev_close = safe_float(prev.get('close', 0))
                    chg = round((last_close / prev_close - 1) * 100, 2) if prev_close > 0 else 0
                    results[sym] = {
                        'ltp': last_close,
                        'prev_close': prev_close,
                        'change_pct': chg,
                        'date': str(last.get('date', ''))
                    }
                    found = True
                    break
            except: pass
        if not found:
            results[sym] = {'ltp': 0, 'prev_close': 0, 'change_pct': 0, 'date': 'N/A'}
    return results

def get_sector_map():
    mapping = {}
    for f in ['ind_nifty50list.csv', 'ind_nifty500list.csv']:
        if not os.path.exists(f):
            continue
        df = pd.read_csv(f)
        sym_col = next((c for c in df.columns if 'Symbol' in c), None)
        ind_col = next((c for c in df.columns if 'Industry' in c or 'Sector' in c), None)
        if sym_col and ind_col:
            for _, row in df.iterrows():
                mapping[str(row[sym_col]).strip()] = str(row[ind_col]).strip()
    return mapping

def get_exec_history(xl):
    try:
        df = pd.read_excel(xl, sheet_name='Execution_History')
        df = df.fillna('')
        records = []
        for _, row in df.iterrows():
            records.append({
                'month': str(row.get('Month','')),
                'symbol': str(row.get('Symbol','')),
                'action': str(row.get('Action','')),
                'qty': int(row.get('Qty', 0)) if row.get('Qty','') != '' else 0,
                'price': safe_float(row.get('Price', 0)),
                'return': safe_float(row.get('Return', 0))
            })
        return records[-30:]  # last 30 trades
    except:
        return []

def get_stock_correlation(symbols):
    """Calculate daily return correlation matrix for the given symbols."""
    if not symbols:
        return {"symbols": [], "matrix": []}
    
    returns_map = {}
    for sym in symbols:
        found = False
        for folder in ['nifty50_host', 'nifty500_host']:
            path = os.path.join(folder, sym + '.csv') if not sym.endswith('.csv') else os.path.join(folder, sym)
            if not os.path.exists(path):
                path2 = os.path.join(folder, sym.replace('.csv','') + '.csv')
                if os.path.exists(path2): path = path2
                else: continue
            try:
                # Get last 120 days for a robust correlation
                df = pd.read_csv(path).tail(120)
                df.columns = [c.lower() for c in df.columns]
                if len(df) > 10:
                    df['ret'] = df['close'].pct_change()
                    returns_map[sym.split('_')[0]] = df['ret'].dropna()
                    found = True
                    break
            except: pass
    
    if not returns_map:
        return {"symbols": [], "matrix": []}
        
    df_ret = pd.DataFrame(returns_map).dropna(how='all').fillna(0)
    if df_ret.empty:
        return {"symbols": [], "matrix": []}
        
    corr = df_ret.corr().round(3)
    # Convert to list of lists for JSON
    return {
        "symbols": list(corr.columns),
        "matrix": corr.values.tolist()
    }

# ============================================================
# MAIN EXTRACTION
# ============================================================

sector_map = get_sector_map()
print(f"[*] Sector map loaded: {len(sector_map)} stocks")

output = {}

for universe in ['nifty50', 'nifty500']:
    fname = f"Hedge_{universe}.xlsx"
    dd_fname = f"Hedge_Institutional_Deep_Dive_{universe}.xlsx"
    
    print(f"\n[*] Processing {fname}...")
    xl = pd.ExcelFile(fname)
    
    # 1. Executive Summary (all 7 layers)
    df_exec = pd.read_excel(xl, sheet_name='Executive_Dashboard')
    exec_data = {}
    for _, row in df_exec.iterrows():
        metric = str(row['Metric']).strip()
        exec_data[metric] = {
            'Base': safe_float(row.get('Base SIM', 0)),
            'ST': safe_float(row.get('ST Filter', 0)),
            'EMA': safe_float(row.get('EMA Filter', 0)),
            'COMBO': safe_float(row.get('COMBO Filter', 0)),
            'ULTRA': safe_float(row.get('ULTRA Layer', 0)),
            'COMBO_HEDGE': safe_float(row.get('COMBO+Hedge', 0)),
            'ULTRA_HEDGE': safe_float(row.get('ULTRA Defense', 0)),
        }
    
    # 2. Monthly Summary (all returns for all layers)
    df_sum = pd.read_excel(xl, sheet_name='Detailed_Monthly_Summary')
    df_sum['Month'] = df_sum['Month'].astype(str)
    
    # Avg Ex-Ante Sharpe from the actual monthly column
    avg_ex_ante_sr = round(float(df_sum['Ex_Ante_Sharpe'].mean()), 2)
    
    # 3. Computed metrics for all 7 layers
    bench_returns = df_sum['Bench'].values
    layer_metrics = {}
    for layer in ['Base', 'ST', 'EMA', 'COMBO', 'ULTRA', 'COMBO_HEDGE', 'ULTRA_HEDGE']:
        layer_metrics[layer] = compute_metrics(df_sum[layer].values, bench_returns)
    
    # 4. Equity Curves (cumulative)
    equity_curves = get_equity_curves(df_sum)
    
    # 5. Churning Analysis
    try:
        df_churn = pd.read_excel(xl, sheet_name='Churning_Analysis')
        df_churn['Month'] = df_churn['Month'].astype(str)
        churning_data = df_churn.to_dict(orient='records')
        for row in churning_data:
            for k, v in row.items():
                if isinstance(v, float):
                    row[k] = safe_float(v)
    except:
        churning_data = []
    
    # 5. Heatmaps for all 7 layers
    heatmaps = {}
    for layer in ['Base', 'ST', 'EMA', 'COMBO', 'ULTRA', 'COMBO_HEDGE', 'ULTRA_HEDGE', 'Bench']:
        heatmaps[layer] = get_heatmap_data(df_sum, layer)
    
    # 6. Monthly detail rows
    monthly_detail = df_sum[['Month', 'Trade_Month', 'Port_Beta', 'Ex_Ante_Sharpe', 
                               'Stock_Count', 'Added', 'Removed',
                               'Base', 'ST', 'EMA', 'COMBO', 'ULTRA', 
                               'COMBO_HEDGE', 'ULTRA_HEDGE', 'Bench']].to_dict(orient='records')
    
    # Clean floats
    for row in monthly_detail:
        for k, v in row.items():
            if isinstance(v, float):
                row[k] = safe_float(v)
    
    # 7. Current Portfolio with Sector Map
    current_portfolio = get_current_portfolio(xl, sector_map)
    
    # 8. Live Prices for portfolio stocks
    symbols = [s['symbol'] for s in current_portfolio]
    live_prices = get_live_prices(symbols)
    
    # Inject live prices into portfolio
    for s in current_portfolio:
        live = live_prices.get(s['symbol'], {})
        s['ltp'] = live.get('ltp', 0)
        s['change_pct'] = live.get('change_pct', 0)
        s['prev_close'] = live.get('prev_close', 0)
        s['date'] = live.get('date', '')
    
    # 9. Execution History from Deep Dive
    exec_history = []
    if os.path.exists(dd_fname):
        xl_dd = pd.ExcelFile(dd_fname)
        exec_history = get_exec_history(xl_dd)
        # Inject sector into exec history
        for t in exec_history:
            clean = t['symbol'].split('_')[0]
            t['sector'] = sector_map.get(clean, 'Other')
    
    # 10. Stock Correlation Matrix for Current Portfolio
    stock_corr = get_stock_correlation(symbols)
    
    output[universe] = {
        'exec_summary': exec_data,
        'avg_ex_ante_sr': avg_ex_ante_sr,
        'layer_metrics': layer_metrics,
        'equity_curves': equity_curves,
        'churning_data': churning_data,
        'heatmaps': heatmaps,
        'monthly_detail': monthly_detail,
        'current_portfolio': current_portfolio,
        'exec_history': exec_history,
        'stock_correlation': stock_corr,
        'total_months': len(df_sum)
    }
    print(f"  [OK] {universe}: {len(df_sum)} months, Avg Ex-Ante Sharpe: {avg_ex_ante_sr}")

output['sector_map'] = sector_map
output['last_update'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S IST")

# Write JS data file
with open('data.js', 'w') as f:
    f.write("const DASHBOARD_DATA = ")
    json.dump(output, f, indent=2)
    f.write(";")

print("\n[OK] data.js exported successfully.")
