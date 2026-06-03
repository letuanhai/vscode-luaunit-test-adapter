import * as vscode from "vscode";
import { TestAdapter, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, TestSuiteInfo } from "vscode-test-adapter-api";
import { Log } from "vscode-test-adapter-util";
import * as settings from "./settings";
import { loadTests, runTests, findNode, getTestRunName } from "./tests";
import { CONFIG_NAMESPACE, CONFIG_KEYS } from "./config";

const LOCAL_LUA_DEBUGGER_IDS = new Set([
	"tomblind.local-lua-debugger-vscode",
	"ismoh-games.second-local-lua-debugger-vscode",
]);

export class LuaTestAdapter implements TestAdapter {

	private disposables: { dispose(): void }[] = [];

	private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
	private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
	private readonly autorunEmitter = new vscode.EventEmitter<void>();

	get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> { return this.testsEmitter.event; }
	get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> { return this.testStatesEmitter.event; }
	get autorun(): vscode.Event<void> | undefined { return this.autorunEmitter.event; }

	private suite: TestSuiteInfo | undefined;

	constructor(
		public readonly workspace: vscode.WorkspaceFolder,
		private readonly log: Log
	) {
		this.log.info("Initializing Lua Test Adapter");
		this.disposables.push(this.testsEmitter);
		this.disposables.push(this.testStatesEmitter);
		this.disposables.push(this.autorunEmitter);
	}

	async load(): Promise<void> {
		this.log.info("Loading LuaUnit tests");
		this.testsEmitter.fire(<TestLoadStartedEvent>{ type: "started" });
		this.suite = await loadTests();
		this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: "finished", suite: this.suite });
	}

	async run(tests: string[]): Promise<void> {
		this.log.info(`Running LuaUnit tests ${JSON.stringify(tests)}`);
		this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: "started", tests });
		await runTests(tests, this.testStatesEmitter);
		this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: "finished" });
	}

	async debug(tests: string[]): Promise<void> {
		const debugExtensionId = settings.getDebugExtension();
		if (!vscode.extensions.getExtension(debugExtensionId)) {
			const message = `Cannot debug test: the extension "${debugExtensionId}" is not installed. ` +
				`Please install it or select a different debug extension in the Lua Test Adapter settings (${CONFIG_NAMESPACE}.${CONFIG_KEYS.debugExtension}).`;
			this.log.error(message);
			this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: "started", tests });
			this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: "finished" });
			vscode.window.showErrorMessage(message);
			return;
		}

		if (!this.suite) {
			this.log.error("No tests loaded", tests);
			return;
		}

		const node = findNode(this.suite, tests[0]);
		if (!node) {
			this.log.error("Test not found", tests[0]);
			return;
		}

		if (!node.file) {
			this.log.error("Test does not specify test file", node);
			return;
		}

		const file = vscode.Uri.file(node.file);
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(file);

		if (!workspaceFolder) {
			this.log.error("Failed to find test file workspaceFolder", node.file);
			return;
		}

		const luaExe = settings.getLuaExe();
		const isFileSuite = node.type === "suite" && !node.id.includes("::");
		const testRunName = node.type === "test"
			? (getTestRunName(node.id) ?? node.label)
			: node.label;

		this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: "started", tests });

		const debugSessionName = "Debug LuaUnit Tests"
		const launchConfig = LOCAL_LUA_DEBUGGER_IDS.has(debugExtensionId)
			? {
				"type": "lua-local",
				"request": "launch",
				"name": debugSessionName,
				"cwd": workspaceFolder.uri.fsPath,
				"program": {
					"lua": luaExe,
					"file": file.fsPath
				},
				"args": isFileSuite ? ["--pattern", ".*"] : [testRunName]
			}
			: {
				"type": "lua",
				"request": "launch",
				"name": debugSessionName,
				"luaexe": luaExe,
				"cwd": workspaceFolder.uri.fsPath,
				"program": file.fsPath,
				"arg": isFileSuite ? [] : [testRunName],
				"console": "internalConsole",
				"stopOnEntry": false
			};

		return new Promise<void>(resolve => {
			vscode.debug.startDebugging(workspaceFolder, launchConfig).then(started => {
				if (!started) {
					this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: "finished" });
					resolve();
					return;
				}
				const listener = vscode.debug.onDidTerminateDebugSession(session => {
					if (session.name === debugSessionName) {
						listener.dispose();
						this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: "finished" });
						resolve();
					}
				});
			});
		});
	}

	cancel(): void {
		// in a "real" TestAdapter this would kill the child process for the current test run (if there is any)
		throw new Error("Method not implemented.");
	}

	dispose(): void {
		this.cancel();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}
