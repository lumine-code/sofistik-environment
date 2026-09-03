const fs = require("node:fs");
const path = require("node:path");
const { SofistikDataProvider } = require("@lumine-code/sofistik-data");

// A SOFiSTiK installation is laid out as `<root>/<year>/SOFiSTiK <year>`.
const VERSION_DIRECTORY = /^\d{4}$/;

// `@ SOFiSTiK 2026`, optionally a service pack (`2024-05`) and a language.
const SHEBANG = /^@\s*SOFiSTiK\s+(\d{4})(?:-\d{1,2})?(?:\s+(EN|DE))?/i;

// The setting spells these out; the header and the keyword data use codes.
const LANGUAGES = { english: "en", german: "de", en: "en", de: "de" };

// `SOF_VERSION = 2026` in a project's `sofistik.def`.
const SOF_VERSION = /^\s*SOF_VERSION\s*=\s*(\d{4})/m;

/**
 * Resolves which SOFiSTiK release applies to a file, and where that release is
 * installed.
 *
 * This is the one place the question is answered, so autocomplete cannot offer
 * the words of one release while the tooling runs another. Everything it needs
 * it reads itself — a version header is one line and one regex, which is not
 * worth a service dependency that would leave this package unable to answer
 * until some other package had loaded.
 */
class SofistikEnvironmentProvider {
  constructor(options = {}) {
    this.config = options.config || (() => lumine.config);
    this.exists = options.exists || ((candidate) => fs.existsSync(candidate));
    this.createDataProvider = options.createDataProvider || (() => new SofistikDataProvider());
    this._dataProvider = options.dataProvider || null;
    this.readFile =
      options.readFile ||
      ((file) => {
        try {
          return fs.readFileSync(file, "utf8");
        } catch {
          return null;
        }
      });
    this.readdir =
      options.readdir ||
      ((directory) => {
        try {
          return fs.readdirSync(directory);
        } catch {
          // An unconfigured, renamed or unmounted root is not an error here —
          // it simply means there is nothing installed to find.
          return [];
        }
      });
    this._installed = null;
    this._installedRoot = null;
  }

  /**
   * The configured SOFiSTiK installation folder, the one holding the version
   * directories. Empty when it has not been configured.
   * @returns {string}
   */
  getRoot() {
    const root = this.config().get("sofistik-environment.envPath");
    return typeof root === "string" ? root.trim() : "";
  }

  /**
   * The licensed build installed under that folder.
   *
   * A property of the installation, not of whoever is reading it: the
   * educational build ships the CDB interface under a marked file name, so
   * anything loading that interface needs the same answer. The words are
   * `@lumine-code/sofistik-reader`'s, which refuses an unknown one once rather
   * than every caller repeating the list.
   * @returns {string}
   */
  getEdition() {
    const edition = this.config().get("sofistik-environment.edition");
    return typeof edition === "string" && edition.trim() ? edition.trim() : "professional";
  }

  /**
   * The releases actually present under the installation folder, newest first.
   *
   * Cached per root: a consumer resolves a version on every completion request,
   * and a directory scan per keystroke is not acceptable there.
   * @returns {string[]}
   */
  getInstalledVersions() {
    const root = this.getRoot();
    if (!root) return [];
    if (this._installedRoot === root && this._installed) return this._installed;

    const versions = this.readdir(root)
      .filter((entry) => VERSION_DIRECTORY.test(entry))
      .filter((entry) => this.exists(path.join(root, entry, `SOFiSTiK ${entry}`)))
      .sort()
      .reverse();

    this._installedRoot = root;
    this._installed = versions;
    return versions;
  }

  /**
   * Forget the cached installation scan and parsed keyword data. Call when
   * either source may have changed; a change to the root setting is watched.
   */
  clearCache() {
    this._installed = null;
    this._installedRoot = null;
    this._dataProvider?.clearCache?.();
  }

  /**
   * Return the keyword data for the release and language this context resolves
   * to. An unresolved release selects the newest committed dataset; a resolved
   * release for which no data exists is reported as null rather than silently
   * substituted with a different release.
   * @param {{editor?: object, filePath?: string, version?: string, language?: string, edition?: string}} context
   * @returns {object|null}
   */
  getKeywordContext(context = {}) {
    const { version, language } = this.resolve(context);
    return this.getDataProvider().forRelease(version || undefined, language);
  }

  /**
   * The data provider is lazy because installation-only consumers never need
   * to read keyword metadata. Keep one instance so its parsed datasets remain
   * cached across completion and lint requests.
   * @returns {SofistikDataProvider}
   */
  getDataProvider() {
    this._dataProvider ||= this.createDataProvider();
    return this._dataProvider;
  }

