import axios from "axios";
import fs from "fs/promises";
import path from "path";
import ora from "ora";
import readline from "readline";
import {
    createWriteStream,
    existsSync
} from "fs";
import {
    fileURLToPath
} from "url";

// Resolve __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure "downloads" folder exists
const downloadsFolder = path.resolve(__dirname, "downloads");
await fs.mkdir(downloadsFolder, {
    recursive: true
});

// Function to download video
const downloadVideo = async (url, filename) => {
    const filePath = path.join(downloadsFolder, filename);

    if (existsSync(filePath)) {
        return `File "${filename}" already exists, skipping download.`;
    }

    const spinner = ora(`Downloading ${filename}...`).start();
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
        spinner.fail(`Error downloading ${filename}: ${error.message}`);
        return `Error: ${error.message}`;
    }
};

// Function to extract Videy URLs
const extractVideyURLs = (input) => {
    const regex = /https?:\/\/videy\.co\/v\?id=([\w\d]+)/g;

    return Array.from(input.matchAll(regex), (match) => ({
        id: match[1],
        url: `https://cdn.videy.co/${match[1]}.mp4`,
        filename: `${match[1]}.mp4`,
    }));
};

// Function to prompt user input
const promptUser = (query) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => rl.question(query, (answer) => {
        rl.close();
        resolve(answer.trim());
    }));
};

// Function to clean the downloads folder
const cleanDownloadsFolder = async () => {
    const spinner = ora("Cleaning 'downloads' folder...").start();

    try {
        const files = await fs.readdir(downloadsFolder);
        await Promise.all(files.map((file) => fs.unlink(path.join(downloadsFolder, file))));
        spinner.succeed("Old files deleted.");
    } catch (error) {
        spinner.fail(`Failed to clean 'downloads' folder: ${error.message}`);
    }
};

// Main function
const main = async () => {
    const spinner = ora("Starting...").start();
    const filePath = path.resolve(__dirname, "urls.txt");

    try {
        await fs.access(filePath);
    } catch {
        spinner.info("'urls.txt' not found. Creating file...");
        await fs.writeFile(filePath, "", "utf-8");
        spinner.fail("Please add Videy URLs to 'urls.txt' and run the script again.");
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

    spinner.info(`Found ${videoList.length} video(s).`);

    const mode = await promptUser("Do you want to (A)dd new videos or (T)runcate downloads folder and start fresh? (A/T): ");
    if (mode.toLowerCase() === "t") {
        await cleanDownloadsFolder();
    } else if (mode.toLowerCase() !== "a") {
        console.error("Invalid option. Please choose either 'A' or 'T'.");
        return;
    }

    spinner.info("Starting downloads...\n");

    const results = await Promise.allSettled(videoList.map(({
        url,
        filename
    }) => downloadVideo(url, filename)));

    console.log("\nDownload Summary:");
    results.forEach((result, index) => {
        const statusMessage = result.status === "fulfilled" ? result.value : `Error: ${result.reason}`;
        console.log(`- Video ${index + 1}: ${statusMessage}`);
    });

    spinner.succeed("All downloads complete.");
};

// Execute the script
main().catch((err) => console.error("Error:", err.message));