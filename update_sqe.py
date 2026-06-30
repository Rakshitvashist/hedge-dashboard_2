"""
Update pipeline for the SQE All-Indices site (Smcresearch/SQE-).

Keeps the SQE site's DATA in sync with the source workbook in one command, so
data.js and holdings.js can never drift apart. It ONLY touches the two data
files — the SQE site's customised app.js / index.html / style.css are never
overwritten.

Steps (all from the same source state -> no data mismatch):
  1. (--extract) refresh per-stock price CSVs from yfinance so live prices are
     current: data_set_nifty5.py, data_set_nifty500.py, update_stocks.py
  2. (--extract) re-run the 3 backtests (som_hedge.py) with START_MONTH=2019-12
     so the SQE site keeps its earlier history, then regenerate data.js via
     extract_dashboard_data.py
  3. regenerate holdings.js via build_holdings.py   (reads the same workbook)
  4. copy data.js into the SQE site
  5. commit & push the SQE repo (its pre-commit hook bumps the cache-bust ?v=)

The backtest start is SQE-only: som_hedge.py defaults to 2021-04 (the main
dashboard's daily run), and this pipeline overrides START_MONTH=2019-12, so the
two dashboards stay independent.

Usage:
  python update_sqe.py --prices   # NEWEST DATA: refresh latest prices -> push both
  python update_sqe.py --extract  # NEW MONTH: prices -> backtests -> push both
  python update_sqe.py            # quick: just regenerate from workbooks -> push both

--prices is the routine "add the newest data" command: the yfinance scripts are
incremental (append only new days, never re-fetch old data), so it just brings
the live prices up to date and pushes both sites (~5-10 min, no backtest).
--extract additionally re-runs the backtests; use it once a new month closes and
a new portfolio is formed (~30-60 min). Both leave history unchanged — past
months are deterministic.
"""
import os
import re
import shutil
import subprocess
import sys

MAIN = os.path.dirname(os.path.abspath(__file__))   # the main repo (this folder)

# Both SQE sites share the same data.js (all universes). Each site's holdings.js
# is generated from its workbook(s): a single 'workbook' -> flat MONTHLY_HOLDINGS;
# a 'holdings_map' (univ:workbook,...) -> MONTHLY_HOLDINGS keyed by universe
# (multi-universe site).
SITES = [
    {'name': 'All-Indices', 'dir': os.environ.get('SQE_HOST', r'd:/SQE-host'),
     'workbook': 'Hedge_Pro_Summary_759.xlsx'},
    {'name': 'ProQuant',    'dir': os.environ.get('PROQUANT_HOST', r'd:/SQE-ProQuant-host'),
     'holdings_map': 'nifty500:Hedge_nifty500.xlsx,total759:Hedge_Pro_Summary_759.xlsx'},
]

# The SQE site backtests from an earlier start than the main dashboard (which
# defaults to 2021-04). 2019-12 -> first held portfolio Jan 2020.
SQE_START_MONTH = '2019-12'

# (env for STOCKS_FOLDER, BENCHMARK_FILE, OUTPUT_FILE, DEEP_DIVE_FILE) per universe
BACKTESTS = [
    ('nifty50_host',  'NIFTY50_1d.csv',  'Hedge_nifty50.xlsx',          'Hedge_Institutional_Deep_Dive_nifty50.xlsx'),
    ('nifty500_host', 'NIFTY500_1d.csv', 'Hedge_nifty500.xlsx',         'Hedge_Institutional_Deep_Dive_nifty500.xlsx'),
    ('TOTAL_STOCKS',  'NIFTY500_1d.csv', 'Hedge_Pro_Summary_759.xlsx',  'Hedge_Institutional_Deep_Dive_759.xlsx'),
]


def run(cmd, cwd=None, check=True, env=None):
    print('   $', ' '.join(cmd))
    return subprocess.run(cmd, cwd=cwd, check=check, env=env)


def data_last_update(path):
    # last_update sits at the END of data.js, so read the tail of the file.
    try:
        with open(path, 'rb') as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - 4000))
            tail = f.read().decode('utf-8', 'ignore')
        m = re.search(r'"last_update"\s*:\s*"([^"]+)"', tail)
        return m.group(1) if m else 'unknown'
    except OSError:
        return 'unknown'


