# Front-end data

This directory is populated by the pipeline and its contents are gitignored.

Run `npm run data` (that is `python scripts/make_synthetic.py`) to generate synthetic placeholder
files so the application has something to render, or run the real pipeline as set out in
`docs/DATA-PIPELINE.md`.

Every file carries a `__meta` block declaring its provenance. A `synthetic: true` flag makes the
application display a standing banner saying the figures are placeholders, and
`python scripts/validate.py` fails if real and synthetic files are ever served together.
