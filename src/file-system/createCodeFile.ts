import { v4 as getUUID } from "uuid";
import { promises as fsPromises } from "fs";
import { join } from "path";

const usrDir = process.env.USR_DIR || "/tmp";

export interface CreateCodeFileResult {
    fileName: string;
    filePath: string;
    jobID: string;
}

export async function createCodeFile(language: string, code: string): Promise<CreateCodeFileResult> {
    const jobID = getUUID();
    const fileName = `main.${language}`;
    const filePath = join(usrDir, jobID);
    await fsPromises.mkdir(filePath, { recursive: true });

    await fsPromises.writeFile(join(filePath, fileName), code.toString());

    return {
        fileName,
        filePath,
        jobID,
    };
};