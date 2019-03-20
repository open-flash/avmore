export enum AvmValueType {
  Boolean,
  External,
  Function,
  Null,
  Number,
  Object,
  String,
  Undefined,
}

export interface AvmExternalHandler {
  ownKeys(): AvmValue[];

  set(key: AvmValue, value: AvmValue): void;

  get(key: AvmValue): AvmValue | undefined;
}

export interface AvmExternal {
  readonly type: AvmValueType.External;
  readonly handler: AvmExternalHandler;
}

export interface AvmBoolean {
  readonly type: AvmValueType.Boolean;
  readonly value: boolean;
}

export interface AvmNull {
  readonly type: AvmValueType.Null;
}

export interface AvmNumber {
  readonly type: AvmValueType.Number;
  readonly value: number;
}

export interface AvmString {
  readonly type: AvmValueType.String;
  readonly value: string;
}

export interface AvmUndefined {
  readonly type: AvmValueType.Undefined;
}

export interface AvmObjectProperty {
  readonly value: AvmValue;
}

export interface AvmObject {
  readonly type: AvmValueType.Object;
  prototype: AvmValue;
  readonly ownProperties: Map<string, AvmObjectProperty>;
}

export type AvmCallResult = [boolean, AvmValue];

export interface AvmCall {
  readonly context?: AvmValue;
  readonly args: AvmValue[];
  readonly callee?: AvmFunction;
}

export type NativeCallHandler = (call: AvmCall) => AvmCallResult;

export interface AvmNativeFunction {
  readonly type: AvmValueType.Function;
  readonly native: true;
  ownProperties?: Map<string, AvmValue>;
  readonly handler: NativeCallHandler;
}

export interface AvmClientFunction {
  readonly type: AvmValueType.Function;
  readonly native: false;
  ownProperties?: Map<string, AvmValue>;
  // definition: DefineFunction;
}

export type AvmFunction = AvmNativeFunction | AvmClientFunction;

export type AvmValue = AvmBoolean
  | AvmExternal
  | AvmNull
  | AvmNumber
  | AvmObject
  | AvmFunction
  | AvmUndefined
  | AvmString;

// tslint:disable-next-line:typedef variable-name
export const AvmValue = {
  // fromAst(astValue: AstValue): AvmValue {
  //
  // }
  toAvmString(avmValue: AvmValue, _swfVersion: number): AvmString {
    switch (avmValue.type) {
      case AvmValueType.String:
        return avmValue;
      default:
        throw new Error("CannotConvertToString");
    }
  },
};

export const AVM_NULL: AvmNull = Object.freeze(<AvmNull>{type: AvmValueType.Null});
export const AVM_UNDEFINED: AvmUndefined = Object.freeze(<AvmUndefined>{type: AvmValueType.Undefined});
export const AVM_TRUE: AvmBoolean = Object.freeze(<AvmBoolean>{type: AvmValueType.Boolean, value: true});
export const AVM_FALSE: AvmBoolean = Object.freeze(<AvmBoolean>{type: AvmValueType.Boolean, value: false});
