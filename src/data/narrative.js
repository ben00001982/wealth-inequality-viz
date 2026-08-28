/**
 * The single-message-per-step script, S0 to S18.
 *
 * This is design spec B.2 and B.3 rendered as data. One takeaway per step, one sticky chart, one
 * four-level annotation (Lundgard and Satyanarayan, 2022): what it is, how to read it, the key
 * fact, why it matters.
 *
 * Both A/B conditions render this same array. The `interactiveExtras` field names what the
 * interactive condition adds on top, and nothing in `message` or `annotation` differs by
 * condition, which is the content-parity rule at design spec B.4.0 and B.6. If you are tempted to
 * put a fact in `interactiveExtras`, stop: the study would then measure content volume rather than
 * interactivity.
 *
 * FIGURE STATUS. Every numeric claim carries a `figures` entry with a `status` of 'verified' or
 * 'confirm-at-build', matching the convention in design spec B.2 and the outcome of the P4
 * verification pass recorded in wealth-viz_p4-figure-confirmation-log_v1. A step whose figure is
 * still open renders with a visible build-time marker in development, so an unconfirmed number can
 * never quietly reach a participant. See src/components/FigureStatusBadge.jsx.
 */

/*
 * The mandatory recurring caveat (design spec B.7).
 *
 * CORRECTED 2026-08-24. This string previously said "roughly 15%". The source says 5%: Advani,
 * Bangham and Leslie (2021) section 4.2, "Adding wealth captured in the STRL and the additional
 * Pareto adjustment to total wealth captured in the WAS increases estimated total wealth by 5%".
 * The £800bn is correct and so is the 18% to 23% top-1% correction; only the percentage of the
 * total was wrong, and 15% is not recoverable on any denominator (£800bn against a Great Britain
 * total of roughly £16tn is 5%).
 *
 * It matters more than a stray number usually would, because B.7 puts this string on every chart
 * that reports a wealth level or share, in both A/B arms, and it is the quantity the S16 segmented
 * bar and the E7 missing band encode. A wrong figure here would have reached every participant.
 *
 * The concentration correction is the stronger claim and is now carried alongside it: the share held
 * by the top 1% rises from 18% to 23%, and the top 10% from 51% to 55%, once Rich List wealth is
 * included. Those say what the missing wealth does, which is the point the piece is making, rather
 * than how large it is relative to a total most readers cannot picture.
 */
export const CAVEAT_SHORT =
  'Survey data. The richest households are undercounted, so these are conservative lower bounds ' +
  '(almost £800bn missing, about 5% of the total, which lifts the top 1% share from 18% to 23%: ' +
  'Advani, Bangham and Leslie, 2021).'

export const CAVEAT_ACCREDITATION =
  'The Office for Statistics Regulation suspended the Wealth and Assets Survey’s accredited ' +
  'official statistics status in June 2025, and the ONS advises that the figures be treated with ' +
  'caution. They are used here as the best available public source, with that caveat stated.'

