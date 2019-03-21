import { Avm1Parser } from "avm1-parser";
import { Action } from "avm1-tree/action";
import { ActionType } from "avm1-tree/action-type";
import { ConstantPool, Push, SetTarget } from "avm1-tree/actions";
import { ValueType as AstValueType } from "avm1-tree/value-type";
import {
  AVM_NULL,
  AVM_UNDEFINED,
  AvmExternal,
  AvmExternalHandler,
  AvmObject,
  AvmObjectProperty,
  AvmString,
  AvmValue,
  AvmValueType,
} from "./avm-value";
import { Host, Target } from "./host";
import { AvmScope, DynamicScope, StaticScope } from "./scope";

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

  /**
   * Object to use as the root scope (dynamic scope) or `null` to use a static scope.
   */
  readonly rootScope: AvmValue | null;
}

export class Vm {
  private nextScriptId: number;
  private readonly scriptsById: Map<Avm1ScriptId, Avm1Script>;

  constructor() {
    this.nextScriptId = 0;
    this.scriptsById = new Map();
  }

  createAvm1Script(avm1Bytes: Uint8Array, target: TargetId | null, rootScope: AvmValue | null): Avm1ScriptId {
    const id: number = this.nextScriptId++;
    const script: Avm1Script = {id, bytes: avm1Bytes, target, rootScope};
    this.scriptsById.set(id, script);
    return id;
  }

  runToCompletion(scriptId: Avm1ScriptId, host: Host, maxActions: number = 1000): void {
    const script: Avm1Script | undefined = this.scriptsById.get(scriptId);
    if (script === undefined) {
      throw new Error(`ScriptNotFound: ${scriptId}`);
    }
    const scope: AvmScope = script.rootScope !== null ? new DynamicScope(script.rootScope) : new StaticScope();
    const ectx: ExecutionContext = new ExecutionContext(this, host, script.target, scope);
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

  public newExternal(handler: AvmExternalHandler): AvmExternal {
    return {
      type: AvmValueType.External,
      handler,
    };
  }

  public newObject(): AvmObject {
    return {
      type: AvmValueType.Object,
      prototype: AVM_NULL,
      ownProperties: new Map(),
    };
  }

  public setMember(target: AvmValue, key: string, value: AvmValue): void {
    switch (target.type) {
      case AvmValueType.External: {
        target.handler.set(key, value);
        break;
      }
      case AvmValueType.Object: {
        target.ownProperties.set(key, {value});
        break;
      }
      default:
        throw new Error("InvalidSetMemberTarget");
    }
  }

  public getMember(target: AvmValue, key: string): AvmValue {
    const value: AvmValue | undefined = this.tryGetMember(target, key);
    return value !== undefined ? value : AVM_UNDEFINED;
  }

  public tryGetMember(target: AvmValue, key: string): AvmValue | undefined {
    switch (target.type) {
      case AvmValueType.External: {
        return target.handler.get(key);
      }
      case AvmValueType.Object: {
        const prop: AvmObjectProperty | undefined = target.ownProperties.get(key);
        if (prop !== undefined) {
          return prop.value;
        }
        if (target.prototype.type === AvmValueType.External || target.prototype.type === AvmValueType.Object) {
          return this.tryGetMember(target.prototype, key);
        }
        return undefined;
      }
      default:
        throw new Error("CannotGetMember");
    }
  }
}

class AvmStack {
  private readonly stack: AvmValue[];

  constructor() {
    this.stack = [];
  }

  public push(value: AvmValue): void {
    this.stack.push(value);
  }

  public pop(): AvmValue {
    return this.stack.length > 0 ? this.stack.pop()! : AVM_UNDEFINED;
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
    return index < this.pool.length ? this.pool[index] : AVM_UNDEFINED;
  }
}

export class ExecutionContext {
  public readonly vm: Vm;
  private readonly constantPool: AvmConstantPool;
  private readonly stack: AvmStack;
  private readonly host: Host;
  private target: TargetId | null;
  private readonly defaultTarget: TargetId | null;
  private readonly scope: AvmScope;

  constructor(vm: Vm, host: Host, defaultTarget: TargetId | null, scope: AvmScope) {
    this.vm = vm;
    this.constantPool = new AvmConstantPool();
    this.stack = new AvmStack();
    this.scope = scope;
    this.host = host;
    this.target = defaultTarget;
    this.defaultTarget = defaultTarget;
  }

