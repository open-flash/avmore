import { AVM_EMPTY_STRING, AvmObject, AvmPropDescriptor, AvmSimpleObject, AvmValueType } from "../avm-value";
import { NatCallContext } from "../context";
import { AvmCallResult, CallableType, CallType } from "../function";
import { bindingFromHostFunction } from "../realm";
import { CoreRealm } from "./core";

// > 15.5 String Objects

export interface StringRealm {
  string: AvmObject;
  stringFromCharCode: AvmObject;
  stringPrototype: AvmObject;
  stringPrototypeToString: AvmObject;
  stringPrototypeValueOf: AvmObject;
  stringPrototypeCharAt: AvmObject;
  stringPrototypeCharCodeAt: AvmObject;
  stringPrototypeConcat: AvmObject;
  stringPrototypeIndexOf: AvmObject;
  stringPrototypeLastIndexOf: AvmObject;
  stringPrototypeSlice: AvmObject;
  stringPrototypeSplit: AvmObject;
  stringPrototypeSubstr: AvmObject;
  stringPrototypeSubstring: AvmObject;
  stringPrototypeToLowerCase: AvmObject;
  stringPrototypeToUpperCase: AvmObject;
}

export function createStringRealm(core: CoreRealm): StringRealm {
  // tslint:disable:max-line-length
  const _stringPrototypeToString: AvmObject = bindingFromHostFunction(core.functionPrototype, stringPrototypeToString);
  const _stringPrototypeValueOf: AvmObject = bindingFromHostFunction(core.functionPrototype, stringPrototypeValueOf);
  const _stringPrototypeCharAt: AvmObject = bindingFromHostFunction(core.functionPrototype, stringPrototypeCharAt);
  const _stringPrototypeCharCodeAt: AvmObject = bindingFromHostFunction(core.functionPrototype, stringPrototypeCharCodeAt);
  const _stringPrototypeConcat: AvmObject = bindingFromHostFunction(core.functionPrototype, stringPrototypeConcat);
  const _stringPrototypeIndexOf: AvmObject = bindingFromHostFunction(core.functionPrototype, stringPrototypeIndexOf);
  const _stringPrototypeLastIndexOf: AvmObject = bindingFromHostFunction(core.functionPrototype, stringPrototypeLastIndexOf);
  const _stringPrototypeSlice: AvmObject = bindingFromHostFunction(core.functionPrototype, stringPrototypeSlice);
  const _stringPrototypeSplit: AvmObject = bindingFromHostFunction(core.functionPrototype, stringPrototypeSplit);
  const _stringPrototypeSubstr: AvmObject = bindingFromHostFunction(core.functionPrototype, stringPrototypeSubstr);
  const _stringPrototypeSubstring: AvmObject = bindingFromHostFunction(core.functionPrototype, stringPrototypeSubstring);
  const _stringPrototypeToLowerCase: AvmObject = bindingFromHostFunction(core.functionPrototype, stringPrototypeToLowerCase);
  const _stringPrototypeToUpperCase: AvmObject = bindingFromHostFunction(core.functionPrototype, stringPrototypeToUpperCase);
  // tslint:enable

  // String.prototype
  const stringPrototype: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Object",
    prototype: core.objectPrototype,
    ownProperties: new Map([
      ["toString", AvmPropDescriptor.data(_stringPrototypeToString)],
      ["valueOf", AvmPropDescriptor.data(_stringPrototypeValueOf)],
      ["charAt", AvmPropDescriptor.data(_stringPrototypeCharAt)],
      ["charCodeAt", AvmPropDescriptor.data(_stringPrototypeCharCodeAt)],
      ["concat", AvmPropDescriptor.data(_stringPrototypeConcat)],
      ["indexOf", AvmPropDescriptor.data(_stringPrototypeIndexOf)],
      ["lastIndexOf", AvmPropDescriptor.data(_stringPrototypeLastIndexOf)],
      ["slice", AvmPropDescriptor.data(_stringPrototypeSlice)],
      ["split", AvmPropDescriptor.data(_stringPrototypeSplit)],
      ["substr", AvmPropDescriptor.data(_stringPrototypeSubstr)],
      ["substring", AvmPropDescriptor.data(_stringPrototypeSubstring)],
      ["toLowerCase", AvmPropDescriptor.data(_stringPrototypeToLowerCase)],
      ["toUpperCase", AvmPropDescriptor.data(_stringPrototypeToUpperCase)],
    ]),
    callable: undefined,
  };

  const _stringFromCharCode: AvmObject = bindingFromHostFunction(core.functionPrototype, stringFromCharCode);

  // String
  const _string: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Function",
    prototype: core.functionPrototype,
    ownProperties: new Map([
      ["prototype", AvmPropDescriptor.data(stringPrototype)],
      ["fromCharCode", AvmPropDescriptor.data(_stringFromCharCode)],
    ]),
    callable: {type: CallableType.Host, handler: string},
  };

  stringPrototype.ownProperties.set("constructor", AvmPropDescriptor.data(_string));

  return {
    string: _string,
    stringFromCharCode: _stringFromCharCode,
    stringPrototype,
    stringPrototypeToString: _stringPrototypeToString,
    stringPrototypeValueOf: _stringPrototypeValueOf,
    stringPrototypeCharAt: _stringPrototypeCharAt,
    stringPrototypeCharCodeAt: _stringPrototypeCharCodeAt,
    stringPrototypeConcat: _stringPrototypeConcat,
    stringPrototypeIndexOf: _stringPrototypeIndexOf,
    stringPrototypeLastIndexOf: _stringPrototypeLastIndexOf,
    stringPrototypeSlice: _stringPrototypeSlice,
    stringPrototypeSplit: _stringPrototypeSplit,
    stringPrototypeSubstr: _stringPrototypeSubstr,
    stringPrototypeSubstring: _stringPrototypeSubstring,
    stringPrototypeToLowerCase: _stringPrototypeToLowerCase,
    stringPrototypeToUpperCase: _stringPrototypeToUpperCase,
  };
}

