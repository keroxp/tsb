import * as path from "path";
import * as url from "url";
import { Transformer } from "./transform";
import * as fs from "fs";
import * as ts from "typescript";
import * as cacheDir from "cachedir";

export const kUriRegex = /^(https?):\/\/(.+?)$/;
export const kRelativeRegex = /^\.?\.?\/.+?\.ts$/;

async function readFileAsync(file: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(file, (err, data) => {
      err ? reject(err) : resolve(String(data));
    });
  });
}

export type SourceFile = {
  canonicalParentName: string;
  canonicalName: string;
};

function resolveUri(id: string): string {
  let m: RegExpMatchArray | null;
  if ((m = id.match(kUriRegex))) {
    const [_, scheme, pathname] = m;
    return path.resolve(
      path.join(cacheDir("deno"), `deps/${scheme}/${pathname}`)
    );
  } else if (id.match(kRelativeRegex)) {
    return path.resolve(id);
  } else {
    throw new Error("invalid module specifier: " + id);
  }
}

async function traverseDependencyTree(
  sourceFile: SourceFile,
  dependencyTree: Map<string, SourceFile>
): Promise<void> {
  const dependencies: string[] = [];
  let id: string;
  id = normalizeModule(sourceFile);
  if (dependencyTree.has(id)) {
    return;
  }
  dependencyTree.set(id, sourceFile);

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const dependency = (node.moduleSpecifier as ts.StringLiteral).text;
      dependencies.push(dependency);
    } else if (ts.isExportDeclaration(node)) {
      const exportClause = node.exportClause;
      const module = node.moduleSpecifier;
      if (exportClause) {
        if (module) {
          // export {a,b} form "bb"
          dependencies.push((module as ts.StringLiteral).text);
        } else {
          // export {a,b
        }
      } else {
        dependencies.push((module as ts.StringLiteral).text);
      }
    }
  }

  const resolvedPath = resolveUri(id);
  const text = await readFileAsync(resolvedPath);
  const src = ts.createSourceFile(resolvedPath, text, ts.ScriptTarget.ESNext);
  ts.forEachChild(src, visit);
  for (const dependency of dependencies) {
    await traverseDependencyTree(
      { canonicalName: dependency, canonicalParentName: id },
      dependencyTree
    );
  }
}

export function normalizeModule(source: SourceFile): string {
  if (source.canonicalName.match(kUriRegex)) {
    // import("https://...")
    return source.canonicalName;
  }
  if (source.canonicalParentName.match(kUriRegex)) {
    // url + relative
    return url.resolve(source.canonicalParentName, source.canonicalName);
  } else {
    // relative + relative
    const dir = path.dirname(source.canonicalParentName);
    const cwd = process.cwd();
    return path.relative(cwd, path.join(dir, source.canonicalName));
  }
}

export async function bundle(entry: string) {
  const tree = new Map<string, SourceFile>();
  await traverseDependencyTree(
    {
      canonicalName: path.relative(process.cwd(), entry),
      canonicalParentName: "."
    },
    tree
  );
  const printer = ts.createPrinter();
  let template = await readFileAsync(path.resolve(__dirname, "template.ts"));
  const modules: string[] = [];
  for (const [file, sourceFile] of tree.entries()) {
    const transformer = new Transformer(sourceFile);
    const text = await readFileAsync(resolveUri(file));
    let id = normalizeModule(sourceFile);
    const src = ts.createSourceFile(id, text, ts.ScriptTarget.ESNext);
    const result = ts.transform(src, transformer.transformers());
    const transformed = printer.printFile(result
      .transformed[0] as ts.SourceFile);
    let body = ts.transpile(transformed, {
      target: ts.ScriptTarget.ESNext
    });
    if (transformer.shouldMergeExport) {
      body = `
      function __export(m) {
        for (var p in m) if (!tsb.exports.hasOwnProperty(p)) tsb.exports[p] = m[p];
      }
      ${body}
      `;
    }
    modules.push(`"${id}": (tsb) => { ${body} }`);
  }
  const body = `${modules.join(",")}`;
  template = template.replace("/*{@modules}*/", body);
  template = template.replace(
    "{@entryId}",
    path.relative(process.cwd(), entry)
  );
  const output = ts.transpile(template, {
    target: ts.ScriptTarget.ESNext
  });
  console.log(output);
}
