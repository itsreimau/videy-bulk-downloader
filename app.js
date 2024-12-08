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

// Define constants
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOADS_FOLDER = path.resolve(__dirname, "downloads");
const URLS_FILE = path.resolve(__dirname, "urls.txt");

// Ensure the downloads folder exists
await fs.mkdir(DOWNLOADS_FOLDER, {
    recursive: true
});

/**
 * Extract video URLs and metadata from input text.
 * @param {string} input - The input text containing URLs.
 * @returns {Array} Array of objects containing video IDs, URLs, and filenames.
 */
const extractVideyURLs = (input) => [...input.matchAll(/https?:\/\/videy\.co\/v\?id=([\w\d]+)/g)].map((match) => ({
    id: match[1],
    url: `https://cdn.videy.co/${match[1]}.mp4`,
    filename: `${match[1]}.mp4`,
}));

/**
 * Download a video file from a given URL.
 * @param {string} url - The video URL.
 * @param {string} filename - The name of the file to save.
 * @returns {Promise<string>} The result message.
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

        // Pipe the response data to the file
        response.data.pipe(writer);

        // Wait until the file is written
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
 * Clean all files in the downloads folder.
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
 * Main function to handle command-line arguments and execute the script.
 */
const main = async () => {
    const {
        mode
    } = yargs(hideBin(process.argv))
        .option("mode", {
            alias: "m",
            choices: ["add", "overwrite"],
            demandOption: true,
            describe: "Mode to handle downloads (add or overwrite existing files)",
        })
        .argv;

    try {
        // Check if the URLs file exists and is not empty
        if (!existsSync(URLS_FILE)) throw new Error("'urls.txt' not found. Add URLs and rerun.");
        const input = (await fs.readFile(URLS_FILE, "utf-8")).trim();
        if (!input) throw new Error("'urls.txt' is empty. Add URLs and rerun.");

        // Extract video URLs and metadata
        const videos = extractVideyURLs(input);
        if (!videos.length) throw new Error("No valid URLs found in 'urls.txt'.");

        // Clean downloads folder if overwrite mode is selected
        if (mode === "overwrite") await cleanDownloadsFolder();

        console.log(`Processing ${videos.length} video(s)...`);

        // Download videos concurrently
        const results = await Promise.allSettled(
            videos.map(({
                url,
                filename
            }) => downloadVideo(url, filename))
        );

        // Log the results of each download
        results.forEach((res, i) => {
            const message =
                res.status === "fulfilled" ?
                res.value :
                `Error: ${res.reason.message}`;
            console.log(`- Video ${i + 1}: ${message}`);
        });

        ora().succeed("All tasks completed.");
    } catch (error) {
        ora().fail(error.message);
    }
};

// Run the script
main().catch((err) => console.error("Fatal Error:", err.message));