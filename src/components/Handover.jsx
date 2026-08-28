import { useMemo } from 'react'
import { Label, ListBox, ListBoxItem, Select, SelectValue, Button, Popover } from 'react-aria-components'
import { AGE_BANDS, ITL1, TENURES, captionFor, lookupMedian } from '../data/lookup.js'
import { rowsOf } from '../hooks/useData.js'
import { StepAnnotation } from './StepAnnotation.jsx'
import { can } from '../state/conditions.js'
import { stepById } from '../data/narrative.js'
import { fmtGBP } from './DataTable.jsx'

/**
 * S18, the martini-glass handover.
 *
 * Design spec B.3. The narrowest authored point of the piece opens out by asking the reader to place
 * themselves: age band, region, tenure. A rule drops them onto the distribution they have just been
 * shown, converting the national picture into a personal position, and those inputs seed the
 * explorer so exploration starts from "me" and radiates outward.
 *
 * This is the scaffolded transition (Riche et al., 2018): the reader gets autonomy only after the
 * guided phase has given them the frame to use it responsibly.
 *
 * In the static condition there is no input. S18 renders a fixed typical-renter against
 * typical-owner comparison and the narrative simply ends. That keeps the two arms identical in
 * content up to the handover, which is what isolates interactivity as the manipulated variable.
 *
 * "Lookup, not prediction" is enforced in the data layer, not here: lookupMedian returns a published
 * survey median for a characteristic cell and degrades to a coarser cut when the cell is thin, and
 * captionFor produces the wording that says so. This component never computes a wealth figure.
 */
export function Handover({ state, dispatch, data, logger }) {
  const step = stepById.S18
  const interactive = can(state.condition, 'handoverInput')

  const table = useMemo(() => rowsOf(data.wasLookup), [data.wasLookup])
  const result = useMemo(
    () => (interactive ? lookupMedian(table, state.profile) : null),
    [interactive, table, state.profile],
  )

  const complete = state.profile.ageBand && state.profile.tenure && state.profile.region

  if (!interactive) {
    return (
      <div className="handover handover--static">
        <StepAnnotation step={step} />
        <p className="handover__static-note">
          A typical private renter and a typical outright owner, side by side. The chart shows the
          survey median for each group.
        </p>
      </div>
    )
  }

  const setField = (field, value) => {
    dispatch({ type: 'SET_PROFILE_FIELD', field, value })
    logger.controlInteraction('handover-input', { field }, 'interactive-only')
  }

  return (
    <div className="handover">
      <StepAnnotation step={step} />

      <div className="handover__inputs">
        <FieldSelect
          label="Your age band"
          items={AGE_BANDS.map((b) => ({ id: b, label: b }))}
          value={state.profile.ageBand}
          onChange={(v) => setField('ageBand', v)}
        />
        <FieldSelect
          label="How you live"
          items={TENURES.map((t) => ({ id: t.id, label: t.label }))}
          value={state.profile.tenure}
          onChange={(v) => setField('tenure', v)}
        />
        <FieldSelect
          label="Where you live"
          items={ITL1.map((r) => ({
            id: r.code,
            label: r.wasCovered ? r.name : `${r.name} (not covered by the survey)`,
            disabled: !r.wasCovered,
          }))}
          value={state.profile.region}
          onChange={(v) => setField('region', v)}
        />
      </div>

      <div className="handover__result" aria-live="polite">
        {!complete && (
          <p className="handover__hint">
            Choose all three to see where the survey puts a typical household like that. Nothing you
            enter is transmitted anywhere: it stays in this browser.
          </p>
        )}
        {complete && result && (
          <>
            <p className="handover__value">
              {result.median != null
                ? `Typical wealth for a household like this: ${fmtGBP(result.median)}`
                : 'The survey cannot report a figure for that combination.'}
            </p>
            <p className="handover__caption">{captionFor(result)}</p>
          </>
        )}
      </div>

      {complete && (
        <Button
          className="button button--primary"
          onPress={() => {
            dispatch({ type: 'ENTER_EXPLORER' })
            logger.explorerEntered('E1.1')
          }}
        >
          Explore the data yourself
        </Button>
      )}
    </div>
  )
}

/**
 * A labelled select built on React-aria.
 *
 * React-aria supplies the keyboard interaction model, the ARIA wiring and the focus management for a
 * listbox pattern, which is a great deal of behaviour that is easy to get subtly wrong by hand:
 * type-ahead, Home and End, wrap behaviour, the relationship between the trigger's accessible name
 * and the selected value, and returning focus to the trigger on close. What it does not supply is the
 * visible focus indicator or the contrast of the styling, which are ours: see index.css.
 */
function FieldSelect({ label, items, value, onChange }) {
  return (
    <Select
      className="field"
      selectedKey={value}
      onSelectionChange={(key) => onChange(key)}
      placeholder="Choose"
    >
      <Label className="field__label">{label}</Label>
      <Button className="field__trigger">
        <SelectValue />
        <span aria-hidden="true" className="field__chevron">
          ▾
        </span>
      </Button>
      <Popover className="field__popover">
        <ListBox className="field__list" items={items}>
          {(item) => (
            <ListBoxItem id={item.id} isDisabled={item.disabled} className="field__option">
              {item.label}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  )
}
