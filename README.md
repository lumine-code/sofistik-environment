# sofistik-environment

Resolve the SOFiSTiK installation and the release each file targets.

> **NOTE**: This package is not an official SOFiSTiK product and is not affiliated with or endorsed by SOFiSTiK AG.

## Features

- **One resolver**: the release is decided in a single place, so autocomplete never offers the words of a release the tooling will not run.
- **Richest evidence first**: an explicit request, then the file's own header, a neighbouring `sofistik.def`, the configured release, and finally the newest release actually installed.
- **Installed releases**: scans the installation folder for the versions really present, so an unmarked file does not resolve to a release you do not have.
- **Whole installation**: answers with the licensed edition and the keyword language too, so no other package keeps a second copy of either setting.

## Installation

To install `sofistik-environment` search for it in the Install pane of the Lumine settings, or run the command `lumine --install lumine-code/sofistik-environment`.

## Usage

Point the installation path setting at the folder holding the version directories — the one whose children are `2024`, `2025`, `2026` and so on, each containing a `SOFiSTiK <year>` folder.

Leave the version setting on `Auto` unless you want to pin every unmarked file to one release. A file overrides it either way, with a header on its first line:

```
@ SOFiSTiK 2024
```

or with a `sofistik.def` beside it:

```
SOF_VERSION = 2024
```

## Services

- [`sofistik.environment`](docs/sofistik.environment.md): provided to resolve the SOFiSTiK release a file belongs to, the folder that release is installed in, and the licensed edition and language it is read with.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
