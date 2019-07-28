import chai from "chai";
import fs from "fs";
import sysPath from "path";
import { LoggedHost } from "../lib/host";
import { Vm } from "../lib/vm";
import meta from "./meta.js";
import { readFile, readTextFile } from "./utils";

const PROJECT_ROOT: string = sysPath.join(meta.dirname, "..", "..", "..");
const REPO_ROOT: string = sysPath.join(PROJECT_ROOT, "..");
const AVM1_SAMPLES_ROOT: string = sysPath.join(REPO_ROOT, "tests", "avm1");

// `BLACKLIST` can be used to forcefully skip some tests.
const BLACKLIST: ReadonlySet<string> = new Set([
  "avm1-bytes/constant-on-stack-definition", // Reads data from the uninitialized constant pool
  "avm1-bytes/constant-without-pool", // Reads data from the uninitialized constant pool
  "avm1-bytes/corrupted-push", // The parser does not supported corrupted actions yet
]);
// `WHITELIST` can be used to only enable a few tests.
const WHITELIST: ReadonlySet<string> = new Set([
  // "branches/conditional-if",
  // "try/try-catch-err",
  // "try/try-ok",
  // "haxe/hello-world",
]);

describe("avm1", function () {
  this.timeout(300000); // The timeout is this high due to CI being extremely slow

  for (const sample of getSamples()) {
    it(sample.name, async function () {
      const inputBytes: Buffer = await readFile(sample.avm1Path);
      const expectedLogs: string = await readTextFile(sample.logPath);

      const vm: Vm = new Vm();
      const host: LoggedHost = new LoggedHost();

      const scriptId: number = vm.createAvm1Script(inputBytes, null, null);
      vm.runToCompletion(scriptId, host);

      const actualLogs: string = host.logs.map(msg => `${msg}\n`).join("");

      chai.assert.deepEqual(actualLogs, expectedLogs);
    });
  }
});

interface Sample {
  root: string;
  name: string;
  avm1Path: string;
  logPath: string;
}

function* getSamples(): IterableIterator<Sample> {
  for (const dirEnt of fs.readdirSync(AVM1_SAMPLES_ROOT, {withFileTypes: true})) {
    if (!dirEnt.isDirectory() || dirEnt.name.startsWith(".")) {
      continue;
    }

    const groupName: string = dirEnt.name;
    const groupPath: string = sysPath.join(AVM1_SAMPLES_ROOT, groupName);

    for (const dirEnt of fs.readdirSync(groupPath, {withFileTypes: true})) {
      if (!dirEnt.isDirectory()) {
        continue;
      }
      const testName: string = dirEnt.name;
      const testPath: string = sysPath.join(groupPath, testName);

      const name: string = `${groupName}/${testName}`;

      if (BLACKLIST.has(name)) {
        continue;
      } else if (WHITELIST.size > 0 && !WHITELIST.has(name)) {
        continue;
      }

      const avm1Path: string = sysPath.join(testPath, "main.avm1");
      const logPath: string = sysPath.join(testPath, "main.log");

      yield {root: testPath, name, avm1Path, logPath};
    }
  }
}
