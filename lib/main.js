const { CompositeDisposable } = require("lumine");
const { SofistikEnvironmentProvider } = require("./environment");

/**
 * SOFiSTiK Environment Package
 *
 * Owns the installation folder and answers which SOFiSTiK release applies to a
 * file. The same service returns keyword data bound to that resolved release
 * and language, so consumers cannot select the two independently.
 *
 * It consumes nothing: a package every other SOFiSTiK package waits on must be
 * able to answer the moment it activates.
 */
module.exports = {
  activate() {
    this.disposables = new CompositeDisposable();
    // The installed releases are cached, so a root pointed somewhere new has to
    // invalidate that scan.
    this.disposables.add(
      lumine.config.onDidChange("sofistik-environment.envPath", () => {
        this.provider?.clearCache();
      }),
    );
  },

  deactivate() {
    this.disposables.dispose();
    this.provider = null;
  },

  /**
   * Provide the SOFiSTiK environment and keyword context service
   * @returns {Object} Service object with provider
   */
  provideSofistikEnvironment() {
    this.provider ||= new SofistikEnvironmentProvider();
    return {
      name: "sofistik-environment",
      version: "1.0.0",
      provider: this.provider,
    };
  },
};
