import fastify from "fastify";
import cors from "@fastify/cors";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { runCode } from "./run-code";
import { supportedLanguages } from "./run-code/instructions";
import info, { initInfo } from "./run-code/info";
import config from "./utils/config";
import { initializeContainerPool, cleanupContainerPool } from "./run-code/containerPoolManager";
import { ensureContainerProviderReady } from "./utils/containerProviderManager";
import * as schemas from "./utils/schemas";

async function startUp() {
    try {
        console.log("Starting up the CodeXX API...");
        await ensureContainerProviderReady();
        await initializeContainerPool();
        await initInfo();
    } catch (error) {
        console.error(`Fatal startup error: ${(error as Error).message || error}`);
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

    const app = fastify().withTypeProvider<TypeBoxTypeProvider>();
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    app.register(cors);

    app.addHook('preSerialization', async (request, reply, payload: Record<string, unknown>) => {
        return {
            ...payload,
            timeStamp: Date.now(),
            status: reply.statusCode
        };
    });

    interface FastifyError extends Error {
    statusCode?: number;
    status?: number;
    error?: string;
}

app.setErrorHandler((error: FastifyError, request, reply) => {
        const statusCode = error.statusCode ?? error.status ?? 500;
        if (400 <= statusCode && statusCode < 500) {
            // Client error
            reply.status(statusCode).send({
                error: error.message || error.error || error.toString() || "Client error"
            });
        } else {
            // Server error
            console.error("Unhandled error:", error);
            reply.status(500).send({ error: "Internal server error" });
        }
    });

    app.post("/",{
        schema: {
            body: schemas.RunCodeBodySchema,
            response: {
                200: schemas.SuccessResponseSchema,
                400: schemas.ErrorResponseSchema,
                500: schemas.ErrorResponseSchema,
            },
        }
    }, async (request, reply) => {
        const output = await runCode(request.body);
        return output;
    });

    app.get('/list', {
        schema: { response: {
            200: schemas.ListResponseSchema,
            500: schemas.ErrorResponseSchema,
        }}
    }, (request, reply) => {
        let listBody: { [language: string]: { info: string } } = {};
        for(const language of supportedLanguages) {
            listBody[language] = { info: info(language) };
        }

        return {
            supportedLanguages: listBody,
            version: config.version,
        };
    });

    app.get('/status', {
        schema: { response: {
            200: schemas.statusResponseSchema,
            500: schemas.ErrorResponseSchema,
        }}
    }, (request, reply) => {
        return {
            uptime: process.uptime(),
            version: config.version,
        };
    });

    try {
        await app.listen({port, host: '0.0.0.0'});
        if(config.version < 1) console.warn("Warning: This is an in development version of the API. Please report any issues you find.");
        console.log(`API running at http://localhost:${port}\n`);
    } catch (err) {
        console.error(err);
        await cleanupContainerPool();
        process.exit(1);
    }

    let isShuttingDown = false;
    async function gracefulShutdown(signal: string) {
        // Guard against multiple concurrent shutdowns
        if (isShuttingDown) {
            console.log('Shutdown already in progress, ignoring signal');
            return;
        }
        isShuttingDown = true;
        
        // Remove signal handlers to prevent re-triggering
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        
        console.log(`\nReceived ${signal}, shutting down gracefully...`);
        const forceExitTimer = setTimeout(() => {
            console.error('Could not close connections in time, forcefully shutting down');
            cleanupContainerPool().catch(err => {
                console.error('Error during forced container pool cleanup:', err);
            });
            process.exit(1);
        }, 30000);
        try {
            await app.close();
            console.log("Http server closed.");
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
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
})();