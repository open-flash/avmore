import { Uint32 } from "semantic-types";
import {
  AVM_NULL,
  AVM_UNDEFINED,
  AvmObject,
  AvmPropDescriptor,
  AvmSimpleObject,
  AvmValue,
  AvmValueType,
} from "./avm-value";
import { AvmCallResult, CallableType, CallType, HostCallContext, HostCallHandler } from "./function";
import { ArrayRealm, createArrayRealm } from "./realm/array";
import { abs, acos, asin, atan, atan2 } from "./realm/math";
import { numberConstructor } from "./realm/number";
import { stringConstructor } from "./realm/string";

export class Realm implements ArrayRealm {
  public readonly objectClass: AvmObject;
  public readonly objectProto: AvmObject;
  public readonly funcClass: AvmObject;
  public readonly funcProto: AvmObject;

  public readonly array: AvmObject;
  public readonly arrayPrototype: AvmObject;
  public readonly arrayPrototypeToString: AvmObject;
  public readonly arrayPrototypeToLocaleString: AvmObject;
  public readonly arrayPrototypeJoin: AvmObject;
  public readonly arrayPrototypePop: AvmObject;
  public readonly arrayPrototypePush: AvmObject;
  public readonly arrayPrototypeReverse: AvmObject;
  public readonly arrayPrototypeShift: AvmObject;
  public readonly arrayPrototypeSlice: AvmObject;
  public readonly arrayPrototypeSort: AvmObject;
  public readonly arrayPrototypeSplice: AvmObject;
  public readonly arrayPrototypeUnshift: AvmObject;

  public readonly stringClass: AvmObject;
  public readonly stringProto: AvmObject;
  public readonly numberClass: AvmObject;
  public readonly numberProto: AvmObject;
  public readonly mathClass: AvmObject;
  public readonly globals: Map<string, AvmValue>;

  constructor() {
    // Object.[[prototype]]
    const objectProto: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Object",
      prototype: AVM_NULL,
      ownProperties: new Map(),
      callable: undefined,
    };

    // Function.[[prototype]]
    const funcProto: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Object",
      prototype: objectProto,
      ownProperties: new Map(),
      callable: undefined,
    };

    // Object
    const objectClass: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Function",
      prototype: funcProto,
      ownProperties: new Map(),
      callable: {type: CallableType.Host, handler: objectConstructor},
    };

    // Function
    const funcClass: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Function",
      prototype: funcProto,
      ownProperties: new Map(),
      callable: undefined, // TODO: Function callable/constructor
    };

    // String.prototype
    const stringProto: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Object",
      prototype: funcProto,
      ownProperties: new Map(),
      callable: undefined,
    };

    // String
    const stringClass: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Function",
      prototype: funcProto,
      ownProperties: new Map(),
      callable: {type: CallableType.Host, handler: stringConstructor},
    };

    // Number.prototype
    const numberProto: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Object",
      prototype: funcProto,
      ownProperties: new Map(),
      callable: undefined,
    };

    // Number
    const numberClass: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Function",
      prototype: numberProto,
      ownProperties: new Map(),
      callable: {type: CallableType.Host, handler: numberConstructor},
    };

    // Math
    const mathClass: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Math",
      prototype: objectProto,
      ownProperties: new Map([
        ["abs", AvmPropDescriptor.data(bindingFromHostFunction(funcProto, abs))],
        ["acos", AvmPropDescriptor.data(bindingFromHostFunction(funcProto, acos))],
        ["asin", AvmPropDescriptor.data(bindingFromHostFunction(funcProto, asin))],
        ["atan", AvmPropDescriptor.data(bindingFromHostFunction(funcProto, atan))],
        ["atan2", AvmPropDescriptor.data(bindingFromHostFunction(funcProto, atan2))],
      ]),
      callable: undefined,
    };

    objectClass.ownProperties.set("prototype", AvmPropDescriptor.data(objectProto));
    populateObjectProto(objectProto.ownProperties, funcProto);

    stringClass.ownProperties.set("prototype", AvmPropDescriptor.data(stringProto));
    populateStringProto(stringProto.ownProperties, stringClass);

    const arrayRealm: ArrayRealm = createArrayRealm(funcProto);

    this.objectClass = objectClass;
    this.objectProto = objectProto;
    this.funcClass = funcClass;
    this.funcProto = funcProto;

    this.array = arrayRealm.array;
    this.arrayPrototype = arrayRealm.arrayPrototype;
    this.arrayPrototypeToString = arrayRealm.arrayPrototypeToString;
    this.arrayPrototypeToLocaleString = arrayRealm.arrayPrototypeToLocaleString;
    this.arrayPrototypeJoin = arrayRealm.arrayPrototypeJoin;
    this.arrayPrototypePop = arrayRealm.arrayPrototypePop;
    this.arrayPrototypePush = arrayRealm.arrayPrototypePush;
    this.arrayPrototypeReverse = arrayRealm.arrayPrototypeReverse;
    this.arrayPrototypeShift = arrayRealm.arrayPrototypeShift;
    this.arrayPrototypeSlice = arrayRealm.arrayPrototypeSlice;
    this.arrayPrototypeSort = arrayRealm.arrayPrototypeSort;
    this.arrayPrototypeSplice = arrayRealm.arrayPrototypeSplice;
    this.arrayPrototypeUnshift = arrayRealm.arrayPrototypeUnshift;

    this.stringClass = stringClass;
    this.stringProto = stringProto;
    this.numberClass = numberClass;
    this.numberProto = numberProto;
    this.mathClass = mathClass;

    this.globals = new Map([
      ["Object", objectClass],
      ["Array", this.array],
      ["String", stringClass],
      ["Number", numberClass],
      ["Math", mathClass],
      ["ASnative", bindingFromHostFunction(funcProto, asNativeHandler)],
      ["ASconstructor", bindingFromHostFunction(funcProto, asConstructorHandler)],
      ["ASSetNative", bindingFromHostFunction(funcProto, asSetNativeHandler)],
      ["ASSetPropFlags", bindingFromHostFunction(funcProto, asSetPropFlagsHandler)],
    ]);
  }
}

