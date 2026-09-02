"""Score the comprehension instrument.

Two blocks, two scoring rules, and the reason they differ matters.

The FACTUAL block is multiple choice with a "don't know" option, so it scores as a count correct.
"Don't know" scores zero and is NOT treated as missing: declining to guess is a real response and
recording it as missing would delete the participants least confident about the material, which is
the group the artefact is meant to help.

The ESTIMATION block is open numeric, and a count correct is meaningless for a quantity. It scores on
the log ratio of the estimate to the true value, which is the standard treatment for magnitude
estimates because it makes over- and under-estimation symmetric: guessing ten times too high and ten
times too low are equally wrong, which is not true on a linear difference. The absolute log ratio is
then bounded to a 0-to-1 accuracy so it can be averaged with the factual score.

The bound is the part worth understanding. |L| = |ln(estimate / truth)|, so |L| = 0 is exact, |L| =
ln(2) is out by a factor of two, and |L| = ln(10) is out by an order of magnitude. Accuracy is
max(0, 1 - |L| / ln(10)), which reaches zero at an order of magnitude out and stays there. An absurd
answer therefore contributes zero rather than a large negative that would swamp everyone else, and
that is why the instrument says outliers are not removed: the metric already attenuates them.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

#: An estimate this many times out, or worse, scores zero.
LOG_BOUND = math.log(10)

#: Estimates at or below this are treated as refusals rather than answers. A zero cannot be logged,
#: and in practice a zero in an open numeric field is a participant declining, not a genuine belief
#: that the average UK house costs nothing.
MIN_ESTIMATE = 1.0


@dataclass
class ItemResult:
    item_id: str
    block: str
    raw: object
    accuracy: float  # 0 to 1
    note: str = ""


def score_factual(item_id: str, answer: str | None, key: str) -> ItemResult:
    """One multiple-choice item. 'Don't know' and a blank both score zero, distinguishably."""
    if answer is None or answer == "":
        return ItemResult(item_id, "factual", answer, 0.0, "missing")
    normalised = answer.strip().casefold()
    if normalised in {"don't know", "dont know", "do not know", "dk"}:
        return ItemResult(item_id, "factual", answer, 0.0, "declined")
    correct = normalised == key.strip().casefold()
    return ItemResult(item_id, "factual", answer, 1.0 if correct else 0.0)


def log_ratio(estimate: float, truth: float) -> float:
    """Signed log ratio. Negative is an underestimate, positive an overestimate."""
    if truth <= 0:
        raise ValueError("the true value must be positive to take a ratio")
    return math.log(max(estimate, MIN_ESTIMATE) / truth)


def score_estimate(item_id: str, estimate: float | None, truth: float) -> ItemResult:
    """One open numeric item, on the bounded absolute log ratio."""
    if estimate is None:
        return ItemResult(item_id, "estimation", estimate, 0.0, "missing")
    if estimate < MIN_ESTIMATE:
        # Recorded, substituted, flagged and counted, as the instrument requires. Not dropped, and
        # not silently treated as a refusal.
        return ItemResult(item_id, "estimation", estimate, 0.0, "below-minimum-substituted")
    L = log_ratio(float(estimate), truth)
    accuracy = max(0.0, 1.0 - abs(L) / LOG_BOUND)
    direction = "over" if L > 0 else "under"
    return ItemResult(item_id, "estimation", estimate, accuracy, f"|L|={abs(L):.3f} {direction}")


def composite(results: list[ItemResult], weights: dict[str, float] | None = None) -> float:
    """Mean accuracy across items, optionally weighting the two blocks.

    Equal weighting by default, and that is a decision rather than a neutral choice: the factual block
    has far more items, so equal per-item weighting lets it dominate the composite. Weighting by BLOCK
    instead gives the estimation items, which are the ones targeting the perceived-versus-actual gap
    the study is about, an equal say. The protocol should state which it pre-registers; this function
    supports either and defaults to per-item so the default is the simpler thing to describe.
    """
    if not results:
        return float("nan")
    if not weights:
        return sum(r.accuracy for r in results) / len(results)
    by_block: dict[str, list[float]] = {}
    for r in results:
        by_block.setdefault(r.block, []).append(r.accuracy)
    total_w = sum(weights.get(b, 0.0) for b in by_block)
    if total_w == 0:
        return float("nan")
    return sum(
        weights.get(b, 0.0) * (sum(v) / len(v)) for b, v in by_block.items()
    ) / total_w


def _self_test() -> None:
    assert score_factual("C1", "About 40%", "About 40%").accuracy == 1.0
    assert score_factual("C1", "about 40%", "About 40%").accuracy == 1.0  # case and space tolerant
    assert score_factual("C1", "About 25%", "About 40%").accuracy == 0.0
    dk = score_factual("C1", "Don't know", "About 40%")
    assert dk.accuracy == 0.0 and dk.note == "declined"
    assert score_factual("C1", None, "About 40%").note == "missing"

    exact = score_estimate("E1", 271188, 271188)
    assert abs(exact.accuracy - 1.0) < 1e-9, exact

    # Symmetry is the whole point of the log metric: a factor of two either way scores the same.
    high = score_estimate("E1", 2 * 271188, 271188).accuracy
    low = score_estimate("E1", 271188 / 2, 271188).accuracy
    assert abs(high - low) < 1e-9, (high, low)
    assert abs(high - (1 - math.log(2) / LOG_BOUND)) < 1e-9

    # An order of magnitude out scores zero, and worse stays at zero rather than going negative.
    assert score_estimate("E1", 271188 * 10, 271188).accuracy == 0.0
    assert score_estimate("E1", 271188 * 1000, 271188).accuracy == 0.0
    assert score_estimate("E1", 1e9, 271188).accuracy == 0.0

    below = score_estimate("E1", 0, 271188)
    assert below.accuracy == 0.0 and below.note == "below-minimum-substituted"

    mixed = [
        ItemResult("a", "factual", None, 1.0),
        ItemResult("b", "factual", None, 1.0),
        ItemResult("c", "factual", None, 1.0),
        ItemResult("d", "estimation", None, 0.0),
    ]
    assert abs(composite(mixed) - 0.75) < 1e-9
    # Block weighting gives the single estimation item equal standing with the three factual ones.
    assert abs(composite(mixed, {"factual": 1, "estimation": 1}) - 0.5) < 1e-9

    print("score self-test passed: log-ratio symmetry, bounding, refusals and weighting")


if __name__ == "__main__":
    _self_test()
