import path from "path";
import fs from "fs/promises";
import {
    createWriteStream
} from "fs";
import https from "https";
import {
    fileURLToPath
} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOADS_FOLDER = path.join(__dirname, "downloads");
const URLS_FILE = path.join(__dirname, "urls.txt");
const MAX_RETRIES = 3;

const args = process.argv.slice(2);
const isSequential = args.includes("-s");
const isOverwrite = args.includes("-o");

const ensureExists = async (filePath, isDir = true) => {
    try {
        isDir ? await fs.mkdir(filePath, {
            recursive: true
        }) : await fs.writeFile(filePath, "", {
            flag: "wx"
        });
    } catch (error) {
        if (error.code !== "EEXIST") {
            console.error(`Error ensuring ${filePath} exists:`, error);
        }
    }
};

const clearDownloadsFolder = async () => {
    try {
        const files = await fs.readdir(DOWNLOADS_FOLDER);
        if (files.length === 0) {
            console.log("Downloads folder is already empty.");
            return;
        }

        console.log("Clearing downloads folder...");
        await Promise.all(files.map((file) => fs.unlink(path.join(DOWNLOADS_FOLDER, file))));
        console.log("Downloads folder cleared.");
    } catch (error) {
        console.error("Error clearing downloads folder:", error);
    }
};

const extractVideyURLs = (input) => [...input.matchAll(/https:\/\/videy\.co\/v\/?\?id=([\w\d]+)/g)].map(([_, id]) => ({
    url: `https://cdn.videy.co/${id}.mp4`,
    filename: `${id}.mp4`,
}));

const downloadVideo = async (url, filename, retries = MAX_RETRIES) => {
    const filePath = path.join(DOWNLOADS_FOLDER, filename);

    try {
        await fs.access(filePath);
        console.log(`File "${filename}" already exists. Skipping.`);
        return;
    } catch {
        console.log(`Downloading: ${filename}`);
    }

    return new Promise((resolve, reject) => {
        const fileStream = createWriteStream(filePath);
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                fileStream.close();
                fs.unlink(filePath).catch(() => {});
                return reject(`Failed to download "${filename}" (HTTP ${res.statusCode})`);
            }

            const totalBytes = parseInt(res.headers["content-length"], 10) || 0;
            let downloadedBytes = 0;
            let lastLoggedPercent = 0;

            res.pipe(fileStream);
            res.on("data", (chunk) => {
                downloadedBytes += chunk.length;
                if (totalBytes) {
                    const percent = Math.floor((downloadedBytes / totalBytes) * 100);
                    if (percent !== lastLoggedPercent) {
                        process.stdout.write(`\rDownloading ${filename}: ${percent}%`);
                        lastLoggedPercent = percent;
                    }
                }
            });

            fileStream.on("finish", () => {
                console.log(`\rDownload complete: ${filename}`);
                resolve();
            });

            fileStream.on("error", reject);
        }).on("error", (err) => {
            fileStream.close();
            fs.unlink(filePath).catch(() => {});

            if (retries > 0) {
                console.warn(`Retrying ${filename} (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})...`);
                setTimeout(() => downloadVideo(url, filename, retries - 1).then(resolve).catch(reject), 2000);
            } else {
                reject(`Failed to download "${filename}" after ${MAX_RETRIES} attempts.`);
            }
        });
    });
};

const downloadSequentially = async (videos) => {
    for (const {
            url,
            filename
        }
        of videos) {
        try {
            await downloadVideo(url, filename);
        } catch (error) {
            console.error(error);
        }
    }
};

const downloadConcurrently = async (videos) => {
    const results = await Promise.allSettled(videos.map(({
        url,
        filename
    }) => downloadVideo(url, filename)));
    const failedDownloads = results.filter(({
        status
    }) => status === "rejected").length;
    console.log(`All downloads completed. ${failedDownloads ? `${failedDownloads} download(s) failed.` : ""}`);
};

const main = async () => {
    await ensureExists(DOWNLOADS_FOLDER);
    await ensureExists(URLS_FILE, false);

    if (isOverwrite) {
        await clearDownloadsFolder();
    }

    let urls;
    try {
        urls = (await fs.readFile(URLS_FILE, "utf8")).trim();
    } catch (error) {
        return console.error(`Error reading URLs file:`, error);
    }

    if (!urls) return console.error("No URLs found in 'urls.txt'.");

    const videos = extractVideyURLs(urls);
    if (!videos.length) return console.error("No valid URLs found.");

    console.log(
        `Starting downloads for ${videos.length} video(s)... (Mode: ${isSequential ? "Sequential" : "Concurrent"}, Overwrite: ${isOverwrite ? "Yes" : "No"})`
    );

    if (isSequential) {
        await downloadSequentially(videos);
    } else {
        await downloadConcurrently(videos);
    }
};

main().catch(console.error);