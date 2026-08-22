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
  max: ResourceLimit;
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

export function resolveLimits(requested?: Partial<ResourceLimit>): ResourceLimit {
  const defaults = getDefaultLimits();
  const max = config.containerLimits?.max ?? defaults;
  const mem = requested?.memory && requested.memory > 0 ? requested.memory : defaults.memory;
  const pids = requested?.pids && requested.pids > 0 ? requested.pids : defaults.pids;

  const memory = Math.min(mem, max.memory);
  const pidsResolved = Math.min(pids, max.pids);

  if (mem > max.memory || pids > max.pids) {
    console.warn(`Requested resource limits exceed configured max and were clamped (requested: memory=${mem}, pids=${pids}; max: memory=${max.memory}, pids=${max.pids})`);
  }

  return { memory, pids: pidsResolved };
}

export default config;
