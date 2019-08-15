import { Transformer } from "../transform";
import * as ts from "typescript";

describe("transofmrn", () => {
  const printer = ts.createPrinter();
  function transform(t: Transformer, text: string): string {
    const src = ts.createSourceFile("example.ts", text, ts.ScriptTarget.ESNext);
    const result = ts.transform(src, t.transformers());
    return printer.printFile(result.transformed[0] as ts.SourceFile);
  }
  describe("import", () => {
    [
      {
        before: `import { a } from "./some.ts";\n`,
        after: `var { a } = tsb.import("./some.ts");\n`
      },
      {
        before: `import { serve } from "https://deno.land/std/http/server.ts";\n`,
        after: `var { serve } = tsb.import("https://deno.land/std/http/server.ts");\n`
      },
      {
        before: `import { serve as doServe } from "https://deno.land/std/http/server.ts";\n`,
        after: `var { serve: doServe } = tsb.import("https://deno.land/std/http/server.ts");\n`
      },
      {
        before: `import * as http from "https://deno.land/std/http/server.ts";\n`,
        after: `var http = tsb.import("https://deno.land/std/http/server.ts");\n`
      },
      {
        before: `import http from "https://deno.land/std/http/server.ts";\n`,
        after: `var http = tsb.import("https://deno.land/std/http/server.ts").default;\n`
      },
      {
        before: `import("hoge").then(v => { })`,
        after: `tsb.importDynamic("hoge").then(v => { });\n`
      }
    ].forEach(({ before, after }, i) => {
      test(`improt${i}`, () => {
        const t = new Transformer("./example.ts", (moduleId, dep) => {
          return dep;
        });
        expect(transform(t, before)).toBe(after);
      });
    });
  });
  describe("export", () => {
    [
      {
        before: "export { Hoge }",
        after: "tsb.exports.Hoge = Hoge\n"
      },
      {
        before: "export default 1",
        after: "tsb.exports.default = 1\n"
      },
      {
        before: "export default function () { }",
        after: "tsb.exports.default = function () { }\n"
      },
      {
        before: "export default function func() { }",
        after: "tsb.exports.default = function func() { }\n"
      },
      {
        before: "export default class Class {};\n",
        after: "tsb.exports.default = class Class {\n}\n;\n"
      },
      {
        before: "export const kon = 1;\n",
        after: "const kon = 1;\ntsb.exports.kon = kon\n"
      },
      {
        before: "export function func() {};\n",
        after: "function func() { }\ntsb.exports.func = func\n;\n"
      },
      {
        before: "export class Class {};\n",
        after: "tsb.exports.Class = class Class {\n}\n;\n"
      },
      {
        before: "export enum Enum {};\n",
        after: "enum Enum {\n}\ntsb.exports.Enum = Enum\n;\n"
      },
      {
        before: `export * from "./other.ts"`,
        after: `__export(tsb.import("./other.ts"))\n`
      }
    ].forEach(({ before, after }, i) => {
      test("export" + i, () => {
        const t = new Transformer("./example.ts", (moduleId, dep) => {
          return dep;
        });
        expect(transform(t, before)).toBe(after);
      });
    });
  });
});
