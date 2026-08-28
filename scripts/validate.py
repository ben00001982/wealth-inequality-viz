"""Validate the front-end JSON outputs before they are served.

Run: python scripts/validate.py

Checks structure, ranges and cross-file consistency, and exits non-zero on failure so it can gate a
deploy. The checks are the ones declared in OUTPUT_SCHEMA in config.py, plus the cross-file checks
that no single file can make on its own.

The most important check is the last one. A mixed set, where some files are real and some are still
synthetic placeholders, is worse than an all-synthetic set: it invites a comparison between a real
series and a made-up one, and the result of that comparison means nothing. The validator treats a
mixed set as a failure rather than a warning.
"""

from __future__ import annotations

import json
import sys

from config import OUTPUT, OUTPUT_SCHEMA
from clean_was import MIN_CELL_SIZE

AGE_BANDS = {"16-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75+"}
TENURES = {"owned-outright", "mortgaged", "private-rent", "social-rent"}
ITL1_CODES = {
    "TLC", "TLD", "TLE", "TLF", "TLG", "TLH",
    "TLI", "TLJ", "TLK", "TLL", "TLM", "TLN",
}

failures: list[str] = []
warnings: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def load(name: str):
    path = OUTPUT / name
    if not path.exists():
        fail(f"{name}: missing. Run make_synthetic.py or the real pipeline.")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"{name}: not valid JSON ({exc}).")
        return None


def rows_of(payload):
    if payload is None:
        return []
    if isinstance(payload, list):
        return payload
    return payload.get("rows", [])


def check_fields(name: str, rows: list[dict], fields: list[str]) -> None:
    if not rows:
        fail(f"{name}: no rows.")
        return
    present = set(rows[0].keys())
    for f in fields:
        if "." in f or " " in f:  # descriptive entries in the schema, not field names
            continue
        if f not in present:
            fail(f"{name}: expected field '{f}' not present. Found {sorted(present)}.")


def approx(value: float, target: float, tol: float = 0.02) -> bool:
    return abs(value - target) <= tol