  public apply(fn: AvmValue, thisArg: AvmValue, args: ReadonlyArray<AvmValue>): AvmValue {
    switch (fn.type) {
      case AvmValueType.External: {
        if (fn.handler.apply === undefined) {
          throw new Error("CannotApplyExternal");
        }
        return fn.handler.apply(thisArg, args);
      }
      default:
        throw new Error("CannotApply");
    }
  }

  public exec(action: Action): void {
    switch (action.action) {
      case ActionType.CallMethod:
        this.execCallMethod();
        break;
      case ActionType.ConstantPool:
        this.execConstantPool(action);
        break;
      case ActionType.DefineLocal:
        this.execDefineLocal();
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
      case ActionType.SetVariable:
        this.execSetVariable();
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
    const avmKey: AvmValue = this.stack.pop();
    if (avmKey.type === AvmValueType.Undefined) {
      throw new Error("NotImplemented: undefined key for execCallMethod");
    }
    const key: string = this.toAvmString(avmKey).value;
    const obj: AvmValue = this.stack.pop();
    const method: AvmValue = this.vm.getMember(obj, key);
    const avmArgCount: AvmValue = this.stack.pop();
    const argCount: number = this.toUintSize(avmArgCount);
    const args: AvmValue[] = [];
    for (let _: number = 0; _ < argCount; _++) {
      args.push(this.stack.pop());
    }
    const result: AvmValue = this.apply(method, obj, args);
    this.stack.push(result);
  }

  private execConstantPool(action: ConstantPool): void {
    const pool: AvmString[] = [];
    for (const value of action.constantPool) {
      pool.push({type: AvmValueType.String as AvmValueType.String, value});
    }
    this.constantPool.set(pool);
  }

  private execDefineLocal(): void {
    const value: AvmValue = this.stack.pop();
    const name: string = this.toAvmString(this.stack.pop()).value;
    this.scope.set(name, value, this);
  }

  private execGetMember(): void {
    const key: string = this.toAvmString(this.stack.pop()).value;
    const target: AvmValue = this.stack.pop();
    this.stack.push(this.vm.getMember(target, key));
  }

  private execGetVariable(): void {
    const name: string = this.toAvmString(this.stack.pop()).value;
    const value: AvmValue | undefined = this.scope.get(name, this);
    this.stack.push(value !== undefined ? value : AVM_UNDEFINED);
  }

  private execInitObject(): void {
    const avmPropertyCount: AvmValue = this.stack.pop();
    const propertyCount: number = this.toUintSize(avmPropertyCount);
    const obj: AvmObject = this.vm.newObject();
    for (let _: number = 0; _ < propertyCount; _++) {
      const value: AvmValue = this.stack.pop();
      const key: string = this.toAvmString(this.stack.pop()).value;
      obj.ownProperties.set(key, {value});
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
          this.stack.push({type: AvmValueType.Number as AvmValueType.Number, value: value.value});
          break;
        case AstValueType.String:
          this.stack.push({type: AvmValueType.String as AvmValueType.String, value: value.value});
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

  private execSetVariable(): void {
    // TODO: Check/fix scope selection (not always the closest one)
    const value: AvmValue = this.stack.pop();
    const path: string = this.toAvmString(this.stack.pop()).value;
    if (path.indexOf(":") >= 0) {
      throw new Error("NotImplemented: SetVariableInRemoteTarget");
    }
    const name: string = path;
    this.scope.set(name, value, this);
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
    const messageStr: AvmString = message.type === AvmValueType.Undefined
      ? {type: AvmValueType.String as AvmValueType.String, value: "undefined"}
      : AvmValue.toAvmString(message, SWF_VERSION);
    this.host.trace(messageStr.value);
  }

  private toAvmString(avmValue: AvmValue): AvmString {
    if (avmValue.type === AvmValueType.String) {
      return avmValue;
    }
    throw new Error("InvalidAvmString");
  }

  private toUintSize(avmValue: AvmValue): number {
    if (avmValue.type === AvmValueType.Number && avmValue.value >= 0 && Math.floor(avmValue.value) === avmValue.value) {
      return avmValue.value;
    }
    throw new Error("InvalidUintSize");
  }
}
