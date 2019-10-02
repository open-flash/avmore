// tslint:disable:max-classes-per-file max-file-line-count

import { Sint32, Uint32 } from "semantic-types";
import {
  AVM_FALSE,
  AVM_NAN,
  AVM_ONE,
  AVM_TRUE,
  AVM_UNDEFINED,
  AVM_ZERO,
  AvmBoolean,
  AvmNull,
  AvmNumber,
  AvmObject,
  AvmPrimitive,
  AvmPropDescriptor,
  AvmSimpleObject,
  AvmString,
  AvmUndefined,
  AvmValue,
  AvmValueType,
} from "../avm-value";
import { BaseContext, RunBudget } from "../context";
import { FlowResult, FlowResultType } from "../flow-result";
import { AvmCallResult, Callable, CallableType, CallType, HostCallContext, ParameterState } from "../function";
import { Realm } from "../realm";
import { RegisterTable } from "../register-table";
import { FunctionScope } from "../scope";
import { AbortSignal, AvmThrowSignal } from "../signal";
import { AvmStack } from "../stack";
import { ExecutionContext, FunctionActivation, TargetId, Vm } from "../vm";

export enum ToPrimitiveHint {
  Number,
  String,
}

export abstract class BaseRuntime implements BaseContext {
  protected vm: Vm;
  protected budget: RunBudget;

  constructor(vm: Vm, budget: RunBudget) {
    this.vm = vm;
    this.budget = budget;
  }

  public apply(fn: AvmValue, thisArg: AvmValue, args: ReadonlyArray<AvmValue>): AvmCallResult {
    if (fn.type !== AvmValueType.Object) {
      return AVM_UNDEFINED;
      // throw new Error("CannotApplyNonObject");
    }
    if (fn.external) {
      if (fn.handler.apply === undefined) {
        throw new Error("CannotApplyExternal");
      }
      return fn.handler.apply(thisArg, args);
    } else {
      const callable: Callable | undefined = fn.callable;
      if (callable === undefined) {
        throw new Error("CannotApplyNonCallableObject");
      }
      // TODO: It seems that `undefined` and `null` mean that thisArg should use the global value
      if (thisArg.type !== AvmValueType.Object && thisArg.type !== AvmValueType.Undefined) {
        thisArg = this.toAvmObject(thisArg);
      }
      return this.call(callable, CallType.Apply, thisArg, args);
    }
  }

  public construct(fn: AvmValue, args: ReadonlyArray<AvmValue>): AvmCallResult {
    if (fn.type !== AvmValueType.Object) {
      throw new Error("CannotConstructNonObject");
    }
    if (fn.external) {
      if (fn.handler.construct === undefined) {
        throw new Error("CannotConstructExternal");
      }
      return fn.handler.construct(args);
    } else {
      const callable: Callable | undefined = fn.callable;
      if (callable === undefined) {
        throw new Error("CannotConstructNonCallableObject");
      }

      const thisArg: AvmSimpleObject = {
        type: AvmValueType.Object,
        external: false,
        class: "Object",
        prototype: this.getRealm().objectPrototype,
        ownProperties: new Map(),
        callable: undefined,
      };

      this.call(callable, CallType.Construct, thisArg, args);
      return thisArg;
    }
  }

  public getMember(obj: AvmValue, key: AvmValue): AvmValue {
    return this.getStringMember(obj, this.toHostString(key));
  }

  public getStringMember(obj: AvmValue, key: string): AvmValue {
    const value: AvmValue | undefined = this.tryGetStringMember(obj, key);
    if (value !== undefined) {
      return value;
    }
    // const targetName: string | undefined = this.missingPropertyDetector.getVarName();
    // if (targetName !== undefined) {
    //   this.vm.host.warn(new TargetHasNoPropertyWarning(targetName, key));
    // }
    return AVM_UNDEFINED;
  }

