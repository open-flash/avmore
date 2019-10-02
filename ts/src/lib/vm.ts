// tslint:disable:max-classes-per-file max-file-line-count

import { cfgFromBytes } from "avm1-parser";
import { ActionType } from "avm1-types/action-type";
import { GotoFrame, GotoLabel, SetTarget } from "avm1-types/actions";
import { CatchTargetType } from "avm1-types/catch-targets/_type";
import { CfgAction } from "avm1-types/cfg-action";
import { CfgBlock } from "avm1-types/cfg-block";
import { CfgBlockType } from "avm1-types/cfg-block-type";
import { CfgTryBlock } from "avm1-types/cfg-blocks/cfg-try-block";
import { CfgWaitForFrameBlock } from "avm1-types/cfg-blocks/cfg-wait-for-frame-block";
import { CfgWaitForFrame2Block } from "avm1-types/cfg-blocks/cfg-wait-for-frame2-block";
import { CfgWithBlock } from "avm1-types/cfg-blocks/cfg-with-block";
import { NullableCfgLabel } from "avm1-types/cfg-label";
import { Incident } from "incident";
import { Uint32, UintSize } from "semantic-types";
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
import { ActionContext, RunBudget, StackContext } from "./context";
import {
  CorruptDataWarning,
  ReferenceToUndeclaredVariableWarning,
  TargetHasNoPropertyWarning,
  UncaughtException,
} from "./error";
import { FlowResult, FlowResultType } from "./flow-result";
import { AvmFunction, AvmFunctionParameter, CallableType, ParameterState } from "./function";
import { Host, Target } from "./host";
import { createRealm, Realm } from "./realm";
import { RegisterTable } from "./register-table";
import { BaseRuntime, ToPrimitiveHint } from "./runtime/base-runtime";
import { DynamicScope, Scope, StaticScope } from "./scope";
import { Avm1Script, Avm1ScriptId, CfgTable } from "./script";
import { AbortSignal, AvmThrowSignal, Signal } from "./signal";
import { AvmStack } from "./stack";

export type TargetId = number;
export type MovieId = number;

export class Vm {
  public readonly realm: Realm;
  public readonly host: Host;
  public readonly constantPool: AvmConstantPool;
  public readonly swfVersion: number;

  private nextScriptId: number;
  private readonly scriptsById: Map<Avm1ScriptId, Avm1Script>;

