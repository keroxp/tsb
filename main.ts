import * as ts from "typescript";
import * as fs from "fs";
import { StringLiteral } from "typescript";

function createTransformers() {
  const swapImport = <T extends ts.Node>(context: ts.TransformationContext) => (
    rootNode: T
  ) => {
    function visit(node: ts.Node): ts.Node {
      node = ts.visitEachChild(node, visit, context);
      if (ts.isImportDeclaration(node)) {
        return transformImport(node);
      } else if (ts.isExportDeclaration(node)) {
        return transformExportDeclaration(node);
      } else if (ts.isExportAssignment(node)) {
        return transformExportAssignment(node);
      } else if (ts.isFunctionDeclaration(node)) {
        return transformExportFunctionDeclaration(node);
      } else if (ts.isVariableStatement(node)) {
        return transformExportVariableStatement(node);
      } else if (ts.isClassDeclaration(node)) {
        return transformExportClassDeclaration(node);
      }
      return node;
    }
    return ts.visitNode(rootNode, visit);
  };
  return [swapImport];
}

function createTsbImportAccess(): ts.Expression {
  return ts.createPropertyAccess(ts.createIdentifier("tsb"), "import");
}
function createTsbExportAccess(): ts.Expression {
  return ts.createPropertyAccess(ts.createIdentifier("tsb"), "export");
}

function transformImport(node: ts.ImportDeclaration): ts.Node {
  const importDecl: ts.ImportDeclaration = node;
  const module = (importDecl.moduleSpecifier as any).text;
  const importName = importDecl.importClause!.name;
  const bindings = importDecl.importClause!.namedBindings;
  const args = ts.createStringLiteral(module);
  const importCall = ts.createCall(createTsbImportAccess(), undefined, [args]);
  if (importName) {
    // import a from "aa"
    // -> const a = __tsbImport("aa").default
    return ts.createVariableStatement(undefined, [
      ts.createVariableDeclaration(
        importName,
        undefined,
        ts.createPropertyAccess(importCall, "default")
      )
    ]);
  } else if (bindings) {
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
      return ts.createVariableStatement(undefined, [
        ts.createVariableDeclaration(
          ts.createObjectBindingPattern(elements),
          undefined,
          importCall
        )
      ]);
    } else if (ts.isNamespaceImport(bindings)) {
      // import * as ts from "typescript"
      // -> const ts = tsb.import("typescript");
      return ts.createVariableStatement(undefined, [
        ts.createVariableDeclaration(bindings.name, undefined, importCall)
      ]);
    }
  }
  throw "a";
}

function transformExportDeclaration(node: ts.ExportDeclaration): ts.Node {
  const exportClause = node.exportClause;
  const module = node.moduleSpecifier as StringLiteral;
  if (exportClause) {
    const exprs = exportClause.elements.map(v => {
      let propertyName: string = v.name.text;
      if (v.propertyName) {
        propertyName = v.propertyName.text;
      }
      return ts.createAssignment(
        ts.createPropertyAccess(createTsbExportAccess(), v.name.text),
        ts.createPropertyAccess(
          ts.createCall(createTsbImportAccess(), undefined, [module]),
          propertyName
        )
      );
    });
    return ts.createCommaList(exprs);
  } else {
    return ts.createCall(
      ts.createPropertyAccess(ts.createIdentifier("tsb"), "assignExport"),
      undefined,
      [ts.createCall(createTsbImportAccess(), undefined, [module])]
    );
  }
}

function transformExportAssignment(node: ts.ExportAssignment): ts.Node {
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

function transformExportFunctionDeclaration(
  node: ts.FunctionDeclaration
): ts.Node {
  if (
    node.modifiers &&
    node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword
  ) {
    // export function a() {}
    // -> export.a = function a() {}
    return ts.createAssignment(
      ts.createPropertyAccess(createTsbExportAccess(), node.name!),
      ts.createFunctionExpression(
        undefined,
        undefined,
        node.name,
        undefined,
        undefined,
        undefined,
        node.body!
      )
    );
  }
  return node;
}
function transformExportVariableStatement(node: ts.VariableStatement) {
  if (
    node.modifiers &&
    node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword
  ) {
    // export const a = {}
    // -> export.a = {};
    const exprs = node.declarationList.declarations.map(v => {
      return ts.createAssignment(
        ts.createPropertyAccess(
          createTsbExportAccess(),
          (v.name as ts.Identifier).text
        ),
        v.initializer!
      );
    });
    return ts.createCommaList(exprs);
  }
  return node;
}
function transformExportClassDeclaration(node: ts.ClassDeclaration) {
  if (
    node.modifiers &&
    node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword
  ) {
    // export class Class{}
    // -> export.Class = Class;
    return ts.createAssignment(
      ts.createPropertyAccess(createTsbExportAccess(), node.name!),
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
async function action() {
  const srcText = String(fs.readFileSync("./example/example.ts"));
  const src = ts.createSourceFile(
    "example.ts",
    srcText,
    ts.ScriptTarget.ESNext
  );
  const transformers = createTransformers();
  const result = ts.transform(src, transformers);
  const printer = ts.createPrinter();
  const transformed = printer.printFile(result.transformed[0] as ts.SourceFile);
  console.log(transformed);
}
action();

export interface Tsb {
  import();
  export: any;
  assignExport(b: any);
}
export type TsbModule = (moduleSpecifier: string, tsb: Tsb) => unknown;
