import { commandMap, supportedLanguages } from "./instructions";
import { createCodeFile } from "../file-system/createCodeFile";
import { removeCodeFile } from "../file-system/removeCodeFile";
import { info } from "./info";
import { spawn, ChildProcess } from "child_process";
import config from "../utils/config";
import { getContainer, returnContainer } from "./containerPoolManager";

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

function handleSpawn(
    process: ChildProcess, 
    rejectionValue: (error: string, code: number | null) => any
): Promise<void> {
    return new Promise((resolve, reject) => {
        let error = '';
        if (process.stderr) {
            process.stderr.on('data', (data) => {
                error += data.toString();
            });
        }
        process.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(rejectionValue(error, code));
            }
        });
        process.on('error', (err) => {
            reject(err);
        });
    });
}

function executeCleanupCommand(command: string, args: string[]): Promise<void> {
    const process = spawn(command, args);
    return handleSpawn(process, (error, code) => new Error(`Command failed with code ${code}: ${command} ${args.join(' ')}\n${error}`));
}

async function startContainer(containerName: string, dirPath: string, language: string): Promise<ChildProcess> {
    const containerArgs = [
        'run', '-d', '--name', containerName,
        '-v', `${dirPath}:/code`, '-w', '/code',
        '--user', `${1000}:${1000}`,
        '--network=none', `${language}-compile-run`,
        'sleep', 'infinity'
    ];
    const startProcess = spawn(config.containerProvider, containerArgs);
    await handleSpawn(startProcess, (error) => new Error(`Failed to start container: ${error}`));
    return startProcess;
}

async function compileInContainer(containerName: string, compileCommand: string, compilationArgs: string[] | undefined) {
    const compileArgs = ['exec', containerName, compileCommand, ...(compilationArgs || [])];
    const compileProcess = spawn(config.containerProvider, compileArgs);
    await handleSpawn(compileProcess, (error) => ({ status: 200, output: '', error }));
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

    if (code === "") throw { status: 400, error: "No Code found to execute." };
    if (!supportedLanguages.includes(language)) {
        throw {
            status: 400,
            error: `Entered language is not supported, for more information visit the wiki: https://github.com/bangetto/CodeXX-API/wiki. The languages currently supported are: ${supportedLanguages.join(', ')}.`
        };
    }

    const { jobID, filePath } = await createCodeFile(language, code);
    const { compileCodeCommand, compilationArgs, executeCodeCommand, executionArgs } = commandMap(jobID, language);
    let startProcess: ChildProcess | undefined;
    let containerName = getContainer(language);
    
    if(!containerName || containerName === "") {
        console.log(`No available container for language: ${language}. Starting a new container...`);
        containerName = `codexx-runner-${language}-${jobID}`;
        startProcess = await startContainer(containerName, filePath, language);
    } else {
        const copyFileProcces = spawn(config.containerProvider, ['cp', `${filePath}/.`, `${containerName}:/code/`]);
        await handleSpawn(copyFileProcces, (error) => new Error(`Failed to copy code file to container: ${error}`));
    }

    try {
        if (compileCodeCommand) {
            await compileInContainer(containerName, compileCodeCommand, compilationArgs);
        }

        let testResults: { output: string; passed: boolean }[] | undefined = undefined;
        let output: string | undefined = undefined;
        let error: string = "";

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
                        testResults[i].passed = normalizeOutput(result.output) === normalizeOutput(test.output);
                    }
                }
            }
        } else {
            const result = await executeWithInputInContainer(containerName, executeCodeCommand, executionArgs, input, timeout);
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
            if(startProcess) startProcess.kill('SIGKILL');
            else returnContainer(language, containerName);
            removeCodeFile(jobID);
            console.log(`Cleaned up jobID: ${jobID}`);
        }
    }
}
