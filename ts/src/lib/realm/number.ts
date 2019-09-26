import {
  AVM_MAX_VALUE,
  AVM_MIN_VALUE,
  AVM_NAN,
  AVM_NEGATIVE_INFINITY,
  AVM_POSITIVE_INFINITY,
  AvmObject,
  AvmPropDescriptor,
  AvmSimpleObject,
  AvmValue,
  AvmValueType,
} from "../avm-value";
import { CallableType, HostCallContext } from "../function";
import { bindingFromHostFunction } from "../realm";

export interface NumberRealm {
  number: AvmObject;
  numberPrototype: AvmObject;
  numberPrototypeToString: AvmObject;
  numberPrototypeValueOf: AvmObject;
}

export function createNumberRealm(funcProto: AvmSimpleObject): NumberRealm {
  const _numberPrototypeToString: AvmObject = bindingFromHostFunction(funcProto, numberPrototypeToString);
  const _numberPrototypeValueOf: AvmObject = bindingFromHostFunction(funcProto, numberPrototypeValueOf);

  // Number.prototype
  const numberPrototype: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Object",
    prototype: funcProto,
    ownProperties: new Map([
      ["toString", AvmPropDescriptor.data(_numberPrototypeToString)],
      ["valueOf", AvmPropDescriptor.data(_numberPrototypeValueOf)],
    ]),
    callable: undefined,
  };

  // Number
  const _number: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Function",
    prototype: funcProto,
    ownProperties: new Map([
      ["prototype", AvmPropDescriptor.data(numberPrototype)],
      ["MAX_VALUE", AvmPropDescriptor.data(AVM_MAX_VALUE)],
      ["MIN_VALUE", AvmPropDescriptor.data(AVM_MIN_VALUE)],
      ["NaN", AvmPropDescriptor.data(AVM_NAN)],
      ["NEGATIVE_INFINITY", AvmPropDescriptor.data(AVM_NEGATIVE_INFINITY)],
      ["POSITIVE_INFINITY", AvmPropDescriptor.data(AVM_POSITIVE_INFINITY)],
    ]),
    callable: {type: CallableType.Host, handler: number},
  };

  numberPrototype.ownProperties.set("constructor", AvmPropDescriptor.data(_number));

  return {
    number: _number,
    numberPrototype,
    numberPrototypeToString: _numberPrototypeToString,
    numberPrototypeValueOf: _numberPrototypeValueOf,
  };
}

export function number(_ctx: HostCallContext): AvmValue {
  throw new Error("NotImplemented: Number constructor");
}

export function numberPrototypeToString(_ctx: HostCallContext): AvmValue {
  throw new Error("NotImplemented: Number.prototype.toString()");
}

export function numberPrototypeValueOf(_ctx: HostCallContext): AvmValue {
  throw new Error("NotImplemented: Number.protototype.valueOf()");
}
