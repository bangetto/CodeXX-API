import { ChildProcess } from "child_process";

export default function handleSpawn(
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