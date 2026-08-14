const { CompositeDisposable } = require("lumine");
const { SofistikEnvironmentProvider } = require("./environment");

/**
 * SOFiSTiK Environment Package
 *
 * Owns the installation folder and answers, once, which SOFiSTiK release
 * applies to a file. Every other SOFiSTiK package resolves through the service
 * rather than reading this package's settings or repeating the detection order.
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
   * Provide the SOFiSTiK installation service for other packages
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
