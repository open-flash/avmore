import { AvmValue } from "../avm-value";
import { HostCallContext } from "../function";

// > 15.8  The Math Object
// >
// > The Math object is a single object that has some named properties, some of which are functions.
// >
// > The value of the internal [[Prototype]] property of the Math object is the Object prototype
// > object (15.2.3.1). The value of the internal [[Class]] property of the Math object is `"Math"`.
// >
// > The Math object does not have a [[Construct]] property; it is not possible to use the Math
// > object as a constructor with the `new` operator.
// >
// > The Math object does not have a [[Call]] property; it is not possible to invoke the Math object
// > as a function.
// >
// > NOTE
// > In this specification, the phrase “the number value for x” has a technical meaning defined
// > in 8.5.

export function abs(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.abs(x));
}

export function acos(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.acos(x));
}

export function asin(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.asin(x));
}

export function atan(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.atan(x));
}

export function atan2(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  const y: number = ctx.toHostNumber(ctx.getArg(1));
  return AvmValue.fromHostNumber(Math.atan2(x, y));
}
