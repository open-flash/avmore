import { Uint32 } from "semantic-types";
import { AVM_UNDEFINED, AvmObject, AvmPropDescriptor, AvmValue, AvmValueType } from "./avm-value";
import { AvmCallResult, CallableType, HostCallContext, HostCallHandler } from "./function";
import { ArrayRealm, createArrayRealm } from "./realm/array";
import { BooleanRealm, createBooleanRealm } from "./realm/boolean";
import { CoreRealm, createCoreRealm } from "./realm/core";
import { createMathRealm, MathRealm } from "./realm/math";
import { createNumberRealm, NumberRealm } from "./realm/number";
import { createStringRealm, StringRealm } from "./realm/string";

export interface Realm extends ArrayRealm, BooleanRealm, CoreRealm, MathRealm, NumberRealm, StringRealm {
  globals: Map<string, AvmValue>;
}

export function createRealm(): Realm {
  const coreRealm: CoreRealm = createCoreRealm();
  const arrayRealm: ArrayRealm = createArrayRealm(coreRealm);
  const booleanRealm: BooleanRealm = createBooleanRealm(coreRealm);
  const mathRealm: MathRealm = createMathRealm(coreRealm);
  const numberRealm: NumberRealm = createNumberRealm(coreRealm);
  const stringRealm: StringRealm = createStringRealm(coreRealm);

  const globals: Map<string, AvmValue> = new Map([
    ["Array", arrayRealm.array],
    ["Boolean", booleanRealm.boolean],
    ["Function", coreRealm.function],
    ["Math", mathRealm.math],
    ["Number", numberRealm.number],
    ["Object", coreRealm.object],
    ["String", stringRealm.string],
    ["ASnative", bindingFromHostFunction(coreRealm.functionPrototype, asNativeHandler)],
    ["ASconstructor", bindingFromHostFunction(coreRealm.functionPrototype, asConstructorHandler)],
    ["ASSetNative", bindingFromHostFunction(coreRealm.functionPrototype, asSetNativeHandler)],
    ["ASSetPropFlags", bindingFromHostFunction(coreRealm.functionPrototype, asSetPropFlagsHandler)],
  ]);

  return {
    globals,
    ...arrayRealm,
    ...booleanRealm,
    ...coreRealm,
    ...mathRealm,
    ...numberRealm,
    ...stringRealm,
  };
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
