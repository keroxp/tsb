// Copyright 2019 Yusuke Sakurai. All rights reserved. MIT license.
import * as ts from "typescript";

function createTsbImportAccess(): ts.Expression {
  return ts.createPropertyAccess(ts.createIdentifier("tsb"), "import");
}
function createTsbImportDynamicAccess(): ts.Expression {
  return ts.createPropertyAccess(ts.createIdentifier("tsb"), "importDynamic");
}
function createTsbExportAccess(): ts.Expression {
  return ts.createPropertyAccess(ts.createIdentifier("tsb"), "exports");
}
export class Transformer {
  shouldMergeExport: boolean = false;

  constructor(
    readonly moduleId: string,
    readonly moduleResolver: (moduleId: string, dep: string) => string
  ) {}

  transformers() {
    const swapImport = <T extends ts.Node>(
      context: ts.TransformationContext
    ) => (rootNode: T) => {
      const visit = (node: ts.Node): ts.VisitResult<ts.Node> => {
        node = ts.visitEachChild(node, visit, context);
        if (ts.isImportDeclaration(node)) {
          return this.transformImport(node);
        } else if (ts.isExportDeclaration(node)) {
          return this.transformExportDeclaration(node);
        } else if (ts.isExportAssignment(node)) {
          return this.transformExportAssignment(node);
        } else if (ts.isFunctionDeclaration(node)) {
          return this.transformExportFunctionDeclaration(node);
        } else if (ts.isVariableStatement(node)) {
          return this.transformExportVariableStatement(node);
        } else if (ts.isClassDeclaration(node)) {
          return this.transformExportClassDeclaration(node);
        } else if (ts.isEnumDeclaration(node)) {
          return this.transformExportEnumDeclaration(node);
        } else if (ts.isCallExpression(node)) {
          return this.transformDynamicImport(node);
        }
        return node;
      };
      return ts.visitNode(rootNode, visit);
    };
    return [swapImport];
  }

  normalizeModuleSpecifier(m: string): string {
    return this.moduleResolver(this.moduleId, m);
  }

  transformImport(node: ts.ImportDeclaration): ts.VisitResult<ts.Node> {
    const importDecl: ts.ImportDeclaration = node;
    const module = this.normalizeModuleSpecifier(
      (importDecl.moduleSpecifier as ts.StringLiteral).text
    );
    const importClause = importDecl.importClause;
    if (!importClause) {
      // import "aaa"
      // -> tsb.import("aaa")
      return ts.createCall(createTsbImportAccess(), undefined, [
        ts.createStringLiteral(module)
      ]);
    }
    const importName = importClause.name;
    const bindings = importClause!.namedBindings;
    const args = ts.createStringLiteral(module);
    const importCall = ts.createCall(createTsbImportAccess(), undefined, [
      args
    ]);
    const ret: ts.Node[] = [];
    if (importName) {
      // import a from "aa"
      // -> const a = __tsbImport("aa").default
      ret.push(
        ts.createVariableStatement(undefined, [
          ts.createVariableDeclaration(
            importName,
            undefined,
            ts.createPropertyAccess(importCall, "default")
          )
        ])
      );
    }
    if (bindings) {
      if (ts.isNamedImports(bindings)) {
        // import { a, b } from "aa"
        // -> const {a, b} = tsb.import("typescript");
        const elements = bindings.elements.map(v => {
          if (v.propertyName) {
            return ts.createBindingElement(undefined, v.propertyName, v.name);
          } else {
            return ts.createBindingElement(undefined, undefined, v.name);
          }
        });
        ret.push(
          ts.createVariableStatement(undefined, [
            ts.createVariableDeclaration(
              ts.createObjectBindingPattern(elements),
              undefined,
              importCall
            )
          ])
        );
      } else if (ts.isNamespaceImport(bindings)) {
        // import * as ts from "typescript"
        // -> const ts = tsb.import("typescript");
        ret.push(
          ts.createVariableStatement(undefined, [
            ts.createVariableDeclaration(bindings.name, undefined, importCall)
          ])
        );
      }
    }
    return ret;
  }