  /**
   * Normalize a release a caller or the setting named. "Auto" is how the
   * setting and the version picker both spell "work it out", so it is not a
   * choice and must not short-circuit the rest of the chain.
   * @param {string|number} version
   * @returns {string|null}
   */
  normalizeVersion(version) {
    if (version === null || version === undefined) return null;
    const value = String(version).trim();
    if (!value || value.toLowerCase() === "auto") return null;
    return value;
  }

  /**
   * What a file declares for itself, from its own header or from a
   * `sofistik.def` beside it. Either field is null when nothing says.
   * @param {object} editor - Optional editor to read the header from
   * @param {string} filePath - Optional path to look for `sofistik.def` beside
   * @returns {{version: string|null, language: string|null}}
   */
  detect(editor, filePath) {
    const targetPath = filePath || (editor ? editor.getPath() : null);

    // Only when the editor is showing the file being asked about: a tree-view
    // command passes a path while some unrelated file holds focus.
    const editorPath = editor ? editor.getPath() : null;
    const sameFile =
      !targetPath ||
      !editorPath ||
      path.normalize(editorPath).toLowerCase() === path.normalize(targetPath).toLowerCase();
    if (editor && sameFile) {
      try {
        const header = SHEBANG.exec(editor.lineTextForBufferRow(0));
        // A header naming a release is the end of it — a `sofistik.def` cannot
        // contradict the file itself. The language is only ever declared here.
        if (header) return { version: header[1], language: this.normalizeLanguage(header[2]) };
      } catch {
        // A destroyed or empty buffer simply declares nothing.
      }
    }

    if (targetPath) {
      const definition = this.readFile(path.join(path.dirname(targetPath), "sofistik.def"));
      const declared = definition && SOF_VERSION.exec(definition);
      if (declared) return { version: declared[1], language: null };
    }

    return { version: null, language: null };
  }

  /**
   * Normalize a language to the code the keyword data is filed under.
   * @param {string} language - "English"/"German" from the setting, or EN/DE
   * @returns {string|null}
   */
  normalizeLanguage(language) {
    if (!language) return null;
    return LANGUAGES[String(language).trim().toLowerCase()] || null;
  }

  /**
   * The language that applies: what the caller asked for, what the file's
   * header declares, then the setting. Defaults to English.
   * @param {{editor?: object, filePath?: string, language?: string}} context
   * @returns {string}
   */
  getLanguage(context = {}) {
    const { editor = null, filePath = null, language = null } = context;

    return (
      this.normalizeLanguage(language) ||
      this.detect(editor, filePath).language ||
      this.normalizeLanguage(this.config().get("sofistik-environment.language")) ||
      "en"
    );
  }

  /**
   * The release that applies, richest evidence first.
   *
   * 1. what the caller asked for — the point of asking is to override the file
   * 2. the file's own `@ SOFiSTiK YYYY` header
   * 3. a `sofistik.def` beside the file
   * 4. the configured release
   * 5. the newest release actually installed
   *
   * Empty when none of those answer, which is honest rather than invented: a
   * consumer reading keywords falls back to the newest it ships, and a consumer
   * launching a program has nothing to launch.
   * @param {{editor?: object, filePath?: string, version?: string}} context
   * @returns {string}
   */
  getVersion(context = {}) {
    const { editor = null, filePath = null, version = null } = context;

    return (
      this.normalizeVersion(version) ||
      this.detect(editor, filePath).version ||
      this.normalizeVersion(this.config().get("sofistik-environment.version")) ||
      this.getInstalledVersions()[0] ||
      ""
    );
  }

  /**
   * Resolve the installation for a file or editor.
   * @param {{editor?: object, filePath?: string, version?: string, language?: string, edition?: string}} context
   * @returns {{version: string, language: string, edition: string, root: string, installPath: string, installed: boolean}}
   */
  resolve(context = {}) {
    const version = this.getVersion(context);
    const language = this.getLanguage(context);
    const edition = context.edition || this.getEdition();
    const root = this.getRoot();
    if (!root || !version) {
      return { version, language, edition, root, installPath: "", installed: false };
    }
    const installPath = path.join(root, version, `SOFiSTiK ${version}`);
    return { version, language, edition, root, installPath, installed: this.exists(installPath) };
  }
}

module.exports = {
  SofistikEnvironmentProvider,
  VERSION_DIRECTORY,
  SHEBANG,
  SOF_VERSION,
  LANGUAGES,
};