  // Implements `GetValue` and `[[Get]]`
  public tryGetStringMember(target: AvmValue, key: string): AvmValue | undefined {
    if (target.type === AvmValueType.Undefined || target.type === AvmValueType.Null) {
      // Early return to avoid TypeError
      return undefined;
    }
    const obj: AvmObject = this.toAvmObject(target);
    if (obj.external) {
      return obj.handler.get(key);
    }
    const prop: AvmPropDescriptor | undefined = obj.ownProperties.get(key);
    if (prop !== undefined) {
      if (prop.value === undefined) {
        throw new Error("NotImplemented: AccessorProperties");
      }
      return prop.value;
    }
    if (obj.prototype.type === AvmValueType.Object) {
      return this.tryGetStringMember(obj.prototype, key);
    }
    return undefined;
  }

  public setMember(obj: AvmValue, key: AvmValue, value: AvmValue): void {
    this.setStringMember(obj, this.toHostString(key), value);
  }

  public setStringMember(target: AvmValue, key: string, value: AvmValue): void {
    if (target.type === AvmValueType.Undefined || target.type === AvmValueType.Null) {
      // Early return to avoid TypeError
      return undefined;
    }
    const obj: AvmObject = this.toAvmObject(target);
    if (obj.external) {
      obj.handler.set(key, value);
    } else {
      obj.ownProperties.set(key, AvmPropDescriptor.data(value));
    }
  }

  public getOwnKeys(obj: AvmValue): AvmString[] {
    if (obj.type !== AvmValueType.Object) {
      return [];
      // throw new Error("NotImplemented: ReferenceError on non-object getKeys access");
    }
    if (obj.external) {
      return obj.handler.ownKeys();
    }
    const keys: AvmString[] = [];
    for (const name of obj.ownProperties.keys()) {
      // TODO: Filter enumerable
      keys.push(AvmValue.fromHostString(name));
    }
    return keys;
  }

  // Implementation of the ToBoolean algorithm from ECMA 262-3, section 9.2
  public toAvmBoolean(value: AvmValue): AvmBoolean {
    switch (value.type) {
      case AvmValueType.Boolean:
        return value;
      case AvmValueType.Null:
        return AVM_FALSE;
      case AvmValueType.Number:
        return AvmValue.fromHostBoolean(isNaN(value.value) || value.value === 0);
      case AvmValueType.Object:
        return AVM_TRUE;
      case AvmValueType.String:
        return AvmValue.fromHostBoolean(value.value.length > 0);
      case AvmValueType.Undefined:
        return AVM_FALSE;
      default:
        throw new Error(`UnexpectedAvmValueType: ${value}`);
    }
  }

  // Implementation of the ToObject algorithm from ECMA 262-3, section 9.9
  public toAvmObject(value: AvmValue): AvmObject {
    switch (value.type) {
      case AvmValueType.Boolean:
        return this.createBooleanBox(value.value);
      case AvmValueType.Null:
        throw new Error("TypeError: ToObject(AvmNull)");
      case AvmValueType.Number:
        return this.createNumberBox(value.value);
      case AvmValueType.Object:
        return value;
      case AvmValueType.String:
        return this.createStringBox(value.value);
      case AvmValueType.Undefined:
        throw new Error("TypeError: ToObject(AvmUndefined)");
      default:
        throw new Error(`UnexpectedAvmValueType: ${value}`);
    }
  }

  public createBooleanBox(value: boolean): AvmObject {
    return {
      type: AvmValueType.Object,
      external: false,
      prototype: this.getRealm().booleanPrototype,
      class: "String",
      ownProperties: new Map(),
      value,
      callable: undefined,
    };
  }

  public createNumberBox(value: number): AvmObject {
    return {
      type: AvmValueType.Object,
      external: false,
      prototype: this.getRealm().numberPrototype,
      class: "String",
      ownProperties: new Map(),
      value,
      callable: undefined,
    };
  }

  public createStringBox(value: string): AvmObject {
    return {
      type: AvmValueType.Object,
      external: false,
      prototype: this.getRealm().stringPrototype,
      class: "String",
      ownProperties: new Map(),
      value,
      callable: undefined,
    };
  }

