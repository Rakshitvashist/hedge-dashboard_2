"""
Fetch price history for Nifty 50 constituents that left the index (and so were
never in nifty50_host). Saves into nifty50_hist/ using the SAME CSV schema, named
by the BASKET symbol so basket_compare.py can match them directly.

Run once; safe to re-run (skips files already present).
"""
import os
import time
import pandas as pd
import yfinance as yf

OUT_DIR = "nifty50_hist"
os.makedirs(OUT_DIR, exist_ok=True)

# basket symbol -> ordered candidate Yahoo tickers (first that returns data wins)
RESOLVE = {
    "ACC":        ["ACC.NS"],
    "AMBUJACEM":  ["AMBUJACEM.NS"],
    "AUROPHARMA": ["AUROPHARMA.NS"],
    "BANKBARODA": ["BANKBARODA.NS"],
    "BHEL":       ["BHEL.NS"],
    "BOSCHLTD":   ["BOSCHLTD.NS"],
    "BPCL":       ["BPCL.NS"],
    "BRITANNIA":  ["BRITANNIA.NS"],
    "DIVISLAB":   ["DIVISLAB.NS"],
    "GAIL":       ["GAIL.NS"],
    "HEROMOTOCO": ["HEROMOTOCO.NS"],
    "HINDPETRO":  ["HINDPETRO.NS"],
    "IDEA":       ["IDEA.NS"],
    "INDUSINDBK": ["INDUSINDBK.NS"],
    "IOC":        ["IOC.NS"],
    "LUPIN":      ["LUPIN.NS"],
    "SHREECEM":   ["SHREECEM.NS"],
    "TATAPOWER":  ["TATAPOWER.NS"],
    "UPL":        ["UPL.NS"],
    "VEDL":       ["VEDL.NS"],
    "YESBANK":    ["YESBANK.NS"],
    "ZEEL":       ["ZEEL.NS"],
    # renamed (history preserved under new ticker)
    "IBULHSGFIN": ["IBULHSGFIN.NS", "SAMMAANCAP.NS"],
    # flaky / recently restructured -> extra fallbacks
    "TATAMOTORS": ["TATAMOTORS.NS", "TATAMOTORS.BO"],
    "LTIM":       ["LTIM.NS", "LTI.NS", "MINDTREE.NS", "LTIM.BO"],
    # merged away -> use successor entity as proxy for the historical slot
    "HDFC":       ["HDFC.NS", "HDFCBANK.NS"],      # HDFC Ltd merged into HDFC Bank (2023)
    "INFRATEL":   ["INFRATEL.NS", "INDUSTOWER.NS"],  # Bharti Infratel renamed Indus Towers
}


def fetch(base, candidates, retries=3):
    for cand in candidates:
        for attempt in range(retries):
            try:
                d = yf.Ticker(cand).history(period="max", interval="1d")
                if len(d):
                    return cand, d
            except Exception:
                pass
            time.sleep(1.5)
    return None, None


def main():
    print(f"Fetching {len(RESOLVE)} historical constituents -> {OUT_DIR}/\n")
    ok, failed = [], []
    for i, (base, cands) in enumerate(RESOLVE.items(), 1):
        path = os.path.join(OUT_DIR, f"{base}_1d_max.csv")
        if os.path.exists(path):
            print(f"[{i:2d}/{len(RESOLVE)}] {base:12} skip (exists)")
            ok.append(base)
            continue

        cand, d = fetch(base, cands)
        if d is None:
            print(f"[{i:2d}/{len(RESOLVE)}] {base:12} FAILED  (tried {cands})")
            failed.append(base)
            continue

        d.index = d.index.strftime("%d-%m-%Y")
        d.reset_index(inplace=True)
        d.rename(columns={"Date": "Date", "index": "Date", "Datetime": "Date"}, inplace=True)
        n = len(d)
        out = pd.DataFrame({
            "Symbol":   [base] * n,
            "Company":  [base] * n,
            "Industry": ["-"] * n,
            "Index":    ["NIFTY50_HIST"] * n,
            "Date":     d["Date"],
            "Open":     d["Open"], "High": d["High"], "Low": d["Low"], "Close": d["Close"],
            "Volume":   d["Volume"],
            "Dividends": d.get("Dividends", 0), "Stock Splits": d.get("Stock Splits", 0),
        })
        out.to_csv(path, index=False)
        print(f"[{i:2d}/{len(RESOLVE)}] {base:12} OK via {cand:16} rows={n:5} ({out['Date'].iloc[0]} -> {out['Date'].iloc[-1]})")
        ok.append(base)
        time.sleep(0.4)

    print(f"\nDONE: {len(ok)} ok | {len(failed)} failed")
    if failed:
        print(f"Failed (merged/unavailable): {failed}")


if __name__ == "__main__":
    main()
