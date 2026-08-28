"""Clean the UK House Price Index full series.

Run: python scripts/clean_hpi.py

Produces four tidy tables: the national annual average, the ITL1 regional annual average, the
Kensington and Chelsea against Blackpool local-authority series indexed to a common base, and the
affordability ratio (which comes from a different ONS release but belongs with the price series).

Two things worth knowing before touching this.

The HPI CSV is monthly and large. The narrative wants annual points, so the monthly series is
aggregated to a calendar-year mean and the aggregation is stated in the output metadata rather than
left implicit. A calendar-year mean is the right choice here because the alignment rule matches WAS
wave midpoints to annual points, and a December snapshot would make that match arbitrary.

Local authorities sit below the ITL1 standard the rest of the artefact uses. S14 is therefore
explicitly labelled as an illustration of the range inside regions, not as a regional comparison.
The indexing to a common base of 100 is the mitigation for the absolute-scale misread the prior
project ran into, and it is not optional.
"""

from __future__ import annotations

import sys

import pandas as pd

from config import PROCESSED, require_raw

ITL1_REGION_NAMES = {
    "North East": "TLC",
    "North West": "TLD",
    "Yorkshire and The Humber": "TLE",
    "East Midlands": "TLF",
    "West Midlands": "TLG",
    "East of England": "TLH",
    "London": "TLI",
    "South East": "TLJ",
    "South West": "TLK",
    "Wales": "TLL",
    "Scotland": "TLM",
    "Northern Ireland": "TLN",
}

LOCAL_AUTHORITIES = ["Kensington and Chelsea", "Blackpool"]
INDEX_BASE_YEAR = 1995

#: Column names in the HPI full CSV. These have been stable for some years but are not guaranteed;
#: the script checks and fails with the actual column list rather than raising a KeyError.
COL_DATE = "Date"
COL_NAME = "RegionName"
COL_PRICE = "AveragePrice"


def _load(path) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False)
    missing = [c for c in (COL_DATE, COL_NAME, COL_PRICE) if c not in df.columns]
    if missing:
        raise SystemExit(
            f"\nExpected columns {missing} not found in {path.name}.\n"
            f"Columns present: {list(df.columns)[:20]}\n"
            "Update the COL_ constants in scripts/clean_hpi.py to match the release.\n"
        )
    df[COL_DATE] = pd.to_datetime(df[COL_DATE], errors="coerce", dayfirst=True)
    df = df.dropna(subset=[COL_DATE, COL_PRICE])
    df["year"] = df[COL_DATE].dt.year
    return df


def national_annual(df: pd.DataFrame) -> pd.DataFrame:
    uk = df[df[COL_NAME] == "United Kingdom"]
    if uk.empty:
        raise SystemExit(
            "\nNo rows with RegionName == 'United Kingdom'.\n"
            "Check whether the release labels the national series differently, for example "
            "'UK'.\n"
        )
    out = uk.groupby("year", as_index=False)[COL_PRICE].mean().rename(columns={COL_PRICE: "price"})
    out["price"] = out["price"].round(0)
    return out


def regional_annual(df: pd.DataFrame) -> pd.DataFrame:
    reg = df[df[COL_NAME].isin(ITL1_REGION_NAMES)].copy()
    reg["code"] = reg[COL_NAME].map(ITL1_REGION_NAMES)
    out = (
        reg.groupby(["code", "year"], as_index=False)[COL_PRICE]
        .mean()
        .rename(columns={COL_PRICE: "averagePrice"})
    )
    out["averagePrice"] = out["averagePrice"].round(0)
    found = set(out["code"].unique())
    missing = set(ITL1_REGION_NAMES.values()) - found
    if missing:
        print(f"  regional: no data for {sorted(missing)}; these will be null in the output")
    return out


