import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import * as cacheDir from "cachedir";

function createTransformers() {
  const swapImport = <T extends ts.Node>(context: ts.TransformationContext) => (
    rootNode: T
  ) => {
    function visit(node: ts.Node): ts.VisitResult<ts.Node> {
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
      } else if (ts.isEnumDeclaration(node)) {
        return transformExportEnumDeclaration(node);
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
  const module = node.moduleSpecifier;
  if (exportClause) {
    const exprs = exportClause.elements.map(v => {
      let propertyName: string = v.name.text;
      if (v.propertyName) {
        propertyName = v.propertyName.text;
      }
      let right: ts.Expression;
      if (module) {
        right = ts.createPropertyAccess(
          ts.createCall(createTsbImportAccess(), undefined, [module]),
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
    return ts.createCall(
      ts.createPropertyAccess(ts.createIdentifier("tsb"), "assignExport"),
      undefined,
      [ts.createCall(createTsbImportAccess(), undefined, [module!])]
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
          undefined,
          node.name,
          undefined,
          undefined,
          undefined,
          node.body!
        )
      );
    } else {
      // export function a() {}
      // -> export.a = function a() {}
      const [_, ...rest] = node.modifiers;
      return ts.createAssignment(
        ts.createPropertyAccess(createTsbExportAccess(), node.name!),
        ts.createFunctionExpression(
          [...rest],
          undefined,
          node.name,
          undefined,
          undefined,
          undefined,
          node.body!
        )
      );
    }
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

function transformExportEnumDeclaration(node: ts.EnumDeclaration): ts.Node[] {
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
async function readFileAsync(file: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(file, (err, data) => {
      err ? reject(err) : resolve(String(data));
    });
  });
}

const kUriRegex = /^(https?):\/\/(.+?)$/;
const kRelativeRegex = /^\.\.?\/.+?\.ts$/;

async function traverseDependencyTree(
  file: string,
  dependencyTree: Map<string, string[]>
): Promise<void> {
  if (dependencyTree.has(file)) {
    return;
  }
  const dependencies: string[] = [];
  dependencyTree.set(file, dependencies);
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const dependency = (node.moduleSpecifier as ts.StringLiteral).text;
      dependencies.push(dependency);
    }
  }
  const text = await readFileAsync(file);
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext);
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
      const dir = path.dirname(file);
      resolvedPath = path.resolve(path.join(dir, dependency));
    } else {
      throw new Error("invalid module specifier: " + file);
    }
    await traverseDependencyTree(resolvedPath, dependencyTree);
  }
}

async function bundle(entry: string) {
  const tree = new Map();
  await traverseDependencyTree(entry, tree);
  // console.log(tree.entries());
  const transformers = createTransformers();
  const printer = ts.createPrinter();
  let template = await readFileAsync("./template.ts");
  const modules: string[] = [];
  for (const [file, dependency] of tree.entries()) {
    const text = await readFileAsync(file);
    const id = path.relative(entry, file);
    const src = ts.createSourceFile(id, text, ts.ScriptTarget.ESNext);
    const result = ts.transform(src, transformers);
    const transformed = printer.printFile(result
      .transformed[0] as ts.SourceFile);
    const transpiled = ts.transpile(transformed, {
      target: ts.ScriptTarget.ESNext
    });
    modules.push(`define("${file}", (tsb) => { ${transpiled} })`);
  }
  const body = `${modules.join(",")}`;
  template = template.replace("//{@modules}", body);
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
  const entry = "./" + path.relative(".", target);
  await bundle(entry);
}

action();
