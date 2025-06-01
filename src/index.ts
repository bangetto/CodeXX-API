import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { runCode } from "./run-code";
import { supportedLanguages } from "./run-code/instructions";
import { info } from "./run-code/info";

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

app.listen(port, '0.0.0.0', () => {
    console.log(`Backend running at http://localhost:${port}`);
});