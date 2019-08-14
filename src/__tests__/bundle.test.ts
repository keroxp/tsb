import { normalizeModuleId } from "../bundle";

describe("bundle", () => {
  describe("normalizeModule", () => {
    test("url + relative", () => {
      const res = normalizeModuleId({
        canonicalParentName: "https://deno.land/hoge.ts",
        canonicalName: "./some.ts"
      });
      expect(res).toBe("https://deno.land/some.ts");
    });
    test("relative + relative", () => {
      const res = normalizeModuleId({
        canonicalParentName: "./example/hoge.ts",
        canonicalName: "./some.ts"
      });
      expect(res).toBe("./example/some.ts");
    });
    test("relative + relative", () => {
      const res = normalizeModuleId({
        canonicalParentName: "./example/subdir/hoge.ts",
        canonicalName: "../otherdir/some.ts"
      });
      expect(res).toBe("./example/otherdir/some.ts");
    });
    test("root", () => {
      const res = normalizeModuleId({
        canonicalParentName: ".",
        canonicalName: "./example/some.ts"
      });
      expect(res).toBe("./example/some.ts");
    });
  });
});
