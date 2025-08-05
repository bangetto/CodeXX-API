import { promises as fsPromises } from "fs";
import { join } from "path";

const usrDir = process.env.USR_DIR || "./tmp";

export async function removeCodeFile(uuid: string): Promise<void> {
    const codeDir = join(usrDir, uuid);

    try {
        await fsPromises.unlink(codeDir);
    } catch (err) {
        console.error(`Failed to delete code file: ${codeDir}`, err);
    }
};