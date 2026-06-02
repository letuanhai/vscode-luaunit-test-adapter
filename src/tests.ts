import * as vscode from "vscode";
import * as path from "path";
import * as settings from "./settings";
import * as child_process from "child_process";
import * as fs from "fs";
import * as util from "util";
import { TestSuiteInfo, TestInfo, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, TestDecoration } from "vscode-test-adapter-api";

const luaUnitSuite: TestSuiteInfo = {
		type: "suite",
		id: "root",
		label: "LuaUnit",
		children: []
};

// Maps test ID → the name passed to the LuaUnit CLI (e.g. "TestClass.testFoo" or "testFoo")
const testRunNames = new Map<string, string>();

export function getTestRunName(id: string): string | undefined {
	return testRunNames.get(id);
}

export async function loadTests(): Promise<TestSuiteInfo> {
	console.log("Loading tests from test files");

	luaUnitSuite.children = [];
	testRunNames.clear();

	if (!vscode.workspace) {
		console.error("Failed to find workspace");
		return luaUnitSuite;
	}

	if (!vscode.workspace.workspaceFolders) {
		console.error("Failed to find workspaceFolders");
		return luaUnitSuite;
	}

	const testGlob = settings.getTestGlob();
	const files = await vscode.workspace.findFiles(testGlob);

	console.log("Found test files", testGlob, files.length);

	const testRegex = settings.getTestRegex();
	const testEncoding = settings.getTestEncoding();
	const readFile = util.promisify(fs.readFile);

	let testId = 1;
	for (const file of files) {

		console.log("Found test file", file.fsPath);

		const workspaceFolder = vscode.workspace.getWorkspaceFolder(file);
		if (!workspaceFolder) {
			console.error("Failed to find workspaceFolder");
			continue;
		}
		const fileRelPath = path.relative(workspaceFolder.uri.fsPath, file.fsPath);

		const testFileSuite: TestSuiteInfo = {
			type: "suite",
			id: fileRelPath,
			label: fileRelPath,
			file: file.fsPath,
			children: []
		};

		luaUnitSuite.children.push(testFileSuite);

		const content = await readFile(file.fsPath, {
			encoding: testEncoding
		}) as string;

		// Tracks LuaUnit class suite nodes created within this file
		const classSuites = new Map<string, TestSuiteInfo>();

		let match: RegExpExecArray | null;
		do {
			match = testRegex.exec(content);
			if (match && match.groups && match.groups["test"]) {
				const className = match.groups["suite"];
				const testName = match.groups["test"];
				const id = testId.toString();
				testId++;

				console.log("Found test", file.fsPath, className ? `${className}:${testName}` : testName, id);

				const test: TestInfo = {
					type: "test",
					id,
					label: testName,
					file: file.fsPath
				};

				if (className) {
					testRunNames.set(id, `${className}.${testName}`);

					let classSuite = classSuites.get(className);
					if (!classSuite) {
						classSuite = {
							type: "suite",
							id: `${fileRelPath}::${className}`,
							label: className,
							file: file.fsPath,
							children: []
						};
						testFileSuite.children.push(classSuite);
						classSuites.set(className, classSuite);
					}
					classSuite.children.push(test);
				} else {
					testRunNames.set(id, testName);
					testFileSuite.children.push(test);
				}
			}
		} while (match);
	}

	return Promise.resolve<TestSuiteInfo>(luaUnitSuite);
}

export async function runTests(
	tests: string[],
	testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>
): Promise<void> {
	for (const suiteOrTestId of tests) {
		const node = findNode(luaUnitSuite, suiteOrTestId);
		if (node) {
			await runNode(node, testStatesEmitter);
		}
	}
}

export function findNode(searchNode: TestSuiteInfo | TestInfo, id: string): TestSuiteInfo | TestInfo | undefined {
	if (searchNode.id === id) {
		return searchNode;
	} else if (searchNode.type === "suite") {
		for (const child of searchNode.children) {
			const found = findNode(child, id);
			if (found) return found;
		}
	}
	return undefined;
}

async function runNode(
	node: TestSuiteInfo | TestInfo,
	testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>
): Promise<void> {

	if (node.type === "suite") {

		testStatesEmitter.fire(<TestSuiteEvent>{ type: "suite", suite: node.id, state: "running" });

		for (const child of node.children) {
			await runNode(child, testStatesEmitter);
		}

		testStatesEmitter.fire(<TestSuiteEvent>{ type: "suite", suite: node.id, state: "completed" });

	} else { // node.type === "test"

		runTest(node, testStatesEmitter);

	}
}

async function runTest(
	node: TestInfo,
	testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>): Promise<void> {

	const luaExe = settings.getLuaExe();
	if (!node.file) {
		console.error("Test does not specify test file", node);
		testStatesEmitter.fire(<TestEvent>{ type: "test", test: node.id, state: "skipped" });
		return;
	}

	const file = vscode.Uri.file(node.file);
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(file);
	if (!workspaceFolder) {
		console.error("Failed to find test file workspaceFolder", node.file);
		testStatesEmitter.fire(<TestEvent>{ type: "test", test: node.id, state: "skipped" });
		return;
	}

	testStatesEmitter.fire(<TestEvent>{ type: "test", test: node.id, state: "running" });

	const runName = testRunNames.get(node.id) ?? node.label;
	const lua = child_process.spawnSync(luaExe, [file.fsPath, runName], {
		cwd: workspaceFolder.uri.fsPath
	})

	const stderr = String(lua.stderr);
	if (stderr.length > 0) {
		console.error("Failed to execute test file", stderr);
		testStatesEmitter.fire(<TestEvent>{ type: "test", test: node.id, state: "failed", message: stderr });
		return;
	}

	const stdout = String(lua.stdout);
	const passed = stdout && stdout.length > 0 && stdout.match(/.*OK\s*$/);
	const state = passed ? "passed" : "failed";

	const event = <TestEvent>{ type: "test", test: node.id, state: state, message: stdout };

	if (!passed) {
		const infoRegex = settings.getDecorationRegex();
		const match = infoRegex.exec(stdout);
		if (match && match.groups && match.groups["line"]) {
			const line = Number(match.groups["line"]);
			if (Number.isSafeInteger(line)) {
				const message = (match.groups["message"] || "").trim().replace(/\r/g, "").replace(/\n/g, " ");
				event.decorations = [<TestDecoration>{
					line: line,
					message: message,
					hover: stdout
				}];
			}
		}
	}

	testStatesEmitter.fire(event);
}
