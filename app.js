import path from "path";
import fs from "fs/promises";
import {
    fileURLToPath
} from "url";
import {
    createWriteStream,
    existsSync,
    writeFileSync
} from "fs";
import https from "https";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOADS_FOLDER = path.resolve(__dirname, "downloads");
const URLS_FILE = path.resolve(__dirname, "urls.txt");

await fs.mkdir(DOWNLOADS_FOLDER, {
    recursive: true
});

const extractVideyURLs = (input) => {
    const regex = /https?:\/\/videy\.co\/v\?id=([\w\d]+)/g;
    return [...input.matchAll(regex)].map((match) => ({
        id: match[1],
        url: `https://cdn.videy.co/${match[1]}.mp4`,
        filename: `${match[1]}.mp4`,
    }));
};

const downloadVideo = async (url, filename) => {
    const filePath = path.join(DOWNLOADS_FOLDER, filename);

    if (existsSync(filePath)) return `File "${filename}" already exists.`;

    console.log(`Downloading: ${filename}`);
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith("https") ? https : http;

        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download "${filename}": ${response.statusMessage}`));
                return;
            }

            const writer = createWriteStream(filePath);
            response.pipe(writer);

            writer.on("finish", () => {
                console.log(`Downloaded: ${filename}`);
                resolve(`Saved to: ${filePath}`);
            });

            writer.on("error", (error) => {
                reject(new Error(`Error writing file "${filename}": ${error.message}`));
            });
        }).on("error", (error) => {
            reject(new Error(`Error downloading "${filename}": ${error.message}`));
        });
    });
};

const cleanDownloadsFolder = async () => {
    console.log("Cleaning downloads folder...");
    try {
        const files = await fs.readdir(DOWNLOADS_FOLDER);
        await Promise.all(files.map((file) => fs.unlink(path.join(DOWNLOADS_FOLDER, file))));
        console.log("Downloads folder cleaned.");
    } catch (error) {
        console.error(`Failed to clean folder: ${error.message}`);
    }
};

const main = async () => {
    try {
        if (!existsSync(URLS_FILE)) {
            writeFileSync(URLS_FILE, "", "utf8");
            throw new Error(`'${URLS_FILE}' was created because it does not exist.`);
        }

        const input = (await fs.readFile(URLS_FILE, "utf-8")).trim();
        if (!input) throw new Error("'urls.txt' is empty. Add URLs and rerun.");

        const videos = extractVideyURLs(input);
        if (!videos.length) throw new Error("No valid URLs found in 'urls.txt'.");

        const mode = process.argv.includes(["--overwrite", "-o"]) ? "overwrite" : "add";
        if (mode === "overwrite") await cleanDownloadsFolder();

        console.log(`Processing ${videos.length} video(s)...`);
        for (const {
                url,
                filename
            }
            of videos) {
            try {
                const message = await downloadVideo(url, filename);
                console.log(message);
            } catch (error) {
                console.error(error.message);
            }
        }

        console.log("All tasks completed.");
    } catch (error) {
        console.error("Error:", error.message);
    }
};

main();