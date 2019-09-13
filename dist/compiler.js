"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const path = require("path");
const bundle_1 = require("./bundle");
function createCompilerHost(options, moduleSearchLocations, urlResolver) {
    return {
        getSourceFile,
        getDefaultLibFileName: () => "lib.d.ts",
        writeFile: (fileName, content) => ts.sys.writeFile(fileName, content),
        getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
        getDirectories: path => ts.sys.getDirectories(path),
        getCanonicalFileName: fileName => ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
        getNewLine: () => ts.sys.newLine,
        useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
        fileExists,
        readFile,
        resolveModuleNames
    };
    function fileExists(fileName) {
        return ts.sys.fileExists(fileName);
    }
    function readFile(fileName) {
        return ts.sys.readFile(fileName);
    }
    function getSourceFile(fileName, languageVersion, onError) {
        const sourceText = ts.sys.readFile(fileName);
        return sourceText !== undefined
            ? ts.createSourceFile(fileName, sourceText, languageVersion)
            : undefined;
    }
    function resolveModuleNames(moduleNames, containingFile) {
        const resolvedModules = [];
        for (const moduleName of moduleNames) {
            if (moduleName.match(bundle_1.kUriRegex)) {
                resolvedModules.push({ resolvedFileName: urlResolver(moduleName) });
            }
            else {
                // try to use standard resolution
                let result = ts.resolveModuleName(moduleName, containingFile, options, {
                    fileExists,
                    readFile
                });
                if (result.resolvedModule) {
                    resolvedModules.push(result.resolvedModule);
                }
                else {
                    // check fallback locations, for simplicity assume that module at location
                    // should be represented by '.d.ts' file
                    for (const location of moduleSearchLocations) {
                        const modulePath = path.join(location, moduleName + ".d.ts");
                        if (fileExists(modulePath)) {
                            resolvedModules.push({ resolvedFileName: modulePath });
                        }
                    }
                }
            }
        }
        return resolvedModules;
    }
}
exports.createCompilerHost = createCompilerHost;
function compile(sourceFiles, moduleSearchLocations, urlResolver) {
    const options = {
        module: ts.ModuleKind.AMD,
        target: ts.ScriptTarget.ES5
    };
    const host = createCompilerHost(options, moduleSearchLocations, urlResolver);
    const program = ts.createProgram(sourceFiles, options, host);
    /// do something with program...
}
