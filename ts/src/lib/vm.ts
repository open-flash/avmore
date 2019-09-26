// tslint:disable:max-classes-per-file max-file-line-count

import { cfgFromBytes } from "avm1-parser";
import { ActionType } from "avm1-tree/action-type";
import { GotoFrame, SetTarget } from "avm1-tree/actions";
import { CfgAction } from "avm1-tree/cfg-action";
import { CfgBlock } from "avm1-tree/cfg-block";
import { CfgBlockType } from "avm1-tree/cfg-block-type";
import { NullableCfgLabel } from "avm1-tree/cfg-label";
import { Incident } from "incident";
import { Sint32, Uint32, UintSize } from "semantic-types";
import * as actions from "./actions";
import {
  AVM_FALSE,
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
  AvmPrimitive,
  AvmPropDescriptor,
  AvmSimpleObject,
  AvmString,
  AvmUndefined,
  AvmValue,
  AvmValueType,
} from "./avm-value";
import { AvmConstantPool } from "./constant-pool";
import { ActionContext, RunBudget } from "./context";
import { ReferenceToUndeclaredVariableWarning, TargetHasNoPropertyWarning } from "./error";
import {
  AvmCallResult,
  AvmFunction,
  AvmFunctionParameter,
  Callable,
  CallableType,
  CallType,
  HostCallContext,
  ParameterState,
} from "./function";
import { Host, Target } from "./host";
import { createRealm, Realm } from "./realm";
import { DynamicScope, FunctionScope, Scope, StaticScope } from "./scope";
import { Avm1Script, Avm1ScriptId, CfgTable } from "./script";
import { AvmStack } from "./stack";

const SWF_VERSION: number = 8;

export type TargetId = number;
export type MovieId = number;

export class Vm {
  public readonly realm: Realm;
  public readonly constantPool: AvmConstantPool;

  private nextScriptId: number;
  private readonly scriptsById: Map<Avm1ScriptId, Avm1Script>;

  constructor() {
    this.nextScriptId = 0;
    this.scriptsById = new Map();
    this.realm = createRealm();
    this.constantPool = new AvmConstantPool();
  }

  createAvm1Script(
    avm1Bytes: Uint8Array,
    target: TargetId | null,
    rootScope: AvmValue | null,
  ): Avm1ScriptId {
    const id: number = this.nextScriptId++;
    const movie: MovieId = 0;
    const cfgTable: CfgTable = new CfgTable(cfgFromBytes(avm1Bytes));
    const script: Avm1Script = {id, bytes: avm1Bytes, cfgTable, movie, target, rootScope};
    this.scriptsById.set(id, script);
    return id;
  }

