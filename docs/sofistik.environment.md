# sofistik.environment

Resolves which SOFiSTiK release applies to a file, where it is installed, and the matching keyword data.

|             |                                                                               |
| ----------- | ----------------------------------------------------------------------------- |
| Version     | `1.0.0`                                                                       |
| Provided by | `provideSofistikEnvironment()` returning the service wrapper                  |
| Consumed by | `consumeSofistikEnvironment(service)`                                         |
| Owner       | [`sofistik-environment`](https://github.com/lumine-code/sofistik-environment) |

Every SOFiSTiK package asks this service which release a file targets, rather than repeating the detection order or reaching into another package's configuration. The provider also binds the version and language it resolved to the corresponding data from `@lumine-code/sofistik-data`, so autocomplete cannot offer the words of one release while the tooling runs another. There is no separate keyword service.

## Registration

In your `package.json`:

```json
{
  "consumedServices": {
    "sofistik.environment": {
      "versions": { "^1.0.0": "consumeSofistikEnvironment" }
    }
  }
}
```

## Contract

```ts
type SofistikEnvironment = {
  name: "sofistik-environment";
  version: string;
  provider: EnvironmentProvider;
};

type EnvironmentContext = {
  editor?: TextEditor;
  filePath?: string;
  version?: string;
  language?: string;
  edition?: string;
};

type EnvironmentProvider = {
  getRoot(): string;
  getEdition(): string;
  getInstalledVersions(): string[];
  detect(editor?: TextEditor, filePath?: string): Declared;
  getVersion(context?: EnvironmentContext): string;
  getLanguage(context?: EnvironmentContext): string;
  resolve(context?: EnvironmentContext): ResolvedEnvironment;
  getKeywordContext(context?: EnvironmentContext): KeywordContext | null;
  clearCache(): void;
};

type Declared = { version: string | null; language: string | null };

type ResolvedEnvironment = {
  version: string;
  language: string;
  edition: string;
  root: string;
  installPath: string;
  installed: boolean;
};

type KeywordContext = {
  getVersion(): string;
  getLanguage(): "en" | "de";
  getKeywords(): Record<string, unknown>;
  getModuleNames(): string[];
  getModuleKeywords(module: string): object | null;
  getModuleCommands(module: string): string[];
  getCommandKeywords(module: string, command: string): object | null;
  getCommandSchema(module: string, command: string): CommandSchema | null;
  getCommandParams(module: string, command: string): string[];
  getParamEnums(module: string, command: string, parameter: string): string[] | null;
  searchKeyword(keyword: string): object[];
  validateKeyword(word: string): object | null;
  getStatistics(): object;
};

type CommandSchema = {
  slots: Array<{
    position: number;
    name: string | null;
    kind: "keyword" | "literal" | "enum" | "comment" | "placeholder";
    dataTypeCode: string | null;
    enumValues: string[];
    enumRedirect: { command: string; item: string } | null;
  }>;
};
```

Every field of the context is optional:

| Field      | Description                                                                  |
| ---------- | ---------------------------------------------------------------------------- |
| `editor`   | Read what the file's own `@ SOFiSTiK YYYY [EN\|DE]` header declares.         |
| `filePath` | Read the release from a neighbouring `sofistik.def`.                         |
| `version`  | The release the caller has already chosen. Wins over anything the file says. |
| `language` | The language the caller wants. Wins over the header and the setting.         |
| `edition`  | The licensed build the caller wants. Wins over the setting.                  |

What `resolve` returns:

| Field         | Description                                                                           |
| ------------- | ------------------------------------------------------------------------------------- |
| `version`     | The four-digit release year for this call. `""` when nothing determines one.          |
| `language`    | `"en"` or `"de"` — the language keyword names and manuals are wanted in.              |
| `edition`     | `"professional"` or `"educational"`, the licensed build installed.                    |
| `root`        | The configured installation folder holding the version directories. `""` when unset.  |
| `installPath` | `<root>/<version>/SOFiSTiK <version>`. `""` when either `root` or `version` is empty. |
| `installed`   | Whether `installPath` exists on disk.                                                 |

## Minimal example

```js
const { Disposable } = require("lumine");

module.exports = {
  consumeSofistikEnvironment(service) {
    this.environment = service.provider;
    return new Disposable(() => {
      this.environment = null;
    });
  },

  run(editor) {
    const keywords = this.environment.getKeywordContext({ editor });
    if (!keywords) {
      lumine.notifications.addWarning("No keyword data exists for this SOFiSTiK release");
      return;
    }
    const { installPath, installed, version } = this.environment.resolve({ editor });
    if (!installed) {
      lumine.notifications.addError(`SOFiSTiK ${version} is not installed`);
      return;
    }
    return spawnTool(installPath, keywords.getModuleNames());
  },
};
```

## Behavior

The release is resolved from the richest evidence available, in this order:

1. the `version` the caller passed — the point of asking is to override the file
2. the file's own `@ SOFiSTiK YYYY` header
3. a `sofistik.def` beside the file
4. the configured release
5. the newest release actually installed under the root

`"Auto"` is how both the setting and the version picker spell "work it out", so it is not a choice at steps 1 and 4 and falls through to the rest of the chain. When nothing answers, `version` is `""` — honest rather than invented. A consumer launching a program then has nothing to launch, while `getKeywordContext` uses the newest release committed in `@lumine-code/sofistik-data`.

This package consumes no services. Every SOFiSTiK package waits on it, so it must be able to answer the moment it activates — which is why reading a one-line header is done here rather than borrowed.

`getKeywordContext` calls the same resolution path and asks the data provider for that exact release and language. If the resolved version is non-empty but absent from the data, it returns `null`; it never substitutes another release. Only an empty resolved version selects the latest dataset. The returned context's `getVersion()` therefore reports the version of the data actually being read, which may be newer than an unresolved environment but can never disagree with a resolved one.

`language` and `edition` are resolved the same way and for the same reason. The language a file's header declares decides both the keyword names offered and which manual a command opens; the licensed edition decides which CDB interface loads. Both are properties of the installation and the file, not of whichever package happens to be asking, so neither belongs in a consumer's settings.

`resolve` never throws for a missing installation and never invents a path: an unconfigured or absent installation is reported through `root`, `installPath`, and `installed`. That is deliberate — consumers differ in how they react, and each should say so in its own voice. A tool package raises a notification; a viewer package refuses to open the model.

`getInstalledVersions` is cached per root, because a consumer resolving a version on every completion request must not pay a directory scan per keystroke. The `SofistikDataProvider` is also created once and caches parsed command and schema files. `clearCache()` invalidates both cache families without replacing either provider; a change to the installation-path setting calls it automatically.

## Teardown

Dispose the `Disposable` returned from `consumeSofistikEnvironment` when your package deactivates. The provider is a singleton owned by `sofistik-environment` and outlives any one consumer.

## Versioning

`1.0.0` is provided and `^1.0.0` is consumed. Adding fields to `ResolvedEnvironment`, adding optional fields to `EnvironmentContext`, or extending `KeywordContext` is additive. Changing the meaning of `root` or `installPath`, changing the resolution order, silently substituting keyword data for a resolved release, or making `resolve` throw where it previously reported, requires a new service name.
