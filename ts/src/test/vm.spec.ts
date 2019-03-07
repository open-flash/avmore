import { ActionType } from "avm1-tree/action-type";
import { ValueType } from "avm1-tree/value-type";
import chai from "chai";
import { LoggedHost } from "../lib/host";
import { ExecutionContext } from "../lib/vm";

describe("vm", function () {
  it("should exec hello world", function () {
    const host: LoggedHost = new LoggedHost();

    const ectx: ExecutionContext = new ExecutionContext(host);
    ectx.exec({
      action: ActionType.Push,
      values: [{type: ValueType.String, value: "Hello, World!"}],
    });
    ectx.exec({action: ActionType.Trace});

    const expectedLogs: ReadonlyArray<string> = [
      "Hello, World!",
    ];

    chai.assert.deepEqual(host.logs, expectedLogs);
  });
});