  transformDynamicImport(node: ts.CallExpression): ts.Node {
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const module = node.arguments[0] as ts.StringLiteral;
      return ts.createCall(createTsbImportDynamicAccess(), node.typeArguments, [
        ts.createStringLiteral(this.normalizeModuleSpecifier(module.text))
      ]);
    }
    return node;
  }

  transformExportDeclaration(node: ts.ExportDeclaration): ts.Node {
    const exportClause = node.exportClause;
    const module = node.moduleSpecifier;
    if (exportClause) {
      const exprs = exportClause.elements.map(v => {
        let propertyName: string = v.name.text;
        if (v.propertyName) {
          propertyName = v.propertyName.text;
        }
        let right: ts.Expression;
        if (module) {
          const text = (module as ts.StringLiteral).text;
          right = ts.createPropertyAccess(
            ts.createCall(createTsbImportAccess(), undefined, [
              ts.createStringLiteral(this.normalizeModuleSpecifier(text))
            ]),
            propertyName
          );
        } else {
          right = v.name;
        }
        return ts.createAssignment(
          ts.createPropertyAccess(createTsbExportAccess(), v.name.text),
          right
        );
      });
      return ts.createCommaList(exprs);
    } else {
      const text = (module as ts.StringLiteral).text;
      this.shouldMergeExport = true;
      return ts.createCall(ts.createIdentifier("__export"), undefined, [
        ts.createCall(createTsbImportAccess(), undefined, [
          ts.createStringLiteral(this.normalizeModuleSpecifier(text))
        ])
      ]);
    }
  }

  transformExportAssignment(node: ts.ExportAssignment): ts.Node {
    if (node.isExportEquals) {
      // export = {}
      // -> tsb.export = {}
      return ts.createAssignment(createTsbExportAccess(), node.expression);
    } else {
      // export default {}
      // -> tsb.export.default = {}
      const name = node.name ? node.name.text : "default";
      return ts.createAssignment(
        ts.createPropertyAccess(createTsbExportAccess(), name),
        node.expression
      );
    }
  }

  transformExportFunctionDeclaration(
    node: ts.FunctionDeclaration
  ): ts.VisitResult<ts.Node> {
    if (
      node.modifiers &&
      node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword
    ) {
      if (
        node.modifiers[1] &&
        node.modifiers[1].kind === ts.SyntaxKind.DefaultKeyword
      ) {
        // export default function a() {}
        // -> export.default = function a() {}
        const [_, __, ...rest] = node.modifiers;
        return ts.createAssignment(
          ts.createPropertyAccess(createTsbExportAccess(), "default"),
          ts.createFunctionExpression(
            [...rest],
            node.asteriskToken,
            node.name,
            node.typeParameters,
            node.parameters,
            node.type,
            node.body!
          )
        );
      } else {
        // export function a() {}
        // ->
        // function a() {}
        // export.a = a;
        const [_, ...rest] = node.modifiers;
        return [
          ts.createFunctionExpression(
            [...rest],
            node.asteriskToken,
            node.name,
            node.typeParameters,
            node.parameters,
            node.type,
            node.body!
          ),
          ts.createAssignment(
            ts.createPropertyAccess(createTsbExportAccess(), node.name!),
            node.name!
          )
        ];
      }
    }
    return node;
  }

  transformExportVariableStatement(node: ts.VariableStatement) {
    if (
      node.modifiers &&
      node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword
    ) {
      // export const a = {}
      // ->
      // const a = {}
      // export.a = a;
      const [_, ...restModifiers] = node.modifiers;
      const declarations = ts.createVariableStatement(
        restModifiers,
        node.declarationList
      );
      const exprs = node.declarationList.declarations.map(v => {
        return ts.createAssignment(
          ts.createPropertyAccess(
            createTsbExportAccess(),
            (v.name as ts.Identifier).text
          ),
          v.name as ts.Identifier
        );
      });
      return [declarations, ...exprs];
    }
    return node;
  }

  transformExportClassDeclaration(node: ts.ClassDeclaration) {
    if (
      node.modifiers &&
      node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword
    ) {
      let left: ts.Expression;
      if (
        node.modifiers[1] &&
        node.modifiers[1].kind === ts.SyntaxKind.DefaultKeyword
      ) {
        // export default class Class {}
        // -> tsb.export.default = Class
        left = ts.createPropertyAccess(createTsbExportAccess(), "default");
      } else {
        // export class Class{}
        // -> tsb.export.Class = Class;
        left = ts.createPropertyAccess(createTsbExportAccess(), node.name!);
      }
      return ts.createAssignment(
        left,
        ts.createClassExpression(
          undefined,
          node.name,
          node.typeParameters,
          node.heritageClauses,
          node.members
        )
      );
    }
    return node;
  }

  transformExportEnumDeclaration(node: ts.EnumDeclaration): ts.Node[] {
    if (
      node.modifiers &&
      node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword
    ) {
      // export enum Enum {}
      // -> enum Enum {}, tsb.export.Enum = Enum
      const [_, ...rest] = node.modifiers;
      return [
        ts.createEnumDeclaration(
          node.decorators,
          [...rest],
          node.name,
          node.members
        ),
        ts.createAssignment(
          ts.createPropertyAccess(createTsbExportAccess(), node.name),
          node.name
        )
      ];
    }
    return [node];
  }
}
