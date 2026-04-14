import * as tar from "tar-stream";
import { Readable } from "stream";

export interface CreateTarStreamOptions {
    files: Record<string, string>;
}

export async function createTarStream(options: CreateTarStreamOptions): Promise<Readable> {
    const pack = tar.pack();
    const { files } = options;

    const entries = Object.entries(files);
    const uid = 1000;
    const gid = 1000;
    const entryPromises: Promise<void>[] = [];
    for (const [fileName, content] of entries) {
        const entryPromise = new Promise<void>((resolve, reject) => {
            pack.entry({ name: fileName, size: Buffer.byteLength(content), uid, gid }, content, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        entryPromises.push(entryPromise);
    }

    await Promise.all(entryPromises);

    pack.finalize();

    return pack as unknown as Readable;
}