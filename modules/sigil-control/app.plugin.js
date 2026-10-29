// Config plugin of the sigil-control module, run by `expo prebuild`.
//
// The module owns its Android strings: values/strings.xml in English and one
// translation per app language (values-pt-rBR, values-es, values-fr,
// values-de, values-it, values-ja, values-zh-rCN). Gradle merges them from the
// library on its own; this plugin also writes them into the generated app as
// sigil_control_strings.xml, so they are part of the native project that
// prebuild produces, travel with it, and stay complete for lint. The copies
// are identical, and app resources win over library ones.
//
// It also marks app_name as not translatable: Sigil is the brand in every
// language.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withStringsXml } = require('expo/config-plugins');

const MODULE_RES = path.join(__dirname, 'android', 'src', 'main', 'res');
const COPY_NAME = 'sigil_control_strings.xml';

/** values and values-<qualifier> folders of the module that hold strings. */
function stringFolders() {
  return fs
    .readdirSync(MODULE_RES)
    .filter((name) => /^values(?:-[A-Za-z0-9+-]+)?$/.test(name))
    .filter((name) => fs.existsSync(path.join(MODULE_RES, name, 'strings.xml')))
    .sort();
}

function withControlStrings(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const appRes = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      for (const folder of stringFolders()) {
        const target = path.join(appRes, folder);
        fs.mkdirSync(target, { recursive: true });
        fs.copyFileSync(path.join(MODULE_RES, folder, 'strings.xml'), path.join(target, COPY_NAME));
      }
      return config;
    },
  ]);
}

function withBrandName(config) {
  return withStringsXml(config, (config) => {
    for (const item of config.modResults.resources.string ?? []) {
      if (item.$ && item.$.name === 'app_name') {
        item.$.translatable = 'false';
      }
    }
    return config;
  });
}

module.exports = function withSigilControl(config) {
  return withBrandName(withControlStrings(config));
};
