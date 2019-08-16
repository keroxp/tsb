// Copyright 2019 Yusuke Sakurai. All rights reserved. MIT license.
import * as path from "path";
import * as url from "url";
import { Transformer } from "./transform";
import * as fs from "fs-extra";
import * as ts from "typescript";
import * as cacheDir from "cachedir";
import { fetchModule } from "./fetch";
import { CliOptions } from "./main";

export const kUriRegex = /^(https?):\/\/(.+?)$/;
export const kRelativeRegex = /^\.\.?\/.+?\.ts$/;

async function readFileAsync(file: string): Promise<string> {
  return String(await fs.readFile(file));
}

export type SourceFile = {
  moduleId: string;
  dependency: string;
};

async function fileExists(p: string): Promise<boolean> {
  return fs.pathExists(p);
}

async function resolveUri(id: string): Promise<string> {
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

export async function resolveModuleId(
  source: SourceFile,
  skipFetch = false
): Promise<string> {
  let m: RegExpMatchArray | null;
  if ((m = source.dependency.match(kUriRegex))) {
    // any + url
    const [_, scheme, pathname] = m;
    const cachePath = path.join(cacheDir("deno"), `deps/${scheme}/${pathname}`);
    if (!(await fileExists(cachePath))) {
      if (!(await fileExists(cachePath + ".headers.json"))) {
        if (!skipFetch) {
          await fetchModule(source.dependency, cacheDir("deno"));
          return resolveModuleId(source, false);
        } else {
          throw createError(
            source,
            `
        Cache file was not found in: ${cachePath}. 
        This typically means that you need to run "deno fetch" for the entry file. 
        `
          );
        }
      }
      const { redirect_to } = JSON.parse(
        await readFileAsync(cachePath + ".headers.json")
      );
      return resolveModuleId({
        moduleId: ".",
        dependency: redirect_to
      });
    } else {
      return source.dependency;
    }
  } else if (source.moduleId.match(kUriRegex)) {
    // url + relative
    return resolveModuleId({
      moduleId: ".",
      dependency: url.resolve(source.moduleId, source.dependency)
    });
  } else {
    // relative + relative
    return joinModuleId(source);
  }
}

async function traverseDependencyTree(
  sourceFile: SourceFile,
  dependencyTree: Map<string, SourceFile>,
  redirectionMap: Map<string, string>,
  opts: CliOptions
): Promise<void> {
  const dependencies: string[] = [];
  let id: string;
  id = await resolveModuleId(sourceFile, opts.skipFetch);
  redirectionMap.set(joinModuleId(sourceFile), id);
  if (dependencyTree.has(id)) {
    return;
  }
  dependencyTree.set(id, sourceFile);

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const dependency = (node.moduleSpecifier as ts.StringLiteral).text;
      dependencies.push(dependency);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      // import("aa").then(v => {})
      const [module] = node.arguments;
      if (ts.isStringLiteral(module)) {
        dependencies.push(module.text);
      }
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
    ts.forEachChild(node, visit);
  };

  const resolvedPath = await resolveUri(id);
  const text = await readFileAsync(resolvedPath);
  const src = ts.createSourceFile(resolvedPath, text, ts.ScriptTarget.ESNext);
  ts.forEachChild(src, visit);
  for (const dependency of dependencies) {
    await traverseDependencyTree(
      { dependency: dependency, moduleId: id },
      dependencyTree,
      redirectionMap,
      opts
    );
  }
}

export function joinModuleId(source: SourceFile): string {
  if (source.dependency.match(kUriRegex)) {
    // url
    return source.dependency;
  } else if (source.moduleId.match(kUriRegex)) {
    // url + relative
    return url.resolve(source.moduleId, source.dependency);
  } else if (source.dependency.match(kRelativeRegex)) {
    // relative + relative
    const cwd = process.cwd();
    const dir = path.dirname(source.moduleId);
    return "./" + path.relative(cwd, path.join(dir, source.dependency));
  } else {
    throw createError(source, `dependency must be URL or start with ./ or ../`);
  }
}

function createError(source: SourceFile, message: string): Error {
  return new Error(
    `moduleId: "${source.moduleId}", dependency: "${source.dependency}": ${message}`
  );
}

export async function bundle(entry: string, opts: CliOptions) {
  const tree = new Map<string, SourceFile>();
  const redirectionMap = new Map<string, string>();
  let canonicalName: string;
  if (entry.match(kUriRegex)) {
    canonicalName = entry;
  } else {
    canonicalName = "./" + path.relative(process.cwd(), entry);
  }
  await traverseDependencyTree(
    {
      dependency: canonicalName,
      moduleId: "."
    },
    tree,
    redirectionMap,
    opts
  );
  const printer = ts.createPrinter();
  let template = await readFileAsync(
    path.resolve(__dirname, "../template/template.ts")
  );
  const resolveModule = (moduleId: string, dep: string): string => {
    const redirection = redirectionMap.get(moduleId);
    if (!redirection) {
      throw new Error(`${moduleId} not found in redirection map`);
    }
    if (dep.match(kUriRegex)) {
      const ret = redirectionMap.get(dep);
      if (!ret) {
        throw new Error(`${dep} not found in redirection map`);
      }
      return ret;
    } else {
      return joinModuleId({
        moduleId: moduleId,
        dependency: dep
      });
    }
  };
  const modules: string[] = [];
  for (const [moduleId] of tree.entries()) {
    const transformer = new Transformer(moduleId, resolveModule);
    let text = await readFileAsync(await resolveUri(moduleId));
    if (text.startsWith("#!")) {
      // disable shell
      text = "//" + text;
    }
    const src = ts.createSourceFile(moduleId, text, ts.ScriptTarget.ESNext);
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
    modules.push(`"${moduleId}": (tsb) => { ${body} }`);
  }
  const body = `${modules.join(",")}`;
  template = template.replace("/*{@modules}*/", body);
  template = template.replace(
    "{@entryId}",
    await resolveModuleId({ dependency: canonicalName, moduleId: "." })
  );
  const output = ts.transpile(template, {
    target: ts.ScriptTarget.ESNext
  });
  console.log(output);
}
