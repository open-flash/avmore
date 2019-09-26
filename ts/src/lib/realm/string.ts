import { AVM_EMPTY_STRING } from "../avm-value";
import { AvmCallResult, CallType, HostCallContext } from "../function";

// > 15.5 String Objects

export function stringConstructor(ctx: HostCallContext): AvmCallResult {
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
  ctx.thisArg.prototype = ctx.getRealm().stringProto;

  // > The [[Class]] property of the newly constructed object is set to `"String"`.
  ctx.thisArg.class = "String";

  // > The [[Value]] property of the newly constructed object is set to ToString(_value_), or to
  // > the empty string if value is not supplied.
  ctx.thisArg.value = ctx.args.length > 0
    ? ctx.toHostString(ctx.args[0])
    : "";

  return ctx.thisArg;
}
