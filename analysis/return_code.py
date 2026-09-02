"""Decode the artefact's return code. A port of src/study/returnCode.js.

The two implementations MUST agree, because the browser encodes and this decodes. The test at the
foot of this file locks them together against a real code produced by the built artefact, and it runs
on import in __main__ so a divergence is caught the first time anyone runs the pipeline rather than
after data collection.

FNV-1a in Python needs the explicit 32-bit mask that JavaScript gets for free from its bitwise
operators coercing to int32. That is the one place a naive port silently produces different hashes,
and a checksum that disagrees rejects every genuine code.
"""

from __future__ import annotations

from dataclasses import dataclass, field

RETURN_CODE_VERSION = 4
SEP = "~"
FIELD_SEP = "."

FNV_OFFSET = 0x811C9DC5
FNV_PRIME = 0x01000193
MASK32 = 0xFFFFFFFF


def checksum(text: str) -> str:
    """FNV-1a, 32 bit, eight hex digits. Detects corruption, not tampering."""
    h = FNV_OFFSET
    for ch in text:
        h ^= ord(ch)
        h = (h * FNV_PRIME) & MASK32
    return f"{h:08x}"


def _unb36(s: str) -> int:
    try:
        return int(s, 36)
    except (ValueError, TypeError):
        return 0


@dataclass
class Session:
    participant_code: str | None
    condition: str
    session_seconds: int
    event_count: int
    exposure_complete: bool
    reduced_motion: bool
    resumed: bool
    storage_writable: bool
    dwell_s: dict[str, int] = field(default_factory=dict)
    visible_dwell_s: dict[str, int] = field(default_factory=dict)
    revisits: dict[str, int] = field(default_factory=dict)
    interactions: dict[str, int] = field(default_factory=dict)

    # Derived measures. Only the ones both arms can emit are safe for a between-condition contrast:
    # see the scope discipline in the telemetry analysis plan. The rest are within-arm only.
    @property
    def neck_visible_s(self) -> int:
        """Visible dwell across the guided neck, S0 to S17. Emitted by both arms."""
        return sum(v for k, v in self.visible_dwell_s.items() if k.startswith("S") and k != "S18")

    @property
    def backtrack_count(self) -> int:
        """Step revisits beyond the first entry, across the neck. Emitted by both arms."""
        return sum(v for k, v in self.revisits.items() if k.startswith("S"))

    @property
    def explorer_visible_s(self) -> int:
        """Interactive arm only: it has no meaning in the static arm, which reports zero."""
        return sum(v for k, v in self.visible_dwell_s.items() if k.startswith("E"))

    @property
    def interaction_breadth(self) -> int:
        """Distinct controls used. Interactive-heavy, so within-arm unless restricted by scope."""
        return len(self.interactions)


def _b36(n: int) -> str:
    n = max(0, int(round(n)))
    if n == 0:
        return "0"
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = digits[r] + out
    return out


def encode(
    participant_code: str,
    condition: str,
    step_order: list[str],
    dwell_s: dict[str, int],
    visible_dwell_s: dict[str, int],
    revisits: dict[str, int],
    interactions: dict[str, int],
    exposure_complete: bool = True,
    reduced_motion: bool = False,
    resumed: bool = False,
    storage_writable: bool = True,
    session_seconds: int = 0,
    event_count: int = 0,
) -> str:
    """Encode a return code. Used ONLY to build simulated data for testing the pipeline.

    The artefact is the real encoder. This exists so the analysis can be exercised end to end before
    a participant exists, and the self-test above pins it against a code the browser actually produced,
    so the two cannot drift apart unnoticed.
    """
    flags = "".join(
        "1" if f else "0"
        for f in (exposure_complete, reduced_motion, resumed, storage_writable)
    )
    parts = [
        f"v{RETURN_CODE_VERSION}",
        participant_code or "nopid",
        "i" if condition == "interactive" else "s",
        _b36(session_seconds),
        _b36(event_count),
        flags,
        FIELD_SEP.join(_b36(dwell_s.get(k, 0)) for k in step_order),
        FIELD_SEP.join(_b36(visible_dwell_s.get(k, 0)) for k in step_order),
        FIELD_SEP.join(_b36(revisits.get(k, 0)) for k in step_order),
        FIELD_SEP.join(f"{k}:{_b36(v)}" for k, v in sorted(interactions.items())),
    ]
    body = SEP.join(parts)
    return f"{body}{SEP}{checksum(body)}"


class DecodeError(ValueError):
    pass


