// Internal: TestRunner is responsible for actually running through each
// suite of tests and executing the specs.
//
// It also presents the test results and ensures a report is sent to cavy-cli
// if necessary.
//
// component  - the Tester component within which the app is wrapped.
// testSuites - an array of TestScopes, each of which relate to a single suite
//              of tests.
// startDelay - length of time in ms that cavy should wait before starting
//              tests.
// reporter   - the function called with the test report as an argument once
//              all tests have finished.
//
export default class TestRunner {
  constructor(component, testSuites, startDelay, reporter, sendReport, filter) {
    this.component = component;
    this.testSuites = testSuites;
    this.startDelay = startDelay;
    this.reporter = reporter;
    // Using the sendReport prop is deprecated - cavy checks whether the
    // cavy-cli server is listening and sends a report if true.
    this.shouldSendReport = sendReport;
    // An array of strings dictating the subset of tagged tests to run, or null
    // if all tests should be run.
    this.filter = filter;
    this.results = [];
    this.errorCount = 0;
  }

  // Internal: Start tests after optional delay time.
  async run() {
    if (this.startDelay) { await this.pause(this.startDelay)};
    this.runTestSuites();
  }

  // Internal: Synchronously runs each test suite one after the other,
  // sending a test report to cavy-cli if needed.
  async runTestSuites() {
    const start = new Date();
    console.log(`Cavy test suite started at ${start}.`);

    // Iterate through each suite...
    for (let i = 0; i < this.testSuites.length; i++) {
      // And then through the suite's test cases...
      for (let j = 0; j < this.testSuites[i].testCases.length; j++) {
        let scope = this.testSuites[i];
        let tag = scope.testCases[j].tag;
        // Run the test if:
        // 1. The test suite isn't filtered
        // 2. The test suite is filtered and test's tag is included
        if (!this.filter || (this.filter && this.filter.includes(tag))) {
          await this.runTest(scope, scope.testCases[j]);
        };
      }
    }

    const stop = new Date();
    const duration = (stop - start) / 1000;
    console.log(`Cavy test suite stopped at ${stop}, duration: ${duration} seconds.`);

    // Handle use of deprecated prop `sendReport` and honour previous expected
    // behaviour by not reporting results if set to false;
    if (this.shouldSendReport != undefined) {
      const message = 'Deprecation warning: using the `sendReport` prop is ' +
                      'deprecated. By default, Cavy now checks whether the ' +
                      'cavy-cli server is running and sends a report if a ' +
                      'connection is detected.'
      console.warn(message);

      if (!this.shouldSendReport) return;
    }

    const fullResults = {
      time: duration,
      timestamp: start,
      testCases: this.results
    }

    // Compile the report object.
    const report = {
      results: this.results,
      fullResults: fullResults,
      errorCount: this.errorCount,
      duration: duration
    }

    // Send report to reporter (default is cavy-cli)
    if (this.reporter instanceof Function) {
      await this.reporter(report);
    } else if (this.reporter.type == 'realtime') {
      await this.reporter.onFinish(report);
    } else if (this.reporter.type == 'deferred') {
      await this.reporter.send(report);
    } else {
      message = 'Could not find a valid reporter. For more ' +
                'information on custom reporters, see the documentation ' +
                'here: https://cavy.app/docs/guides/writing-custom-reporters';
      console.log(message);
    }
  }

  // Internal: Synchronously runs each test case within a test suite, outputting
  // on the console if the test passes or fails, and adding to testResult
  // array for reporting purposes.
  //
  // Order of actions:
  // 1. Clears AsyncStorage
  // 2. Calls a beforeEach function
  // 3. Re-renders the app
  // 4. Runs the test
  async runTest(scope, test) {
    const start = new Date();

    await this.component.clearAsync();

    if (scope.beforeEach) { await scope.beforeEach.call(scope) };
    
    this.component.reRender();

    const { describeLabel, label, f } = test;
    const description = `${describeLabel}: ${label}`;

    // Run the test, console logging the result.
    try {
      await f.call(scope);
      const stop = new Date();
      const time = (stop - start) / 1000;

      let successMsg = `${description}  ✅`;
      console.log(successMsg);

      this.results.push({
        describeLabel: describeLabel,
        description: description,
        message: successMsg,
        passed: true,
        time: time
      });

      if (!(this.reporter instanceof Function)
        && this.reporter.type == 'realtime' ) {
        const result = { message: successMsg, passed: true };
        this.reporter.send(result);
      }

    } catch (e) {
      const stop = new Date();
      const time = (stop - start) / 1000;
      
      let fullErrorMessage = `${description}  ❌\n   ${e.message}`;
      console.warn(fullErrorMessage);

      this.results.push({
        describeLabel: describeLabel,
        description: description,
        message: fullErrorMessage,
        errorMessage: e.message,
        passed: false,
        time: time
      });

      if (!(this.reporter instanceof Function)
        && this.reporter.type == 'realtime' ) {
        const result = { message: fullErrorMessage, passed: false };
        this.reporter.send(result);
      }

      // Increase error count for reporting.
      this.errorCount += 1;
    }
  }

  // Internal: Pauses the test runner for a length of time.
  // Returns a promise.
  async pause(time) {
    let promise = new Promise((resolve, reject) => {
      setTimeout(function() {
        resolve();
      }, time);
    });

    return promise;
  }
}
