# Numbas Diagnostic Tool Analysis JS

This is a browser-based JavaScript app for analysing Numbas diagnostic test data.

It does not require R, Rscript, R.exe, or a separate diagnostic-tool R source file. The knowledge map, datasets, implied scoring, curriculum-group summaries, KM validation, attempt tracker, and browser-native Rasch outputs are generated in JavaScript.

## What You Need

- A modern browser such as Chrome, Edge, Firefox, or Safari.
- PHP, if you want to run the app locally and allow typed local file paths such as `C:\...`, `\\wsl$...`, or `/home/...`.

PHP is used only as a tiny local file bridge and web server. It does not run the analysis calculations.

## Quick Start on Windows

1. Install PHP for Windows if it is not already installed.
2. Download or clone this repository.
3. Open the app folder.
4. Double-click `start_app.bat`.
5. Keep the terminal window open while using the app.

The app opens at:

```text
http://127.0.0.1:8010/
```

If port `8010` is already in use, edit `start_app.bat` and change the `PORT` value.

## Quick Start on macOS or Linux

Install PHP using your usual package manager, then run this from the app folder:

```bash
sh start_app.sh
```

The app opens at:

```text
http://127.0.0.1:8010/
```

If port `8010` is already in use:

```bash
PORT=8011 sh start_app.sh
```

## Manual Local Server Method

From the app folder, run:

```bash
php -S 127.0.0.1:8010 -t .
```

Then open:

```text
http://127.0.0.1:8010/
```

Keep the terminal window open. Stop the server with `Ctrl+C`.

## Using Source Files

In the Setup and Data Staging tab, provide:

- Attempt data JSON file or files.
- A Numbas diagnostic `.exam` file.
- Optionally, a GEXF knowledge map.

When running locally with PHP, you can type full paths such as:

```text
C:\Data\attempts.json
\\wsl$\Ubuntu\home\user\data\exam.exam
/home/user/data/map.gexf
```

You can also use the `Choose file(s)` buttons. Browser-chosen files work for the current session, but browsers do not expose reusable full local paths for later sessions.

## Hosted Site Use

If the app is served from a hosted website, the browser cannot read a user's local files from typed local paths. This is a browser security restriction.

For hosted use, either:

- Use the `Choose file(s)` buttons each session.
- Put the source files somewhere web-accessible and enter `https://...` URLs or relative URLs.
- Run the app locally with PHP if you want setup files containing local paths to be reusable.

## Setup Files

`Save Setup` stores setup metadata in the current browser.

`Download Setup` creates `diagnostic_tool_setup.json`. It stores source paths or URLs and analysis parameters. It does not store the full contents of large attempt JSON files.

Uploading a setup file restores the paths/URLs and parameters. Import succeeds only if those paths/URLs are readable in the current environment.

## Analysis Coverage

The JavaScript app currently supports:

- Knowledge map and KM dictionary construction.
- Attempt Dataset construction.
- Implied scoring.
- Curriculum-group summaries.
- KM validation.
- Attempt Tracker visualisation.
- Browser-native dichotomous 1PL marginal maximum likelihood Rasch analysis for raw and implied score matrices.

The Rasch implementation targets the `TAM::tam.mml(resp = response)` dichotomous 1PL use case used by the original R app. It is not a full port of all TAM behaviour. In particular, boundary/perfect-score items may differ from TAM's finite estimates, so Rasch outputs should continue to be validated against the R/TAM version before high-stakes use.
