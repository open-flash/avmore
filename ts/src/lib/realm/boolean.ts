import {
  AvmBoolean,
  AvmObject,
  AvmPropDescriptor,
  AvmSimpleObject,
  AvmString, AvmUndefined,
  AvmValue,
  AvmValueType,
} from "../avm-value";
import { NatCallContext } from "../context";
import { CallableType } from "../function";
import { bindingFromHostFunction } from "../realm";
import { CoreRealm } from "./core";

export interface BooleanRealm {
  boolean: AvmObject;
  booleanPrototype: AvmObject;
  booleanPrototypeToString: AvmObject;
  booleanPrototypeValueOf: AvmObject;
}

export function createBooleanRealm(core: CoreRealm): BooleanRealm {
  // tslint:disable:max-line-length
  const _booleanPrototypeToString: AvmObject = bindingFromHostFunction(core.functionPrototype, booleanPrototypeToString);
  const _booleanPrototypeValueOf: AvmObject = bindingFromHostFunction(core.functionPrototype, booleanPrototypeValueOf);
  // tslint:enable

  // Boolean.prototype
  const booleanPrototype: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Object",
    prototype: core.objectPrototype,
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
    prototype: core.functionPrototype,
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

export function boolean(_ctx: NatCallContext): AvmValue {
  throw new Error("NotImplemented: Boolean constructor");
}

export function booleanPrototypeToString(ctx: NatCallContext): AvmString {
  const thisArg: AvmObject | AvmUndefined = ctx.thisArg;
  if (thisArg.type !== AvmValueType.Object || thisArg.external || typeof thisArg.value !== "boolean") {
    throw new Error("TypeError: Boolean.prototype.toString() is non-transferable");
  }
  return AvmValue.fromHostString(thisArg.value ? "true" : "false");
}

export function booleanPrototypeValueOf(ctx: NatCallContext): AvmBoolean {
  const thisArg: AvmObject | AvmUndefined = ctx.thisArg;
  if (thisArg.type !== AvmValueType.Object || thisArg.external || typeof thisArg.value !== "boolean") {
    throw new Error("TypeError: Boolean.prototype.valueOf() is non-transferable");
  }
  return AvmValue.fromHostBoolean(thisArg.value);
}
