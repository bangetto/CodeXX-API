import { commandMap, supportedLanguages } from "./instructions";
import { createTarStream } from "../file-system/createTarStream";
import { v4 as getUUID } from "uuid";
import info from "./info";
import { spawn } from "child_process";
import config from "../utils/config";
import { getContainer, returnContainer, addManagedContainer, removeManagedContainer } from "./containerPoolManager";
import handleSpawn from "../utils/handleSpawn";
import { RunCodeError, RunCodeRequest, SuccessResponse } from "../utils/schemas";
import { startContainer, copyToContainer, cleanupContainer } from "./containerStarter";
import { perfStart, perfEnd, flushPerfLogs } from "../utils/perfLogger";

async function compileInContainer(containerName: string, compileCommand: string, compilationArgs: string[] | undefined): Promise<{ error: string | null }> {
    // Run as appuser - volume is owned by appuser with proper security
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
        // Run as appuser - volume is owned by appuser with proper security
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

        executeProcess.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });

        if (inputStr) {
            const canContinue = executeProcess.stdin.write(inputStr + '\n');
            if (!canContinue) {
                await new Promise(resolve => executeProcess.stdin.once('drain', resolve));
            }
            // Ensure data is flushed to the process before closing stdin
            await new Promise(resolve => executeProcess.stdin.once('drain', resolve));
        }
        executeProcess.stdin.end();
    });
}


export async function runCode({ language, code, files, input, tests = [], mode = "runAll" }: RunCodeRequest): Promise<SuccessResponse | RunCodeError> {
    const timeout = 30;

    if (!supportedLanguages.includes(language)) {
        throw {
            status: 400,
            error: `Entered language is not supported, for more information visit the wiki: https://github.com/bangetto/CodeXX-API/wiki. The languages currently supported are: ${supportedLanguages.join(', ')}.`
        };
    }

    const jobID = getUUID();

    const codeFiles = files || (code ? { [`main.${language}`]: code } : undefined);
    if (!codeFiles) {
        throw {
            status: 400,
            error: `Either 'code' or 'files' must be provided`
        };
    }

    const tarStream = await createTarStream({ files: codeFiles });

    perfStart(`job-${jobID}-TOTAL`); // PERF_LOG
    perfStart(`job-${jobID}-TOTAL-with-cleanup`); // PERF_LOG

    const { compileCodeCommand, compilationArgs, executeCodeCommand, executionArgs } = commandMap(jobID, language);
    let containerName = await getContainer(language);
    
    perfStart(`job-${jobID}-containerSetup`); // PERF_LOG
    let isPooledContainer = false;
    try {
        if(!containerName) {
            console.log(`job-${jobID}: No available container for language: ${language}. Starting a new container...`);
            containerName = `codexx-runner-${language}-${jobID}`;
            await startContainer({ containerName, language });
            addManagedContainer(containerName);
        } else {
            console.log(`job-${jobID}: Reusing container for language: ${language}`)
            isPooledContainer = true;
        }
        await copyToContainer(containerName, tarStream);
    } catch (error) {
        perfEnd(`job-${jobID}-TOTAL`); // PERF_LOG
        await cleanup();
        throw error;
    }
    perfEnd(`job-${jobID}-containerSetup`); // PERF_LOG

    async function cleanup() {
        try {
            perfStart(`job-${jobID}-cleanup`); // PERF_LOG
            if (containerName) {
                try {
                    if (isPooledContainer) {
                        await returnContainer(language, containerName);
                    } else {
                        await cleanupContainer(containerName);
                        removeManagedContainer(containerName);
                    }
                } catch (error) {
                    console.error(`job-${jobID}: Error during cleanup`, error);
                }
            }
            perfEnd(`job-${jobID}-cleanup`); // PERF_LOG
            perfEnd(`job-${jobID}-TOTAL-with-cleanup`); // PERF_LOG
        } catch(err) {
            console.error(`job-${jobID}: Background cleanup failed`, err);
        } finally {
            console.log(flushPerfLogs(jobID));
        }
    };

    try {
        if (compileCodeCommand) {
            perfStart(`job-${jobID}-compile`); // PERF_LOG
            const compileResult = await compileInContainer(containerName, compileCodeCommand, compilationArgs);
            perfEnd(`job-${jobID}-compile`); // PERF_LOG
            if (compileResult.error) {
                await cleanup();
                perfEnd(`job-${jobID}-TOTAL`); // PERF_LOG
                // Return compilation error to the user
                return { error: compileResult.error, language, info: info(language) };
            }
        }

        let testResults: { output: string; passed: boolean }[] | undefined = undefined;
        let output: string | undefined = undefined;
        let error: string = "";

        perfStart(`job-${jobID}-execute`); // PERF_LOG
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
        perfEnd(`job-${jobID}-execute`); // PERF_LOG

        cleanup();
        perfEnd(`job-${jobID}-TOTAL`); // PERF_LOG
        return { output, testResults, error, language, info: info(language) };

    } catch (err) {
        await cleanup();
        perfEnd(`job-${jobID}-TOTAL`); // PERF_LOG
        throw err;
    }
}