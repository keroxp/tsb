// Copyright 2019 Yusuke Sakurai. All rights reserved. MIT license.
interface Tsb {
  import(module: string): any;
  importDynamic(module: string): Promise<any>;
  resolveModule(moduleId: string, dep: string): string;
  exports: any;
  loaded: boolean;
}
((modules: { [id: string]: (tsb: Tsb) => void }, entryId: string) => {
  const installedModules: Map<string, Tsb> = new Map<string, Tsb>();
  const uriRegex = /^http?s:\/\//;
  const relativeRegex = /^\.\.?\/.+?\.[tj]s$/;
  function resolveModule(moduleId: string, dep: string): string {
    if (dep.match(uriRegex)) {
      // any + url
      return dep;
    } else if (moduleId.match(uriRegex)) {
      // url + regex
      return new URL(dep, moduleId).href;
    } else if (moduleId.match(relativeRegex)) {
      // relative + relative
      const stack = moduleId.split("/");
      const parts = dep.split("/");
      stack.pop();
      for (const part of parts) {
        if (part === "..") {
          stack.pop();
        } else if (part !== ".") {
          stack.push(part);
        }
      }
      return "./" + stack.join("/");
    } else {
      throw new Error(`invalid dependency: ${moduleId}, ${dep}`);
    }
  }
  function importInternal(moduleId: string): any {
    if (installedModules.has(moduleId)) {
      return installedModules.get(moduleId)!.exports;
    }
    const module: Tsb = {
      import: tsbImport,
      importDynamic: tsbImportDynamic,
      resolveModule,
      loaded: false,
      exports: {}
    };
    installedModules.set(moduleId, module);
    modules[moduleId].call(null, module);
    module.loaded = true;
    return module.exports;
  }
  async function tsbImportDynamic(moduleId): Promise<any> {
    if (moduleId[moduleId]) {
      return importInternal(moduleId);
    } else {
      // fallback to dynamic import
      return import(moduleId);
    }
  }
  function tsbImport(moduleId): any {
    return importInternal(moduleId);
  }
  return tsbImport(entryId);
})(
  {
    /*{@modules}*/
  },
  "{@entryId}"
);
