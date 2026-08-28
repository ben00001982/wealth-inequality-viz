# Finish the push

Two files are still missing from this repository, and there is one trap to avoid. Read the trap
first: it is the part that can silently damage the artefact.

## Do not run `git add -A` from the disk copy

The working copy at
`Claude_Cowork/02_outputs/interactive-narrative-viz-uk-wealth-inequality/artefact-repo/` is the
24 August state. This repository is now ahead of it. Five files on disk are **older** than what is
here:

| File | Why it matters |
|---|---|
| `src/data/narrative.js` | The disk copy's `CAVEAT_SHORT` still reads "about £800bn, roughly 15%, missing". The published figure is 5%. |
| `src/components/Sources.jsx` | Carries the same uncorrected proportion in the limitations section. |
| `scripts/make_synthetic.py` | Generates `missing_top.json` at the old proportion, which changes the encoded geometry of the S16 bar. |
| `scripts/validate.py` | Older provenance and cross-file checks. |
| `scripts/config.py` | Older output schema. |

The caveat string appears on every chart that reports a wealth level or share, in both A/B arms, and
it is the quantity the S16 segmented bar and the E7 missing band encode. Overwriting the corrected
version would put a known-wrong figure in front of every participant. So add the two named files
below individually. Do not bulk-add, and do not `git checkout` this repository over the disk copy
without diffing first.

If you want the disk copy brought up to date instead, pull from here rather than pushing from there:

```bash
git fetch origin && git diff origin/main -- src/data/narrative.js
```

## 1. The lock file

`package-lock.json` is not here. The deploy workflow runs `npm ci`, which requires it, so the first
deploy fails without it. The copy on disk is byte-identical to the authoritative one (both hash to
`76255b2dc14e09d48b97fe31e7ca694bde302031`), so adding just that file is safe:

```bash
cd "<path to>/Claude_Cowork/02_outputs/interactive-narrative-viz-uk-wealth-inequality/artefact-repo"
git init && git branch -M main                     # if not already a repo
git remote add origin https://github.com/ben00001982/wealth-inequality-viz.git
git fetch origin && git reset --soft origin/main   # adopt what is already here
git add package-lock.json
git commit -m "Add the dependency lock file"
git push
```

It was not pushed from the session that wrote the rest because it is 2,432 lines carrying 167
sha512 integrity hashes, and a hand-transcribed lock file that is one character wrong fails `npm ci`
with a checksum error. Taking it from disk is exact and takes one command.

## 2. The Pages workflow

`docs/github-pages-workflow.yml` has to become `.github/workflows/deploy.yml`. It is parked under
`docs/` because the API token used to write this repository does not carry the `workflow` scope, so
GitHub refuses to write anything under `.github/workflows` through the API. That refusal is a
permission limit, not a mistake. From your own machine there is no such restriction:

```bash
mkdir -p .github/workflows
git mv docs/github-pages-workflow.yml .github/workflows/deploy.yml
```

Then delete the header block at the top of the moved file, down to the `---` rule. Everything below
it is the workflow proper.

```bash
git commit -am "Add the Pages deploy workflow" && git push
```

The parked copy was refreshed on 28 August. An earlier draft of it was still sitting here, and that
draft had a generate-placeholders-if-empty step the current workflow does not have. Moving the old
one into place would have installed the wrong workflow.

## 3. Enable Pages

Repository → Settings → Pages → Source: **GitHub Actions**. Not "Deploy from a branch".

## 4. Decide on visibility

This repository is **private**. That is deliberate, and the decision to change it is yours, because
the repository carries your name and student number.

GitHub Pages on a free account requires a public repository. So the artefact cannot be deployed for
the user study until either this repository is made public, or the built site is hosted somewhere
else. The A2 submission needs a repository link and the study needs a working Pages URL, so this has
to be settled before P6.

Settings → General → Danger Zone → Change repository visibility.

## 5. Check the base path matches the repository name

`vite.config.js` sets `base` to `/wealth-inequality-viz/`. A GitHub Pages project page is served
from `https://<user>.github.io/<repo>/`, so that string must equal the repository name exactly. If
the repository is ever renamed, change the base in the same commit, or every asset request 404s and
the page renders blank with a MIME-type error on the module script and no other clue.

The local fallback build for the viva is the other case: `npm run build:local` sets a relative base
and writes to `dist-local/`. The two builds are not interchangeable. See `docs/DEPLOYMENT.md`.

## What the data files mean

`public/data/*.json` are committed here even though `.gitignore` lists them. That is deliberate: the
current workflow has no placeholder-generation step, so an empty `public/data` fails at
`scripts/validate.py` before the build runs.

They are **synthetic placeholders**. Every one declares `__meta.synthetic: true`, the artefact shows
its standing placeholder banner, and the workflow emits a build warning. The study cannot run
against them. Regenerate at any time with `npm run data`, or replace them with real pipeline output
as set out in `docs/DATA-PIPELINE.md`, at which point the banner disappears by itself.
