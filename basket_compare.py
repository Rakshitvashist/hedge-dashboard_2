"""
Survivorship-bias comparison: Point-in-Time Nifty 50 basket  vs  Current fixed basket.

Two equal-weight, monthly-rebalanced portfolios over the reshuffle tracker window:

  A) POINT-IN-TIME (PIT)  -> each month hold the ACTUAL Nifty 50 constituents that
                             were live that month (from the reshuffle tracker).
  B) CURRENT-FIXED        -> hold today's 50 Nifty constituents across all history
                             (this is the survivorship-biased basket the SOM uses).

We only have price data for the current 50 stocks, so PIT months that contain
delisted/replaced names are computed on the COVERED subset only. Coverage is
reported per-month so the bias is fully transparent.

Outputs (folder: reshuffle_reports/):
  - basket_comparison_monthly.csv   month, returns + cumulative for both
  - basket_comparison_yearly.csv    compounded yearly return for both + gap
  - basket_coverage.csv             per-month PIT coverage + missing names
  - summary printed to console
"""
import os
import pandas as pd
import numpy as np

# current basket prices + fetched historical-constituent prices
DATA_DIRS  = ["nifty50_host", "nifty50_hist"]
TRACKER    = "nifty50_reshuffle_tracker_v2.xlsx"
OUT_DIR    = "reshuffle_reports"
os.makedirs(OUT_DIR, exist_ok=True)

# Pure ticker renames (same company, no data gap) -> map basket name to our file name
ALIASES = {"BAJAJAUTO": "BAJAJ-AUTO"}


# ── 1. Load month-end close panel for the 50 stocks we have ──────────────────
def load_monthly_panel():
    series = {}
    for data_dir in DATA_DIRS:
        if not os.path.isdir(data_dir):
            continue
        for fn in os.listdir(data_dir):
            if not fn.endswith("_1d_max.csv"):
                continue
            sym = fn.replace("_1d_max.csv", "")
            if sym in series:                       # nifty50_host wins on duplicates
                continue
            df = pd.read_csv(os.path.join(data_dir, fn), usecols=["Date", "Close"])
            df["Date"] = pd.to_datetime(df["Date"], dayfirst=True, errors="coerce")
            df = df.dropna(subset=["Date"]).set_index("Date").sort_index()
            # month-end close, keep only sane positive prices (early split-adjusted noise < 0)
            m = df["Close"][df["Close"] > 0].resample("ME").last()
            series[sym] = m
    panel = pd.DataFrame(series)
    panel.index = panel.index.to_period("M").astype(str)   # 'YYYY-MM'
    return panel


# ── 2. Load point-in-time baskets from the tracker ──────────────────────────
def load_pit_baskets():
    fb = pd.read_excel(TRACKER, "Full Basket Per Month")
    months = [c for c in fb.columns if c != "Stock #"]
    baskets = {}
    for m in months:
        names = fb[m].dropna().astype(str).str.strip().tolist()
        names = [ALIASES.get(n, n) for n in names]
        baskets[m] = names
    return baskets, months


# ── 3. Metrics ──────────────────────────────────────────────────────────────
def metrics(monthly_ret):
    r = monthly_ret.dropna()
    if len(r) == 0:
        return {}
    growth = (1 + r).prod()
    yrs = len(r) / 12.0
    cagr = growth ** (1 / yrs) - 1 if yrs > 0 else np.nan
    vol = r.std() * np.sqrt(12)
    sharpe = (r.mean() * 12) / vol if vol else np.nan
    curve = (1 + r).cumprod()
    mdd = (curve / curve.cummax() - 1).min()
    return {
        "Total Return %": round((growth - 1) * 100, 2),
        "CAGR %":         round(cagr * 100, 2),
        "Ann Vol %":      round(vol * 100, 2),
        "Sharpe":         round(sharpe, 2),
        "Max Drawdown %": round(mdd * 100, 2),
        "Months":         len(r),
    }


def current_basket_symbols():
    """The fixed survivorship basket = the 50 files in nifty50_host."""
    return {f.replace("_1d_max.csv", "")
            for f in os.listdir("nifty50_host") if f.endswith("_1d_max.csv")}


