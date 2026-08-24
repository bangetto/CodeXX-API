import type { ChildProcess } from "child_process";

export interface SpawnResult {
    code: number | null;
    stderr: string;
}

/**
 * Handles the spawn of a child process, capturing its output and error.
 * @param childProcess The child process to handle.
 * @returns A promise that resolves to the spawn result.
 */
export default function handleSpawn(
    childProcess: ChildProcess,
): Promise<SpawnResult> {
    return new Promise((resolve, reject) => {
        let stderr = '';
        const onData = (chunk: Buffer) => {
            stderr += chunk.toString('utf8');
        };
        if (childProcess.stderr) {
            childProcess.stderr.on('data', onData);
        }
        const cleanup = () => {
            if (childProcess.stderr) {
                childProcess.stderr.removeListener('data', onData);
            }
        };
        childProcess.once('close', (code) => {
            cleanup();
            resolve({ code, stderr });
        });
        childProcess.once('error', (err: Error) => {
            cleanup();
            reject(err); // reject on fundamental spawn errors
        });
    });
}
