"""
Adapter: read the ML Forecast (NIFTY500) backtest workbook and emit ml_data.js
that adds a 'ml_forecast' universe (+ its monthly holdings) to the ProQuant site.

The ML workbook (Sharpe_ML_Forecast_NIFTY500.xlsx) uses a different layout than
the Hedge dashboard workbooks, so this maps it into the same data.js structure.

Output: <PROQUANT>/ml_data.js  ->  DASHBOARD_DATA.ml_forecast = {...};
                                   MONTHLY_HOLDINGS.ml_forecast = {...};
"""
import json
import math
import os
import re

import numpy as np
import pandas as pd

import glob

ML_DIR = os.environ.get('ML_DIR', r'D:/PC2546/portfolio')
WB = os.path.join(ML_DIR, 'Sharpe_ML_Forecast_NIFTY500.xlsx')


def _newest_current():
    """Pick the most recently modified Current_Portfolio_ML_Forecast_NIFTY500*.xlsx
    (handles the '_new' variant + future regenerations), skipping Excel lock files."""
    cands = [p for p in glob.glob(os.path.join(ML_DIR, 'Current_Portfolio_ML_Forecast_NIFTY500*.xlsx'))
             if not os.path.basename(p).startswith('~$')]
    return max(cands, key=os.path.getmtime) if cands else \
        os.path.join(ML_DIR, 'Current_Portfolio_ML_Forecast_NIFTY500_new.xlsx')


CURRENT = _newest_current()
OUT = os.environ.get('ML_OUT', r'd:/SQE-ProQuant-host/ml_data.js')
RF = 0.06


def num(v):
    try:
        f = float(v)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def compute_metrics(r, b):
    r = pd.Series([x for x in r if x is not None], dtype=float)
    b = pd.Series([x for x in b if x is not None], dtype=float)
    if len(r) == 0:
        return {}
    n = len(r)
    equity = (1 + r).cumprod()
    cagr = float(equity.iloc[-1]) ** (12 / n) - 1
    vol = r.std() * np.sqrt(12)
    sharpe = (cagr - RF) / vol if vol > 0 else 0
    mdd = float((equity / equity.cummax() - 1).min())
    downside = r[r < 0].std() * np.sqrt(12)
    sortino = (cagr - RF) / downside if downside > 0 else 0
    calmar = cagr / abs(mdd) if mdd != 0 else 0
    wins = int((r > 0).sum())
    win_rate = wins / n
    avg_gain = float(r[r > 0].mean()) if wins > 0 else 0
    avg_loss = float(r[r < 0].mean()) if int((r < 0).sum()) > 0 else 0
    alpha = cagr - b.mean() * 12 if len(b) else 0
    return {
        "CAGR": round(cagr * 100, 2), "Volatility": round(vol * 100, 2),
        "Sharpe": round(sharpe, 2), "Sortino": round(sortino, 2),
        "Calmar": round(calmar, 2), "Max_DD": round(mdd * 100, 2),
        "Win_Rate": round(win_rate * 100, 1), "Avg_Gain": round(avg_gain * 100, 2),
        "Avg_Loss": round(avg_loss * 100, 2), "Alpha": round(alpha * 100, 2),
        "Total_Return": round((float(equity.iloc[-1]) - 1) * 100, 2),
    }


def read_monthly():
    """Parse the 'Summary FULL' monthly table -> list of month dicts."""
    raw = pd.read_excel(WB, sheet_name='Summary FULL', header=None)
    # find the monthly-table header row (has 'Trade' and 'Month')
    hdr = next(i for i in range(len(raw))
               if 'Trade' in str(raw.iloc[i, 1]) and 'Month' in str(raw.iloc[i, 0]))
    rows = []
    for i in range(hdr + 1, len(raw)):
        trade = str(raw.iloc[i, 1]).strip()
        if not re.fullmatch(r'\d{4}-\d{2}', trade):
            continue
        rows.append({
            'Month': trade,
            'Stock_Count': num(raw.iloc[i, 2]) or 0,
            'Added': num(raw.iloc[i, 3]) or 0,
            'Removed': num(raw.iloc[i, 4]) or 0,
            'Port_Beta': round(num(raw.iloc[i, 6]) or 0, 4),
            'Base': num(raw.iloc[i, 10]),         # Port Return %
            'Bench': num(raw.iloc[i, 11]),        # Bench Return %
            'Ex_Ante_Sharpe': round(num(raw.iloc[i, 15]) or 0, 4),
        })
    return rows


def read_holdings():
    """Per-month holdings from PM_ sheets + a symbol->sector map."""
    xl = pd.ExcelFile(WB)
    pm_sheets = sorted(s for s in xl.sheet_names if re.fullmatch(r'PM_\d{4}-\d{2}', s))
    holdings, sector_map = {}, {}
    # PM_YYYY-MM is the portfolio FORMED for month YYYY-MM, traded the next month.
    for sh in pm_sheets:
        df = pd.read_excel(xl, sheet_name=sh, header=11)
        if 'Symbol' not in df.columns:
            continue
        wcol = next((c for c in df.columns if 'Capped' in str(c)), None)
        trade = None  # derive trade month = port month + 1
        pm = sh.replace('PM_', '')
        y, m = int(pm[:4]), int(pm[5:7])
        m += 1
        if m > 12:
            m = 1; y += 1
        trade = f'{y:04d}-{m:02d}'
        rows = []
        for _, r in df.iterrows():
            sym = str(r.get('Symbol', '')).strip()
            if not sym or sym.lower() == 'nan':
                continue
            w = num(r.get(wcol)) if wcol else None
            sec = str(r.get('Sector', '')).strip() or '—'
            sector_map[sym] = sec
            rows.append({
                's': sym, 'sec': sec,
                'w': round(w, 2) if w is not None else None,
                'p': None, 'r': None,
                'st': str(r.get('Status', '')).strip() or '—',
                'a': '—',
                'b': round(num(r.get('Beta')) or 0, 3),
                'e': round(num(r.get('ERB')) or 0, 3),
            })
        rows.sort(key=lambda x: x['w'] or 0, reverse=True)
        holdings[trade] = rows
    return holdings, sector_map


