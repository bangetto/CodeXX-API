import config from "./config";
import { spawn } from "child_process";

async function checkContainerProviderReadiness(): Promise<boolean> {
    return new Promise((resolve) => {
        let settled = false;
        const done = (ok: boolean) => {
            if (!settled) {
                settled = true;
                resolve(ok);
            }
        };
        const timeout = setTimeout(() => done(false), 5000); // avoid indefinite hang
        try {
            const child = spawn(config.containerProvider, ['info']);
            child.once('close', (code) => {
                clearTimeout(timeout);
                done(code === 0);
            });
            child.once('error', () => {
                clearTimeout(timeout);
                done(false);
            });
        } catch (err) {
            clearTimeout(timeout);
            console.error(
                "Failed to execute container provider info:",
                (err as Error).message
            );
            done(false);
        }
    });
}

async function attemptToStartContainerProvider(): Promise<boolean> {
    if (!config.containerProviderStartupCommand) {
        return false;
    }

    console.log("Container provider not detected. Attempting to start it...");

    return new Promise((resolve) => {
        const [command, ...args] = config.containerProviderStartupCommand!.split(' ');
        const child = spawn(command, args);
        let settled = false;

        child.once('close', (code) => {
            if (settled) return;
            if (code !== 0) {
                console.error(`The configured startup command failed with exit code ${code}.`);
                settled = true;
                return resolve(false);
            }
            // Give the service a moment to initialize after the command exits
            setTimeout(() => {
                if (!settled) {
                    settled = true;
                    resolve(true);
                }
            }, 3000);
        });

        child.once('error', (err) => {
            if (settled) return;
            console.error("Failed to execute the configured startup command:", err.message);
            settled = true;
            resolve(false);
        });
    });
}

export async function ensureContainerProviderReady(): Promise<void> {
    if (await checkContainerProviderReadiness()) {
        console.log("Container provider is ready.");
        return;
    }

    const startupAttempted = await attemptToStartContainerProvider();

    if (startupAttempted) {
        if (await checkContainerProviderReadiness()) {
            console.log("Container provider started successfully.");
            return;
        }
    }

    if (config.containerProviderStartupCommand) {
        throw new Error("Failed to start the container provider using the configured command. Please check your setup and ensure the command is correct.");
    } else {
        throw new Error("Container provider is not running, and no startup command is configured. Please start up your container provider (like Docker or Podman) manually and restart the application.");
    }
}
