import { normalizeModule } from "../bundle";

describe("bundle", () => {
  describe("normalizeModule", () => {
    test("url + relative", () => {
      const res = normalizeModule({
        canonicalParentName: "https://deno.land/hoge.ts",
        canonicalName: "./some.ts"
      });
      expect(res).toBe("https://deno.land/some.ts");
    });
    test("relative + relative", () => {
      const res = normalizeModule({
        canonicalParentName: "./example/hoge.ts",
        canonicalName: "./some.ts"
      });
      expect(res).toBe("example/some.ts");
    });
    test("relative + relative", () => {
      const res = normalizeModule({
        canonicalParentName: "./example/subdir/hoge.ts",
        canonicalName: "../otherdir/some.ts"
      });
      expect(res).toBe("example/otherdir/some.ts");
    });
    test("root", () => {
      const res = normalizeModule({
        canonicalParentName: ".",
        canonicalName: "./example/some.ts"
      });
      expect(res).toBe("example/some.ts");
    });
  });
});