  constructor(host: Host) {
    this.realm = createRealm();
    this.host = host;
    this.nextScriptId = 0;
    this.scriptsById = new Map();
    this.constantPool = new AvmConstantPool();
    this.swfVersion = 8;
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

  runToCompletion(scriptId: Avm1ScriptId, maxActions: number = 1000): void {
    const script: Avm1Script | undefined = this.scriptsById.get(scriptId);
    if (script === undefined) {
      throw new Error(`ScriptNotFound: ${scriptId}`);
    }
    const budget: RunBudget = {maxActions, totalActions: 0};
    ExecutionContext.runScript(this, budget, script);
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
      prototype: proto !== undefined ? proto : this.realm.objectPrototype,
      ownProperties: new Map(),
    };
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

export class ExecutionContext extends BaseRuntime implements ActionContext {
  // Activation context
  private readonly activation: Activation;
  private readonly scope: Scope;
  private readonly stack: AvmStack;
  private readonly registers: RegisterTable;
  private target: TargetId | null;
  private readonly thisArg: AvmObject | AvmUndefined;

  // Internal
  private missingPropertyDetector: MissingPropertyDetector;

  constructor(
    vm: Vm,
    budget: RunBudget,
    activation: Activation,
    scope: Scope,
    stack: AvmStack,
    registers: RegisterTable,
    target: TargetId | null,
    thisArg: AvmObject | AvmUndefined,
  ) {
    super(vm, budget);
    this.activation = activation;
    this.scope = scope;
    this.stack = stack;
    this.registers = registers;
    this.target = target;
    this.thisArg = thisArg;
    this.missingPropertyDetector = new MissingPropertyDetector();
  }

  public static runScript(vm: Vm, budget: RunBudget, script: Avm1Script): void {
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
      const resolvedTarget: Target | undefined = vm.host.getTarget(target);
      if (resolvedTarget !== undefined) {
        thisArg = resolvedTarget.getThis();
      }
    }

    const ctx: ExecutionContext = new ExecutionContext(
      vm,
      budget,
      activation,
      scope,
      stack,
      registers,
      target,
      thisArg,
    );

    try {
      const flowResult: FlowResult = ctx.runCfg(script.cfgTable);
      if (flowResult.type === FlowResultType.Throw) {
        // TODO: Handle erors thrown when converting this error to string
        const valueString: string = ctx.toHostString(flowResult.value);
        vm.host.warn(new UncaughtException(valueString));
      }
    } catch (e) {
      if (e instanceof AbortSignal) {
        return;
      } else {
        throw e;
      }
    }
  }

  public runCfg(cfgTable: CfgTable): FlowResult {
    if (cfgTable.entryBlock === undefined) {
      return {type: FlowResultType.Simple, target: null};
    }
    let block: CfgBlock = cfgTable.entryBlock;
    while (this.budget.totalActions < this.budget.maxActions) {
      this.missingPropertyDetector.beforeSimpleActions();
      for (const [i, action] of block.actions.entries()) {
        this.missingPropertyDetector.beforeSimpleAction(this, action);
        try {
          this.exec(action);
        } catch (e) {
          if (e instanceof AvmThrowSignal) {
            return {type: FlowResultType.Throw, value: e.value};
          } else if (e instanceof Signal) {
            // Propagate other signals (abort)
            throw e;
          } else {
            throw Incident(e, "SimpleActionError", {blockLabel: block.label, actionIndex: i});
          }
        }
        this.budget.totalActions++;
        this.missingPropertyDetector.afterSimpleAction(this, action);
      }
      this.missingPropertyDetector.afterSimpleActions();
      let flowResult: FlowResult;
      switch (block.type) {
        case CfgBlockType.Error:
          this.vm.host.warn(new CorruptDataWarning());
          throw new AbortSignal();
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
          return {type: FlowResultType.Throw, value: this.pop()};
        }
        case CfgBlockType.Try: {
          flowResult = this.flowTryBlock(block);
          break;
        }
        case CfgBlockType.WaitForFrame: {
          flowResult = this.flowWaitForFrameBlock(block);
          break;
        }
        case CfgBlockType.WaitForFrame2: {
          flowResult = this.flowWaitForFrame2Block(block);
          break;
        }
        case CfgBlockType.With: {
          flowResult = this.flowWithBlock(block);
          break;
        }
        default: {
          throw new Error(`NotImplemented: Support for block type ${block}`);
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
        case FlowResultType.Throw:
          return flowResult;
        default: {
          throw new Error(`UnexpectedFlowResult: ${flowResult}`);
        }
      }
    }
    throw new Error("BudgetExhausted");
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
      prototype: this.getRealm().functionPrototype,
      ownProperties: new Map(),
      callable: fn,
    };
    fnObj.ownProperties.set("prototype", AvmPropDescriptor.data(this.vm.newObject()));

    return fnObj;
  }

  // Override to add warning support
  public getStringMember(obj: AvmValue, key: string): AvmValue {
    const value: AvmValue | undefined = this.tryGetStringMember(obj, key);
    if (value !== undefined) {
      return value;
    }
    const targetName: string | undefined = this.missingPropertyDetector.getVarName();
    if (targetName !== undefined) {
      this.vm.host.warn(new TargetHasNoPropertyWarning(targetName, key));
    }
    return AVM_UNDEFINED;
  }

  public getThis(): AvmObject | AvmUndefined {
    return this.thisArg;
  }

