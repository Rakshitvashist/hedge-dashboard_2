import pandas as pd
import json
import os
import numpy as np
from datetime import datetime

def get_sheet_data(file_path):
    xl = pd.ExcelFile(file_path)
    data = {}
    
    # 1. Time Series
    df_ts = pd.read_excel(xl, sheet_name='Time_Series_Analytics')
    data['time_series'] = df_ts.to_dict(orient='records')
    
    # Calculate Summary from TS
    equity = df_ts['Equity_Ultra_H'].values
    returns = df_ts['Equity_Ultra_H'].pct_change().dropna()
    total_months = len(df_ts)
    cagr = (equity[-1] / equity[0]) ** (12 / total_months) - 1
    vol = returns.std() * np.sqrt(12)
    sharpe = cagr / vol if vol != 0 else 0
    mdd = (df_ts['Equity_Ultra_H'] / df_ts['Equity_Ultra_H'].cummax() - 1).min()
    
    data['summary'] = {
        'CAGR': f"{cagr:.2%}",
        'Sharpe': f"{sharpe:.2f}",
        'Max_Drawdown': f"{mdd:.2%}",
        'Total_Return': f"{(equity[-1]-1):.2%}"
    }
    
    # 2. Heatmap (Ultra Hedge)
    df_heat = pd.read_excel(xl, sheet_name='Heatmap_ULTRA_HEDGE')
    df_heat = df_heat.dropna(how='all', axis=0).dropna(how='all', axis=1)
    data['heatmap'] = df_heat.to_dict(orient='records')
    
    # 3. Execution History (Recent Trades)
    df_exec = pd.read_excel(xl, sheet_name='Execution_History')
    data['trades'] = df_exec.tail(20).to_dict(orient='records')
    
    # Latest holdings for Live Monitoring
    latest_month = df_exec['Month'].iloc[-1]
    latest_holdings = df_exec[df_exec['Month'] == latest_month]
    data['holdings'] = latest_holdings[['Symbol', 'Qty']].to_dict(orient='records')
    
    return data

def get_live_stock_data(symbols, folders=['nifty50_host', 'nifty500_host']):
    live_results = {}
    for sym in symbols:
        ticker = sym
        if not ticker.endswith('.csv'):
            ticker_file = f"{ticker}.csv"
        else:
            ticker_file = ticker
            
        found = False
        for folder in folders:
            path = os.path.join(folder, ticker_file)
            if os.path.exists(path):
                try:
                    df = pd.read_csv(path).tail(2)
                    if len(df) == 2:
                        last_close = df['Close'].iloc[-1]
                        prev_close = df['Close'].iloc[-2]
                        change = (last_close / prev_close) - 1
                        live_results[sym] = {
                            'last_price': round(last_close, 2),
                            'change_pct': round(change * 100, 2),
                            'date': df['Date'].iloc[-1]
                        }
                        found = True
                        break
                except: pass
        if not found:
            live_results[sym] = {'last_price': 0, 'change_pct': 0, 'date': 'N/A'}
    return live_results

def get_sector_map():
    mapping = {}
    for f in ['ind_nifty50list.csv', 'ind_nifty500list.csv']:
        if os.path.exists(f):
            df = pd.read_csv(f)
            sym_col = next((c for c in df.columns if 'Symbol' in c), None)
            ind_col = next((c for c in df.columns if 'Industry' in c or 'Sector' in c), None)
            if sym_col and ind_col:
                for _, row in df.iterrows():
                    mapping[row[sym_col]] = row[ind_col]
    return mapping

# Process both reports
print("[*] Extracting Nifty 50 data...")
data_50 = get_sheet_data('Hedge_Institutional_Deep_Dive_nifty50.xlsx')
print("[*] Extracting Nifty 500 data...")
data_500 = get_sheet_data('Hedge_Institutional_Deep_Dive_nifty500.xlsx')

# Get Live daily updates for current holdings
all_holding_symbols = list(set([h['Symbol'] for h in data_50['holdings']] + [h['Symbol'] for h in data_500['holdings']]))
live_stock_data = get_live_stock_data(all_holding_symbols)

sector_map = get_sector_map()

final_data = {
    'nifty50': data_50,
    'nifty500': data_500,
    'live_stock_data': live_stock_data,
    'sector_map': sector_map,
    'last_update': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
}

with open('data.js', 'w') as f:
    f.write("const DASHBOARD_DATA = ")
    json.dump(final_data, f, indent=2)
    f.write(";")

print("✅ Dashboard data updated successfully with LIVE daily changes.")
