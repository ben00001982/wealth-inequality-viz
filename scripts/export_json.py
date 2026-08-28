"""Emit the front-end JSON files from the tidy processed tables.

Run: python scripts/export_json.py

This is the only script that writes into public/data, so the tidy layer and the served layer stay
separable. Every file it writes carries a `__meta` block recording provenance, and `synthetic: false`,
which is what makes the front end's provenance banner disappear.

The `__meta` block is not decoration. The front end reads `__meta.synthetic` on every file and shows
a warning banner if any file is a placeholder, and a stronger warning if the set is mixed. A mixed set
is the dangerous case: a real series beside a placeholder one invites a comparison that means nothing.
"""

from __future__ import annotations

import json
import sys
from datetime import date

import pandas as pd

from config import OUTPUT, OUTPUT_SCHEMA, PROCESSED, SOURCES

TODAY = date.today().isoformat()


def _meta(source_keys: list[str], note: str = "") -> dict:
    return {
        "synthetic": False,
        "generated": TODAY,
        "sources": [
            {
                "publisher": SOURCES[k].publisher,
                "title": SOURCES[k].title,
                "edition": SOURCES[k].edition or "NOT RECORDED: fill in config.SOURCES",
                "accessDate": SOURCES[k].access_date or "NOT RECORDED: fill in config.SOURCES",
                "licence": SOURCES[k].licence,
                "geography": SOURCES[k].geography,
            }
            for k in source_keys
        ],
        "note": note,
    }


