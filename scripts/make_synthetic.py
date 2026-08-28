"""Generate synthetic placeholder data so the front end runs before real data access completes.

Run: python scripts/make_synthetic.py

Why this exists. The front end cannot be built or tested against nothing, and acquiring the real
Office for National Statistics series involves manual downloads and, for the microdata, a UK Data
Service registration with a lead time. So the shape of the data is generated here and the numbers are
placeholders.

Why it is safe. Every file carries `__meta.synthetic: true`, and the front end reads that flag and
shows a standing banner saying the figures are placeholders. The flag is the mechanism that keeps a
placeholder from becoming an invented value, which is the thing the brief forbids. The banner
disappears by itself when export_json.py overwrites these files with real output, because that script
writes `synthetic: false`.

The numbers are deliberately not close to the real ones. It would be worse, not better, for the
placeholders to look right: a plausible wrong number is quotable and a visibly synthetic one is not.
The generator uses round base values and a fixed seed so the output is reproducible, and every file
repeats the warning in its own metadata.

The study cannot run against this data. That is stated as a launch precondition in the study
protocol, and the banner is what enforces it in practice.
"""

from __future__ import annotations

import json
import math
import random
import sys
from datetime import date

from config import OUTPUT

SEED = 20260824
WARNING = (
    "SYNTHETIC PLACEHOLDER DATA. Right shape, wrong numbers. Generated for front-end development "
    "only. Not findings, not quotable, and not to be used in any study run. Replaced by real "
    "pipeline output from scripts/export_json.py."
)

AGE_BANDS = ["16-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75+"]
TENURES = ["owned-outright", "mortgaged", "private-rent", "social-rent"]
WAVES = ["Wave 3", "Wave 5", "Round 6", "Round 7", "Round 8"]

ITL1 = [
    ("TLC", "North East", 0.55),
    ("TLD", "North West", 0.68),
    ("TLE", "Yorkshire and The Humber", 0.66),
    ("TLF", "East Midlands", 0.74),
    ("TLG", "West Midlands", 0.72),
    ("TLH", "East of England", 0.95),
    ("TLI", "London", 1.40),
    ("TLJ", "South East", 1.20),
    ("TLK", "South West", 1.00),
    ("TLL", "Wales", 0.62),
    ("TLM", "Scotland", 0.70),
    ("TLN", "Northern Ireland", None),  # no WAS coverage: median must be null, never zero
]

BASE_MEDIAN = 300_000  # a round placeholder, not an estimate of anything


def meta(note: str = "") -> dict:
    return {
        "synthetic": True,
        "generated": date.today().isoformat(),
        "warning": WARNING,
        "note": note,
        "sources": [],
    }


def write(name: str, rows, note: str = "") -> None:
    dest = OUTPUT / name
    dest.write_text(json.dumps({"__meta": meta(note), "rows": rows}, separators=(",", ":")), encoding="utf-8")
    n = len(rows) if isinstance(rows, list) else 1
    print(f"  {name} ({n} rows)")


