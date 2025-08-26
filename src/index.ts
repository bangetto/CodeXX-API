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

    const app = fastify().withTypeProvider<TypeBoxTypeProvider>();
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

    app.register(cors);

    


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
        try {
            const output = await runCode(request.body);
            const responsePayload = {
                ...output,
                timeStamp: Date.now(),
                status: 200
            };
            reply.status(200).send(responsePayload);

        } catch (err: unknown) {
            const status = (err as any)?.status ?? 500;
            const message = (err as any)?.message ?? 'Internal Server Error';
            if (status != 500) console.error('runCode error:', err);

            const errorPayload = {
                error: message,
                timeStamp: Date.now(),
                status: status
            };
            reply.status(status).send(errorPayload);
        }
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

        const payload = {
            supportedLanguages: listBody,
            version: config.version,
            timeStamp: Date.now(),
            status: 200
        };

        reply.status(200).send(payload);
    });

    app.get('/status', {
        schema: { response: {
            200: schemas.statusResponseSchema,
            500: schemas.ErrorResponseSchema,
        }}
    }, (request, reply) => {
        const payload = {
            uptime: process.uptime(),
            version: config.version,
            timeStamp: Date.now(),
            status: 200
        };
        reply.status(200).send(payload);
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
    process.on('SIGINT', async () => await gracefulShutdown('SIGINT'));
    process.on('SIGTERM', async () => await gracefulShutdown('SIGTERM'));
})();