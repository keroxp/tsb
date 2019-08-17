import { default as fetch } from "node-fetch";
import { URL } from "url";
import * as cacheDir from "cachedir";
import * as path from "path";
import * as fs from "fs-extra";
import { green } from "colors";
export function urlToCacheFilePath(
  url: string,
  cacheDirectory: string
): string {
  const u = new URL(url);
  if (!u.protocol.match(/^https?/)) {
    throw new Error("url must start with https?:" + url);
  }
  const scheme = u.protocol.startsWith("https") ? "https" : "http";
  return path.join(cacheDirectory, "deps", scheme, u.host, u.pathname);
}

const kAcceptableMimeTypes = [
  "text/plain",
  "application/javascript",
  "text/javascript",
  "application/typescript",
  "text/typescript"
];

export async function fetchModule(
  url: string,
  cacheDirectory?: string
): Promise<void> {
  const dest = urlToCacheFilePath(url, cacheDirectory || cacheDir("tsb"));
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
      fs.writeFile(
        dest + ".headers.json",
        JSON.stringify({ mime_type: contentType })
      )
    ]);
  } else if (300 <= resp.status) {
    const redirect_to = resp.headers.get("location");
    await fs.writeFile(dest + ".headers.json", JSON.stringify({ redirect_to }));
    return fetchModule(redirect_to!, cacheDirectory);
  }
}