export function bindingFromHostFunction(funcProto: AvmObject, handler: HostCallHandler): AvmObject {
  return {
    type: AvmValueType.Object,
    external: false,
    class: "Function",
    prototype: funcProto,
    ownProperties: new Map(),
    callable: {type: CallableType.Host, handler},
  };
}

// > 15.2 Object Objects

function objectConstructor(ctx: HostCallContext): AvmCallResult {
  if (ctx.callType === CallType.Apply) {
    // > 15.2.1 The Object Constructor Called as a Function
    // >
    // > When Object is called as a function rather than as a constructor, it performs a type
    // > conversion.

    // > 15.2.1.1 Object ( [ value ] )
    // >
    // > When the Object function is called with no arguments or with one argument value, the
    // > following steps are taken:
    const value: AvmValue = ctx.getArg(0);
    // > 1. If _value_ is `null`, `undefined` or not supplied, create and return a new Object
    // > object exactly if the object constructor had been called with the same arguments
    // > (15.2.2.1).
    if (value.type === AvmValueType.Null || value.type === AvmValueType.Undefined) {
      return ctx.construct(ctx.getRealm().objectClass, ctx.args);
    }
    // 2. Return ToObject(value).
    return ctx.toAvmObject(value);
  } else {
    // assert: callType === CallType.Construct

    // > 15.2.2 The Object Constructor
    // >
    // > When `Object` is called as part of a `new` expression, it is a constructor that may
    // > create an object.

    // > 15.2.2.1 new Object ( [ value ] )
    // >
    // > When the `Object` constructor is called with no arguments or with one argument _value_,
    // > the following steps are taken:
    // > 1. If value is not supplied, go to step 8.
    if (ctx.args.length >= 1) {
      const value: AvmValue = ctx.args[0];
      // > 2. If the type of value is not Object, go to step 5.
      if (value.type === AvmValueType.Object) {
        // > 3. If the value is a native ECMAScript object, do not create a new object but simply
        // >    return value.
        if (!value.external) {
          return value;
        }
        // > 4. If the value is a host object, then actions are taken and a result is returned in
        // >    an implementation-dependent manner that may depend on the host object.
        // (No such case)
      }

      // 5. If the type of value is String, return ToObject(value).
      // 6. If the type of value is Boolean, return ToObject(value).
      // 7. If the type of value is Number, return ToObject(value).
      throw new Error("NotImplemented: BoxablePrimitive");
    }

    // > 8. (The argument value was not supplied or its type was Null or Undefined.)
    // >    Create a new native ECMAScript object.
    // >    The [[Prototype]] property of the newly constructed object is set to the Object
    // >    prototype object.
    // >    The [[Class]] property of the newly constructed object is set to "Object".
    // >    The newly constructed object has no [[Value]] property.
    // >    Return the newly created native object.
    return {
      type: AvmValueType.Object,
      external: false,
      class: "Object",
      prototype: ctx.getRealm().objectProto,
      ownProperties: new Map(),
    };
  }
}

