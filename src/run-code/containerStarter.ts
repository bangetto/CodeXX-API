import config from "../utils/config";
import { spawn } from "child_process";
import handleSpawn from "../utils/handleSpawn";

export interface ContainerStarterOptions {
    containerName: string;
    image?: string;
    language?: string;
    dirPath?: string;
    useBaseImage?: boolean;
    useSecurityFlags?: boolean;
    uid?: number;
    gid?: number;
}

const BASE_IMAGE = "codexx-base:latest";

function buildSecurityArgs(options: ContainerStarterOptions): string[] {
    const args: string[] = [];
    const uid = options.uid ?? config.security?.uid ?? 1000;
    const gid = options.gid ?? config.security?.gid ?? 1000;

    if (options.useSecurityFlags !== false) {
        args.push(
            '--user', `${uid}:${gid}`,
            '--read-only',
            '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges:true'
        );
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
    return options.language || "alpine";
}

export async function startContainer(options: ContainerStarterOptions): Promise<void> {
    const args = ['run', '-d', '--name', options.containerName];

    args.push(...buildSecurityArgs(options));

    if (options.dirPath) {
        args.push('-v', `${options.dirPath}:/code`);
    }

    args.push('--network=none');

    const image = buildImageArg(options);

    args.push(image);
    args.push('sleep', 'infinity');

    const container = spawn(config.containerProvider, args);
    await handleSpawn(container);
}

export async function copyToContainer(containerName: string, sourcePath: string): Promise<void> {
    const copyProcess = spawn(config.containerProvider, ['cp', `${sourcePath}/.`, `${containerName}:/code/`]);
    const { code, stderr } = await handleSpawn(copyProcess);
    if (code !== 0) {
        throw new Error(`Failed to copy code file to container: ${stderr}`);
    }
}

export async function cleanupContainer(containerName: string, stopTimeout = 1): Promise<void> {
    await executeCommand(config.containerProvider, ['stop', '-t', stopTimeout.toString(), containerName]);
    await executeCommand(config.containerProvider, ['rm', containerName]);
}

async function executeCommand(cmd: string, args: string[]): Promise<void> {
    const process = spawn(cmd, args);
    await handleSpawn(process);
}