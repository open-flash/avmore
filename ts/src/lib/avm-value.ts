import { AvmCallResult, AvmFunction, Callable } from "./function";

export enum AvmValueType {
  Boolean,
  Null,
  Number,
  Object,
  String,
  Undefined,
}

export interface AvmExternalHandler {
  // Tag used in the default string description of an object.
  // Accessed by `Object.prototype.toString`.
  // Corresponds to `@@toStringTag` in recent ECMA-262 versions.
  toStringTag?: string;

  ownKeys(): AvmString[];

  apply?(thisArg: AvmValue | undefined, args: ReadonlyArray<AvmValue>): AvmCallResult;

  construct?(args: ReadonlyArray<AvmValue>): AvmValue;

  set(key: string, value: AvmValue): void;

  get(key: string): AvmValue | undefined;
}

export interface AvmExternalObject {
  readonly type: AvmValueType.Object;
  readonly external: true;
  readonly handler: AvmExternalHandler;
}

export interface AvmBoolean {
  readonly type: AvmValueType.Boolean;
  readonly value: boolean;
}

export interface AvmNull {
  readonly type: AvmValueType.Null;
}

export interface AvmNumber {
  readonly type: AvmValueType.Number;
  readonly value: number;
}

export interface AvmString {
  readonly type: AvmValueType.String;
  readonly value: string;
}

export interface AvmUndefined {
  readonly type: AvmValueType.Undefined;
}

export type AvmPropDescriptor = AvmAccessorPropDescriptor | AvmDataPropDescriptor;

export interface AvmAccessorPropDescriptor {
  writable: boolean;
  enumerable: boolean;
  configurable: boolean;
  readonly value: undefined;
  readonly get: AvmValue;
  readonly set: AvmValue;
}

export interface AvmDataPropDescriptor {
  writable: boolean;
  enumerable: boolean;
  configurable: boolean;
  readonly value: AvmValue;
  readonly get: undefined;
  readonly set: undefined;
}

// tslint:disable-next-line:typedef variable-name
export const AvmPropDescriptor = {
  data(value: AvmValue): AvmDataPropDescriptor {
    return {writable: true, enumerable: true, configurable: true, value, get: undefined, set: undefined};
  },
  accessor(getter: any, setter: any): AvmAccessorPropDescriptor {
    return {writable: true, enumerable: true, configurable: true, value: undefined, get: getter, set: setter};
  },
};

export type BoxablePrimitive = boolean | number | string;

export interface AvmSimpleObject {
  readonly type: AvmValueType.Object;
  readonly external: false;
  // `Object`, `Functions, etc. (used for `.toString`)
  class: string;
  prototype: AvmObject | AvmNull;
  readonly ownProperties: Map<string, AvmPropDescriptor>;
  callable?: Callable;
  value?: BoxablePrimitive;
}

export type AvmObject = AvmExternalObject | AvmSimpleObject;

export type AvmPrimitive = AvmBoolean
  | AvmNull
  | AvmNumber
  | AvmFunction
  | AvmUndefined
  | AvmString;

export type AvmValue = AvmPrimitive | AvmObject;

// tslint:disable-next-line:typedef variable-name
export const AvmValue = {
  isPrimitive(value: AvmValue): value is AvmPrimitive {
    return value.type !== AvmValueType.Object;
  },
  fromHostBoolean(bool: boolean): AvmBoolean {
    return bool ? AVM_TRUE : AVM_FALSE;
  },
  fromHostNumber(value: number): AvmNumber {
    value = Object.is(value, -0) ? 0 : value;
    // AVM1 always normalizes `-0` to `0`
    return {type: AvmValueType.Number, value};
  },
  fromHostString(value: string): AvmString {
    return {type: AvmValueType.String, value};
  },
};

export const AVM_NULL: AvmNull = Object.freeze({type: AvmValueType.Null as AvmValueType.Null});
export const AVM_UNDEFINED: AvmUndefined = Object.freeze({type: AvmValueType.Undefined as AvmValueType.Undefined});
export const AVM_TRUE: AvmBoolean = Object.freeze({type: AvmValueType.Boolean as AvmValueType.Boolean, value: true});
export const AVM_FALSE: AvmBoolean = Object.freeze({type: AvmValueType.Boolean as AvmValueType.Boolean, value: false});
export const AVM_MAX_VALUE: AvmNumber = Object.freeze(AvmValue.fromHostNumber(Number.MAX_VALUE));
export const AVM_MIN_VALUE: AvmNumber = Object.freeze(AvmValue.fromHostNumber(Number.MIN_VALUE));
export const AVM_NAN: AvmNumber = Object.freeze(AvmValue.fromHostNumber(Number.NaN));
export const AVM_NEGATIVE_INFINITY: AvmNumber = Object.freeze(AvmValue.fromHostNumber(Number.NEGATIVE_INFINITY));
export const AVM_POSITIVE_INFINITY: AvmNumber = Object.freeze(AvmValue.fromHostNumber(Number.POSITIVE_INFINITY));
export const AVM_ZERO: AvmNumber = Object.freeze(AvmValue.fromHostNumber(0));
export const AVM_ONE: AvmNumber = Object.freeze(AvmValue.fromHostNumber(1));
export const AVM_EMPTY_STRING: AvmString = Object.freeze(AvmValue.fromHostString(""));
