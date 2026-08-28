# Data pipeline

How the source data becomes the fifteen JSON files the front end serves. Written for whoever runs the
pipeline for the first time against real downloads.

## Run order

```bash
pip install -r scripts/requirements.txt
python scripts/clean_was.py        # the Wealth and Assets Survey workbooks
python scripts/clean_hpi.py        # the House Price Index full series, and affordability
python scripts/clean_frs.py        # the English Housing Survey tenure series (and FRS if used)
python scripts/build_geojson.py    # ITL1 boundaries, straight into public/data
python scripts/export_json.py      # tidy tables to the fifteen front-end files
python scripts/validate.py         # the gate: structure, ranges, cross-file, provenance
```

The cleaning scripts write tidy CSV into `data/processed`. Only `export_json.py` and
`build_geojson.py` write into `public/data`. That separation is deliberate: the tidy layer can be
inspected on its own, and a front-end shape change does not mean re-reading the workbooks.

Before any of that will run, the raw files have to be in `data/raw` with the names
`scripts/config.py` expects. Nothing downloads them. `require_raw()` fails with the publisher, the
landing page, the licence, the geography and the reason, because a missing input is the normal state
of a fresh clone rather than an error.

Automated retrieval was not built on purpose. The release pages are not stable download endpoints, so
a scraper would break silently, and the failure mode is the worst one available: a pipeline that
produces plausible output from the wrong edition. Every source also has to be recorded with its
edition and access date for the report's provenance, which is a human act.

## Sources, and the discrepancy in the brief

Five families are named in the brief: the Wealth and Assets Survey, the House Price Index, the Family
Resources Survey, Census 2021 and Open Geography. The build actually needs the English Housing Survey
for the tenure composition chart at S5, and the English Housing Survey is not in that list. Meanwhile
the Family Resources Survey is in the list and feeds nothing on the critical path.

That is a discrepancy in the brief, not in the build, and it is recorded in
`wealth-viz_p4-data-acquisition-manifest_v1` section 8 with three options. The cleanest is to restate
the brief's data list to match what the artefact uses. Until that decision is made, `clean_frs.py`
cleans the English Housing Survey series, which the build needs, and carries an optional FRS branch
that runs only if the file is present. The script keeps its name because the tech stack reference and
the report's pipeline description both refer to `clean_frs.py`.

Geography deserves its own note. The United Kingdom replaced NUTS with ITL from 1 January 2021, and
ITL1 mirrors the former NUTS1 at twelve areas, so the project's stated NUTS1 standard is superseded in
name only. Two rules follow and the scripts enforce both: join on the ITL1 code and never on the area
name, because published name forms differ between ONS outputs; and take the boundary file and the
code list from the same edition.

## Temporal alignment, and the two traps

The rule, recorded as a project decision on 11 June 2026: use the survey wave midpoint as the
reference year and select the closest annual House Price Index or Family Resources Survey point.
`scripts/temporal_alignment.py` holds the wave calendar and prints the whole alignment when run
directly, which is what belongs in the report appendix.

**The basis change.** Waves up to Wave 5 ran on a July-to-June year and Round 6 onwards run on an
April-to-March year. The published workbook is split into two blocks that overlap in calendar terms:
April to June 2016 falls inside both. A script that reads a year column and plots it will
double-count that quarter and produce a series with two points for some years. Waves are therefore
held as explicit start and end dates and never as a year, and one block must be dropped for the
overlapping quarter with the choice recorded.

**The 2010-versus-2020 request.** The frozen design spec asked S11 to compare 2010 against 2020. No
wave has a midpoint in either year, so that pairing cannot be produced from this survey at all. The
closest honest near-decade pairing is Wave 3 (July 2010 to June 2012) against Round 8 (April 2020 to
March 2022), which is what `near_decade_pair()` returns. This is design spec revision r2.3, and the
labels must be shown as published rather than rounded, because rounding them is what created the
original error.

## The cross-tabulation problem

The explorer wants median wealth by age band by tenure by region. ONS does not publish that
three-way cross-tabulation. There are two honest routes and one dishonest one.

The first honest route is to obtain the Wealth and Assets Survey microdata through the UK Data
Service, which needs registration and, for the detailed variables, a Secure Access agreement, and to
compute the cross-tab under disclosure control. That has a lead time, which is why it is flagged in
the acquisition manifest's registration section.

The second is to ship the published marginals with a null marking "all" in each dimension, and let
the lookup degrade to the finest published cut. `lookupMedian` in `src/data/lookup.js` drops region
first, then age band, then tenure, until the cell clears the minimum sample size, and always reports
which dimensions it dropped so the interface can say so. Region goes first because it has the most
categories and therefore the thinnest cells; tenure goes last because it is the structural divide the
piece is about.

The dishonest route is to synthesise the interaction from the marginals, for example by scaling a
regional median by a tenure ratio. That produces a number that looks like data and is not, and it is
exactly what the brief forbids. `build_lookup()` takes the second route and says so in its docstring.

