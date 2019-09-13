// Copyright 2019 Yusuke Sakurai. All rights reserved. MIT license.
import * as path from "path";
import * as url from "url";
import { Transformer } from "./transform";
import * as fs from "fs-extra";
import * as ts from "typescript";
import { existsSync } from "fs";
import {
  CacheFileMetadata,
  fetchModule,
  urlToCacheFilePath,
  urlToCacheMetaFilePath
} from "./fetch";
import { CliOptions } from "./main";

export const kUriRegex = /^(https?):\/\/(.+?)$/;
export const kRelativeRegex = /^\.\.?\/.+?\.[jt]sx?$/;

async function readFileAsync(file: string): Promise<string> {
  return String(await fs.readFile(file));
}

export type SourceFile = {
  moduleId: string;
  resolvedPath: string;
  dependencies: string[];
  dependencyIdMap: Map<string, string>;
};

async function fileExists(p: string): Promise<boolean> {
  return fs.pathExists(p);
}

function resolveUri(id: string): string {
  if (id.match(kUriRegex)) {
    return urlToCacheFilePath(id);
  } else if (id.match(kRelativeRegex)) {
    return path.resolve(id);
  } else {
    throw new Error("invalid module specifier: " + id);
  }
}

export async function resolveModuleId(
  moduleId: string,
  dependency: string,
  skipFetch = false
): Promise<string> {
  if (dependency.match(kUriRegex)) {
    // any + url
    const cachePath = urlToCacheFilePath(dependency);
    const cacheMetaPath = urlToCacheMetaFilePath(dependency);
    if (!(await fileExists(cachePath))) {
      if (!(await fileExists(cacheMetaPath))) {
        if (!skipFetch) {
          await fetchModule(dependency);
          return resolveModuleId(moduleId, dependency, false);
        } else {
          throw createError(
            moduleId,
            dependency,
            `cache file was not found in: ${cachePath}`
          );
        }
      }
      const headers = await readFileAsync(cacheMetaPath);
      const meta = JSON.parse(headers) as CacheFileMetadata;
      if (!meta.redirectTo) {
        throw new Error(`meta file for ${dependency} may be broken`);
      }
      return resolveModuleId(".", meta.redirectTo);
    } else {
      return dependency;
    }
  } else if (moduleId.match(kUriRegex)) {
    // url + relative
    return resolveModuleId(".", url.resolve(moduleId, dependency));
  } else {
    // relative + relative
    return joinModuleId(moduleId, dependency);
  }
}

async function traverseDependencyTree({
  moduleId,
  dependencyTree,
  redirectionMap,
  opts
}: {
  moduleId: string;
  dependencyTree: Map<string, SourceFile>;
  redirectionMap: Map<string, string>;
  opts: CliOptions;
}): Promise<void> {
  const dependencies: string[] = [];
  if (dependencyTree.has(moduleId)) {
    return;
  }
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
          // export {a,b}
        }
      } else {
        dependencies.push((module as ts.StringLiteral).text);
      }
    }
    ts.forEachChild(node, visit);
  };
  const resolvedPath = resolveUri(moduleId);
  const text = await readFileAsync(resolvedPath);
  const src = ts.createSourceFile(resolvedPath, text, ts.ScriptTarget.ESNext);
  ts.forEachChild(src, visit);
  const dependencyIdMap = new Map<string, string>();
  dependencyTree.set(moduleId, {
    moduleId,
    dependencies,
    resolvedPath,
    dependencyIdMap
  });
  for (const dependency of dependencies) {
    const dependencyModuleId = await resolveModuleId(
      moduleId,
      dependency,
      opts.skipFetch
    );
    dependencyIdMap.set(dependency, dependencyModuleId);
    redirectionMap.set(joinModuleId(moduleId, dependency), dependencyModuleId);
    await traverseDependencyTree({
      moduleId: dependencyModuleId,
      dependencyTree,
      redirectionMap,
      opts
    });
  }
}

export function joinModuleId(moduleId: string, dependency: string): string {
  if (dependency.match(kUriRegex)) {
    // url
    return dependency;
  } else if (moduleId.match(kUriRegex)) {
    // url + relative
    return url.resolve(moduleId, dependency);
  } else if (dependency.match(kRelativeRegex)) {
    // relative + relative
    const cwd = process.cwd();
    const dir = path.dirname(moduleId);
    return "./" + path.relative(cwd, path.join(dir, dependency));
  } else {
    throw createError(
      moduleId,
      dependency,
      `dependency must be URL or start with ./ or ../`
    );
  }
}

function createError(moduleId: string, dep: string, message: string): Error {
  return new Error(`moduleId: "${moduleId}", dependency: "${dep}": ${message}`);
}

