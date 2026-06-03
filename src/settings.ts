import * as vscode from "vscode";
import { CONFIG_NAMESPACE, CONFIG_KEYS } from "./config";

function substitutePath(s: string): string {
  const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0]?.uri?.fsPath;
  if (!workspaceFolder) return s;
  return s
    .replace(/\${workspaceRoot}/g, workspaceFolder)
    .replace(/\${workspaceFolder}/g, workspaceFolder);
}

// Reads a setting value. When the user has explicitly cleared the field to an
// empty string, falls back to the default declared in package.json so that the
// code never needs to hardcode default values in two places.
function getSetting(section: string): string {
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  const value = config.get<string>(section);
  if (!value) {
    return config.inspect<string>(section)?.defaultValue ?? "";
  }
  return value;
}

export function getDebugExtension(): string {
  return getSetting(CONFIG_KEYS.debugExtension);
}

export function getLuaExe(): string {
  return substitutePath(getSetting(CONFIG_KEYS.luaExe));
}

export function getTestGlob(): string {
  return getSetting(CONFIG_KEYS.testGlob);
}

// Returns a regex matched against test function/method names.
export function getTestRegex(): RegExp {
  return new RegExp(getSetting(CONFIG_KEYS.testRegex));
}

// Returns a regex matched against class names in 'function ClassName:method()' syntax.
export function getSuiteRegex(): RegExp {
  return new RegExp(getSetting(CONFIG_KEYS.suiteRegex));
}

export function getTestEncoding(): BufferEncoding {
  return getSetting(CONFIG_KEYS.testEncoding) as BufferEncoding;
}

// Returns a regex matched against test output to extract line number and message.
export function getDecorationRegex(): RegExp {
  return new RegExp(getSetting(CONFIG_KEYS.decorationRegex), "gs");
}
