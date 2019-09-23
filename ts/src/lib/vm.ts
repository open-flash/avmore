// tslint:disable:max-classes-per-file max-file-line-count

import { cfgFromBytes } from "avm1-parser";
import { ActionType } from "avm1-tree/action-type";
import { ConstantPool, GotoFrame, Push, SetTarget, WaitForFrame } from "avm1-tree/actions";
import { Cfg } from "avm1-tree/cfg";
import { CfgAction } from "avm1-tree/cfg-action";
import { CfgDefineFunction } from "avm1-tree/cfg-actions/cfg-define-function";
import { CfgIf } from "avm1-tree/cfg-actions/cfg-if";
import { CfgBlock } from "avm1-tree/cfg-block";
import { CfgBlockType } from "avm1-tree/cfg-block-type";
import { CfgLabel } from "avm1-tree/cfg-label";
import { ValueType as AstValueType } from "avm1-tree/value-type";
import { UintSize } from "semantic-types";
import * as actions from "./actions";
import {
  AVM_FALSE,
  AVM_NULL,
  AVM_ONE,
  AVM_TRUE,
  AVM_UNDEFINED,
  AVM_ZERO,
  AvmBoolean,
  AvmExternalHandler,
  AvmExternalObject,
  AvmNull,
  AvmNumber,
  AvmObject,
  AvmObjectProperty,
  AvmSimpleObject,
  AvmString,
  AvmValue,
  AvmValueType,
} from "./avm-value";
import { ActionContext } from "./context";
import { ReferenceToUndeclaredVariableWarning } from "./error";
import { AvmCallResult, AvmFunction, Callable, CallableType, CallType } from "./function";
import { Host, Target } from "./host";
import { Realm } from "./realm";
import { AvmScope, ScopeType, StaticScope } from "./scope";

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
  public readonly realm: Realm;
  private nextScriptId: number;
  private readonly scriptsById: Map<Avm1ScriptId, Avm1Script>;

  constructor() {
    this.nextScriptId = 0;
    this.scriptsById = new Map();
    this.realm = new Realm();
  }

  createAvm1Script(
    avm1Bytes: Uint8Array,
    target: TargetId | null,
    rootScope: AvmValue | null,
  ): Avm1ScriptId {
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
    const scope: AvmScope = script.rootScope !== null
      ? {type: ScopeType.Dynamic, container: script.rootScope}
      : {type: ScopeType.Static, variables: new Map()};
    const cfg: Cfg = cfgFromBytes(script.bytes);
    const activation: ScriptActivation = new ScriptActivation(cfg);
    const ectx: ExecutionContext = new ExecutionContext(this, host, script.target, activation, scope);
    let actionCount: number = 0;
    while (actionCount < maxActions) {
      const hasAdvanced: boolean = ectx.nextStep();
      if (!hasAdvanced) {
        break;
      }
      actionCount++;
    }
    if (actionCount === maxActions) {
      throw new Error("ActionTimeout");
    }
  }

  public newExternal(handler: AvmExternalHandler): AvmExternalObject {
    return {
      type: AvmValueType.Object,
      external: true,
      handler,
    };
  }

  public newObject(proto?: AvmObject | AvmNull): AvmSimpleObject {
    return {
      type: AvmValueType.Object,
      external: false,
      class: "Object",
      prototype: proto !== undefined ? proto : this.realm.objectProto,
      ownProperties: new Map(),
    };
  }

  public setMember(target: AvmValue, key: string, value: AvmValue): void {
    switch (target.type) {
      case AvmValueType.Object: {
        if (target.external) {
          target.handler.set(key, value);
        } else {
          target.ownProperties.set(key, {value});
        }
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
      case AvmValueType.Object: {
        if (target.external) {
          return target.handler.get(key);
        }
        const prop: AvmObjectProperty | undefined = target.ownProperties.get(key);
        if (prop !== undefined) {
          return prop.value;
        }
        if (target.prototype.type === AvmValueType.Object) {
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

abstract class BaseActivation {
  readonly cfg: Cfg;
  curBlock?: CfgBlock;
  curAction: UintSize;

  constructor(cfg: Cfg) {
    this.cfg = cfg;
    if (cfg.blocks.length > 0) {
      this.curBlock = cfg.blocks[0];
    }
    this.curAction = 0;
  }

  jump(label: CfgLabel): void {
    // TODO: Handle nesting
    this.curBlock = undefined;
    this.curAction = 0;
    for (const b of this.cfg.blocks) {
      if (b.label === label) {
        this.curBlock = b;
        break;
      }
    }
  }
}

class ScriptActivation extends BaseActivation {
}

class FunctionActivation extends BaseActivation {
  returnValue: AvmValue;

  constructor(cfg: Cfg) {
    super(cfg);
    this.returnValue = AVM_UNDEFINED;
  }
}

type Activation = ScriptActivation | FunctionActivation;

export class ExecutionContext implements ActionContext {
  public readonly vm: Vm;
  private readonly constantPool: AvmConstantPool;
  private readonly stack: AvmStack;
  private readonly callStack: Activation[];
  private readonly host: Host;
  private target: TargetId | null;
  // If non-zero, skip next `skipCount` actions (used to implement `WaitForFrame`)
  private skipCount: UintSize;
  private readonly defaultTarget: TargetId | null;
  private readonly scope: AvmScope;

  constructor(
    vm: Vm,
    host: Host,
    defaultTarget: TargetId | null,
    activation: Activation,
    scope: AvmScope,
  ) {
    this.vm = vm;
    this.constantPool = new AvmConstantPool();
    this.stack = new AvmStack();
    this.callStack = [activation];
    this.scope = scope;
    this.host = host;
    this.target = defaultTarget;
    this.defaultTarget = defaultTarget;
    this.skipCount = 0;
  }

  // Returns a boolean indicating if there was some progress
  public nextStep(): boolean {
    const activation: Activation | undefined = this.callStack[this.callStack.length - 1];
    if (activation === undefined) {
      return false;
    }
    const block: CfgBlock | undefined = activation.curBlock;
    if (block === undefined) {
      this.popCall();
    } else {
      if (activation.curAction < block.actions.length) {
        const action: CfgAction = block.actions[activation.curAction];
        if (action.action === ActionType.If) {
          this.execIf(action);
        } else {
          this.exec(action);
          activation.curAction++;
        }
      } else if (activation.curAction === block.actions.length) {
        switch (block.type) {
          case CfgBlockType.Simple:
            if (block.next === null) {
              this.popCall();
            } else {
              activation.jump(block.next);
            }
            break;
          case CfgBlockType.Return:
            throw new Error("NotImplemented: CfgBlockType.Return");
          default:
            throw new Error("NotImplemented: CFG block type");
        }
      } else {
        this.popCall();
      }
    }
    return true;
  }

  public apply(fn: AvmValue, thisArg: AvmValue, args: ReadonlyArray<AvmValue>): AvmCallResult {
    if (fn.type !== AvmValueType.Object) {
      throw new Error("CannotApplyNonObject");
    }
    if (fn.external) {
      if (fn.handler.apply === undefined) {
        throw new Error("CannotApplyExternal");
      }
      return fn.handler.apply(thisArg, args);
    } else {
      const callable: Callable | undefined = fn.callable;
      if (callable === undefined) {
        throw new Error("CannotApplyNonCallableObject");
      }
      if (thisArg.type !== AvmValueType.Object && thisArg.type !== AvmValueType.Undefined) {
        throw new Error("NotImplemented: NonObjectThisArg");
      }

      if (callable.type === CallableType.Avm) {
        const frame: FunctionActivation = new FunctionActivation(callable.body);
        const scope: StaticScope = {
          type: ScopeType.Static,
          variables: new Map(),
          parent: callable.parentScope,
        };
        const childCtx: ExecutionContext = new ExecutionContext(this.vm, this.host, this.defaultTarget, frame, scope);
        const MAX_STEPS: UintSize = 1000;
        for (let step: UintSize = 0; step < MAX_STEPS; step++) {
          const hasAdvanced: boolean = childCtx.nextStep();
          if (!hasAdvanced) {
            break;
          }
        }
        return frame.returnValue;
      } else { // CallableType.Host
        return callable.handler({type: CallType.Apply, thisArg, args});
      }
    }
  }

  public construct(_fn: AvmValue, _args: ReadonlyArray<AvmValue>): AvmCallResult {
    throw new Error("NotImplemented");
  }

  public getMember(obj: AvmValue, key: AvmValue): AvmValue {
    const value: AvmValue | undefined = this.tryGetMember(obj, key);
    return value !== undefined ? value : AVM_UNDEFINED;
  }

  public tryGetMember(obj: AvmValue, key: AvmValue): AvmValue | undefined {
    return this.tryGetStringMember(obj, this.toHostString(key));
  }

  public tryGetStringMember(obj: AvmValue, key: string): AvmValue | undefined {
    return this.vm.tryGetMember(obj, key);
  }

  public setMember(obj: AvmValue, key: AvmValue, value: AvmValue): void {
    this.setStringMember(obj, this.toHostString(key), value);
  }

  public setStringMember(obj: AvmValue, key: string, value: AvmValue): void {
    this.vm.setMember(obj, key, value);
  }

  public toAvmBoolean(value: AvmValue): AvmValue {
    return AvmValue.toAvmBoolean(value, SWF_VERSION);
  }

  public toAvmString(avmValue: AvmValue): AvmString {
    return AvmValue.toAvmString(avmValue, SWF_VERSION);
  }

  public toHostString(value: AvmValue): string {
    return this.toAvmString(value).value;
  }

  public getVar(varName: string): AvmValue {
    let cur: AvmScope | undefined = this.scope;
    while (cur !== undefined) {
      let value: AvmValue | undefined;
      if (cur.type === ScopeType.Dynamic) {
        value = this.tryGetStringMember(cur.container, varName);
      } else { // ScopeType.Static
        value = cur.variables.get(varName);
      }
      if (value !== undefined) {
        return value;
      }
      cur = cur.parent;
    }
    this.host.warn(new ReferenceToUndeclaredVariableWarning(varName));
    // TODO: Warn (variable not found)
    return AVM_UNDEFINED;
  }

  public setVar(varName: string, value: AvmValue): void {
    let cur: AvmScope | undefined = this.scope;
    while (cur !== undefined) {
      let hasVar: boolean;
      if (cur.type === ScopeType.Dynamic) {
        hasVar = this.tryGetStringMember(cur.container, varName) !== undefined;
      } else { // ScopeType.Static
        hasVar = cur.variables.has(varName);
      }
      if (hasVar) {
        break;
      }
      cur = cur.parent;
    }
    if (cur === undefined) {
      cur = this.scope;
    }
    if (cur.type === ScopeType.Dynamic) {
      this.setStringMember(cur.container, varName, value);
    } else { // ScopeType.Static
      cur.variables.set(varName, value);
    }
  }

  public localVar(varName: string, value: AvmValue): void {
    if (this.scope.type === ScopeType.Dynamic) {
      this.setStringMember(this.scope.container, varName, value);
    } else { // ScopeType.Static
      this.scope.variables.set(varName, value);
    }
  }

  public push(value: AvmValue): void {
    this.stack.push(value);
  }

  public pop(): AvmValue {
    return this.stack.pop();
  }

  public exec(action: CfgAction): void {
    if (this.skipCount > 0) { // Ignore action due to `WaitForFrame` skip count
      this.skipCount--;
      return;
    }
    switch (action.action) {
      case ActionType.CallFunction:
        this.execCallFunction();
        break;
      case ActionType.CallMethod:
        this.execCallMethod();
        break;
      case ActionType.ConstantPool:
        this.execConstantPool(action);
        break;
      case ActionType.DefineLocal:
        this.execDefineLocal();
        break;
      case ActionType.DefineFunction:
        this.execDefineFunction(action);
        break;
      case ActionType.Equals2:
        this.execEquals2();
        break;
      case ActionType.GetMember:
        this.execGetMember();
        break;
      case ActionType.GetVariable:
        this.execGetVariable();
        break;
      case ActionType.GotoFrame:
        this.execGotoFrame(action);
        break;
      case ActionType.Greater:
        this.execGreater();
        break;
      case ActionType.Increment:
        this.execIncrement();
        break;
      case ActionType.InitObject:
        this.execInitObject();
        break;
      case ActionType.Less2:
        this.execLess2();
        break;
      case ActionType.Not:
        this.execNot();
        break;
      case ActionType.Play:
        this.execPlay();
        break;
      case ActionType.Pop:
        actions.pop(this);
        break;
      case ActionType.Push:
        this.execPush(action);
        break;
      case ActionType.PushDuplicate:
        actions.pushDuplicate(this);
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
      case ActionType.StrictEquals:
        this.execStrictEquals();
        break;
      case ActionType.Trace:
        this.execTrace();
        break;
      case ActionType.WaitForFrame:
        this.execWaitForFrame(action);
        break;
      default:
        console.error(action);
        throw new Error(`UnknownAction: ${action.action} (${ActionType[action.action]})`);
    }
  }

  private popCall() {
    const activation: Activation | undefined = this.callStack.pop();
    if (activation === undefined) {
      return;
    }
    if (activation instanceof FunctionActivation) {
      // TODO: Switch on return/catch
      this.stack.push(activation.returnValue);
    }
  }

  private execCallFunction(): void {
    const fnName: AvmValue = this.pop();
    const argCount: AvmValue = this.pop();

    const fnNameStr: string = this.toHostString(fnName);
    const argCountNum: number = AvmValue.toAvmNumber(argCount, SWF_VERSION).value;

    if (argCountNum !== 0) {
      throw new Error("NotImplemented: CallFunction with arguments");
    }
    const fn: AvmValue = this.getVar(fnNameStr);

    const result: AvmValue = this.apply(fn, AVM_UNDEFINED, []);

    this.stack.push(result);
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
    const name: string = this.toHostString(this.stack.pop());
    this.localVar(name, value);
  }

  private execDefineFunction(action: CfgDefineFunction): void {
    const fn: AvmFunction = {
      type: CallableType.Avm,
      name: action.name,
      parameters: action.parameters,
      registerCount: 4,
      body: action.body,
      parentScope: this.scope,
    };

    const fnObj: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Function",
      prototype: this.vm.realm.funcProto,
      ownProperties: new Map(),
      callable: fn,
    };

    if (fn.name !== undefined && fn.name.length > 0) {
      this.localVar(fn.name, fnObj);
    }

    this.push(fnObj);
  }

  private execEquals2(): void {
    const right: AvmValue = this.stack.pop();
    const left: AvmValue = this.stack.pop();
    const result: AvmBoolean = AvmValue.fromHostBoolean(this.abstractEquals(left, right));
    this.push(result);
  }

  private execGetMember(): void {
    const key: AvmValue = this.pop();
    const target: AvmValue = this.pop();
    this.push(this.getMember(target, key));
  }

  private execGetVariable(): void {
    const name: string = this.toHostString(this.pop());
    const value: AvmValue = this.getVar(name);
    this.push(value);
  }

  private execGotoFrame(action: GotoFrame): void {
    if (this.target === null) {
      console.warn("NoCurrentTarget");
      return;
    }
    const target: Target | undefined = this.host.getTarget(this.target);
    if (target !== undefined) {
      target.gotoFrame(action.frame);
    } else {
      console.warn("TargetNotFound");
    }
  }

  private execGreater(): void {
    const right: AvmValue = this.stack.pop();
    const left: AvmValue = this.stack.pop();
    const abstractResult: boolean | undefined = this.abstractCompare(right, left);
    const result: AvmBoolean = AvmValue.fromHostBoolean(abstractResult === undefined ? false : abstractResult);
    this.stack.push(result);
  }

  private execIf(action: CfgIf): void {
    const test: boolean = AvmValue.toAvmBoolean(this.stack.pop(), SWF_VERSION).value;
    const activation: Activation = this.callStack[this.callStack.length - 1];
    if (test) {
      if (action.target === null) {
        activation.curBlock = undefined;
      } else {
        activation.jump(action.target);
      }
    } else {
      activation.curAction++;
    }
  }

  private execIncrement(): void {
    const arg: AvmValue = this.stack.pop();
    const argNumber: AvmNumber = AvmValue.toAvmNumber(arg, SWF_VERSION);
    const result: AvmNumber = {type: AvmValueType.Number, value: argNumber.value + 1};
    this.stack.push(result);
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

  private execLess2(): void {
    const right: AvmValue = this.stack.pop();
    const left: AvmValue = this.stack.pop();
    const abstractResult: boolean | undefined = this.abstractCompare(left, right);
    const result: AvmBoolean = AvmValue.fromHostBoolean(abstractResult === undefined ? false : abstractResult);
    this.stack.push(result);
  }

  private execNot(): void {
    const arg: AvmValue = this.stack.pop();
    const argBoolean: AvmBoolean = AvmValue.toAvmBoolean(arg, SWF_VERSION);
    if (SWF_VERSION >= 5) {
      this.stack.push(argBoolean.value ? AVM_FALSE : AVM_TRUE);
    } else {
      this.stack.push(argBoolean.value ? AVM_ZERO : AVM_ONE);
    }
  }

  private execPlay(): void {
    if (this.target === null) {
      console.warn("NoCurrentTarget");
      return;
    }
    const target: Target | undefined = this.host.getTarget(this.target);
    if (target !== undefined) {
      target.play();
    } else {
      console.warn("TargetNotFound");
    }
  }

  private execPush(action: Push): void {
    for (const value of action.values) {
      switch (value.type) {
        case AstValueType.Boolean:
          this.stack.push({type: AvmValueType.Boolean as AvmValueType.Boolean, value: value.value});
          break;
        case AstValueType.Constant:
          this.stack.push(this.constantPool.get(value.value));
          break;
        case AstValueType.Float32:
          this.stack.push({type: AvmValueType.Number as AvmValueType.Number, value: value.value});
          break;
        case AstValueType.Float64:
          this.stack.push({type: AvmValueType.Number as AvmValueType.Number, value: value.value});
          break;
        case AstValueType.Null:
          this.stack.push(AVM_NULL);
          break;
        case AstValueType.Sint32:
          this.stack.push({type: AvmValueType.Number as AvmValueType.Number, value: value.value});
          break;
        case AstValueType.String:
          this.stack.push({type: AvmValueType.String as AvmValueType.String, value: value.value});
          break;
        case AstValueType.Undefined:
          this.stack.push(AVM_UNDEFINED);
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
    const value: AvmValue = this.stack.pop();
    const path: string = this.toAvmString(this.stack.pop()).value;
    if (path.indexOf(":") >= 0) {
      throw new Error("NotImplemented: SetVariableInRemoteTarget");
    }
    this.setVar(path, value);
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

  private execStrictEquals(): void {
    const right: AvmValue = this.stack.pop();
    const left: AvmValue = this.stack.pop();
    const result: AvmBoolean = AvmValue.fromHostBoolean(this.abstractStrictEquals(left, right));
    this.stack.push(result);
  }

  private execTrace(): void {
    const message: AvmValue = this.stack.pop();
    const messageStr: AvmString = message.type === AvmValueType.Undefined
      ? {type: AvmValueType.String as AvmValueType.String, value: "undefined"}
      : AvmValue.toAvmString(message, SWF_VERSION);
    this.host.trace(messageStr.value);
  }

  private execWaitForFrame(action: WaitForFrame): void {
    if (this.target === null) {
      console.warn("NoCurrentTarget");
      return;
    }
    const target: Target | undefined = this.host.getTarget(this.target);
    if (target === undefined) {
      console.warn("TargetNotFound");
      return;
    }
    const progress: { loaded: UintSize; total: UintSize } = target.getFrameLoadingProgress();

    // Note:
    // - `action.frame` is 0-indexed.
    // - `progress.loaded` returns values in `[0, progress.total]` (inclusive) but since we are
    //   running the script, the first frame should be loaded and we can expected
    //   `progress.loaded >= 1` (or maybe we may get `0` using `setTarget` shenanigans)
    // - `progress.loaded >= progress.total` implies `isRequestedFrameLoaded` regardless of frame
    //   index.

    const isRequestedFrameLoaded: boolean = progress.loaded >= progress.total || progress.loaded > action.frame;

    if (isRequestedFrameLoaded) {
      this.skipCount = action.skipCount;
    }
  }

  private toUintSize(avmValue: AvmValue): number {
    if (avmValue.type === AvmValueType.Number && avmValue.value >= 0 && Math.floor(avmValue.value) === avmValue.value) {
      return avmValue.value;
    }
    throw new Error("InvalidUintSize");
  }

  // Implementation of the abstract relational comparison algorithm from ECMA 262-3, section 11.8.5
  private abstractCompare(left: AvmValue, right: AvmValue): boolean | undefined {
    const leftPrimitive: AvmValue = AvmValue.toAvmPrimitive(left, "number", SWF_VERSION);
    const rightPrimitive: AvmValue = AvmValue.toAvmPrimitive(right, "number", SWF_VERSION);
    if (leftPrimitive.type === AvmValueType.String && rightPrimitive.type === AvmValueType.String) {
      throw new Error("NotImplemented");
    } else {
      const leftNumber: AvmNumber = AvmValue.toAvmNumber(leftPrimitive, SWF_VERSION);
      const rightNumber: AvmNumber = AvmValue.toAvmNumber(rightPrimitive, SWF_VERSION);
      if (isNaN(leftNumber.value) || isNaN(rightNumber.value)) {
        return undefined;
      }
      return leftNumber.value < rightNumber.value;
    }
  }

  private abstractStrictEquals(left: AvmValue, right: AvmValue): boolean {
    if (left.type === right.type) {
      return this.abstractEquals(left, right);
    }
    return false;
  }

  // Implementation of the AbstractEquals algorithm from ECMA 262-3, section 11.9.3
  private abstractEquals(left: AvmValue, right: AvmValue): boolean {
    // | x   \   y | Undef | Null | Num         | Str              | Bool             | Obj |
    // | Undef     | true  | true |             |                  |                  |     |
    // | Null      | true  | true |             |                  |                  |     |
    // | Num       |       |      | eq          | x eq Num(y)      | x eq Num(y)      |     |
    // | Str       |       |      | Num(x) eq y | eq               | Num(x) eq Num(y) |     |
    // | Bool      |       |      | Num(x) eq y | Num(x) eq Num(y) | eq               |     |
    // | Obj       |       |      |             |                  |                  | eq  |

    // TODO: Treat `Function`, `Object` and `External` as the same type

    // 1. If Type(x) is different from Type(y), go to step 14.
    if (left.type === right.type) {
      switch (left.type) {
        // 2. If Type(x) is Undefined, return true.
        case AvmValueType.Undefined:
          return true;
        // 3. If Type(x) is Null, return true.
        case AvmValueType.Null:
          return true;
        // 4. If Type(x) is not Number, go to step 11.
        case AvmValueType.Number:
          // 5. If x is NaN, return false.
          // 6. If y is NaN, return false.
          // 7. If x is the same number value as y, return true.
          // 8. If x is +0 and y is −0, return true.
          // 9. If x is −0 and y is +0, return true.
          // 10. Return false.
          return left.value === (right as AvmNumber).value;
        // 11. If Type(x) is String, then return true if x and y are exactly the same sequence of characters (same
        //     length and same characters in corresponding positions). Otherwise, return false.
        case AvmValueType.String:
          return left.value === (right as AvmString).value;
        // 12. If Type(x) is Boolean, return true if x and y are both true or both false. Otherwise, return false.
        case AvmValueType.Boolean:
          return left.value === (right as AvmBoolean).value;
        // 13. Return true if x and y refer to the same object or if they refer to objects joined to each
        //     other (see 13.1.2). Otherwise, return false.
        case AvmValueType.Object:
          // TODO: Check for joined objects
          return left === right;
        default:
          throw new Error("Unexpected type");
      }
    } else {
      // 14. If x is null and y is undefined, return true.
      if (left.type === AvmValueType.Null && right.type === AvmValueType.Undefined) {
        return true;
      }
      // 15. If x is undefined and y is null, return true.
      if (left.type === AvmValueType.Undefined && right.type === AvmValueType.Null) {
        return true;
      }
      // 16. If Type(x) is Number and Type(y) is String,
      //     return the result of the comparison x == ToNumber(y).
      if (left.type === AvmValueType.Number && right.type === AvmValueType.String) {
        const rightNumber: AvmNumber = AvmValue.toAvmNumber(right, SWF_VERSION);
        return left.value === rightNumber.value;
      }
      // 17. If Type(x) is String and Type(y) is Number,
      //     return the result of the comparison ToNumber(x) == y.
      if (left.type === AvmValueType.String && right.type === AvmValueType.Number) {
        const leftNumber: AvmNumber = AvmValue.toAvmNumber(left, SWF_VERSION);
        return leftNumber.value === right.value;
      }
      // 18. If Type(x) is Boolean, return the result of the comparison ToNumber(x) == y.
      if (left.type === AvmValueType.Boolean) {
        const leftNumber: AvmNumber = AvmValue.toAvmNumber(left, SWF_VERSION);
        return this.abstractEquals(leftNumber, right);
      }
      // 19. If Type(y) is Boolean, return the result of the comparison x == ToNumber(y).
      if (right.type === AvmValueType.Boolean) {
        const rightNumber: AvmNumber = AvmValue.toAvmNumber(right, SWF_VERSION);
        return this.abstractEquals(left, rightNumber);
      }
      // 20. If Type(x) is either String or Number and Type(y) is Object,
      //     return the result of the comparison x == ToPrimitive(y).
      if (
        (left.type === AvmValueType.String || left.type === AvmValueType.Number)
        && right.type === AvmValueType.Object
      ) {
        const rightPrimitive: AvmValue = AvmValue.toAvmPrimitive(right, null, SWF_VERSION);
        return this.abstractEquals(left, rightPrimitive);
      }
      // 21. If Type(x) is Object and Type(y) is either String or Number,
      // return the result of the comparison ToPrimitive(x) == y.
      if (
        left.type === AvmValueType.Object
        && (right.type === AvmValueType.String || right.type === AvmValueType.Number)
      ) {
        const leftPrimitive: AvmValue = AvmValue.toAvmPrimitive(left, null, SWF_VERSION);
        return this.abstractEquals(leftPrimitive, right);
      }
      // 22. Return false.
      return false;
    }
  }
}
