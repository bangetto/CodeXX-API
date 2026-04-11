import config from "../utils/config";
import { spawn } from "child_process";
import handleSpawn from "../utils/handleSpawn";
import { ensureContainerProviderReady } from "../utils/containerProviderManager";
import * as path from "path";

const SANDBOX_DIR = "sandboxes";

async function checkDependencies() {
    if (!config.containerProvider) console.error("Container provider is not configured in config.json");
    else ensureContainerProviderReady().catch(err => {
        console.error("Container provider is not ready:", err.message);
    });
}

async function buildBaseImage() {
    console.log("Building base image...");
    try {
        const baseDockerfile = path.join(SANDBOX_DIR, "base.Dockerfile");
        const buildProcess = spawn(config.containerProvider, ["build", "-t", "codexx-base:latest", "-f", baseDockerfile, SANDBOX_DIR]);
        await handleSpawn(buildProcess);
        console.log("Successfully built base image");
    } catch (error) {
        console.error("Error building base image:", error);
    }
}

async function buildContainerImages() {
    await buildBaseImage();

    for (const language of Object.keys(config.instructions)) {
        const instruction = config.instructions[language];
        const imageName = instruction.image;

        if (!imageName) {
            console.error(`No image specified for ${language} in config.json`);
            continue;
        }

        console.log(`Building container image for ${language}...`);

        try {
            const dockerfile = `${language}.Dockerfile`;
            const buildProcess = spawn(config.containerProvider, ["build", "-t", imageName, "-f", dockerfile, SANDBOX_DIR]);
            const { code, stderr } = await handleSpawn(buildProcess);
            if (code === 0) {
                console.log(`Successfully built container image for ${language}: ${imageName}`);
            } else {
                console.error(`Error building container image for ${language}:`, stderr);
            }
        } catch (error) {
            console.error(`Error building container image for ${language}:`, error);
        }
    }
}

export { buildContainerImages, buildBaseImage, checkDependencies };

buildContainerImages();