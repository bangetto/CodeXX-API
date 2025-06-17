import { commandMap, supportedLanguages } from "./instructions";
import { createCodeFile } from "../file-system/createCodeFile";
import { removeCodeFile } from "../file-system/removeCodeFile";
import { info } from "./info";
import { spawn } from "child_process";

interface TestingVal {
    input: string;
    output?: string
}

interface RunCodeParams {
    language?: string;
    code?: string;
    input?: string;
    tests?: TestingVal[];
}

interface RunCodeResult {
    output?: string;
    testResults?: {output: string; passed: boolean}[];
    error: string;
    language: string;
    info: string;
}

const ID = 1000; // this id is used to run the code as a non-root user

function normalizeOutput(str: string): string {
    return str
        .replace(/\r\n|\r/g, '\n') // Normalize line endings
        .split('\n')
        .map(line => line.trimEnd()) // Remove trailing spaces on each line
        .join('\n')
        .trim(); // Remove leading/trailing newlines
}

export async function runCode({ language = "", code = "", input = "", tests = [] }: RunCodeParams): Promise<RunCodeResult> {
    const timeout = 30;

    if (code === "")
        throw {
            status: 400,
            error: "No Code found to execute."
        }

    if (!supportedLanguages.includes(language))
        throw {
            status: 400,
            error: `Entered language is not supported, for more information visit the wiki: https://github.com/bangetto/CodeXX-API/wiki. The languages currently supported are: ${supportedLanguages.join(', ')}.`
        }

    const { jobID } = createCodeFile(language, code);
    const { compileCodeCommand, compilationArgs, executeCodeCommand, executionArgs, outputExt } = commandMap(jobID, language);

    if (compileCodeCommand) {
        await new Promise<void>((resolve, reject) => {
            const compileCode = spawn(compileCodeCommand, compilationArgs || []);
            compileCode.stderr.on('data', (error) => {
                reject({
                    status: 200,
                    output: '',
                    error: error.toString(),
                    language
                })
            });
            compileCode.on('exit', () => {
                resolve();
            });
        });
    }

    // Helper to run the code with a single input string
    const runWithInput = (inputStr: string): Promise<{ output: string; error: string }> => {
        return new Promise((resolve, reject) => {
            const spawnOptions: any = { };
            if (process.platform !== "win32") {
                spawnOptions.uid = ID;
                spawnOptions.gid = ID;
            }
            const executeCode = spawn(executeCodeCommand, executionArgs || [], spawnOptions);
            let output = "", error = "";

            const timer = setTimeout(async () => {
                executeCode.kill("SIGHUP");
                reject({
                    status: 408,
                    error: `CodeXX API Timed Out. Your code took too long to execute, over ${timeout} seconds. Make sure you are sending input as payload if your code expects an input.`
                })
            }, timeout * 1000);

            if (inputStr) {
                executeCode.stdin.write(inputStr);
            }
            executeCode.stdin.end();

            executeCode.stdin.on('error', (err) => {
                console.log('stdin err', err);
            });

            executeCode.stdout.on('data', (data) => {
                output += data.toString();
            });

            executeCode.stderr.on('data', (data) => {
                error += data.toString();
            });

            executeCode.on('exit', () => {
                clearTimeout(timer);
                resolve({ output, error });
            });
        });
    };

    let testResults: { output: string; passed: boolean }[] | undefined = undefined;
    let output: string | undefined = undefined;
    let error: string = "";

    if (tests && tests.length > 0) {
        testResults = [];
        for (let i = 0; i < tests.length; i++) {
            const test = tests[i];
            const result = await runWithInput(test.input);
            if (result.error) {
                error = result.error;
                break; // Stop on first error
            } else {
                testResults[i] = { output: result.output.replace(/\r\n|\r/g, '\n'), passed: true };
                if(test.output) {
                    testResults[i].passed = normalizeOutput(result.output) === normalizeOutput(test.output);
                }
            }
        }
    } else {
        // Single input mode
        const result = await runWithInput(input);
        output = result.output;
        error = result.error;
    }

    removeCodeFile(jobID, language, outputExt);

    return {
        output,
        testResults,
        error,
        language,
        info: await info(language)
    };
}