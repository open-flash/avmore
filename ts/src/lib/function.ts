import { Uint32, UintSize } from "semantic-types";
import {
  AVM_UNDEFINED,
  AvmBoolean,
  AvmNumber,
  AvmObject,
  AvmString,
  AvmUndefined,
  AvmValue,
  AvmValueType,
} from "./avm-value";
import { BaseContext } from "./context";
import { Scope } from "./scope";
import { Avm1Script, CfgTable } from "./script";

/**
 * Represents an object that can be called from the AVM.
 *
 * It is either an `AvmFunction` created with `DefineFunction` or
 * `DefineFunction2` and using byte code; or a `HostFunction` provided
 * by the host environment.
 *
 * Callable objects are used for function application and object construction.
 */
export type Callable = AvmFunction | HostFunction;

export enum CallableType {
  Avm,
  Host,
}

export interface AvmFunctionParameter {
  readonly name: string;
  // If defined, initialize the register when calling the function
  readonly register?: UintSize;
}

export enum ParameterState {
  Default,
  Suppress,
  Preload,
}

export interface AvmFunction {
  readonly type: CallableType.Avm;
  readonly parentScope: Scope;
  // Script defining this function
  readonly script: Avm1Script;
  // scriptId
  name?: string;
  registerCount: UintSize;
  thisState: ParameterState;
  argumentsState: ParameterState;
  superState: ParameterState;
  preloadRoot: boolean;
  preloadParent: boolean;
  preloadGlobal: boolean;
  parameters: ReadonlyArray<AvmFunctionParameter>;
  body: CfgTable;
}

export interface HostFunction {
  readonly type: CallableType.Host;
  handler: HostCallHandler;
}

export type HostCallHandler = (call: HostCallContext) => AvmCallResult;

/**
 * Call context for a host function call.
 */
export type HostCallContext = HostApplyCallContext | HostConstructCallContext;

// tslint:disable-next-line:typedef variable-name
export const HostCallContext = {
  apply(
    ctx: BaseContext,
    thisArg: AvmObject | AvmUndefined,
    args: ReadonlyArray<AvmValue>,
    callee?: AvmFunction,
  ): HostApplyCallContext {
    return new HostCallContextImpl(ctx, CallType.Apply, thisArg, args, callee) as HostApplyCallContext;
  },
  construct(
    ctx: BaseContext,
    thisArg: AvmObject,
    args: ReadonlyArray<AvmValue>,
    callee?: AvmFunction,
  ): HostConstructCallContext {
    return new HostCallContextImpl(ctx, CallType.Construct, thisArg, args, callee) as HostConstructCallContext;
  },
  auto(
    ctx: BaseContext,
    callType: CallType,
    thisArg: AvmObject | AvmUndefined,
    args: ReadonlyArray<AvmValue>,
    callee?: AvmFunction,
  ): HostCallContext {
    return new HostCallContextImpl(ctx, callType, thisArg, args, callee) as HostApplyCallContext;
  },
};

interface BaseHostCallContext extends BaseContext {
  readonly callType: CallType;
  readonly thisArg: AvmObject | AvmUndefined;
  readonly args: ReadonlyArray<AvmValue>;
  readonly callee?: AvmFunction;

  getArg(argIndex: UintSize): AvmValue;
}

export interface HostApplyCallContext extends BaseHostCallContext {
  readonly callType: CallType.Apply;
  readonly thisArg: AvmObject | AvmUndefined;
}

export interface HostConstructCallContext extends BaseHostCallContext {
  readonly callType: CallType.Construct;
  readonly thisArg: AvmObject;
}

class HostCallContextImpl implements BaseHostCallContext {
  public readonly callType: CallType;
  public readonly thisArg: AvmObject | AvmUndefined;
  public readonly args: ReadonlyArray<AvmValue>;
  public readonly callee?: AvmFunction;
  private readonly ctx: BaseContext;

  constructor(
    ctx: BaseContext,
    callType: CallType,
    thisArg: AvmObject | AvmUndefined,
    args: ReadonlyArray<AvmValue>,
    callee?: AvmFunction,
  ) {
    if (callType === CallType.Construct && thisArg.type !== AvmValueType.Object) {
      throw new Error("AssertionError: Construct call with non-object thisArg");
    }
    this.ctx = ctx;
    this.callType = callType;
    this.thisArg = thisArg;
    this.args = args;
    this.callee = callee;
  }

  getArg(argIndex: UintSize): AvmValue {
    return argIndex < this.args.length ? this.args[argIndex] : AVM_UNDEFINED;
  }

  // Delegate to `this.ctx` to implement `BaseContext`

  apply(fn: AvmValue, thisArg: AvmValue, args: ReadonlyArray<AvmValue>): AvmCallResult {
    return this.ctx.apply(fn, thisArg, args);
  }

  construct(fn: AvmValue, args: ReadonlyArray<AvmValue>): AvmCallResult {
    return this.ctx.construct(fn, args);
  }

  toAvmBoolean(value: AvmValue): AvmBoolean {
    return this.ctx.toAvmBoolean(value);
  }

  toAvmString(value: AvmValue): AvmString {
    return this.ctx.toAvmString(value);
  }

  toHostString(value: AvmValue): string {
    return this.ctx.toHostString(value);
  }

  toHostNumber(value: AvmValue): number {
    return this.ctx.toHostNumber(value);
  }

  toHostBoolean(value: AvmValue): boolean {
    return this.ctx.toHostBoolean(value);
  }

  toHostUint32(value: AvmValue): Uint32 {
    return this.ctx.toHostUint32(value);
  }

  getOwnKeys(obj: AvmValue): AvmString[] {
    return this.ctx.getOwnKeys(obj);
  }

  getMember(obj: AvmValue, name: AvmValue): AvmValue {
    return this.ctx.getMember(obj, name);
  }

  getStringMember(obj: AvmValue, name: string): AvmValue {
    return this.ctx.getStringMember(obj, name);
  }

  tryGetStringMember(obj: AvmValue, name: string): AvmValue | undefined {
    return this.ctx.tryGetStringMember(obj, name);
  }

  setMember(obj: AvmValue, name: AvmValue, value: AvmValue): void {
    return this.ctx.setMember(obj, name, value);
  }

  setStringMember(obj: AvmValue, name: string, value: AvmValue): void {
    return this.ctx.setStringMember(obj, name, value);
  }

  initArray(array: ReadonlyArray<AvmValue>): AvmValue {
    return this.ctx.initArray(array);
  }

  add(left: AvmValue, right: AvmValue): AvmString | AvmNumber {
    return this.ctx.add(left, right);
  }

  subtract(left: AvmValue, right: AvmValue): AvmNumber {
    return this.ctx.subtract(left, right);
  }

  leftShift(left: AvmValue, right: AvmValue): AvmNumber {
    return this.ctx.leftShift(left, right);
  }

  signedRightShift(left: AvmValue, right: AvmValue): AvmNumber {
    return this.ctx.signedRightShift(left, right);
  }

  unsignedRightShift(left: AvmValue, right: AvmValue): AvmNumber {
    return this.ctx.unsignedRightShift(left, right);
  }
}

export enum CallType {
  Apply,
  Construct,
}

export type AvmCallResult = AvmValue;
// export interface AvmCallResult {
//   // true: `return`, false: `throw`
//   ok: boolean;
//   value: AvmValue;
// }