def local_authority_index(df: pd.DataFrame) -> pd.DataFrame:
    la = df[df[COL_NAME].isin(LOCAL_AUTHORITIES)].copy()
    if la.empty:
        raise SystemExit(
            f"\nNeither of {LOCAL_AUTHORITIES} found in RegionName.\n"
            "Local-authority rows are present only in the full CSV download, not in the summary\n"
            "release. Confirm the file is the full series.\n"
        )
    annual = (
        la.groupby([COL_NAME, "year"], as_index=False)[COL_PRICE]
        .mean()
        .rename(columns={COL_NAME: "area", COL_PRICE: "price"})
    )

    frames = []
    for area, grp in annual.groupby("area"):
        base_rows = grp[grp["year"] == INDEX_BASE_YEAR]
        if base_rows.empty:
            raise SystemExit(
                f"\nNo {INDEX_BASE_YEAR} observation for {area}, so the index has no base.\n"
                "This is the blocker recorded against S13b and S14b: the 1995 baselines exist only\n"
                "in the full HPI CSV. Confirm the download covers 1995 onwards.\n"
            )
        base = float(base_rows["price"].iloc[0])
        grp = grp.copy()
        grp["index"] = (grp["price"] / base * 100).round(1)
        frames.append(grp)

    return pd.concat(frames, ignore_index=True).sort_values(["area", "year"])


def affordability(path) -> pd.DataFrame:
    """The price-to-earnings ratio, from the ONS housing affordability release.

    Sheet and column positions must be checked against the workbook. The two marked points (the peak
    and the latest reading) are flagged here rather than in the front end, so the annotation follows
    the data instead of being hard-coded in a component.
    """
    df = pd.read_excel(path, sheet_name=0, header=None)
    # Find the header row by looking for a cell that contains 'Year', rather than assuming an index.
    header_idx = None
    for i in range(min(20, len(df))):
        row = df.iloc[i].astype(str).str.strip().str.lower()
        if (row == "year").any():
            header_idx = i
            break
    if header_idx is None:
        raise SystemExit(
            f"\nCould not find a header row containing 'Year' in {path.name}.\n"
            "Open the workbook and set the sheet and header explicitly in affordability().\n"
        )
    tidy = pd.read_excel(path, sheet_name=0, header=header_idx)
    cols = {str(c).strip().lower(): c for c in tidy.columns}
    year_col = cols.get("year")
    ratio_col = next((c for k, c in cols.items() if "ratio" in k), None)
    if year_col is None or ratio_col is None:
        raise SystemExit(
            f"\nCould not identify the year and ratio columns in {path.name}.\n"
            f"Columns: {list(tidy.columns)}\n"
        )
    out = pd.DataFrame(
        {
            "year": pd.to_numeric(tidy[year_col], errors="coerce"),
            "ratio": pd.to_numeric(tidy[ratio_col], errors="coerce"),
        }
    ).dropna()
    out["year"] = out["year"].astype(int)

    out["mark"] = False
    out["label"] = None
    peak = out.loc[out["ratio"].idxmax()]
    latest = out.loc[out["year"].idxmax()]
    out.loc[out["year"] == peak["year"], ["mark", "label"]] = [
        True,
        f"Peak, {int(peak['year'])}: {peak['ratio']:.1f} times earnings",
    ]
    out.loc[out["year"] == latest["year"], ["mark", "label"]] = [
        True,
        f"{int(latest['year'])}: {latest['ratio']:.1f} times earnings",
    ]
    return out


def main() -> int:
    hpi_path = require_raw("hpi")
    aff_path = require_raw("affordability")

    print(f"Reading {hpi_path.name}")
    df = _load(hpi_path)
    print(f"  {len(df):,} monthly rows, {df['year'].min()} to {df['year'].max()}")

    outputs = {
        "hpi_national": national_annual(df),
        "hpi_regional": regional_annual(df),
        "hpi_local_authority_index": local_authority_index(df),
        "affordability": affordability(aff_path),
    }

    for name, frame in outputs.items():
        out = PROCESSED / f"{name}.csv"
        frame.to_csv(out, index=False)
        print(f"  wrote {out.name} ({len(frame)} rows)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