export const steps = [
  {
    id: 'S0',
    kind: 'framing',
    block: 'context',
    message:
      'Housing is the biggest single store of British wealth, and that quietly decides who gets rich.',
    annotation: {
      whatItIs: 'An opening frame, not a chart.',
      howToRead: 'Scroll to move through the argument. Each step makes one point.',
      keyFact:
        'Most household wealth in Britain is not earned income. It is property and pensions, and property is the part that moves fastest.',
      whyItMatters:
        'If wealth is mostly housing, then who owns a home, when they bought it, and where it is, decide who gets wealthy. That is what the rest of this is about.',
    },
    chart: null,
    caveat: false,
    figures: [],
  },
  {
    id: 'S1',
    kind: 'data',
    block: 'context',
    message:
      'The wealthiest tenth hold over half of all wealth, and the top 1% alone hold as much as the entire bottom half.',
    annotation: {
      whatItIs: 'A bar for each tenth of households, ordered from least to most wealthy.',
      howToRead:
        'Each bar is one decile, that is one tenth of households. The height is the share of all household wealth that tenth holds. If wealth were spread evenly every bar would sit at 10%.',
      keyFact:
        'The top tenth holds about 57% of all household wealth. The top 1% holds roughly as much as the bottom 50% put together, each about a tenth of the total.',
      whyItMatters:
        'People consistently underestimate how concentrated wealth is. Starting with the overall shape means everything after this is read against the right scale.',
    },
    chart: 'wealthByDecile',
    caveat: true,
    figures: [
      {
        id: 'S1a',
        claim: 'Top 10% hold about 57% of household wealth (2019)',
        source: 'UK Parliament (2025), drawing on Resolution Foundation (2024)',
        status: 'verified',
      },
      {
        id: 'S1b',
        claim: 'Top 1% share is roughly equal to the bottom 50% share, each about 10%',
        source: 'UK Parliament (2025) / ONS Wealth and Assets Survey 2020 to 2022',
        status: 'verified',
      },
      {
        id: 'S1c',
        claim: 'Top-decile floor about £1.2m; bottom-decile ceiling about £16,500',
        source: 'ONS Wealth and Assets Survey 2020 to 2022',
        status: 'verified',
      },
    ],
  },
  {
    id: 'S2',
    kind: 'data',
    block: 'context',
    message:
      'The top’s share has stayed high for decades. What exploded is the size of wealth itself relative to wages.',
    annotation: {
      whatItIs: 'A line showing the share of wealth held by the top tenth, year by year.',
      howToRead:
        'Follow the line left to right. A flat line means the share has not changed much. The annotation marks the second series: total household wealth measured against national income.',
      keyFact:
        'The top tenth’s share was about 56% in 1980 and about 57% in 2019, broadly flat. Over the same period total household wealth went from roughly three times national income to roughly seven times.',
      whyItMatters:
        'This is the step most people get wrong. The story is not that the rich took a bigger slice. It is that the whole cake grew enormously relative to what people earn, so the same slice is now worth far more in years of work.',
    },
    chart: 'topShareTrend',
    caveat: true,
    figures: [
      {
        id: 'S2a',
        claim: 'Top-10% share about 56% (1980) to about 57% (2019), broadly flat',
        source: 'UK Parliament (2025), drawing on Resolution Foundation (2024)',
        status: 'verified',
      },
      {
        id: 'S2b',
        claim: 'Total household wealth about 3x national income (1980) to about 7x (2019)',
        source: 'UK Parliament (2025), drawing on Resolution Foundation (2024)',
        status: 'verified',
      },
    ],
  },
  {
    id: 'S3',
    kind: 'data',
    block: 'context',
    message: 'Property is the single biggest store of household wealth, about two-fifths of it.',
    annotation: {
      whatItIs: 'A ring divided into the four components of household wealth.',
      howToRead:
        'The whole ring is total household wealth. Each segment is one component. The largest segment is property.',
      keyFact:
        'Property is about 40% of household wealth and pensions about 35%, on the 2020 to 2022 survey. Financial and physical wealth make up the rest.',
      whyItMatters:
        'This is the hinge of the whole argument. Because wealth is mostly property, the housing market is the mechanism that distributes it, and the housing market rewards owning early far more than it rewards earning well.',
    },
    chart: 'wealthComposition',
    caveat: true,
    // A donut is a knowing departure from the Cleveland and McGill hierarchy. Justified because
    // the task is part-to-whole with one dominant segment, where a bar chart would invite false
    // precision comparisons among the three minor parts. See design spec B.5 and L10.
    encodingDeparture:
      'Angle and area rank below position and length for accuracy (Cleveland and McGill, 1984). ' +
      'Accepted here because the task is a single dominant part against the whole, not a ranking ' +
      'of the minor parts, and the dominant share is labelled numerically so no angle judgement is required.',
    figures: [
      {
        id: 'S3a',
        claim: 'Property about 40% of household wealth, pensions about 35% (2020 to 2022)',
        source: 'UK Parliament (2025) / ONS Wealth and Assets Survey',
        status: 'verified',
      },
    ],
  },
  {
    id: 'S4',
    kind: 'transition',
    block: 'tenure',
    message: 'Owning builds wealth. Renting does not. That is the first divide.',
    annotation: {
      whatItIs: 'A section marker.',
      howToRead: 'The next two steps look at wealth by housing tenure.',
      keyFact: 'Tenure is the first of three dimensions: tenure, then timing, then place.',
      whyItMatters:
        'Tenure comes first because it is the structural divide. Timing and geography then explain whether a person can ever cross it.',
    },
    chart: null,
    caveat: false,
    figures: [],
  },
  {
    id: 'S5',
    kind: 'data',
    block: 'tenure',
    message:
      'Home ownership has fallen from its early-2000s peak, and private renting has roughly doubled.',
    annotation: {
      whatItIs: 'A stacked area chart of housing tenure in England from 1995 to 2024.',
      howToRead:
        'The full height is all households. Each band is one tenure. The private-rented band is highlighted; read its thickness, not its position.',
      keyFact:
        'Owner-occupation peaked at 71% in 2003 and stood at about 65% in England, broadly stable since 2019 to 2020. Private renting rose from roughly 10% in the 1990s to about 19% in 2024 to 2025.',
      whyItMatters:
        'A tenure shift of this size is a wealth-formation shift. Every household that rents rather than owns is one that pays for housing without accumulating anything from it.',
    },
    chart: 'tenureComposition',
    caveat: false,
    figures: [
      {
        id: 'S5a',
        claim:
          'Owner-occupation 71% peak (2003) to about 65% (England, stable since 2019 to 2020); private renting about 10% (1990s) to 19% (2024 to 2025)',
        source: 'English Housing Survey (England only)',
        status: 'verified',
        note:
          'England only, not the United Kingdom. The step wording must not generalise the series to the whole UK.',
      },
    ],
  },
  {
    id: 'S6',
    kind: 'data',
    block: 'tenure',
    message: 'At every survey wave, owners hold far more wealth than renters.',
    annotation: {
      whatItIs: 'Grouped bars comparing median household wealth by tenure, at each survey wave.',
      howToRead:
        'Bars are grouped by survey wave. Within each group, compare the heights across tenures. All bars sit on the same scale, so lengths are directly comparable.',
      keyFact:
        'The gap between owners and renters is present at every wave and does not close. Median wealth for outright owners is a large multiple of median wealth for private renters.',
      whyItMatters:
        'This is the divide itself, measured. It is not a one-off effect of a particular year: it holds across every wave the survey has run.',
    },
    chart: 'wealthByTenure',
    caveat: true,
    figures: [
      {
        id: 'S6a',
        claim: 'Owner versus renter median wealth, persistent across waves',
        source: 'ONS Wealth and Assets Survey',
        status: 'verified',
        note: 'Direction verified. The exact per-wave medians are a build-time extraction.',
      },
    ],
  },
  {
    id: 'S7',
    kind: 'transition',
    block: 'generation',
    message: 'Whether you ever cross that divide depends on when you were born.',
    annotation: {
      whatItIs: 'A section marker.',
      howToRead: 'The next four steps look at generational timing.',
      keyFact: 'Timing is the second dimension.',
      whyItMatters:
        'If the divide were only about tenure, it would be a choice. Timing is what makes it an accident of birth year.',
    },
    chart: null,
    caveat: false,
    figures: [],
  },
  {
    id: 'S8',
    kind: 'data',
    block: 'generation',
    message: 'Average house prices have more than quadrupled since 1995, far faster than wages.',
    annotation: {
      whatItIs: 'A line chart of the UK House Price Index average price, 1995 to the present.',
      howToRead: 'Follow the line left to right. Labelled points mark the start and the latest reading.',
      keyFact:
        'The average price rose from roughly £60,000 in 1995 to £271,188 in November 2025, about four and a half times.',
      whyItMatters:
        'Wages did not do this. A price series that outruns earnings by this margin means the same house takes a different number of working years to buy depending only on when you tried.',
    },
    chart: 'housePrices',
    caveat: false,
    figures: [
      {
        id: 'S8a',
        claim: 'About £60,000 (1995) to £271,188 (November 2025), about 4.5 times',
        source: 'UK House Price Index (HM Land Registry and ONS)',
        status: 'verified',
      },
    ],
  },
  {
    id: 'S9',
    kind: 'data',
    block: 'generation',
    message:
      'A home cost about three and a half times earnings in the late 1990s. That peaked near nine times, then eased to under eight.',
    annotation: {
      whatItIs: 'A line chart of the house-price-to-earnings ratio for England and Wales.',
      howToRead:
        'The value is how many years of median earnings a median-priced home costs. Higher means less affordable.',
      keyFact:
        'The ratio was about 3.5 in 1997, peaked near 9 in 2021, and stood at about 7.7 in 2024 for England and Wales.',
      whyItMatters:
        'This is the affordability lever. It is the single number that converts the price series into a lived experience: how long you must work for a house.',
    },
    chart: 'affordability',
    caveat: false,
    figures: [
      {
        id: 'S9a',
        claim:
          'About 3.5x (1997) to about 9x peak (2021) to 7.7x (2024), England and Wales',
        source: 'ONS Housing affordability in England and Wales, 2024',
        status: 'verified',
        note:
          'The P4 verification pass found a later revision of this series. Confirm the latest published value and year before the figure is quoted in the report.',
      },
    ],
  },
  {
    id: 'S10',
    kind: 'data',
    block: 'generation',
    message: 'Older households have pulled away while younger ones have fallen back.',
    annotation: {
      whatItIs: 'Grouped bars of median household wealth by age band.',
      howToRead:
        'Each bar is one age band. Compare heights across bands. The annotation gives the change over time rather than the level, because the change is the point.',
      keyFact:
        'Since 2006 to 2008, real median wealth rose about 55% for households headed by someone in their sixties and fell about 34% for those in their thirties. In 2020 to 2022, 44% of 25 to 34 year olds owned no property, against 37% in 2006 to 2008.',
      whyItMatters:
        'Two cohorts moved in opposite directions over the same period. That is not the normal pattern of saving more as you age: it is a change in what each cohort could accumulate at all.',
    },
    chart: 'wealthByAge',
    caveat: true,
    figures: [
      {
        id: 'S10a',
        claim:
          'Since 2006 to 2008, real median wealth of households headed by 60-somethings up about 55%, of 30-somethings down about 34%; 44% of 25 to 34s own no property (2020 to 2022) against 37% (2006 to 2008)',
        source: 'UK Parliament (2025), drawing on Resolution Foundation (2024)',
        status: 'verified',
      },
      {
        id: 'S10b',
        claim:
          'A cross-sectional old-versus-young wealth multiple of about seven times',
        source: 'No published source found',
        status: 'withdrawn',
        note:
          'Design spec revision r2.2. The P4 verification pass could find no ONS or House of Commons Library output supporting this multiple. It is withdrawn rather than replaced, and the step now rests on the verified change-over-time pair above, which also sits better with S11 because it is cohort movement rather than a life-cycle snapshot.',
      },
    ],
  },
  {
    id: 'S11',
    kind: 'data',
    block: 'generation',
    message: 'This is cohort movement, not just normal life-cycle saving.',
    annotation: {
      whatItIs:
        'Two small charts side by side: the distribution of wealth across age bands at an early survey wave and at the most recent one.',
      howToRead:
        'Compare the two panels. If the pattern simply shifts along with age, that is life-cycle saving. If the whole shape moves, the cohorts themselves differ.',
      keyFact:
        'Comparing the earlier wave with the most recent one, the distribution does not merely slide along the age axis. The younger bands sit lower than the equivalent bands did a decade earlier.',
      whyItMatters:
        'Life-cycle saving would predict that today’s thirty-somethings look like yesterday’s thirty-somethings, only later. They do not. This is the difference between a delay and a divergence.',
    },
    chart: 'wealthByAgeFacet',
    caveat: true,
    figures: [
      {
        id: 'S11a',
        claim:
          'Wealth-by-age distribution compared between Wave 3 (July 2010 to June 2012) and Round 8 (April 2020 to March 2022)',
        source: 'ONS Wealth and Assets Survey',
        status: 'confirm-at-build',
        note:
          'Design spec revision r2.3. The original "2010 versus 2020" pairing is not producible: no WAS wave has a midpoint in either year. Wave 3 against Round 8 is the closest honest near-decade pairing. Note also that the survey basis changed from a July to June year to an April to March year at Round 6, and the published workbook splits into two overlapping blocks, so plotting against a naive year column double-counts.',
      },
    ],
  },
  {
    id: 'S12',
    kind: 'transition',
    block: 'geography',
    message: 'Where you live magnifies all of this.',
    annotation: {
      whatItIs: 'A section marker.',
      howToRead: 'The next three steps look at geography.',
      keyFact: 'Place is the third dimension.',
      whyItMatters:
        'Tenure and timing set the terms. Geography decides how large the resulting gap is in cash.',
    },
    chart: null,
    caveat: false,
    figures: [],
  },
  {
    id: 'S13',
    kind: 'data',
    block: 'geography',
    message: 'Property values have pulled apart across regions for decades.',
    annotation: {
      whatItIs:
        'A map of average property values by region, paired with the same regions as a ranked bar chart.',
      howToRead:
        'Darker areas on the map are higher values. Read the precise ranking from the bars beside it, because position and length are read more accurately than colour.',
      keyFact:
        'Regional average prices have diverged since 1995. London sits highest and the North East lowest, and the gap between them has widened.',
      whyItMatters:
        'The same tenure and the same birth year produce very different wealth outcomes depending on the region. Geography is a multiplier on the other two dimensions.',
    },
    chart: 'regionalPricesMap',
    caveat: false,
    figures: [
      {
        id: 'S13a',
        claim: 'Regional average price by ITL1 area, current reading',
        source: 'UK House Price Index (HM Land Registry and ONS)',
        status: 'verified',
      },
      {
        id: 'S13b',
        claim: 'Regional average price by ITL1 area, 1995 baseline',
        source: 'UK House Price Index, full CSV series',
        status: 'confirm-at-build',
        note:
          'The 1995 baseline is available only from the full HPI CSV download, which the P4 pass could not reach automatically. Named as a manual acquisition step in the data acquisition manifest.',
      },
    ],
  },
  {
    id: 'S14',
    kind: 'data',
    block: 'geography',
    message: 'Within that, the extremes have stretched furthest.',
    annotation: {
      whatItIs:
        'A line chart of two local authorities indexed to a common starting value of 100.',
      howToRead:
        'Both lines start at 100 in the base year. The value is growth relative to that start, not the price. Indexing is deliberate: comparing the absolute prices side by side invites the reader to misjudge the growth, which is a misread the earlier version of this work ran into.',
      keyFact:
        'Kensington and Chelsea and Blackpool sit at opposite ends of the local-authority price range, and their paths since the base year diverge sharply.',
      whyItMatters:
        'Regional averages hide the range inside them. The extremes show how far apart two places in the same country can travel.',
    },
    chart: 'localAuthorityIndex',
    caveat: false,
    figures: [
      {
        id: 'S14a',
        claim:
          'Kensington and Chelsea and Blackpool current levels, June 2026 reading',
        source: 'UK House Price Index release of 19 August 2026',
        status: 'verified',
      },
      {
        id: 'S14b',
        claim: 'Growth factors from a 1995 base',
        source: 'UK House Price Index, full CSV series',
        status: 'confirm-at-build',
        note:
          'Same blocker as S13b. Note also that local authorities sit below the ITL1 standard the rest of the piece uses, so this step is explicitly flagged as an illustration of range, not a regional comparison.',
      },
    ],
  },
  {
    id: 'S15',
    kind: 'data',
    block: 'geography',
    message: 'Median wealth in the South East is more than twice the North East’s.',
    annotation: {
      whatItIs:
        'A map of median household wealth by region, paired with the same regions as a ranked bar chart.',
      howToRead:
        'As before: the map carries the spatial pattern, the bars carry the ranking. Northern Ireland is shown as no data, because the survey covers Great Britain only.',
      keyFact:
        'On the 2020 to 2022 survey, median household total wealth was £489,800 in the South East and £179,900 in the North East, a ratio of about 2.7.',
      whyItMatters:
        'This is the geographic gap in the thing that matters, wealth itself, rather than in house prices. It is the point where the three dimensions meet.',
    },
    chart: 'regionalWealthMap',
    caveat: true,
    figures: [
      {
        id: 'S15a',
        claim:
          'South East £489,800 and North East £179,900 median household total wealth (April 2020 to March 2022), a ratio of about 2.7',
        source:
          'ONS, Household total wealth in Great Britain: April 2020 to March 2022, Figure 5, released 24 January 2025',
        status: 'verified',
        note:
          'Design spec revision r2.1. Both values are confirmed. The earlier wording "roughly three times" overstated the ratio, which is 2.72; the ONS wording is "more than twice as high" and the step now matches it.',
      },
    ],
  },
  {
    id: 'S16',
    kind: 'data',
    block: 'missing-top',
    message:
      'Even these gaps are understated. About £800bn of top wealth is missing from the survey.',
    annotation: {
      whatItIs:
        'A single bar split into two segments: the wealth the survey observes, and the estimated wealth it does not.',
      howToRead:
        'The lower segment is surveyed wealth. The upper segment is the estimated missing amount. Both are on the same scale, so the missing part is a quantity you can read rather than a vague warning. It is a thin band, and that is the honest shape: the missing wealth is a small share of the total and a large share of the top.',
      keyFact:
        'Almost £800bn is unobserved, about 5% of all household wealth. That sounds small until you see where it sits: adding it lifts the share held by the top 1% from about 18% to about 23%, and the top 10% from about 51% to about 55%.',
      whyItMatters:
        'Every figure in this piece is a floor, not an estimate of the truth. Saying so plainly is the honest design choice, and it means the argument only gets stronger if better data arrives.',
    },
    chart: 'missingTop',
    caveat: false,
    figures: [
      {
        id: 'S16a',
        claim:
          'Almost £800bn unobserved, about 5% of total household wealth; top-1% share rises from about 18% to about 23%, and top-10% from about 51% to about 55%, once Rich List wealth is included',
        source: 'Advani, Bangham and Leslie (2021)',
        status: 'verified',
      },
    ],
  },
  {
    id: 'S17',
    kind: 'data',
    block: 'missing-top',
    message:
      'Tenure, timing and place compound into a housing wealth divide the data can only undercount.',
    annotation: {
      whatItIs: 'A recap of the three anchor charts, side by side.',
      howToRead: 'Each panel is one of the three dimensions, shown as it appeared earlier.',
      keyFact:
        'The three dimensions are not three separate facts. They multiply: renting, having been born late, and living in the wrong region compound into one outcome.',
      whyItMatters:
        'This is the argument in one frame, and it is the last thing said before you are handed the controls.',
    },
    chart: 'synthesisRecap',
    caveat: true,
    figures: [],
  },
  {
    id: 'S18',
    kind: 'handover',
    block: 'handover',
    message: 'Where do you fit?',
    annotation: {
      whatItIs:
        'The distribution you have just been shown, with a marker for the position your own details imply.',
      howToRead:
        'Enter an age band, a region and a tenure. A marker appears on the distribution at the typical position for people with those characteristics. It is a published survey median for that group, not a prediction about you.',
      keyFact:
        'The value shown is the median for the characteristic group you selected. Where the survey has too few households in that exact combination, the answer falls back to a coarser cut and says so.',
      whyItMatters:
        'The national picture is easy to read and easy to forget. A position is harder to forget, and it is the on-ramp to exploring the data yourself.',
    },
    chart: 'locatorDistribution',
    caveat: true,
    // In the static condition S18 has no input: it renders a fixed typical-renter against
    // typical-owner comparison and the narrative ends. Design spec B.3.
    staticAlternative: 'typicalRenterVsOwner',
    interactiveExtras:
      'Reader inputs for age band, region and tenure, which seed the explorer. No new facts.',
    figures: [],
  },
]

export const stepById = Object.fromEntries(steps.map((s) => [s.id, s]))
export const stepIds = steps.map((s) => s.id)

/** The blocks, in order, used for the progress indicator and the skip-link targets. */
export const blocks = [
  { id: 'context', label: 'The overall shape' },
  { id: 'tenure', label: 'Owning and renting' },
  { id: 'generation', label: 'When you were born' },
  { id: 'geography', label: 'Where you live' },
  { id: 'missing-top', label: 'What the data misses' },
  { id: 'handover', label: 'Where you fit' },
]

/** Steps that carry an unresolved figure. Rendered as a build-time warning in development. */
export const stepsWithOpenFigures = steps
  .filter((s) => s.figures.some((f) => f.status === 'confirm-at-build'))
  .map((s) => s.id)
