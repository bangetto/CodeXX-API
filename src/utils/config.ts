import configData from './../../config.json';

export interface Instruction {
    preWarmCount?: number;
    compileCodeCommand?: string;
    compilationArgs?: string[];
    executeCodeCommand: string;
    executionArgs?: string[];
    compilerInfoCommand: string;
    image?: string;
}

export interface ResourceLimit {
    memory: number;
    pids: number;
}

export interface ContainerLimits {
  default: ResourceLimit;
}

export interface Config {
    version: number;
    instructions: {
        [language: string]: Instruction;
    };
    containerProvider: string;
    containerProviderStartupCommand?: string;
    containerLimits?: ContainerLimits;
}

/** The configuration object loaded from the config.json file. */
const config: Config = configData;

export function getDefaultLimits(): ResourceLimit {
    return {
        memory: config.containerLimits?.default?.memory ?? 256,
        pids: config.containerLimits?.default?.pids ?? 64
    };
}

export function resolveLimits(): ResourceLimit {
  return getDefaultLimits();
}

export default config;