def main():
    panel = load_monthly_panel()
    baskets, months = load_pit_baskets()
    avail = set(panel.columns)              # everything we can price (PIT lookups)
    current = current_basket_symbols()      # the fixed 50 (survivorship basket)

    # month-over-month simple returns for every available stock
    rets = panel.pct_change()

    months = [m for m in months if m in rets.index]
    rows, cov_rows = [], []

    for m in months:
        row_ret = rets.loc[m]

        # --- A) point-in-time basket (covered subset) ---
        pit_full = baskets[m]
        pit_cov = [s for s in pit_full if s in avail and pd.notna(row_ret.get(s))]
        pit_ret = row_ret[pit_cov].mean() if pit_cov else np.nan
        missing = sorted(set(pit_full) - avail)

        # --- B) current fixed basket (the 50 we hold today) ---
        cur_cov = [s for s in current if pd.notna(row_ret.get(s))]
        cur_ret = row_ret[cur_cov].mean() if cur_cov else np.nan

        rows.append({"Month": m, "PIT_Return": pit_ret, "Current_Return": cur_ret})
        cov_rows.append({
            "Month": m,
            "PIT_Basket_Size": len(pit_full),
            "PIT_Covered": len(pit_cov),
            "PIT_Coverage_%": round(100 * len(pit_cov) / len(pit_full), 1) if pit_full else 0,
            "Missing_Count": len(missing),
            "Missing_Stocks": ", ".join(missing) if missing else "-",
        })

    out = pd.DataFrame(rows).set_index("Month")
    # first month has no prior -> drop NaN-only return row for cumulative
    out = out.dropna(how="all", subset=["PIT_Return", "Current_Return"])
    out["PIT_Cumulative"]     = (1 + out["PIT_Return"].fillna(0)).cumprod()
    out["Current_Cumulative"] = (1 + out["Current_Return"].fillna(0)).cumprod()
    out["Gap_(PIT-Cur)_%"]    = ((out["PIT_Return"] - out["Current_Return"]) * 100).round(2)

    cov = pd.DataFrame(cov_rows).set_index("Month")

    # yearly compounded
    yr = out.copy()
    yr["Year"] = [m[:4] for m in yr.index]
    yearly = yr.groupby("Year").apply(
        lambda g: pd.Series({
            "PIT_Return_%":     round(((1 + g["PIT_Return"].fillna(0)).prod() - 1) * 100, 2),
            "Current_Return_%": round(((1 + g["Current_Return"].fillna(0)).prod() - 1) * 100, 2),
        }), include_groups=False
    )
    yearly["Gap_%"] = (yearly["PIT_Return_%"] - yearly["Current_Return_%"]).round(2)

    # ── write ──
    out.round(4).to_csv(os.path.join(OUT_DIR, "basket_comparison_monthly.csv"))
    yearly.to_csv(os.path.join(OUT_DIR, "basket_comparison_yearly.csv"))
    cov.to_csv(os.path.join(OUT_DIR, "basket_coverage.csv"))

    # ── console summary ──
    print("=" * 64)
    print("  SURVIVORSHIP-BIAS COMPARISON  (equal-weight, monthly rebalanced)")
    print("=" * 64)
    print(f"  Window : {out.index[0]}  ->  {out.index[-1]}   ({len(out)} months)")
    print(f"  Current fixed basket    : {len(current)} stocks")
    print(f"  Total priceable universe: {len(avail)} stocks (incl. historical constituents)")
    avg_cov = cov['PIT_Coverage_%'].mean()
    print(f"  Avg point-in-time coverage : {avg_cov:.1f}%")
    print("-" * 64)
    summ = pd.DataFrame({
        "Point-in-Time": metrics(out["PIT_Return"]),
        "Current-Fixed": metrics(out["Current_Return"]),
    })
    print(summ.to_string())
    print("-" * 64)
    print("  Yearly comparison:")
    print(yearly.to_string())
    print("=" * 64)
    print(f"  Reports written to:  {OUT_DIR}/")
    for f in ["basket_comparison_monthly.csv", "basket_comparison_yearly.csv", "basket_coverage.csv"]:
        print(f"    - {f}")


if __name__ == "__main__":
    main()
