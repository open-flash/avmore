import { Uint32, UintSize } from "semantic-types";
import {
  AVM_EMPTY_STRING,
  AVM_NULL,
  AVM_ONE, AVM_UNDEFINED,
  AvmObject,
  AvmPropDescriptor,
  AvmSimpleObject,
  AvmValue,
  AvmValueType,
} from "./avm-value";
import { AvmCallResult, CallableType, CallType, HostCallContext, HostCallHandler, HostFunction } from "./function";

export class Realm {
  public readonly objectClass: AvmObject;
  public readonly objectProto: AvmObject;
  public readonly funcClass: AvmObject;
  public readonly funcProto: AvmObject;
  public readonly arrayClass: AvmObject;
  public readonly arrayProto: AvmObject;
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
      callable: undefined,
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

    // Array.[[prototype]]
    const arrayProto: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Object",
      prototype: funcProto,
      ownProperties: new Map(),
      callable: undefined,
    };

    // Array
    const arrayClass: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Function",
      prototype: funcProto,
      ownProperties: new Map(),
      callable: undefined,
    };

    objectClass.callable = createObjectCall(objectClass, objectProto);
    objectClass.ownProperties.set("prototype", AvmPropDescriptor.data(objectProto));
    populateObjectProto(objectProto.ownProperties, funcProto);

    arrayClass.callable = createArrayCall(arrayClass, arrayProto);
    arrayClass.ownProperties.set("prototype", AvmPropDescriptor.data(arrayProto));
    populateArrayProto(arrayProto.ownProperties, arrayClass, funcProto);

    this.objectClass = objectClass;
    this.objectProto = objectProto;
    this.funcClass = funcClass;
    this.funcProto = funcProto;
    this.arrayClass = arrayClass;
    this.arrayProto = arrayProto;
    this.globals = new Map([
      ["Object", objectClass],
      ["Array", arrayClass],
      ["ASnative", bindingFromHostFunction(funcProto, asNativeHandler)],
      ["ASconstructor", bindingFromHostFunction(funcProto, asConstructorHandler)],
      ["ASSetNative", bindingFromHostFunction(funcProto, asSetNativeHandler)],
      ["ASSetPropFlags", bindingFromHostFunction(funcProto, asSetPropFlagsHandler)],
    ]);
  }
}

