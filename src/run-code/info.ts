import { commandMap } from "./instructions";
import { exec as execCB } from "child_process";
import { getContainer, returnContainer } from "./containerPoolManager";
import config from "../utils/config";
import util from "util";

const exec = util.promisify(execCB);
let info: { [language: string]: string } = {};

async function getCompilerInfoFromNewContainer(language: string): Promise<string> {
    const containerName = `codexx-info-${language}`;
    const args = [
        'run', '-a', 'stdout', '-a', 'stderr',
        '--name', containerName,
        '--network=none', '-q',
        '--rm', `${language}-compile-run`,
        commandMap('', language).compilerInfoCommand
    ];
    const res = await exec(`${config.containerProvider} ${args.join(' ')}`);
    if (res.stderr && res.stderr.trim() !== '') {
        throw new Error(`Failed to get info for language ${language}: ${res.stderr}`);
    }
    return res.stdout.trim();
}

async function getLanguageInfo(language: string): Promise<[string, string]> {
    const container = getContainer(language);
    try {
        let result: string;
        if (!container) {
            result = await getCompilerInfoFromNewContainer(language);
        } else {
            const { compilerInfoCommand } = commandMap('', language);
            const execResult = await exec(`${config.containerProvider} exec ${container} ${compilerInfoCommand}`);
            if (execResult.stderr && execResult.stderr.trim() !== '') {
                throw new Error(execResult.stderr);
            }
            result = execResult.stdout.trim();
        }
        return [language, result];
    } finally {
        if (container) {
            await returnContainer(language, container);
        }
    }
}

export async function initInfo() {
    console.log("Initializing language info...");
    const languages = Object.keys(config.instructions);
    
    const promises = languages.map(language => getLanguageInfo(language));

    const results = await Promise.allSettled(promises);
    
    const errors: string[] = [];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            const [language, langInfo] = result.value;
            info[language] = langInfo;
        } else {
            errors.push(`  - ${languages[index]}: ${result.reason}`);
        }
    });

    if (errors.length > 0) {
        const errorMessages = errors.map(e => e.toString()).join('\n');
        throw new Error(`Failed to initialize info for some languages:\n${errorMessages}`);
    }

    console.log("Language info initialized.");
}

export default function getInfo(language: string): string {
    return info[language] || "Failed to get info";
}
