# Finish the push

Two files are still missing from this repository, and there is one trap to avoid. Read the trap
first: it is the part that can silently damage the artefact.

## Do not bulk-add from the disk copy

The working copy at
`Claude_Cowork/02_outputs/interactive-narrative-viz-uk-wealth-inequality/artefact-repo/` is the
24 August state. This repository is now well ahead of it.

Checked on 1 September by hashing both sides rather than from memory: **thirteen files on disk are
older than what is here, two source modules do not exist on disk at all, and nothing on disk is newer
than what is here.** That last point is what makes the fix in step 1 safe.

The data correction. The missing-top figure was 15%; the published figure is 5% (Advani, Bangham and
Leslie, 2021, section 4.2).

| File | Why it matters |
|---|---|
| `src/data/narrative.js` | The disk copy's `CAVEAT_SHORT` still reads "about £800bn, roughly 15%, missing". |
| `src/components/Sources.jsx` | Carries the same uncorrected proportion in the limitations section. |
| `scripts/make_synthetic.py` | Generates `missing_top.json` at the old proportion, which changes the encoded geometry of the S16 bar. |
| `scripts/validate.py` | Older provenance and cross-file checks. |
| `scripts/config.py` | Older output schema. |

The caveat string appears on every chart that reports a wealth level or share, in both A/B arms, and
it is the quantity the S16 segmented bar and the E7 missing band encode. Overwriting the corrected
version would put a known-wrong figure in front of every participant.

The chart rendering fix and the study harness. All eight are newer here than on disk.

| File | Why it matters |
|---|---|
| `src/index.css` | Holds the three rules that stop every single-view chart rendering an empty SVG, and the return-panel styles. |
| `src/App.jsx` | Mounts the return panel and reads the participant code. Imports the two files below. |
| `src/state/conditions.js` | The consent gate, reload recovery, and the per-arm exposure floor. |
| `src/state/appReducer.js` | The `milestones` slice the return panel renders from. |
| `src/hooks/useSessionLogger.js` | Consent gate, the `pagehide` flush, `entryIndex` and scroll direction. |
| `src/components/study/StudyBar.jsx` | Keeps the arm concealed from participants. |
| `docs/ARCHITECTURE.md` | Corrects three statements that predate this work. |
| `docs/STUDY-HARNESS.md` | Describes the study flow as built. |

Absent from the disk copy entirely:

- `src/study/returnCode.js` and `src/components/study/ReturnPanel.jsx`. **These two go together with
  `src/App.jsx`.** The current `App.jsx` imports both, so taking `App.jsx` from here without them
  gives a build that does not compile. Do not copy files across one at a time.
- `public/data/*.json`, fifteen files. The disk copy has only `public/data/README.md`, so
  `scripts/validate.py` fails there before a build can start. Either take them from here or run
  `npm run data`.
- The six headless test suites, this file, and `docs/github-pages-workflow.yml`.

So: pull from here rather than pushing from there, and take the whole tree in one go.

## 1. Bring the disk copy up to date, before anything else

```bash
cd "<path to>/Claude_Cowork/02_outputs/interactive-narrative-viz-uk-wealth-inequality/artefact-repo"
git init && git branch -M main                    # if not already a repo
git remote add origin https://github.com/ben00001982/wealth-inequality-viz.git
git fetch origin
git reset origin/main        # --mixed, the default: sets the index from HEAD, leaves your files alone
git status                   # the thirteen stale files now show as modified
git checkout -- .            # take this repository's version of every tracked file
```

**Use the default `--mixed`, not `--soft`.** An earlier version of this file said
`git reset --soft origin/main`. `--soft` moves `HEAD` and touches neither the index nor the working
tree, so in a freshly initialised repository the index stays empty: the next `git commit` would then
record a tree containing only what you had just `git add`ed and **delete every other file in the
repository**. `--mixed` sets the index from `HEAD`, which is what makes `git status` and the
`git checkout` above tell the truth.

`git checkout -- .` discards local modifications, which is safe here only because nothing on disk is
newer than this repository. That was verified on 1 September. If you have edited anything on disk
since, run `git diff` first and keep what you need.

## 2. The lock file

`package-lock.json` is not here. The deploy workflow runs `npm ci`, which requires it, so the first
deploy fails without it. The copy on disk is byte-identical to the authoritative one (both still hash
to `76255b2dc14e09d48b97fe31e7ca694bde302031`, re-checked 1 September), so adding just that file is
safe. After step 1:

```bash
git add package-lock.json
git commit -m "Add the dependency lock file"
git push
```

It was not pushed from the session that wrote the rest because it is 2,432 lines carrying 167
sha512 integrity hashes, and a hand-transcribed lock file that is one character wrong fails `npm ci`
with a checksum error. Taking it from disk is exact and takes one command.

## 3. The Pages workflow

`docs/github-pages-workflow.yml` has to become `.github/workflows/deploy.yml`. It is parked under
`docs/` because the API token used to write this repository does not carry the `workflow` scope, so
GitHub refuses to write anything under `.github/workflows` through the API. That refusal is a
permission limit, not a mistake. From your own machine there is no such restriction.

The parked file has never existed on your disk, so step 1 has to have run first. Then:

```bash
mkdir -p .github/workflows
git mv docs/github-pages-workflow.yml .github/workflows/deploy.yml
```

Then delete the header block at the top of the moved file, down to the `---` rule. Everything below
it is the workflow proper.

```bash
git add .github/workflows/deploy.yml docs
git commit -m "Add the Pages deploy workflow"
git push
```

**Name the paths; do not use `git commit -am`.** An earlier version of this file said `-am`, which
stages every modified tracked file. Run before step 1, that single flag would have committed the
stale `narrative.js` over the corrected one, which is the exact accident the top of this document
warns about. After step 1 nothing is stale, but naming the paths costs nothing.

The parked copy was refreshed on 28 August and is still current. An earlier draft of it had a
generate-placeholders-if-empty step the current workflow does not have; moving the old one into place
would have installed the wrong workflow.

## 4. Enable Pages

Repository → Settings → Pages → Source: **GitHub Actions**. Not "Deploy from a branch".

## 5. Decide on visibility

This repository is **private**. That is deliberate, and the decision to change it is yours, because
the repository carries your name and student number.

GitHub Pages on a free account requires a public repository. So the artefact cannot be deployed for
the user study until either this repository is made public, or the built site is hosted somewhere
else. The A2 submission needs a repository link and the study needs a working Pages URL, so this has
to be settled before P6.

Settings → General → Danger Zone → Change repository visibility.

## 6. Check the base path matches the repository name

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

## The test suites will not run unchanged

`study-test.mjs`, `guard-test.mjs`, `resume-test.mjs` and `telemetry-test*.mjs` are the Playwright
scripts that verified the study-harness claims, kept here as evidence rather than as a suite you can
invoke. Three things in them are local to the machine that ran them: an absolute Chromium path
(`/opt/pw-browsers/chromium`), absolute `file://` paths under `/home/claude/`, and a dev server on
`localhost:4181`. Point those at your own paths and port before running them.

## What is deliberately not in this repository

Two things, both for stated reasons rather than oversight:

`package-lock.json`, because hand-transcribing 167 sha512 integrity hashes through an API risks a
single wrong character that fails `npm ci`. Step 2 above.

`.github/workflows/deploy.yml`, because the token cannot write that path. Step 3 above.
