"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Copyright 2019 Yusuke Sakurai. All rights reserved. MIT license.
const path = require("path");
const url = require("url");
const transform_1 = require("./transform");
const fs = require("fs-extra");
const ts = require("typescript");
const fetch_1 = require("./fetch");
exports.kUriRegex = /^(https?):\/\/(.+?)$/;
exports.kRelativeRegex = /^\.\.?\/.+?\.[jt]sx?$/;
async function readFileAsync(file) {
    return String(await fs.readFile(file));
}
async function fileExists(p) {
    return fs.pathExists(p);
}
async function resolveUri(id) {
    if (id.match(exports.kUriRegex)) {
        return fetch_1.urlToCacheFilePath(id);
    }
    else if (id.match(exports.kRelativeRegex)) {
        return path.resolve(id);
    }
    else {
        throw new Error("invalid module specifier: " + id);
    }
}
async function resolveModuleId(source, skipFetch = false) {
    if (source.dependency.match(exports.kUriRegex)) {
        // any + url
        const cachePath = fetch_1.urlToCacheFilePath(source.dependency);
        const cacheMetaPath = fetch_1.urlToCacheMetaFilePath(source.dependency);
        if (!(await fileExists(cachePath))) {
            if (!(await fileExists(cacheMetaPath))) {
                if (!skipFetch) {
                    await fetch_1.fetchModule(source.dependency);
                    return resolveModuleId(source, false);
                }
                else {
                    throw createError(source, `
        Cache file was not found in: ${cachePath}. 
        `);
                }
            }
            const headers = await readFileAsync(cacheMetaPath);
            const meta = JSON.parse(headers);
            if (!meta.redirectTo) {
                throw new Error(`meta file for ${source.dependency} may be broken`);
            }
            return resolveModuleId({
                moduleId: ".",
                dependency: meta.redirectTo
            });
        }
        else {
            return source.dependency;
        }
    }
    else if (source.moduleId.match(exports.kUriRegex)) {
        // url + relative
        return resolveModuleId({
            moduleId: ".",
            dependency: url.resolve(source.moduleId, source.dependency)
        });
    }
    else {
        // relative + relative
        return joinModuleId(source);
    }
}
exports.resolveModuleId = resolveModuleId;
async function traverseDependencyTree(sourceFile, dependencyTree, redirectionMap, opts) {
    const dependencies = [];
    let id;
    id = await resolveModuleId(sourceFile, opts.skipFetch);
    redirectionMap.set(joinModuleId(sourceFile), id);
    if (dependencyTree.has(id)) {
        return;
    }
    dependencyTree.set(id, sourceFile);
    const visit = (node) => {
        if (ts.isImportDeclaration(node)) {
            const dependency = node.moduleSpecifier.text;
            dependencies.push(dependency);
        }
        else if (ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            // import("aa").then(v => {})
            const [module] = node.arguments;
            if (ts.isStringLiteral(module)) {
                dependencies.push(module.text);
            }
        }
        else if (ts.isExportDeclaration(node)) {
            const exportClause = node.exportClause;
            const module = node.moduleSpecifier;
            if (exportClause) {
                if (module) {
                    // export {a,b} form "bb"
                    dependencies.push(module.text);
                }
                else {
                    // export {a,b
                }
            }
            else {
                dependencies.push(module.text);
            }
        }
        ts.forEachChild(node, visit);
    };
    const resolvedPath = await resolveUri(id);
    const text = await readFileAsync(resolvedPath);
    const src = ts.createSourceFile(resolvedPath, text, ts.ScriptTarget.ESNext);
    ts.forEachChild(src, visit);
    for (const dependency of dependencies) {
        await traverseDependencyTree({ dependency: dependency, moduleId: id }, dependencyTree, redirectionMap, opts);
    }
}
function joinModuleId(source) {
    if (source.dependency.match(exports.kUriRegex)) {
        // url
        return source.dependency;
    }
    else if (source.moduleId.match(exports.kUriRegex)) {
        // url + relative
        return url.resolve(source.moduleId, source.dependency);
    }
    else if (source.dependency.match(exports.kRelativeRegex)) {
        // relative + relative
        const cwd = process.cwd();
        const dir = path.dirname(source.moduleId);
        return "./" + path.relative(cwd, path.join(dir, source.dependency));
    }
    else {
        throw createError(source, `dependency must be URL or start with ./ or ../`);
    }
}
exports.joinModuleId = joinModuleId;
function createError(source, message) {
    return new Error(`moduleId: "${source.moduleId}", dependency: "${source.dependency}": ${message}`);
}
async function bundle(entry, opts) {
    const tree = new Map();
    const redirectionMap = new Map();
    let canonicalName;
    if (entry.match(exports.kUriRegex)) {
        canonicalName = entry;
    }
    else {
        canonicalName = "./" + path.relative(process.cwd(), entry);
    }
    await traverseDependencyTree({
        dependency: canonicalName,
        moduleId: "."
    }, tree, redirectionMap, opts);
    const printer = ts.createPrinter();
    let template = await readFileAsync(path.resolve(__dirname, "../template/template.ts"));
    const resolveModule = (moduleId, dep) => {
        const redirection = redirectionMap.get(moduleId);
        if (!redirection) {
            throw new Error(`${moduleId} not found in redirection map`);
        }
        if (dep.match(exports.kUriRegex)) {
            const ret = redirectionMap.get(dep);
            if (!ret) {
                throw new Error(`${dep} not found in redirection map`);
            }
            return ret;
        }
        else {
            return joinModuleId({
                moduleId: moduleId,
                dependency: dep
            });
        }
    };
    const modules = [];
    for (const [moduleId] of tree.entries()) {
        const transformer = new transform_1.Transformer(moduleId, resolveModule);
        let text = await readFileAsync(await resolveUri(moduleId));
        if (text.startsWith("#!")) {
            // disable shell
            text = "//" + text;
        }
        const src = ts.createSourceFile(moduleId, text, ts.ScriptTarget.ESNext);
        const result = ts.transform(src, transformer.transformers());
        const transformed = printer.printFile(result
            .transformed[0]);
        const opts = {
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
    const entryId = await resolveModuleId({
        dependency: canonicalName,
        moduleId: "."
    });
    template = `(${template}).call(this, {${body}}, "${entryId}")`;
    const output = ts.transpile(template, {
        target: ts.ScriptTarget.ESNext
    });
    console.log(output);
}
exports.bundle = bundle;
