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
    for (const [fileName, content] of entries) {
        pack.entry({ name: fileName, size: Buffer.byteLength(content), uid, gid }, content);
    }

    pack.finalize();

    return pack as unknown as Readable;
}