"""Generate a simulated dataset so the pipeline can be proved before any participant exists.

This is a test fixture, not a prediction. It produces the two files the real study will produce: a
survey export with consent, allocation, demographics and every instrument response, and a column of
return codes. The point is to exercise every path the analysis will take, so the awkward cases are
deliberately over-represented rather than realistic:

  - participants who never took a code, which is the study's main loss mode
  - a code corrupted in transit, which must be refused rather than silently mis-parsed
  - a code from an older version, which must be refused with a version reason
  - a participant who stopped early, so the exposure flag is false
  - a resumed session, whose duration measures must be suppressed
  - "don't know" answers, blanks, an absurd numeric estimate and a zero

The generating model gives the interactive arm a modest advantage. That is so the pipeline can be seen
to detect something; it is NOT a hypothesis about the real effect, and the number is set below the
smallest effect the study is powered for on purpose, so nobody mistakes the fixture's output for a
prediction.
"""

from __future__ import annotations

import csv
import random
from pathlib import Path

from return_code import STEP_ORDER, checksum, encode

OUT = Path(__file__).parent / "simulated"

#: True values for the six estimation items, from the confirmed figures. These are the same values the
#: instrument scores against, so the fixture and the scorer cannot disagree.
TRUTHS = {
    "E01_top10_share_pct": 57.0,
    "E02_property_share_pct": 40.0,
    "E03_avg_house_price": 271188.0,
    "E04_price_to_earnings": 7.7,
    "E05_se_ne_ratio": 2.72,
    "E06_missing_top_bn": 800.0,
}

FACTUAL_KEYS = {
    "C01": "About half", "C02": "It has stayed about the same", "C03": "About 40%",
    "C05": "It has fallen", "C06": "Owners, by a long way", "C08": "More than four times",
    "C09": "About eight times", "C10": "Older households pulled ahead",
    "C13": "London", "C15": "More than twice as high",
    "C20": "About £800 billion, roughly five per cent of the total", "C22": "23%",
}

SIM_EFFECT = 0.06  # deliberately below the powered minimum: a fixture, not a hypothesis


def _noisy(truth: float, skill: float, rng: random.Random) -> float:
    """An estimate whose log error shrinks as skill rises. Log-normal, because estimates are ratios."""
    sigma = 1.6 * (1.0 - skill) + 0.05
    return max(1.0, truth * pow(2.718281828, rng.gauss(0.0, sigma)))


def generate(n_per_arm: int = 60, seed: int = 42) -> tuple[Path, Path]:
    rng = random.Random(seed)
    OUT.mkdir(exist_ok=True)
    survey_path = OUT / "survey_export.csv"
    codes_path = OUT / "return_codes.csv"

    fieldnames = (
        ["participant_code", "condition_allocated", "consent_all", "age_band", "tenure", "region"]
        + [f"pre_{k}" for k in TRUTHS]
        + [f"post_{k}" for k in TRUTHS]
        + [f"pre_{k}" for k in FACTUAL_KEYS]
        + [f"post_{k}" for k in FACTUAL_KEYS]
        + ["minivlat_score", "return_code_pasted"]
    )

    rows, code_rows = [], []
    for arm_index, condition in enumerate(("interactive", "static")):
        for i in range(n_per_arm):
            pid = f"{'I' if condition == 'interactive' else 'S'}{i:04d}"
            skill = min(0.95, max(0.05, rng.gauss(0.45, 0.16)))
            lift = SIM_EFFECT if condition == "interactive" else 0.02
            post_skill = min(0.98, skill + max(0.0, rng.gauss(lift, 0.05)))

            row = {
                "participant_code": pid,
                "condition_allocated": condition,
                "consent_all": "yes",
                "age_band": rng.choice(["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]),
                "tenure": rng.choice(["owned-outright", "mortgaged", "private-rent", "social-rent"]),
                "region": rng.choice(["TLC", "TLD", "TLI", "TLJ", "TLM"]),
                "minivlat_score": max(0, min(12, int(rng.gauss(7.5, 2.2)))),
            }
            for key, truth in TRUTHS.items():
                row[f"pre_{key}"] = round(_noisy(truth, skill, rng), 2)
                row[f"post_{key}"] = round(_noisy(truth, post_skill, rng), 2)
            for item, correct in FACTUAL_KEYS.items():
                for phase, sk in (("pre", skill), ("post", post_skill)):
                    r = rng.random()
                    if r < sk:
                        row[f"{phase}_{item}"] = correct
                    elif r < sk + 0.12:
                        row[f"{phase}_{item}"] = "Don't know"
                    else:
                        row[f"{phase}_{item}"] = "a wrong option"

            # --- awkward cases, seeded deterministically so the test is reproducible ---
            idx = arm_index * n_per_arm + i
            complete = True
            code: str | None = None

            neck = [f"S{j}" for j in range(19)]
            dwell = {s: max(1, int(rng.gauss(14, 6))) for s in neck}
            if condition == "interactive":
                for view in ("E1.1", "E1.2", "E1.3", "E5", "E7"):
                    dwell[view] = max(0, int(rng.gauss(35, 18)))
            revisits = {s: (1 if rng.random() < 0.18 else 0) for s in neck}
            interactions = {"section-nav": rng.randint(0, 4), "data-table": rng.randint(0, 3)}
            if condition == "interactive":
                interactions |= {
                    "handover-input": 3,
                    "cross-filter": rng.randint(0, 12),
                    "zoom-out-step": rng.randint(0, 4),
                    "preset": rng.randint(0, 2),
                }

            if idx % 17 == 3:              # never took a code: the study's main loss mode
                code = None
            else:
                if idx % 23 == 5:          # stopped early
                    complete = False
                    for view in ("E5", "E7"):
                        dwell.pop(view, None)
                code = encode(
                    pid, condition, STEP_ORDER, dwell, dwell, revisits, interactions,
                    exposure_complete=complete,
                    resumed=(idx % 29 == 7),
                    session_seconds=sum(dwell.values()),
                    event_count=40 + len(interactions),
                )
                if idx % 31 == 11:         # corrupted in transit
                    code = code[:30] + ("z" if code[30] != "z" else "y") + code[31:]
                if idx % 37 == 13:
                    # An older version's code, correctly checksummed. Simply editing the version
                    # digit would fail the checksum first and never reach the version check, so this
                    # path would look tested while never running.
                    body, _, _ = code.rpartition("~")
                    old_body = "v3" + body[2:]
                    code = f"{old_body}~{checksum(old_body)}"

            # a few deliberately messy instrument responses
            if idx % 19 == 2:
                row["post_E03_avg_house_price"] = 1_000_000_000  # absurd, must attenuate to zero
            if idx % 19 == 4:
                row["pre_E01_top10_share_pct"] = 0              # below minimum, must be flagged
            if idx % 19 == 6:
                row["post_C01"] = ""                             # blank, must count as missing

            row["return_code_pasted"] = code or ""
            rows.append(row)
            if code:
                code_rows.append({"participant_code": pid, "return_code": code})

    with survey_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    with codes_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["participant_code", "return_code"])
        w.writeheader()
        w.writerows(code_rows)

    print(f"simulated {len(rows)} participants; {len(code_rows)} supplied a return code")
    print(f"  {survey_path}")
    print(f"  {codes_path}")
    return survey_path, codes_path


if __name__ == "__main__":
    generate()
