import { join } from "path";
import config from "../utils/config";

const CODES_DIR = process.env.CODES_DIR || "/tmp/codes";
const OUTPUTS_DIR = process.env.OUTPUTS_DIR || "/tmp/outputs";

export interface CommandMapResult {
    compileCodeCommand?: string;
    compilationArgs?: string[];
    executeCodeCommand: string;
    executionArgs?: string[];
    outputExt?: string;
    compilerInfoCommand: string;
}

type Instruction = typeof config.instructions[number] & {
    executionArgs?: string[];
};

const instructionMap: Record<string, Instruction> = {};
for (const instr of config.instructions) {
    instructionMap[instr.language] = instr;
}

export function commandMap(jobID: string, language: string): CommandMapResult {
    const instr = instructionMap[language];
    if (!instr) throw new Error(`Unsupported language: ${language}`);

    // Replace template variables in commands/args
    const replaceVars = (val: string) =>
        val.replace(/\$\{CODES_DIR\}/g, CODES_DIR)
           .replace(/\$\{OUTPUTS_DIR\}/g, OUTPUTS_DIR)
           .replace(/\$\{jobID\}/g, jobID);

    return {
        compileCodeCommand: instr.compileCodeCommand,
        compilationArgs: instr.compilationArgs?.map(replaceVars),
        executeCodeCommand: replaceVars(instr.executeCodeCommand),
        executionArgs: instr.executionArgs?.map(replaceVars),
        outputExt: instr.outputExt,
        compilerInfoCommand: instr.compilerInfoCommand
    };
}

export const supportedLanguages = config.instructions.map((i: { language: any; }) => i.language);