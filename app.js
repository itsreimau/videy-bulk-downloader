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

const ensureExists = async (filePath, isDir = true) => {
    try {
        isDir ? await fs.mkdir(filePath, {
            recursive: true
        }) : await fs.writeFile(filePath, "", {
            flag: "wx"
        });
    } catch {}
};

const extractVideyURLs = (input) => [...input.matchAll(/https:\/\/videy\.co\/v\?id=([\w\d]+)/g)].map(([_, id]) => ({
    url: `https://cdn.videy.co/${id}.mp4`,
    filename: `${id}.mp4`,
}));

const downloadVideo = (url, filename) =>
    new Promise((resolve, reject) => {
        const filePath = path.join(DOWNLOADS_FOLDER, filename);
        fs.access(filePath)
            .then(() => {
                console.log(`File "${filename}" already exists. Skipping.`);
                resolve();
            })
            .catch(() => {
                console.log(`Downloading: ${filename}`);
                const fileStream = createWriteStream(filePath);

                https.get(url, (res) => {
                    if (res.statusCode !== 200) return reject(`Failed to download "${filename}"`);

                    const totalBytes = parseInt(res.headers["content-length"], 10) || 0;
                    let downloadedBytes = 0,
                        lastLoggedPercent = 0;

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
                        console.log(`\rDownloaded: ${filename} ✔`);
                        resolve();
                    });

                    fileStream.on("error", reject);
                }).on("error", reject);
            });
    });

const main = async () => {
    await ensureExists(DOWNLOADS_FOLDER);
    await ensureExists(URLS_FILE, false);

    const urls = (await fs.readFile(URLS_FILE, "utf8")).trim();
    if (!urls) return console.error("No URLs found in 'urls.txt'.");

    const videos = extractVideyURLs(urls);
    if (!videos.length) return console.error("No valid URLs found.");

    console.log(`Downloading ${videos.length} video(s)...`);
    await Promise.allSettled(videos.map(({
        url,
        filename
    }) => downloadVideo(url, filename)));

    console.log("All downloads completed.");
};

main().catch(console.error);