  public getVar(varName: string): AvmValue {
    if (varName === "this") {
      return this.getThis();
    }

    const value: AvmValue | undefined = this.scope.getVar(this, varName);
    if (value !== undefined) {
      return value;
    } else {
      this.vm.host.warn(new ReferenceToUndeclaredVariableWarning(varName));
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

  public exec(action: CfgAction): void {
    switch (action.action) {
      case ActionType.CallMethod:
        this.execCallMethod();
        break;
      case ActionType.GotoFrame:
        this.execGotoFrame(action);
        break;
      case ActionType.GotoLabel:
        this.execGotoLabel(action);
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
    const target: Target | undefined = this.vm.host.getTarget(this.target);
    if (target !== undefined) {
      target.gotoFrame(action.frame);
    } else {
      console.warn("TargetNotFound");
    }
  }

  private execGotoLabel(action: GotoLabel): void {
    if (this.target === null) {
      console.warn("NoCurrentTarget");
      return;
    }
    const target: Target | undefined = this.vm.host.getTarget(this.target);
    if (target !== undefined) {
      target.gotoLabel(action.label);
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
    if (this.vm.swfVersion >= 5) {
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
    const target: Target | undefined = this.vm.host.getTarget(this.target);
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
    const target: Target | undefined = this.vm.host.getTarget(this.target);
    if (target !== undefined) {
      target.stop();
    } else {
      console.warn("TargetNotFound");
    }
  }

  private execTrace(): void {
    const message: AvmValue = this.stack.pop();
    // TODO: Remove `undefined` special case? Does not seem necessary
    const messageStr: AvmString = message.type === AvmValueType.Undefined
      ? AvmValue.fromHostString("undefined")
      : this.toAvmString(message);
    this.vm.host.trace(messageStr.value);
  }

  private toUintSize(avmValue: AvmValue): number {
    if (avmValue.type === AvmValueType.Number && avmValue.value >= 0 && Math.floor(avmValue.value) === avmValue.value) {
      return avmValue.value;
    }
    throw new Error("InvalidUintSize");
  }

  // Implementation of the abstract relational comparison algorithm from ECMA 262-3, section 11.8.5
  private abstractCompare(left: AvmValue, right: AvmValue): boolean | undefined {
    const leftPrimitive: AvmPrimitive = this.toAvmPrimitive(left, ToPrimitiveHint.Number);
    const rightPrimitive: AvmPrimitive = this.toAvmPrimitive(right, ToPrimitiveHint.Number);
    if (leftPrimitive.type === AvmValueType.String && rightPrimitive.type === AvmValueType.String) {
      throw new Error("NotImplemented");
    } else {
      const leftNumber: AvmNumber = this.toAvmNumber(leftPrimitive);
      const rightNumber: AvmNumber = this.toAvmNumber(rightPrimitive);
      if (isNaN(leftNumber.value) || isNaN(rightNumber.value)) {
        return undefined;
      }
      return leftNumber.value < rightNumber.value;
    }
  }

  private flowTryBlock(block: CfgTryBlock): FlowResult {
    const tryTable: CfgTable = new CfgTable(block.try);
    const catchTable: CfgTable | undefined = block.catch !== undefined
      ? new CfgTable(block.catch)
      : undefined;
    const finallyTable: CfgTable | undefined = block.finally !== undefined
      ? new CfgTable(block.finally)
      : undefined;

    let flowResult: FlowResult;
    flowResult = this.runCfg(tryTable);
    if (flowResult.type === FlowResultType.Throw && catchTable !== undefined) {
      switch (block.catchTarget.type) {
        case CatchTargetType.Register:
          this.setReg(block.catchTarget.target, flowResult.value);
          break;
        case CatchTargetType.Variable:
          this.setVar(block.catchTarget.target, flowResult.value);
          break;
        default:
          throw new Error("UnexpectedCatchTargetType");
      }
      flowResult = this.runCfg(catchTable);
    }
    if (finallyTable !== undefined) {
      let shouldRunFinally: boolean = false;
      switch (flowResult.type) {
        case FlowResultType.Simple: {
          if (flowResult.target === finallyTable.entryBlock.label) {
            shouldRunFinally = true;
          }
          break;
        }
        case FlowResultType.Return:
        case FlowResultType.Throw: {
          shouldRunFinally = true;
          break;
        }
        default: {
          throw new Error(`UnexpectedTryCatchFlowResult: ${flowResult}`);
        }
      }
      if (shouldRunFinally) {
        const finallyFlowResult: FlowResult = this.runCfg(finallyTable);
        switch (finallyFlowResult.type) {
          case FlowResultType.Return: {
            flowResult = finallyFlowResult;
            break;
          }
          case FlowResultType.Simple: {
            // Only update if the finally ends the function or
            // the try/catch flow result was simple
            if (finallyFlowResult.target === null || flowResult.type === FlowResultType.Simple) {
              flowResult = finallyFlowResult;
            }
            break;
          }
          case FlowResultType.Throw: {
            flowResult = finallyFlowResult;
            break;
          }
          default: {
            throw new Error(`UnexpectedFinallyFlowResult: ${flowResult}`);
          }
        }
      }
    }

    return flowResult;
  }

  private flowWithBlock(block: CfgWithBlock): FlowResult {
    const scopeTarget: AvmValue = this.pop();
    const withScope: DynamicScope = new DynamicScope(scopeTarget, this.scope);

    const withCtx: ExecutionContext = new ExecutionContext(
      this.vm,
      this.budget,
      this.activation,
      withScope,
      this.stack,
      this.registers,
      this.target,
      this.thisArg,
    );

    return withCtx.runCfg(new CfgTable(block.with));
  }

  private flowWaitForFrameBlock(block: CfgWaitForFrameBlock): FlowResult {
    if (this.target === null) {
      throw new Error("MissingTargetId: Cannot run WaitForFrame");
    }
    const target: Target | undefined = this.vm.host.getTarget(this.target);
    if (target === undefined) {
      throw new Error("TargetNotFound: Cannot run WaitForFrame");
    }
    const progress: { loaded: UintSize; total: UintSize } = target.getFrameLoadingProgress();

    // - `action.frame` is 0-indexed (different from `WaitForFrame2`).
    // - `progress.loaded` returns values in `[0, progress.total]` (inclusive) it can be `0` (or
    //    generally less than `_currentframe`) in streaming mode when running scripts for a frame
    //    that is still loading.
    // - `progress.loaded >= progress.total` implies `isRequestedFrameLoaded` regardless of frame
    //   index.

    const isLoaded: boolean = progress.loaded >= progress.total || progress.loaded > block.frame;

    const jumpTarget: NullableCfgLabel = isLoaded ? block.ifLoaded : block.ifNotLoaded;
    return {type: FlowResultType.Simple, target: jumpTarget};
  }

  private flowWaitForFrame2Block(block: CfgWaitForFrame2Block): FlowResult {
    if (this.target === null) {
      throw new Error("MissingTargetId: Cannot run WaitForFrame2");
    }
    const target: Target | undefined = this.vm.host.getTarget(this.target);
    if (target === undefined) {
      throw new Error("TargetNotFound: Cannot run WaitForFrame2");
    }
    const frame: Uint32 = this.toHostUint32(this.pop());
    const progress: { loaded: UintSize; total: UintSize } = target.getFrameLoadingProgress();

    // - `frame` is 1-indexed (different from `WaitForFrame`).
    // - `progress.loaded` returns values in `[0, progress.total]` (inclusive) it can be `0` (or
    //    generally less than `_currentframe`) in streaming mode when running scripts for a frame
    //    that is still loading.
    // - `progress.loaded >= progress.total` implies `isRequestedFrameLoaded` regardless of frame
    //   index.

    const isLoaded: boolean = progress.loaded >= progress.total || progress.loaded >= frame;

    const jumpTarget: NullableCfgLabel = isLoaded ? block.ifLoaded : block.ifNotLoaded;
    return {type: FlowResultType.Simple, target: jumpTarget};
  }
}

/**
 * Retrieve the variable name for `TargetHasNoPropertyWarning`
 *
 * This is implemented by simply recognizing the sequence
 * `getVariable push* getMember`.
 *
 * This is very naive and could be improved.
 */
class MissingPropertyDetector {
  private varName: string | undefined;
  private getMemberSeen: boolean;

  constructor() {
    this.varName = undefined;
    this.getMemberSeen = true;
  }

  public beforeSimpleActions(): void {
    this.reset();
  }

  public beforeSimpleAction(ctx: StackContext, action: CfgAction): void {
    switch (action.action) {
      case ActionType.GetVariable: {
        const name: AvmValue = ctx.peek();
        if (name.type === AvmValueType.String) {
          this.varName = name.value;
        } else {
          this.reset();
        }
        break;
      }
      case ActionType.GetMember: {
        if (this.varName !== undefined) {
          if (this.getMemberSeen) {
            this.reset();
          } else {
            this.getMemberSeen = true;
          }
        }
        break;
      }
      case ActionType.Push: {
        // Don't reset or update varName on push
        break;
      }
      default: {
        this.reset();
        break;
      }
    }
  }

  public afterSimpleAction(ctx: StackContext, action: CfgAction): void {
    if (action.action === ActionType.GetVariable) {
      // Reset if the variable is actually a primitive
      const varValue: AvmValue = ctx.peek();
      // tslint:disable:prefer-switch
      if (
        varValue.type === AvmValueType.Boolean
        || varValue.type === AvmValueType.Number
        || varValue.type === AvmValueType.String
      ) {
        this.reset();
      }
    }
  }

  public afterSimpleActions(): void {
    this.reset();
  }

  public getVarName(): string | undefined {
    if (this.varName !== undefined && this.getMemberSeen) {
      return this.varName;
    } else {
      return undefined;
    }
  }

  private reset(): void {
    this.varName = undefined;
    this.getMemberSeen = false;
  }
}
