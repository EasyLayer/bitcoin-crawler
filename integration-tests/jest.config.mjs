import baseConfig from '../jest.config.mjs';

export default {
  ...baseConfig,
  roots: [
    "<rootDir>/src/"
  ],
  reporters: ['default', ['jest-junit', {
        outputDirectory: './reports',
        outputName: 'report.xml',
    }]],
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
    tsconfig: '<rootDir>/tsconfig.json',
    }]
  },
  testPathIgnorePatterns: baseConfig.testPathIgnorePatterns.concat([
    "<rootDir>/node_modules",
    "<rootDir>/dist"
  ]),
  setupFiles: ["<rootDir>/jest.setup.mjs"]
}; 