def decode(code: str, step_order: list[str]) -> Session:
    """Decode and validate. Raises DecodeError with a reason the analysis can tabulate.

    Every refusal reason is distinguishable, because the analysis has to report how many codes were
    rejected and why. A single 'invalid' bucket would hide a systematic problem, for example a survey
    field truncating every code at the same length.
    """
    if not isinstance(code, str) or SEP not in code:
        raise DecodeError("not-a-code")

    trimmed = "".join(code.split())
    body, _, given = trimmed.rpartition(SEP)
    if checksum(body) != given:
        raise DecodeError("checksum-failed")

    parts = body.split(SEP)
    if len(parts) != 10:
        raise DecodeError(f"field-count:{len(parts)}")

    version, pid, cond, sess, events, flags, dwell_v, vis_v, rev_v, inter = parts
    if version != f"v{RETURN_CODE_VERSION}":
        raise DecodeError(f"version-mismatch:{version}")

    dwell = [_unb36(x) for x in dwell_v.split(FIELD_SEP)] if dwell_v else []
    if len(dwell) != len(step_order):
        raise DecodeError(f"step-count:{len(dwell)}!={len(step_order)}")

    def zipped(raw: str) -> dict[str, int]:
        vals = [_unb36(x) for x in raw.split(FIELD_SEP)] if raw else []
        return {s: (vals[i] if i < len(vals) else 0) for i, s in enumerate(step_order)}

    interactions: dict[str, int] = {}
    if inter:
        for kv in inter.split(FIELD_SEP):
            if ":" in kv:
                k, v = kv.split(":", 1)
                interactions[k] = _unb36(v)

    if len(flags) < 4:
        raise DecodeError(f"flag-bits:{flags!r}")

    return Session(
        participant_code=None if pid == "nopid" else pid,
        condition="interactive" if cond == "i" else "static",
        session_seconds=_unb36(sess),
        event_count=_unb36(events),
        exposure_complete=flags[0] == "1",
        reduced_motion=flags[1] == "1",
        resumed=flags[2] == "1",
        storage_writable=flags[3] == "1",
        dwell_s=zipped(dwell_v),
        visible_dwell_s=zipped(vis_v),
        revisits=zipped(rev_v),
        interactions=interactions,
    )


#: The canonical vector order. Must equal CODE_STEP_ORDER in ReturnPanel.jsx: nineteen narrative
#: steps then the five explorer views, in the order Object.values(EXPLORER_VIEW) yields.
STEP_ORDER = [f"S{i}" for i in range(19)] + ["E1.1", "E1.2", "E1.3", "E5", "E7"]


def _self_test() -> None:
    """Lock the Python and JavaScript implementations together.

    The code below was produced by the built artefact in a headless browser on 1 September 2026: a
    session that reached S18, completed the handover, entered the explorer and sat on E7 for four
    seconds before taking the code. If this test fails, the two implementations have diverged and no
    return code will decode.
    """
    real = (
        "v4~E7DEBUG1~i~5~b~1001~"
        "0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.2.1.0.0.0.4~"
        "0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.2.1.0.0.0.4~"
        "0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0~"
        "handover-input:3~da30da1a"
    )
    assert checksum("abc") == "1a47e90b", f"FNV-1a mismatch: {checksum('abc')}"
    s = decode(real, STEP_ORDER)
    assert s.participant_code == "E7DEBUG1", s.participant_code
    assert s.condition == "interactive"
    assert s.exposure_complete is True
    assert s.dwell_s["S18"] == 2, s.dwell_s
    assert s.dwell_s["E1.1"] == 1, s.dwell_s
    # E7 is the close, and it is the section still open when the code is taken. A non-zero value here
    # is the regression guard for the bug that made it always zero: the code used to be computed on
    # render, and no render happens while a reader sits reading the final view.
    assert s.dwell_s["E7"] == 4, s.dwell_s
    assert s.interactions == {"handover-input": 3}, s.interactions

    # A one-character corruption must be refused, not silently mis-parsed.
    corrupted = real[:40] + ("9" if real[40] != "9" else "8") + real[41:]
    try:
        decode(corrupted, STEP_ORDER)
    except DecodeError as exc:
        assert "checksum" in str(exc), exc
    else:
        raise AssertionError("a corrupted code decoded without complaint")

    # The simulation encoder must round-trip, and must reproduce the browser's code exactly when
    # given the same inputs. That is what stops the test harness drifting from the artefact.
    rebuilt = encode(
        "E7DEBUG1", "interactive", STEP_ORDER,
        s.dwell_s, s.visible_dwell_s, s.revisits, s.interactions,
        exposure_complete=True, reduced_motion=False, resumed=False, storage_writable=True,
        session_seconds=s.session_seconds, event_count=s.event_count,
    )
    assert rebuilt == real, f"python encoder diverged from the browser:\n{rebuilt}\n{real}"

    print("return_code self-test passed: encoder and decoder agree, corruption is refused,")
    print("  and the Python simulation encoder reproduces a real browser code byte for byte")


if __name__ == "__main__":
    _self_test()
