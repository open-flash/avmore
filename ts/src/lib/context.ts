import { UintSize } from "semantic-types";
import { AvmNumber, AvmString, AvmValue } from "./avm-value";
import { AvmCallResult } from "./function";

export interface BaseContext {
  // Calls

  apply(fn: AvmValue, thisArg: AvmValue, args: ReadonlyArray<AvmValue>): AvmCallResult;

  construct(fn: AvmValue, args: ReadonlyArray<AvmValue>): AvmCallResult;

  // Conversions

  toAvmBoolean(value: AvmValue): AvmValue;

  toAvmString(value: AvmValue): AvmString;

  toHostString(value: AvmValue): string;

  toHostNumber(value: AvmValue): number;

  // Objects

  getMember(obj: AvmValue, name: AvmValue): AvmValue;

  setMember(obj: AvmValue, name: AvmValue, value: AvmValue): void;

  getOwnKeys(obj: AvmValue): AvmString[];

  setStringMember(obj: AvmValue, name: string, value: AvmValue): void;

  // Operators

  add(left: AvmValue, right: AvmValue): AvmString | AvmNumber;
}

export interface ScopeContext {
  getVar(varName: string): AvmValue;

  setVar(varName: string, value: AvmValue): void;

  localVar(varName: string, value: AvmValue): void;
}

export interface RegisterContext {
  getReg(regId: UintSize): AvmValue;

  setReg(regId: UintSize, value: AvmValue): void;
}

export interface StackContext {
  push(value: AvmValue): void;

  pop(): AvmValue;

  peek(): AvmValue;
}

export interface ActionContext extends BaseContext, RegisterContext, ScopeContext, StackContext {
}

// export interface CallContext extends BaseContext {
// }