def main() -> int:
    rng = random.Random(SEED)
    print("Generating synthetic placeholder data into public/data")

    # ---- S1 wealth by decile -------------------------------------------------
    # A convex share curve summing to 1, with a dominant top decile. Shape only.
    raw = [1.05**i for i in range(10)]
    raw[-1] *= 7.0
    total = sum(raw)
    shares = [r / total for r in raw]
    thresholds, running = [], 20_000
    for i in range(10):
        running = round(running * 2.05, -3)
        thresholds.append(running)
    write(
        "wealth_by_decile.json",
        [
            {"decile": i + 1, "share": round(shares[i], 4), "threshold": thresholds[i]}
            for i in range(10)
        ],
        "Convex share curve summing to 1 with a dominant top decile. Shape only.",
    )

    # ---- S2 top-decile share and wealth-to-income ---------------------------
    rows = []
    for year in range(1980, 2021):
        t = (year - 1980) / 40
        share = 0.55 + 0.02 * t
        w2i = 3.0 + 4.0 * t
        rows.append(
            {
                "year": year,
                "topDecileShare": round(share, 4),
                "wealthToIncome": round(w2i, 2),
                # Scaled onto the same 0 to 0.8 axis as the share, so both fit one frame.
                "wealthToIncomeScaled": round(w2i / 10.0, 4),
            }
        )
    write("top_share_trend.json", rows, "Flat share against a rising wealth-to-income ratio.")

    # ---- S3 composition ------------------------------------------------------
    write(
        "wealth_composition.json",
        [
            {"component": "Property", "share": 0.40},
            {"component": "Pensions", "share": 0.35},
            {"component": "Financial", "share": 0.15},
            {"component": "Physical", "share": 0.10},
        ],
        "Round placeholder shares summing to 1.",
    )

    # ---- S5 tenure composition ----------------------------------------------
    rows = []
    for year in range(1995, 2025):
        t = (year - 1995) / 29
        outright = 0.29 + 0.04 * t
        mortgage = 0.41 - 0.14 * t
        private = 0.10 + 0.09 * t
        social = 1.0 - outright - mortgage - private
        for tenure, share, order in (
            ("Owned outright", outright, 0),
            ("Buying with mortgage", mortgage, 1),
            ("Private rented", private, 2),
            ("Social rented", social, 3),
        ):
            rows.append({"year": year, "tenure": tenure, "share": round(share, 4), "order": order})
    write("tenure_composition.json", rows, "Four tenures summing to 1 per year, England-shaped.")

    # ---- S6 and S18 static: median wealth by tenure --------------------------
    tenure_factor = {"owned-outright": 2.4, "mortgaged": 1.5, "private-rent": 0.20, "social-rent": 0.10}
    rows = []
    for wi, wave in enumerate(WAVES):
        drift = 1.0 + 0.05 * wi
        for tenure, factor in tenure_factor.items():
            rows.append(
                {
                    "wave": wave,
                    "tenure": tenure,
                    "median": int(round(BASE_MEDIAN * factor * drift, -3)),
                    "sampleSize": rng.randint(320, 1400),
                }
            )
    rows += [{**r, "wave": "latest"} for r in rows if r["wave"] == WAVES[-1]]
    write("median_wealth_by_tenure.json", rows, "Owner-to-renter gap held open across every wave.")

    # ---- S10 and S11: median wealth by age band ------------------------------
    age_factor = {"16-24": 0.06, "25-34": 0.22, "35-44": 0.60, "45-54": 1.15, "55-64": 1.70, "65-74": 1.85, "75+": 1.45}
    rows = []
    for wi, wave in enumerate(WAVES):
        for band, factor in age_factor.items():
            # Older bands drift up, younger bands drift down, so the facet comparison shows cohort
            # divergence rather than a uniform shift. Shape only.
            young = band in ("16-24", "25-34", "35-44")
            drift = (1.0 - 0.07 * wi) if young else (1.0 + 0.09 * wi)
            rows.append(
                {
                    "wave": wave,
                    "ageBand": band,
                    "median": int(round(BASE_MEDIAN * factor * drift, -3)),
                    "sampleSize": rng.randint(280, 1200),
                }
            )
    # S11 uses the near-decade pair; S10 uses the latest wave.
    facet_pair = [r for r in rows if r["wave"] in ("Wave 3", "Round 8")]
    rows = rows + [{**r, "wave": "latest"} for r in rows if r["wave"] == WAVES[-1]]
    write(
        "median_wealth_by_age.json",
        rows,
        (
            "Younger bands drift down and older bands drift up across waves, so the S11 facet shows "
            f"divergence rather than a uniform shift. S11 pairs {facet_pair[0]['wave']} against "
            "Round 8, per design spec revision r2.3."
        ),
    )

    # ---- S8 house prices -----------------------------------------------------
    rows = []
    for year in range(1995, 2027):
        t = year - 1995
        price = 60_000 * (1.048**t) * (1.0 + 0.03 * math.sin(t / 3.0))
        row = {"year": year, "price": int(round(price, -3)), "label": None}
        rows.append(row)
    rows[0]["label"] = "1995"
    rows[-1]["label"] = f"{rows[-1]['year']}: placeholder"
    write("house_prices.json", rows, "Compound growth with mild cyclicality. Shape only.")

    # ---- S9 affordability ----------------------------------------------------
    rows = []
    for year in range(1997, 2025):
        t = (year - 1997) / 27
        # Peaks before the end so the series rises, peaks and then eases, which is the shape S9
        # describes. A monotonic rise would make the peak and the latest reading the same point and
        # the two annotations would collide.
        ratio = 3.5 + 5.5 * math.sin(t * 2.05)
        rows.append({"year": year, "ratio": round(max(3.0, ratio), 2), "mark": False, "label": None})
    peak = max(rows, key=lambda r: r["ratio"])
    peak["mark"] = True
    peak["label"] = f"Peak, {peak['year']}: {peak['ratio']:.1f} times earnings (placeholder)"
    rows[-1]["mark"] = True
    rows[-1]["label"] = f"{rows[-1]['year']}: {rows[-1]['ratio']:.1f} times earnings (placeholder)"
    write("affordability.json", rows, "Rise, peak and slight easing. Exactly two marked points.")

    # ---- S13, S15 and the explorer: regional wealth and prices ---------------
    rows = []
    for code, _name, factor in ITL1:
        price_factor = factor if factor is not None else 0.60  # NI has prices but no WAS wealth
        rows.append(
            {
                "code": code,
                "median": None if factor is None else int(round(BASE_MEDIAN * factor, -3)),
                "averagePrice": int(round(250_000 * price_factor, -3)),
                "sampleSize": None if factor is None else rng.randint(400, 1600),
            }
        )
    write(
        "regional_wealth.json",
        rows,
        (
            "Twelve ITL1 areas. Northern Ireland carries a price and a NULL median, because the "
            "Wealth and Assets Survey covers Great Britain only. A null must render as a no-data "
            "class and never as zero."
        ),
    )

    # ---- S14 local authority index ------------------------------------------
    rows = []
    for area, growth in (("Kensington and Chelsea", 1.075), ("Blackpool", 1.028)):
        for year in range(1995, 2027):
            t = year - 1995
            rows.append(
                {
                    "area": area,
                    "year": year,
                    "index": round(100 * (growth**t), 1),
                    "price": int(round((900_000 if "Kensington" in area else 60_000) * (growth**t), -3)),
                }
            )
    write("local_authority_index.json", rows, "Both series indexed to 100 in 1995, per the S14 mitigation.")

    # ---- S16 missing top ----------------------------------------------------
    # CORRECTED 2026-08-24: the missing segment is 5% of the total, not 15%. See the note on
    # CAVEAT_SHORT in src/data/narrative.js. This changes the encoded geometry of the S16 bar, so it
    # is not a value-only correction.
    surveyed = 15_000
    missing = round(surveyed * 0.05 / (1 - 0.05))
    write(
        "missing_top.json",
        [
            {"category": "Total household wealth", "segment": "Observed in the survey", "amountBn": surveyed},
            {
                "category": "Total household wealth",
                "segment": "Estimated missing from the survey",
                "amountBn": missing,
            },
        ],
        "The missing segment is 5% of the total, matching the published proportion in Advani, Bangham and Leslie (2021). Levels are placeholders.",
    )

    # ---- S18, E1.2 and E7: the distribution ---------------------------------
    rows = []
    for p in range(1, 101):
        # Convex through the body, steep in the top few percentiles.
        v = 4_000 * math.exp(0.062 * p) + (0 if p < 95 else 250_000 * (p - 94) ** 2.4)
        rows.append({"percentile": p, "wealth": int(round(v, -2))})
    write("wealth_distribution.json", rows, "Monotonic, convex, with a steep top tail. Shape only.")

    # ---- The explorer lookup table ------------------------------------------
    # Marginals only, matching what ONS actually publishes. A null in a dimension means 'all'.
    # The three-way cross-tab is deliberately NOT synthesised here, because synthesising an
    # interaction from marginals is exactly the invention the brief forbids, and shipping a fake
    # cross-tab in the placeholder set would train the front end on a shape the real data cannot fill.
    rows = []
    for wi, wave in enumerate(WAVES):
        drift = 1.0 + 0.05 * wi
        for band, factor in age_factor.items():
            young = band in ("16-24", "25-34", "35-44")
            d = (1.0 - 0.07 * wi) if young else (1.0 + 0.09 * wi)
            rows.append(
                {
                    "wave": wave,
                    "ageBand": band,
                    "tenure": None,
                    "region": None,
                    "median": int(round(BASE_MEDIAN * factor * d, -3)),
                    "sampleSize": rng.randint(280, 1200),
                }
            )
        for tenure, factor in tenure_factor.items():
            rows.append(
                {
                    "wave": wave,
                    "ageBand": None,
                    "tenure": tenure,
                    "region": None,
                    "median": int(round(BASE_MEDIAN * factor * drift, -3)),
                    "sampleSize": rng.randint(320, 1400),
                }
            )
        for code, _name, factor in ITL1:
            if factor is None:
                continue
            rows.append(
                {
                    "wave": wave,
                    "ageBand": None,
                    "tenure": None,
                    "region": code,
                    "median": int(round(BASE_MEDIAN * factor * drift, -3)),
                    "sampleSize": rng.randint(400, 1600),
                }
            )
        # The all-households cell, so a lookup with everything dropped still resolves.
        rows.append(
            {
                "wave": wave,
                "ageBand": None,
                "tenure": None,
                "region": None,
                "median": int(round(BASE_MEDIAN * drift, -3)),
                "sampleSize": rng.randint(9000, 12000),
            }
        )
    write(
        "was_lookup.json",
        rows,
        (
            "Marginals only, matching what ONS publishes. A null in a dimension means 'all'. The "
            "three-way cross-tab is NOT synthesised: see the note in this file's generator and in "
            "build_lookup() in clean_was.py."
        ),
    )

    # ---- E7 Rich List aggregates -------------------------------------------
    # Placeholders. The real values must be transcribed from the published list with its edition year
    # and methodology caveat, and never recalled from memory. See the P4 confirmation log.
    write(
        "rich_list.json",
        [
            {
                "edition": "PLACEHOLDER, not a real edition",
                "entries": 350,
                "entryThresholdGBP": 300_000_000,
                "listTotalGBP": 750_000_000_000,
                "largestFortuneGBP": 35_000_000_000,
                "sourceNote": "PLACEHOLDER. Transcribe the three aggregates from the published list.",
            }
        ],
        "Placeholder aggregates. Must be replaced by transcribed published values before any study run.",
    )

    # ---- Boundaries ---------------------------------------------------------
    write_boundaries()

    print(
        "\nDone. Every file carries __meta.synthetic = true, so the artefact will show its\n"
        "placeholder-data banner. The study cannot run until real pipeline output replaces these."
    )
    return 0


