import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { runCode } from "./run-code";
import { supportedLanguages } from "./run-code/instructions";
import info, { initInfo } from "./run-code/info";
import config from "./utils/config";
import { initializeContainerPool, cleanupContainerPool } from "./run-code/containerPoolManager";
import { ensureContainerProviderReady } from "./utils/containerProviderManager";

async function startUp() {
    try {
        console.log("Starting up the CodeXX API...");
        await ensureContainerProviderReady();
        await initializeContainerPool();
        await initInfo();
    } catch (error: any) {
        console.error(`Fatal startup error: ${error.message}`);
        console.info("\nEnsure that you configured everything correctly, if you are unsure, please visit the wiki: https://github.com/bangetto/CodeXX-API/wiki");
        console.info("If you are still having issues, please open an issue on GitHub: https://github.com/bangetto/CodeXX-API/issues");
        console.error("\nCleaning up container pool before exiting...");
        await cleanupContainerPool();
        console.error("Exiting...");
        process.exit(1);
    }
}
(async () => {
    await startUp();

    const app = express();
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(cors());

    const sendResponse = (res: Response, statusCode: number, body: any) => {
        const timeStamp = Date.now();

        res.status(statusCode).send({
            ...body,
            timeStamp,
            status: statusCode,
        });
    };


    app.post("/", async (req: Request, res: Response) => {
        console.log(`Received request with language: ${req.body.language}`);
        try {
            const output = await runCode(req.body);
            sendResponse(res, 200, output);
        } catch (err: unknown) {
            const status = (err as any)?.status ?? 500;
            const message = (err as any)?.message ?? 'Internal Server Error';
            // log stack server-side:
            if (status != 500) console.error('runCode error:', err);
            sendResponse(res, status, { error: message });
        }
    });

    app.get('/list', async (req: Request, res: Response) => {
        // Fetch info for all languages in parallel
        const body = await Promise.all(
            supportedLanguages.map(async (language: string) => ({
                language,
                info: info(language),
            }))
        );

        sendResponse(res, 200, { supportedLanguages: body, version: config.version });
    });

    app.get('/status', (req: Request, res: Response) => {
        sendResponse(res, 200, {
            uptime: process.uptime(),
            version: config.version
        });
    });

    const server = app.listen(port, '0.0.0.0', () => {
        console.log();
        if(config.version < 1) console.warn("Warning: This is an in development version of the API. Please report any issues you find.");
        console.log(`API running at http://localhost:${port}\n`);
    });

    async function gracefulShutdown(signal: string) {
        console.log(`\nReceived ${signal}, shutting down gracefully...`);
        const forceExitTimer = setTimeout(() => {
            console.error('Could not close connections in time, forcefully shutting down');
            cleanupContainerPool().catch(err => {
                console.error('Error during forced container pool cleanup:', err);
            });
            process.exit(1);
        }, 30000);
        try {
            await new Promise<void>((resolve, reject) => {
                server.close(err => {
                    if (err) return reject(err);
                    console.log('HTTP server closed.');
                    resolve();
                });
            });
            await cleanupContainerPool();
            console.log('Proceeding with exit...');
            clearTimeout(forceExitTimer);
            process.exit(0);
        } catch (err) {
            console.error('Error during graceful shutdown:', err);
            clearTimeout(forceExitTimer);
            process.exit(1);
        }
    }
    process.on('SIGINT', async () => await gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
})();