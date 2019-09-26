import { Uint32, UintSize } from "semantic-types";
import {
  AVM_EMPTY_STRING,
  AVM_ONE,
  AvmObject,
  AvmPropDescriptor,
  AvmSimpleObject,
  AvmValue,
  AvmValueType,
} from "../avm-value";
import { AvmCallResult, CallableType, CallType, HostCallContext } from "../function";
import { bindingFromHostFunction } from "../realm";

// > 15.4 Array Objects
// >
// > Array objects give special treatment to a certain class of property names. A property name P (in the form of
// > a string value) is an array index if and only if ToString(ToUint32(P)) is equal to P and ToUint32(P) is not
// > equal to 2 32−1. Every Array object has a length property whose value is always a nonnegative integer
// > 32less than 2 . The value of the length property is numerically greater than the name of every property
// > whose name is an array index; whenever a property of an Array object is created or changed, other
// > properties are adjusted as necessary to maintain this invariant. Specifically, whenever a property is added
// > whose name is an array index, the length property is changed, if necessary, to be one more than the
// > numeric value of that array index; and whenever the length property is changed, every property whose
// > name is an array index whose value is not smaller than the new length is automatically deleted. This
// > constraint applies only to properties of the Array object itself and is unaffected by length or array index
// > properties that may be inherited from its prototype.

export interface ArrayRealm {
  array: AvmObject;
  arrayPrototype: AvmObject;
  arrayPrototypeToString: AvmObject;
  arrayPrototypeToLocaleString: AvmObject;
  arrayPrototypeJoin: AvmObject;
  arrayPrototypePop: AvmObject;
  arrayPrototypePush: AvmObject;
  arrayPrototypeReverse: AvmObject;
  arrayPrototypeShift: AvmObject;
  arrayPrototypeSlice: AvmObject;
  arrayPrototypeSort: AvmObject;
  arrayPrototypeSplice: AvmObject;
  arrayPrototypeUnshift: AvmObject;
}

export function createArrayRealm(funcProto: AvmSimpleObject): ArrayRealm {
  const _arrayPrototypeToString: AvmObject = bindingFromHostFunction(funcProto, arrayPrototypeToString);
  const _arrayPrototypeToLocaleString: AvmObject = bindingFromHostFunction(funcProto, arrayPrototypeToLocaleString);
  const _arrayPrototypeJoin: AvmObject = bindingFromHostFunction(funcProto, arrayPrototypeJoin);
  const _arrayPrototypePop: AvmObject = bindingFromHostFunction(funcProto, arrayPrototypePop);
  const _arrayPrototypePush: AvmObject = bindingFromHostFunction(funcProto, arrayPrototypePush);
  const _arrayPrototypeReverse: AvmObject = bindingFromHostFunction(funcProto, arrayPrototypeReverse);
  const _arrayPrototypeShift: AvmObject = bindingFromHostFunction(funcProto, arrayPrototypeShift);
  const _arrayPrototypeSlice: AvmObject = bindingFromHostFunction(funcProto, arrayPrototypeSlice);
  const _arrayPrototypeSort: AvmObject = bindingFromHostFunction(funcProto, arrayPrototypeSort);
  const _arrayPrototypeSplice: AvmObject = bindingFromHostFunction(funcProto, arrayPrototypeSplice);
  const _arrayPrototypeUnshift: AvmObject = bindingFromHostFunction(funcProto, arrayPrototypeUnshift);

  // Array.prototype
  const arrayPrototype: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Object",
    prototype: funcProto,
    ownProperties: new Map([
      ["arrayPrototypeToString", AvmPropDescriptor.data(_arrayPrototypeToString)],
      ["arrayPrototypeToLocaleString", AvmPropDescriptor.data(_arrayPrototypeToLocaleString)],
      ["arrayPrototypeJoin", AvmPropDescriptor.data(_arrayPrototypeJoin)],
      ["arrayPrototypePop", AvmPropDescriptor.data(_arrayPrototypePop)],
      ["arrayPrototypePush", AvmPropDescriptor.data(_arrayPrototypePush)],
      ["arrayPrototypeReverse", AvmPropDescriptor.data(_arrayPrototypeReverse)],
      ["arrayPrototypeShift", AvmPropDescriptor.data(_arrayPrototypeShift)],
      ["arrayPrototypeSlice", AvmPropDescriptor.data(_arrayPrototypeSlice)],
      ["arrayPrototypeSort", AvmPropDescriptor.data(_arrayPrototypeSort)],
      ["arrayPrototypeSplice", AvmPropDescriptor.data(_arrayPrototypeSplice)],
      ["arrayPrototypeUnshift", AvmPropDescriptor.data(_arrayPrototypeUnshift)],
    ]),
    callable: undefined,
  };

  // Array
  const _array: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Function",
    prototype: funcProto,
    ownProperties: new Map([
      ["prototype", AvmPropDescriptor.data(arrayPrototype)],
    ]),
    callable: {type: CallableType.Host, handler: array},
  };

  arrayPrototype.ownProperties.set("constructor", AvmPropDescriptor.data(_array));

  return {
    array: _array,
    arrayPrototype,
    arrayPrototypeToString: _arrayPrototypeToString,
    arrayPrototypeToLocaleString: _arrayPrototypeToLocaleString,
    arrayPrototypeJoin: _arrayPrototypeJoin,
    arrayPrototypePop: _arrayPrototypePop,
    arrayPrototypePush: _arrayPrototypePush,
    arrayPrototypeReverse: _arrayPrototypeReverse,
    arrayPrototypeShift: _arrayPrototypeShift,
    arrayPrototypeSlice: _arrayPrototypeSlice,
    arrayPrototypeSort: _arrayPrototypeSort,
    arrayPrototypeSplice: _arrayPrototypeSplice,
    arrayPrototypeUnshift: _arrayPrototypeUnshift,
  };
}

