"""
Update pipeline for the SQE All-Indices site (Smcresearch/SQE-).

Keeps the SQE site's DATA in sync with the source workbook in one command, so
data.js and holdings.js can never drift apart. It ONLY touches the two data
files — the SQE site's customised app.js / index.html / style.css are never
overwritten.

Steps (all from the same source state -> no data mismatch):
  1. (--extract) refresh per-stock price CSVs from yfinance so live prices are
     current: data_set_nifty5.py (nifty50_host), data_set_nifty500.py
     (nifty500_host), update_stocks.py (TOTAL_STOCKS)
  2. (--extract) regenerate data.js via extract_dashboard_data.py
  3. regenerate holdings.js via build_holdings.py   (reads the same workbook)
  4. copy data.js into the SQE site
  5. commit & push the SQE repo (its pre-commit hook bumps the cache-bust ?v=)

Usage:
  python update_sqe.py            # sync current data.js + rebuild holdings, push
  python update_sqe.py --extract  # full live refresh: prices -> extract -> push

--extract fetches ~1300 symbols from yfinance (a few minutes, needs network),
exactly like the original daily flow, so the live portfolio shows up-to-date
prices. Without it, the existing data.js is reused as-is.
"""
import os
import re
import shutil
import subprocess
import sys

MAIN = os.path.dirname(os.path.abspath(__file__))   # the main repo (this folder)
SQE = os.environ.get('SQE_HOST', r'd:/SQE-host')    # the SQE site repo


def run(cmd, cwd=None, check=True):
    print('   $', ' '.join(cmd))
    return subprocess.run(cmd, cwd=cwd, check=check)


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
    extract = '--extract' in sys.argv

    for p in (MAIN, SQE):
        if not os.path.isdir(p):
            sys.exit(f'[error] path not found: {p}')
    if not os.path.isdir(os.path.join(SQE, '.git')):
        sys.exit(f'[error] {SQE} is not a git repo')

    py = sys.executable

    if extract:
        # Refresh the per-stock price CSVs from yfinance FIRST (same as the
        # original daily flow) so the live portfolio shows current prices.
        # get_live_prices reads nifty50_host -> nifty500_host -> TOTAL_STOCKS,
        # so all three are refreshed to stay consistent.
        print('[1/5] Refreshing live price CSVs from yfinance (this takes a few minutes) ...')
        for sc in ('data_set_nifty5.py', 'data_set_nifty500.py', 'update_stocks.py'):
            if os.path.exists(os.path.join(MAIN, sc)):
                print(f'   -> {sc}')
                run([py, sc], cwd=MAIN)
            else:
                print(f'   (skip) {sc} not found')
        print('[2/5] Regenerating data.js (extract_dashboard_data.py) ...')
        run([py, 'extract_dashboard_data.py'], cwd=MAIN)
    else:
        print('[1-2/5] Using existing data.js (pass --extract for a full live price refresh).')

    print('[3/5] Regenerating holdings.js (build_holdings.py) ...')
    run([py, 'build_holdings.py'], cwd=MAIN)

    print('[4/5] Copying data.js -> SQE site ...')
    shutil.copyfile(os.path.join(MAIN, 'data.js'), os.path.join(SQE, 'data.js'))

    print('[5/5] Commit & push SQE repo ...')
    run(['git', 'add', 'data.js', 'holdings.js'], cwd=SQE)
    # Commit only if something actually changed.
    if run(['git', 'diff', '--cached', '--quiet'], cwd=SQE, check=False).returncode == 0:
        print('   No data changes - SQE site already up to date.')
        return
    stamp = data_last_update(os.path.join(SQE, 'data.js'))
    run(['git', 'commit', '-m', f'data: sync SQE data.js + holdings.js ({stamp})'], cwd=SQE)
    run(['git', 'push', 'origin', 'main'], cwd=SQE)
    print(f'\n[OK] SQE site updated and pushed (data as of {stamp}).')


if __name__ == '__main__':
    main()
