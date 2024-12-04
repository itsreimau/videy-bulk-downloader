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

// Resolve __dirname equivalent in
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create "downloads" folder if it doesn't exist
const downloadsFolder = path.resolve(__dirname, "downloads");
await fs.mkdir(downloadsFolder, {
    recursive: true
});

// Function to download video
const downloadVideo = async (url, filename) => {
    const filePath = path.join(downloadsFolder, filename);

    // Check if the file already exists
    if (existsSync(filePath)) {
        return `File "${filename}" already exists, skipping download.`;
    }

    const spinner = ora(`Downloading ${filename}...`).start();

    try {
        const response = await axios({
            method: "get",
            url,
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
        spinner.fail(`Error downloading ${filename}: ${error.message}`);
        return `Error: ${error.message}`;
    }
};

// Function to extract valid Videy URLs
const extractVideyURLs = (input) => {
    const regex = /https?:\/\/videy\.co\/v\?id=([\w\d]+)/g;
    return Array.from(input.matchAll(regex), (match) => ({
        id: match[1],
        url: `https://cdn.videy.co/${match[1]}.mp4`,
        filename: `${match[1]}.mp4`
    }));
};

// Main function
const main = async () => {
    const spinner = ora("Starting...").start();
    const filePath = path.resolve(__dirname, "urls.txt");

    // Check if 'urls.txt' exists
    try {
        await fs.access(filePath);
    } catch {
        spinner.fail("'urls.txt' not found. Please create the file and add URLs.");
        return;
    }

    const input = (await fs.readFile(filePath, "utf-8")).trim();

    if (!input) {
        spinner.fail("'urls.txt' is empty. Please add URLs to the file.");
        return;
    }

    const videoList = extractVideyURLs(input);
    if (videoList.length === 0) {
        spinner.fail("No valid Videy URLs found in 'urls.txt'.");
        return;
    }

    spinner.info(`Found ${videoList.length} video(s). Starting download...\n`);

    // Download all videos in parallel
    const results = await Promise.allSettled(videoList.map(({
        url,
        filename
    }) => downloadVideo(url, filename)));

    console.log("\nDownload Summary:");
    results.forEach((result, index) => {
        const statusMessage = result.status === "fulfilled" ? result.value : result.reason;
        console.log(`- Video ${index + 1}: ${statusMessage}`);
    });

    spinner.succeed("All downloads complete.");
};

// Execute the script
main().catch((err) => console.error("Error:", err));