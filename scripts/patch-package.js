#!/usr/bin/env node
// Reads CONFIG_NAMESPACE from src/config.ts and rewrites the key prefix on every
// entry in package.json contributes.configuration.properties to match.
// Run automatically before tsc via the "prebuild" / "prewatch" npm scripts.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG_TS = path.join(ROOT, "src", "config.ts");
const PACKAGE_JSON = path.join(ROOT, "package.json");

// ---------------------------------------------------------------------------
// 1. Extract CONFIG_NAMESPACE from src/config.ts (no TS compilation needed)
// ---------------------------------------------------------------------------
const configSource = fs.readFileSync(CONFIG_TS, "utf-8");
const nsMatch = configSource.match(/CONFIG_NAMESPACE\s*=\s*["']([^"']+)["']/);
if (!nsMatch) {
  console.error("patch-package: could not find CONFIG_NAMESPACE in src/config.ts");
  process.exit(1);
}
const namespace = nsMatch[1];

// ---------------------------------------------------------------------------
// 2. Rewrite the property keys in package.json
// ---------------------------------------------------------------------------
const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf-8"));

const properties = pkg.contributes?.configuration?.properties;
if (!properties) {
  console.error("patch-package: package.json has no contributes.configuration.properties");
  process.exit(1);
}

const patched = {};
for (const [key, value] of Object.entries(properties)) {
  // Strip everything up to and including the first dot, then re-prefix.
  const dot = key.indexOf(".");
  const shortKey = dot >= 0 ? key.slice(dot + 1) : key;
  patched[`${namespace}.${shortKey}`] = value;
}
pkg.contributes.configuration.properties = patched;

fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + "\n");
console.log(`patch-package: configuration namespace → "${namespace}"`);