def main():
    extract = '--extract' in sys.argv   # full: prices + backtests
    prices = '--prices' in sys.argv     # light: latest prices only, no backtest

    if not os.path.isdir(MAIN):
        sys.exit(f'[error] path not found: {MAIN}')
    sites = [s for s in SITES if os.path.isdir(os.path.join(s['dir'], '.git'))]
    for s in SITES:
        if s not in sites:
            print(f"   [warn] skipping {s['name']}: {s['dir']} is not a git repo")
    if not sites:
        sys.exit('[error] no SQE site repos found')

    py = sys.executable

    if extract or prices:
        # Refresh the per-stock price CSVs from yfinance. These scripts are
        # INCREMENTAL — they only append rows since each CSV's last date, so old
        # data is never re-fetched; only the newest days are added.
        print('[1] Refreshing latest prices from yfinance (incremental — appends new days only) ...')
        for sc in ('data_set_nifty5.py', 'data_set_nifty500.py', 'update_stocks.py'):
            if os.path.exists(os.path.join(MAIN, sc)):
                print(f'   -> {sc}')
                run([py, sc], cwd=MAIN)
            else:
                print(f'   (skip) {sc} not found')

    if extract:
        # Re-run the backtests only when a new MONTH has closed (a new portfolio
        # is formed). Past months are deterministic so they come out identical;
        # this just appends the latest month.
        print(f'[2] Running backtests (som_hedge.py, START_MONTH={SQE_START_MONTH}) for all 3 universes ...')
        for stocks, bench, out, deep in BACKTESTS:
            env = {**os.environ, 'STOCKS_FOLDER': stocks, 'BENCHMARK_FILE': bench,
                   'OUTPUT_FILE': out, 'DEEP_DIVE_FILE': deep,
                   'START_MONTH': SQE_START_MONTH, 'PYTHONIOENCODING': 'utf-8'}
            print(f'   -> {out}  ({stocks})')
            run([py, '-u', 'som_hedge.py'], cwd=MAIN, env=env)
    elif prices:
        print('[2] Skipping backtests (prices mode — no new month to add).')
    else:
        print('[1-2] Quick mode: skipping price refresh + backtests.')

    # ALWAYS regenerate data.js from the current workbooks so the SQE sites
    # reflect the workbook state directly — never the main repo's own data.js
    # (which may be the main dashboard's different history).
    print('[3] Regenerating data.js from workbooks (extract_dashboard_data.py) ...')
    run([py, 'extract_dashboard_data.py'], cwd=MAIN)

    stamp = data_last_update(os.path.join(MAIN, 'data.js'))
    for i, s in enumerate(sites, 1):
        print(f"\n[{i}/{len(sites)}] Updating {s['name']} site ({s['dir']}) ...")
        # Site-specific holdings.js (flat from one workbook, or keyed per universe).
        env = {**os.environ, 'HOLDINGS_OUT': os.path.join(s['dir'], 'holdings.js')}
        if s.get('holdings_map'):
            env['HOLDINGS_MAP'] = s['holdings_map']
        else:
            env['HOLDINGS_SRC'] = s['workbook']
        run([py, 'build_holdings.py'], cwd=MAIN, env=env)
        # Same shared data.js for every site.
        shutil.copyfile(os.path.join(MAIN, 'data.js'), os.path.join(s['dir'], 'data.js'))
        run(['git', 'add', 'data.js', 'holdings.js'], cwd=s['dir'])
        if run(['git', 'diff', '--cached', '--quiet'], cwd=s['dir'], check=False).returncode == 0:
            print(f"   No changes - {s['name']} already up to date.")
            continue
        run(['git', 'commit', '-m', f'data: sync data.js + holdings.js ({stamp})'], cwd=s['dir'])
        run(['git', 'push', 'origin', 'main'], cwd=s['dir'])
        print(f"   [OK] {s['name']} pushed.")

    # Leave the main repo pristine — extract regenerated its data.js/index.html
    # only as a transient source for the SQE sites; the main dashboard keeps its
    # own (committed) state.
    run(['git', 'checkout', '--', 'data.js', 'index.html'], cwd=MAIN, check=False)
    print(f'\n[OK] Done. Sites updated (data as of {stamp}). Main repo left unchanged.')


if __name__ == '__main__':
    main()
