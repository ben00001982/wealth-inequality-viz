"""Clean the Wealth and Assets Survey workbooks into tidy tables.

Run: python scripts/clean_was.py

Reads the workbooks named in config.SOURCES and writes tidy parquet or CSV into data/processed. It
does not write anything into public/data: that is export_json.py's job, so that the tidy layer and
the front-end layer stay separable and each can be inspected on its own.

WHAT THIS SCRIPT DOES NOT DO. It does not guess sheet names, header rows or cell ranges. ONS
workbooks are laid out for human readers, with title blocks, footnote rows and merged headers, and
the layout moves between releases. So the sheet map below is explicit, it is expected to need
updating against the release actually downloaded, and the script fails loudly on a mismatch rather
than reading whatever happens to be in the cells. A pipeline that quietly reads the wrong rows is
worse than one that stops.

Minimum cell size. Rows below the threshold are dropped rather than published, and the count of
dropped rows is reported. The threshold is a single constant shared with the front end: keep
MIN_CELL_SIZE here in step with MIN_CELL_SIZE in src/data/lookup.js. That duplication is deliberate
and is flagged in docs/DATA-PIPELINE.md as a thing to check, because the alternative (generating the
JavaScript constant from Python) adds a build step for one integer.
"""

from __future__ import annotations

import sys

import pandas as pd

from config import PROCESSED, require_raw
from temporal_alignment import WAVES

MIN_CELL_SIZE = 30

#: Sheet and header map, per release. Update against the workbook actually downloaded, then record
#: the release in config.SOURCES. The tuple is (sheet name, header row index, first data row index).
SHEET_MAP = {
    "deciles": ("Table 1", 4, 5),
    "composition": ("Table 2", 4, 5),
    "by_tenure": ("Table 3", 4, 5),
    "by_age": ("Table 4", 4, 5),
    "by_region": ("Table 5", 4, 5),
    "distribution": ("Table 6", 4, 5),
}

AGE_BANDS = ["16-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75+"]

TENURE_MAP = {
    "Owned outright": "owned-outright",
    "Buying with mortgage": "mortgaged",
    "Owned with mortgage": "mortgaged",
    "Private rented": "private-rent",
    "Social rented": "social-rent",
}

#: ONS publishes regional wealth against eleven named areas. The ITL1 code list has twelve, because
#: it includes Northern Ireland, which the survey does not cover. Mapping by name is the only route
#: available here because the workbook carries names and not codes, so the map is explicit and the
#: script fails on an unrecognised name rather than dropping it.
REGION_NAME_TO_ITL1 = {
    "North East": "TLC",
    "North West": "TLD",
    "Yorkshire and The Humber": "TLE",
    "Yorkshire and the Humber": "TLE",
    "East Midlands": "TLF",
    "West Midlands": "TLG",
    "East of England": "TLH",
    "East": "TLH",
    "London": "TLI",
    "South East": "TLJ",
    "South West": "TLK",
    "Wales": "TLL",
    "Scotland": "TLM",
}


def _read_sheet(path, key: str) -> pd.DataFrame:
    sheet, header, first_data = SHEET_MAP[key]
    try:
        df = pd.read_excel(path, sheet_name=sheet, header=header)
    except ValueError as exc:
        raise SystemExit(
            f"\nSheet '{sheet}' not found in {path.name} while reading '{key}'.\n"
            "ONS workbook layouts change between releases. Open the workbook, find the table, and\n"
            "update SHEET_MAP in scripts/clean_was.py with the sheet name and header row. Do not\n"
            "guess: reading the wrong rows produces plausible output from the wrong numbers.\n"
        ) from exc
    df = df.iloc[first_data - header - 1 :]
    df = df.dropna(how="all").reset_index(drop=True)
    return df


