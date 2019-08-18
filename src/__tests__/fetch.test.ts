import { urlToCacheFilePath, urlToCacheMetaFilePath } from "../fetch";
import * as cachedir from "cachedir";
import * as path from "path";
describe("fetch", () => {
  test("urlToCachePath", () => {
    const url = "https://deno.land/sub/dir/script.ts?query=1";
    const res = urlToCacheFilePath(url);
    const exp = path.resolve(
      cachedir("tsb"),
      "https",
      "deno.land",
      // /sub/dir/script.ts?query=1
      "118a6a93e2c6de545787b444e91ef3906f20688e4b47a55cb28f14a05e51dcab"
    );
    expect(res).toBe(exp);
    expect(urlToCacheMetaFilePath(url)).toBe(exp + ".meta.json");
  });
});
