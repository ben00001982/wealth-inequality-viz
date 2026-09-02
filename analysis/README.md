# P6 analysis pipeline

The scoring and statistics for the user study, written and tested before a single participant exists.
Written for whoever runs the analysis in December 2026, which may be a version of Ben who has
forgotten why any of this is shaped the way it is.

## Run it

```bash
pip install -r ../scripts/requirements.txt   # pandas, openpyxl
pip install numpy scipy

python return_code.py    # locks the decoder against a real browser-produced code
python score.py          # locks the scoring rules
python contrast.py       # proves the pooled-versus-Welch distinction on data
python run.py            # the whole pipeline, against the simulated fixture
python run.py survey.csv codes.csv    # against real data
```

Run all four before touching real data, and again after any change. They are self-tests rather than a
test framework, because a framework is one more thing to install and these need to run on a laptop in
an exam period.

## The four modules

**`return_code.py`** decodes what the artefact hands the participant. It is a port of
`src/study/returnCode.js`, and the two must agree exactly or no code decodes at all. The self-test
pins them together against a code the built artefact actually produced in a headless browser on 1
September 2026, and it also checks that a one-character corruption is refused.

One thing a naive port gets wrong: FNV-1a needs an explicit 32-bit mask in Python, because JavaScript
gets it free from bitwise operators coercing to int32. Without the mask every hash differs and every
genuine code is rejected.

It also carries an `encode` used only to build simulated data, and the self-test confirms it
reproduces the browser's output byte for byte, so the fixture cannot drift away from the artefact.

**`score.py`** scores the instrument. Two blocks, two rules.

The factual block scores as a count correct, and "don't know" scores zero rather than counting as
missing. That is deliberate: treating a refusal as missing would delete the participants least
confident about the material, which is exactly the group the artefact exists to help.

The estimation block scores on the log ratio of estimate to truth, because a count correct is
meaningless for a quantity and a linear difference is asymmetric. On a log metric, ten times too high
and ten times too low are equally wrong, which is the property you want. Accuracy is
`max(0, 1 - |ln(estimate/truth)| / ln(10))`, so exact scores 1, out by a factor of two scores about
0.70, and an order of magnitude out scores 0 and stays there. That bound is why the instrument says
outliers are not removed: the metric already attenuates an absurd answer to zero instead of letting it
swamp the sample.

`composite` supports per-item or per-block weighting. The pipeline uses per-block, so the six
estimation items are not drowned by the twelve factual ones, since the estimation items are the ones
targeting the perceived-versus-actual gap the study is about. **The protocol must pre-register this
choice.** The code states it so the two cannot disagree silently.

**`contrast.py`** is the primary analysis, and it exists partly to settle an error that had spread
through four project documents.

In a 2x2 mixed design the condition-by-time interaction F equals the square of the t from an
independent-samples test on gain scores. That identity holds for the **pooled-variance (Student)** t
and **not** for Welch's. Four documents asserted it of Welch. `interaction_equivalence_demo()` proves
the distinction numerically rather than asserting it: on its fixture the pooled t squared and the
interaction F agree to six decimal places while Welch's differs and moves p by 0.038.

The second thing everyone misses: the power calculation is derived from the pooled formula and assumes
equal variances. So if Welch is pre-registered as primary, the powered test and the reported test are
not the same test. `primary_contrast` reports both, with Levene, and says so in its own output.

Effect sizes are Hedges' g with a 95% interval, not p-values alone. A null result is a legitimate
outcome here and an interval says how null it is; a bare p above .05 does not. The interval uses the
standard large-sample approximation, which is good enough to report at this sample size and is not
exact, and the docstring says so rather than implying precision it does not have.

`ancova` is the pre-specified secondary. It is **not** equivalent to the gain-score test, though two
documents said it was while also calling it more powerful, which cannot both be true. They coincide
only when the within-group slope of post on pre is exactly 1; otherwise they estimate different
quantities and can disagree in sign, which is Lord's paradox. The function returns the slope so you
can see how far apart the two models are on your data.

That is not theoretical. On the simulated fixture the gain-score test gives p = 0.135 and ANCOVA gives
p = 0.017, from the same numbers, with a slope of 0.68. If both had been reported as "the same effect,
two ways", one of them would have been presented as confirming the other.

**`run.py`** is the pipeline. `simulate.py` builds the fixture.

## Why the pipeline is ordered the way it is

Telemetry accounting comes **before** scoring, and that is not a stylistic choice. How much
behavioural data reached the researcher, and why the rest did not, is a result in its own right for a
browser-side telemetry design. It belongs in the report's limitations as a number, not in a footnote as
a caveat.

Every refusal reason is kept distinct rather than collapsed into one "invalid" bucket. A single bucket
would hide a systematic fault: if a survey field truncated every code at the same length, a lone count
of failures would look like ordinary attrition.

Behavioural measures are missing-not-at-random by construction, because a participant who does not
return a code is plausibly one who found the artefact hard. So they are reported on the subset that
returned a code, and that subset is described rather than presented as the whole sample. Comprehension
records survive regardless, because they come from the survey platform.

## The scope discipline, which is the one thing not to get wrong

Only measures **both arms can emit** may be compared across conditions. The static arm has no
explorer, so it cannot emit an explorer interaction, and comparing explorer dwell across arms would
compare what each arm is capable of emitting rather than how participants behaved.

Both-arm measures: `neck_visible_s` and `backtrack_count`. That is two, and it used to be one:
`backtrack_count` had no data until the return code was given a revisit vector, and the data-table
disclosure was not instrumented at all until it was given a `both`-scoped event.

Interactive-only, reported within that arm: `explorer_visible_s`, `interaction_breadth`, and anything
derived from an `interactive-only` scoped event.

## What the fixture deliberately includes

Every awkward case, over-represented rather than realistic, because the point is to exercise paths:
participants who never took a code, a code corrupted in transit, a correctly-checksummed code from an
older version, a session below the exposure floor, a resumed session whose duration measures must be
suppressed, plus "don't know" answers, blanks, a zero and an absurd numeric estimate.

The generating model gives the interactive arm an advantage of 0.06, which is **below the smallest
effect the study is powered to detect**. That is on purpose: nobody should be able to mistake the
fixture's output for a prediction.

## Open items before this touches real data

The block-weighting choice in `score_participant` must be pre-registered in the protocol.

Whether the primary test is the pooled t or Welch must be pre-registered, and if Welch, the power
calculation needs restating.

`TRUTHS` in `simulate.py` holds the true values the estimation items score against, and they must be
reconciled against the final confirmed figures before the instrument is fielded. Two are still open in
the P4 confirmation log.

The factual answer keys in `simulate.py` are a subset used for testing. The real keys live in the
comprehension instrument and must be transcribed from it, not from here.
