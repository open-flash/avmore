import chai from "chai";
import fs from "fs";
import sysPath from "path";
import {
  AVM_EMPTY_STRING,
  AVM_FALSE,
  AVM_UNDEFINED,
  AvmPropDescriptor,
  AvmSimpleObject,
  AvmValue
} from "../lib/avm-value";
import { HostCallContext } from "../lib/function";
import { LoggedHost } from "../lib/host";
import { bindingFromHostFunction } from "../lib/realm";
import { TargetId, Vm } from "../lib/vm";
import meta from "./meta.js";
import { readFile, readTextFile } from "./utils";

const PROJECT_ROOT: string = sysPath.join(meta.dirname, "..", "..", "..");
const REPO_ROOT: string = sysPath.join(PROJECT_ROOT, "..");
const AVM1_SAMPLES_ROOT: string = sysPath.join(REPO_ROOT, "tests", "avm1");

// `BLACKLIST` can be used to forcefully skip some tests.
const BLACKLIST: ReadonlySet<string> = new Set([
  "avm1-bytes/constant-on-stack-definition", // Reads data from the uninitialized constant pool
  "avm1-bytes/constant-without-pool", // Reads data from the uninitialized constant pool
  "nested-try/try-nested-return", // Requires compat behavior on nested try
  "nested-try/try-nested-return-indirect", // Requires compat behavior on nested try
  "nested-try/try-nested-return-ok-somehow", // Requires compat behavior on nested try
]);
// `WHITELIST` can be used to only enable a few tests.
const WHITELIST: ReadonlySet<string> = new Set([
  // "branches/conditional-if",
  // "try/try-catch-err",
  // "try/try-ok",
  // "try/try-throw-catch-finally-err",
  // "haxe/hello-world",
]);

describe("avm1", function () {
  this.timeout(300000); // The timeout is this high due to CI being extremely slow

  for (const sample of getSamples()) {
    it(sample.name, async function () {
      const inputBytes: Buffer = await readFile(sample.avm1Path);
      const expectedLogs: string = await readTextFile(sample.logPath);

      const vm: Vm = new Vm();

      const globalObject: AvmSimpleObject = vm.newObject();
      vm.realm.globals.set("_global", globalObject);
      vm.realm.globals.set("_root", globalObject);
      vm.realm.globals.set("_lockroot", globalObject);
      vm.realm.globals.set("_level", globalObject);
      vm.realm.globals.set("_parent", globalObject);
      for (const [globalName, globalValue] of vm.realm.globals) {
        globalObject.ownProperties.set(globalName, AvmPropDescriptor.data(globalValue));
      }
      {
        const flashPackage: AvmSimpleObject = vm.newObject();
        globalObject.ownProperties.set("flash", AvmPropDescriptor.data(flashPackage));
        flashPackage.ownProperties.set("_MovieClip", AvmPropDescriptor.data(vm.newObject()));
        flashPackage.ownProperties.set("display", AvmPropDescriptor.data(vm.newObject()));
        flashPackage.ownProperties.set("filters", AvmPropDescriptor.data(vm.newObject()));
        flashPackage.ownProperties.set("geom", AvmPropDescriptor.data(vm.newObject()));
        flashPackage.ownProperties.set("text", AvmPropDescriptor.data(vm.newObject()));
        flashPackage.ownProperties.set("Lib", AvmPropDescriptor.data(vm.newObject()));
      }
      globalObject.ownProperties.set("haxe", AvmPropDescriptor.data(vm.newObject()));
      globalObject.ownProperties.set("haxeInitDone", AvmPropDescriptor.data(AVM_FALSE));
      {
        const stageObject: AvmSimpleObject = vm.newObject();
        globalObject.ownProperties.set("Stage", AvmPropDescriptor.data(stageObject));
        stageObject.ownProperties.set("align", AvmPropDescriptor.data(AVM_EMPTY_STRING));
      }
      globalObject.ownProperties.set("MovieClip", AvmPropDescriptor.data(vm.newObject()));
      globalObject.ownProperties.set("TextField", AvmPropDescriptor.data(vm.newObject()));
      globalObject.ownProperties.set("TextFormat", AvmPropDescriptor.data(vm.newObject()));
      globalObject.ownProperties.set("TextSnapshot", AvmPropDescriptor.data(vm.newObject()));
      {
        const textFieldObject: AvmSimpleObject = vm.newObject();
        globalObject.ownProperties.set("TextField", AvmPropDescriptor.data(textFieldObject));
        textFieldObject.ownProperties.set("StyleSheet", AvmPropDescriptor.data(vm.newObject()));
      }
      globalObject.ownProperties.set("_alpha", AvmPropDescriptor.data(AvmValue.fromHostNumber(100)));
      globalObject.ownProperties.set("blendMode", AvmPropDescriptor.data(AvmValue.fromHostString("normal")));
      globalObject.ownProperties.set("cacheAsBitmap", AvmPropDescriptor.data(AVM_FALSE));
      globalObject.ownProperties.set("_currentframe", AvmPropDescriptor.data(AvmValue.fromHostNumber(1)));
      globalObject.ownProperties.set("_framesloaded", AvmPropDescriptor.data(AvmValue.fromHostNumber(2)));
      globalObject.ownProperties.set("_totalframes", AvmPropDescriptor.data(AvmValue.fromHostNumber(2)));
      globalObject.ownProperties.set("print", AvmPropDescriptor.data(bindingFromHostFunction(
        vm.realm.functionPrototype,
        (ctx: HostCallContext): AvmValue => {
          host.trace(ctx.toHostString(ctx.getArg(0)));
          return AVM_UNDEFINED;
        },
      )));

      const host: LoggedHost = new LoggedHost();

      const targetId: TargetId = host.createTarget(globalObject);

      const scriptId: number = vm.createAvm1Script(inputBytes, targetId, globalObject);
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
