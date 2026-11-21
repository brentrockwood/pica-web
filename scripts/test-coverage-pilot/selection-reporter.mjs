import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Keep collection identity and unsupported execution modes even for skipped tests.
export default class SelectionReporter {
  onTestRunEnd(modules, errors, reason) {
    const tests = modules.flatMap(module => [...module.children.allTests()].map(test => ({
      file: module.moduleId, title: test.name, fullName: test.fullName,
      location: test.location, options: test.options, result: test.result(), diagnostic: test.diagnostic(),
    })));
    writeFileSync(resolve(process.env.ISOLATION_OUTPUT, "selection.json"), JSON.stringify({ reason, errors, tests }));
  }
}
