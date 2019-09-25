// tslint:disable:max-classes-per-file max-file-line-count

import { cfgFromBytes } from "avm1-parser";
import { ActionType } from "avm1-tree/action-type";
import { ConstantPool, GotoFrame, Push, SetTarget } from "avm1-tree/actions";
import { CfgAction } from "avm1-tree/cfg-action";
import { CfgDefineFunction } from "avm1-tree/cfg-actions/cfg-define-function";
import { CfgBlock } from "avm1-tree/cfg-block";
import { CfgBlockType } from "avm1-tree/cfg-block-type";
import { NullableCfgLabel } from "avm1-tree/cfg-label";
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
  AvmPrimitive,
  AvmSimpleObject,
  AvmString,
  AvmUndefined,
  AvmValue,
  AvmValueType,
} from "./avm-value";
import { AvmConstantPool } from "./constant-pool";
import { ActionContext, RunBudget } from "./context";
import { ReferenceToUndeclaredVariableWarning, TargetHasNoPropertyWarning } from "./error";
import { AvmCallResult, AvmFunction, Callable, CallableType, CallType } from "./function";
import { Host, Target } from "./host";
import { Realm } from "./realm";
import { AvmScope, ScopeType, StaticScope } from "./scope";
import { Avm1Script, Avm1ScriptId, CfgTable } from "./script";
import { AvmStack } from "./stack";

const SWF_VERSION: number = 8;

// export class Vm {
//   execAvm1(avm1: Uint8Array) {
//     const parser =
//   };
// }

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
    this.realm = new Realm();
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
    ExecutionContext.runScript(this, host, budget, script);
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

class ScriptActivation extends BaseActivation {
  readonly script: Avm1Script;

  constructor(script: Avm1Script) {
    super();
    this.script = script;
  }

  getScript(): Avm1Script {
    return this.script;
  }
}

class FunctionActivation extends BaseActivation {
  readonly func: AvmFunction;

  constructor(func: AvmFunction) {
    super();
    this.func = func;
  }

  getScript(): Avm1Script {
    return this.func.script;
  }
}

type Activation = ScriptActivation | FunctionActivation;

enum ToPrimitiveHint {
  Number,
  String,
}

export class ExecutionContext implements ActionContext {
  // Global context
  private readonly vm: Vm;
  private readonly host: Host;

  // Run context
  private readonly budget: RunBudget;

  // Activation context
  private readonly activation: Activation;
  private readonly scope: AvmScope;
  private readonly stack: AvmStack;
  private readonly registers: RegisterTable;
  private target: TargetId | null;

  constructor(
    vm: Vm,
    host: Host,
    budget: RunBudget,
    activation: Activation,
    scope: AvmScope,
    stack: AvmStack,
    registers: RegisterTable,
    target: TargetId | null,
  ) {
    this.vm = vm;
    this.host = host;
    this.budget = budget;
    this.activation = activation;
    this.scope = scope;
    this.stack = stack;
    this.registers = registers;
    this.target = target;
  }

  public static runScript(vm: Vm, host: Host, budget: RunBudget, script: Avm1Script): void {
    const activation: ScriptActivation = new ScriptActivation(script);
    const scope: AvmScope = script.rootScope !== null
      ? {type: ScopeType.Dynamic, container: script.rootScope}
      : {type: ScopeType.Static, variables: new Map()};
    const stack: AvmStack = new AvmStack();
    const registers: RegisterTable = new RegisterTable(4);
    const target: TargetId | null = script.target; // Initialize with default target

    const ctx: ExecutionContext = new ExecutionContext(
      vm,
      host,
      budget,
      activation,
      scope,
      stack,
      registers,
      target,
    );

    ctx.runCfg(script.cfgTable);
  }

