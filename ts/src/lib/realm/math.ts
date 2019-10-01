import { AvmObject, AvmPropDescriptor, AvmSimpleObject, AvmValue, AvmValueType } from "../avm-value";
import { HostCallContext } from "../function";
import { bindingFromHostFunction } from "../realm";
import { CoreRealm } from "./core";

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

export interface MathRealm {
  math: AvmObject;
  mathAbs: AvmObject;
  mathAcos: AvmObject;
  mathAsin: AvmObject;
  mathAtan: AvmObject;
  mathAtan2: AvmObject;
  mathCeil: AvmObject;
  mathCos: AvmObject;
  mathExp: AvmObject;
  mathFloor: AvmObject;
  mathLog: AvmObject;
  mathMax: AvmObject;
  mathMin: AvmObject;
  mathPow: AvmObject;
  mathRandom: AvmObject;
  mathRound: AvmObject;
  mathSin: AvmObject;
  mathSqrt: AvmObject;
  mathTan: AvmObject;
}

export function createMathRealm(core: CoreRealm): MathRealm {
  const _mathAbs: AvmObject = bindingFromHostFunction(core.functionPrototype, mathAbs);
  const _mathAcos: AvmObject = bindingFromHostFunction(core.functionPrototype, mathAcos);
  const _mathAsin: AvmObject = bindingFromHostFunction(core.functionPrototype, mathAsin);
  const _mathAtan: AvmObject = bindingFromHostFunction(core.functionPrototype, mathAtan);
  const _mathAtan2: AvmObject = bindingFromHostFunction(core.functionPrototype, mathAtan2);
  const _mathCeil: AvmObject = bindingFromHostFunction(core.functionPrototype, mathCeil);
  const _mathCos: AvmObject = bindingFromHostFunction(core.functionPrototype, mathCos);
  const _mathExp: AvmObject = bindingFromHostFunction(core.functionPrototype, mathExp);
  const _mathFloor: AvmObject = bindingFromHostFunction(core.functionPrototype, mathFloor);
  const _mathLog: AvmObject = bindingFromHostFunction(core.functionPrototype, mathLog);
  const _mathMax: AvmObject = bindingFromHostFunction(core.functionPrototype, mathMax);
  const _mathMin: AvmObject = bindingFromHostFunction(core.functionPrototype, mathMin);
  const _mathPow: AvmObject = bindingFromHostFunction(core.functionPrototype, mathPow);
  const _mathRandom: AvmObject = bindingFromHostFunction(core.functionPrototype, mathRandom);
  const _mathRound: AvmObject = bindingFromHostFunction(core.functionPrototype, mathRound);
  const _mathSin: AvmObject = bindingFromHostFunction(core.functionPrototype, mathSin);
  const _mathSqrt: AvmObject = bindingFromHostFunction(core.functionPrototype, mathSqrt);
  const _mathTan: AvmObject = bindingFromHostFunction(core.functionPrototype, mathTan);

  // Math
  const _math: AvmSimpleObject = {
    type: AvmValueType.Object,
    external: false,
    class: "Math",
    prototype: core.objectPrototype,
    ownProperties: new Map([
      ["abs", AvmPropDescriptor.data(_mathAbs)],
      ["acos", AvmPropDescriptor.data(_mathAcos)],
      ["asin", AvmPropDescriptor.data(_mathAsin)],
      ["atan", AvmPropDescriptor.data(_mathAtan)],
      ["atan2", AvmPropDescriptor.data(_mathAtan2)],
      ["ceil", AvmPropDescriptor.data(_mathCeil)],
      ["cos", AvmPropDescriptor.data(_mathCos)],
      ["exp", AvmPropDescriptor.data(_mathExp)],
      ["floor", AvmPropDescriptor.data(_mathFloor)],
      ["log", AvmPropDescriptor.data(_mathLog)],
      ["max", AvmPropDescriptor.data(_mathMax)],
      ["min", AvmPropDescriptor.data(_mathMin)],
      ["pow", AvmPropDescriptor.data(_mathPow)],
      ["random", AvmPropDescriptor.data(_mathRandom)],
      ["round", AvmPropDescriptor.data(_mathRound)],
      ["sin", AvmPropDescriptor.data(_mathSin)],
      ["sqrt", AvmPropDescriptor.data(_mathSqrt)],
      ["tan", AvmPropDescriptor.data(_mathTan)],
    ]),
    callable: undefined,
  };

  return {
    math: _math,
    mathAbs: _mathAbs,
    mathAcos: _mathAcos,
    mathAsin: _mathAsin,
    mathAtan: _mathAtan,
    mathAtan2: _mathAtan2,
    mathCeil: _mathCeil,
    mathCos: _mathCos,
    mathExp: _mathExp,
    mathFloor: _mathFloor,
    mathLog: _mathLog,
    mathMax: _mathMax,
    mathMin: _mathMin,
    mathPow: _mathPow,
    mathRandom: _mathRandom,
    mathRound: _mathRound,
    mathSin: _mathSin,
    mathSqrt: _mathSqrt,
    mathTan: _mathTan,
  };
}

export function mathAbs(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.abs(x));
}

export function mathAcos(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.acos(x));
}

export function mathAsin(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.asin(x));
}

export function mathAtan(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.atan(x));
}

export function mathAtan2(ctx: HostCallContext): AvmValue {
  const y: number = ctx.toHostNumber(ctx.getArg(0));
  const x: number = ctx.toHostNumber(ctx.getArg(1));
  return AvmValue.fromHostNumber(Math.atan2(y, x));
}

export function mathCeil(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.ceil(x));
}

export function mathCos(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.cos(x));
}

export function mathExp(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.exp(x));
}

export function mathFloor(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.floor(x));
}

export function mathLog(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.log(x));
}

export function mathMax(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  const y: number = ctx.toHostNumber(ctx.getArg(1));
  return AvmValue.fromHostNumber(Math.max(x, y));
}

export function mathMin(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  const y: number = ctx.toHostNumber(ctx.getArg(1));
  return AvmValue.fromHostNumber(Math.min(x, y));
}

export function mathPow(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  const y: number = ctx.toHostNumber(ctx.getArg(1));
  return AvmValue.fromHostNumber(Math.pow(x, y));
}

export function mathRandom(_ctx: HostCallContext): AvmValue {
  throw new Error("NotImplemented: Math.random");
}

export function mathRound(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.round(x));
}

export function mathSin(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.sin(x));
}

export function mathSqrt(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.sqrt(x));
}

export function mathTan(ctx: HostCallContext): AvmValue {
  const x: number = ctx.toHostNumber(ctx.getArg(0));
  return AvmValue.fromHostNumber(Math.tan(x));
}