  runToCompletion(scriptId: Avm1ScriptId, host: Host, maxActions: number = 1000): void {
    const script: Avm1Script | undefined = this.scriptsById.get(scriptId);
    if (script === undefined) {
      throw new Error(`ScriptNotFound: ${scriptId}`);
    }
    const budget: RunBudget = {maxActions, totalActions: 0};
    try {
      ExecutionContext.runScript(this, host, budget, script);
    } catch (e) {
      if (e instanceof AbortSignal) {
        return;
      } else if (e instanceof AvmThrowSignal) {
        throw new Incident("UnhandledAvmException", {value: e.value});
      } else {
        throw e;
      }
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
}

class RegisterTable {
  private readonly table: AvmValue[];

  constructor(size: UintSize = 4) {
    const table: AvmValue[] = [];
    for (let i: UintSize = 0; i < size; i++) {
      table.push(AVM_UNDEFINED);
    }
    this.table = table;
  }

  public set(regId: UintSize, value: AvmValue): void {
    if (regId < 0 || regId >= this.table.length) {
      throw new Error("InvalidRegisterId");
    }
    this.table[regId] = value;
  }

  public get(regId: UintSize): AvmValue {
    if (regId < 0 || regId >= this.table.length) {
      throw new Error("InvalidRegisterId");
    }
    return this.table[regId];
  }
}

abstract class BaseActivation {
  abstract getScript(): Avm1Script;
}

export class ScriptActivation extends BaseActivation {
  readonly script: Avm1Script;

  constructor(script: Avm1Script) {
    super();
    this.script = script;
  }

  getScript(): Avm1Script {
    return this.script;
  }
}

export class FunctionActivation extends BaseActivation {
  readonly func: AvmFunction;

  constructor(func: AvmFunction) {
    super();
    this.func = func;
  }

  getScript(): Avm1Script {
    return this.func.script;
  }
}

export type Activation = ScriptActivation | FunctionActivation;

enum ToPrimitiveHint {
  Number,
  String,
}

enum FlowResultType {
  Simple,
  Return,
}

interface FlowSimple {
  type: FlowResultType.Simple;
  target: NullableCfgLabel;
}

interface FlowReturn {
  type: FlowResultType.Return;
  value: AvmValue;
}

export type FlowResult = FlowReturn | FlowSimple;

abstract class Signal {
}

// Wrapper for catchable AVM1 errors.
class AvmThrowSignal extends Signal {
  public readonly value: AvmValue;

  constructor(value: AvmValue) {
    super();
    this.value = value;
  }
}

class AbortSignal extends Signal {
  constructor() {
    super();
  }
}

export class ExecutionContext implements ActionContext {
  // Global context
  private readonly vm: Vm;
  private readonly host: Host;

  // Run context
  private readonly budget: RunBudget;

  // Activation context
  private readonly activation: Activation;
  private readonly scope: Scope;
  private readonly stack: AvmStack;
  private readonly registers: RegisterTable;
  private target: TargetId | null;
  private readonly thisArg: AvmObject | AvmUndefined;

  constructor(
    vm: Vm,
    host: Host,
    budget: RunBudget,
    activation: Activation,
    scope: Scope,
    stack: AvmStack,
    registers: RegisterTable,
    target: TargetId | null,
    thisArg: AvmObject | AvmUndefined,
  ) {
    this.vm = vm;
    this.host = host;
    this.budget = budget;
    this.activation = activation;
    this.scope = scope;
    this.stack = stack;
    this.registers = registers;
    this.target = target;
    this.thisArg = thisArg;
  }

  public static runScript(vm: Vm, host: Host, budget: RunBudget, script: Avm1Script): void {
    const globalScope: StaticScope = new StaticScope(undefined);
    for (const [globalName, globalValue] of vm.realm.globals) {
      globalScope.variables.set(globalName, globalValue);
    }

    const activation: ScriptActivation = new ScriptActivation(script);
    const scope: Scope = script.rootScope !== null
      ? new DynamicScope(script.rootScope, globalScope)
      : new StaticScope(globalScope);
    const stack: AvmStack = new AvmStack();
    const registers: RegisterTable = new RegisterTable(4);
    const target: TargetId | null = script.target; // Initialize with default target
    let thisArg: AvmObject | AvmUndefined = AVM_UNDEFINED;
    if (target !== null) {
      const resolvedTarget: Target | undefined = host.getTarget(target);
      if (resolvedTarget !== undefined) {
        thisArg = resolvedTarget.getThis();
      }
    }

    const ctx: ExecutionContext = new ExecutionContext(
      vm,
      host,
      budget,
      activation,
      scope,
      stack,
      registers,
      target,
      thisArg,
    );

    ctx.runCfg(script.cfgTable);
  }

  public runCfg(cfgTable: CfgTable): FlowResult {
    if (cfgTable.entryBlock === undefined) {
      return {type: FlowResultType.Simple, target: null};
    }
    let block: CfgBlock = cfgTable.entryBlock;
    while (this.budget.totalActions < this.budget.maxActions) {
      if (this.budget.totalActions >= this.budget.maxActions) {
      }
      for (const [i, action] of block.actions.entries()) {
        try {
          this.exec(action);
        } catch (e) {
          if (e instanceof Signal) {
            // Propagate signals
            throw e;
          } else {
            throw Incident(e, "SimpleActionError", {blockLabel: block.label, actionIndex: i});
          }
        }
        this.budget.totalActions++;
      }
      let flowResult: FlowResult;
      switch (block.type) {
        case CfgBlockType.Error:
          throw new Error("CorruptedData");
        case CfgBlockType.If: {
          const test: boolean = this.toHostBoolean(this.pop());
          const target: NullableCfgLabel = test ? block.ifTrue : block.ifFalse;
          flowResult = {type: FlowResultType.Simple, target};
          break;
        }
        case CfgBlockType.Return: {
          flowResult = {type: FlowResultType.Return, value: this.pop()};
          break;
        }
        case CfgBlockType.Simple: {
          flowResult = {type: FlowResultType.Simple, target: block.next};
          break;
        }
        case CfgBlockType.Throw: {
          throw new AvmThrowSignal(this.pop());
        }
        case CfgBlockType.Try: {
          const tryTable: CfgTable = new CfgTable(block.try);
          const catchTable: CfgTable | undefined = block.catch !== undefined
            ? new CfgTable(block.catch)
            : undefined;
          const finallyTable: CfgTable | undefined = block.finally !== undefined
            ? new CfgTable(block.finally)
            : undefined;

          try {
            flowResult = this.runCfg(tryTable);
          } catch (e) {
            if (!(e instanceof AvmThrowSignal)) {
              // Propagate internal errors and abort signals
              throw e;
            }

            // TODO try/finally
            if (catchTable !== undefined) {
              // TODO: Add error value to scope
              flowResult = this.runCfg(catchTable);
            } else {
              throw e;
            }
          }

          // TODO Check how `return` is handled in presence of `Finally`

          if (
            finallyTable !== undefined
            && finallyTable.entryBlock !== undefined
            && flowResult.type === FlowResultType.Simple
            && flowResult.target !== null
            && flowResult.target === finallyTable.entryBlock.label
          ) {
            flowResult = this.runCfg(finallyTable);
          }

          break;
        }
        default: {
          throw new Error(`NotImplemented: Support for block type ${CfgBlockType[block.type]}`);
        }
      }
      this.budget.totalActions++;
      switch (flowResult.type) {
        case FlowResultType.Return:
          return flowResult;
        case FlowResultType.Simple: {
          if (flowResult.target === null) {
            return flowResult;
          }
          const nextBlock: CfgBlock | undefined = cfgTable.labelToBlock.get(flowResult.target);
          if (nextBlock === undefined) {
            return flowResult;
          } else {
            block = nextBlock;
          }
          break;
        }
        default: {
          throw new Error(`UnexpectedFlowResult: ${flowResult}`);
        }
      }
    }
    throw new Error("BudgetExhausted");
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
      return this.call(callable, CallType.Apply, thisArg, args);
    }
  }

  public construct(fn: AvmValue, args: ReadonlyArray<AvmValue>): AvmCallResult {
    if (fn.type !== AvmValueType.Object) {
      throw new Error("CannotConstructNonObject");
    }
    if (fn.external) {
      if (fn.handler.construct === undefined) {
        throw new Error("CannotConstructExternal");
      }
      return fn.handler.construct(args);
    } else {
      const callable: Callable | undefined = fn.callable;
      if (callable === undefined) {
        throw new Error("CannotConstructNonCallableObject");
      }

      const thisArg: AvmSimpleObject = {
        type: AvmValueType.Object,
        external: false,
        class: "Object",
        prototype: this.vm.realm.objectProto,
        ownProperties: new Map(),
        callable: undefined,
      };

      this.call(callable, CallType.Construct, thisArg, args);
      return thisArg;
    }
  }

  public createAvmFunction(
    name: string | undefined,
    registerCount: UintSize,
    thisState: ParameterState,
    argumentsState: ParameterState,
    superState: ParameterState,
    preloadRoot: boolean,
    preloadParent: boolean,
    preloadGlobal: boolean,
    parameters: ReadonlyArray<AvmFunctionParameter>,
    body: CfgTable,
  ): AvmSimpleObject {
    const fn: AvmFunction = {
      type: CallableType.Avm,
      parentScope: this.scope,
      script: this.activation.getScript(),
      name,
      registerCount,
      thisState,
      argumentsState,
      superState,
      preloadRoot,
      preloadParent,
      preloadGlobal,
      parameters,
      body,
    };

    const fnObj: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Function",
      prototype: this.vm.realm.funcProto,
      ownProperties: new Map(),
      callable: fn,
    };
    fnObj.ownProperties.set("prototype", AvmPropDescriptor.data(this.vm.newObject()));

    return fnObj;
  }

