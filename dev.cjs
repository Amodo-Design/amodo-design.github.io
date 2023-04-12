const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const os = require('os');
const crypto = require('crypto');

const MIN_WATCH_TIMEOUT_MS = 50;

function compileTSFile(tsFilePath) {
    const outFile = os.tmpdir() + path.sep + crypto.randomUUID() + ".tmp";
    esbuild.buildSync({ entryPoints: [tsFilePath], minify: false, bundle: true, outfile: outFile });
    const jsCode = fs.readFileSync(outFile, { encoding: "utf-8" });
    fs.rmSync(outFile);
    return jsCode;
}

function watchDir(dirName, onFileChanged) {
    let timeout = null;
    fs.watch(dirName, { recursive: true }, (event, filename) => {
        if (filename && !timeout) {
            const fullPath = dirName + path.sep + filename;
            setTimeout(() => onFileChanged(fullPath), 10); /* The timeout seems to fix a weird interplay between fs.watch and fs.readFile where readFile occasionally returns an empty string with no error. */
            timeout = setTimeout(() => timeout = null, MIN_WATCH_TIMEOUT_MS);
        }
    });
}

watchDir(".", file => {
    console.log(file + " changed");
    if (file === ".\\main.ts") {
        const compiledSource = compileTSFile(file);
        fs.writeFileSync(path.dirname(file) + "/deploy/main.js", compiledSource, { encoding: 'utf-8' });
    }
});

console.log("Watching for file changes...");