One visible consequence: in the explorer's cross-filter view the three panels show marginals with the
current selection highlighted, rather than genuinely re-filtering one another. With marginals only, a
true cross-filter would return the same degraded value for every category in a panel, and three
panels of identical bars would look broken and would imply a cut the data does not support. If the
microdata is later obtained, those three memos become true cross-filters and nothing else changes.

## The output files

| File | Fields | Feeds | Checks |
|---|---|---|---|
| `wealth_by_decile.json` | decile, share, threshold | S1 | shares sum to 1; deciles 1 to 10; thresholds increasing |
| `top_share_trend.json` | year, topDecileShare, wealthToIncome, wealthToIncomeScaled | S2 | share between 0 and 1 |
| `wealth_composition.json` | component, share | S3 | shares sum to 1 |
| `tenure_composition.json` | year, tenure, share, order | S5 | shares sum to 1 per year; category set constant |
| `median_wealth_by_tenure.json` | wave, tenure, median, sampleSize | S6, static S18 | tenures match the front end; a `latest` tag exists |
| `median_wealth_by_age.json` | wave, ageBand, median, sampleSize | S10, S11 | age bands match the front end exactly |
| `house_prices.json` | year, price, label | S8 | year monotonic; price positive |
| `affordability.json` | year, ratio, mark, label | S9 | ratio between 1 and 20; exactly two marked points |
| `local_authority_index.json` | area, year, index, price | S14 | both series indexed to 100 in the base year |
| `regional_wealth.json` | code, median, averagePrice, sampleSize | S13, S15, explorer | all twelve ITL1 codes; TLN median is null, never zero |
| `regional_boundaries.json` | GeoJSON, properties.code, properties.name | choropleths | every feature has an ITL1 code; codes match `regional_wealth`; under 1 MB |
| `wealth_distribution.json` | percentile, wealth | S18, E1.2, E7 | percentiles 1 to 100; wealth non-decreasing |
| `was_lookup.json` | wave, ageBand, tenure, region, median, sampleSize | S18, whole explorer | marginals present; no thin cells; an all-households row exists |
| `missing_top.json` | category, segment, amountBn | S16 | two segments; missing is about 15% of the total |
| `rich_list.json` | edition, entries, entryThresholdGBP, listTotalGBP, largestFortuneGBP | E7 | edition year recorded; every figure carries a source note |

The eight named in the tech stack are the first eight in the front end's loader. The other seven are
needed by steps the frozen design spec specifies, and they are listed here rather than added quietly.

## Three files the pipeline will not write for you

`export_json.py` finishes by naming them, because they are not derivable from the cleaned workbooks.

`top_share_trend.json` comes from UK Parliament (2025) drawing on Resolution Foundation (2024).
`missing_top.json` comes from Advani, Bangham and Leslie (2021). `rich_list.json` must be transcribed
from the published list with its edition year and methodology caveat.

Each must carry a `__meta` block with `synthetic: false` and its source, and each figure must be
transcribed from the publication rather than recalled. The Rich List in particular is paywalled, so
primary verification is a human step named in `wealth-viz_p4-figure-confirmation-log_v1`.

## Provenance, and why a mixed set fails

Every served file carries a `__meta` block. `synthetic: true` marks a placeholder from
`make_synthetic.py`; `synthetic: false` marks real pipeline output, and then the block must also carry
the edition and access date, which `export_json.py` warns about and `validate.py` fails on if they are
missing.

`validate.py` treats a mixed set as a failure rather than a warning. An all-synthetic build is
obviously a placeholder and the banner says so. An all-real build is the finished thing. A build where
some files are real and some are not is worse than either, because it invites a comparison between a
real series and a made-up one and the result of that comparison means nothing.

The placeholder numbers are deliberately not close to the real ones. A plausible wrong number is
quotable; a visibly synthetic one is not.

## Two things to keep in step

`MIN_CELL_SIZE` exists twice, in `scripts/clean_was.py` and in `src/data/lookup.js`. The duplication is
deliberate, because generating a JavaScript constant from Python would add a build step for one
integer, but it does mean the two can drift. If you change one, change the other. The value itself is
a build-time decision still recorded as open at design spec section B.9.

The age band and tenure category lists exist twice for the same reason. `clean_was.py` fails loudly
if the workbook's categories do not match the front end's, which is the check that catches drift.

## Before the study runs

- Every file's `__meta.synthetic` is `false`, so the provenance banner is absent.
- Every source in every `__meta` block carries an edition and an access date.
- `python scripts/validate.py` exits zero.
- The three hand-written files carry transcribed figures with their sources, not placeholders.
- No step in `src/data/narrative.js` still carries a `confirm-at-build` figure that a comprehension
  item depends on. `wealth-viz_p5-comprehension-instrument_v1` names four such items whose keys the
  scoring script refuses to score until the figure is confirmed.