  // Implementation of the ToString algorithm from ECMA 262-3, section 9.8
  public toAvmString(avmValue: AvmValue): AvmString {
    const primitive: AvmPrimitive = this.toAvmPrimitive(avmValue, ToPrimitiveHint.String);
    switch (primitive.type) {
      case AvmValueType.Boolean:
        return AvmValue.fromHostString(primitive.value ? "true" : "false");
      case AvmValueType.Null:
        return AvmValue.fromHostString("null");
      case AvmValueType.Number: {
        let str: string = primitive.value.toString(10);
        // Naive restriction to 14 decimals
        // TODO: Follow Actionscript's stringification more closely
        str = str.replace(/^(\d+\.\d{0,14})\d*$/, "$1");
        return AvmValue.fromHostString(str);
      }
      case AvmValueType.String:
        return primitive;
      case AvmValueType.Undefined:
        return AvmValue.fromHostString("undefined");
      default:
        throw new Error(`UnexpectedAvmPrimitiveType: ${primitive}`);
    }
  }

  // Implementation of the ToPrimitive algorithm from ECMA 262-3, section 9.1
  // TODO: Make it private?
  public toAvmPrimitive(value: AvmValue, hint?: ToPrimitiveHint): AvmPrimitive {
    return AvmValue.isPrimitive(value) ? value : this.getDefaultValue(value, hint);
  }

  // Implementation of the [[DefaultValue]](hint) algorithm from ECMA 262-3, section 8.6.2.6
  // TODO: Make it private? Merge it with `toAvmPrimitive`?
  public getDefaultValue(obj: AvmObject, hint?: ToPrimitiveHint): AvmPrimitive {
    if (hint !== ToPrimitiveHint.String) {
      throw new Error("NotImplemented: `getDefaultValue` with non string hint");
    }

    // 1. Call the [[Get]] method of object O with argument "toString".
    const toStringFn: AvmValue = this.getStringMember(obj, "toString");
    // 2. If Result(1) is not an object, go to step 5.
    if (toStringFn.type === AvmValueType.Object) {
      // 3. Call the [[Call]] method of Result(1), with O as the this value and an empty argument list.
      const toStringResult: AvmValue = this.apply(toStringFn, obj, []);
      // 4. If Result(3) is a primitive value, return Result(3).
      if (AvmValue.isPrimitive(toStringResult)) {
        return toStringResult;
      }
    }
    // 5. Call the [[Get]] method of object O with argument "valueOf".
    const valueOfFn: AvmValue = this.getStringMember(obj, "valueOf");
    // 6. If Result(5) is not an object, go to step 9.
    if (valueOfFn.type === AvmValueType.Object) {
      // 7. Call the [[Call]] method of Result(5), with O as the this value and an empty argument list.
      const valueOfResult: AvmValue = this.apply(valueOfFn, obj, []);
      // 8. If Result(7) is a primitive value, return Result(7).
      if (AvmValue.isPrimitive(valueOfResult)) {
        return valueOfResult;
      }
    }
    // 9. Throw a TypeError exception.
    throw new Error("NotImplemented: TypeError on `getDefaultValue` failure");
  }

  public toHostString(value: AvmValue): string {
    return this.toAvmString(value).value;
  }

  // Implementation of the ToNumber algorithm from ECMA 262-3, section 9.3
  public toAvmNumber(value: AvmValue): AvmNumber {
    switch (value.type) {
      case AvmValueType.Undefined:
        return AVM_NAN;
      case AvmValueType.Null:
        return AVM_ZERO;
      case AvmValueType.Boolean:
        return value.value ? AVM_ONE : AVM_ZERO;
      case AvmValueType.Number:
        return value;
      default:
        throw new Error("NotImplemented: Full `ToNumber` algorithm");
    }
  }

  public toHostNumber(value: AvmValue): number {
    return this.toAvmNumber(value).value;
  }

