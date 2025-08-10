import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { runCode } from "./run-code";
import { supportedLanguages } from "./run-code/instructions";
import { info } from "./run-code/info";
import config from "./utils/config";
import { initializeContainerPool } from "./run-code/containerPoolManager";

import { ensureContainerProviderReady } from "./utils/containerProviderManager";

async function startUp() {
    try {
        console.log("Starting up the CodeXX API...");
        await ensureContainerProviderReady();
        initializeContainerPool();
    } catch (error: any) {
        console.error(`Fatal startup error: ${error.message}`);
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
            // Optionally log stack server-side:
            if (status >= 500) console.error('runCode error:', err);
            sendResponse(res, status, { error: message });
        }
    });

    app.get('/list', async (req: Request, res: Response) => {
        // Fetch info for all languages in parallel
        const body = await Promise.all(
            supportedLanguages.map(async (language: any) => ({
                language,
                info: await info(language),
            }))
        );

        sendResponse(res, 200, { supportedLanguages: body, version: config.version });
    });

    app.get('/status', (req: Request, res: Response) => {
        sendResponse(res, 200, null);
    });

    const server = app.listen(port, '0.0.0.0', () => {
        if(config.version < 1) console.warn("Warning: This is an in development version of the API. Please report any issues you find.");
        console.log(`API running at http://localhost:${port}\n\n`);
    });

    function gracefulShutdown(signal: string) {
        console.log(`\nReceived ${signal}, shutting down gracefully...`);
        server.close(() => {
            console.log('HTTP server closed. Exiting process.');
            process.exit(0);
        });
        // Optional: set a timeout to force exit if not closed in 10s
        setTimeout(() => {
            console.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000);
    }

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
})();