import { AVM_NULL, AvmObject, AvmPropDescriptor, AvmSimpleObject, AvmValue, AvmValueType } from "../avm-value";
import { CallableType, CallType, HostCallContext } from "../function";
import { bindingFromHostFunction } from "../realm";

/**
 * The core realm defines the builtin `Function` and `Object` bindings.
 */
export interface CoreRealm {
  function: AvmSimpleObject;
  functionPrototype: AvmSimpleObject;
  object: AvmSimpleObject;
  objectPrototype: AvmSimpleObject;
}

export function createCoreRealm(): CoreRealm {
  // Object.prototype
  const objectPrototype: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Object",
    prototype: AVM_NULL,
    ownProperties: new Map(),
    callable: undefined,
  };

  // Function.prototype
  const functionPrototype: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Object",
    prototype: objectPrototype,
    ownProperties: new Map(),
    callable: undefined,
  };

  // Object
  const object: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Function",
    prototype: functionPrototype,
    ownProperties: new Map(),
    callable: {type: CallableType.Host, handler: objectConstructor},
  };

  // Function
  const functionClass: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Function",
    prototype: functionPrototype,
    ownProperties: new Map(),
    callable: {type: CallableType.Host, handler: functionConstructor},
  };

  const _objectPrototypeToString: AvmObject = bindingFromHostFunction(functionPrototype, objectPrototypeToString);
  const _functionPrototypeToString: AvmObject = bindingFromHostFunction(functionPrototype, functionPrototypeToString);

  object.ownProperties.set("prototype", AvmPropDescriptor.data(objectPrototype));
  objectPrototype.ownProperties.set("toString", AvmPropDescriptor.data(_objectPrototypeToString));
  functionPrototype.ownProperties.set("toString", AvmPropDescriptor.data(_functionPrototypeToString));

  return {
    function: functionClass,
    functionPrototype,
    object,
    objectPrototype,
  };
}

function objectConstructor(ctx: HostCallContext): AvmValue {
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
      return ctx.construct(ctx.getRealm().object, ctx.args);
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
      prototype: ctx.getRealm().objectPrototype,
      ownProperties: new Map(),
    };
  }
}

function objectPrototypeToString(ctx: HostCallContext): AvmValue {
  if (ctx.thisArg.type !== AvmValueType.Object) {
    throw new Error("NotImplemented: Object.prototype.toString on non-object");
  }
  let tag: string;
  if (ctx.thisArg.external) {
    tag = ctx.thisArg.handler.toStringTag !== undefined ? ctx.thisArg.handler.toStringTag : "Object";
  } else {
    tag = ctx.thisArg.class;
  }
  const value: string = `[object ${tag}]`;
  return AvmValue.fromHostString(value);
}

function functionConstructor(ctx: HostCallContext): AvmValue {
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
      return ctx.construct(ctx.getRealm().object, ctx.args);
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
      prototype: ctx.getRealm().objectPrototype,
      ownProperties: new Map(),
    };
  }
}

function functionPrototypeToString(_ctx: HostCallContext): AvmValue {
  return AvmValue.fromHostString("[type Function]");
}