export function string(ctx: NatCallContext): AvmCallResult {
  // > 15.5.1 The String Constructor Called as a Function
  // >
  // > When `String` is called as a function rather than as a constructor, it performs a type
  // > conversion.

  // > 15.5.1.1 String ( [ value ] )
  // >
  // > Returns a string value (not a String object) computed by ToString(_value_). If _value_ is
  // > not supplied, the empty string `""` is returned.
  if (ctx.callType === CallType.Apply) {
    return ctx.args.length > 0
      ? ctx.toAvmString(ctx.args[0])
      : AVM_EMPTY_STRING;
  }

  if (ctx.thisArg.type !== AvmValueType.Object) {
    throw new Error("TypeError: NonObjectThis");
  }

  // assert: callType === CallType.Construct

  if (ctx.thisArg.external) {
    // This may happen due to inheritance
    throw new Error("NotImplemented: new String() on external object");
  }

  // > 15.5.2 The String Constructor
  // >
  // > When `String` is called as part of a `new` expression, it is a constructor: it initialises
  // > the newly created object.

  // > 15.5.2.1 new String ( [ value ] )
  // >
  // > The [[Prototype]] property of the newly constructed object is set to the original String
  // > prototype object, the one that is the initial value of `String.prototype` (15.5.3.1).
  // TODO: check how it interacts with inheritance
  ctx.thisArg.prototype = ctx.getRealm().stringPrototype;

  // > The [[Class]] property of the newly constructed object is set to `"String"`.
  ctx.thisArg.class = "String";

  // > The [[Value]] property of the newly constructed object is set to ToString(_value_), or to
  // > the empty string if value is not supplied.
  ctx.thisArg.value = ctx.args.length > 0
    ? ctx.toHostString(ctx.args[0])
    : "";

  return ctx.thisArg;
}

export function stringFromCharCode(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.fromCharCode");
}

export function stringPrototypeToString(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.prototype.toString");
}

export function stringPrototypeValueOf(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.prototype.valueOf");
}

export function stringPrototypeCharAt(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.prototype.charAt");
}

export function stringPrototypeCharCodeAt(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.prototype.charCodeAt");
}

export function stringPrototypeConcat(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.prototype.concat");
}

export function stringPrototypeIndexOf(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.prototype.indexOf");
}

export function stringPrototypeLastIndexOf(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.prototype.lastIndexOf");
}

export function stringPrototypeSlice(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.prototype.slice");
}

export function stringPrototypeSplit(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.prototype.split");
}

export function stringPrototypeSubstr(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.prototype.substr");
}

export function stringPrototypeSubstring(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.prototype.substring");
}

export function stringPrototypeToLowerCase(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.prototype.toLowerCase");
}

export function stringPrototypeToUpperCase(_ctx: NatCallContext): AvmCallResult {
  throw new Error("NotImplemented: String.prototype.toUpperCase");
}
