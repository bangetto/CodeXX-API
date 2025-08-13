import config from "./config";
import { spawn } from "child_process";

const readinessTimeout = 5000; // 5 seconds

async function checkContainerProviderReadiness(): Promise<boolean> {
    return new Promise((resolve) => {
        let settled = false;
        const done = (ok: boolean) => {
            if (!settled) {
                settled = true;
                resolve(ok);
            }
        };
        const timeout = setTimeout(() => done(false), readinessTimeout); // avoid indefinite hang
        try {
            const child = spawn(config.containerProvider, ['info']);
            const killTimer = setTimeout(() => {
                child.kill('SIGTERM');
                done(false);
            }, readinessTimeout); // avoid indefinite hang

            child.once('close', (code) => {
                clearTimeout(killTimer);
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
    return new Promise((resolve) => {
        // dirrectly use command from config
        const child = spawn(config.containerProviderStartupCommand!, { shell: true });
        let settled = false;

        // 30 second timeout for startup
        const timeout = setTimeout(() => {
            if (!settled) {
                child.kill('SIGTERM');
                settled = true;
                console.error('Container provider startup command timed out');
                resolve(false);
            }
        }, 30000);

        child.once('close', (code) => {
            if (settled) return;
            clearTimeout(timeout);

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
            }, 6000);
        });

        child.once('error', (err) => {
            if (settled) return;
                clearTimeout(timeout);
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
