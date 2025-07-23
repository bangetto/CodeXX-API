import { v4 as getUUID } from "uuid";
import { promises as fsPromises, existsSync, mkdirSync } from "fs";
import { join } from "path";

const CODES_DIR = process.env.CODES_DIR || "/tmp/codes";
const OUTPUTS_DIR = process.env.OUTPUTS_DIR || "/tmp/outputs";

if (!existsSync(CODES_DIR)) mkdirSync(CODES_DIR, { recursive: true });
if (!existsSync(OUTPUTS_DIR)) mkdirSync(OUTPUTS_DIR, { recursive: true });

export interface CreateCodeFileResult {
    fileName: string;
    filePath: string;
    jobID: string;
}

export async function createCodeFile(language: string, code: string): Promise<CreateCodeFileResult> {
    const jobID = getUUID();
    const fileName = `${jobID}.${language}`;
    const filePath = join(CODES_DIR, fileName);

    await fsPromises.writeFile(filePath, code.toString());

    return {
        fileName,
        filePath,
        jobID,
    };
};