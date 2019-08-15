import { joinModuleId } from "../bundle";
import * as ts from "typescript";
describe("bundle", () => {
  describe("normalizeModule", () => {
    test("any + url", () => {
      const res = joinModuleId({
        moduleId: "https://deno.land/hoge.ts",
        dependency: "https://deno.land/some.ts"
      });
      expect(res).toBe("https://deno.land/some.ts");
    });
    test("url + relative", () => {
      const res = joinModuleId({
        moduleId: "https://deno.land/hoge.ts",
        dependency: "./some.ts"
      });
      expect(res).toBe("https://deno.land/some.ts");
    });
    test("relative + relative", () => {
      const res = joinModuleId({
        moduleId: "./example/hoge.ts",
        dependency: "./some.ts"
      });
      expect(res).toBe("./example/some.ts");
    });
    test("relative + relative (subdir)", () => {
      const res = joinModuleId({
        moduleId: "./example/subdir/hoge.ts",
        dependency: "../otherdir/some.ts"
      });
      expect(res).toBe("./example/otherdir/some.ts");
    });
    test("root", () => {
      const res = joinModuleId({
        moduleId: ".",
        dependency: "./example/some.ts"
      });
      expect(res).toBe("./example/some.ts");
    });
  });
});
