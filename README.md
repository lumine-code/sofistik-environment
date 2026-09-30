# sofistik-environment

Resolve the SOFiSTiK installation and the release each file targets.

> [!WARNING]
> **This package is deprecated.** Environment discovery is now provided by [sofistik-env](https://github.com/lumine-code/sofistik-env), a lightweight Node library, and keyword consumers use the data wrapper in [sofistik-data](https://github.com/lumine-code/sofistik-data). This repository is archived and no longer maintained.

> **NOTE**: This package is not an official SOFiSTiK product and is not affiliated with or endorsed by SOFiSTiK AG.

## Migration

Uninstall `sofistik-environment`. Current SOFiSTiK packages resolve their environment directly and do not consume its editor service or configuration settings.

One project is one directory. Put the shared declarations in `sofistik.def` at the project root:

```text
SOF_VERSION = 2024
SOF_LANGUAGE = EN
SOF_EDITION = professional
```

The installation root is `C:\Program Files\SOFiSTiK`. Without a declared year, consumers use the newest installed release; language tooling can fall back to the newest dataset in `sofistik-data` when SOFiSTiK is absent. English and Professional are the defaults. Source-file headers no longer select a release or language. A project's root definition applies to every file in that project.

For completion, hover and diagnostics, use [ide-sofistik](https://github.com/lumine-code/ide-sofistik) with [ide-client](https://github.com/lumine-code/ide-client) and the applicable editor frontends.

The former [`sofistik.environment`](docs/sofistik.environment.md) service documentation remains only as a historical reference. New consumers should use `@lumine-code/sofistik-env` for declarations and installation paths, or `sofistik-data.SofistikEnvironmentResolver` when they also need keyword data.