def main() -> int:
    print("Validating public/data")

    payloads = {name: load(name) for name in OUTPUT_SCHEMA}

    # ---- Structural: declared fields present -------------------------------
    for name, spec in OUTPUT_SCHEMA.items():
        payload = payloads.get(name)
        if payload is None:
            continue
        if name == "regional_boundaries.json":
            continue  # GeoJSON, checked separately
        rows = rows_of(payload)
        check_fields(name, rows, spec["fields"])
        if "rows" in spec and len(rows) != spec["rows"]:
            # A count mismatch is a warning rather than a failure for files whose length depends on
            # how many years or waves the release covers.
            (fail if name in {"wealth_by_decile.json", "wealth_distribution.json"} else warn)(
                f"{name}: expected {spec['rows']} rows, found {len(rows)}."
            )

    # ---- wealth_by_decile ---------------------------------------------------
    rows = rows_of(payloads.get("wealth_by_decile.json"))
    if rows:
        total = sum(r["share"] for r in rows)
        if not approx(total, 1.0):
            fail(f"wealth_by_decile: shares sum to {total:.4f}, expected 1.0.")
        if sorted(r["decile"] for r in rows) != list(range(1, 11)):
            fail("wealth_by_decile: deciles must be 1 to 10 with no gaps or duplicates.")
        thresholds = [r["threshold"] for r in sorted(rows, key=lambda r: r["decile"])]
        if any(b <= a for a, b in zip(thresholds, thresholds[1:])):
            fail("wealth_by_decile: thresholds must increase with decile.")

    # ---- wealth_composition -------------------------------------------------
    rows = rows_of(payloads.get("wealth_composition.json"))
    if rows:
        total = sum(r["share"] for r in rows)
        if not approx(total, 1.0):
            fail(f"wealth_composition: shares sum to {total:.4f}, expected 1.0.")

    # ---- tenure_composition -------------------------------------------------
    rows = rows_of(payloads.get("tenure_composition.json"))
    if rows:
        by_year: dict[int, float] = {}
        tenures_per_year: dict[int, set] = {}
        for r in rows:
            by_year[r["year"]] = by_year.get(r["year"], 0) + r["share"]
            tenures_per_year.setdefault(r["year"], set()).add(r["tenure"])
        bad = {y: s for y, s in by_year.items() if not approx(s, 1.0, 0.03)}
        if bad:
            fail(
                f"tenure_composition: shares do not sum to 1.0 in {len(bad)} years "
                f"(for example {list(bad.items())[:3]})."
            )
        sets = {frozenset(v) for v in tenures_per_year.values()}
        if len(sets) > 1:
            fail("tenure_composition: the tenure category set is not constant across years.")

    # ---- age bands and tenures match the front end --------------------------
    rows = rows_of(payloads.get("median_wealth_by_age.json"))
    if rows:
        found = {r["ageBand"] for r in rows}
        if not found <= AGE_BANDS:
            fail(
                f"median_wealth_by_age: unexpected age bands {sorted(found - AGE_BANDS)}. "
                "These must match AGE_BANDS in src/data/lookup.js exactly."
            )

    rows = rows_of(payloads.get("median_wealth_by_tenure.json"))
    if rows:
        found = {r["tenure"] for r in rows}
        if not found <= TENURES:
            fail(
                f"median_wealth_by_tenure: unexpected tenures {sorted(found - TENURES)}. "
                "These must match TENURES in src/data/lookup.js exactly."
            )
        if not any(r["wave"] == "latest" for r in rows):
            fail(
                "median_wealth_by_tenure: no rows tagged wave='latest'. The static S18 comparison "
                "reads that tag."
            )

    # ---- affordability ------------------------------------------------------
    rows = rows_of(payloads.get("affordability.json"))
    if rows:
        out_of_range = [r for r in rows if not 1 <= r["ratio"] <= 20]
        if out_of_range:
            fail(f"affordability: {len(out_of_range)} rows outside a plausible ratio range of 1 to 20.")
        marked = [r for r in rows if r.get("mark")]
        if len(marked) != 2:
            warn(f"affordability: {len(marked)} marked points, expected exactly 2 (peak and latest).")

    # ---- regional wealth ----------------------------------------------------
    rows = rows_of(payloads.get("regional_wealth.json"))
    region_codes = set()
    if rows:
        region_codes = {r["code"] for r in rows}
        if region_codes != ITL1_CODES:
            fail(
                f"regional_wealth: ITL1 code set mismatch. Missing "
                f"{sorted(ITL1_CODES - region_codes)}, unexpected {sorted(region_codes - ITL1_CODES)}."
            )
        ni = next((r for r in rows if r["code"] == "TLN"), None)
        if ni is not None and ni.get("median") is not None:
            fail(
                "regional_wealth: Northern Ireland (TLN) carries a wealth median. The Wealth and "
                "Assets Survey covers Great Britain only, so this must be null and must render as a "
                "no-data class, never as zero."
            )

    # ---- boundaries ---------------------------------------------------------
    gj = payloads.get("regional_boundaries.json")
    if gj:
        features = gj.get("features", [])
        if gj.get("type") != "FeatureCollection":
            fail("regional_boundaries: not a FeatureCollection.")
        codes = {f.get("properties", {}).get("code") for f in features}
        if None in codes:
            fail("regional_boundaries: at least one feature carries no ITL1 code.")
        if region_codes and codes != region_codes:
            fail(
                "regional_boundaries: codes do not match regional_wealth.json. Missing "
                f"{sorted(region_codes - codes)}, unexpected {sorted(codes - region_codes)}. "
                "The join is on code, never on name."
            )
        size = (OUTPUT / "regional_boundaries.json").stat().st_size
        if size > 1_000_000:
            warn(
                f"regional_boundaries: {size / 1_000_000:.1f} MB. Confirm the ultra generalised "
                "clipped (BUC) product was used rather than a full-resolution one."
            )

    # ---- distribution -------------------------------------------------------
    rows = rows_of(payloads.get("wealth_distribution.json"))
    if rows:
        ordered = sorted(rows, key=lambda r: r["percentile"])
        if [r["percentile"] for r in ordered] != list(range(1, 101)):
            fail("wealth_distribution: percentiles must be 1 to 100 with no gaps.")
        vals = [r["wealth"] for r in ordered]
        if any(b < a for a, b in zip(vals, vals[1:])):
            fail("wealth_distribution: wealth must be non-decreasing across percentiles.")

    # ---- lookup table -------------------------------------------------------
    rows = rows_of(payloads.get("was_lookup.json"))
    if rows:
        thin = [r for r in rows if (r.get("sampleSize") or 0) < MIN_CELL_SIZE]
        if thin:
            fail(
                f"was_lookup: {len(thin)} rows below the minimum cell size of {MIN_CELL_SIZE}. "
                "Thin cells must be dropped in cleaning, not filtered in the browser."
            )
        if not any(
            r.get("ageBand") is None and r.get("tenure") is None and r.get("region") is None
            for r in rows
        ):
            fail(
                "was_lookup: no all-households row (every dimension null). The degradation path in "
                "lookupMedian ends there, so without it a thin cell resolves to nothing."
            )
        bad_regions = {r["region"] for r in rows if r.get("region")} - ITL1_CODES
        if bad_regions:
            fail(f"was_lookup: non-ITL1 region codes {sorted(bad_regions)}.")

    # ---- missing top --------------------------------------------------------
    rows = rows_of(payloads.get("missing_top.json"))
    if rows:
        total = sum(r["amountBn"] for r in rows)
        missing = sum(r["amountBn"] for r in rows if "missing" in r["segment"].lower())
        if total and not approx(missing / total, 0.05, 0.01):
            warn(
                f"missing_top: the missing segment is {missing / total:.1%} of the total. The "
                "published estimate is about 5% (Advani, Bangham and Leslie, 2021)."
            )

    # ---- provenance: the check that matters most ----------------------------
    flags = {}
    for name, payload in payloads.items():
        if payload is None:
            continue
        meta = payload.get("__meta") if isinstance(payload, dict) else None
        if meta is None:
            fail(f"{name}: no __meta block. Every served file must declare its provenance.")
            continue
        flags[name] = bool(meta.get("synthetic"))

    if flags:
        synthetic = [n for n, f in flags.items() if f]
        real = [n for n, f in flags.items() if not f]
        if synthetic and real:
            fail(
                "MIXED PROVENANCE. Real and synthetic files are being served together, which is "
                f"worse than either alone.\n    synthetic: {sorted(synthetic)}\n    real: {sorted(real)}\n"
                "    Re-run the pipeline so every file comes from one source."
            )
        elif synthetic:
            print(
                f"  provenance: all {len(synthetic)} files are SYNTHETIC placeholders. The artefact "
                "will show its placeholder banner, and the study must not run against this build."
            )
        else:
            print(f"  provenance: all {len(real)} files are real pipeline output.")
            for name, payload in payloads.items():
                meta = payload.get("__meta", {}) if isinstance(payload, dict) else {}
                for s in meta.get("sources", []):
                    if "NOT RECORDED" in str(s.get("edition")) or "NOT RECORDED" in str(
                        s.get("accessDate")
                    ):
                        fail(
                            f"{name}: source '{s.get('title')}' has no edition or access date. The "
                            "report's data provenance needs both."
                        )

    # ---- report -------------------------------------------------------------
    print()
    for w in warnings:
        print(f"  WARN  {w}")
    for f in failures:
        print(f"  FAIL  {f}")
    print()
    if failures:
        print(f"{len(failures)} failure(s), {len(warnings)} warning(s).")
        return 1
    print(f"All checks passed. {len(warnings)} warning(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
