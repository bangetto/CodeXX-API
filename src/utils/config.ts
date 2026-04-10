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

export interface SecurityConfig {
    uid: number;
    gid: number;
}

export interface Config {
    version: number;
    instructions: {
        [language: string]: Instruction;
    };
    containerProvider: string;
    containerProviderStartupCommand?: string;
    security?: SecurityConfig;
}

const config: Config = configData;

export default config;
