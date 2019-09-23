import { Cfg } from "avm1-tree/cfg";
import { UintSize } from "semantic-types";
import { AvmObject, AvmUndefined, AvmValue } from "./avm-value";
import { AvmScope } from "./scope";

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

export interface AvmFunction {
  readonly type: CallableType.Avm;
  readonly parentScope: AvmScope;
  // scriptId
  name?: string;
  // TODO: Support parameters with registers
  parameters: string[];
  registerCount: UintSize;
  body: Cfg;
}

export interface HostFunction {
  readonly type: CallableType.Host;
  handler: HostCallHandler;
}

export type HostCallHandler = (call: HostCallContext) => AvmCallResult;

/**
 * Call context for a host function call.
 */
export interface HostCallContext {
  readonly type: CallType;
  readonly thisArg: AvmObject | AvmUndefined;
  readonly args: ReadonlyArray<AvmValue>;
  readonly callee?: AvmFunction;
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