  public getMember(obj: AvmValue, key: AvmValue): AvmValue {
    return this.getStringMember(obj, this.toHostString(key));
  }

  public getStringMember(obj: AvmValue, key: string): AvmValue {
    const value: AvmValue | undefined = this.tryGetStringMember(obj, key);
    if (value !== undefined) {
      return value;
    }
    this.host.warn(new TargetHasNoPropertyWarning("foo", key));
    return AVM_UNDEFINED;
  }

  // Implements `GetValue` and `[[Get]]`
  public tryGetStringMember(obj: AvmValue, key: string): AvmValue | undefined {
    if (obj.type !== AvmValueType.Object) {
      if (obj.type === AvmValueType.Undefined) {
        return undefined;
      }
      throw new Error("NotImplemented: ReferenceError on non-object property access");
    }
    if (obj.external) {
      return obj.handler.get(key);
    }
    const prop: AvmPropDescriptor | undefined = obj.ownProperties.get(key);
    if (prop !== undefined) {
      if (prop.value === undefined) {
        throw new Error("NotImplemented: AccessorProperties");
      }
      return prop.value;
    }
    if (obj.prototype.type === AvmValueType.Object) {
      return this.tryGetStringMember(obj.prototype, key);
    }
    return undefined;
  }

  public setMember(obj: AvmValue, key: AvmValue, value: AvmValue): void {
    this.setStringMember(obj, this.toHostString(key), value);
  }

  public setStringMember(target: AvmValue, key: string, value: AvmValue): void {
    const targetObj: AvmObject = this.toAvmObject(target);
    if (targetObj.external) {
      targetObj.handler.set(key, value);
    } else {
      targetObj.ownProperties.set(key, AvmPropDescriptor.data(value));
    }
  }

  public getOwnKeys(obj: AvmValue): AvmString[] {
    if (obj.type !== AvmValueType.Object) {
      throw new Error("NotImplemented: ReferenceError on non-object getKeys access");
    }
    if (obj.external) {
      return obj.handler.ownKeys();
    }
    const keys: AvmString[] = [];
    for (const name of obj.ownProperties.keys()) {
      // TODO: Filter enumerable
      keys.push(AvmValue.fromHostString(name));
    }
    return keys;
  }

