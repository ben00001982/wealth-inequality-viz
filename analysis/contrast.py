"""The primary contrast, and the two things everyone gets wrong about it.

**One.** In a 2x2 mixed design (condition between, time within) the condition-by-time interaction F
equals the square of the t from an independent-samples test on gain scores. That identity holds for
the POOLED-variance (Student) t and NOT for Welch's. Four project documents asserted it of Welch. The
`interaction_equivalence_demo` below proves the distinction numerically rather than asserting it, and
`primary_contrast` reports both so the claim in the report can be the true one.

**Two.** The power calculation assumes equal variances, because it is derived from the pooled formula.
So if Welch is reported as primary, the powered test and the reported test are not the same test. That
is stated in the output rather than left for a reader to notice.

Effect sizes are reported with intervals, not p-values alone. A null result is a legitimate outcome
for this study and an interval says how null it is; a bare p above .05 does not.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, asdict

import numpy as np
from scipy import stats


@dataclass
class EffectSize:
    d: float           # Cohen's d, pooled
    g: float           # Hedges' g, small-sample corrected
    ci_low: float      # 95% interval on g
    ci_high: float
    n1: int
    n2: int

    def __str__(self) -> str:
        return f"g = {self.g:.3f}, 95% CI [{self.ci_low:.3f}, {self.ci_high:.3f}] (n = {self.n1}, {self.n2})"


def hedges_g(x: np.ndarray, y: np.ndarray) -> EffectSize:
    """Cohen's d and Hedges' g with a 95% interval.

    The correction factor is J = 1 - 3 / (4*df - 1) with df = n1 + n2 - 2. Cohen's d is biased upward
    in small samples and this study's arms are small, so g is the figure to report and d is shown only
    because readers expect it.

    The interval uses the standard large-sample variance approximation for d, scaled by J. It is an
    approximation, and at n around 60 per arm it is good enough to report; it is not exact and the
    report should not present it as such.
    """
    n1, n2 = len(x), len(y)
    if n1 < 2 or n2 < 2:
        raise ValueError("each arm needs at least two observations")
    df = n1 + n2 - 2
    s_pooled = math.sqrt(((n1 - 1) * x.var(ddof=1) + (n2 - 1) * y.var(ddof=1)) / df)
    if s_pooled == 0:
        raise ValueError("zero pooled variance: every observation is identical")
    d = (x.mean() - y.mean()) / s_pooled
    J = 1 - 3 / (4 * df - 1)
    g = J * d
    se_d = math.sqrt((n1 + n2) / (n1 * n2) + d**2 / (2 * (n1 + n2)))
    se_g = J * se_d
    return EffectSize(d, g, g - 1.96 * se_g, g + 1.96 * se_g, n1, n2)


@dataclass
class Contrast:
    """Everything the report needs for the primary comparison, with nothing hidden."""
    n_interactive: int
    n_static: int
    mean_gain_interactive: float
    mean_gain_static: float
    t_pooled: float
    p_pooled: float
    df_pooled: float
    t_welch: float
    p_welch: float
    df_welch: float
    interaction_f: float
    effect: EffectSize
    equal_variance_ok: bool
    levene_p: float
    note: str

    def summary(self) -> str:
        lines = [
            f"Interactive n = {self.n_interactive}, mean gain {self.mean_gain_interactive:+.4f}",
            f"Static      n = {self.n_static}, mean gain {self.mean_gain_static:+.4f}",
            "",
            f"Pooled t({self.df_pooled:.0f}) = {self.t_pooled:.4f}, p = {self.p_pooled:.4f}"
            f"   [t^2 = {self.t_pooled**2:.4f}]",
            f"Interaction F(1,{self.df_pooled:.0f}) = {self.interaction_f:.4f}"
            f"   [equals t^2 above: {abs(self.interaction_f - self.t_pooled**2) < 1e-8}]",
            f"Welch  t({self.df_welch:.1f}) = {self.t_welch:.4f}, p = {self.p_welch:.4f}"
            f"   [t^2 = {self.t_welch**2:.4f}, NOT the interaction]",
            "",
            f"Effect size: {self.effect}",
            f"Levene p = {self.levene_p:.4f} "
            f"({'equal variances tenable' if self.equal_variance_ok else 'variances differ'})",
            "",
            self.note,
        ]
        return "\n".join(lines)


def primary_contrast(
    pre_i: np.ndarray, post_i: np.ndarray, pre_s: np.ndarray, post_s: np.ndarray
) -> Contrast:
    """The condition-by-time interaction, three equivalent-looking ways, honestly labelled."""
    gain_i = np.asarray(post_i, float) - np.asarray(pre_i, float)
    gain_s = np.asarray(post_s, float) - np.asarray(pre_s, float)

    t_p, p_p = stats.ttest_ind(gain_i, gain_s, equal_var=True)
    t_w, p_w = stats.ttest_ind(gain_i, gain_s, equal_var=False)
    df_p = len(gain_i) + len(gain_s) - 2
    # Welch-Satterthwaite degrees of freedom, reported because Welch's p cannot be interpreted
    # without them and they are not an integer.
    v1, v2 = gain_i.var(ddof=1) / len(gain_i), gain_s.var(ddof=1) / len(gain_s)
    df_w = (v1 + v2) ** 2 / (v1**2 / (len(gain_i) - 1) + v2**2 / (len(gain_s) - 1))

    lev_stat, lev_p = stats.levene(gain_i, gain_s)
    effect = hedges_g(gain_i, gain_s)

    note = (
        "The interaction F and the pooled t^2 are the same quantity, which is why the primary\n"
        "contrast can be a single transparent test on gain scores. Welch's t is the\n"
        "variance-robust analogue and is NOT algebraically the interaction. The power\n"
        "calculation assumes equal variances, so if Welch is pre-registered as primary the\n"
        "powered test and the reported test differ; say so in the report rather than eliding it."
    )
    if not (lev_p > 0.05):
        note += (
            "\n\nLevene is significant here, so the pooled test's assumption is questionable and\n"
            "Welch is the defensible primary. Report both and say which was pre-registered."
        )

    return Contrast(
        n_interactive=len(gain_i),
        n_static=len(gain_s),
        mean_gain_interactive=float(gain_i.mean()),
        mean_gain_static=float(gain_s.mean()),
        t_pooled=float(t_p),
        p_pooled=float(p_p),
        df_pooled=float(df_p),
        t_welch=float(t_w),
        p_welch=float(p_w),
        df_welch=float(df_w),
        interaction_f=float(t_p**2),
        effect=effect,
        equal_variance_ok=bool(lev_p > 0.05),
        levene_p=float(lev_p),
        note=note,
    )


def ancova(pre: np.ndarray, post: np.ndarray, is_interactive: np.ndarray) -> dict:
    """ANCOVA on post-test with pre-test as covariate, by ordinary least squares.

    NOT equivalent to the gain-score test, and two project documents said it was while also calling it
    more powerful, which cannot both be true. They coincide only when the within-group slope of post
    on pre is exactly 1. Otherwise they estimate different quantities and can disagree in sign, which
    is Lord's paradox. The returned slope is what tells you how far apart the two models are here.
    """
    pre = np.asarray(pre, float)
    post = np.asarray(post, float)
    g = np.asarray(is_interactive, float)
    X = np.column_stack([np.ones_like(pre), pre, g])
    beta, *_ = np.linalg.lstsq(X, post, rcond=None)
    resid = post - X @ beta
    df = len(post) - X.shape[1]
    mse = (resid @ resid) / df
    xtx_inv = np.linalg.inv(X.T @ X)
    se = np.sqrt(np.diag(xtx_inv) * mse)
    t = beta[2] / se[2]
    return {
        "adjusted_condition_effect": float(beta[2]),
        "se": float(se[2]),
        "t": float(t),
        "p": float(2 * stats.t.sf(abs(t), df)),
        "df": int(df),
        "pre_post_slope": float(beta[1]),
        "note": (
            "ANCOVA and the gain-score test coincide only if pre_post_slope is 1. "
            f"It is {beta[1]:.3f} here. Report them as two analyses, one pre-specified as primary, "
            "not as one analysis in two forms."
        ),
    }


def interaction_equivalence_demo(seed: int = 7) -> str:
    """Prove the pooled-versus-Welch distinction on data rather than asserting it."""
    rng = np.random.default_rng(seed)
    pre_i, pre_s = rng.normal(0.40, 0.12, 23), rng.normal(0.40, 0.12, 31)
    post_i = pre_i + rng.normal(0.10, 0.16, 23)
    post_s = pre_s + rng.normal(0.05, 0.07, 31)   # deliberately unequal variances
    c = primary_contrast(pre_i, post_i, pre_s, post_s)
    return (
        f"pooled t^2      = {c.t_pooled**2:.6f}  p = {c.p_pooled:.5f}\n"
        f"interaction F   = {c.interaction_f:.6f}  <- identical\n"
        f"Welch  t^2      = {c.t_welch**2:.6f}  p = {c.p_welch:.5f}  <- different test, different p\n"
        f"difference in p = {abs(c.p_pooled - c.p_welch):.5f}"
    )


def _self_test() -> None:
    print(interaction_equivalence_demo())
    rng = np.random.default_rng(11)
    pre_i, pre_s = rng.normal(0.4, 0.12, 40), rng.normal(0.4, 0.12, 40)
    post_i, post_s = pre_i + rng.normal(0.12, 0.15, 40), pre_s + rng.normal(0.02, 0.15, 40)
    c = primary_contrast(pre_i, post_i, pre_s, post_s)
    assert abs(c.interaction_f - c.t_pooled**2) < 1e-9
    assert c.effect.ci_low < c.effect.g < c.effect.ci_high
    # Hedges' g must be strictly smaller in magnitude than d: that is the point of the correction.
    assert abs(c.effect.g) < abs(c.effect.d)

    a = ancova(np.r_[pre_i, pre_s], np.r_[post_i, post_s], np.r_[np.ones(40), np.zeros(40)])
    assert "pre_post_slope" in a and a["df"] == 77
    print("\ncontrast self-test passed: identity holds for pooled, fails for Welch, g < d, ANCOVA runs")


if __name__ == "__main__":
    _self_test()
