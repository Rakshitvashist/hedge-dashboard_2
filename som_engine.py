"""
som_engine.py — SOM (Sharpe Single-Index Model) backtester engine, extracted from
SOM.py into a callable function so it can be run on different universes.

The math here is a faithful copy of SOM.py's walk-forward loop and metrics
(beta / residual variance / ERB ranking / Ci cutoff / capped weights / carry-forward
PNL / transaction costs / Sharpe-Sortino-Calmar). Two additions vs SOM.py:

  * stock_folders : load the universe from one OR MORE folders
  * membership    : optional dict {trade_month_str -> set(symbols)} restricting which
                    stocks are eligible to be HELD that month (point-in-time index
                    membership). None  -> every loaded stock is always eligible
                    (the survivorship / current-basket case).

run_som(...) returns a dict: monthly_summary (DataFrame), metrics (dict), churn_df.
"""
import os
from pathlib import Path
import numpy as np
import pandas as pd

EPSILON = 1e-10


# ── helpers (verbatim from SOM.py) ──────────────────────────────────────────
def read_daily_csv(file_path):
    try:
        df = pd.read_csv(file_path)
    except Exception:
        df = pd.read_csv(file_path, sep='\t')
    df.columns = df.columns.str.strip().str.lower()
    for variant in ['date', 'time', 'timestamp', 'datetime', 'trade_date', 'trading_date', 'day', 'period']:
        if variant in df.columns:
            df.rename(columns={variant: 'time'}, inplace=True)
            break
    if 'price' in df.columns and 'close' not in df.columns:
        df.rename(columns={'price': 'close'}, inplace=True)
    if 'time' not in df.columns:
        raise ValueError(f"No date column found in {file_path}")
    orig_time = df['time'].copy()
    df['time'] = pd.to_datetime(orig_time, format='%Y-%m-%d', errors='coerce')
    mask = df['time'].isna()
    if mask.any():
        sample = orig_time[mask].astype(str).head(10)
        has_hyphen = sample.str.contains('-').any()
        df.loc[mask, 'time'] = pd.to_datetime(orig_time[mask], dayfirst=has_hyphen, errors='coerce')
    for col in ['open', 'high', 'low', 'close', 'volume']:
        if col in df.columns:
            df[col] = (df[col].astype(str).str.replace(',', '', regex=False)
                       .pipe(pd.to_numeric, errors='coerce'))
    df = df.dropna(subset=['time', 'close']).sort_values('time').reset_index(drop=True)
    return df


def resample_to_monthly(daily_df):
    df = daily_df.set_index('time')
    agg = {k: v for k, v in {'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'}.items()
           if k in df.columns}
    monthly = df.resample('ME').agg(agg).reset_index()
    monthly['year_month'] = monthly['time'].dt.to_period('M')
    monthly['return'] = monthly['close'].pct_change().fillna(0)
    monthly['Monthly Returns'] = monthly['return'] * 100
    return monthly.set_index('year_month').sort_index()


def calculate_avg_price(previous_avg_price, previous_qty, current_qty, open_price):
    if current_qty == 0:
        return 0.0
    if previous_qty == 0:
        return open_price
    if current_qty <= previous_qty:
        return previous_avg_price
    added = current_qty - previous_qty
    return (previous_avg_price * previous_qty + open_price * added) / current_qty


def cap_weights_iterative(raw_weights, cap, max_iter=1000):
    w = np.array(raw_weights, dtype=float).copy()
    for _ in range(max_iter):
        over = w > cap
        if not over.any():
            break
        excess = (w[over] - cap).sum()
        w[over] = cap
        under = ~over
        if not under.any():
            break
        under_sum = w[under].sum()
        if under_sum > EPSILON:
            w[under] += excess * (w[under] / under_sum)
    total = w.sum()
    if total > EPSILON:
        w = w / total
    return w


def _clean_name(stem):
    """Map a file stem (e.g. ADANIENT_1d_max) to a clean ticker (ADANIENT)."""
    return stem.replace('_1d_max', '').replace('_1d', '').strip()


