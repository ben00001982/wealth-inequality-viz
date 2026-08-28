# Deployment

How the artefact reaches a participant, and how it runs when the network does not. Written for the
person sending out study links and for the person about to demonstrate this in a viva.

## The base path problem

This is the one thing that will waste an afternoon if it is not understood first.

A GitHub Pages project page is served from `https://<user>.github.io/<repo>/`, so Vite must be built
with `base: '/wealth-inequality-viz/'` or every asset request resolves to the wrong path and returns
the site's own `index.html`. The browser then rejects that with a MIME-type error on the module
script and the page is blank with no obvious cause.

A build served from the root of a local static server needs `base: './'` instead. So a Pages build
served at `localhost` root fails in exactly the same way, in reverse. The two builds are not
interchangeable, and the local fallback for the viva is the second kind.

`vite.config.js` reads `VITE_BASE` and `VITE_OUT_DIR`, and `package.json` wires both cases up:

```bash
npm run build            # base /wealth-inequality-viz/  -> dist/        for GitHub Pages
npm run build:local      # base ./                       -> dist-local/  for an offline demo
npm run preview:local    # serves dist-local/
```

Keep them in separate output directories. Overwriting `dist` with a relative-base build and then
deploying it is the failure this separation prevents.

**Verify the fallback with the network interface disabled, not merely unplugged.** A build that
quietly reaches the network for a font or a script is not a fallback, and the only way to find out is
to take the interface down. Everything in this build is bundled, and that is worth confirming rather
than assuming.

## The GitHub Actions workflow

`.github/workflows/deploy.yml` installs dependencies, generates placeholder data if `public/data` is
empty, runs the validator, builds with the Pages base, and deploys. It triggers on a push to `main`
and can be run by hand.

It does not run the Python cleaning scripts, because the raw Office for National Statistics downloads
are not committed. There is nothing in CI for them to read. So the data the deployed site serves is
either what was committed to `public/data`, or synthetic placeholders generated in the workflow.

That second case is safe rather than sloppy: the placeholders carry `__meta.synthetic: true` and the
artefact shows its provenance banner, so a deploy can never silently ship fake data as though it were
findings. But it does mean that publishing real data is a deliberate act of committing the pipeline
output, and the pre-launch checklist below is where that gets confirmed.

The first deploy needs Pages enabled in the repository settings with the source set to GitHub Actions.

## URL parameters

Exactly two, and only the first is defined by the frozen design spec.

`condition=static|interactive` selects the A/B arm. It is read once at mount, logged as the first
telemetry event, and then removed from the visible address bar with `history.replaceState`, so it is
not advertised to the participant. An absent or invalid value falls back to `interactive`.

`study=1` reveals the study harness bar with the event count, the reduced-motion state and the
telemetry export button. Without it a member of the public who finds the artefact sees the artefact
and not the apparatus. It does not affect which condition anyone is in.

```
https://<user>.github.io/wealth-inequality-viz/?condition=interactive&study=1
https://<user>.github.io/wealth-inequality-viz/?condition=static&study=1
```

The honest limitation, which the study protocol handles rather than hides: a URL parameter cannot be
concealed. See `docs/STUDY-HARNESS.md`.

## Before a participant is sent a link

- The provenance banner is **absent**. If it is visible, the site is serving placeholder data and the
  study cannot run.
- `python scripts/validate.py` exits zero against the deployed data files.
- Both condition URLs load and render every step, checked in a browser rather than assumed.
- The telemetry export produces a file, and the file opens and contains a `session_start` event whose
  `condition` matches the URL used.
- The consent, information and debrief documents match the build: any figure quoted in the debrief is
  the figure the artefact actually shows.
- Ethics approval is in place. This is the hard gate, not a formality.

## Pre-viva demo checklist

- Build and serve `dist-local`, and confirm it works with the network interface disabled.
- Have both condition URLs open in separate tabs beforehand, so the condition switch is a tab change
  rather than a retyped URL on a shared screen.
- Seed the explorer state by walking the artefact once in the browser profile you will demonstrate
  from. Explorer seed state is `localStorage` only, so it survives a reload but does not survive a
  different profile or a private window. There is no deep-link parameter for this, and the viva pack
  lists adding one as an optional item rather than describing it as existing.
- Notifications off, screen share at a resolution where the axis labels are legible, browser zoom at
  100%.
- Backup screen recording of the core demo, four to five minutes, made from the same tagged commit as
  the build being shown.
