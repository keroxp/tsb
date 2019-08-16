"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = require("node-fetch");
const url_1 = require("url");
const cacheDir = require("cachedir");
const path = require("path");
const fs = require("fs-extra");
const colors_1 = require("colors");
function urlToCacheFilePath(url, cacheDirectory) {
    const u = new url_1.URL(url);
    if (!u.protocol.match(/^https?/)) {
        throw new Error("url must start with https?:" + url);
    }
    const scheme = u.protocol.startsWith("https") ? "https" : "http";
    return path.join(cacheDirectory, "deps", scheme, u.host, u.pathname);
}
exports.urlToCacheFilePath = urlToCacheFilePath;
const kAcceptableMimeTypes = [
    "text/plain",
    "application/javascript",
    "text/javascript",
    "application/typescript",
    "text/typescript"
];
function fetchModule(url, cacheDirectory) {
    return __awaiter(this, void 0, void 0, function* () {
        console.error(`${colors_1.green("Download")} ${url}`);
        const resp = yield node_fetch_1.default(url, {
            method: "GET",
            redirect: "manual"
        });
        const dest = urlToCacheFilePath(url, cacheDirectory || cacheDir("tsb"));
        yield fs.ensureDir(path.dirname(dest));
        if (400 <= resp.status) {
            throw new Error(`fetch failed with status code ${resp.status}`);
        }
        if (200 <= resp.status && resp.status < 300) {
            const contentType = resp.headers.get("content-type") || "";
            if (!kAcceptableMimeTypes.some(v => contentType.startsWith(v))) {
                throw new Error(`unacceptable content-type for ${url}: ${contentType} `);
            }
            yield Promise.all([
                // TODO: pipe body stream
                fs.writeFile(dest, yield resp.text()),
                fs.writeFile(dest + ".headers.json", JSON.stringify({ mime_type: contentType }))
            ]);
        }
        else if (300 <= resp.status) {
            const redirect_to = resp.headers.get("location");
            yield fs.writeFile(dest + ".headers.json", JSON.stringify({ redirect_to }));
            return fetchModule(redirect_to, cacheDirectory);
        }
    });
}
exports.fetchModule = fetchModule;
