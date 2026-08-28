/**
 * Sources and limitations, in the artefact itself rather than only in the report.
 *
 * Two reasons this is a component and not a footer of small print. The truthfulness commitment the
 * piece makes about its own data (Correll, 2019; D'Ignazio and Klein, 2020) is not credible if the
 * sources are hard to find. And the study participants are members of the public who are entitled to
 * check what they have just been shown, which is a research-ethics point as much as a design one.
 *
 * The dataset editions and access dates are deliberately not hard-coded here as prose: they are
 * carried on each data file's `__meta` block by the pipeline, so this list cannot drift out of date
 * relative to the data actually being served. Until the pipeline has run against real downloads,
 * the entries state that plainly.
 */
export function Sources({ synthetic }) {
  return (
    <section id="sources" className="sources" aria-labelledby="sources-heading">
      <h2 id="sources-heading">Where these numbers come from, and what they miss</h2>

      <h3>Sources</h3>
      <ul>
        <li>
          Office for National Statistics, Wealth and Assets Survey. Household and individual wealth
          by tenure, age band and region, for Great Britain.
        </li>
        <li>
          UK House Price Index, published jointly by HM Land Registry and the Office for National
          Statistics. Average prices nationally, by region and by local authority.
        </li>
        <li>
          English Housing Survey, Ministry of Housing, Communities and Local Government. Tenure
          composition for England.
        </li>
        <li>
          Office for National Statistics, housing affordability in England and Wales. The
          price-to-earnings ratio.
        </li>
        <li>
          Office for National Statistics Open Geography Portal. International Territorial Level 1
          boundaries, formerly NUTS1.
        </li>
        <li>
          Advani, A., Bangham, G. and Leslie, J. (2021) The UK&rsquo;s wealth distribution and
          characteristics of high-wealth households. The source of the estimate that about £800bn of
          top wealth is missing from the survey.
        </li>
        <li>
          The Sunday Times Rich List. Used only as published aggregates: the entry threshold, the
          list total and the largest single fortune. No individual is named.
        </li>
      </ul>

      <h3>What these numbers miss</h3>
      <p>
        The wealthiest households are systematically undercounted in household surveys, because the
        very rich are hard to sample and tend not to respond. The best available estimate puts about
        £800bn outside what the Wealth and Assets Survey observes, which is about 5% of all household
        wealth. The share matters less than where it sits: adding that wealth lifts the share held by
        the top 1% from about 18% to about 23%, and the share held by the top 10% from about 51% to
        about 55%. Every wealth figure on this page is therefore a floor rather than a best guess, and the
        gaps shown are narrower than the real ones.
      </p>
      <p>
        The survey&rsquo;s own standing has weakened. The Office for Statistics Regulation suspended its
        accredited official statistics status in June 2025, and the Office for National Statistics
        advises that the figures be treated with caution. The most recent wave was collected during
        the covid period with a reduced sample. It remains the best public source for wealth by
        household characteristics in Britain, and it is used here with that stated rather than
        skirted.
      </p>
      <p>
        The survey covers Great Britain, so Northern Ireland carries no wealth figure on any map here
        and is shown as no data rather than as zero. Tenure composition is for England only, because
        that is what the English Housing Survey covers, and it is labelled as such rather than
        generalised to the whole United Kingdom.
      </p>
      <p>
        The Rich List is a journalistic estimate. It undercounts hidden, offshore and trust-held
        wealth, so it is used as a lower bound on concentration at the top rather than as an
        authority. The same lesson as the missing £800bn, from the other direction.
      </p>

      {synthetic && (
        <>
          <h3>This build is showing placeholder data</h3>
          <p>
            The charts currently render synthetic values generated for development, which have the
            right shape and the wrong numbers. They are not findings and must not be quoted. The
            sources above are what the finished artefact draws on.
          </p>
        </>
      )}

      <h3>Framing, stated openly</h3>
      <p>
        This piece foregrounds renters over owners, younger cohorts over older, and the north over the
        south. That is a choice, not a neutral default, and it is made because the argument is about a
        divide and a divide is best understood from the side that loses by it. The underlying figures
        are unchanged by that choice, and the tables behind every chart let you read them yourself.
      </p>
    </section>
  )
}
