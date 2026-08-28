/**
 * The accessible alternative to every chart.
 *
 * A real table with a caption, a header row with scope, and formatted cells. This is what makes the
 * charts usable without perceiving colour or position at all, and it is the reason the artefact can
 * claim WCAG 1.4.1 and 1.3.1 compliance rather than merely asserting it.
 */
export function DataTable({ caption, rows, columns }) {
  if (!rows?.length) return null

  const cols =
    columns ??
    Object.keys(rows[0]).map((key) => ({ key, label: key, format: (v) => String(v ?? '') }))

  return (
    <table className="data-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c.key} scope="col">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {cols.map((c, j) =>
              j === 0 ? (
                <th key={c.key} scope="row">
                  {c.format ? c.format(row[c.key], row) : String(row[c.key] ?? '')}
                </th>
              ) : (
                <td key={c.key}>
                  {c.format ? c.format(row[c.key], row) : String(row[c.key] ?? '')}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const fmtGBP = (v) =>
  v == null
    ? 'Not available'
    : new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        maximumFractionDigits: 0,
      }).format(v)

export const fmtPercent = (v) =>
  v == null ? 'Not available' : `${(v * 100).toFixed(1)}%`

export const fmtNumber = (v, digits = 1) =>
  v == null ? 'Not available' : Number(v).toFixed(digits)