def clean_deciles(path) -> pd.DataFrame:
    df = _read_sheet(path, "deciles")
    out = pd.DataFrame(
        {
            "decile": pd.to_numeric(df.iloc[:, 0], errors="coerce"),
            "share": pd.to_numeric(df.iloc[:, 1], errors="coerce"),
            "threshold": pd.to_numeric(df.iloc[:, 2], errors="coerce"),
        }
    ).dropna(subset=["decile"])
    out["decile"] = out["decile"].astype(int)
    # Shares are sometimes published as percentages and sometimes as proportions. Normalise to a
    # proportion, and say which was found, rather than assuming.
    if out["share"].max() > 1.5:
        print("  deciles: shares look like percentages, dividing by 100")
        out["share"] = out["share"] / 100.0
    return out.sort_values("decile").reset_index(drop=True)


def clean_composition(path) -> pd.DataFrame:
    df = _read_sheet(path, "composition")
    out = pd.DataFrame(
        {
            "component": df.iloc[:, 0].astype(str).str.strip(),
            "share": pd.to_numeric(df.iloc[:, 1], errors="coerce"),
        }
    ).dropna(subset=["share"])
    if out["share"].max() > 1.5:
        out["share"] = out["share"] / 100.0
    return out.reset_index(drop=True)


def _clean_breakdown(path, key: str, dim_name: str, mapper=None) -> pd.DataFrame:
    df = _read_sheet(path, key)
    out = pd.DataFrame(
        {
            "wave": df.iloc[:, 0].astype(str).str.strip(),
            dim_name: df.iloc[:, 1].astype(str).str.strip(),
            "median": pd.to_numeric(df.iloc[:, 2], errors="coerce"),
            "sampleSize": pd.to_numeric(df.iloc[:, 3], errors="coerce"),
        }
    ).dropna(subset=["median"])

    valid_waves = {w.label for w in WAVES}
    unknown = set(out["wave"]) - valid_waves
    if unknown:
        raise SystemExit(
            f"\nUnrecognised wave labels in '{key}': {sorted(unknown)}\n"
            "The wave calendar in scripts/temporal_alignment.py is the single source of truth for\n"
            "wave labels. Either the workbook uses a different label form, in which case add a\n"
            "mapping, or a new wave has been published, in which case add it to WAVES with its\n"
            "collection period and basis. Do not let an unknown label through: the basis change at\n"
            "Round 6 means a mislabelled wave lands in the wrong place on every time axis.\n"
        )

    if mapper:
        mapped = out[dim_name].map(mapper)
        bad = out.loc[mapped.isna(), dim_name].unique()
        if len(bad):
            raise SystemExit(
                f"\nUnrecognised {dim_name} categories in '{key}': {sorted(bad)}\n"
                f"Add them to the mapping in scripts/clean_was.py.\n"
            )
        out[dim_name] = mapped

    before = len(out)
    out = out[out["sampleSize"].fillna(0) >= MIN_CELL_SIZE]
    dropped = before - len(out)
    if dropped:
        print(f"  {key}: dropped {dropped} of {before} rows below the minimum cell size of {MIN_CELL_SIZE}")
    return out.reset_index(drop=True)


def clean_regional(path) -> pd.DataFrame:
    df = _read_sheet(path, "by_region")
    out = pd.DataFrame(
        {
            "wave": df.iloc[:, 0].astype(str).str.strip(),
            "region_name": df.iloc[:, 1].astype(str).str.strip(),
            "median": pd.to_numeric(df.iloc[:, 2], errors="coerce"),
            "sampleSize": pd.to_numeric(df.iloc[:, 3], errors="coerce"),
        }
    ).dropna(subset=["median"])

    out["code"] = out["region_name"].map(REGION_NAME_TO_ITL1)
    unknown = out.loc[out["code"].isna(), "region_name"].unique()
    if len(unknown):
        raise SystemExit(
            f"\nUnrecognised region names: {sorted(unknown)}\n"
            "Add them to REGION_NAME_TO_ITL1. Note that the join to the boundary file must be on the\n"
            "ITL1 code and never on the name, because the published name forms differ between ONS\n"
            "outputs (for example 'Yorkshire and The Humber' against 'Yorkshire and the Humber').\n"
        )
    return out.drop(columns=["region_name"]).reset_index(drop=True)


