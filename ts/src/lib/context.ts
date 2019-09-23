import { AvmString, AvmValue } from "./avm-value";
import { AvmCallResult } from "./function";

export interface BaseContext {
  apply(fn: AvmValue, thisArg: AvmValue, args: ReadonlyArray<AvmValue>): AvmCallResult;

  construct(fn: AvmValue, args: ReadonlyArray<AvmValue>): AvmCallResult;

  toAvmBoolean(value: AvmValue): AvmValue;

  toAvmString(value: AvmValue): AvmString;

  toHostString(value: AvmValue): string;

  setMember(obj: AvmValue, name: AvmValue, value: AvmValue): void;

  setStringMember(obj: AvmValue, name: string, value: AvmValue): void;
}

export interface ScopeContext {
  getVar(varName: string): AvmValue;

  setVar(varName: string, value: AvmValue): void;

  localVar(varName: string, value: AvmValue): void;
}

export interface StackContext {
  push(value: AvmValue): void;

  pop(): AvmValue;
}

export interface ActionContext extends BaseContext, ScopeContext, StackContext {
}

// export interface CallContext extends BaseContext {
// }
