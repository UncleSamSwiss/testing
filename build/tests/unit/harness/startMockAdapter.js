"use strict";
// wotan-disable no-unused-expression
// tslint:disable:no-unused-expression
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const objects_1 = require("alcalzone-shared/objects");
const chai_1 = require("chai");
const path = __importStar(require("path"));
const mockAdapterCore_1 = require("../mocks/mockAdapterCore");
const mockDatabase_1 = require("../mocks/mockDatabase");
const loader_1 = require("./loader");
/**
 * Starts an adapter by executing its main file in a controlled offline environment.
 * The JS-Controller is replaced by mocks for the adapter and Objects and States DB, so
 * no working installation is necessary.
 * This method may throw (or reject) if something goes wrong during the adapter startup.
 * It returns an instance of the mocked adapter class and the database, so you can perform further tests.
 *
 * @param adapterMainFile The main file of the adapter to start. Must be an absolute path.
 */
function startMockAdapter(adapterMainFile, options = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        // Setup the mocks
        const databaseMock = new mockDatabase_1.MockDatabase();
        // If instance objects are defined, populate the database mock with them
        if (options.instanceObjects && options.instanceObjects.length) {
            databaseMock.publishObjects(...options.instanceObjects);
        }
        let adapterMock;
        const adapterCoreMock = mockAdapterCore_1.mockAdapterCore(databaseMock, {
            onAdapterCreated: mock => {
                adapterMock = mock;
                // Give the user the chance to change the mock behavior
                if (typeof options.defineMockBehavior === "function")
                    options.defineMockBehavior(databaseMock, adapterMock);
                // If an adapter configuration was given, set it on the mock
                if (options.config)
                    mock.config = options.config;
            },
            adapterDir: options.adapterDir,
        });
        // Replace the following modules with mocks
        const mockedModules = {};
        if (options.additionalMockedModules) {
            for (let [mdl, mock] of objects_1.entries(options.additionalMockedModules)) {
                mdl = mdl.replace("{CONTROLLER_DIR}", adapterCoreMock.controllerDir);
                if (mdl.startsWith(".") || path.isAbsolute(mdl))
                    mdl = path.normalize(mdl);
                mockedModules[mdl] = mock;
            }
        }
        mockedModules["@iobroker/adapter-core"] = adapterCoreMock;
        // If the adapter supports compact mode and should be executed in "normal" mode,
        // we need to trick it into thinking it was not required
        const fakeNotRequired = !options.compact;
        // Make process.exit() test-safe
        const globalPatches = { process: { exit: loader_1.fakeProcessExit } };
        // Load the adapter file into the test harness and capture it's module.exports
        const mainFileExport = loader_1.loadModuleInHarness(adapterMainFile, {
            mockedModules,
            fakeNotRequired,
            globalPatches,
        });
        if (options.compact) {
            // In compact mode, the main file must export a function
            if (typeof mainFileExport !== "function")
                throw new Error("The adapter's main file must export a function in compact mode!");
            // Call it to initialize the adapter
            mainFileExport();
        }
        // Assert some basic stuff
        if (adapterMock == undefined)
            throw new Error("The adapter was not initialized!");
        chai_1.expect(adapterMock.readyHandler, "The adapter's ready method could not be found!").to.exist;
        // Execute the ready method (synchronously or asynchronously)
        let processExitCode;
        let terminateReason;
        try {
            const readyResult = adapterMock.readyHandler();
            if (readyResult instanceof Promise)
                yield readyResult;
        }
        catch (e) {
            if (e instanceof Error) {
                const anyError = e;
                if (typeof anyError.processExitCode === "number") {
                    processExitCode = anyError.processExitCode;
                }
                else if (typeof anyError.terminateReason === "string") {
                    terminateReason = anyError.terminateReason;
                    if (!options.compact) {
                        // in non-compact mode, adapter.terminate calls process.exit(11)
                        processExitCode = 11;
                    }
                }
                else {
                    // This error was not meant for us, pass it through
                    throw e;
                }
            }
        }
        // Return the mock instances so the tests can work with them
        return {
            databaseMock,
            adapterMock,
            processExitCode,
            terminateReason,
        };
    });
}
exports.startMockAdapter = startMockAdapter;
