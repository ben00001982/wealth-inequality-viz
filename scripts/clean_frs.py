"""Clean the tenure composition series, and the Family Resources Survey if it is used.

Run: python scripts/clean_frs.py

A note on why this file has two jobs and an awkward name.

The brief names the Family Resources Survey as one of five source families. The build's tenure
composition chart (S5) is sourced from the English Housing Survey, which the brief does not name, and
the frozen design spec's S5 row says so explicitly. Nothing on the critical path currently needs the
FRS at all.

That is a discrepancy in the brief, not in the build, and it is recorded in
`wealth-viz_p4-data-acquisition-manifest_v1` section 8 with three options. The cleanest is to restate
the brief's data list to match what the artefact actually uses. Until Ben decides, this script cleans
the English Housing Survey tenure series, which the build needs, and carries an optional FRS branch
that runs only if the file is present. The script name is kept as clean_frs.py because the tech stack
reference names it and the report's pipeline description refers to it.

England only. The English Housing Survey covers England, so the S5 annotation says England and must
not be generalised to the United Kingdom. That is enforced in the output metadata below, not left to
whoever writes the caption.
"""

from __future__ import annotations

import sys

import pandas as pd

from config import PROCESSED, raw_path, require_raw

TENURE_ORDER = {
    "Owner occupied": 0,
    "Owned outright": 0,
    "Buying with mortgage": 1,
    "Private rented": 2,
    "Social rented": 3,
}


def clean_ehs_tenure(path) -> pd.DataFrame:
    """Tidy the English Housing Survey headline tenure trends into year, tenure, share."""
    raw = pd.read_excel(path, sheet_name=0, header=None)

    header_idx = None
    for i in range(min(25, len(raw))):
        row = raw.iloc[i].astype(str).str.strip().str.lower()
        if row.str.contains("year").any() or row.str.contains("^19|^20").any():
            header_idx = i
            break
    if header_idx is None:
        raise SystemExit(
            f"\nCould not locate a header row in {path.name}.\n"
            "English Housing Survey workbooks put several tables on one sheet with title blocks\n"
            "between them. Open the file, find the headline tenure table, and set the sheet and\n"
            "header row explicitly here rather than letting the sniffer guess.\n"
        )

    df = pd.read_excel(path, sheet_name=0, header=header_idx)
    df = df.dropna(how="all").dropna(axis=1, how="all")

    # Expect a year column and one column per tenure. Reshape to long form.
    year_col = next((c for c in df.columns if str(c).strip().lower().startswith("year")), df.columns[0])
    value_cols = [c for c in df.columns if c != year_col]

    long = df.melt(id_vars=[year_col], value_vars=value_cols, var_name="tenure", value_name="share")
    long = long.rename(columns={year_col: "year"})
    long["year"] = pd.to_numeric(
        long["year"].astype(str).str.extract(r"(\d{4})")[0], errors="coerce"
    )
    long["share"] = pd.to_numeric(long["share"], errors="coerce")
    long = long.dropna(subset=["year", "share"])
    long["year"] = long["year"].astype(int)
    long["tenure"] = long["tenure"].astype(str).str.strip()

    if long["share"].max() > 1.5:
        print("  ehs: shares look like percentages, dividing by 100")
        long["share"] = long["share"] / 100.0

    long["order"] = long["tenure"].map(TENURE_ORDER)
    unknown = long.loc[long["order"].isna(), "tenure"].unique()
    if len(unknown):
        raise SystemExit(
            f"\nUnrecognised tenure categories: {sorted(unknown)}\n"
            "Add them to TENURE_ORDER. The stacking order matters: the private-rented band is the\n"
            "focal band in S5 and its position in the stack changes how readable it is.\n"
        )

    # Sanity check the composition. A stacked area that does not sum to one per year is either
    # missing a category or double-counting one, and either way the chart would mislead.
    sums = long.groupby("year")["share"].sum()
    bad = sums[(sums < 0.97) | (sums > 1.03)]
    if len(bad):
        print(
            f"  WARNING: tenure shares do not sum to 1.0 in {len(bad)} years "
            f"(range {sums.min():.3f} to {sums.max():.3f}). "
            "Check for a missing category or an 'all households' column read as a tenure."
        )

    return long.sort_values(["year", "order"]).reset_index(drop=True)


def clean_frs_optional() -> pd.DataFrame | None:
    """Clean the FRS summary if the file is present. Optional by design: see the module docstring."""
    path = raw_path("frs")
    if not path.exists():
        print("  frs: no file present, skipping (optional for the current build)")
        return None
    df = pd.read_excel(path, sheet_name=0)
    print(f"  frs: read {len(df)} rows, {len(df.columns)} columns")
    print(
        "  frs: NOTE this is retained for the brief's data list only. Nothing in the current build\n"
        "       consumes it. Decide whether to use it or to restate the brief before the report."
    )
    return df


def main() -> int:
    ehs = require_raw("ehs_tenure")
    print(f"Reading {ehs.name}")
    tenure = clean_ehs_tenure(ehs)
    out = PROCESSED / "tenure_composition.csv"
    tenure.to_csv(out, index=False)
    print(f"  wrote {out.name} ({len(tenure)} rows, {tenure['year'].min()} to {tenure['year'].max()})")
    print("  geography: England only. The S5 annotation must say so.")

    frs = clean_frs_optional()
    if frs is not None:
        frs.to_csv(PROCESSED / "frs_summary.csv", index=False)

    return 0


if __name__ == "__main__":
    sys.exit(main())
