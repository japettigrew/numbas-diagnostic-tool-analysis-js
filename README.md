# NWG Diagnostic Tool Analysis JS

This is the JavaScript version of the diagnostic analysis app.

It does not call a local R executable, Rscript, R.exe, or external diagnostic-tool R source file. Source paths are staged in the Setup and Data Staging tab. A small local PHP bridge reads those source files from disk, then the diagnostic calculations run in JavaScript in the browser.

## Run Locally

From `~/codex-test`, run:

```bash
php -S 127.0.0.1:8002 -t NumeracyWorkingGroup/DiagnosticToolProject/Analysis/DiagnosticToolWebsiteJS
```

Then open:

```text
http://127.0.0.1:8002/
```

## Source Files

Use the Setup and Data Staging tab to select:

- Attempt data JSON file or files, one full path per line
- Numbas diagnostic `.exam` file, full path including filename
- Optional GEXF knowledge map, full path including filename

The local PHP bridge lets the app read typed paths such as `C:\...`, `\\wsl$...`, and `/home/...` when the files are readable from the machine running the local server. If the app is opened from a static server instead, local filesystem paths will not import.

## Setup Files

`Save Setup` stores the current setup metadata in this browser.

`Download Setup` creates `diagnostic_tool_setup.json`. It stores the staged source paths and analysis parameters. Uploading this setup restores those paths and parameters so Import Sources can load the data from the staged locations.

## Current Analysis Coverage

The JavaScript app currently runs these stages in the browser:

- Knowledge map and KM dictionary construction
- Attempt Dataset construction
- Implied scoring
- Curriculum-group summaries
- KM validation and Attempt Tracker data
- Browser-native dichotomous 1PL marginal maximum likelihood Rasch analysis for raw and implied score matrices

The Rasch implementation targets the `TAM::tam.mml(resp = response)` dichotomous 1PL use case used by the original app. It generates browser-side CSV/text outputs and interactive Wright-map previews. Further validation against TAM fixtures should continue before treating it as a full replacement for all TAM package behaviour.
