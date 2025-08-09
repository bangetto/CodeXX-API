import config from "../utils/config";

export interface CommandMapResult {
    compileCodeCommand?: string;
    compilationArgs?: string[];
    executeCodeCommand: string;
    executionArgs?: string[];
    compilerInfoCommand: string;
}

export function commandMap(jobID: string, language: string): CommandMapResult {
    const instr = config.instructions[language];
    if (!instr) throw new Error(`Unsupported language: ${language}`);

    // Replace template variables in commands/args
    const replaceVars = (val: string) =>
        val.replace(/\${jobID}/g, jobID);

    return {
        compileCodeCommand: instr.compileCodeCommand,
        compilationArgs: instr.compilationArgs?.map(replaceVars),
        executeCodeCommand: replaceVars(instr.executeCodeCommand),
        executionArgs: instr.executionArgs?.map(replaceVars),
        compilerInfoCommand: instr.compilerInfoCommand
    };
}

export const supportedLanguages = Object.keys(config.instructions);
