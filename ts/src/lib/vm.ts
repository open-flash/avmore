import { Avm1Parser } from "avm1-parser";
import { Action } from "avm1-tree/action";
import { ActionType } from "avm1-tree/action-type";
import { ConstantPool, Push, SetTarget } from "avm1-tree/actions";
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

export interface AvmObjectProperty {
  readonly value: AvmValue;
}

export class AvmObject {
  ownProperties: Map<string, AvmObjectProperty>;

  private constructor() {
    this.ownProperties = new Map();
  }

  public static empty(): AvmObject {
    return new AvmObject();
  }

  public get(key: string): AvmValue {
    const prop: AvmObjectProperty | undefined = this.ownProperties.get(key);
    return prop !== undefined ? prop.value : undefined; // `undefined` corresponds to AvmUndefined
  }

  public setProperty(key: string, value: AvmObject): void {
    this.ownProperties.set(key, {value});
  }
}

export type AvmNumber = number;
export type AvmString = string;

export type AvmValue = AvmNumber | AvmObject | AvmString | any;

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

class AvmConstantPool {
  private readonly pool: AvmString[];

  constructor() {
    this.pool = [];
  }

  public set(pool: AvmString[]): void {
    this.pool.splice(0, this.pool.length, ...pool);
  }

  public get(index: number): AvmValue {
    // TODO: Warn on out-of-bound pool access?
    // TODO: Mimick unitialized pool with the values used by Adobe's player?
    return index < this.pool.length ? this.pool[index] : undefined;
  }
}

export class ExecutionContext {
  private readonly constantPool: AvmConstantPool;
  private readonly stack: AvmStack;
  private readonly host: Host;
  private target: TargetId | null;
  private readonly defaultTarget: TargetId | null;

  constructor(host: Host, defaultTarget: TargetId | null) {
    this.constantPool = new AvmConstantPool();
    this.stack = new AvmStack();
    this.host = host;
    this.target = defaultTarget;
    this.defaultTarget = defaultTarget;
  }

  public exec(action: Action): void {
    switch (action.action) {
      case ActionType.CallMethod:
        this.execCallMethod();
        break;
      case ActionType.ConstantPool:
        this.execConstantPool(action);
        break;
      case ActionType.GetMember:
        this.execGetMember();
        break;
      case ActionType.GetVariable:
        this.execGetVariable();
        break;
      case ActionType.InitObject:
        this.execInitObject();
        break;
      case ActionType.Pop:
        this.execPop();
        break;
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
        throw new Error(`UnknownAction: ${action.action} (${ActionType[action.action]})`);
    }
  }

  private execCallMethod(): void {
    console.warn("NotImplemented: execCallMethod");
  }

  private execConstantPool(action: ConstantPool): void {
    this.constantPool.set(action.constantPool);
  }

  private execGetMember(): void {
    const key: string = this.toAvmString(this.stack.pop()).toString();
    const obj: AvmValue = this.stack.pop();
    if (!(obj instanceof AvmObject)) {
      throw new Error("InvalidGetMemberTarget");
    }
    this.stack.push(obj.get(key));
  }

  private execGetVariable(): void {
    console.warn("NotImplemented: execGetVariable");
  }

  private execInitObject(): void {
    const avmPropertyCount: AvmValue = this.stack.pop();
    const propertyCount: number = this.toUintSize(avmPropertyCount);
    const obj: AvmObject = AvmObject.empty();
    for (let _: number = 0; _ < propertyCount; _++) {
      const value: AvmValue = this.stack.pop();
      const key: string = this.toAvmString(this.stack.pop()).toString();
      obj.setProperty(key, value);
    }
    this.stack.push(obj);
  }

  private execPop(): void {
    this.stack.pop();
  }

  private execPush(action: Push): void {
    for (const value of action.values) {
      switch (value.type) {
        case AstValueType.Constant:
          this.stack.push(this.constantPool.get(value.value));
          break;
        case AstValueType.Sint32:
          this.stack.push(value.value /* as AvmNumber */);
          break;
        case AstValueType.String:
          this.stack.push(value.value /* as AvmString */);
          break;
        default:
          throw new Error(`UnknownValueType ${value.type} (${AstValueType[value.type]})`);
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

  private toAvmString(avmValue: AvmValue): AvmString {
    if (typeof  avmValue === "string") {
      return avmValue;
    }
    throw new Error("InvalidAvmString");
  }

  private toUintSize(avmValue: AvmValue): number {
    if (typeof  avmValue === "number" && avmValue >= 0 && Math.floor(avmValue) === avmValue) {
      return avmValue;
    }
    throw new Error("InvalidUintSize");
  }
}
