import path from "path";
import fs from "fs/promises";
import {
    createWriteStream,
    existsSync
} from "fs";
import https from "https";

const ROOT_FOLDER = process.cwd();
const DOWNLOADS_FOLDER = path.resolve(ROOT_FOLDER, "downloads");
const URLS_FILE = path.resolve(ROOT_FOLDER, "urls.txt");

const ensureExists = async (filePath, isDirectory = true) => {
    try {
        if (isDirectory) {
            await fs.mkdir(filePath, {
                recursive: true
            });
        } else if (!existsSync(filePath)) {
            await fs.writeFile(filePath, "", "utf8");
        }
    } catch (error) {
        throw new Error(`Failed to ensure "${filePath}": ${error.message}`);
    }
};

const extractVideyURLs = (input) => {
    const regex = /https:\/\/videy\.co\/v\?id=([\w\d]+)/g;
    return [...input.matchAll(regex)].map((match) => ({
        id: match[1],
        url: `https://cdn.videy.co/${match[1]}.mp4`,
        filename: `${match[1]}.mp4`,
    }));
};

const downloadVideo = (url, filename) => {
    return new Promise((resolve, reject) => {
        const filePath = path.join(DOWNLOADS_FOLDER, filename);

        if (existsSync(filePath)) {
            resolve(`File "${filename}" already exists.`);
            return;
        }

        console.log(`Downloading: ${filename}`);
        const req = https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(`Failed to download "${filename}": ${response.statusMessage}`);
                return;
            }

            const writer = createWriteStream(filePath);
            response.pipe(writer);

            writer.on("finish", () => resolve(`Downloaded: ${filename}`));
            writer.on("error", (error) => reject(`Error writing file "${filename}": ${error.message}`));
        });

        req.on("error", (error) => reject(`Error downloading "${filename}": ${error.message}`));
    });
};

const cleanDownloadsFolder = async () => {
    console.log("Cleaning downloads folder...");
    const files = await fs.readdir(DOWNLOADS_FOLDER);
    await Promise.all(files.map((file) => fs.unlink(path.join(DOWNLOADS_FOLDER, file))));
    console.log("Downloads folder cleaned.");
};

const main = async () => {
    try {
        const args = process.argv.slice(2);

        await ensureExists(DOWNLOADS_FOLDER);
        await ensureExists(URLS_FILE, false);

        if (args.includes("--overwrite")) {
            await cleanDownloadsFolder();
        }

        const input = (await fs.readFile(URLS_FILE, "utf8")).trim();
        if (!input) throw new Error("'urls.txt' is empty. Add URLs and rerun the program.");

        const videos = extractVideyURLs(input);
        if (!videos.length) throw new Error("No valid URLs found in 'urls.txt'.");

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
                console.error(`Error processing "${filename}": ${error}`);
            }
        }

        console.log("All tasks completed.");
    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
};

main();