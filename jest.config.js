module.exports = {
  testEnvironment: "node",

  roots: ["<rootDir>/tests"],
  //是否显示覆盖率报告
  collectCoverage: false,
  collectCoverageFrom: [
    "src/**/*.{js,jsx,ts,tsx}",
    "!src/**/*.d.ts"
  ],
  testMatch: [
    "<rootDir>/tests/*.{spec,test}.{js,jsx,ts,tsx}"
  ],

  // 需要使用相应的转换器转换一下
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": "ts-jest",
  },
  // 转换过程中，需要被忽略的文件。
  transformIgnorePatterns: [
    "[/\\\\]node_modules[/\\\\].+\\.(js|jsx|mjs|cjs|ts|tsx)$",
    "^.+\\.module\\.(css|sass|scss)$"
  ],
  modulePaths: [],

  // 支持的源码后缀名。
  moduleFileExtensions: [
    "web.js",
    "js",
    "web.ts",
    "ts",
    "web.tsx",
    "tsx",
    "json",
    "web.jsx",
    "jsx",
    "node"
  ],
  resetMocks: true,

  // 单元测试超时时间
  testTimeout: 60 * 1000
}