  // Implementation of the ToInt32 algorithm from ECMA 262-3, section 9.5
  public toHostSint32(value: AvmValue): Sint32 {
    return this.toHostNumber(value) | 0;
  }

  // Implementation of the ToUint32 algorithm from ECMA 262-3, section 9.6
  public toHostUint32(value: AvmValue): Uint32 {
    const result: Sint32 = this.toHostNumber(value) | 0;
    return result < 0 ? 2 ** 32 + result : result;
  }

  public toHostBoolean(value: AvmValue): boolean {
    return this.toAvmBoolean(value).value;
  }

  public initArray(array: ReadonlyArray<AvmValue>): AvmValue {
    const result: AvmValue = this.construct(this.vm.realm.array, []);
    this.setStringMember(result, "length", AvmValue.fromHostNumber(array.length));
    for (const [i, item] of array.entries()) {
      this.setStringMember(result, i.toString(10), item);
    }
    return result;
  }

  public getRealm(): Realm {
    return this.vm.realm;
  }

  public throw(value: AvmValue): never {
    throw new AvmThrowSignal(value);
  }

  public abort(): never {
    throw new AbortSignal();
  }

  // Implements the typeoff operation as defined in ECMA-262-3, section 11.4.3
  // ("The Subtraction Operator ( - )")
  public typeOf(value: AvmValue): AvmString {
    // 1. Evaluate UnaryExpression.
    // 2. If Type(Result(1)) is not Reference, go to step 4.
    // 3. If GetBase(Result(1)) is null, return "undefined".
    // 4. Call GetValue(Result(1)).
    // `value` := `Result(4)`
    // 5. Return a string determined by Type(Result(4)) according to the following table:
    switch (value.type) {
      case AvmValueType.Boolean:
        return AvmValue.fromHostString("boolean");
      case AvmValueType.Null:
        return AvmValue.fromHostString("object");
      case AvmValueType.Number:
        return AvmValue.fromHostString("number");
      case AvmValueType.Object: {
        if (value.external) {
          throw new Error("NotImplemented: TypeOf for external object");
        } else {
          if (value.callable !== undefined) {
            return AvmValue.fromHostString("function");
          } else {
            return AvmValue.fromHostString("object");
          }
        }
      }
      case AvmValueType.String:
        return AvmValue.fromHostString("string");
      case AvmValueType.Undefined:
        return AvmValue.fromHostString("undefined");
      default:
        throw new Error(`UnexpectedAvmValueType: ${value}`);
    }
  }

