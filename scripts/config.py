"""Pipeline configuration: paths, the dataset registry, and the schema of every output file.

Nothing in this file downloads anything. Automated retrieval was deliberately not built, for two
reasons. The Office for National Statistics release pages are not stable download endpoints, so a
scraper would break silently and the failure mode is the worst possible one: a pipeline that
produces plausible output from the wrong edition. And every source has to be recorded with its
edition and access date for the report's data provenance anyway, which is a human act. So the
registry below records exactly what to fetch and where to put it, and the cleaning scripts refuse
to run until the file is there.

The registry is the machine-readable half of
`wealth-viz_p4-data-acquisition-manifest_v1`. If the two disagree, the manifest is authoritative:
it carries the licence reasoning and the registration position, which do not belong in code.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
OUTPUT = ROOT / "public" / "data"

for _p in (RAW, PROCESSED, OUTPUT):
    _p.mkdir(parents=True, exist_ok=True)


@dataclass
class Source:
    """One acquisition target."""

    key: str
    publisher: str
    title: str
    landing_page: str
    expected_filename: str
    fmt: str
    licence: str
    geography: str
    notes: str = ""
    access_date: str | None = None  # filled in by hand when the file is downloaded
    edition: str | None = None  # filled in by hand: the edition or release actually used


#: The five source families named in the brief, plus the two the build actually needs and the brief
#: does not name. That discrepancy is real and is flagged in the acquisition manifest section 8: the
#: Family Resources Survey is named in the brief but feeds nothing on the critical path, while the
#: English Housing Survey feeds the tenure composition chart and is not named. The cleanest fix is to
#: restate the brief's data list to match the build; until Ben decides, both are carried here and
#: FRS is marked optional.
SOURCES: dict[str, Source] = {
    "was_household": Source(
        key="was_household",
        publisher="Office for National Statistics",
        title="Household total wealth in Great Britain",
        landing_page=(
            "https://www.ons.gov.uk/peoplepopulationandcommunity/personalandhouseholdfinances/"
            "incomeandwealth/bulletins/totalwealthingreatbritain/"
        ),
        expected_filename="was_household_total_wealth.xlsx",
        fmt="xlsx",
        licence="Open Government Licence v3.0 (confirm on the release page)",
        geography="Great Britain, and by region",
        notes=(
            "Carries the decile thresholds and shares, the composition split, and the regional and "
            "age-band and tenure breakdowns. Accreditation was suspended in June 2025: the release "
            "must be cited with that caveat. The survey basis changed from a July-to-June year to an "
            "April-to-March year at Round 6, and the published workbook is split into two "
            "overlapping blocks, so a naive year column double-counts. See temporal_alignment.py."
        ),
    ),
    "was_regional": Source(
        key="was_regional",
        publisher="Office for National Statistics",
        title="Household wealth by region, Wealth and Assets Survey",
        landing_page=(
            "https://www.ons.gov.uk/peoplepopulationandcommunity/personalandhouseholdfinances/"
            "incomeandwealth/datasets/"
        ),
        expected_filename="was_regional_wealth.xlsx",
        fmt="xlsx",
        licence="Open Government Licence v3.0 (confirm on the release page)",
        geography=(
            "Eleven areas: the nine English regions plus Wales and Scotland. Great Britain only, no "
            "Northern Ireland, and nothing published below region."
        ),
        notes=(
            "This is the constraint that fixes the artefact's geography at ITL1. There is no "
            "published sub-regional wealth cut, so any finer map would be an invention."
        ),
    ),
    "hpi": Source(
        key="hpi",
        publisher="HM Land Registry and Office for National Statistics",
        title="UK House Price Index, full series",
        landing_page="https://www.gov.uk/government/collections/uk-house-price-index-reports",
        expected_filename="uk_hpi_full.csv",
        fmt="csv",
        licence="Open Government Licence v3.0 (confirm on the release page)",
        geography="United Kingdom, by country, region and local authority",
        notes=(
            "The 1995 baselines for the regional and local-authority series are only in the full CSV "
            "download, which is why S13b and S14b are still open. Filter to the ITL1 areas and to "
            "Kensington and Chelsea and Blackpool respectively."
        ),
    ),
    "affordability": Source(
        key="affordability",
        publisher="Office for National Statistics",
        title="Housing affordability in England and Wales",
        landing_page=(
            "https://www.ons.gov.uk/peoplepopulationandcommunity/housing/bulletins/"
            "housingaffordabilityinenglandandwales/"
        ),
        expected_filename="affordability_ratios.xlsx",
        fmt="xlsx",
        licence="Open Government Licence v3.0 (confirm on the release page)",
        geography="England and Wales",
        notes=(
            "Median house price to median gross annual earnings. Note the geography: England and "
            "Wales, not the United Kingdom, and the step wording must not generalise it."
        ),
    ),
    "ehs_tenure": Source(
        key="ehs_tenure",
        publisher="Ministry of Housing, Communities and Local Government",
        title="English Housing Survey, headline tenure trends",
        landing_page="https://www.gov.uk/government/collections/english-housing-survey",
        expected_filename="ehs_tenure_trends.xlsx",
        fmt="xlsx",
        licence="Open Government Licence v3.0 (confirm on the release page)",
        geography="England only",
        notes=(
            "Feeds tenure_composition.json. NOT named in the brief's data list, which names the "
            "Family Resources Survey instead. Flagged in the acquisition manifest as a brief "
            "correction rather than a substitution made silently."
        ),
    ),
    "frs": Source(
        key="frs",
        publisher="Department for Work and Pensions",
        title="Family Resources Survey",
        landing_page="https://www.gov.uk/government/collections/family-resources-survey--2",
        expected_filename="frs_summary.xlsx",
        fmt="xlsx",
        licence="Open Government Licence v3.0 for published tables; microdata via UK Data Service",
        geography="United Kingdom",
        notes=(
            "OPTIONAL for the current build: nothing on the critical path depends on it. Named in "
            "the brief, so it is retained here rather than dropped without a decision. Microdata "
            "needs a UK Data Service registration, which has a lead time; the published tables do "
            "not."
        ),
    ),
    "itl1_boundaries": Source(
        key="itl1_boundaries",
        publisher="Office for National Statistics Open Geography Portal",
        title="International Territorial Level 1 boundaries, ultra generalised clipped",
        landing_page="https://geoportal.statistics.gov.uk/",
        expected_filename="itl1_buc.geojson",
        fmt="geojson",
        licence=(
            "Open Government Licence v3.0, with dual attribution required: Office for National "
            "Statistics and Ordnance Survey. Confirm the exact wording on the product page."
        ),
        geography="United Kingdom, twelve ITL1 areas",
        notes=(
            "Use the BUC (ultra generalised, clipped, 500m) product for a web choropleth; BGC is the "
            "fallback and is also what to use for any ITL2 view. Never BFC or BFE: full-resolution "
            "boundaries are tens of megabytes and will not serve acceptably from GitHub Pages. Take "
            "the boundary file and the code list from the same edition, and join on the ITL1 code, "
            "never on the area name."
        ),
    ),
    "rich_list": Source(
        key="rich_list",
        publisher="The Sunday Times",
        title="The Sunday Times Rich List",
        landing_page="https://www.thetimes.com/sunday-times-rich-list",
        expected_filename="rich_list_aggregates.json",
        fmt="json",
        licence=(
            "NOT open data. Only published aggregates are used (entry threshold, list total, largest "
            "single fortune) as attributed figures under fair quotation. No individual is named and "
            "no list is reproduced."
        ),
        geography="United Kingdom",
        notes=(
            "The publication is paywalled, so primary verification is a human step: open the "
            "published list, record the edition year and the three aggregate figures, and note the "
            "methodology caveat. Never bake these values in from memory."
        ),
    ),
}

#: Front-end output files. The first eight are the set named in the tech stack; the rest are needed
#: by steps the frozen design spec specifies and are documented alongside them in
#: docs/DATA-PIPELINE.md rather than being added quietly.
OUTPUT_SCHEMA: dict[str, dict] = {
    "wealth_by_decile.json": {
        "fields": ["decile", "share", "threshold"],
        "rows": 10,
        "feeds": "S1",
        "checks": ["share sums to 1.0 within tolerance", "decile 1..10", "threshold increasing"],
    },
    "tenure_composition.json": {
        "fields": ["year", "tenure", "share", "order"],
        "feeds": "S5",
        "checks": ["share sums to 1.0 per year", "tenure set constant across years"],
    },
    "median_wealth_by_tenure.json": {
        "fields": ["wave", "tenure", "median", "sampleSize"],
        "feeds": "S6, S18 static comparison",
        "checks": ["median positive", "sampleSize >= minimum cell size or row omitted"],
    },
    "median_wealth_by_age.json": {
        "fields": ["wave", "ageBand", "median", "sampleSize"],
        "feeds": "S10, S11",
        "checks": ["age bands match src/data/lookup.js AGE_BANDS exactly"],
    },
    "house_prices.json": {
        "fields": ["year", "price", "label"],
        "feeds": "S8",
        "checks": ["year monotonic", "price positive"],
    },
    "affordability.json": {
        "fields": ["year", "ratio", "mark", "label"],
        "feeds": "S9",
        "checks": ["ratio between 1 and 20", "exactly two rows carry mark=true"],
    },
    "regional_wealth.json": {
        "fields": ["code", "median", "averagePrice", "sampleSize"],
        "rows": 12,
        "feeds": "S13, S15, explorer",
        "checks": [
            "code is a valid ITL1 code",
            "Northern Ireland (TLN) median is null, not zero",
            "all twelve ITL1 codes present",
        ],
    },
    "regional_boundaries.json": {
        "fields": ["GeoJSON FeatureCollection", "properties.code", "properties.name"],
        "feeds": "S13, S15, explorer choropleths",
        "checks": [
            "every feature carries an ITL1 code",
            "codes match regional_wealth.json exactly",
            "file under 1 MB after generalisation",
        ],
    },
    "top_share_trend.json": {
        "fields": ["year", "topDecileShare", "wealthToIncome", "wealthToIncomeScaled"],
        "feeds": "S2",
        "checks": ["topDecileShare between 0 and 1"],
    },
    "wealth_composition.json": {
        "fields": ["component", "share"],
        "feeds": "S3",
        "checks": ["share sums to 1.0 within tolerance"],
    },
    "local_authority_index.json": {
        "fields": ["area", "year", "index", "price"],
        "feeds": "S14",
        "checks": ["both areas indexed to 100 in the base year"],
    },
    "was_lookup.json": {
        "fields": ["wave", "ageBand", "tenure", "region", "median", "sampleSize"],
        "feeds": "S18, the whole explorer",
        "checks": [
            "marginals present (a null in a dimension means all)",
            "no row with sampleSize below the minimum cell size",
            "region codes are ITL1 codes",
        ],
    },
    "wealth_distribution.json": {
        "fields": ["percentile", "wealth"],
        "rows": 100,
        "feeds": "S18, E1.2, E7",
        "checks": ["percentile 1..100", "wealth monotonic non-decreasing"],
    },
    "missing_top.json": {
        "fields": ["category", "segment", "amountBn"],
        "feeds": "S16",
        "checks": ["two segments", "missing segment is about 5% of the total"],
    },
    "rich_list.json": {
        "fields": ["edition", "entries", "entryThresholdGBP", "listTotalGBP", "largestFortuneGBP"],
        "feeds": "E7",
        "checks": ["edition year recorded", "every figure carries a source note"],
    },
}


def raw_path(key: str) -> Path:
    """Where a source file must be placed before its cleaning script will run."""
    return RAW / SOURCES[key].expected_filename


def require_raw(key: str) -> Path:
    """Return the raw path, or fail with instructions rather than with a stack trace.

    A missing input is the normal state of this repository, not an error condition: the raw files are
    gitignored because they are large and because their licences are per-source. So the failure
    message has to be the acquisition instruction.
    """
    src = SOURCES[key]
    path = raw_path(key)
    if path.exists():
        return path
    raise FileNotFoundError(
        f"\nMissing input for '{key}'.\n"
        f"  Expected file : {path}\n"
        f"  Source        : {src.publisher}, {src.title}\n"
        f"  Landing page  : {src.landing_page}\n"
        f"  Format        : {src.fmt}\n"
        f"  Licence       : {src.licence}\n"
        f"  Geography     : {src.geography}\n"
        f"  Notes         : {src.notes}\n\n"
        "Download it by hand, record the edition and access date in the acquisition manifest and in\n"
        "SOURCES above, then re-run. Do not substitute an approximate series: the project's hard\n"
        "constraint is that no value is invented or approximated.\n"
    )
