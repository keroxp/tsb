interface Tsb {
  import(module: string): any;
  exports: any;
  loaded: boolean;
}
((modules: { [id: string]: (tsb: Tsb) => void }, entryId: string) => {
  const installedModules: Map<string, Tsb> = new Map<string, Tsb>();
  function tsbImport(moduleId): any {
    if (installedModules.has(moduleId)) {
      return installedModules.get(moduleId)!.exports;
    }
    const module: Tsb = {
      import: tsbImport,
      loaded: false,
      exports: {}
    };
    installedModules.set(moduleId, module);
    modules[moduleId].call(null, module);
    module.loaded = true;
    return module.exports;
  }
  return tsbImport(entryId);
})(
  {
    /*{@modules}*/
  },
  "{@entryId}"
);