export function createCompilerHost(
  options: ts.CompilerOptions,
  moduleSearchLocations: string[],
  fileToModuleIdMap: Map<string, string>,
  sourceFiles: Map<string, SourceFile>
): ts.CompilerHost {
  return {
    getSourceFile,
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: (fileName, content) => ts.sys.writeFile(fileName, content),
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    getDirectories: path => ts.sys.getDirectories(path),
    getCanonicalFileName: fileName =>
      ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
    getNewLine: () => ts.sys.newLine,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    fileExists,
    readFile,
    resolveModuleNames
  };

  function fileExists(fileName: string): boolean {
    return ts.sys.fileExists(fileName);
  }

  function readFile(fileName: string): string | undefined {
    return ts.sys.readFile(fileName);
  }

  function getSourceFile(
    fileName: string,
    languageVersion: ts.ScriptTarget,
    onError?: (message: string) => void
  ) {
    const sourceText = ts.sys.readFile(fileName);
    return sourceText !== undefined
      ? ts.createSourceFile(fileName, sourceText, languageVersion)
      : undefined;
  }

  function resolveModuleNames(
    dependencies: string[],
    containingFile: string
  ): ts.ResolvedModule[] {
    const resolvedModules: ts.ResolvedModule[] = [];
    console.log(containingFile, dependencies);
    for (const dependency of dependencies) {
      const moduleId = fileToModuleIdMap.get(containingFile);
      if (!moduleId) {
        throw new Error(`${containingFile} doesn't exist in fileToModuleIdMap`);
      }
      const depId = sourceFiles.get(moduleId)!.dependencyIdMap.get(dependency)!;
      resolvedModules.push({ resolvedFileName: resolveUri(depId) });
      //try to use standard resolution
      // let result = ts.resolveModuleName(dependency, containingFile, options, {
      //   fileExists,
      //   readFile
      // });
      // if (result.resolvedModule) {
      //   resolvedModules.push(result.resolvedModule);
      // } else {
      //   // check fallback locations, for simplicity assume that module at location
      //   // should be represented by '.d.ts' file
      //   for (const location of moduleSearchLocations) {
      //     const modulePath = path.join(location, dependency + ".d.ts");
      //     if (fileExists(modulePath)) {
      //       resolvedModules.push({ resolvedFileName: modulePath });
      //     }
      //   }
      // }
    }
    return resolvedModules;
  }
}

export async function bundle(entry: string, opts: CliOptions) {
  let canonicalName: string;
  if (entry.match(kUriRegex)) {
    canonicalName = entry;
  } else {
    canonicalName = "./" + path.relative(process.cwd(), entry);
  }
  const dependencyTree = new Map<string, SourceFile>();
  const redirectionMap = new Map<string, string>([
    [canonicalName, canonicalName]
  ]);
  const fileToModuleIdMap = new Map<string, string>([
    [path.resolve(canonicalName), canonicalName]
  ]);
  await traverseDependencyTree({
    moduleId: canonicalName,
    dependencyTree,
    redirectionMap,
    opts
  });
  for (const v of dependencyTree.values()) {
    fileToModuleIdMap.set(v.resolvedPath, v.moduleId);
  }
  let compilerOpts: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext
  };
  if (await fs.pathExists(opts.project)) {
    const json = JSON.parse(String(await fs.readFile(opts.project)));
    compilerOpts = json["compilerOptions"];
  }
  compilerOpts.noEmit = true;
  const compilerHost = createCompilerHost(
    compilerOpts,
    [],
    fileToModuleIdMap,
    dependencyTree
  );
  const program = ts.createProgram([canonicalName], compilerOpts, compilerHost);
  const emitResult = program.emit();
  let allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);
  allDiagnostics.forEach(diagnostic => {
    if (diagnostic.file) {
      let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start!
      );
      let message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        "\n"
      );
      console.error(
        `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`
      );
    } else {
      console.error(
        `${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
      );
    }
  });
  if (emitResult.emitSkipped) {
    console.error("bundle canceled");
    process.exit(1);
  }
  const printer = ts.createPrinter();
  let template = await readFileAsync(
    path.resolve(__dirname, "../template/template.ts")
  );
  const resolveRedirection = (moduleId: string, dep: string): string => {
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
      return joinModuleId(moduleId, dep);
    }
  };
  const modules: string[] = [];
  for (const [moduleId] of dependencyTree.entries()) {
    const transformer = new Transformer(moduleId, resolveRedirection);
    let text = await readFileAsync(resolveUri(moduleId));
    if (text.startsWith("#!")) {
      // disable shell
      text = "//" + text;
    }
    const src = ts.createSourceFile(moduleId, text, ts.ScriptTarget.ESNext);
    const result = ts.transform(src, transformer.transformers());
    const transformed = printer.printFile(result
      .transformed[0] as ts.SourceFile);
    const opts: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext
    };
    if (moduleId.endsWith(".tsx") || moduleId.endsWith(".jsx")) {
      opts.jsx = ts.JsxEmit.React;
    }
    let body = ts.transpile(transformed, opts);
    if (transformer.shouldMergeExport) {
      body = `
      function __export(m,k) {
        if (k) {
          for (const p in k) if (!tsb.exports.hasOwnProperty(k[p])) tsb.exports[k[p]] = m[p];
        } else {         
          for (const p in m) if (!tsb.exports.hasOwnProperty(p)) tsb.exports[p] = m[p];
        }                  
      }
      ${body}
      `;
    }
    modules.push(`"${moduleId}": function (tsb) { ${body} } `);
  }
  const body = modules.join(",");
  const entryId = await resolveModuleId(".", canonicalName);
  template = `(${template}).call(this, {${body}}, "${entryId}")`;
  const output = ts.transpile(template, {
    target: ts.ScriptTarget.ESNext
  });
  console.log(output);
}
