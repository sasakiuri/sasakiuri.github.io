module.exports = {
  forbidden: [
    {
      name: "no-circular-runtime-dependencies",
      comment: "Runtime imports must not form cycles.",
      severity: "error",
      from: {},
      to: {
        circular: true,
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "no-components-to-app",
      comment: "Components must not import from src/app.",
      severity: "error",
      from: { path: "(?:^|/)src/components/" },
      to: { path: "(?:^|/)src/app/" },
    },
    {
      name: "no-config-to-ui",
      comment: "Site configuration must not import page or component code.",
      severity: "error",
      from: { path: "(?:^|/)src/config/" },
      to: { path: "(?:^|/)src/(app|components)/" },
    },
    {
      name: "no-dev-dependencies-in-production",
      comment: "Production modules must not import packages declared only as dev dependencies.",
      severity: "error",
      from: {
        path: "(?:^|/)src/",
        pathNot: ["\\.(stories|test)\\.tsx?$"],
      },
      to: { dependencyTypes: ["npm-dev"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
      mainFields: ["module", "main", "types"],
    },
    exclude: { path: ["\\.(stories|test)\\.tsx?$", "\\.d\\.ts$"] },
    includeOnly: { path: "(?:^|/)src/" },
    moduleSystems: ["es6"],
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
