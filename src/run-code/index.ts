import { commandMap, supportedLanguages } from "./instructions";
import { createCodeFile } from "../file-system/createCodeFile";
import { removeCodeFile } from "../file-system/removeCodeFile";
import info from "./info";
import { spawn } from "child_process";
import config from "../utils/config";
import { getContainer, returnContainer, addManagedContainer, removeManagedContainer } from "./containerPoolManager";
import handleSpawn from "../utils/handleSpawn";
import { RunCodeError, RunCodeRequest, SuccessResponse } from "../utils/schemas";
import { startContainer, copyToContainer, cleanupContainer } from "./containerStarter";

async function compileInContainer(containerName: string, compileCommand: string, compilationArgs: string[] | undefined): Promise<{ error: string | null }> {
    const compileArgs = ['exec', containerName, compileCommand, ...(compilationArgs || [])];
    const compileProcess = spawn(config.containerProvider, compileArgs);
    const { code, stderr } = await handleSpawn(compileProcess);
    if (code !== 0) {
        return { error: stderr };
    }
    return { error: null };
}

function executeWithInputInContainer(containerName: string, executeCommand: string, executionArgs: string[] | undefined, inputStr: string|undefined, timeout: number): Promise<{ output: string; error: string }> {
    return new Promise(async (resolve, reject) => {
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
            const canContinue = executeProcess.stdin.write(inputStr + '\n');
            if (!canContinue) {
                await new Promise(resolve => executeProcess.stdin.once('drain', resolve));
            }
        }
        executeProcess.stdin.end();
    });
}


export async function runCode({ language, code, input, tests = [], mode = "runAll" }: RunCodeRequest): Promise<SuccessResponse | RunCodeError> {
    const timeout = 30;

    if (!supportedLanguages.includes(language)) {
        throw {
            status: 400,
            error: `Entered language is not supported, for more information visit the wiki: https://github.com/bangetto/CodeXX-API/wiki. The languages currently supported are: ${supportedLanguages.join(', ')}.`
        };
    }

    const { jobID, dirPath } = await createCodeFile(language, code);

    console.time(`job-${jobID}-TOTAL`); // PERF_LOG
    console.time(`job-${jobID}-TOTAL-with-cleanup`); // PERF_LOG

    const { compileCodeCommand, compilationArgs, executeCodeCommand, executionArgs } = commandMap(jobID, language);
    let containerName = await getContainer(language);
    
    console.time(`job-${jobID}-containerSetup`); // PERF_LOG
    let isPooledContainer = false;
    try {
        if(!containerName) {
            console.log(`No available container for language: ${language}. Starting a new container...`);
            containerName = `codexx-runner-${language}-${jobID}`;
            await startContainer({ containerName, dirPath, language });
            addManagedContainer(containerName);
        } else {
            console.log(`Reusing container for language: ${language}`)
            isPooledContainer = true;
            await copyToContainer(containerName, dirPath);
        }
    } catch (error) {
        removeCodeFile(jobID);
        throw error;
    }
    console.timeEnd(`job-${jobID}-containerSetup`); // PERF_LOG

    async function cleanup() {
        try {
            console.time(`job-${jobID}-cleanup`); // PERF_LOG
            if (containerName) {
                try {
                    if (isPooledContainer) {
                        await returnContainer(language, containerName);
                    } else {
                        await cleanupContainer(containerName);
                        removeManagedContainer(containerName);
                    }
                } catch (error) {
                    console.error(`Error during cleanup for jobID: ${jobID}`, error);
                }
            }
            removeCodeFile(jobID);
            console.log(`Cleaned up jobID: ${jobID}`);
            console.timeEnd(`job-${jobID}-cleanup`); // PERF_LOG
            console.timeEnd(`job-${jobID}-TOTAL-with-cleanup`); // PERF_LOG
        } catch(err) {
            console.error(`Background cleanup failed for jobID ${jobID}:`, err);
        };
    };

    try {
        if (compileCodeCommand) {
            console.time(`job-${jobID}-compile`); // PERF_LOG
            const compileResult = await compileInContainer(containerName, compileCodeCommand, compilationArgs);
            console.timeEnd(`job-${jobID}-compile`); // PERF_LOG
            if (compileResult.error) {
                cleanup();
                console.timeEnd(`job-${jobID}-TOTAL`); // PERF_LOG
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
                    if (mode === 'failFast' && !testResults[i].passed) {
                        break;
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
        console.timeEnd(`job-${jobID}-TOTAL`); // PERF_LOG
        return { output, testResults, error, language, info: info(language) };

    } catch (err) {
        cleanup();
        throw err;
    }
}