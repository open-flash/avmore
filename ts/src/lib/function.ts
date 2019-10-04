import { UintSize } from "semantic-types";
import { AvmValue } from "./avm-value";
import { NatCallContext } from "./context";
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
  handler: NatCallHandler;
}

export type NatCallHandler = (call: NatCallContext) => AvmCallResult;

export enum CallType {
  Apply,
  Construct,
}

export type AvmCallResult = AvmValue;