def clean_distribution(path) -> pd.DataFrame:
    df = _read_sheet(path, "distribution")
    out = pd.DataFrame(
        {
            "percentile": pd.to_numeric(df.iloc[:, 0], errors="coerce"),
            "wealth": pd.to_numeric(df.iloc[:, 1], errors="coerce"),
        }
    ).dropna()
    out["percentile"] = out["percentile"].astype(int)
    return out.sort_values("percentile").reset_index(drop=True)


def build_lookup(by_age: pd.DataFrame, by_tenure: pd.DataFrame, by_region: pd.DataFrame) -> pd.DataFrame:
    """Assemble the explorer lookup table from the published marginals.

    IMPORTANT, and the single largest open question in the whole data layer. The explorer wants a
    three-way cut of age band by tenure by region. ONS does not publish that cross-tabulation. There
    are exactly two honest routes and one dishonest one:

      1. Obtain the WAS microdata through the UK Data Service (registration, and Secure Access for
         the detailed variables) and compute the cross-tab, respecting disclosure control.
      2. Ship the marginals only, and have the explorer degrade to the finest published cut, which is
         what lookupMedian in src/data/lookup.js already does.

    The dishonest route is to synthesise the interaction from the marginals, for example by scaling a
    regional median by a tenure ratio. That produces a number that looks like data and is not, and it
    is exactly what the brief forbids.

    This function builds route 2: the marginals, with nulls marking "all". If route 1 is taken later,
    the extra rows drop into the same table shape and the front end needs no change. Design spec B.9
    carries this as an open build item.
    """
    frames = []
    for wave in by_age["wave"].unique():
        a = by_age[by_age["wave"] == wave]
        t = by_tenure[by_tenure["wave"] == wave]
        r = by_region[by_region["wave"] == wave]

        frames.append(
            pd.DataFrame(
                {
                    "wave": wave,
                    "ageBand": a["ageBand"],
                    "tenure": None,
                    "region": None,
                    "median": a["median"],
                    "sampleSize": a["sampleSize"],
                }
            )
        )
        frames.append(
            pd.DataFrame(
                {
                    "wave": wave,
                    "ageBand": None,
                    "tenure": t["tenure"],
                    "region": None,
                    "median": t["median"],
                    "sampleSize": t["sampleSize"],
                }
            )
        )
        frames.append(
            pd.DataFrame(
                {
                    "wave": wave,
                    "ageBand": None,
                    "tenure": None,
                    "region": r["code"],
                    "median": r["median"],
                    "sampleSize": r["sampleSize"],
                }
            )
        )

    out = pd.concat(frames, ignore_index=True)
    print(
        "  lookup: built from published marginals only. The three-way cross-tab is NOT included:\n"
        "          see the note in build_lookup(). The explorer degrades to the finest published cut."
    )
    return out


def main() -> int:
    household = require_raw("was_household")
    regional = require_raw("was_regional")

    print(f"Reading {household.name} and {regional.name}")

    deciles = clean_deciles(household)
    composition = clean_composition(household)
    by_tenure = _clean_breakdown(household, "by_tenure", "tenure", TENURE_MAP)
    by_age = _clean_breakdown(household, "by_age", "ageBand")
    distribution = clean_distribution(household)
    by_region = clean_regional(regional)

    bad_bands = set(by_age["ageBand"]) - set(AGE_BANDS)
    if bad_bands:
        raise SystemExit(
            f"\nAge bands in the workbook do not match the front end: {sorted(bad_bands)}\n"
            "AGE_BANDS here must match AGE_BANDS in src/data/lookup.js exactly, or the explorer's\n"
            "controls will offer bands the data cannot answer.\n"
        )

    lookup = build_lookup(by_age, by_tenure, by_region)

    for name, frame in {
        "was_deciles": deciles,
        "was_composition": composition,
        "was_by_tenure": by_tenure,
        "was_by_age": by_age,
        "was_by_region": by_region,
        "was_distribution": distribution,
        "was_lookup": lookup,
    }.items():
        out = PROCESSED / f"{name}.csv"
        frame.to_csv(out, index=False)
        print(f"  wrote {out.relative_to(PROCESSED.parent.parent)} ({len(frame)} rows)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
