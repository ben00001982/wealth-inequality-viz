"""Prepare the ITL1 boundary file for the web choropleths.

Run: python scripts/build_geojson.py

Takes the Open Geography Portal ITL1 boundary download and produces a small GeoJSON with only the
properties the front end needs, plus a size report. Does not re-project: Vega-Lite's `projection`
handles that at render time, and re-projecting here would bake a choice into the data that belongs in
the encoding.

Three decisions worth recording.

Generalisation level. Use the ultra generalised clipped product (BUC, 500m). Full-resolution
boundaries are tens of megabytes and will not serve acceptably from GitHub Pages, and at the display
size of a regional choropleth the extra vertices are invisible. BGC is the fallback and is what to
use for any ITL2 view. Never BFC or BFE.

Property stripping. The download carries a dozen fields per feature and the front end needs two: the
ITL1 code and the name. Everything else is removed, which is most of the file size saving after
generalisation.

Codes, never names. The join between the boundary file and the wealth or price data is on the ITL1
code. ONS name forms differ between outputs, notably the capitalisation in "Yorkshire and The
Humber", and a name join fails silently by dropping a region rather than raising. The script checks
that every feature carries a recognised code and fails if one does not.
"""

from __future__ import annotations

import json
import sys

from config import OUTPUT, require_raw

ITL1_CODES = {
    "TLC": "North East",
    "TLD": "North West",
    "TLE": "Yorkshire and The Humber",
    "TLF": "East Midlands",
    "TLG": "West Midlands",
    "TLH": "East of England",
    "TLI": "London",
    "TLJ": "South East",
    "TLK": "South West",
    "TLL": "Wales",
    "TLM": "Scotland",
    "TLN": "Northern Ireland",
}

#: Candidate property names for the code, in order of preference. The Open Geography Portal has used
#: several over the years and the field name carries the edition, for example ITL125CD for the
#: January 2025 edition. Checked in order rather than hard-coded, but the edition actually found is
#: reported so it can be recorded in the manifest.
CODE_FIELDS = ["ITL125CD", "ITL124CD", "ITL121CD", "ITL1CD", "NUTS118CD", "nuts118cd", "code"]
NAME_FIELDS = ["ITL125NM", "ITL124NM", "ITL121NM", "ITL1NM", "NUTS118NM", "nuts118nm", "name"]

SIZE_WARN_BYTES = 1_000_000


def _first_present(props: dict, candidates: list[str]) -> tuple[str | None, str | None]:
    for c in candidates:
        if c in props and props[c]:
            return c, str(props[c])
    return None, None


def main() -> int:
    path = require_raw("itl1_boundaries")
    print(f"Reading {path.name} ({path.stat().st_size / 1_000_000:.1f} MB)")

    with path.open(encoding="utf-8") as fh:
        gj = json.load(fh)

    if gj.get("type") != "FeatureCollection":
        raise SystemExit(
            f"\nExpected a GeoJSON FeatureCollection, found type '{gj.get('type')}'.\n"
            "If the download is a TopoJSON or a shapefile, convert it first. The Open Geography\n"
            "Portal offers GeoJSON directly from the product page.\n"
        )

    features = gj.get("features", [])
    print(f"  {len(features)} features")

    code_field_used: str | None = None
    out_features = []
    unmatched = []

    for f in features:
        props = f.get("properties", {}) or {}
        code_field, code = _first_present(props, CODE_FIELDS)
        _, name = _first_present(props, NAME_FIELDS)
        if code_field and code_field_used is None:
            code_field_used = code_field
        if code not in ITL1_CODES:
            unmatched.append({k: props.get(k) for k in list(props)[:4]})
            continue
        out_features.append(
            {
                "type": "Feature",
                "properties": {"code": code, "name": ITL1_CODES[code]},
                "geometry": f.get("geometry"),
            }
        )

    if unmatched:
        raise SystemExit(
            f"\n{len(unmatched)} features carried no recognised ITL1 code.\n"
            f"First few property sets: {unmatched[:3]}\n"
            "Either the download is at the wrong level (ITL2 or ITL3 rather than ITL1), or the code\n"
            "field name has changed. Add the field name to CODE_FIELDS. Do not proceed with a\n"
            "partial boundary set: a missing region renders as a hole in the map and reads as zero.\n"
        )

    found = {f["properties"]["code"] for f in out_features}
    missing = set(ITL1_CODES) - found
    if missing:
        raise SystemExit(
            f"\nMissing ITL1 areas: {sorted(missing)} ({[ITL1_CODES[m] for m in sorted(missing)]}).\n"
            "All twelve must be present, including Northern Ireland, which is drawn but carries no\n"
            "wealth value because the Wealth and Assets Survey covers Great Britain only.\n"
        )

    out = {
        "__meta": {
            "synthetic": False,
            "source": "ONS Open Geography Portal, ITL1 boundaries",
            "codeFieldInSource": code_field_used,
            "note": (
                "Properties stripped to code and name. Join on code, never on name. Northern Ireland "
                "is present as a boundary and carries no Wealth and Assets Survey value."
            ),
        },
        "type": "FeatureCollection",
        "features": out_features,
    }

    dest = OUTPUT / "regional_boundaries.json"
    dest.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    size = dest.stat().st_size
    print(f"  wrote {dest.name} ({size / 1000:.0f} kB, code field in source: {code_field_used})")

    if size > SIZE_WARN_BYTES:
        print(
            f"  WARNING: {size / 1_000_000:.1f} MB is large for a web choropleth served from GitHub\n"
            "           Pages. Confirm the download was the ultra generalised clipped (BUC) product\n"
            "           rather than a full-resolution one."
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
