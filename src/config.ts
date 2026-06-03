/**
 * The VS Code configuration namespace for this extension.
 *
 * Must match the key prefix in package.json contributes.configuration.properties.
 * The build script (scripts/patch-package.js) automatically rewrites those keys
 * whenever this value changes — no manual edits to package.json are needed.
 */
export const CONFIG_NAMESPACE = "luaUnitTestAdapter";

/**
 * All configuration key names (the short part after the namespace prefix).
 *
 * These must match the short key names in package.json. TypeScript files import
 * from here so that raw key strings never appear outside this file. If a key is
 * renamed, update the value here and rename the property in package.json — the
 * build script will keep the namespace prefix in sync automatically.
 */
export const CONFIG_KEYS = {
  luaExe:          "luaExe",
  testGlob:        "testGlob",
  testRegex:       "testRegex",
  suiteRegex:      "suiteRegex",
  testEncoding:    "testEncoding",
  decorationRegex: "decorationRegex",
  debugExtension:  "debugExtension",
  logpanel:        "logpanel",
  logfile:         "logfile",
} as const;
