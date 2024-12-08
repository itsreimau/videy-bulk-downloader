import axios from "axios";
import fs from "fs/promises";
import path from "path";
import ora from "ora";
import {
    createWriteStream,
    existsSync
} from "fs";
import {
    fileURLToPath
} from "url";
import yargs from "yargs";
import {
    hideBin
} from "yargs/helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOADS_FOLDER = path.resolve(__dirname, "downloads");
const URLS_FILE = path.resolve(__dirname, "urls.txt");

await fs.mkdir(DOWNLOADS_FOLDER, {
    recursive: true
});

/**
 * Extracts video URLs and filenames from a given input string.
 * @param {string} input - Input containing video URLs.
 * @returns {Array} Extracted video details.
 */
const extractVideyURLs = (input) => [...input.matchAll(/https?:\/\/videy\.co\/v\?id=([\w\d]+)/g)].map((match) => ({
    id: match[1],
    url: `https://cdn.videy.co/${match[1]}.mp4`,
    filename: `${match[1]}.mp4`,
}));

/**
 * Downloads a video file from a given URL.
 * @param {string} url - The video URL.
 * @param {string} filename - The name to save the video as.
 * @returns {Promise<string>} Status message.
 */
const downloadVideo = async (url, filename) => {
    const filePath = path.join(DOWNLOADS_FOLDER, filename);
    if (existsSync(filePath)) return `File "${filename}" already exists.`;

    const spinner = ora(`Downloading: ${filename}`).start();
    try {
        const response = await axios.get(url, {
            responseType: "stream"
        });
        const writer = createWriteStream(filePath);

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
        });

        spinner.succeed(`Downloaded: ${filename}`);
        return `Saved to: ${filePath}`;
    } catch (error) {
        spinner.fail(`Failed: ${filename}`);
        return `Error downloading "${filename}": ${error.message}`;
    }
};

/**
 * Cleans the downloads folder by deleting all files.
 */
const cleanDownloadsFolder = async () => {
    const spinner = ora("Cleaning downloads folder...").start();
    try {
        const files = await fs.readdir(DOWNLOADS_FOLDER);
        await Promise.all(files.map((file) => fs.unlink(path.join(DOWNLOADS_FOLDER, file))));
        spinner.succeed("Downloads folder cleaned.");
    } catch (error) {
        spinner.fail(`Failed to clean folder: ${error.message}`);
    }
};

/**
 * Main function to handle video downloading.
 */
const main = async () => {
    const {
        mode
    } = yargs(hideBin(process.argv))
        .option("mode", {
            alias: "m",
            choices: ["a", "o"],
            default: "a",
            describe: "Mode to handle downloads (a for add, o for overwrite)",
            coerce: (value) => (value === "a" ? "add" : "overwrite"),
        })
        .argv;

    try {
        if (!existsSync(URLS_FILE)) throw new Error("'urls.txt' not found. Add URLs and rerun.");
        const input = (await fs.readFile(URLS_FILE, "utf-8")).trim();
        if (!input) throw new Error("'urls.txt' is empty. Add URLs and rerun.");

        const videos = extractVideyURLs(input);
        if (!videos.length) throw new Error("No valid URLs found in 'urls.txt'.");

        if (mode === "overwrite") await cleanDownloadsFolder();

        console.log(`Processing ${videos.length} video(s)...`);

        const results = await Promise.allSettled(
            videos.map(({
                url,
                filename
            }) => downloadVideo(url, filename))
        );

        results.forEach((res, i) => {
            const message =
                res.status === "fulfilled" ? res.value : `Error: ${res.reason.message}`;
            console.log(`- Video ${i + 1}: ${message}`);
        });

        ora().succeed("All tasks completed.");
    } catch (error) {
        ora().fail(error.message);
    }
};

main().catch((err) => console.error("Fatal Error:", err.message));