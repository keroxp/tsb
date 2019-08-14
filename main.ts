import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import * as cacheDir from "cachedir";
import { createTransformers } from "./transform";

async function readFileAsync(file: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(file, (err, data) => {
      err ? reject(err) : resolve(String(data));
    });
  });
}

export const kUriRegex = /^(https?):\/\/(.+?)$/;
export const kRelativeRegex = /^\.?\.?\/.+?\.ts$/;

async function traverseDependencyTree(
  // /Users/keroxp/src/tsb/example/example.ts or /Users/keroxp/Library/Caches/deno/deps/https...
  absolutePath: string,
  canonicalName: string, // ./example/example.ts or https://...
  dependencyTree: Map<
    string,
    {
      canonicalName: string;
      dependencies: string[];
    }
  >
): Promise<void> {
  const dependencies: string[] = [];
  let id: string;
  const cwd = process.cwd();
  id = path.relative(cwd, absolutePath);
  if (dependencyTree.has(id)) {
    return;
  }
  dependencyTree.set(id, {
    canonicalName,
    dependencies
  });

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const dependency = (node.moduleSpecifier as ts.StringLiteral).text;
      dependencies.push(dependency);
    }
  }

  const text = await readFileAsync(absolutePath);
  const src = ts.createSourceFile(absolutePath, text, ts.ScriptTarget.ESNext);
  ts.forEachChild(src, visit);
  for (const dependency of dependencies) {
    let resolvedPath: string;
    let m: RegExpMatchArray | null;
    if ((m = dependency.match(kUriRegex))) {
      const [_, scheme, pathname] = m;
      resolvedPath = path.resolve(
        path.join(cacheDir("deno"), `deps/${scheme}/${pathname}`)
      );
    } else if ((m = dependency.match(kRelativeRegex))) {
      const dir = path.dirname(absolutePath);
      resolvedPath = path.resolve(path.join(dir, dependency));
    } else {
      throw new Error("invalid module specifier: " + absolutePath);
    }
    await traverseDependencyTree(resolvedPath, dependency, dependencyTree);
  }
}

async function bundle(entry: string) {
  const tree = new Map<
    string,
    {
      canonicalName: string;
      dependencies: string[];
    }
  >();
  await traverseDependencyTree(entry, entry, tree);
  // console.log(tree.entries());
  const printer = ts.createPrinter();
  let template = await readFileAsync("./template.ts");
  const modules: string[] = [];
  for (const [file, { canonicalName }] of tree.entries()) {
    const transformer = createTransformers(canonicalName);
    const text = await readFileAsync(file);
    let id: string;
    if (canonicalName.match(kUriRegex)) {
      id = canonicalName;
    } else {
      id = file;
    }
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

async function action() {
  const target = process.argv[process.argv.length - 1];
  if (!target) {
    console.error("file path not provided");
    process.exit(1);
  }
  const entry = path.resolve(target);
  await bundle(entry);
}

action();