  // Implementation of the ToBoolean algorithm from ECMA 262-3, section 9.2
  public toAvmBoolean(value: AvmValue): AvmBoolean {
    switch (value.type) {
      case AvmValueType.Boolean:
        return value;
      case AvmValueType.Null:
        return AVM_FALSE;
      case AvmValueType.Number:
        return AvmValue.fromHostBoolean(isNaN(value.value) || value.value === 0);
      case AvmValueType.Object:
        return AVM_TRUE;
      case AvmValueType.String:
        return AvmValue.fromHostBoolean(value.value.length > 0);
      case AvmValueType.Undefined:
        return AVM_FALSE;
      default:
        throw new Error(`UnexpectedAvmValueType: ${value}`);
    }
  }

  // Implementation of the ToObject algorithm from ECMA 262-3, section 9.9
  public toAvmObject(value: AvmValue): AvmObject {
    switch (value.type) {
      case AvmValueType.Boolean:
        return this.createBooleanBox(value.value);
      case AvmValueType.Null:
        throw new Error("TypeError: ToObject(AvmNull)");
      case AvmValueType.Number:
        return this.createNumberBox(value.value);
      case AvmValueType.Object:
        return value;
      case AvmValueType.String:
        return this.createStringBox(value.value);
      case AvmValueType.Undefined:
        throw new Error("TypeError: ToObject(AvmUndefined)");
      default:
        throw new Error(`UnexpectedAvmValueType: ${value}`);
    }
  }

  public createBooleanBox(_value: boolean): AvmObject {
    throw new Error("NotImplemented: createBooleanBox");
    // return {
    //   type: AvmValueType.Object,
    //   external: false,
    //   prototype: this.getRealm().booleanPrototype,
    //   class: "String",
    //   ownProperties: new Map(),
    //   value,
    //   callable: undefined,
    // };
  }

  public createNumberBox(value: number): AvmObject {
    return {
      type: AvmValueType.Object,
      external: false,
      prototype: this.getRealm().numberPrototype,
      class: "String",
      ownProperties: new Map(),
      value,
      callable: undefined,
    };
  }

  public createStringBox(value: string): AvmObject {
    return {
      type: AvmValueType.Object,
      external: false,
      prototype: this.getRealm().stringPrototype,
      class: "String",
      ownProperties: new Map(),
      value,
      callable: undefined,
    };
  }

  // Implementation of the ToString algorithm from ECMA 262-3, section 9.8
  public toAvmString(avmValue: AvmValue): AvmString {
    const primitive: AvmPrimitive = this.toAvmPrimitive(avmValue, ToPrimitiveHint.String);
    switch (primitive.type) {
      case AvmValueType.Boolean:
        return AvmValue.fromHostString(primitive.value ? "true" : "false");
      case AvmValueType.Null:
        return AvmValue.fromHostString("null");
      case AvmValueType.Number: {
        let str: string = primitive.value.toString(10);
        // Naive restriction to 14 decimals
        // TODO: Follow Actionscript's stringification more closely
        str = str.replace(/^(\d+\.\d{0,14})\d*$/, "$1");
        return AvmValue.fromHostString(str);
      }
      case AvmValueType.String:
        return primitive;
      case AvmValueType.Undefined:
        return AvmValue.fromHostString("undefined");
      default:
        throw new Error(`UnexpectedAvmPrimitiveType: ${primitive}`);
    }
  }

  // Implementation of the ToPrimitive algorithm from ECMA 262-3, section 9.1
  // TODO: Make it private?
  public toAvmPrimitive(value: AvmValue, hint?: ToPrimitiveHint): AvmPrimitive {
    return AvmValue.isPrimitive(value) ? value : this.getDefaultValue(value, hint);
  }

  // Implementation of the [[DefaultValue]](hint) algorithm from ECMA 262-3, section 8.6.2.6
  // TODO: Make it private? Merge it with `toAvmPrimitive`?
  public getDefaultValue(obj: AvmObject, hint?: ToPrimitiveHint): AvmPrimitive {
    if (hint !== ToPrimitiveHint.String) {
      throw new Error("NotImplemented: `getDefaultValue` with non string hint");
    }

    // 1. Call the [[Get]] method of object O with argument "toString".
    const toStringFn: AvmValue = this.getStringMember(obj, "toString");
    // 2. If Result(1) is not an object, go to step 5.
    if (toStringFn.type === AvmValueType.Object) {
      // 3. Call the [[Call]] method of Result(1), with O as the this value and an empty argument list.
      const toStringResult: AvmValue = this.apply(toStringFn, obj, []);
      // 4. If Result(3) is a primitive value, return Result(3).
      if (AvmValue.isPrimitive(toStringResult)) {
        return toStringResult;
      }
    }
    // 5. Call the [[Get]] method of object O with argument "valueOf".
    const valueOfFn: AvmValue = this.getStringMember(obj, "valueOf");
    // 6. If Result(5) is not an object, go to step 9.
    if (valueOfFn.type === AvmValueType.Object) {
      // 7. Call the [[Call]] method of Result(5), with O as the this value and an empty argument list.
      const valueOfResult: AvmValue = this.apply(valueOfFn, obj, []);
      // 8. If Result(7) is a primitive value, return Result(7).
      if (AvmValue.isPrimitive(valueOfResult)) {
        return valueOfResult;
      }
    }
    // 9. Throw a TypeError exception.
    throw new Error("NotImplemented: TypeError on `getDefaultValue` failure");
  }