def _write(name: str, rows, meta: dict) -> None:
    if name not in OUTPUT_SCHEMA:
        raise SystemExit(
            f"\n'{name}' is not in OUTPUT_SCHEMA in scripts/config.py.\n"
            "Add it there first, with its fields, the step it feeds and its validation checks, so the\n"
            "file is documented rather than appearing silently in public/data.\n"
        )
    missing = [
        s
        for s in meta.get("sources", [])
        if "NOT RECORDED" in str(s.get("edition")) or "NOT RECORDED" in str(s.get("accessDate"))
    ]
    if missing:
        print(
            f"  {name}: WARNING edition or access date not recorded for "
            f"{[s['title'] for s in missing]}. The report needs both."
        )
    payload = {"__meta": meta, "rows": rows}
    dest = OUTPUT / name
    dest.write_text(json.dumps(payload, indent=None, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {name} ({len(rows)} rows, {dest.stat().st_size / 1000:.0f} kB)")


def _read(name: str) -> pd.DataFrame:
    path = PROCESSED / f"{name}.csv"
    if not path.exists():
        raise SystemExit(
            f"\nMissing {path.name}.\n"
            "Run the cleaning scripts first: clean_was.py, clean_hpi.py, clean_frs.py.\n"
        )
    return pd.read_csv(path)


def main() -> int:
    print("Exporting front-end JSON")

    deciles = _read("was_deciles")
    _write(
        "wealth_by_decile.json",
        deciles.to_dict("records"),
        _meta(["was_household"], "Shares are proportions of total household wealth, not percentages."),
    )

    comp = _read("was_composition")
    _write("wealth_composition.json", comp.to_dict("records"), _meta(["was_household"]))

    tenure = _read("tenure_composition")
    _write(
        "tenure_composition.json",
        tenure.to_dict("records"),
        _meta(["ehs_tenure"], "England only. The S5 annotation must not generalise this to the UK."),
    )

    by_tenure = _read("was_by_tenure")
    latest_wave = sorted(by_tenure["wave"].unique())[-1]
    by_tenure_out = by_tenure.copy()
    by_tenure_out.loc[by_tenure_out["wave"] == latest_wave, "wave"] = by_tenure_out.loc[
        by_tenure_out["wave"] == latest_wave, "wave"
    ]
    rows = by_tenure_out.to_dict("records")
    # The front end asks for a row set tagged 'latest' for the static S18 comparison, in addition to
    # the per-wave rows. Duplicating the latest wave under that tag keeps the front end from having
    # to know which wave is newest.
    rows += [{**r, "wave": "latest"} for r in by_tenure[by_tenure["wave"] == latest_wave].to_dict("records")]
    _write("median_wealth_by_tenure.json", rows, _meta(["was_household"]))

    by_age = _read("was_by_age")
    age_rows = by_age.to_dict("records")
    latest_age_wave = sorted(by_age["wave"].unique())[-1]
    age_rows += [
        {**r, "wave": "latest"} for r in by_age[by_age["wave"] == latest_age_wave].to_dict("records")
    ]
    _write("median_wealth_by_age.json", age_rows, _meta(["was_household"]))

    national = _read("hpi_national")
    national = national.copy()
    national["label"] = None
    first, last = national.iloc[0], national.iloc[-1]
    national.loc[national["year"] == first["year"], "label"] = f"{int(first['year'])}"
    national.loc[national["year"] == last["year"], "label"] = (
        f"{int(last['year'])}: £{last['price']:,.0f}"
    )
    _write(
        "house_prices.json",
        national.to_dict("records"),
        _meta(["hpi"], "Calendar-year mean of the monthly series."),
    )

    aff = _read("affordability")
    _write(
        "affordability.json",
        aff.to_dict("records"),
        _meta(["affordability"], "England and Wales only."),
    )

    la = _read("hpi_local_authority_index")
    _write(
        "local_authority_index.json",
        la.to_dict("records"),
        _meta(["hpi"], "Local authorities sit below the ITL1 standard: S14 is an illustration of range."),
    )

    # Regional wealth and regional prices are merged into one file, because the front end's two
    # choropleths read from the same regional row set and a split would risk them diverging.
    reg_wealth = _read("was_by_region")
    latest_reg_wave = sorted(reg_wealth["wave"].unique())[-1]
    reg_wealth = reg_wealth[reg_wealth["wave"] == latest_reg_wave]
    reg_price = _read("hpi_regional")
    latest_price_year = reg_price["year"].max()
    reg_price = reg_price[reg_price["year"] == latest_price_year]

    merged = reg_price.merge(
        reg_wealth[["code", "median", "sampleSize"]], on="code", how="outer"
    )
    merged = merged.drop(columns=[c for c in ("year",) if c in merged.columns])
    merged = merged.where(pd.notna(merged), None)
    _write(
        "regional_wealth.json",
        merged.to_dict("records"),
        _meta(
            ["was_regional", "hpi"],
            (
                f"Wealth from {latest_reg_wave}; prices are the {latest_price_year} calendar-year mean. "
                "Northern Ireland (TLN) carries a price and a null median, because the Wealth and "
                "Assets Survey covers Great Britain only. A null must render as a no-data class, "
                "never as zero."
            ),
        ),
    )

    dist = _read("was_distribution")
    _write("wealth_distribution.json", dist.to_dict("records"), _meta(["was_household"]))

    lookup = _read("was_lookup")
    lookup = lookup.where(pd.notna(lookup), None)
    _write(
        "was_lookup.json",
        lookup.to_dict("records"),
        _meta(
            ["was_household", "was_regional"],
            (
                "Published marginals only: a null in a dimension means 'all'. The three-way "
                "age-by-tenure-by-region cross-tab is not published by ONS and has NOT been "
                "synthesised. The explorer degrades to the finest published cut. See build_lookup() "
                "in clean_was.py."
            ),
        ),
    )

    print(
        "\nStill to write by hand, because they are not derivable from the cleaned tables:\n"
        "  top_share_trend.json  the top-decile share series and the wealth-to-income ratio, from\n"
        "                        UK Parliament (2025) drawing on Resolution Foundation (2024).\n"
        "  missing_top.json      the surveyed and missing segments, from Advani, Bangham and Leslie\n"
        "                        (2021).\n"
        "  rich_list.json        the three published Rich List aggregates and the edition year,\n"
        "                        transcribed from the published list with its methodology caveat.\n"
        "Each must carry a __meta block with synthetic:false and its source, and each figure must be\n"
        "transcribed from the publication rather than recalled.\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
