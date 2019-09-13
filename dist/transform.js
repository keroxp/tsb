"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Copyright 2019 Yusuke Sakurai. All rights reserved. MIT license.
const ts = require("typescript");
function createTsbImportAccess() {
    return ts.createPropertyAccess(ts.createIdentifier("tsb"), "import");
}
function createTsbImportDynamicAccess() {
    return ts.createPropertyAccess(ts.createIdentifier("tsb"), "importDynamic");
}
function createTsbExportAccess() {
    return ts.createPropertyAccess(ts.createIdentifier("tsb"), "exports");
}
function createTsbResolveCall(module, dep) {
    return ts.createCall(ts.createPropertyAccess(ts.createIdentifier("tsb"), "resolveModule"), undefined, [ts.createStringLiteral(module), dep]);
}
class Transformer {
    constructor(moduleId, moduleResolver) {
        this.moduleId = moduleId;
        this.moduleResolver = moduleResolver;
        this.shouldMergeExport = false;
        this.hasDynamicImport = false;
    }
    transformers() {
        const swapImport = (context) => (rootNode) => {
            const visit = (node) => {
                node = ts.visitEachChild(node, visit, context);
                if (ts.isImportDeclaration(node)) {
                    return this.transformImport(node);
                }
                else if (ts.isExportDeclaration(node)) {
                    return this.transformExportDeclaration(node);
                }
                else if (ts.isExportAssignment(node)) {
                    return this.transformExportAssignment(node);
                }
                else if (ts.isFunctionDeclaration(node)) {
                    return this.transformExportFunctionDeclaration(node);
                }
                else if (ts.isVariableStatement(node)) {
                    return this.transformExportVariableStatement(node);
                }
                else if (ts.isClassDeclaration(node)) {
                    return this.transformExportClassDeclaration(node);
                }
                else if (ts.isEnumDeclaration(node)) {
                    return this.transformExportEnumDeclaration(node);
                }
                else if (ts.isCallExpression(node)) {
                    return this.transformDynamicImport(node);
                }
                return node;
            };
            return ts.visitNode(rootNode, visit);
        };
        return [swapImport];
    }
    normalizeModuleSpecifier(m) {
        return this.moduleResolver(this.moduleId, m);
    }
    transformImport(node) {
        const importDecl = node;
        const module = this.normalizeModuleSpecifier(importDecl.moduleSpecifier.text);
        const importClause = importDecl.importClause;
        if (!importClause) {
            // import "aaa"
            // -> tsb.import("aaa")
            return ts.createCall(createTsbImportAccess(), undefined, [
                ts.createStringLiteral(module)
            ]);
        }
        const importName = importClause.name;
        const bindings = importClause.namedBindings;
        const args = ts.createStringLiteral(module);
        const importCall = ts.createCall(createTsbImportAccess(), undefined, [
            args
        ]);
        const ret = [];
        if (importName) {
            // import a from "aa"
            // -> const a = __tsbImport("aa").default
            ret.push(ts.createVariableStatement(undefined, [
                ts.createVariableDeclaration(importName, undefined, ts.createPropertyAccess(importCall, "default"))
            ]));
        }
        if (bindings) {
            if (ts.isNamedImports(bindings)) {
                // import { a, b } from "aa"
                // -> const {a, b} = tsb.import("typescript");
                const elements = bindings.elements.map(v => {
                    if (v.propertyName) {
                        return ts.createBindingElement(undefined, v.propertyName, v.name);
                    }
                    else {
                        return ts.createBindingElement(undefined, undefined, v.name);
                    }
                });
                ret.push(ts.createVariableStatement(undefined, [
                    ts.createVariableDeclaration(ts.createObjectBindingPattern(elements), undefined, importCall)
                ]));
            }
            else if (ts.isNamespaceImport(bindings)) {
                // import * as ts from "typescript"
                // -> const ts = tsb.import("typescript");
                ret.push(ts.createVariableStatement(undefined, [
                    ts.createVariableDeclaration(bindings.name, undefined, importCall)
                ]));
            }
        }
        return ret;
    }
    transformDynamicImport(node) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            this.hasDynamicImport = true;
            const [module] = node.arguments;
            let moduleSpecifier;
            if (ts.isStringLiteral(module)) {
                moduleSpecifier = ts.createStringLiteral(this.normalizeModuleSpecifier(module.text));
            }
            else {
                moduleSpecifier = createTsbResolveCall(this.moduleId, module);
            }
            return ts.createCall(createTsbImportDynamicAccess(), node.typeArguments, [
                moduleSpecifier
            ]);
        }
        return node;
    }
    transformExportDeclaration(node) {
        this.shouldMergeExport = true;
        const exportClause = node.exportClause;
        const module = node.moduleSpecifier;
        if (exportClause) {
            if (module) {
                const keyMap = exportClause.elements.map(v => {
                    let propertyName = v.name.text;
                    if (v.propertyName) {
                        propertyName = v.propertyName.text;
                    }
                    return ts.createPropertyAssignment(ts.createStringLiteral(propertyName), ts.createStringLiteral(v.name.text));
                });
                // export {a, b as B} from "..."
                // =>  __export(require("..."), {"a": "a", "b": "B"})
                const text = module.text;
                return ts.createCall(ts.createIdentifier("__export"), undefined, [
                    ts.createCall(createTsbImportAccess(), undefined, [
                        ts.createStringLiteral(this.normalizeModuleSpecifier(text))
                    ]),
                    ts.createObjectLiteral(keyMap)
                ]);
            }
            else {
                const assignments = exportClause.elements.map(v => {
                    let propertyName = v.name.text;
                    if (v.propertyName) {
                        propertyName = v.propertyName.text;
                        return ts.createPropertyAssignment(propertyName, ts.createIdentifier(v.name.text));
                    }
                    else {
                        return ts.createShorthandPropertyAssignment(propertyName);
                    }
                });
                // export { a, b as B}
                // => __export({a, B: b})
                return ts.createCall(ts.createIdentifier("__export"), undefined, [
                    ts.createObjectLiteral(assignments)
                ]);
            }
        }
        else {
            const text = module.text;
            return ts.createCall(ts.createIdentifier("__export"), undefined, [
                ts.createCall(createTsbImportAccess(), undefined, [
                    ts.createStringLiteral(this.normalizeModuleSpecifier(text))
                ])
            ]);
        }
    }
    transformExportAssignment(node) {
        if (node.isExportEquals) {
            // export = {}
            // -> tsb.exports = {}
            return ts.createAssignment(createTsbExportAccess(), node.expression);
        }
        else {
            // export default {}
            // -> tsb.exports.default = {}
            const name = node.name ? node.name.text : "default";
            return ts.createAssignment(ts.createPropertyAccess(createTsbExportAccess(), name), node.expression);
        }
    }
    transformExportFunctionDeclaration(node) {
        if (node.modifiers &&
            node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword) {
            if (node.modifiers[1] &&
                node.modifiers[1].kind === ts.SyntaxKind.DefaultKeyword) {
                // export default function a() {}
                // -> tsb.exports.default = function a() {}
                const [_, __, ...rest] = node.modifiers;
                return ts.createAssignment(ts.createPropertyAccess(createTsbExportAccess(), "default"), ts.createFunctionExpression([...rest], node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, node.body));
            }
            else {
                // export function a() {}
                // ->
                // function a() {}
                // tsb.exports.a = a;
                const [_, ...rest] = node.modifiers;
                return [
                    ts.createFunctionExpression([...rest], node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, node.body),
                    ts.createAssignment(ts.createPropertyAccess(createTsbExportAccess(), node.name), node.name)
                ];
            }
        }
        return node;
    }
    transformExportVariableStatement(node) {
        if (node.modifiers &&
            node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword) {
            // export const a = {}
            // ->
            // const a = {}
            // export.a = a;
            const [_, ...restModifiers] = node.modifiers;
            const declarations = ts.createVariableStatement(restModifiers, node.declarationList);
            const exprs = node.declarationList.declarations.map(v => {
                return ts.createAssignment(ts.createPropertyAccess(createTsbExportAccess(), v.name.text), v.name);
            });
            return [declarations, ...exprs];
        }
        return node;
    }
    transformExportClassDeclaration(node) {
        if (node.modifiers &&
            node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword) {
            let left;
            if (node.modifiers[1] &&
                node.modifiers[1].kind === ts.SyntaxKind.DefaultKeyword) {
                // export default class Class {}
                // -> tsb.exports.default = Class
                left = ts.createPropertyAccess(createTsbExportAccess(), "default");
            }
            else {
                // export class Class{}
                // -> tsb.exports.Class = Class;
                left = ts.createPropertyAccess(createTsbExportAccess(), node.name);
            }
            return ts.createAssignment(left, ts.createClassExpression(undefined, node.name, node.typeParameters, node.heritageClauses, node.members));
        }
        return node;
    }
    transformExportEnumDeclaration(node) {
        if (node.modifiers &&
            node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword) {
            // export enum Enum {}
            // -> enum Enum {}, tsb.exports.Enum = Enum
            const [_, ...rest] = node.modifiers;
            return [
                ts.createEnumDeclaration(node.decorators, [...rest], node.name, node.members),
                ts.createAssignment(ts.createPropertyAccess(createTsbExportAccess(), node.name), node.name)
            ];
        }
        return [node];
    }
}
exports.Transformer = Transformer;
