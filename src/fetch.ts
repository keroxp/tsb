import { default as fetch } from "node-fetch";
import { URL } from "url";
import * as cachdir from "cachedir";
import * as path from "path";
import * as fs from "fs-extra";
import { green } from "colors";
import * as crypto from "crypto";

const cacheDirectory = cachdir("tsb");

export function urlToCacheFilePath(url: string): string {
  const u = new URL(url);
  if (!u.protocol.match(/^https?/)) {
    throw new Error("url must start with https?:" + url);
  }
  const fullPath = u.pathname + u.search;
  const scheme = u.protocol.startsWith("https") ? "https" : "http";
  const sha256 = crypto.createHash("sha256");
  sha256.update(fullPath);
  const fullPathHash = sha256.digest("hex");
  // ~/Library/Caches/tsb/https/deno.land/{sha256hashOfUrl}
  return path.join(cacheDirectory, scheme, u.host, fullPathHash);
}

export function urlToCacheMetaFilePath(url: string): string {
  // ~/Library/Caches/tsb/https/deno.land/{sha256hashOfUrl}.meta.json
  return urlToCacheFilePath(url) + ".meta.json";
}

export type CacheFileMetadata = {
  redirectTo?: string;
  mimeType?: string;
  originalPath: string;
};

async function saveMetaFile(
  url: string,
  meta: CacheFileMetadata
): Promise<void> {
  const dest = urlToCacheMetaFilePath(url);
  await fs.writeFile(dest, JSON.stringify(meta));
}

const kAcceptableMimeTypes = [
  "text/plain",
  "application/javascript",
  "text/javascript",
  "application/typescript",
  "text/typescript"
];

export async function fetchModule(url: string): Promise<void> {
  const u = new URL(url);
  const originalPath = u.pathname + u.search;
  const dest = urlToCacheFilePath(url);
  console.error(`${green("Download")} ${url}`);
  const resp = await fetch(url, {
    method: "GET",
    redirect: "manual"
  });
  const dir = path.dirname(dest);
  if (!(await fs.pathExists(dir))) {
    await fs.ensureDir(dir);
  }
  if (400 <= resp.status) {
    throw new Error(`fetch failed with status code ${resp.status}`);
  }
  if (200 <= resp.status && resp.status < 300) {
    const contentType = resp.headers.get("content-type") || "";
    if (!kAcceptableMimeTypes.some(v => contentType.startsWith(v))) {
      throw new Error(`unacceptable content-type for ${url}: ${contentType} `);
    }
    await Promise.all([
      // TODO: pipe body stream
      fs.writeFile(dest, await resp.text()),
      saveMetaFile(url, { mimeType: contentType, originalPath })
    ]);
  } else if (300 <= resp.status) {
    const redirectTo = resp.headers.get("location");
    if (!redirectTo) {
      throw new Error("redirected response didn't has Location headers!");
    }
    await saveMetaFile(url, {
      redirectTo,
      originalPath
    });
    return fetchModule(redirectTo);
  }
}