  // Implements the multiply operation as defined in ECMA-262-3, section 11.5.1
  // ("Applying the * Operator")
  public multiply(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate MultiplicativeExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate UnaryExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToNumber(Result(2)).
    const leftNum: number = this.toHostNumber(left);
    // 6. Call ToNumber(Result(4)).
    const rightNum: number = this.toHostNumber(right);
    // 7. Apply the specified operation (*, /, or %) to Result(5) and Result(6). See the notes
    //    below (11.5.1, 11.5.2, 11.5.3).
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftNum * rightNum);
  }

  // Implements the divide operation as defined in ECMA-262-3, section 11.5.2
  // ("Applying the / Operator")
  public divide(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate MultiplicativeExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate UnaryExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToNumber(Result(2)).
    const leftNum: number = this.toHostNumber(left);
    // 6. Call ToNumber(Result(4)).
    const rightNum: number = this.toHostNumber(right);
    // 7. Apply the specified operation (*, /, or %) to Result(5) and Result(6). See the notes
    //    below (11.5.1, 11.5.2, 11.5.3).
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftNum / rightNum);
  }

  // Implements the remainder operation as defined in ECMA-262-3, section 11.5.3
  // ("Applying the % Operator")
  public remainder(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate MultiplicativeExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate UnaryExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToNumber(Result(2)).
    const leftNum: number = this.toHostNumber(left);
    // 6. Call ToNumber(Result(4)).
    const rightNum: number = this.toHostNumber(right);
    // 7. Apply the specified operation (*, /, or %) to Result(5) and Result(6). See the notes
    //    below (11.5.1, 11.5.2, 11.5.3).
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftNum % rightNum);
  }

  // Implements the add operation as defined in ECMA-262-3, section 11.6.1
  // ("The Addition operator ( + )")
  public add(left: AvmValue, right: AvmValue): AvmString | AvmNumber {
    // 1. Evaluate AdditiveExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate MultiplicativeExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToPrimitive(Result(2)).
    const leftPrimitive: AvmPrimitive = this.toAvmPrimitive(left, undefined);
    // 6. Call ToPrimitive(Result(4)).
    const rightPrimitive: AvmPrimitive = this.toAvmPrimitive(right, undefined);
    // 7. If Type(Result(5)) is String _or_ Type(Result(6)) is String, go to
    //    step 12. (Note that this step differs from step 3 in the comparison
    //    algorithm for the relational operators, by using _or_ instead of
    //    _and_.)
    if (leftPrimitive.type === AvmValueType.String || rightPrimitive.type === AvmValueType.String) {
      // 12. Call ToString(Result(5)).
      const leftString: AvmString = this.toAvmString(leftPrimitive);
      // 13. Call ToString(Result(6)).
      const rightString: AvmString = this.toAvmString(rightPrimitive);
      // 14. Concatenate Result(12) followed by Result(13).
      const result: string = `${leftString.value}${rightString.value}`;
      // 15. Return Result(14).
      return AvmValue.fromHostString(result);
    } else {
      // 8. Call ToNumber(Result(5)).
      const leftNumber: AvmNumber = this.toAvmNumber(leftPrimitive);
      // 9. Call ToNumber(Result(6)).
      const rightNumber: AvmNumber = this.toAvmNumber(rightPrimitive);
      // 10. Apply the addition operation to Result(8) and Result(9). See the note below (11.6.3).
      const result: number = leftNumber.value + rightNumber.value;
      // 11. Return Result(10).
      return AvmValue.fromHostNumber(result);
    }
  }

  // Implements the subtraction operation as defined in ECMA-262-3, section 11.6.2
  // ("The Subtraction Operator ( - )")
  public subtract(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate AdditiveExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate MultiplicativeExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToNumber(Result(2)).
    const leftNum: number = this.toHostNumber(left);
    // 6. Call ToNumber(Result(4)).
    const rightNum: number = this.toHostNumber(right);
    // 7. Apply the subtraction operation to Result(5) and Result(6). See the note below (11.6.3).
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftNum - rightNum);
  }

  // Implements the left shift operation as defined in ECMA-262-3, section 11.7.1
  // ("The Left Shift Operator ( << )")
  public leftShift(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate ShiftExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate AdditiveExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToInt32(Result(2)).
    const leftSint32: Sint32 = this.toHostSint32(left);
    // 6. Call ToUint32(Result(4)).
    const rightUint32: Uint32 = this.toHostUint32(right);
    // 7. Mask out all but the least significant 5 bits of Result(6), that is, compute Result(6) & 0x1F.
    // 8. Left shift Result(5) by Result(7) bits. The result is a signed 32 bit integer.
    // 9. Return Result(8).
    return AvmValue.fromHostNumber(leftSint32 << rightUint32);
  }

  // Implements the signed right shift operation as defined in ECMA-262-3, section 11.7.2
  // ("The Signed Right Shift Operator ( >> )")
  public signedRightShift(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate ShiftExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate AdditiveExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToInt32(Result(2)).
    const leftSint32: Sint32 = this.toHostSint32(left);
    // 6. Call ToUint32(Result(4)).
    const rightUint32: Uint32 = this.toHostUint32(right);
    // 7. Mask out all but the least significant 5 bits of Result(6), that is, compute Result(6) & 0x1F.
    // 8. Perform sign-extending right shift of Result(5) by Result(7) bits. The most significant
    //    bit is propagated. The result is a signed 32 bit integer.
    // 9. Return Result(8).
    return AvmValue.fromHostNumber(leftSint32 >> rightUint32);
  }

  // Implements the unsigned right shift operation as defined in ECMA-262-3, section 11.7.3
  // ("The Unsigned Right Shift Operator ( >>> )")
  public unsignedRightShift(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate ShiftExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate AdditiveExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToInt32(Result(2)).
    const leftSint32: Sint32 = this.toHostSint32(left);
    // 6. Call ToUint32(Result(4)).
    const rightUint32: Uint32 = this.toHostUint32(right);
    // 7. Mask out all but the least significant 5 bits of Result(6), that is, compute Result(6) & 0x1F.
    // 8. Perform zero-filling right shift of Result(5) by Result(7) bits. Vacated bits are filled
    //    with zero. The result is an unsigned 32 bit integer.
    // 9. Return Result(8).
    return AvmValue.fromHostNumber(leftSint32 >>> rightUint32);
  }

  // Implements the instanceof operation as defined in ECMA-262-3, section 11.8.6
  // ("The instanceof operator")
  public instanceof(left: AvmValue, right: AvmValue): AvmBoolean {
    // 1. Evaluate RelationalExpression.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate ShiftExpression.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. If Result(4) is not an object, throw a TypeError exception.
    if (right.type !== AvmValueType.Object) {
      // Flash diverges from ES-262 here: it returns false instead of throwing
      return AVM_FALSE;
      // throw new Error("TypeError: Right side is not an object");
    }

    // 6. If Result(4) does not have a [[HasInstance]] method, throw a TypeError exception.
    if (right.external) {
      throw new Error("NotImplemented: instanceof on external");
    }
    if (right.callable === undefined) {
      throw new Error("TypeError: Right side is not callable");
    }

    // 7. Call the [[HasInstance]] method of Result(4) with parameter Result(2).
    // 8. Return Result(7).
    if (left.type !== AvmValueType.Object) {
      return AVM_FALSE;
    }
    if (left.external) {
      throw new Error("NotImplemented: instanceof on external");
    }
    const rightProto: AvmValue = this.getStringMember(right, "prototype");
    if (rightProto.type !== AvmValueType.Object) {
      throw new Error("TypeError: Right side has non-object prototype");
    }
    // TODO: Loop over prototype chain
    const cur: AvmObject | AvmNull = left.prototype;
    if (cur.type === AvmValueType.Null) {
      return AVM_FALSE;
    }
    if (cur === rightProto) {
      return AVM_TRUE;
    }
    return AVM_FALSE;
  }

  // Implements the equals operation as defined in ECMA-262-3, section 11.9.1
  // ("The Equals Operator ( == )")
  public equals(left: AvmValue, right: AvmValue): AvmBoolean {
    // > 1. Evaluate EqualityExpression.
    // > 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // > 3. Evaluate RelationalExpression.
    // > 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`
    // > 5. Perform the comparison Result(4) == Result(2). (see 11.9.3).
    // > 6. Return Result(5).
    return AvmValue.fromHostBoolean(this.abstractEquals(left, right));
  }

  // Implements the bitwise and operation as defined in ECMA-262-3, section 11.10
  public bitwiseAnd(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate A.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate B.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToInt32(Result(2)).
    const leftSint32: Sint32 = this.toHostSint32(left);
    // 5. Call ToInt32(Result(4)).
    const rightSint32: Sint32 = this.toHostSint32(right);
    // 7. Apply the bitwise operator @ to Result(5) and Result(6). The result is a signed 32 bit
    //    integer.
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftSint32 & rightSint32);
  }

  // Implements the bitwise xor operation as defined in ECMA-262-3, section 11.10
  public bitwiseXor(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate A.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate B.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToInt32(Result(2)).
    const leftSint32: Sint32 = this.toHostSint32(left);
    // 5. Call ToInt32(Result(4)).
    const rightSint32: Sint32 = this.toHostSint32(right);
    // 7. Apply the bitwise operator @ to Result(5) and Result(6). The result is a signed 32 bit
    //    integer.
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftSint32 ^ rightSint32);
  }

  // Implements the bitwise or operation as defined in ECMA-262-3, section 11.10
  public bitwiseOr(left: AvmValue, right: AvmValue): AvmNumber {
    // 1. Evaluate A.
    // 2. Call GetValue(Result(1)).
    // `left` := `Result(2)`
    // 3. Evaluate B.
    // 4. Call GetValue(Result(3)).
    // `right` := `Result(4)`

    // 5. Call ToInt32(Result(2)).
    const leftSint32: Sint32 = this.toHostSint32(left);
    // 5. Call ToInt32(Result(4)).
    const rightSint32: Sint32 = this.toHostSint32(right);
    // 7. Apply the bitwise operator @ to Result(5) and Result(6). The result is a signed 32 bit
    //    integer.
    // 8. Return Result(7).
    return AvmValue.fromHostNumber(leftSint32 | rightSint32);
  }

  public strictEquals(left: AvmValue, right: AvmValue): AvmBoolean {
    return AvmValue.fromHostBoolean(this.abstractStrictEquals(left, right));
  }

  private call(
    callable: Callable,
    callType: CallType,
    thisArg: AvmObject | AvmUndefined,
    args: ReadonlyArray<AvmValue>,
  ): AvmCallResult {
    if (callable.type === CallableType.Host) {
      return callable.handler(HostCallContext.auto(this, callType, thisArg, args));
    }
    // assert: callable.type === CallableType.Avm
    const activation: FunctionActivation = new FunctionActivation(callable);
    const scope: FunctionScope = new FunctionScope(callable);

    const stack: AvmStack = new AvmStack();
    const registers: RegisterTable = new RegisterTable(callable.registerCount);
    // TODO: Check how the target changes across function calls
    const target: TargetId | null = callable.script.target;

    // Initialize scope and registers
    if (callable.thisState === ParameterState.Preload) {
      registers.set(1, thisArg);
    }
    for (const [i, param] of callable.parameters.entries()) {
      const value: AvmValue = i < args.length ? args[i] : AVM_UNDEFINED;
      if (param.register !== undefined) {
        registers.set(param.register, value);
      }
      scope.setLocal(this, param.name, value);
    }

    const ctx: ExecutionContext = new ExecutionContext(
      this.vm,
      this.budget,
      activation,
      scope,
      stack,
      registers,
      target,
      thisArg,
    );

    const flowResult: FlowResult = ctx.runCfg(callable.body);
    switch (flowResult.type) {
      case FlowResultType.Return: {
        // TODO: Improve return logic for constructors?
        return flowResult.value;
      }
      case FlowResultType.Simple: {
        // TODO: Assert null target
        return AVM_UNDEFINED;
      }
      case FlowResultType.Throw: {
        throw new AvmThrowSignal(flowResult.value);
      }
      default: {
        throw new Error(`UnexpectedCallFlowResultType: ${flowResult}`);
      }
    }
  }

  private abstractStrictEquals(left: AvmValue, right: AvmValue): boolean {
    if (left.type === right.type) {
      return this.abstractEquals(left, right);
    }
    return false;
  }

  // Implementation of the AbstractEquals algorithm from ECMA 262-3, section 11.9.3
  private abstractEquals(left: AvmValue, right: AvmValue): boolean {
    // | x   \   y | Undef | Null | Num         | Str              | Bool             | Obj |
    // | Undef     | true  | true |             |                  |                  |     |
    // | Null      | true  | true |             |                  |                  |     |
    // | Num       |       |      | eq          | x eq Num(y)      | x eq Num(y)      |     |
    // | Str       |       |      | Num(x) eq y | eq               | Num(x) eq Num(y) |     |
    // | Bool      |       |      | Num(x) eq y | Num(x) eq Num(y) | eq               |     |
    // | Obj       |       |      |             |                  |                  | eq  |

    // 1. If Type(x) is different from Type(y), go to step 14.
    if (left.type === right.type) {
      switch (left.type) {
        // 2. If Type(x) is Undefined, return true.
        case AvmValueType.Undefined:
          return true;
        // 3. If Type(x) is Null, return true.
        case AvmValueType.Null:
          return true;
        // 4. If Type(x) is not Number, go to step 11.
        case AvmValueType.Number:
          // 5. If x is NaN, return false.
          // 6. If y is NaN, return false.
          // 7. If x is the same number value as y, return true.
          // 8. If x is +0 and y is −0, return true.
          // 9. If x is −0 and y is +0, return true.
          // 10. Return false.
          return left.value === (right as AvmNumber).value;
        // 11. If Type(x) is String, then return true if x and y are exactly the same sequence of characters (same
        //     length and same characters in corresponding positions). Otherwise, return false.
        case AvmValueType.String:
          return left.value === (right as AvmString).value;
        // 12. If Type(x) is Boolean, return true if x and y are both true or both false. Otherwise, return false.
        case AvmValueType.Boolean:
          return left.value === (right as AvmBoolean).value;
        // 13. Return true if x and y refer to the same object or if they refer to objects joined to each
        //     other (see 13.1.2). Otherwise, return false.
        case AvmValueType.Object:
          // We do not use joined objects so a simple reference test is enough to check for
          // object equality.
          return left === right;
        default:
          throw new Error("Unexpected type");
      }
    } else {
      // 14. If x is null and y is undefined, return true.
      if (left.type === AvmValueType.Null && right.type === AvmValueType.Undefined) {
        return true;
      }
      // 15. If x is undefined and y is null, return true.
      if (left.type === AvmValueType.Undefined && right.type === AvmValueType.Null) {
        return true;
      }
      // 16. If Type(x) is Number and Type(y) is String,
      //     return the result of the comparison x == ToNumber(y).
      if (left.type === AvmValueType.Number && right.type === AvmValueType.String) {
        const rightNumber: AvmNumber = this.toAvmNumber(right);
        return left.value === rightNumber.value;
      }
      // 17. If Type(x) is String and Type(y) is Number,
      //     return the result of the comparison ToNumber(x) == y.
      if (left.type === AvmValueType.String && right.type === AvmValueType.Number) {
        const leftNumber: AvmNumber = this.toAvmNumber(left);
        return leftNumber.value === right.value;
      }
      // 18. If Type(x) is Boolean, return the result of the comparison ToNumber(x) == y.
      if (left.type === AvmValueType.Boolean) {
        const leftNumber: AvmNumber = this.toAvmNumber(left);
        return this.abstractEquals(leftNumber, right);
      }
      // 19. If Type(y) is Boolean, return the result of the comparison x == ToNumber(y).
      if (right.type === AvmValueType.Boolean) {
        const rightNumber: AvmNumber = this.toAvmNumber(right);
        return this.abstractEquals(left, rightNumber);
      }
      // 20. If Type(x) is either String or Number and Type(y) is Object,
      //     return the result of the comparison x == ToPrimitive(y).
      if (
        (left.type === AvmValueType.String || left.type === AvmValueType.Number)
        && right.type === AvmValueType.Object
      ) {
        const rightPrimitive: AvmValue = this.toAvmPrimitive(right, undefined);
        return this.abstractEquals(left, rightPrimitive);
      }
      // 21. If Type(x) is Object and Type(y) is either String or Number,
      // return the result of the comparison ToPrimitive(x) == y.
      if (
        left.type === AvmValueType.Object
        && (right.type === AvmValueType.String || right.type === AvmValueType.Number)
      ) {
        const leftPrimitive: AvmValue = this.toAvmPrimitive(left, undefined);
        return this.abstractEquals(leftPrimitive, right);
      }
      // 22. Return false.
      return false;
    }
  }
}
