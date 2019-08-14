interface Tsb {
  import(module: string): any;
  export: any;
  assignExport(b: any);
}
(() => {
  const definitions: Map<string, (tsb: Tsb) => void> = new Map();
  const exports: Map<string, any> = new Map();
  function joinRelative(from: string, to: string) {
    let _to = to;
    if (to.startsWith("../")) {
      _to = to.slice(2, to.length);
    } else {
      _to = to.slice(1, to.length);
    }
    let comps = from.split("/");
    const _from = comps.slice(0, comps.length - 2).join("/");
    return _from + _to;
  }
  function define(module: string, func: (tsb) => void) {
    definitions.set(module, func);
  }
  function tsbImport(module: string, dependency: string) {
    let id: string;
    if (module.match(/^\.\.?\//)) {
      // relative
      id = joinRelative(module, dependency);
    } else if (module.match(/^(https)?:\/\/(.+?)$/)) {
      id = module;
    } else {
      throw new Error(`invalid module specifier: ${module}`);
    }
    if (!exports.has(id)) {
      const require = definitions.get(id)!;
      const tsb = createTsb(module);
      require(tsb);
      exports.set(id, tsb.export);
    }
  }
  function createTsb(module: string): Tsb {
    return {
      import(dependency: string) {
        return tsbImport(module, dependency);
      },
      assignExport(part: any) {
        Object.assign(this.export, part);
      },
      export: {}
    };
  }
  //{@modules}
})();
