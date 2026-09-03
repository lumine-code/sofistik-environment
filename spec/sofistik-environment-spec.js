const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SofistikEnvironmentProvider } = require("../lib/environment");

describe("sofistik-environment", () => {
  let tempDirs;

  function makeTempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-environment-spec-"));
    tempDirs.push(dir);
    return dir;
  }

  // An installation is `<root>/<year>/SOFiSTiK <year>`; nothing else counts.
  function install(root, ...versions) {
    for (const version of versions) {
      fs.mkdirSync(path.join(root, version, `SOFiSTiK ${version}`), { recursive: true });
    }
    return root;
  }

  function editorShowing(filePath, firstLine) {
    return { getPath: () => filePath, lineTextForBufferRow: () => firstLine };
  }

  function providerFor(settings = {}, options = {}) {
    return new SofistikEnvironmentProvider({
      ...options,
      config: () => ({ get: (key) => settings[key] }),
    });
  }

  beforeEach(() => {
    tempDirs = [];
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      // Retries because Windows keeps a directory non-empty until the last
      // handle on a child closes, and `force` swallows only ENOENT.
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

  describe("the installation folder", () => {
    it("trims the setting and reports an unconfigured folder as empty", () => {
      expect(providerFor({ "sofistik-environment.envPath": "  C:\\SOF  " }).getRoot()).toBe(
        "C:\\SOF",
      );
      expect(providerFor({ "sofistik-environment.envPath": "   " }).getRoot()).toBe("");
      expect(providerFor({}).getRoot()).toBe("");
    });

    it("lists only the releases actually installed, newest first", () => {
      const root = install(makeTempDir(), "2022", "2024", "2026");
      // A year directory without the inner `SOFiSTiK <year>` folder is not an
      // installation, and neither is an unrelated directory.
      fs.mkdirSync(path.join(root, "2025"), { recursive: true });
      fs.mkdirSync(path.join(root, "interfaces"), { recursive: true });

      const provider = providerFor({ "sofistik-environment.envPath": root });
      expect(provider.getInstalledVersions()).toEqual(["2026", "2024", "2022"]);
    });

    it("reports nothing installed for a root that does not exist", () => {
      const provider = providerFor({
        "sofistik-environment.envPath": path.join(os.tmpdir(), "no-such-sofistik-root"),
      });
      expect(provider.getInstalledVersions()).toEqual([]);
    });

    it("scans once per root, since a consumer resolves on every keystroke", () => {
      const root = install(makeTempDir(), "2026");
      let scans = 0;
      const provider = new SofistikEnvironmentProvider({
        config: () => ({ get: () => root }),
        readdir: (directory) => {
          scans++;
          return fs.readdirSync(directory);
        },
      });

      provider.getInstalledVersions();
      provider.getInstalledVersions();
      provider.getInstalledVersions();
      expect(scans).toBe(1);

      provider.clearCache();
      provider.getInstalledVersions();
      expect(scans).toBe(2);
    });
  });

  describe("detecting what a file declares", () => {
    it("reads the release from the file's own header", () => {
      const filePath = path.join(makeTempDir(), "model.dat");
      const provider = providerFor({});
      expect(provider.detect(editorShowing(filePath, "@ SOFiSTiK 2024"), filePath).version).toBe(
        "2024",
      );
      // A service pack suffix names the same release.
      expect(provider.detect(editorShowing(filePath, "@ SOFiSTiK 2024-05"), filePath).version).toBe(
        "2024",
      );
    });

    it("reads the language from the header, which is the only place it is declared", () => {
      const filePath = path.join(makeTempDir(), "model.dat");
      const provider = providerFor({});
      expect(provider.detect(editorShowing(filePath, "@ SOFiSTiK 2024 DE"), filePath)).toEqual({
        version: "2024",
        language: "de",
      });
      expect(
        provider.detect(editorShowing(filePath, "@ SOFiSTiK 2024"), filePath).language,
      ).toBeNull();
    });

    it("reads a sofistik.def beside the file when the header says nothing", () => {
      const dir = makeTempDir();
      fs.writeFileSync(path.join(dir, "sofistik.def"), "SOF_VERSION = 2022\n");
      const filePath = path.join(dir, "model.dat");

      const provider = providerFor({});
      expect(provider.detect(null, filePath).version).toBe("2022");
      // The header wins when there is one.
      expect(provider.detect(editorShowing(filePath, "@ SOFiSTiK 2026"), filePath).version).toBe(
        "2026",
      );
    });

    it("ignores the header of an editor showing some other file", () => {
      const dir = makeTempDir();
      fs.writeFileSync(path.join(dir, "sofistik.def"), "SOF_VERSION = 2022\n");
      // A tree-view command passes a path while an unrelated file holds focus.
      const focused = editorShowing(path.join(dir, "other.dat"), "@ SOFiSTiK 2026");
      expect(providerFor({}).detect(focused, path.join(dir, "model.dat")).version).toBe("2022");
    });

    it("declares nothing for a file that says nothing", () => {
      const filePath = path.join(makeTempDir(), "model.dat");
      const nothing = { version: null, language: null };
      expect(providerFor({}).detect(editorShowing(filePath, "$ a comment"), filePath)).toEqual(
        nothing,
      );
      expect(providerFor({}).detect(null, null)).toEqual(nothing);
    });
  });

  describe("resolving a language", () => {
    it("takes the header over the setting, and defaults to English", () => {
      const filePath = path.join(makeTempDir(), "model.dat");
      const german = providerFor({ "sofistik-environment.language": "German" });

      expect(providerFor({}).getLanguage()).toBe("en");
      expect(german.getLanguage()).toBe("de");
      // A file that declares its language beats the setting.
      expect(
        german.getLanguage({ editor: editorShowing(filePath, "@ SOFiSTiK 2024 EN"), filePath }),
      ).toBe("en");
      // And a caller that names one beats the file.
      expect(german.getLanguage({ language: "English" })).toBe("en");
    });
  });

  describe("the licensed edition", () => {
    it("reads the setting and defaults to professional", () => {
      const educational = providerFor({ "sofistik-environment.edition": "educational" });
      expect(providerFor({}).getEdition()).toBe("professional");
      expect(educational.getEdition()).toBe("educational");
      // A property of the installation, so it travels with the resolution.
      expect(educational.resolve().edition).toBe("educational");
      expect(providerFor({}).resolve({ edition: "educational" }).edition).toBe("educational");
    });
  });

  describe("resolving a release", () => {
    it("takes what the caller asked for over everything the file says", () => {
      const dir = makeTempDir();
      const filePath = path.join(dir, "model.dat");
      const editor = editorShowing(filePath, "@ SOFiSTiK 2026");
      const provider = providerFor({});

      expect(provider.getVersion({ editor, filePath })).toBe("2026");
      expect(provider.getVersion({ editor, filePath, version: "2020" })).toBe("2020");
    });

    it("falls back to the setting, then to the newest installed", () => {
      const root = install(makeTempDir(), "2022", "2024");
      const configured = providerFor({
        "sofistik-environment.envPath": root,
        "sofistik-environment.version": "2018",
      });
      expect(configured.getVersion()).toBe("2018");

      const auto = providerFor({
        "sofistik-environment.envPath": root,
        "sofistik-environment.version": "Auto",
      });
      // The point of the installed scan: an unmarked file resolves to a release
      // that is actually here, not to the newest that ever existed.
      expect(auto.getVersion()).toBe("2024");
    });

    it("treats Auto as no choice at all, since that is what the picker writes", () => {
      const root = install(makeTempDir(), "2024");
      const provider = providerFor({
        "sofistik-environment.envPath": root,
        "sofistik-environment.version": "Auto",
      });
      expect(provider.getVersion({ version: "Auto" })).toBe("2024");
      expect(provider.getVersion({ version: "" })).toBe("2024");
      expect(provider.getVersion({ version: null })).toBe("2024");
    });

    it("says it does not know rather than inventing a release", () => {
      expect(providerFor({}).getVersion()).toBe("");
    });
  });

  describe("resolving an installation", () => {
    it("builds the install path and reports whether it is there", () => {
      const root = install(makeTempDir(), "2026");
      const provider = providerFor({ "sofistik-environment.envPath": root });

      expect(provider.resolve()).toEqual({
        version: "2026",
        language: "en",
        edition: "professional",
        root,
        installPath: path.join(root, "2026", "SOFiSTiK 2026"),
        installed: true,
      });

      const missing = provider.resolve({ version: "2018" });
      expect(missing.installPath).toBe(path.join(root, "2018", "SOFiSTiK 2018"));
      // Reported, not thrown: each consumer reacts in its own voice.
      expect(missing.installed).toBe(false);
    });

    it("never invents a path from an unconfigured folder", () => {
      const resolved = providerFor({ "sofistik-environment.envPath": "   " }).resolve({
        version: "2026",
      });
      expect(resolved).toEqual({
        version: "2026",
        language: "en",
        edition: "professional",
        root: "",
        installPath: "",
        installed: false,
      });
    });

    it("never invents a path when it does not know the release", () => {
      const root = makeTempDir();
      const resolved = providerFor({ "sofistik-environment.envPath": root }).resolve();
      expect(resolved).toEqual({
        version: "",
        language: "en",
        edition: "professional",
        root,
        installPath: "",
        installed: false,
      });
    });
  });

  describe("resolving keyword data", () => {
    it("uses the release and German language declared by the file header", () => {
      const filePath = path.join(makeTempDir(), "model.dat");
      const editor = editorShowing(filePath, "@ SOFiSTiK 2024 DE");
      const keywords = providerFor({}).getKeywordContext({ editor, filePath });

      expect(keywords.getVersion()).toBe("2024");
      expect(keywords.getLanguage()).toBe("de");
      expect(keywords.getModuleNames()).toContain("AQUA");
    });

    it("uses a neighbouring definition with the configured language", () => {
      const dir = makeTempDir();
      fs.writeFileSync(path.join(dir, "sofistik.def"), "SOF_VERSION = 2022\n");
      const keywords = providerFor({
        "sofistik-environment.language": "German",
      }).getKeywordContext({ filePath: path.join(dir, "model.dat") });

      expect(keywords.getVersion()).toBe("2022");
      expect(keywords.getLanguage()).toBe("de");
    });

    it("uses the configured release and English language", () => {
      const keywords = providerFor({
        "sofistik-environment.version": "2020",
        "sofistik-environment.language": "English",
      }).getKeywordContext();

      expect(keywords.getVersion()).toBe("2020");
      expect(keywords.getLanguage()).toBe("en");
    });

    it("uses the newest installed release when the setting is Auto", () => {
      const root = install(makeTempDir(), "2023", "2025");
      const keywords = providerFor({
        "sofistik-environment.envPath": root,
        "sofistik-environment.version": "Auto",
      }).getKeywordContext();

      expect(keywords.getVersion()).toBe("2025");
      expect(keywords.getLanguage()).toBe("en");
    });

    it("uses the latest dataset when no environment release can be resolved", () => {
      const keywords = providerFor({}).getKeywordContext();

      expect(keywords.getVersion()).toBe("2026");
      expect(keywords.getLanguage()).toBe("en");
    });

    it("returns null for an unsupported explicit or resolved release", () => {
      const filePath = path.join(makeTempDir(), "model.dat");
      const editor = editorShowing(filePath, "@ SOFiSTiK 2099 EN");
      const provider = providerFor({});

      expect(provider.getKeywordContext({ version: "2099" })).toBeNull();
      expect(provider.getKeywordContext({ editor, filePath })).toBeNull();
    });

    it("resolves the public executable module aliases", () => {
      const keywords = providerFor({
        "sofistik-environment.version": "2026",
      }).getKeywordContext();

      for (const [publicName, sourceName, commandName] of [
        ["DBMERG", "DBME", "CDB"],
        ["STAR2", "STAR", "DESI"],
        ["TUNARS", "TUNA", "GEO"],
      ]) {
        expect(keywords.getModuleNames()).toContain(publicName);
        expect(keywords.getModuleCommands(publicName)).toEqual(
          keywords.getModuleCommands(sourceName),
        );
        expect(keywords.getModuleCommands(publicName.toLowerCase())).toContain(commandName);
      }
    });

    it("creates one data provider and clears both provider caches", () => {
      const root = install(makeTempDir(), "2026");
      let creations = 0;
      let scans = 0;
      let dataClears = 0;
      const keywordContext = {
        getVersion: () => "2026",
        getLanguage: () => "en",
      };
      const dataProvider = {
        forRelease: () => keywordContext,
        clearCache: () => dataClears++,
      };
      const provider = providerFor(
        { "sofistik-environment.envPath": root },
        {
          createDataProvider() {
            creations++;
            return dataProvider;
          },
          readdir(directory) {
            scans++;
            return fs.readdirSync(directory);
          },
        },
      );

      expect(provider.getKeywordContext()).toBe(keywordContext);
      expect(provider.getKeywordContext()).toBe(keywordContext);
      expect(creations).toBe(1);
      provider.getInstalledVersions();
      provider.getInstalledVersions();
      expect(scans).toBe(1);

      provider.clearCache();
      expect(dataClears).toBe(1);
      provider.getInstalledVersions();
      provider.getKeywordContext();
      expect(scans).toBe(2);
      expect(creations).toBe(1);
    });
  });

  describe("the service", () => {
    let mainModule;

    beforeEach(async () => {
      const pack = await lumine.packages.activatePackage("sofistik-environment");
      mainModule = pack.mainModule;
    });

    afterEach(() => {
      lumine.config.unset("sofistik-environment.envPath");
    });

    it("provides one sofistik.environment service", () => {
      const service = mainModule.provideSofistikEnvironment();
      expect(service.name).toBe("sofistik-environment");
      expect(service.version).toBe("1.0.0");
      expect(typeof service.provider.resolve).toBe("function");
      expect(typeof service.provider.getKeywordContext).toBe("function");
      expect(mainModule.provideSofistikEnvironment().provider).toBe(service.provider);
    });

    it("consumes nothing, so it can answer the moment it activates", () => {
      const manifest = require("../package.json");
      expect(manifest.consumedServices).toBeUndefined();
      expect(Object.keys(manifest.providedServices)).toEqual(["sofistik.environment"]);
    });

    it("rescans when the installation folder setting changes", () => {
      const first = install(makeTempDir(), "2022");
      const second = install(makeTempDir(), "2026");
      const { provider } = mainModule.provideSofistikEnvironment();

      lumine.config.set("sofistik-environment.envPath", first);
      expect(provider.getInstalledVersions()).toEqual(["2022"]);

      lumine.config.set("sofistik-environment.envPath", second);
      expect(provider.getInstalledVersions()).toEqual(["2026"]);
    });
  });
});
