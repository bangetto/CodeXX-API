import { commandMap } from "./instructions";
import util from "util";
import { exec as execCb } from "child_process";

const exec = util.promisify(execCb);

export async function info(language: string): Promise<string> {
    const { compilerInfoCommand } = commandMap('', language);
    const { stdout } = await exec(compilerInfoCommand);
    return stdout;
}