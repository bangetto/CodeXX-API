import { commandMap, supportedLanguages } from "./instructions";
import { createCodeFile } from "../file-system/createCodeFile";
import { removeCodeFile } from "../file-system/removeCodeFile";
import info from "./info";
import { spawn, ChildProcess } from "child_process";
import config from "../utils/config";
import { getContainer, returnContainer } from "./containerPoolManager";
import handleSpawn from "../utils/handleSpawn";

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

async function executeCleanupCommand(command: string, args: string[]): Promise<void> {
    const process = spawn(command, args);
    const { code, stderr } = await handleSpawn(process);
    if (code !== 0) {
        console.error(`Cleanup command failed with code ${code}: ${command} ${args.join(' ')}
${stderr}`);
    }
}

async function startContainer(containerName: string, dirPath: string, language: string): Promise<ChildProcess> {
    const containerArgs = [
        'run', '-d', '--name', containerName,
        '-v', `${dirPath}:/code`,
        '--user', `${1000}:${1000}`,
        '--network=none', `${language}-compile-run`,
        'sleep', 'infinity'
    ];
    const startProcess = spawn(config.containerProvider, containerArgs);
    const { code, stderr } = await handleSpawn(startProcess);
    if (code !== 0) {
        throw new Error(`Failed to start container: ${stderr}`);
    }
    return startProcess;
}

async function compileInContainer(containerName: string, compileCommand: string, compilationArgs: string[] | undefined): Promise<{ error: string | null }> {
    const compileArgs = ['exec', containerName, compileCommand, ...(compilationArgs || [])];
    const compileProcess = spawn(config.containerProvider, compileArgs);
    const { code, stderr } = await handleSpawn(compileProcess);
    if (code !== 0) {
        return { error: stderr };
    }
    return { error: null };
}

function executeWithInputInContainer(containerName: string, executeCommand: string, executionArgs: string[] | undefined, inputStr: string, timeout: number): Promise<{ output: string; error: string }> {
    return new Promise((resolve, reject) => {
        const execArgs = ['exec', '-i', containerName, executeCommand, ...(executionArgs || [])];
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

        executeProcess.on('exit', (code) => {
            clearTimeout(timer);
            const execError = code === 0? '': (error || `Process exited with code ${code}`);
            resolve({ output, error: execError });
        });

        if (inputStr) {
                    executeProcess.stdin.write(inputStr + '\n');
        }
        executeProcess.stdin.end();
    });
}


export async function runCode({ language = "", code = "", input = "", tests = [] }: RunCodeParams): Promise<RunCodeResult> {
    const timeout = 30;

    if (!supportedLanguages.includes(language)) {
        throw {
            status: 400,
            error: `Entered language is not supported, for more information visit the wiki: https://github.com/bangetto/CodeXX-API/wiki. The languages currently supported are: ${supportedLanguages.join(', ')}.`
        };
    }

    console.time(`job-TOTAL`); // PERF_LOG
    console.time(`job-TOTAL-with-cleanup`); // PERF_LOG

    console.time(`job-createCodeFile`); // PERF_LOG
    const { jobID, dirPath } = await createCodeFile(language, code);
    console.timeEnd(`job-createCodeFile`); // PERF_LOG

    const { compileCodeCommand, compilationArgs, executeCodeCommand, executionArgs } = commandMap(jobID, language);
    let startProcess: ChildProcess | undefined;
    let containerName = getContainer(language);
    
    console.time(`job-${jobID}-containerSetup`); // PERF_LOG
    if(!containerName) {
        console.log(`No available container for language: ${language}. Starting a new container...`);
        containerName = `codexx-runner-${language}-${jobID}`;
        startProcess = await startContainer(containerName, dirPath, language);
    } else {
        console.log(`Reusing container for language: ${language}`)
        const copyFileProccess = spawn(config.containerProvider, ['cp', `${dirPath}/.`, `${containerName}:/code/`]);
        const { code, stderr } = await handleSpawn(copyFileProccess);
        if (code !== 0) {
            throw new Error(`Failed to copy code file to container: ${stderr}`);
        }
    }
    console.timeEnd(`job-${jobID}-containerSetup`); // PERF_LOG

    const cleanup = () => {
        (async () => {
            console.time(`job-${jobID}-cleanup`); // PERF_LOG
            if (startProcess) {
                try {
                    await executeCleanupCommand(config.containerProvider, ['stop', '-t', '1', containerName!]);
                    await executeCleanupCommand(config.containerProvider, ['rm', containerName!]);
                } catch (error) {
                    console.error(`Error during cleanup for jobID: ${jobID}`, error);
                } finally {
                    startProcess.kill('SIGKILL');
                }
            } else if (containerName) {
                await returnContainer(language, containerName);
            }
            removeCodeFile(jobID);
            console.log(`Cleaned up jobID: ${jobID}`);
            console.timeEnd(`job-${jobID}-cleanup`); // PERF_LOG
            console.timeEnd(`job-TOTAL-with-cleanup`); // PERF_LOG
        })().catch(err => {
            console.error(`Background cleanup failed for jobID ${jobID}:`, err);
        });
    };

    try {
        if (compileCodeCommand) {
            console.time(`job-${jobID}-compile`); // PERF_LOG
            const compileResult = await compileInContainer(containerName, compileCodeCommand, compilationArgs);
            console.timeEnd(`job-${jobID}-compile`); // PERF_LOG
            if (compileResult.error) {
                cleanup();
                console.timeEnd(`job-TOTAL`); // PERF_LOG
                // Return compilation error to the user
                return { error: compileResult.error, language, info: info(language) };
            }
        }

        let testResults: { output: string; passed: boolean }[] | undefined = undefined;
        let output: string | undefined = undefined;
        let error: string = "";

        console.time(`job-${jobID}-execute`); // PERF_LOG
        if (tests && tests.length > 0) {
            testResults = [];
            for (let i = 0; i < tests.length; i++) {
                const test = tests[i];
                const result = await executeWithInputInContainer(containerName, executeCodeCommand, executionArgs, test.input, timeout);
                if (result.error) {
                    error = result.error;
                    break;
                } else {
                    testResults[i] = { output: result.output.replace(/\r\n|\r/g, '\n'), passed: true };
                    if (test.output) {
                        testResults[i].passed = testResults[i].output === test.output.replace(/\r\n|\r/g, '\n');
                    }
                }
            }
        } else {
            const result = await executeWithInputInContainer(containerName, executeCodeCommand, executionArgs, input, timeout);
            output = result.output;
            error = result.error;
        }
        console.timeEnd(`job-${jobID}-execute`); // PERF_LOG

        cleanup();
        console.timeEnd(`job-TOTAL`); // PERF_LOG
        return { output, testResults, error, language, info: info(language) };

    } catch (err) {
        cleanup();
        throw err;
    }
}