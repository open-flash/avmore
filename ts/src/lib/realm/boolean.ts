import {
  AvmBoolean,
  AvmObject,
  AvmPropDescriptor,
  AvmSimpleObject,
  AvmString,
  AvmValue,
  AvmValueType,
} from "../avm-value";
import { CallableType, HostCallContext } from "../function";
import { bindingFromHostFunction } from "../realm";

export interface BooleanRealm {
  boolean: AvmObject;
  booleanPrototype: AvmObject;
  booleanPrototypeToString: AvmObject;
  booleanPrototypeValueOf: AvmObject;
}

export function createBooleanRealm(funcProto: AvmSimpleObject): BooleanRealm {
  const _booleanPrototypeToString: AvmObject = bindingFromHostFunction(funcProto, booleanPrototypeToString);
  const _booleanPrototypeValueOf: AvmObject = bindingFromHostFunction(funcProto, booleanPrototypeValueOf);

  // Boolean.prototype
  const booleanPrototype: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Object",
    prototype: funcProto,
    ownProperties: new Map([
      ["toString", AvmPropDescriptor.data(_booleanPrototypeToString)],
      ["valueOf", AvmPropDescriptor.data(_booleanPrototypeValueOf)],
    ]),
    callable: undefined,
  };

  // Boolean
  const _boolean: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Function",
    prototype: funcProto,
    ownProperties: new Map([
      ["prototype", AvmPropDescriptor.data(booleanPrototype)],
    ]),
    callable: {type: CallableType.Host, handler: boolean},
  };

  booleanPrototype.ownProperties.set("constructor", AvmPropDescriptor.data(_boolean));

  return {
    boolean: _boolean,
    booleanPrototype,
    booleanPrototypeToString: _booleanPrototypeToString,
    booleanPrototypeValueOf: _booleanPrototypeValueOf,
  };
}

export function boolean(_ctx: HostCallContext): AvmValue {
  throw new Error("NotImplemented: Boolean constructor");
}

export function booleanPrototypeToString(ctx: HostCallContext): AvmString {
  if (ctx.thisArg.type !== AvmValueType.Object || ctx.thisArg.external || typeof ctx.thisArg.value !== "boolean") {
    throw new Error("TypeError: Boolean.prototype.toString() is non-transferable");
  }
  return AvmValue.fromHostString(ctx.thisArg.value ? "true" : "false");
}

export function booleanPrototypeValueOf(ctx: HostCallContext): AvmBoolean {
  if (ctx.thisArg.type !== AvmValueType.Object || ctx.thisArg.external || typeof ctx.thisArg.value !== "boolean") {
    throw new Error("TypeError: Boolean.prototype.valueOf() is non-transferable");
  }
  return AvmValue.fromHostBoolean(ctx.thisArg.value);
}
