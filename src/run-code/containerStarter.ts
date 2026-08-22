import config, { getDefaultLimits } from "../utils/config";
import { spawn } from "child_process";
import { Readable } from "stream";
import handleSpawn from "../utils/handleSpawn";

export interface ContainerStarterOptions {
    containerName: string;
    image?: string;
    language?: string;
    dirPath?: string;
    useBaseImage?: boolean;
    useSecurityFlags?: boolean;
    memory?: number;
    pids?: number;
}

const BASE_IMAGE = "codexx-base:latest";

function buildSecurityArgs(options: ContainerStarterOptions): string[] {
    const args: string[] = [];

    if (options.useSecurityFlags !== false) {
        // skip --read-only since we need to write to /code
        args.push(
            '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges:true'
        );
    }
    return args;
}

function buildResourceLimitArgs(options: ContainerStarterOptions): string[] {
    const args: string[] = [];
    const defaults = getDefaultLimits();
    const memory = options.memory ?? defaults.memory;
    const pids = options.pids ?? defaults.pids;

    if (memory > 0) {
        args.push('--memory', `${memory}m`);
    }
    if (pids > 0) {
        args.push('--pids-limit', pids.toString());
    }
    return args;
}

function buildImageArg(options: ContainerStarterOptions): string {
    if (options.useBaseImage && options.image) {
        return options.image;
    }
    const langImage = options.language ? config.instructions[options.language]?.image : undefined;
    if (langImage) {
        return langImage;
    }
    return options.language || BASE_IMAGE;
}

export async function startContainer(options: ContainerStarterOptions): Promise<void> {
    const args = ['run', '-d', '--name', options.containerName];

    args.push(...buildSecurityArgs(options));
    args.push(...buildResourceLimitArgs(options));

    if (options.dirPath) {
        args.push('-v', `${options.dirPath}:/code`);
    } else {
        // Use container's existing /code directory (created in Dockerfile with appuser ownership)
        // No tmpfs needed - the image already has /code with correct permissions
    }

    args.push('--network=none');

    const image = buildImageArg(options);

    args.push(image);
    args.push('sleep', 'infinity');

    const container = spawn(config.containerProvider, args);
    await handleSpawn(container);
}

export async function copyToContainer(containerName: string, tarStream: Readable): Promise<void> {
    return new Promise((resolve, reject) => {
        // Extract as appuser - volume is owned by appuser
        const copyProcess = spawn(config.containerProvider, ['exec', '-i', containerName, 'sh', '-c', 'rm -rf /code/* && tar -xf - -C /code/']);

        let stderr = '';
        copyProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        tarStream.on('end', async () => {
            copyProcess.stdin.end();
        });

        tarStream.on('error', (err) => {
            copyProcess.kill();
            reject(err);
        });

        copyProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Failed to copy code file to container: ${stderr}`));
            } else {
                resolve();
            }
        });

        copyProcess.on('error', (err) => {
            reject(err);
        });

        tarStream.pipe(copyProcess.stdin, { end: true });
    });
}

export async function cleanupContainer(containerName: string, stopTimeout = 1): Promise<void> {
    await executeCommand(config.containerProvider, ['stop', '-t', stopTimeout.toString(), containerName]);
    await executeCommand(config.containerProvider, ['rm', containerName]);
}

async function executeCommand(cmd: string, args: string[]): Promise<void> {
    const process = spawn(cmd, args);
    await handleSpawn(process);
}
