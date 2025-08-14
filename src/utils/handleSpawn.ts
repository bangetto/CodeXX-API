import type { ChildProcess } from "child_process";

export default function handleSpawn(
    childProcess: ChildProcess,
    rejectionValue: (stderr: string, code: number | null) => unknown
): Promise<void> {
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
            if (code === 0) {
                cleanup();
                resolve();
            } else {
                const rejection = rejectionValue(stderr, code);
                cleanup();
                reject(rejection instanceof Error ? rejection : new Error(String(rejection)));
            }
        });
        childProcess.once('error', (err: Error) => {
            cleanup();
            reject(err);
        });
    });
}