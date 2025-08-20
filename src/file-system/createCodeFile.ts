import { v4 as getUUID } from "uuid";
import { promises as fsPromises } from "fs";
import { join } from "path";

const usrDir = process.env.USR_DIR || "./tmp";

export interface CreateCodeFileResult {
    fileName: string;
    dirPath: string;
    jobID: string;
}

export async function createCodeFile(language: string, code: string): Promise<CreateCodeFileResult> {
    const jobID = getUUID();
    const fileName = `main.${language}`;
    const dirPath = join(usrDir, jobID);
    await fsPromises.mkdir(dirPath, { recursive: true, mode: 0o700 });
    await fsPromises.writeFile(join(dirPath, fileName), code.toString(), { encoding: "utf8", mode: 0o600 });

    return {
        fileName,
        dirPath,
        jobID,
    };
};