def read_current(sector_map):
    df = pd.read_excel(CURRENT, sheet_name=0, header=2)
    out = []
    for _, r in df.iterrows():
        sym = str(r.get('Symbol', '')).strip()
        if not sym or sym.lower() == 'nan':
            continue
        w = num(r.get('Target Weight %'))
        prev_qty = num(r.get('Prev Qty')) or 0
        out.append({
            'symbol': sym, 'clean_symbol': sym,
            'sector': sector_map.get(sym, 'Other'),
            'weight': round(w, 6) if w is not None else 0,
            'action': str(r.get('Action', '')).strip() or 'HOLD',
            'status': 'Added' if prev_qty == 0 else 'Remained',
            'ltp': round(num(r.get('Current Price (Rs.)')) or 0, 2),
            'change_pct': 0, 'mtd_change_pct': 0, 'prev_close': 0,
            'date': '',
        })
    return out


def main():
    months = read_monthly()
    holdings, sector_map = read_holdings()
    current = read_current(sector_map)

    base = [m['Base'] for m in months]
    bench = [m['Bench'] for m in months]
    lm_base = compute_metrics(base, bench)
    lm_bench = compute_metrics(bench, bench)
    lm_bench['Alpha'] = 0.0

    # Equity curves (cumulative growth, seeded at 1.0 like the dashboard)
    eq_base, eq_bench, cb, cn = [], [], 1.0, 1.0
    for m in months:
        cb *= (1 + (m['Base'] or 0)); cn *= (1 + (m['Bench'] or 0))
        eq_base.append(round(cb, 4)); eq_bench.append(round(cn, 4))

    EX = ['CAGR', 'Volatility', 'Sharpe', 'Sortino', 'Calmar', 'Max Drawdown',
          'Win Rate', 'Avg Gain', 'Avg Loss', 'Alpha vs Bench', 'Abs Return']
    keymap = {'CAGR': 'CAGR', 'Volatility': 'Volatility', 'Sharpe': 'Sharpe',
              'Sortino': 'Sortino', 'Calmar': 'Calmar', 'Max Drawdown': 'Max_DD',
              'Win Rate': 'Win_Rate', 'Avg Gain': 'Avg_Gain', 'Avg Loss': 'Avg_Loss',
              'Alpha vs Bench': 'Alpha', 'Abs Return': 'Total_Return'}
    pct = {'CAGR', 'Volatility', 'Max Drawdown', 'Avg Gain', 'Avg Loss',
           'Alpha vs Bench', 'Abs Return'}
    exec_summary = {}
    for label in EX:
        k = keymap[label]
        bv = lm_base.get(k, 0); nv = lm_bench.get(k, 0)
        # exec_summary values are fractional for % metrics, raw for ratios
        exec_summary[label] = {
            'Base': (bv / 100 if label in pct else bv),
            'Bench': (nv / 100 if label in pct else nv),
        }

    universe = {
        'exec_summary': exec_summary,
        'avg_ex_ante_sr': round(np.mean([m['Ex_Ante_Sharpe'] for m in months]), 2),
        'layer_metrics': {'Base': lm_base, 'Bench': lm_bench},
        'equity_curves': {'months': [m['Month'] for m in months],
                          'Base': eq_base, 'Bench': eq_bench},
        'churning_data': [{'Month': m['Month'], 'Stock_Count': m['Stock_Count'],
                           'Base Add': m['Added'], 'Base Rem': m['Removed']}
                          for m in months],
        'heatmaps': {},
        'monthly_detail': months,
        'current_portfolio': current,
        'exec_history': [],
        'stock_correlation': {'symbols': [], 'matrix': []},
        'total_months': len(months),
        'live_performance': {'portfolio_ret': 0, 'benchmark_ret': 0, 'alpha': 0,
                             'portfolio_mtd': 0, 'benchmark_mtd': 0, 'alpha_mtd': 0,
                             'indicator': 'up'},
    }

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('/* ML Forecast (NIFTY500) universe + holdings. Auto-generated. */\n')
        f.write('DASHBOARD_DATA.ml_forecast = ' + json.dumps(universe, separators=(',', ':'), ensure_ascii=False) + ';\n')
        f.write("if (typeof MONTHLY_HOLDINGS !== 'undefined') MONTHLY_HOLDINGS.ml_forecast = "
                + json.dumps(holdings, separators=(',', ':'), ensure_ascii=False) + ';\n')
    print(f'[ml] {len(months)} months ({months[0]["Month"]}->{months[-1]["Month"]}), '
          f'{len(holdings)} holding months, {len(current)} current holdings -> {OUT}')
    print(f'[ml] CAGR={lm_base.get("CAGR")}% Sharpe={lm_base.get("Sharpe")} MaxDD={lm_base.get("Max_DD")}%')


if __name__ == '__main__':
    main()
