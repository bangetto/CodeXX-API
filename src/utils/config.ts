import configData from './../../config.json';

export interface Instruction {
    prewarmCount?: number;
    compileCodeCommand?: string;
    compilationArgs?: string[];
    executeCodeCommand: string;
    executionArgs?: string[];
    compilerInfoCommand: string;
}

export interface Config {
    version: number;
    instructions: {
        [language: string]: Instruction;
    };
    containerProvider: string;
}

const config: Config = configData;

export default config;
