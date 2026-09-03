# sofistik-environment

Resolve the SOFiSTiK installation and the release each file targets.

> **NOTE**: This package is not an official SOFiSTiK product and is not affiliated with or endorsed by SOFiSTiK AG.

## Features

- **One resolver**: the release is decided in a single place, so autocomplete never offers the words of a release the tooling will not run.
- **Richest evidence first**: an explicit request, then the file's own header, a neighbouring `sofistik.def`, the configured release, and finally the newest release actually installed.
- **Installed releases**: scans the installation folder for the versions really present, so an unmarked file does not resolve to a release you do not have.
- **Whole installation**: answers with the licensed edition and the keyword language too, so no other package keeps a second copy of either setting.
- **Matching keyword data**: returns the commands and schemas for the resolved release and language through the same service, without a separate keyword provider.

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

Consumers call `getKeywordContext({ editor })` on the environment provider to obtain the commands and schemas for that file. It returns `null` when the file targets a release for which the package has no data; when no release can be resolved at all, it deliberately returns the newest committed dataset and its context reports that dataset's real version.

## Services

- [`sofistik.environment`](docs/sofistik.environment.md): provided to resolve the SOFiSTiK release a file belongs to, its installation, licensed edition and language, and the matching keyword data.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
