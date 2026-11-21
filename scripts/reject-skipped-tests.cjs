const path = require('node:path');

module.exports = class RejectSkippedTests {
  onRunComplete(_contexts, results) {
    const { numPendingTests, numPendingTestSuites, numTodoTests } = results;
    if (!numPendingTests && !numPendingTestSuites && !numTodoTests) return;

    const files = results.testResults
      .filter(
        (suite) => suite.skipped || suite.numPendingTests || suite.numTodoTests,
      )
      .map((suite) => path.relative(process.cwd(), suite.testFilePath));
    this.error = new Error(
      `Incomplete CI run: ${numPendingTests} skipped tests, ${numPendingTestSuites} skipped suites, ${numTodoTests} todo tests.\n${files.join('\n')}`,
    );
    console.error(this.error.message);
  }

  getLastError() {
    return this.error;
  }
};