export function array(ctx: HostCallContext): AvmCallResult {
  // > 15.4.1 The Array Constructor Called as a Function
  // >
  // > When `Array` is called as a function rather than as a constructor, it creates and
  // > initialises a new Array object. Thus the function call `Array(...)` is equivalent to the
  // > object creation expression `new Array(...)` with the same arguments.

  // > 15.4.1.1  Array ( [ item1 [ , item2 [ , ... ] ] ] )
  // >
  // > When the `Array` function is called the following steps are taken:
  // > 1. Create and return a new Array object exactly as if the array constructor had been called
  // >    with the same arguments (15.4.2).
  if (ctx.callType === CallType.Apply) {
    return ctx.construct(ctx.getRealm().array, ctx.args);
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
    ctx.thisArg.prototype = ctx.getRealm().arrayPrototype;

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
    ctx.thisArg.prototype = ctx.getRealm().arrayPrototype;
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

// > 15.4.4.2 Array.prototype.toString ( )
//
// > The result of calling this function is the same as if the built-in `join` method were invoked
// > for this object with no argument.
// >
// > The `toString` function is not generic; it throws a `TypeError` exception if its this value
// > is not an Array object. Therefore, it cannot be transferred to other kinds of objects for use
// > as a method.
export function arrayPrototypeToString(ctx: HostCallContext): AvmCallResult {
  // TODO: Check that `thisArg` is an array
  return ctx.apply(ctx.getRealm().arrayPrototypeJoin, ctx.getThis(), []);
}

export function arrayPrototypeToLocaleString(_ctx: HostCallContext): AvmCallResult {
  throw new Error("NotImplemented: Array.prototype.toLocaleString");
}

export function arrayPrototypeConcat(_ctx: HostCallContext): AvmCallResult {
  throw new Error("NotImplemented: Array.prototype.concat");
}

// > 15.4.4.5 Array.prototype.join (separator)
//
// > The elements of the array are converted to strings, and these strings are then concatenated,
// > separated by occurrences of the _separator_. If no separator is provided, a single comma is
// > used as the separator.
// > The `join` method takes one argument, _separator_, and performs the following steps:
export function arrayPrototypeJoin(ctx: HostCallContext): AvmCallResult {
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

  // > The length property of the join method is 1.
  // >
  // > NOTE
  // > The `join` function is intentionally generic; it does not require that its `this` value be an
  // > Array object. Therefore, it can be transferred to other kinds of objects for use as a method.
  // > Whether the `join` function can be applied successfully to a host object is
  // > implementation-dependent.
}

export function arrayPrototypePop(_ctx: HostCallContext): AvmCallResult {
  throw new Error("NotImplemented: Array.prototype.pop");
}

export function arrayPrototypePush(_ctx: HostCallContext): AvmCallResult {
  throw new Error("NotImplemented: Array.prototype.push");
}

export function arrayPrototypeReverse(_ctx: HostCallContext): AvmCallResult {
  throw new Error("NotImplemented: Array.prototype.reverse");
}

export function arrayPrototypeShift(_ctx: HostCallContext): AvmCallResult {
  throw new Error("NotImplemented: Array.prototype.shift");
}

export function arrayPrototypeSlice(_ctx: HostCallContext): AvmCallResult {
  throw new Error("NotImplemented: Array.prototype.slice");
}

export function arrayPrototypeSort(_ctx: HostCallContext): AvmCallResult {
  throw new Error("NotImplemented: Array.prototype.sort");
}

export function arrayPrototypeSplice(_ctx: HostCallContext): AvmCallResult {
  throw new Error("NotImplemented: Array.prototype.splice");
}

export function arrayPrototypeUnshift(_ctx: HostCallContext): AvmCallResult {
  throw new Error("NotImplemented: Array.prototype.unshift");
}
