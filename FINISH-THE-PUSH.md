# Finish the push

This repository currently holds the README, the project configuration, the state machine, the
condition handling and the hooks. The **complete working tree** lives on Ben's disk at:

```
Claude_Cowork/02_outputs/interactive-narrative-viz-uk-wealth-inequality/artefact-repo/
```

That copy builds clean and has been smoke-tested in a headless browser in both A/B conditions, so it
is the authoritative version. Four commands bring it here.

```bash
cd "<path to>/Claude_Cowork/02_outputs/interactive-narrative-viz-uk-wealth-inequality/artefact-repo"
git init && git branch -M main
git remote add origin https://github.com/ben00001982/wealth-inequality-viz.git
git fetch origin && git reset --soft origin/main   # adopt the commits already here
git add -A && git commit -m "Full artefact source, data pipeline and documentation"
git push -u origin main
```

Three things that need doing at the same time, all of them small.

**Move the Pages workflow into place.** `docs/github-pages-workflow.yml` cannot be written under
`.github/workflows` through the API, because the token used to create this repository does not carry
the `workflow` scope. From your own machine there is no such restriction:

```bash
mkdir -p .github/workflows
git mv docs/github-pages-workflow.yml .github/workflows/deploy.yml
git commit -m "Add Pages deploy workflow" && git push
```

Then enable Pages in the repository settings with the source set to GitHub Actions.

**Commit the lock file.** `package-lock.json` is in the disk copy and is not yet here. The workflow
runs `npm ci`, which requires it, so the first deploy will fail without it. `git add -A` above picks
it up.

**Decide whether the repository stays private.** It was created private. The report submission needs
an artefact repository link, and study participants need a working Pages URL, so it has to become
public before either of those. Pages on a private repository requires a paid plan.

## What is missing from the disk copy, and why

One file: `.github/workflows/deploy.yml`. The desktop bridge treats workflow files as protected and
refuses to write them, which is the correct behaviour for a remote tool. It is held here as
`docs/github-pages-workflow.yml` instead, with a header explaining the move.

`public/data/*.json` and `data/raw/` are gitignored by design. Run `npm run data` after cloning to
generate placeholder data, or run the real pipeline as set out in `docs/DATA-PIPELINE.md`.
