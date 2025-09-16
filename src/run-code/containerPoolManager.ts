import config from "../utils/config";
import { spawn } from "child_process";
import handleSpawn from "../utils/handleSpawn";

async function startContainer(containerName: string, language: string, i: number): Promise<void> {
    const containerArgs = [
        'run', '-d', '--name', containerName,
        '--network=none',
        `${language}-compile-run`,
        'sleep', 'infinity'
    ];
    const container = spawn(config.containerProvider, containerArgs);
    await handleSpawn(container);
}

let containerPool: { [language: string]: string[] } = {};

export async function initializeContainerPool() {
    console.log(`Initializing container pool with provider: ${config.containerProvider}`);
    const preWarmPromises: Promise<void>[] = [];
    for (const language in config.instructions) {
        const instr = config.instructions[language];
        if (instr.preWarmCount && instr.preWarmCount > 0) {
            containerPool[language] = [];
            for (let i = 0; i < instr.preWarmCount; i++) {
                const startPromise = new Promise<void>(async (resolve) => {
                    const containerName = `codexx-prewarm-${language}-${i}`;
                    try {
                        await startContainer(containerName, language, i);
                        containerPool[language].push(containerName);
                    } catch (err) {
                        console.error(`Failed to prewarm container ${containerName}:`, err);
                    }
                    return resolve();
                });
                preWarmPromises.push(startPromise);
            }
        }
    }
    await Promise.all(preWarmPromises);
    console.log("Container pool initialized.");
}

export function getContainer(language: string): string | null {
    if (!containerPool[language] || containerPool[language].length === 0) {
        return null;
    }
    const containerName = containerPool[language].pop();
    return containerName || null;
}

export async function returnContainer(language: string, containerName: string): Promise<void> {
    if (!containerPool[language]) {
        containerPool[language] = [];
    }
    try {
        const cleanUpDirProcces = spawn(config.containerProvider, ['exec', containerName, 'sh', '-c', 'rm -rf /code/*']);
        await handleSpawn(cleanUpDirProcces);
        containerPool[language].push(containerName);
        // console.log(`Returned container: ${containerName} to pool for language: ${language}`); // debug
    } catch (error) {
        console.error(`Failed to return container ${containerName} to pool for language ${language}:`, error);
    }
}

let cleaningUp = false;
export async function cleanupContainerPool(): Promise<void> {
    if (cleaningUp) {
        return;
    }
    cleaningUp = true;
    console.log("Starting container pool cleanup. Preparing to remove all prewarmed containers...");
    const cleanupPromises: Promise<void>[] = [];

    for (const language in containerPool) {
        for (const containerName of containerPool[language]) {
            const promise = new Promise<void>((resolve) => {
                const cleanupArgs = ['rm', '-f', containerName];
                const cleanupProcess = spawn(config.containerProvider, cleanupArgs);

                let errorOutput = '';
                cleanupProcess.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });

                cleanupProcess.on('close', (code) => {
                    if (code !== 0) {
                        console.error(`Failed to clean up container ${containerName} (exit code: ${code}): ${errorOutput}`);
                    }
                    // Always resolve to ensure Promise.all doesn't fail fast.
                    resolve();
                });

                cleanupProcess.on('error', (err) => {
                    console.error(`Error spawning cleanup process for ${containerName}:`, err);
                    // Always resolve.
                    resolve();
                });
            });
            cleanupPromises.push(promise);
        }
    }
    console.log(`Initiating removal of ${cleanupPromises.length} containers...`);
    await Promise.all(cleanupPromises);
    containerPool = {};
    console.log("Container pool cleaned up.");
}