function bindingFromHostFunction(funcProto: AvmObject, handler: HostCallHandler): AvmObject {
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

function createObjectCall(objectClass: AvmSimpleObject, objectProto: AvmSimpleObject): HostFunction {
  return {type: CallableType.Host, handler};

  function handler(ctx: HostCallContext): AvmCallResult {
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
        return ctx.construct(objectClass, ctx.args);
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
        prototype: objectProto,
        ownProperties: new Map(),
      };
    }
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

function createArrayCall(arrayClass: AvmSimpleObject, arrayProto: AvmSimpleObject): HostFunction {
  return {type: CallableType.Host, handler};

  function handler(ctx: HostCallContext): AvmCallResult {
    // > 15.4.1 The Array Constructor Called as a Function
    // >
    // > When `Array` is called as a function rather than as a constructor, it creates and
    // > initialises a new Array object. Thus the function call `Array(...)` is equivalent to the
    // > object creation expression `new Array(...)` with the same arguments.
    // >
    // > 15.4.1.1  Array ( [ item1 [ , item2 [ , ... ] ] ] )
    // >
    // > When the `Array` function is called the following steps are taken:
    // > 1. Create and return a new Array object exactly as if the array constructor had been called
    // >    with the same arguments (15.4.2).
    if (ctx.callType === CallType.Apply) {
      return ctx.construct(arrayClass, ctx.args);
    }

    // > 15.4.2 The Array Constructor
    // >
    // > When `Array` is called as part of a new expression, it is a constructor: it initialises the
    // > newly created object.

    // assert: callType === CallType.Construct

    if (ctx.thisArg.external) {
      // This may happen due to inheritance
      throw new Error("NotImplemented: new Array() on external object");
    }

    if (ctx.args.length !== 1) {
      // > 15.4.2.1 new Array ( [ item0 [ , item1 [ , ... ] ] ] )
      // >
      // > This description applies if and only if the Array constructor is given no arguments or at
      // > least two arguments.

      // > The [[Prototype]] property of the newly constructed object is set to the original Array
      // > prototype object, the one that is the initial value of `Array.prototype` (15.4.3.1).

      // This resets the prototype
      // TODO: check how it interacts with inheritance
      ctx.thisArg.prototype = arrayProto;

      // > The [[Class]] property of the newly constructed object is set to `"Array"`.
      ctx.thisArg.class = "Array";

      // > The `length` property of the newly constructed object is set to the number of arguments.
      ctx.setStringMember(ctx.thisArg, "length", AvmValue.fromHostNumber(ctx.args.length));

      // > The `0` property of the newly constructed object is set to _item0_ (if supplied); the `1`
      // > property of the newly constructed object is set to _item1_ (if supplied); and, in
      // > general, for as many arguments as there are, the _k_ property of the newly constructed
      // > object is set to argument _k_, where the first argument is considered to be argument
      // > number `0`.
      for (const [i, item] of ctx.args.entries()) {
        ctx.setStringMember(ctx.thisArg, i.toString(10), item);
      }
    } else {
      // assert ctx.args.length === 1
      const len: AvmValue = ctx.args[0];

      // > 15.4.2.2 new Array (len)
      // >
      // > The [[Prototype]] property of the newly constructed object is set to the original Array
      // > prototype object, the one that is the initial value of `Array.prototype` (15.4.3.1). The
      // > [[Class]] property of the newly constructed object is set to `"Array"`.
      ctx.thisArg.prototype = arrayProto;
      ctx.thisArg.class = "Array";

      if (len.type === AvmValueType.Number) {
        // > If the argument _len_ is a Number and ToUint32(_len_) is equal to _len_, then the
        // > `length` property of the newly constructed object is set to ToUint32(_len_). If the
        // > argument _len_ is a Number and ToUint32(_len_) is not equal to _len_, a `RangeError`
        // > exception is thrown.

        // TODO: Check if `ToUint32(len) === len`
        ctx.setStringMember(ctx.thisArg, "length", len);
      } else {
        // > If the argument len is not a Number, then the `length` property of the newly
        // > constructed object is set to `1` and the `0` property of the newly constructed object
        // > is set to `len`.
        ctx.setStringMember(ctx.thisArg, "length", AVM_ONE);
        ctx.setStringMember(ctx.thisArg, "0", len);
      }
    }

    return ctx.thisArg;
  }
}

function populateArrayProto(
  props: Map<string, AvmPropDescriptor>,
  arrayClass: AvmSimpleObject,
  funcProto: AvmObject,
): void {
  // > 15.4.4.1 Array.prototype.constructor
  // >
  // > The initial value of `Array.prototype.constructor` is the built-in `Array` constructor.
  props.set("constructor", AvmPropDescriptor.data(arrayClass));

  // > 15.4.4.2 Array.prototype.toString ( )
  //
  // > The result of calling this function is the same as if the built-in `join` method were invoked
  // > for this object with no argument.
  // >
  // > The `toString` function is not generic; it throws a `TypeError` exception if its this value
  // > is not an Array object. Therefore, it cannot be transferred to other kinds of objects for use
  // > as a method.
  // props.set("toString", AvmPropDescriptor.data(...));

  // > 15.4.4.5 Array.prototype.join (separator)
  //
  // > The elements of the array are converted to strings, and these strings are then concatenated,
  // > separated by occurrences of the _separator_. If no separator is provided, a single comma is
  // > used as the separator.
  // > The `join` method takes one argument, _separator_, and performs the following steps:
  props.set("join", AvmPropDescriptor.data(bindingFromHostFunction(funcProto, join)));

  function join(ctx: HostCallContext): AvmCallResult {
    // > 1. Call the [[Get]] method of this object with argument `"length"`.
    // > 2. Call ToUint32(Result(1)).
    const len: Uint32 = ctx.toHostUint32(ctx.getStringMember(ctx.thisArg, "length"));
    // > 3. If _separator_ is `undefined`, let separator be the single-character string `","`.
    let avmSeparator: AvmValue = ctx.getArg(0);
    if (avmSeparator.type === AvmValueType.Undefined) {
      avmSeparator = AvmValue.fromHostString(",");
    }
    // > 4. Call ToString(_separator_).
    const separator: string = ctx.toHostString(avmSeparator);
    // > 5. If Result(2) is zero, return the empty string.
    if (len === 0) {
      return AVM_EMPTY_STRING;
    }
    // > 6. Call the [[Get]] method of this object with argument `"0"`.
    // > 7. If Result(6) is `undefined` or `null`, use the empty string; otherwise, call
    // >    ToString(Result(6)).
    // > 8. Let _R_ be Result(7).
    // > 9. Let _k_ be `1`.
    // > 10. If _k_ equals Result(2), return _R_.
    // > 11. Let _S_ be a string value produced by concatenating _R_ and Result(4).
    // > 12. Call the [[Get]] method of this object with argument ToString(_k_).
    // > 13. If Result(12) is `undefined` or `null`, use the empty string; otherwise, call
    // >     ToString(Result(12)).
    // > 14. Let _R_ be a string value produced by concatenating _S_ and Result(13).
    // > 15. Increase _k_ by 1.
    // > 16. Go to step 10.
    const parts: string[] = [];
    for (let k: UintSize = 0; k < len; k++) {
      const item: AvmValue = ctx.getStringMember(ctx.thisArg, k.toString(10));
      const part: string = item.type === AvmValueType.Null || item.type === AvmValueType.Undefined
        ? ""
        : ctx.toHostString(item);
      parts.push(part);
    }
    return AvmValue.fromHostString(parts.join(separator));
  }

  // > The length property of the join method is 1.
  // >
  // > NOTE
  // > The `join` function is intentionally generic; it does not require that its `this` value be an
  // > Array object. Therefore, it can be transferred to other kinds of objects for use as a method.
  // > Whether the `join` function can be applied successfully to a host object is
  // > implementation-dependent.
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