  public runCfg(cfgTable: CfgTable): void {
    let block: CfgBlock | undefined = cfgTable.entryBlock;
    while (block !== undefined) {
      if (this.budget.totalActions >= this.budget.maxActions) {
        throw new Error("BudgetExhausted");
      }
      for (const action of block.actions) {
        this.exec(action);
        this.budget.totalActions++;
      }
      switch (block.type) {
        case CfgBlockType.Error:
          throw new Error("CorruptedData");
        case CfgBlockType.If: {
          const test: boolean = this.toHostBoolean(this.pop());
          const target: NullableCfgLabel = test ? block.ifTrue : block.ifFalse;
          if (target === null) {
            block = undefined;
          } else {
            block = cfgTable.labelToBlock.get(target);
          }
          break;
        }
        case CfgBlockType.Simple: {
          if (block.next === null) {
            block = undefined;
          } else {
            block = cfgTable.labelToBlock.get(block.next);
          }
          break;
        }
        default: {
          throw new Error(`NotImplemented: Support for block type ${CfgBlockType[block.type]}`);
        }
      }
      this.budget.totalActions++;
    }
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
      return this.call(callable, thisArg, args);
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

      this.call(callable, thisArg, args);
      return thisArg;
    }
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
    const prop: AvmObjectProperty | undefined = obj.ownProperties.get(key);
    if (prop !== undefined) {
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

  public setStringMember(obj: AvmValue, key: string, value: AvmValue): void {
    this.vm.setMember(obj, key, value);
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

  public toAvmBoolean(value: AvmValue): AvmValue {
    return AvmValue.toAvmBoolean(value, SWF_VERSION);
  }

  // Implementation of the ToString algorithm from ECMA 262-3, section 9.8
  public toAvmString(avmValue: AvmValue): AvmString {
    const primitive: AvmPrimitive = this.toAvmPrimitive(avmValue, ToPrimitiveHint.String);
    switch (primitive.type) {
      case AvmValueType.Boolean:
        return AvmValue.fromHostString(primitive.value ? "true" : "false");
      case AvmValueType.Null:
        return AvmValue.fromHostString("null");
      case AvmValueType.Number:
        return AvmValue.fromHostString(primitive.value.toString(10));
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

  public toHostBoolean(value: AvmValue): boolean {
    if (value.type === AvmValueType.Boolean) {
      return value.value;
    }
    throw new Error("NotImplemented: toHostBoolean on non-boolean");
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

  public peek(): AvmValue {
    return this.stack.peek();
  }

  public getReg(regId: UintSize): AvmValue {
    return this.registers.get(regId);
  }

  public setReg(regId: UintSize, value: AvmValue): void {
    this.registers.set(regId, value);
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

  public exec(action: CfgAction): void {
    switch (action.action) {
      case ActionType.CallMethod:
        this.execCallMethod();
        break;
      case ActionType.ConstantPool:
        this.execConstantPool(action);
        break;
      case ActionType.DefineFunction:
        this.execDefineFunction(action);
        break;
      case ActionType.Equals2:
        this.execEquals2();
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
      case ActionType.Push:
        this.execPush(action);
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

  private execConstantPool(action: ConstantPool): void {
    const pool: AvmString[] = [];
    for (const value of action.constantPool) {
      pool.push({type: AvmValueType.String as AvmValueType.String, value});
    }
    this.vm.constantPool.set(pool);
  }

  private execDefineFunction(action: CfgDefineFunction): void {
    const fn: AvmFunction = {
      type: CallableType.Avm,
      parentScope: this.scope,
      script: this.activation.getScript(),
      name: action.name,
      parameters: action.parameters,
      registerCount: 4,
      body: new CfgTable(action.body),
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
          this.stack.push(this.vm.constantPool.get(value.value));
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
        case AstValueType.Register:
          this.stack.push(this.registers.get(value.value));
          break;
        case AstValueType.Sint32:
          this.stack.push({type: AvmValueType.Number as AvmValueType.Number, value: value.value});
          break;
        case AstValueType.String:
          this.stack.push(AvmValue.fromHostString(value.value));
          break;
        case AstValueType.Undefined:
          this.stack.push(AVM_UNDEFINED);
          break;
        default:
          throw new Error(`UnknownValueType ${value}`);
      }
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

  private call(callable: Callable, thisArg: AvmObject | AvmUndefined, args: ReadonlyArray<AvmValue>): AvmCallResult {
    if (callable.type === CallableType.Host) {
      return callable.handler({type: CallType.Apply, thisArg, args});
    }
    // assert: callable.type === CallableType.Avm
    const activation: FunctionActivation = new FunctionActivation(callable);
    const scope: StaticScope = {
      type: ScopeType.Static,
      variables: new Map(),
      parent: callable.parentScope,
    };

    const stack: AvmStack = new AvmStack();
    const registers: RegisterTable = new RegisterTable(4);
    // TODO: Check how the target changes across function calls
    const target: TargetId | null = callable.script.target;

    const ctx: ExecutionContext = new ExecutionContext(
      this.vm,
      this.host,
      this.budget,
      activation,
      scope,
      stack,
      registers,
      target,
    );

    ctx.runCfg(callable.body);

    // TODO: Handle return values
    return AVM_UNDEFINED;
  }
}
