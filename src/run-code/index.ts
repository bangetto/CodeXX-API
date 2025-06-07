import { commandMap, supportedLanguages } from "./instructions";
import { createCodeFile } from "../file-system/createCodeFile";
import { removeCodeFile } from "../file-system/removeCodeFile";
import { info } from "./info";
import { spawn } from "child_process";

interface TestingVal {
    input: string;
    output: string
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
            error: `Please enter a valid language. Check documentation for more details: https://github.com/Jaagrav/CodeX-API#readme. The languages currently supported are: ${supportedLanguages.join(', ')}.`
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
            const executeCode = spawn(executeCodeCommand, executionArgs || []);
            let output = "", error = "";

            const timer = setTimeout(async () => {
                executeCode.kill("SIGHUP");
                await removeCodeFile(jobID, language, outputExt);
                reject({
                    status: 408,
                    error: `CodeX API Timed Out. Your code took too long to execute, over ${timeout} seconds. Make sure you are sending input as payload if your code expects an input.`
                })
            }, timeout * 1000);

            if (inputStr) {
                inputStr.split('\n').forEach((line) => {
                    executeCode.stdin.write(`${line}\n`);
                });
                executeCode.stdin.end();
            }

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
        // Run code for each test input
        testResults = [];
        for (const test of tests) {
            const result = await runWithInput(test.input);
            if(result.error) {
                error = result.error;
                break; // Stop on first error
            } else {
                testResults.push({
                    output: result.output,
                    passed: result.output.trim() === test.output.trim()
                });
            }
        }
    } else {
        // Single input mode
        const result = await runWithInput(input);
        output = result.output;
        error = result.error;
    }

    await removeCodeFile(jobID, language, outputExt);

    return {
        output,
        testResults,
        error,
        language,
        info: await info(language)
    };
}