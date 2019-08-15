"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// Copyright 2019 Yusuke Sakurai. All rights reserved. MIT license.
const path = require("path");
const url = require("url");
const transform_1 = require("./transform");
const fs = require("fs");
const ts = require("typescript");
const cacheDir = require("cachedir");
exports.kUriRegex = /^(https?):\/\/(.+?)$/;
exports.kRelativeRegex = /^\.?\.?\/.+?\.ts$/;
function readFileAsync(file) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            fs.readFile(file, (err, data) => {
                err ? reject(err) : resolve(String(data));
            });
        });
    });
}
function fileExists(p) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            fs.stat(p, err => {
                if (err) {
                    if (err.code === "ENOENT") {
                        return resolve(false);
                    }
                    else {
                        reject(err);
                    }
                }
                else {
                    resolve(true);
                }
            });
        });
    });
}
function resolveUri(id) {
    return __awaiter(this, void 0, void 0, function* () {
        let m;
        if ((m = id.match(exports.kUriRegex))) {
            const [_, scheme, pathname] = m;
            let ret = path.resolve(path.join(cacheDir("deno"), `deps/${scheme}/${pathname}`));
            if (!(yield fileExists(ret))) {
                ret = path.resolve(path.join(cacheDir("deno"), `deps/${scheme}/${pathname}.headers.json`));
                if (!(yield fileExists(ret))) {
                    throw new Error("file not found: " + id + " " + ret);
                }
                const { redirect_to } = JSON.parse(yield readFileAsync(ret));
                return resolveUri(redirect_to);
            }
            else {
                return ret;
            }
        }
        else if (id.match(exports.kRelativeRegex)) {
            return path.resolve(id);
        }
        else {
            throw new Error("invalid module specifier: " + id);
        }
    });
}
function traverseDependencyTree(sourceFile, dependencyTree, redirectionMap) {
    return __awaiter(this, void 0, void 0, function* () {
        const dependencies = [];
        let id;
        id = yield resolveModuleId(sourceFile);
        redirectionMap.set(normalizeModuleId(sourceFile), id);
        if (dependencyTree.has(id)) {
            return;
        }
        dependencyTree.set(id, sourceFile);
        const visit = (node) => {
            if (ts.isImportDeclaration(node)) {
                const dependency = node.moduleSpecifier.text;
                dependencies.push(dependency);
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
        };
        const resolvedPath = yield resolveUri(id);
        const text = yield readFileAsync(resolvedPath);
        const src = ts.createSourceFile(resolvedPath, text, ts.ScriptTarget.ESNext);
        ts.forEachChild(src, visit);
        for (const dependency of dependencies) {
            yield traverseDependencyTree({ canonicalName: dependency, canonicalParentName: id }, dependencyTree, redirectionMap);
        }
    });
}
function normalizeModuleId(source) {
    if (source.canonicalName.match(exports.kUriRegex)) {
        return source.canonicalName;
    }
    else if (source.canonicalParentName.match(exports.kUriRegex)) {
        // url + relative
        return url.resolve(source.canonicalParentName, source.canonicalName);
    }
    else {
        // relative + relative
        const cwd = process.cwd();
        const dir = path.dirname(source.canonicalParentName);
        return "./" + path.relative(cwd, path.join(dir, source.canonicalName));
    }
}
exports.normalizeModuleId = normalizeModuleId;
function resolveModuleId(source) {
    return __awaiter(this, void 0, void 0, function* () {
        let m;
        if ((m = source.canonicalName.match(exports.kUriRegex))) {
            // import("https://...")
            const [_, scheme, pathname] = m;
            const cachePath = path.join(cacheDir("deno"), `deps/${scheme}/${pathname}`);
            if (!(yield fileExists(cachePath))) {
                if (!(yield fileExists(cachePath + ".headers.json"))) {
                    throw new Error("not found: " + source.canonicalName);
                }
                const { redirect_to } = JSON.parse(yield readFileAsync(cachePath + ".headers.json"));
                return resolveModuleId({
                    canonicalParentName: ".",
                    canonicalName: redirect_to
                });
            }
            else {
                return source.canonicalName;
            }
        }
        else if (source.canonicalParentName.match(exports.kUriRegex)) {
            // url + relative
            return resolveModuleId({
                canonicalParentName: ".",
                canonicalName: url.resolve(source.canonicalParentName, source.canonicalName)
            });
        }
        else {
            // relative + relative
            const cwd = process.cwd();
            const dir = path.dirname(source.canonicalParentName);
            return "./" + path.relative(cwd, path.join(dir, source.canonicalName));
        }
    });
}
exports.resolveModuleId = resolveModuleId;
function bundle(entry) {
    return __awaiter(this, void 0, void 0, function* () {
        const tree = new Map();
        const redirectionMap = new Map();
        let canonicalName;
        if (entry.match(exports.kUriRegex)) {
            canonicalName = entry;
        }
        else {
            canonicalName = "./" + path.relative(process.cwd(), entry);
        }
        yield traverseDependencyTree({
            canonicalName,
            canonicalParentName: "."
        }, tree, redirectionMap);
        const printer = ts.createPrinter();
        let template = yield readFileAsync(path.resolve(__dirname, "../template/template.ts"));
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
                return url.resolve(redirection, dep);
            }
        };
        const modules = [];
        for (const [moduleId, sourceFile] of tree.entries()) {
            const transformer = new transform_1.Transformer(moduleId, resolveModule);
            let text = yield readFileAsync(yield resolveUri(moduleId));
            if (text.startsWith("#!")) {
                // disable shell
                text = "//" + text;
            }
            const src = ts.createSourceFile(moduleId, text, ts.ScriptTarget.ESNext);
            const result = ts.transform(src, transformer.transformers());
            const transformed = printer.printFile(result
                .transformed[0]);
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
        template = template.replace("{@entryId}", yield resolveModuleId({ canonicalName: entry, canonicalParentName: "." }));
        const output = ts.transpile(template, {
            target: ts.ScriptTarget.ESNext
        });
        console.log(output);
    });
}
exports.bundle = bundle;