def write_boundaries() -> None:
    """Crude rectangular placeholder boundaries, arranged roughly geographically.

    Not a map of anything. Twelve labelled rectangles in approximately the right relative positions,
    so the choropleth renders, the colour scale can be checked and the code join can be tested. The
    real product is the ONS Open Geography Portal ITL1 ultra generalised clipped boundary set, written
    by scripts/build_geojson.py.
    """
    # A tidy, non-overlapping grid, arranged roughly by geography so the choropleth reads as
    # obviously schematic rather than as a bad map. Twelve equal cells: nobody can mistake this for
    # cartography, which is the point while the data is a placeholder.
    grid = [
        ("TLM", "Scotland", 1, 0),
        ("TLN", "Northern Ireland", 0, 1),
        ("TLC", "North East", 2, 1),
        ("TLD", "North West", 1, 2),
        ("TLE", "Yorkshire and The Humber", 2, 2),
        ("TLL", "Wales", 0, 3),
        ("TLG", "West Midlands", 1, 3),
        ("TLF", "East Midlands", 2, 3),
        ("TLH", "East of England", 3, 3),
        ("TLK", "South West", 0, 4),
        ("TLJ", "South East", 2, 4),
        ("TLI", "London", 3, 4),
    ]
    cell, gap = 1.6, 0.12
    boxes = [
        (code, name, -8.0 + col * (cell + gap), 58.0 - row * (cell + gap) - cell, cell, cell)
        for code, name, col, row in grid
    ]
    features = []
    for code, name, x, y, w, h in boxes:
        features.append(
            {
                "type": "Feature",
                "properties": {"code": code, "name": name},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]],
                },
            }
        )
    dest = OUTPUT / "regional_boundaries.json"
    dest.write_text(
        json.dumps(
            {
                "__meta": meta(
                    "Twelve labelled rectangles in roughly the right relative positions. Not a map of "
                    "anything. Real boundaries come from the ONS Open Geography Portal via "
                    "scripts/build_geojson.py."
                ),
                "type": "FeatureCollection",
                "features": features,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"  regional_boundaries.json ({len(features)} placeholder features)")


if __name__ == "__main__":
    sys.exit(main())