function populateObjectProto(
  props: Map<string, AvmPropDescriptor>,
  funcProto: AvmObject,
): void {
  props.set("toString", AvmPropDescriptor.data(bindingFromHostFunction(funcProto, toString)));

  function toString(call: HostCallContext): AvmCallResult {
    if (call.thisArg.type !== AvmValueType.Object) {
      throw new Error("NotImplemented: Object::toString on non-object");
    }
    let tag: string;
    if (call.thisArg.external) {
      tag = call.thisArg.handler.toStringTag !== undefined ? call.thisArg.handler.toStringTag : "Object";
    } else {
      tag = call.thisArg.class;
    }
    const value: string = `[object ${tag}]`;
    return AvmValue.fromHostString(value);
  }
}

function populateStringProto(
  props: Map<string, AvmPropDescriptor>,
  stringClass: AvmSimpleObject,
): void {
  props.set("constructor", AvmPropDescriptor.data(stringClass));
}

// ASnative
function asNativeHandler(): AvmCallResult {
  throw new Error("NotImplemented: ASnative");
}

// ASconstructor
function asConstructorHandler(): AvmCallResult {
  throw new Error("NotImplemented: ASconstructor");
}

// ASSetNative
function asSetNativeHandler(): AvmCallResult {
  throw new Error("NotImplemented: ASSetNative");
}

// ASSetPropFlags
function asSetPropFlagsHandler(ctx: HostCallContext): AvmCallResult {
  const target: AvmValue = ctx.getArg(0);
  const avmProperties: AvmValue = ctx.getArg(1);
  const setMask: Uint32 = ctx.toHostUint32(ctx.getArg(2));
  const unsetMask: Uint32 = ctx.toHostUint32(ctx.getArg(3));

  if (target.type !== AvmValueType.Object) {
    throw new Error("TypeError: ASSetPropFlags on non-object");
  }
  const properties: string[] = [];
  if (avmProperties.type === AvmValueType.Null) {
    for (const key of ctx.getOwnKeys(target)) {
      properties.push(key.value);
    }
  } else {
    const propList: string = ctx.toHostString(avmProperties);
    for (const rawKey of propList.split(",")) {
      const key: string = rawKey.trim();
      if (key !== "") {
        properties.push(key);
      }
    }
  }
  if (target.external) {
    throw new Error("NotImplemented: ASSetPropFlags for external objects");
  }
  for (const key of properties) {
    const propDesc: AvmPropDescriptor | undefined = target.ownProperties.get(key);
    if (propDesc === undefined) {
      // TODO: Warn
      continue;
    }

    // TODO: Refactor correspondence between AS flags and Avmore flags
    // The code wasn't test thoroughly, and `configurable` is used in place of `deletable`

    const propFlags: Uint32 = 0
      | (propDesc.enumerable ? 0 : 1)
      | (propDesc.configurable ? 0 : 2)
      | (propDesc.writable ? 0 : 4);
    const newFlags: Uint32 = (propFlags | setMask) & ~unsetMask;
    propDesc.enumerable = (newFlags & 1) === 0;
    propDesc.configurable = (newFlags & 2) === 0;
    propDesc.writable = (newFlags & 4) === 0;
  }

  return AVM_UNDEFINED;
}
