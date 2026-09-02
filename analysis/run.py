"""The P6 pipeline, end to end: survey export plus return codes in, analysis out.

Run: python analysis/run.py [survey.csv] [codes.csv]
With no arguments it runs against the simulated fixture, which is how it should be run before the
study starts, and how it is checked to still work afterwards.

The order matters and is deliberate. Decode and account for every code BEFORE scoring, because the
refusal counts are a result in their own right: how much behavioural data reached the researcher, and
why the rest did not, is the honest headline of a browser-side telemetry design and belongs in the
report's limitations rather than in a footnote.
"""

from __future__ import annotations

import csv
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from scipy import stats as sps

from return_code import STEP_ORDER, DecodeError, Session, decode
from score import ItemResult, composite, score_estimate, score_factual
from simulate import FACTUAL_KEYS, TRUTHS, generate
from contrast import ancova, primary_contrast


def load_survey(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def score_participant(row: dict, phase: str) -> tuple[float, list[ItemResult]]:
    results: list[ItemResult] = []
    for key, truth in TRUTHS.items():
        raw = row.get(f"{phase}_{key}", "")
        value = None
        if raw not in ("", None):
            try:
                value = float(raw)
            except ValueError:
                value = None
        results.append(score_estimate(key, value, truth))
    for item, correct in FACTUAL_KEYS.items():
        results.append(score_factual(item, row.get(f"{phase}_{item}"), correct))
    # Block weighting, so the six estimation items are not drowned by the twelve factual ones. The
    # protocol must pre-register this choice; it is stated here so the code and the protocol agree.
    return composite(results, {"estimation": 1.0, "factual": 1.0}), results


def decode_all(codes: dict[str, str]) -> tuple[dict[str, Session], Counter]:
    sessions: dict[str, Session] = {}
    refusals: Counter = Counter()
    for pid, code in codes.items():
        try:
            s = decode(code, STEP_ORDER)
        except DecodeError as exc:
            # The reason is kept, not collapsed into "invalid". A single bucket would hide a
            # systematic fault, for example a survey field truncating every code at the same length.
            refusals[str(exc).split(":")[0]] += 1
            continue
        if s.participant_code and s.participant_code != pid:
            refusals["pid-mismatch"] += 1
            continue
        sessions[pid] = s
    return sessions, refusals


def main(argv: list[str]) -> int:
    if len(argv) >= 3:
        survey_path, codes_path = Path(argv[1]), Path(argv[2])
    else:
        print("No inputs given, so running against the simulated fixture.\n")
        survey_path, codes_path = generate()
        print()

    survey = load_survey(survey_path)
    with codes_path.open(encoding="utf-8") as f:
        codes = {r["participant_code"]: r["return_code"] for r in csv.DictReader(f)}

    print("=" * 78)
    print("1. TELEMETRY ACCOUNTING")
    print("=" * 78)
    sessions, refusals = decode_all(codes)
    n = len(survey)
    print(f"Participants in the survey export      : {n}")
    print(f"Supplied a return code                 : {len(codes)}  ({len(codes) / n:.0%})")
    print(f"Codes that decoded                     : {len(sessions)}  ({len(sessions) / n:.0%} of all)")
    if refusals:
        print("Refused, by reason:")
        for reason, count in refusals.most_common():
            print(f"    {reason:<22} {count}")
    print(
        "\nEvery participant keeps their comprehension record whether or not a code arrived.\n"
        "Behavioural measures are missing-not-at-random by construction, so they are reported on\n"
        "the subset that returned a code, and that subset is described rather than presented as the whole."
    )

    incomplete = [p for p, s in sessions.items() if not s.exposure_complete]
    resumed = [p for p, s in sessions.items() if s.resumed]
    print(f"\nBelow the exposure floor (flagged, not silently dropped): {len(incomplete)}")
    print(f"Resumed sessions (duration measures suppressed)         : {len(resumed)}")

    print()
    print("=" * 78)
    print("2. COMPREHENSION")
    print("=" * 78)
    by_arm: dict[str, dict[str, list]] = {
        "interactive": {"pre": [], "post": []},
        "static": {"pre": [], "post": []},
    }
    flags: Counter = Counter()
    for row in survey:
        arm = row["condition_allocated"]
        pre, pre_items = score_participant(row, "pre")
        post, post_items = score_participant(row, "post")
        for r in pre_items + post_items:
            if r.note in {"missing", "declined", "below-minimum-substituted"}:
                flags[r.note] += 1
        by_arm[arm]["pre"].append(pre)
        by_arm[arm]["post"].append(post)

    for note, count in flags.most_common():
        print(f"item-level flag {note:<28} {count}")

    pre_i = np.array(by_arm["interactive"]["pre"])
    post_i = np.array(by_arm["interactive"]["post"])
    pre_s = np.array(by_arm["static"]["pre"])
    post_s = np.array(by_arm["static"]["post"])
    print(f"\nInteractive pre {pre_i.mean():.4f} -> post {post_i.mean():.4f}")
    print(f"Static      pre {pre_s.mean():.4f} -> post {post_s.mean():.4f}")

    print()
    print("=" * 78)
    print("3. PRIMARY CONTRAST: condition by time")
    print("=" * 78)
    c = primary_contrast(pre_i, post_i, pre_s, post_s)
    print(c.summary())

    print()
    print("=" * 78)
    print("4. PRE-SPECIFIED SECONDARY: ANCOVA")
    print("=" * 78)
    a = ancova(
        np.r_[pre_i, pre_s],
        np.r_[post_i, post_s],
        np.r_[np.ones(len(pre_i)), np.zeros(len(pre_s))],
    )
    print(
        f"Adjusted condition effect {a['adjusted_condition_effect']:+.4f} "
        f"(SE {a['se']:.4f}), t({a['df']}) = {a['t']:.3f}, p = {a['p']:.4f}"
    )
    print(f"Pre-to-post slope {a['pre_post_slope']:.3f}")
    print(a["note"])

    print()
    print("=" * 78)
    print("5. BEHAVIOUR AND GAIN, on the both-arm measures only")
    print("=" * 78)
    gains, neck, backtracks, arms = [], [], [], []
    for row in survey:
        s = sessions.get(row["participant_code"])
        if s is None or s.resumed:
            continue
        pre, _ = score_participant(row, "pre")
        post, _ = score_participant(row, "post")
        gains.append(post - pre)
        neck.append(s.neck_visible_s)
        backtracks.append(s.backtrack_count)
        arms.append(row["condition_allocated"])

    g = np.array(gains)
    print(f"Usable for behavioural analysis: {len(g)} of {n}")
    for name, series in (
        ("neck visible seconds", np.array(neck)),
        ("backtrack count", np.array(backtracks)),
    ):
        rho, p = sps.spearmanr(series, g)
        print(f"  {name:<22} vs gain: Spearman rho = {rho:+.3f}, p = {p:.4f}")

    ni = np.array([v for v, a_ in zip(neck, arms) if a_ == "interactive"])
    ns = np.array([v for v, a_ in zip(neck, arms) if a_ == "static"])
    bi = np.array([v for v, a_ in zip(backtracks, arms) if a_ == "interactive"])
    bs = np.array([v for v, a_ in zip(backtracks, arms) if a_ == "static"])
    print(f"\n  neck visible seconds by arm: interactive {ni.mean():.0f}s, static {ns.mean():.0f}s")
    print(f"  backtrack count by arm     : interactive {bi.mean():.2f}, static {bs.mean():.2f}")
    print(
        "\nBoth measures are emitted by both arms, which is why they may be compared across\n"
        "conditions. Explorer dwell and interaction breadth are interactive-only by construction and\n"
        "are reported within that arm alone: a cross-arm comparison of them would compare what each\n"
        "arm is capable of emitting, not participant behaviour."
    )

    print()
    print("=" * 78)
    print("PIPELINE COMPLETE")
    print("=" * 78)
    print(
        "This ran against simulated data. The generating model gives the interactive arm a small\n"
        "advantage so that every path is exercised. It is not a prediction, and the effect it uses is\n"
        "deliberately below the smallest the study is powered to detect."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
