import { UintSize } from "semantic-types";
import { AvmBoolean, AvmNumber, AvmSimpleObject, AvmString, AvmUndefined, AvmValue } from "./avm-value";
import { AvmCallResult, AvmFunctionParameter } from "./function";
import { CfgTable } from "./script";

export interface RunBudget {
  totalActions: UintSize;
  readonly maxActions: UintSize;
}

export interface BaseContext {
  // Calls

  apply(fn: AvmValue, thisArg: AvmValue, args: ReadonlyArray<AvmValue>): AvmCallResult;

  construct(fn: AvmValue, args: ReadonlyArray<AvmValue>): AvmCallResult;

  // Conversions

  toAvmBoolean(value: AvmValue): AvmBoolean;

  toAvmString(value: AvmValue): AvmString;

  toHostString(value: AvmValue): string;

  toHostNumber(value: AvmValue): number;

  toHostBoolean(value: AvmValue): boolean;

  // Objects

  getOwnKeys(obj: AvmValue): AvmString[];

  getMember(obj: AvmValue, name: AvmValue): AvmValue;

  getStringMember(obj: AvmValue, name: string): AvmValue;

  tryGetStringMember(obj: AvmValue, name: string): AvmValue | undefined;

  setMember(obj: AvmValue, name: AvmValue, value: AvmValue): void;

  setStringMember(obj: AvmValue, name: string, value: AvmValue): void;

  // Operators

  add(left: AvmValue, right: AvmValue): AvmString | AvmNumber;
}

export interface ScopeContext {
  getVar(varName: string): AvmValue;

  setVar(varName: string, value: AvmValue): void;

  setLocal(varName: string, value: AvmValue): void;
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

export interface ConstantPoolContext {
  setConstantPool(pool: ReadonlyArray<AvmString>): void;

  getConstant(index: UintSize): AvmString | AvmUndefined;
}

export interface ActionContext extends BaseContext, RegisterContext, ScopeContext, StackContext, ConstantPoolContext {
  createAvmFunction(
    name: string | undefined,
    registerCount: UintSize,
    parameters: AvmFunctionParameter[],
    body: CfgTable,
  ): AvmSimpleObject;
}

// export interface CallContext extends BaseContext {
// }
