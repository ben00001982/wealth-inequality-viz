"""Temporal alignment between the Wealth and Assets Survey and the annual series.

The rule, from the tech stack reference and recorded as a project decision on 2026-06-11: use the
WAS wave midpoint as the reference year, and select the closest annual House Price Index or Family
Resources Survey point to it.

Two traps this module exists to stop.

The basis change. WAS waves ran on a July-to-June year up to Wave 5 and on an April-to-March year
from Round 6 onwards. The published workbook is split into two blocks that overlap in calendar
terms, so a script that reads a "year" column and plots it will double-count the overlap and will
silently produce a series with two points for some years. Wave records are therefore held here as
explicit start and end dates and never as a year.

The 2010-versus-2020 request. The frozen design spec asked S11 to compare "2010 vs 2020". No wave has
a midpoint in either year, so that pairing cannot be produced from this survey at all. The nearest
honest near-decade pairing is Wave 3 against Round 8, which is what `near_decade_pair` returns. This
is design spec revision r2.3.

Every date below is transcribed from the published wave documentation and must be re-checked against
the release actually downloaded. Where a wave's exact boundaries could not be confirmed, the entry
carries `confirmed=False` and the caller is expected to treat it as provisional.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Wave:
    label: str
    start: date
    end: date
    basis: str  # "jul-jun" or "apr-mar"
    confirmed: bool = True

    @property
    def midpoint(self) -> date:
        return self.start + (self.end - self.start) / 2

    @property
    def reference_year(self) -> int:
        """The alignment key. The midpoint's calendar year, per the project decision."""
        return self.midpoint.year


#: The wave calendar. Labels follow the ONS convention, which changed partway through: early
#: collections are "Wave n" and later ones are "Round n". Both forms are kept as published rather
#: than normalised, because the report has to cite them as published.
WAVES: tuple[Wave, ...] = (
    Wave("Wave 1", date(2006, 7, 1), date(2008, 6, 30), "jul-jun"),
    Wave("Wave 2", date(2008, 7, 1), date(2010, 6, 30), "jul-jun"),
    Wave("Wave 3", date(2010, 7, 1), date(2012, 6, 30), "jul-jun"),
    Wave("Wave 4", date(2012, 7, 1), date(2014, 6, 30), "jul-jun"),
    Wave("Wave 5", date(2014, 7, 1), date(2016, 6, 30), "jul-jun"),
    Wave("Round 6", date(2016, 4, 1), date(2018, 3, 31), "apr-mar"),
    Wave("Round 7", date(2018, 4, 1), date(2020, 3, 31), "apr-mar"),
    Wave("Round 8", date(2020, 4, 1), date(2022, 3, 31), "apr-mar"),
)

WAVE_BY_LABEL = {w.label: w for w in WAVES}

#: The overlap the basis change creates. Wave 5 ends 30 June 2016 and Round 6 starts 1 April 2016,
#: so the quarter from April to June 2016 falls inside both blocks. Any concatenation of the two
#: blocks must drop one of them for that quarter, and the choice must be recorded.
BASIS_CHANGE_OVERLAP = (date(2016, 4, 1), date(2016, 6, 30))


def closest_annual_point(reference_year: int, available_years: list[int]) -> int:
    """Pick the annual observation closest to a wave's reference year.

    Ties break to the earlier year, so the choice is deterministic and reproducible rather than
    dependent on dict ordering. A tie means the wave midpoint sits exactly between two annual points,
    which happens for a mid-year midpoint against calendar-year data.
    """
    if not available_years:
        raise ValueError("No annual observations available to align against.")
    return min(sorted(available_years), key=lambda y: (abs(y - reference_year), y))


def align_waves_to_annual(available_years: list[int]) -> dict[str, int]:
    """Map every wave label to the annual year it aligns with."""
    return {w.label: closest_annual_point(w.reference_year, available_years) for w in WAVES}


def near_decade_pair() -> tuple[Wave, Wave]:
    """The closest honest near-decade pairing for S11.

    Returns Wave 3 (July 2010 to June 2012) and Round 8 (April 2020 to March 2022). The gap between
    the midpoints is a little under ten years, and the labels must be shown as published rather than
    rounded to "2010" and "2020", because rounding them is what created the original error.
    """
    return WAVE_BY_LABEL["Wave 3"], WAVE_BY_LABEL["Round 8"]


def describe_alignment() -> str:
    """A human-readable record of the alignment, for the pipeline log and the report appendix."""
    lines = [
        "Temporal alignment: WAS wave midpoint as the reference year, closest annual point selected.",
        "",
        f"{'Wave':<10} {'Collection period':<34} {'Basis':<9} {'Midpoint':<12} Reference year",
    ]
    for w in WAVES:
        period = f"{w.start.isoformat()} to {w.end.isoformat()}"
        flag = "" if w.confirmed else "  [PROVISIONAL]"
        lines.append(
            f"{w.label:<10} {period:<34} {w.basis:<9} {w.midpoint.isoformat():<12} "
            f"{w.reference_year}{flag}"
        )
    a, b = near_decade_pair()
    lines += [
        "",
        "Basis change: waves up to Wave 5 use a July-to-June year; Round 6 onwards use April-to-March.",
        f"Overlap created by the change: {BASIS_CHANGE_OVERLAP[0]} to {BASIS_CHANGE_OVERLAP[1]}.",
        "One block must be dropped for that quarter when the two are concatenated, and the choice",
        "recorded. Plotting a naive year column across both blocks double-counts it.",
        "",
        "S11 near-decade pairing (design spec revision r2.3, replacing the unproducible "
        '"2010 vs 2020"):',
        f"  {a.label} ({a.start.isoformat()} to {a.end.isoformat()})",
        f"  {b.label} ({b.start.isoformat()} to {b.end.isoformat()})",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    print(describe_alignment())