# ── engine ──────────────────────────────────────────────────────────────────
def run_som(stock_folders, bench_file, bond_file, start_month, end_month,
            membership=None, beta_window=60, min_obs=2, max_weight=0.10,
            investment=10_000_000, txn_cost_rate=0.002, label="", verbose=True):
    if isinstance(stock_folders, str):
        stock_folders = [stock_folders]

    # benchmark + risk-free
    bench_daily = read_daily_csv(bench_file)
    bench_monthly = resample_to_monthly(bench_daily)
    bench_daily_idx = bench_daily.set_index('time').sort_index()
    bench_daily_idx['return'] = bench_daily_idx['close'].pct_change()

    bond_monthly = resample_to_monthly(read_daily_csv(bond_file))

    # stocks (first folder wins on duplicate ticker -> current prices preferred)
    all_stocks, all_stocks_daily = {}, {}
    for folder in stock_folders:
        if not os.path.isdir(folder):
            continue
        for file in sorted(f for f in os.listdir(folder) if f.lower().endswith('.csv')):
            name = _clean_name(Path(file).stem)
            if name in all_stocks:
                continue
            try:
                daily = read_daily_csv(os.path.join(folder, file))
                all_stocks[name] = resample_to_monthly(daily)
                all_stocks_daily[name] = daily.set_index('time')
            except Exception:
                pass
    if verbose:
        print(f"[{label}] loaded {len(all_stocks)} stocks from {stock_folders}")

    all_port_months = pd.period_range(start=start_month, end=end_month, freq='M')
    monthly_portfolios, churn_records, skipped = [], [], []
    port_state = {}

    for port_month in all_port_months:
        trade_month = port_month + 1

        if port_month not in bond_monthly.index:
            skipped.append((str(port_month), "RF missing")); continue
        risk_free_rate = float(bond_monthly.loc[port_month, 'close']) / 100.0

        bench_window = bench_monthly[bench_monthly.index <= port_month].tail(beta_window)
        if len(bench_window) < min_obs:
            skipped.append((str(port_month), "bench short")); continue
        bench_var_annual = bench_window['return'].var(ddof=1) * 12
        if pd.isna(bench_var_annual) or bench_var_annual < EPSILON:
            skipped.append((str(port_month), "bench var")); continue

        # point-in-time eligibility for the month we will HOLD (trade_month)
        eligible = membership.get(str(trade_month)) if membership is not None else None

        records = []
        for symbol, stock_monthly in all_stocks.items():
            if eligible is not None and symbol not in eligible:
                continue
            stock_hist = stock_monthly[stock_monthly.index <= port_month]
            stock_window = stock_hist.tail(min(beta_window, len(stock_hist)))
            common_idx = stock_window.index.intersection(bench_window.index)
            use_daily = len(common_idx) < min_obs

            if use_daily:
                s_daily = all_stocks_daily.get(symbol, pd.DataFrame())
                if s_daily.empty:
                    continue
                s_daily_hist = s_daily[s_daily.index <= port_month.to_timestamp(how='end')]
                if len(s_daily_hist) < 5:
                    continue
                s_returns = s_daily_hist['close'].pct_change().dropna()
                m_returns = bench_daily_idx['return'].reindex(s_returns.index).dropna()
                cid = s_returns.index.intersection(m_returns.index)
                if len(cid) < 5:
                    continue
                stock_returns = s_returns.loc[cid].values
                market_returns = m_returns.loc[cid].values
                ann_factor, obs_count = 252, len(cid)
            else:
                stock_returns = stock_window.loc[common_idx, 'return'].values
                market_returns = bench_window.loc[common_idx, 'return'].values
                ann_factor, obs_count = 12, len(common_idx)

            cov = np.cov(stock_returns, market_returns, ddof=1)
            covariance, market_variance = cov[0, 1], cov[1, 1]
            if market_variance < EPSILON:
                continue
            beta = covariance / market_variance
            if pd.isna(beta) or beta <= 0:
                continue
            alpha = stock_returns.mean() - beta * market_returns.mean()
            residuals = stock_returns - (alpha + beta * market_returns)
            stock_variance = np.var(residuals, ddof=1) * ann_factor
            if pd.isna(stock_variance) or stock_variance < EPSILON:
                continue
            annual_ret = stock_returns.mean() * ann_factor

            if trade_month in stock_monthly.index:
                trade_row = stock_monthly.loc[trade_month]
                buy_price = trade_row.get('open', np.nan)
                sell_price = trade_row.get('close', np.nan)
                if pd.isna(buy_price) or buy_price <= 0:
                    buy_price = stock_hist['close'].iloc[-1]
                if pd.isna(sell_price):
                    sell_price = buy_price
                trade_data_exists = True
            else:
                buy_price = stock_hist['close'].iloc[-1]
                sell_price = buy_price
                trade_data_exists = False
            if pd.isna(buy_price) or buy_price <= 0:
                continue

            records.append({'symbol': symbol, 'beta': beta, 'annual_ret': annual_ret,
                            'sigma2': stock_variance, 'erb': (annual_ret - risk_free_rate) / beta,
                            'n_obs': obs_count, 'buy_price': buy_price, 'sell_price': sell_price,
                            'trade_data_exists': trade_data_exists})

        if not records:
            skipped.append((str(port_month), "no qualified")); continue

        df_s = pd.DataFrame(records).sort_values('erb', ascending=False).reset_index(drop=True)
        df_s['A'] = ((df_s['annual_ret'] - risk_free_rate) * df_s['beta']) / df_s['sigma2']
        df_s['H'] = df_s['beta'] ** 2 / df_s['sigma2']
        df_s['cum_A'] = df_s['A'].cumsum()
        df_s['cum_H'] = df_s['H'].cumsum()
        denom = 1 + bench_var_annual * df_s['cum_H']
        if (denom.abs() < EPSILON).any():
            skipped.append((str(port_month), "Ci denom")); continue
        df_s['Ci'] = (bench_var_annual * df_s['cum_A']) / denom
        if df_s['Ci'].isna().all():
            skipped.append((str(port_month), "Ci nan")); continue
        cutoff_pos = int(df_s['Ci'].idxmax())
        C_star = float(df_s.loc[cutoff_pos, 'Ci'])
        n_selected = cutoff_pos + 1

        sel = df_s.iloc[:n_selected].copy()
        sel['Zi'] = ((sel['beta'] / sel['sigma2']) * (sel['erb'] - C_star)).clip(lower=0)
        Z_sum = sel['Zi'].sum()
        if Z_sum < EPSILON:
            skipped.append((str(port_month), "Z_sum~0")); continue
        sel['wi_raw'] = sel['Zi'] / Z_sum
        sel['wi'] = cap_weights_iterative(sel['wi_raw'].values, max_weight)
        sel['allocation'] = investment * sel['wi']
        sel['qty'] = np.floor(sel['allocation'] / sel['buy_price']).astype(int)
        sel = sel[sel['qty'] > 0].copy()
        if sel.empty:
            skipped.append((str(port_month), "qty=0")); continue

        # ex-ante stats (daily)
        selected_symbols = sel['symbol'].tolist()
        weights = sel['wi'].values
        end_date_limit = port_month.to_timestamp(how='end')
        rdl = []
        for sym in selected_symbols:
            if sym in all_stocks_daily:
                sh = all_stocks_daily[sym][all_stocks_daily[sym].index <= end_date_limit].tail(beta_window * 21)
                rdl.append(sh['close'].pct_change().rename(sym))
        if rdl:
            ret_matrix = pd.concat(rdl, axis=1).dropna()
            if not ret_matrix.empty and len(ret_matrix) >= 5:
                cov_mat_annual = ret_matrix.cov() * 252
                port_variance = weights.T @ cov_mat_annual.values @ weights
                ex_ante_vol = np.sqrt(max(0, port_variance))
                port_exp_ret = (sel['annual_ret'] * sel['wi']).sum()
                ex_ante_sr = (port_exp_ret - risk_free_rate) / ex_ante_vol if ex_ante_vol > EPSILON else 0.0
            else:
                ex_ante_vol, ex_ante_sr = 0.0, 0.0
        else:
            ex_ante_vol, ex_ante_sr = 0.0, 0.0
        sel['ex_ante_vol'] = ex_ante_vol
        sel['ex_ante_sharpe'] = ex_ante_sr
        sel['port_beta'] = (sel['beta'] * sel['wi']).sum()

        # churning + carry-forward
        target_stocks = set(sel['symbol'].tolist())
        prev_stocks = set(port_state.keys())
        added_list = sorted(target_stocks - prev_stocks)
        removed_list = sorted(prev_stocks - target_stocks)
        remained_list = sorted(target_stocks & prev_stocks)
        churn_records.append({'port_month': str(port_month), 'trade_month': str(trade_month),
                              'added_count': len(added_list), 'removed_count': len(removed_list),
                              'remained_count': len(remained_list),
                              'added_symbols': ", ".join(added_list),
                              'removed_symbols': ", ".join(removed_list),
                              'total_stocks': len(target_stocks)})

        sel['prev_qty'] = sel['symbol'].map(lambda x: port_state.get(x, {}).get('qty', 0))
        sel['prev_avg_price'] = sel['symbol'].map(lambda x: port_state.get(x, {}).get('avg_price', 0.0))
        sel['prev_last_close'] = sel['symbol'].map(lambda x: port_state.get(x, {}).get('last_close', 0.0))
        sel['delta_qty'] = sel['qty'] - sel['prev_qty']
        sel['avg_price'] = sel.apply(
            lambda r: calculate_avg_price(r['prev_avg_price'], r['prev_qty'], r['qty'], r['buy_price'])
            if r['qty'] > r['prev_qty'] else (r['prev_avg_price'] if r['prev_qty'] > 0 else r['buy_price']),
            axis=1)
        sel.loc[sel['prev_qty'] == 0, 'prev_last_close'] = sel.loc[sel['prev_qty'] == 0, 'buy_price']
        sel['gap_pnl'] = (sel['buy_price'] - sel['prev_last_close']) * sel['prev_qty']
        sel['current_pnl'] = (sel['sell_price'] - sel['buy_price']) * sel['qty']

        current_removed_pnl, exit_value_removed = 0.0, 0.0
        for sym in removed_list:
            if sym in port_state and trade_month in all_stocks[sym].index:
                exit_price = all_stocks[sym].loc[trade_month, 'open']
                st = port_state[sym]
                current_removed_pnl += (exit_price - st['last_close']) * st['qty']
                exit_value_removed += st['qty'] * exit_price

        sel['removed_pnl'] = current_removed_pnl
        sel['gross_pnl'] = sel['gap_pnl'] + sel['current_pnl']
        sel['invest'] = sel['avg_price'] * sel['qty']
        sel['exit_val'] = sel['qty'] * sel['sell_price']

        entry_value = (sel['delta_qty'].clip(lower=0) * sel['buy_price']).sum()
        reduction_value = (sel['delta_qty'].clip(upper=0).abs() * sel['buy_price']).sum()
        total_txn_cost = (entry_value + exit_value_removed + reduction_value) * txn_cost_rate
        sel['cost'] = total_txn_cost * (sel['invest'] / sel['invest'].sum()) if sel['invest'].sum() > 0 else 0

        if not sel['trade_data_exists'].iloc[0]:
            for c in ['gross_pnl', 'gap_pnl', 'current_pnl', 'removed_pnl', 'cost']:
                sel[c] = 0.0
            total_txn_cost, current_removed_pnl = 0.0, 0.0
            sel['removed_pnl'] = 0.0

        sel['net_pnl'] = sel['gross_pnl'] - sel['cost']

        for _, row in sel.iterrows():
            port_state[row['symbol']] = {'qty': row['qty'], 'avg_price': row['avg_price'],
                                         'last_close': row['sell_price'], 'buy_price': row['buy_price']}
        for sym in removed_list:
            port_state.pop(sym, None)

        sel['port_month'] = str(port_month)
        sel['trade_month'] = str(trade_month)
        sel['rf_rate'] = risk_free_rate
        sel['added_count'] = len(added_list)
        sel['removed_count'] = len(removed_list)
        sel['added_symbols'] = ", ".join(added_list)
        sel['removed_symbols'] = ", ".join(removed_list)
        sel['bench_trade_ret'] = bench_monthly.loc[trade_month, 'return'] if trade_month in bench_monthly.index else 0.0
        monthly_portfolios.append(sel)

    if not monthly_portfolios:
        raise RuntimeError(f"[{label}] no valid portfolios generated")

    # ── metrics (verbatim from SOM.py) ──
    combined = pd.concat(monthly_portfolios, ignore_index=True)
    ms = (combined.groupby('port_month').agg(
        trade_month=('trade_month', 'first'), n_stocks=('symbol', 'count'),
        rf_rate=('rf_rate', 'first'), bench_ret=('bench_trade_ret', 'first'),
        invest=('invest', 'sum'), exit_val=('exit_val', 'sum'),
        gross_pnl=('gross_pnl', 'sum'), removed_pnl=('removed_pnl', 'first'),
        cost=('cost', 'sum'), ex_ante_vol=('ex_ante_vol', 'first'),
        ex_ante_sr=('ex_ante_sharpe', 'first'), port_beta=('port_beta', 'first'),
        added_count=('added_count', 'first'), removed_count=('removed_count', 'first'),
        added_symbols=('added_symbols', 'first'), removed_symbols=('removed_symbols', 'first'),
    ).reset_index())

    ms['net_pnl'] = ms['gross_pnl'] + ms['removed_pnl'] - ms['cost']
    ms['return_pct'] = ms['net_pnl'] / investment
    ms['cumulative_pnl'] = ms['net_pnl'].cumsum()
    ms['cumulative_ret'] = (1 + ms['return_pct']).cumprod() - 1
    ms['bench_cum_ret'] = (1 + ms['bench_ret']).cumprod() - 1
    ms['alpha'] = ms['return_pct'] - ms['bench_ret']
    ms['compounded_cap'] = investment * (1 + ms['cumulative_ret'])

    total_months = len(ms)
    if total_months > 1:
        cm = np.cov(ms['return_pct'], ms['bench_ret'], ddof=1)
        realized_beta = cm[0, 1] / cm[1, 1] if cm[1, 1] > EPSILON else 0.0
    else:
        realized_beta = 0.0
    ann_return = (1 + ms['cumulative_ret'].iloc[-1]) ** (12 / total_months) - 1
    volatility = ms['return_pct'].std() * (12 ** 0.5)
    ms['excess_return'] = ms['return_pct'] - (ms['rf_rate'] / 12)
    excess_ann = ms['excess_return'].mean() * 12
    sharpe = excess_ann / volatility if volatility > EPSILON else 0.0
    wealth = pd.concat([pd.Series([1.0]), 1 + ms['cumulative_ret']])
    max_dd = ((wealth - wealth.cummax()) / wealth.cummax()).min()
    dn = ms['excess_return'][ms['excess_return'] < 0]
    downside_dev = np.sqrt(np.mean(dn ** 2)) * np.sqrt(12) if len(dn) else np.nan
    sortino = excess_ann / downside_dev if downside_dev and downside_dev > EPSILON else np.nan
    calmar = ann_return / abs(max_dd) if abs(max_dd) > EPSILON else np.nan
    bench_ann = (1 + ms['bench_cum_ret'].iloc[-1]) ** (12 / total_months) - 1

    metrics = {
        'label': label, 'months': total_months,
        'period': f"{ms['trade_month'].iloc[0]} -> {ms['trade_month'].iloc[-1]}",
        'total_net_pnl': ms['net_pnl'].sum(),
        'total_return': ms['cumulative_ret'].iloc[-1],
        'ann_return': ann_return, 'volatility': volatility,
        'sharpe': sharpe, 'sortino': sortino, 'calmar': calmar,
        'max_drawdown': max_dd, 'realized_beta': realized_beta,
        'bench_total_return': ms['bench_cum_ret'].iloc[-1], 'bench_ann_return': bench_ann,
        'win_rate': (ms['net_pnl'] > 0).mean(),
        'avg_stocks': ms['n_stocks'].mean(), 'final_capital': ms['compounded_cap'].iloc[-1],
        'investment': investment,
    }
    return {'monthly_summary': ms, 'metrics': metrics, 'churn_df': pd.DataFrame(churn_records)}
