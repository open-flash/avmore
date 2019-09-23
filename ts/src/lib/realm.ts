import { AVM_NULL, AvmObject, AvmSimpleObject, AvmValue, AvmValueType } from "./avm-value";
import { AvmCallResult, CallableType, HostCallContext, HostCallHandler } from "./function";

export class Realm {
  public readonly objectProto: AvmObject;
  public readonly funcProto: AvmObject;
  public readonly object: AvmObject;
  public readonly func: AvmObject;

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
    const object: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Object",
      prototype: funcProto,
      ownProperties: new Map(),
      callable: undefined, // TODO: Object callable/constructor
    };

    // Function
    const func: AvmSimpleObject = {
      type: AvmValueType.Object,
      external: false,
      class: "Object",
      prototype: funcProto,
      ownProperties: new Map(),
      callable: undefined, // TODO: Function callable/constructor
    };

    objectProto.ownProperties.set("toString", {value: bindingFromHostFunction(funcProto, objectBindings.toString)});

    this.objectProto = objectProto;
    this.funcProto = funcProto;
    this.object = object;
    this.func = func;
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

namespace objectBindings {
  export function toString(call: HostCallContext): AvmCallResult {
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
