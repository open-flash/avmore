import chai from "chai";
import fs from "fs";
import sysPath from "path";
import { LoggedHost } from "../lib/host";
import { Vm } from "../lib/vm";
import meta from "./meta.js";

const PROJECT_ROOT: string = sysPath.join(meta.dirname, "..", "..", "..");
const TEST_SAMPLES_ROOT: string = sysPath.join(PROJECT_ROOT, "..", "tests");

describe("Avmore", function () {
  for (const sample of getSamples()) {
    it(sample.name, async function () {
      const input: Uint8Array = fs.readFileSync(
        sysPath.join(TEST_SAMPLES_ROOT, `${sample.name}.avm1`),
        {encoding: null},
      );
      const expectedLogs: string = fs.readFileSync(
        sysPath.join(TEST_SAMPLES_ROOT, `${sample.name}.log`),
        {encoding: "UTF-8"},
      );

      const host: LoggedHost = new LoggedHost();
      const vm: Vm = new Vm(host);

      const scriptId: number = vm.createAvm1Script(input, null, null);
      vm.runToCompletion(scriptId);

      const actualLogs: string = host.logs.map(msg => `${msg}\n`).join("");

      chai.assert.deepEqual(actualLogs, expectedLogs);
    });
  }
});

interface Sample {
  name: string;
}

function* getSamples(): IterableIterator<Sample> {
  yield {name: "hello-world"};
  yield {name: "object-access"};
  yield {name: "root-simple-assignment"};
  // yield {name: "root-undeclared-variable-use"};
  yield {name: "root-var-declaration"};
}
