import { Avm1Parser } from "avm1-parser";
import { Action } from "avm1-tree/action";
import { ActionType } from "avm1-tree/action-type";
import { Push, SetTarget } from "avm1-tree/actions";
import { ValueType as AstValueType } from "avm1-tree/value-type";
import { Host, Target } from "./host";

const SWF_VERSION: number = 8;

// export class Vm {
//   execAvm1(avm1: Uint8Array) {
//     const parser =
//   };
// }

export type Avm1ScriptId = number;
export type TargetId = number;

export interface Avm1Script {
  readonly id: Avm1ScriptId;
  readonly bytes: Uint8Array;

  /**
   * Default target for this script.
   *
   * Used for contextual actions such as `gotoAndPlay` or `stop`.
   * Value used for `setTarget("");`
   */
  readonly target: TargetId | null;
}

export class Vm {
  private nextScriptId: number;
  private readonly scriptsById: Map<Avm1ScriptId, Avm1Script>;

  constructor() {
    this.nextScriptId = 0;
    this.scriptsById = new Map();
  }

  createAvm1Script(avm1Bytes: Uint8Array, target: TargetId | null): Avm1ScriptId {
    const id: number = this.nextScriptId++;
    const script: Avm1Script = {id, bytes: avm1Bytes, target};
    this.scriptsById.set(id, script);
    return id;
  }

  runToCompletion(scriptId: Avm1ScriptId, host: Host, maxActions: number = 1000): void {
    const script: Avm1Script | undefined = this.scriptsById.get(scriptId);
    if (script === undefined) {
      throw new Error(`ScriptNotFound: ${scriptId}`);
    }
    const ectx: ExecutionContext = new ExecutionContext(host, script.target);
    const parser: Avm1Parser = new Avm1Parser(script.bytes);
    let actionCount: number = 0;
    while (actionCount < maxActions) {
      const action: Action | undefined = parser.readNext();
      if (action === undefined) {
        break;
      }
      ectx.exec(action);
      actionCount++;
    }
    if (actionCount === maxActions) {
      throw new Error("ActionTimeout");
    }
  }
}

export type AvmString = string;

export type AvmValue = AvmString | any;

// tslint:disable-next-line:typedef variable-name
export const AvmValue = {
  // fromAst(astValue: AstValue): AvmValue {
  //
  // }
  toAvmString(value: AvmValue, _swfVersion: number): AvmString {
    return String(value);
  },
};

class AvmStack {
  private readonly stack: AvmValue[];

  constructor() {
    this.stack = [];
  }

  public push(value: AvmValue): void {
    this.stack.push(value);
  }

  public pop(): AvmValue {
    return this.stack.length > 0 ? this.stack.pop() : undefined;
  }
}

export class ExecutionContext {
  private readonly stack: AvmStack;
  private readonly host: Host;
  private target: TargetId | null;
  private readonly defaultTarget: TargetId | null;

  constructor(host: Host, defaultTarget: TargetId | null) {
    this.stack = new AvmStack();
    this.host = host;
    this.target = defaultTarget;
    this.defaultTarget = defaultTarget;
  }

  public exec(action: Action): void {
    switch (action.action) {
      case ActionType.Push:
        this.execPush(action);
        break;
      case ActionType.SetTarget:
        this.execSetTarget(action);
        break;
      case ActionType.Stop:
        this.execStop();
        break;
      case ActionType.Trace:
        this.execTrace();
        break;
      default:
        console.error(action);
        throw new Error("UnknownAction");
    }
  }

  private execPush(action: Push): void {
    for (const value of action.values) {
      switch (value.type) {
        case AstValueType.String:
          this.stack.push(value.value);
          break;
        default:
          console.error(value);
          throw new Error("UnknownValueType");
      }
    }
  }

  private execSetTarget(action: SetTarget): void {
    if (action.targetName === "") {
      this.target = this.defaultTarget;
    } else {
      throw new Error("NotImplemented: execSetTarget(targetName !== \"\")");
    }
  }

  private execStop(): void {
    if (this.target === null) {
      console.warn("NoCurrentTarget");
      return;
    }
    const target: Target | undefined = this.host.getTarget(this.target);
    if (target !== undefined) {
      target.stop();
    } else {
      console.warn("TargetNotFound");
    }
  }

  private execTrace(): void {
    const message: AvmValue = this.stack.pop();
    const messageStr: AvmString = message === undefined ? "undefined" : AvmValue.toAvmString(message, SWF_VERSION);
    this.host.trace(messageStr);
  }
}