  public toHostString(value: AvmValue): string {
    return this.toAvmString(value).value;
  }

  public toAvmNumber(value: AvmValue): AvmNumber {
    return AvmValue.toAvmNumber(value, SWF_VERSION);
  }

  public toHostNumber(value: AvmValue): number {
    return this.toAvmNumber(value).value;
  }

  // Implementation of the ToInt32 algorithm from ECMA 262-3, section 9.5
  public toHostSint32(value: AvmValue): Sint32 {
    return this.toHostNumber(value) | 0;
  }

  // Implementation of the ToUint32 algorithm from ECMA 262-3, section 9.6
  public toHostUint32(value: AvmValue): Uint32 {
    const result: Sint32 = this.toHostNumber(value) | 0;
    return result < 0 ? 2 ** 32 + result : result;
  }

  public toHostBoolean(value: AvmValue): boolean {
    return this.toAvmBoolean(value).value;
  }

  public initArray(array: ReadonlyArray<AvmValue>): AvmValue {
    const result: AvmValue = this.construct(this.vm.realm.array, []);
    this.setStringMember(result, "length", AvmValue.fromHostNumber(array.length));
    for (const [i, item] of array.entries()) {
      this.setStringMember(result, i.toString(10), item);
    }
    return result;
  }

  public getThis(): AvmObject | AvmUndefined {
    return this.thisArg;
  }

  public getRealm(): Realm {
    return this.vm.realm;
  }

  public throw(value: AvmValue): never {
    throw new AvmThrowSignal(value);
  }

  public abort(): never {
    throw new AbortSignal();
  }

  public getVar(varName: string): AvmValue {
    if (varName === "this") {
      return this.getThis();
    }

    const value: AvmValue | undefined = this.scope.getVar(this, varName);
    if (value !== undefined) {
      return value;
    } else {
      this.host.warn(new ReferenceToUndeclaredVariableWarning(varName));
      return AVM_UNDEFINED;
    }
  }

  public setVar(varName: string, value: AvmValue): void {
    if (varName === "this") {
      throw new Error("NotImplemented: setVar `this`");
    }

    this.scope.setVar(this, varName, value);
  }

  public setLocal(varName: string, value: AvmValue): void {
    if (varName === "this") {
      throw new Error("NotImplemented: setLocal `this`");
    }

    this.scope.setLocal(this, varName, value);
  }

  public touchLocal(varName: string): void {
    if (varName === "this") {
      throw new Error("NotImplemented: touchLocal `this`");
    }

    this.scope.touchLocal(this, varName);
  }

  public push(value: AvmValue): void {
    this.stack.push(value);
  }

  public pop(): AvmValue {
    return this.stack.pop();
  }

  public peek(): AvmValue {
    return this.stack.peek();
  }

  public setConstantPool(pool: ReadonlyArray<AvmString>): void {
    this.vm.constantPool.setConstantPool(pool);
  }

  public getConstant(index: UintSize): AvmString | AvmUndefined {
    return this.vm.constantPool.getConstant(index);
  }

  public getReg(regId: UintSize): AvmValue {
    return this.registers.get(regId);
  }

  public setReg(regId: UintSize, value: AvmValue): void {
    this.registers.set(regId, value);
  }

