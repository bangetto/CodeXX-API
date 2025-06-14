import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { runCode } from "./run-code";
import { supportedLanguages } from "./run-code/instructions";
import { info } from "./run-code/info";
import config from "./utils/config";

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

const sendResponse = (res: Response, statusCode: number, body: any) => {
    const timeStamp = Date.now();

    res.status(statusCode).send({
        timeStamp,
        status: statusCode,
        ...body
    });
};


  

app.post("/", async (req: Request, res: Response) => {
    console.log(`Received request: ${req.method} ${req.url}`);
    console.log(`Request body: ${JSON.stringify(req.body, null, 2)}`);
    console.log('')
    try {
        const output = await runCode(req.body);
        sendResponse(res, 200, output);
    } catch (err: any) {
        sendResponse(res, err?.status || 500, err);
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

    sendResponse(res, 200, { supportedLanguages: body });
});

app.get('/version', (req: Request, res: Response) => {
    sendResponse(res, 200, {api: 'CodeXX' ,version: config.version});
});

app.listen(port, '0.0.0.0', () => {
    if(config.version < 1) console.warn("Warning: This is an in development version of the API. Please report any issues you find.");
    console.log(`API running at http://localhost:${port}\n\n`);
});