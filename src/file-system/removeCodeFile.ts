import { promises as fsPromises } from "fs";
import { join } from "path";

const CODES_DIR = process.env.CODES_DIR || "/tmp/codes";
const OUTPUTS_DIR = process.env.OUTPUTS_DIR || "/tmp/outputs";

export async function removeCodeFile(uuid: string, lang: string, outputExt?: string): Promise<void> {
    const codeFile = join(CODES_DIR, `${uuid}.${lang}`);
    const outputFile = outputExt ? join(OUTPUTS_DIR, `${uuid}.${outputExt}`) : undefined;

    try {
        await fsPromises.unlink(codeFile);
    } catch (err) {
        console.error(`Failed to delete code file: ${codeFile}`, err);
    }

    if (outputFile) {
        try {
            await fsPromises.unlink(outputFile);
        } catch (err) {
            console.error(`Failed to delete output file: ${outputFile}`, err);
        }
    }
};