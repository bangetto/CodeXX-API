import config from "../utils/config";
import { spawn } from "child_process";

async function startContainer(language: string, i: number): Promise<void> {
    const containerArgs = [
        'run', '-d', '--name', `codexx-premarm-${language}-${i}`,
        '--network=none',
        `${language}-compile-run`,
        'sleep', 'infinity'
    ];
    const container = spawn(config.containerProvider, containerArgs);
    return await new Promise<void>((resolve, reject) => {
        container.on('exit', (code) => {
            if (code === 0) return resolve();
            let error = '';
            container.stderr.on('data', (data) => error += data.toString());
            container.stderr.on('end', () => reject(new Error(`Failed to start container: ${error}`)));
        });
    });

}

let containerPool: { [language: string]: string[] } = {};

export async function initializeContainerPool() {
    console.log(`Initializing container pool with provider: ${config.containerProvider}`);
    for (const language in config.instructions) {
        const instr = config.instructions[language];
        if (instr.prewarmCount && instr.prewarmCount > 0) {
            console.log(`Prewarming ${instr.prewarmCount} containers for language: ${language}`);
            containerPool[language] = [];
            for (let i = 0; i < instr.prewarmCount; i++) {
                const containerName = `codexx-prewarm-${language}-${i}`;
                try {
                    await startContainer(containerName, i);
                    containerPool[language].push(containerName);
                } catch (err) {
                    console.error(`Failed to prewarm container ${containerName}:`, err);
                };
            }
        }
    }
}

export function getContainer(language: string): string {
    if (!containerPool[language] || containerPool[language].length === 0) {
        return '';
    }
    const containerName = containerPool[language].pop();
    if (!containerName) {
        console.warn(`No available pre-warmed container for language: ${language}`);
        return '';
    }
    console.log(`Using prewarmed container: ${containerName} for language: ${language}`);
    return containerName;
}

export function returnContainer(language: string, containerName: string): void {
    if (!containerPool[language]) {
        containerPool[language] = [];
    }
    containerPool[language].push(containerName);
    console.log(`Returned container: ${containerName} to pool for language: ${language}`);
}

export async function cleanupContainerPool(): Promise<void> {
    console.log("Cleaning up container pool...");
    for (const language in containerPool) {
        for (const containerName of containerPool[language]) {
            try {
                const cleanupArgs = ['rm', '-f', containerName];
                const cleanupProcess = spawn(config.containerProvider, cleanupArgs);
                await new Promise<void>((resolve, reject) => {
                    cleanupProcess.on('exit', (code) => {
                        if (code === 0) return resolve();
                        let error = '';
                        cleanupProcess.stderr.on('data', (data) => error += data.toString());
                        cleanupProcess.stderr.on('end', () => reject(new Error(`Failed to clean up container: ${error}`)));
                    });
                });
            } catch (err) {
                console.error(`Failed to clean up container ${containerName}:`, err);
            }
        }
    }
    containerPool = {};
    console.log("Container pool cleaned up.");
}