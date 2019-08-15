import { joinModuleId } from "../bundle";
import * as ts from "typescript";
describe("bundle", () => {
  describe("normalizeModule", () => {
    test("any + url", () => {
      const res = joinModuleId({
        canonicalParentName: "https://deno.land/hoge.ts",
        canonicalName: "https://deno.land/some.ts"
      });
      expect(res).toBe("https://deno.land/some.ts");
    });
    test("url + relative", () => {
      const res = joinModuleId({
        canonicalParentName: "https://deno.land/hoge.ts",
        canonicalName: "./some.ts"
      });
      expect(res).toBe("https://deno.land/some.ts");
    });
    test("relative + relative", () => {
      const res = joinModuleId({
        canonicalParentName: "./example/hoge.ts",
        canonicalName: "./some.ts"
      });
      expect(res).toBe("./example/some.ts");
    });
    test("relative + relative (subdir)", () => {
      const res = joinModuleId({
        canonicalParentName: "./example/subdir/hoge.ts",
        canonicalName: "../otherdir/some.ts"
      });
      expect(res).toBe("./example/otherdir/some.ts");
    });
    test("root", () => {
      const res = joinModuleId({
        canonicalParentName: ".",
        canonicalName: "./example/some.ts"
      });
      expect(res).toBe("./example/some.ts");
    });
  });
  test("test", () => {
    const text = `import("hoge")`;
    const src = ts.createSourceFile("tex", text, ts.ScriptTarget.ESNext);
    src.forEachChild(node => {
      console.log(node);
    });
  });
});
