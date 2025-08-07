import { commandMap, supportedLanguages } from "./instructions";
import { createCodeFile } from "../file-system/createCodeFile";
import { removeCodeFile } from "../file-system/removeCodeFile";
import { info } from "./info";
import { spawn, ChildProcess } from "child_process";
import config from "../utils/config";

interface TestingVal {
    input: string;
    output?: string;
}

interface RunCodeParams {
    language?: string;
    code?: string;
    input?: string;
    tests?: TestingVal[];
}

interface RunCodeResult {
    output?: string;
    testResults?: { output: string; passed: boolean }[];
    error: string;
    language: string;
    info: string;
}

function normalizeOutput(str: string): string {
    return str
        .replace(/\r\n|\r/g, '\n') // Normalize line endings
        .split('\n')
        .map(line => line.trimEnd()) // Remove trailing spaces on each line
        .join('\n')
        .trim(); // Remove leading/trailing newlines
}

function executeCleanupCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args);
        let errorOutput = '';
        process.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        process.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with code ${code}: ${command} ${args.join(' ')}
${errorOutput}`));
            }
        });
        process.on('error', (err) => {
            reject(err);
        });
    });
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

    const { jobID, filePath } = await createCodeFile(language, code);
    const { compileCodeCommand, compilationArgs, executeCodeCommand, executionArgs } = commandMap(jobID, language);
    
    const containerName = `codexx-runner-${language}-${jobID}`;
    const containerArgs = [
        'run',
        '-d', // Run in detached mode
        '--name', containerName,
        '-v', `${filePath}:/code`,
        '-w', '/code',
        '--user', `${1000}:${1000}`,
        '--network=none',
        `${language}-compile-run`,
        'sleep', 'infinity' // Keep container alive
    ];

    const startProcess = spawn(config.containerProvider, containerArgs);
    await new Promise<void>((resolve, reject) => {
        startProcess.on('exit', (code) => {
            if (code === 0) return resolve();
            let error = '';
            startProcess.stderr.on('data', (data) => error += data.toString());
            startProcess.stderr.on('end', () => reject(new Error(`Failed to start container: ${error}`)));
        });
    });

    try {
        if (compileCodeCommand) {
            const compileArgs = ['exec', containerName, compileCodeCommand, ...(compilationArgs || [])];
            await new Promise<void>((resolve, reject) => {
                const compileProcess = spawn(config.containerProvider, compileArgs);
                let error = '';
                compileProcess.stderr.on('data', (data) => error += data.toString());
                compileProcess.on('exit', (code) => {
                    if (code === 0) return resolve();
                    reject({ status: 200, output: '', error, language });
                });
            });
        }

        const runWithInput = (inputStr: string): Promise<{ output: string; error: string }> => {
            return new Promise((resolve, reject) => {
                const execArgs = ['exec', '-i', containerName, executeCodeCommand, ...(executionArgs || [])];
                const executeProcess = spawn(config.containerProvider, execArgs);

                let output = '';
                let error = '';
                const timer = setTimeout(() => {
                    executeProcess.kill('SIGKILL');
                    reject({
                        status: 408,
                        error: `CodeXX API Timed Out. Your code took too long to execute, over ${timeout} seconds.`
                    });
                }, timeout * 1000);

                executeProcess.stdout.on('data', (data) => output += data.toString());
                executeProcess.stderr.on('data', (data) => error += data.toString());

                executeProcess.on('exit', () => {
                    clearTimeout(timer);
                    resolve({ output, error });
                });

                if (inputStr) {
                    executeProcess.stdin.write(inputStr + '\n');
                }
                executeProcess.stdin.end();
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
                    break;
                } else {
                    testResults[i] = { output: result.output.replace(/\r\n|\r/g, '\n'), passed: true };
                    if (test.output) {
                        testResults[i].passed = normalizeOutput(result.output) === normalizeOutput(test.output);
                    }
                }
            }
        } else {
            const result = await runWithInput(input);
            output = result.output;
            error = result.error;
        }

        return { output, testResults, error, language, info: await info(language) };

    } finally {
        try {
            await executeCleanupCommand(config.containerProvider, ['stop', containerName]);
            await executeCleanupCommand(config.containerProvider, ['rm', containerName]);
        } catch (error) {
            console.error(`Error during cleanup for jobID: ${jobID}`, error);
        } finally {
            startProcess?.kill('SIGKILL');
            removeCodeFile(jobID);
            console.log(`Cleaned up jobID: ${jobID}`);
        }
    }
}