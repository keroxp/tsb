import { Transformer } from "../transform";
import * as ts from "typescript";

describe("transform", () => {
  const printer = ts.createPrinter();
  const t = new Transformer("./example.ts", (moduleId, dep) => {
    return dep;
  });
  function transform(text: string): string {
    const src = ts.createSourceFile("example.ts", text, ts.ScriptTarget.ESNext);
    const result = ts.transform(src, t.transformers());
    return printer.printFile(result.transformed[0] as ts.SourceFile);
  }
  describe("import", () => {
    test("namedImport(relative)", () => {
      const res = transform(`import { a } from "./some.ts";\n`);
      expect(res).toBe(`var { a } = tsb.import("./some.ts");\n`);
    });
    test("namedImport(url)", () => {
      const res = transform(
        `import { serve } from "https://deno.land/std/http/server.ts";\n`
      );
      expect(res).toBe(
        `var { serve } = tsb.import("https://deno.land/std/http/server.ts");\n`
      );
    });
    test("binding", () => {
      const res = transform(
        `import { serve as doServe } from "https://deno.land/std/http/server.ts";\n`
      );
      expect(res).toBe(
        `var { serve: doServe } = tsb.import("https://deno.land/std/http/server.ts");\n`
      );
    });
    test("*", () => {
      const res = transform(
        `import * as http from "https://deno.land/std/http/server.ts";\n`
      );
      expect(res).toBe(
        `var http = tsb.import("https://deno.land/std/http/server.ts");\n`
      );
    });
    test("default", () => {
      const res = transform(
        `import http from "https://deno.land/std/http/server.ts";\n`
      );
      expect(res).toBe(
        `var http = tsb.import("https://deno.land/std/http/server.ts").default;\n`
      );
    });
    test("dynamic", () => {
      const res = transform(`import("hoge").then(v => { })`);
      expect(res).toBe(`tsb.importDynamic("hoge").then(v => { });\n`);
    });
    test("unassigned", () => {
      const res = transform(`import "aa"`);
      expect(res).toBe(`tsb.import("aa")\n`);
    });
  });
  describe("export", () => {
    test("named", () => {
      const res = transform(`export { Hoge }`);
      expect(res).toBe("tsb.exports.Hoge = Hoge\n");
    });
    test("default", () => {
      const res = transform("export default 1");
      expect(res).toBe("tsb.exports.default = 1\n");
    });
    test("default function(anonymous)", () => {
      const res = transform("export default function () { }");
      expect(res).toBe("tsb.exports.default = function () { }\n");
    });
    test("default function(named)", () => {
      const res = transform("export default function func() { }");
      expect(res).toBe("tsb.exports.default = function func() { }\n");
    });
    test("default class", () => {
      const res = transform("export default class Class {};\n");
      expect(res).toBe("tsb.exports.default = class Class {\n}\n;\n");
    });
    test("variable", () => {
      const res = transform("export const kon = 1;\n");
      expect(res).toBe("const kon = 1;\ntsb.exports.kon = kon\n");
    });
    test("function", () => {
      const res = transform("export function func() {};\n");
      expect(res).toBe("function func() { }\ntsb.exports.func = func\n;\n");
    });
    test("class", () => {
      const res = transform("export class Class {};\n");
      expect(res).toBe("tsb.exports.Class = class Class {\n}\n;\n");
    });
    test("enum", () => {
      const res = transform("export enum Enum {};\n");
      expect(res).toBe("enum Enum {\n}\ntsb.exports.Enum = Enum\n;\n");
    });
    test("assignment", () => {
      const res = transform(`export * from "./other.ts"`);
      expect(res).toBe(`__export(tsb.import("./other.ts"))\n`);
    });
  });
});