  // Implements the multiply operation as defined in ECMA-262-3, section 11.5.1
  // ("Applying the * Operator")
  public multiply(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate MultiplicativeExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate UnaryExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToNumber(Result(2)).
    const leftNum: number = this.toHostNumber(left);
    // 6. Call ToNumber(Result(4)).
    const rightNum: number = this.toHostNumber(right);
    // 7. Apply the specified operation (*, /, or %) to Result(5) and Result(6). See the notes
    //    below (11.5.1, 11.5.2, 11.5.3).
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftNum * rightNum);
  }

  // Implements the divide operation as defined in ECMA-262-3, section 11.5.2
  // ("Applying the / Operator")
  public divide(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate MultiplicativeExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate UnaryExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToNumber(Result(2)).
    const leftNum: number = this.toHostNumber(left);
    // 6. Call ToNumber(Result(4)).
    const rightNum: number = this.toHostNumber(right);
    // 7. Apply the specified operation (*, /, or %) to Result(5) and Result(6). See the notes
    //    below (11.5.1, 11.5.2, 11.5.3).
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftNum / rightNum);
  }

  // Implements the remainder operation as defined in ECMA-262-3, section 11.5.3
  // ("Applying the % Operator")
  public remainder(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate MultiplicativeExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate UnaryExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToNumber(Result(2)).
    const leftNum: number = this.toHostNumber(left);
    // 6. Call ToNumber(Result(4)).
    const rightNum: number = this.toHostNumber(right);
    // 7. Apply the specified operation (*, /, or %) to Result(5) and Result(6). See the notes
    //    below (11.5.1, 11.5.2, 11.5.3).
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftNum % rightNum);
  }

  // Implements the add operation as defined in ECMA-262-3, section 11.6.1
  // ("The Addition operator ( + )")
  public add(left: AvmValue, right: AvmValue): AvmString | AvmNumber {
    // 1. Evaluate AdditiveExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate MultiplicativeExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToPrimitive(Result(2)).
    const leftPrimitive: AvmPrimitive = this.toAvmPrimitive(left, undefined);
    // 6. Call ToPrimitive(Result(4)).
    const rightPrimitive: AvmPrimitive = this.toAvmPrimitive(right, undefined);
    // 7. If Type(Result(5)) is String _or_ Type(Result(6)) is String, go to
    //    step 12. (Note that this step differs from step 3 in the comparison
    //    algorithm for the relational operators, by using _or_ instead of
    //    _and_.)
    if (leftPrimitive.type === AvmValueType.String || rightPrimitive.type === AvmValueType.String) {
      // 12. Call ToString(Result(5)).
      const leftString: AvmString = this.toAvmString(leftPrimitive);
      // 13. Call ToString(Result(6)).
      const rightString: AvmString = this.toAvmString(rightPrimitive);
      // 14. Concatenate Result(12) followed by Result(13).
      const result: string = `${leftString.value}${rightString.value}`;
      // 15. Return Result(14).
      return AvmValue.fromHostString(result);
    } else {
      // 8. Call ToNumber(Result(5)).
      const leftNumber: AvmNumber = this.toAvmNumber(leftPrimitive);
      // 9. Call ToNumber(Result(6)).
      const rightNumber: AvmNumber = this.toAvmNumber(rightPrimitive);
      // 10. Apply the addition operation to Result(8) and Result(9). See the note below (11.6.3).
      const result: number = leftNumber.value + rightNumber.value;
      // 11. Return Result(10).
      return AvmValue.fromHostNumber(result);
    }
  }

  // Implements the subtraction operation as defined in ECMA-262-3, section 11.6.2
  // ("The Subtraction Operator ( - )")
  public subtract(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate AdditiveExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate MultiplicativeExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToNumber(Result(2)).
    const leftNum: number = this.toHostNumber(left);
    // 6. Call ToNumber(Result(4)).
    const rightNum: number = this.toHostNumber(right);
    // 7. Apply the subtraction operation to Result(5) and Result(6). See the note below (11.6.3).
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftNum - rightNum);
  }

  // Implements the left shift operation as defined in ECMA-262-3, section 11.7.1
  // ("The Left Shift Operator ( << )")
  public leftShift(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate ShiftExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate AdditiveExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToInt32(Result(2)).
    const leftSint32: Sint32 = this.toHostSint32(left);
    // 6. Call ToUint32(Result(4)).
    const rightUint32: Uint32 = this.toHostUint32(right);
    // 7. Mask out all but the least significant 5 bits of Result(6), that is, compute Result(6) & 0x1F.
    // 8. Left shift Result(5) by Result(7) bits. The result is a signed 32 bit integer.
    // 9. Return Result(8).
    return AvmValue.fromHostNumber(leftSint32 << rightUint32);
  }

  // Implements the signed right shift operation as defined in ECMA-262-3, section 11.7.2
  // ("The Signed Right Shift Operator ( >> )")
  public signedRightShift(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate ShiftExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate AdditiveExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToInt32(Result(2)).
    const leftSint32: Sint32 = this.toHostSint32(left);
    // 6. Call ToUint32(Result(4)).
    const rightUint32: Uint32 = this.toHostUint32(right);
    // 7. Mask out all but the least significant 5 bits of Result(6), that is, compute Result(6) & 0x1F.
    // 8. Perform sign-extending right shift of Result(5) by Result(7) bits. The most significant
    //    bit is propagated. The result is a signed 32 bit integer.
    // 9. Return Result(8).
    return AvmValue.fromHostNumber(leftSint32 >> rightUint32);
  }

  // Implements the unsigned right shift operation as defined in ECMA-262-3, section 11.7.3
  // ("The Unsigned Right Shift Operator ( >>> )")
  public unsignedRightShift(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate ShiftExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate AdditiveExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToInt32(Result(2)).
    const leftSint32: Sint32 = this.toHostSint32(left);
    // 6. Call ToUint32(Result(4)).
    const rightUint32: Uint32 = this.toHostUint32(right);
    // 7. Mask out all but the least significant 5 bits of Result(6), that is, compute Result(6) & 0x1F.
    // 8. Perform zero-filling right shift of Result(5) by Result(7) bits. Vacated bits are filled
    //    with zero. The result is an unsigned 32 bit integer.
    // 9. Return Result(8).
    return AvmValue.fromHostNumber(leftSint32 >>> rightUint32);
  }

  // Implements the instanceof operation as defined in ECMA-262-3, section 11.8.6
  // ("The instanceof operator")
  public instanceof(left: AvmValue, right: AvmValue): AvmBoolean {
    // 1. Evaluate RelationalExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate ShiftExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. If Result(4) is not an object, throw a TypeError exception.
    if (right.type !== AvmValueType.Object) {
      // Flash diverges from ES-262 here: it returns false instead of throwing
      return AVM_FALSE;
      // throw new Error("TypeError: Right side is not an object");
    }

    // 6. If Result(4) does not have a [[HasInstance]] method, throw a TypeError exception.
    if (right.external) {
      throw new Error("NotImplemented: instanceof on external");
    }
    if (right.callable === undefined) {
      throw new Error("TypeError: Right side is not callable");
    }

    // 7. Call the [[HasInstance]] method of Result(4) with parameter Result(2).
    // 8. Return Result(7).
    if (left.type !== AvmValueType.Object) {
      return AVM_FALSE;
    }
    if (left.external) {
      throw new Error("NotImplemented: instanceof on external");
    }
    const rightProto: AvmValue = this.getStringMember(right, "prototype");
    if (rightProto.type !== AvmValueType.Object) {
      throw new Error("TypeError: Right side has non-object prototype");
    }
    // TODO: Loop over prototype chain
    const cur: AvmObject | AvmNull = left.prototype;
    if (cur.type === AvmValueType.Null) {
      return AVM_FALSE;
    }
    if (cur === rightProto) {
      return AVM_TRUE;
    }
    return AVM_FALSE;
  }

  // Implements the equals operation as defined in ECMA-262-3, section 11.9.1
  // ("The Equals Operator ( == )")
  public equals(left: AvmValue, right: AvmValue): AvmBoolean {
    // > 1. Evaluate EqualityExpression.
    // > 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // > 3. Evaluate RelationalExpression.
    // > 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`
    // > 5. Perform the comparison Result(4) == Result(2). (see 11.9.3).
    // > 6. Return Result(5).
    return AvmValue.fromHostBoolean(this.abstractEquals(left, right));
  }

  // Implements the bitwise and operation as defined in ECMA-262-3, section 11.10
  public bitwiseAnd(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate A.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate B.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToInt32(Result(2)).
    const leftSint32: Sint32 = this.toHostSint32(left);
    // 5. Call ToInt32(Result(4)).
    const rightSint32: Sint32 = this.toHostSint32(right);
    // 7. Apply the bitwise operator @ to Result(5) and Result(6). The result is a signed 32 bit
    //    integer.
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftSint32 & rightSint32);
  }

  // Implements the bitwise xor operation as defined in ECMA-262-3, section 11.10
  public bitwiseXor(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate A.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate B.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToInt32(Result(2)).
    const leftSint32: Sint32 = this.toHostSint32(left);
    // 5. Call ToInt32(Result(4)).
    const rightSint32: Sint32 = this.toHostSint32(right);
    // 7. Apply the bitwise operator @ to Result(5) and Result(6). The result is a signed 32 bit
    //    integer.
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftSint32 ^ rightSint32);
  }

  // Implements the bitwise or operation as defined in ECMA-262-3, section 11.10
  public bitwiseOr(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate A.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate B.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToInt32(Result(2)).
    const leftSint32: Sint32 = this.toHostSint32(left);
    // 5. Call ToInt32(Result(4)).
    const rightSint32: Sint32 = this.toHostSint32(right);
    // 7. Apply the bitwise operator @ to Result(5) and Result(6). The result is a signed 32 bit
    //    integer.
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftSint32 | rightSint32);
  }

  public exec(action: CfgAction): void {
    switch (action.action) {
      case ActionType.CallMethod:
        this.execCallMethod();
        break;
      case ActionType.GotoFrame:
        this.execGotoFrame(action);
        break;
      case ActionType.Greater:
        this.execGreater();
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
      case ActionType.SetTarget:
        this.execSetTarget(action);
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
      default:
        actions.action(this, action);
        break;
    }
  }

  private execCallMethod(): void {
    const key: AvmValue = this.stack.pop();
    if (key.type === AvmValueType.Undefined) {
      throw new Error("NotImplemented: undefined key for execCallMethod");
    }
    const obj: AvmValue = this.stack.pop();
    const method: AvmValue = this.getMember(obj, key);
    const avmArgCount: AvmValue = this.stack.pop();
    const argCount: number = this.toUintSize(avmArgCount);
    const args: AvmValue[] = [];
    for (let _: number = 0; _ < argCount; _++) {
      args.push(this.stack.pop());
    }
    const result: AvmValue = this.apply(method, obj, args);
    this.stack.push(result);
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

  private execInitObject(): void {
    const avmPropertyCount: AvmValue = this.stack.pop();
    const propertyCount: number = this.toUintSize(avmPropertyCount);
    const obj: AvmObject = this.vm.newObject();
    for (let _: number = 0; _ < propertyCount; _++) {
      const value: AvmValue = this.stack.pop();
      const key: string = this.toAvmString(this.stack.pop()).value;
      obj.ownProperties.set(key, AvmPropDescriptor.data(value));
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
    const arg: AvmBoolean = this.toAvmBoolean(this.stack.pop());
    if (SWF_VERSION >= 5) {
      this.stack.push(arg.value ? AVM_FALSE : AVM_TRUE);
    } else {
      this.stack.push(arg.value ? AVM_ZERO : AVM_ONE);
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

  private execSetTarget(action: SetTarget): void {
    if (action.targetName === "") {
      this.target = this.activation.getScript().target;
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

  private execStrictEquals(): void {
    const right: AvmValue = this.stack.pop();
    const left: AvmValue = this.stack.pop();
    const result: AvmBoolean = AvmValue.fromHostBoolean(this.abstractStrictEquals(left, right));
    this.stack.push(result);
  }

  private execTrace(): void {
    const message: AvmValue = this.stack.pop();
    // TODO: Remove `undefined` special case? Does not seem necessary
    const messageStr: AvmString = message.type === AvmValueType.Undefined
      ? AvmValue.fromHostString("undefined")
      : this.toAvmString(message);
    this.host.trace(messageStr.value);
  }

  // private execWaitForFrame(action: WaitForFrame): void {
  //   if (this.target === null) {
  //     console.warn("NoCurrentTarget");
  //     return;
  //   }
  //   const target: Target | undefined = this.host.getTarget(this.target);
  //   if (target === undefined) {
  //     console.warn("TargetNotFound");
  //     return;
  //   }
  //   const progress: { loaded: UintSize; total: UintSize } = target.getFrameLoadingProgress();
  //
  //   // - `action.frame` is 0-indexed.
  //   // - `progress.loaded` returns values in `[0, progress.total]` (inclusive) but since we are
  //   //   running the script, the first frame should be loaded and we can expected
  //   //   `progress.loaded >= 1` (or maybe we may get `0` using `setTarget` shenanigans)
  //   // - `progress.loaded >= progress.total` implies `isRequestedFrameLoaded` regardless of frame
  //   //   index.
  //
  //   const isRequestedFrameLoaded: boolean = progress.loaded >= progress.total || progress.loaded > action.frame;
  //
  //   if (isRequestedFrameLoaded) {
  //     this.skipCount = action.skipCount;
  //   }
  // }

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
          // We do not use joined objects so a simple reference test is enough to check for
          // object equality.
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

  private call(
    callable: Callable,
    callType: CallType,
    thisArg: AvmObject | AvmUndefined,
    args: ReadonlyArray<AvmValue>,
  ): AvmCallResult {
    if (callable.type === CallableType.Host) {
      return callable.handler(HostCallContext.auto(this, callType, thisArg, args));
    }
    // assert: callable.type === CallableType.Avm
    const activation: FunctionActivation = new FunctionActivation(callable);
    const scope: FunctionScope = new FunctionScope(callable);

    const stack: AvmStack = new AvmStack();
    const registers: RegisterTable = new RegisterTable(callable.registerCount);
    // TODO: Check how the target changes across function calls
    const target: TargetId | null = callable.script.target;

    // Initialize scope and registers
    if (callable.thisState === ParameterState.Preload) {
      registers.set(1, thisArg);
    }
    for (const [i, param] of callable.parameters.entries()) {
      const value: AvmValue = i < args.length ? args[i] : AVM_UNDEFINED;
      if (param.register !== undefined) {
        registers.set(param.register, value);
      }
      scope.setLocal(this, param.name, value);
    }

    const ctx: ExecutionContext = new ExecutionContext(
      this.vm,
      this.host,
      this.budget,
      activation,
      scope,
      stack,
      registers,
      target,
      thisArg,
    );

    const flowResult: FlowResult = ctx.runCfg(callable.body);
    switch (flowResult.type) {
      case FlowResultType.Return: {
        // TODO: Improve return logic for constructors?
        return flowResult.value;
      }
      case FlowResultType.Simple: {
        // TODO: Assert null target
        return AVM_UNDEFINED;
      }
      default: {
        throw new Error(`UnexpectedFlowResultType: ${flowResult}`);
      }
    }
  }
}
