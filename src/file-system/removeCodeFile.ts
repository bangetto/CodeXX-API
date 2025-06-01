import { unlinkSync } from "fs";
import { join } from "path";

const CODES_DIR = process.env.CODES_DIR || "/tmp/codes";
const OUTPUTS_DIR = process.env.OUTPUTS_DIR || "/tmp/outputs";

export const removeCodeFile = (uuid: string, lang: string, outputExt?: string): void => {
    const codeFile = join(CODES_DIR, `${uuid}.${lang}`);
    const outputFile = outputExt ? join(OUTPUTS_DIR, `${uuid}.${outputExt}`) : undefined;

    try {
        unlinkSync(codeFile);
    } catch (err) {
        console.error(`Failed to delete code file: ${codeFile}`, err);
    }

    if (outputFile) {
        try {
            unlinkSync(outputFile);
        } catch (err) {
            console.error(`Failed to delete output file: ${outputFile}`, err);
        }
    }
};