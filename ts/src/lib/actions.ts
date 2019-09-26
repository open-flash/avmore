import { ActionType } from "avm1-tree/action-type";
import { ConstantPool, GetUrl2, Push, StoreRegister } from "avm1-tree/actions";
import { CfgAction } from "avm1-tree/cfg-action";
import { CfgDefineFunction } from "avm1-tree/cfg-actions/cfg-define-function";
import { CfgDefineFunction2 } from "avm1-tree/cfg-actions/cfg-define-function2";
import { GetUrl2Method } from "avm1-tree/get-url2-method";
import { ValueType as AstValueType } from "avm1-tree/value-type";
import { Uint32, UintSize } from "semantic-types";
import { AVM_NULL, AVM_UNDEFINED, AvmSimpleObject, AvmString, AvmValue, AvmValueType } from "./avm-value";
import { ActionContext } from "./context";
import { AvmFunctionParameter, ParameterState } from "./function";
import { CfgTable } from "./script";

// tslint:disable-next-line:cyclomatic-complexity
export function action(ctx: ActionContext, action: CfgAction): void {
  switch (action.action) {
    case ActionType.Add2:
      add2(ctx);
      break;
    case ActionType.BitAnd:
      bitAnd(ctx);
      break;
    case ActionType.BitLShift:
      bitLShift(ctx);
      break;
    case ActionType.BitOr:
      bitOr(ctx);
      break;
    case ActionType.BitRShift:
      bitRShift(ctx);
      break;
    case ActionType.BitURShift:
      bitURShift(ctx);
      break;
    case ActionType.BitXor:
      bitXor(ctx);
      break;
    case ActionType.CallFunction:
      callFunction(ctx);
      break;
    case ActionType.ConstantPool:
      constantPool(ctx, action);
      break;
    case ActionType.Decrement:
      decrement(ctx);
      break;
    case ActionType.DefineFunction:
      defineFunction(ctx, action);
      break;
    case ActionType.DefineFunction2:
      defineFunction2(ctx, action);
      break;
    case ActionType.DefineLocal:
      defineLocal(ctx);
      break;
    case ActionType.DefineLocal2:
      defineLocal2(ctx);
      break;
    case ActionType.Divide:
      divide(ctx);
      break;
    case ActionType.Enumerate2:
      enumerate2(ctx);
      break;
    case ActionType.Equals2:
      equals2(ctx);
      break;
    case ActionType.Increment:
      increment(ctx);
      break;
    case ActionType.InitArray:
      initArray(ctx);
      break;
    case ActionType.InstanceOf:
      instanceOf(ctx);
      break;
    case ActionType.GetMember:
      getMember(ctx);
      break;
    case ActionType.GetProperty:
      getProperty(ctx);
      break;
    case ActionType.GetUrl2:
      getUrl2(ctx, action);
      break;
    case ActionType.GetVariable:
      getVariable(ctx);
      break;
    case ActionType.Modulo:
      modulo(ctx);
      break;
    case ActionType.Multiply:
      multiply(ctx);
      break;
    case ActionType.NewMethod:
      newMethod(ctx);
      break;
    case ActionType.NewObject:
      newObject(ctx);
      break;
    case ActionType.Pop:
      pop(ctx);
      break;
    case ActionType.Push:
      push(ctx, action);
      break;
    case ActionType.PushDuplicate:
      pushDuplicate(ctx);
      break;
    case ActionType.SetMember:
      setMember(ctx);
      break;
    case ActionType.SetVariable:
      setVariable(ctx);
      break;
    case ActionType.StoreRegister:
      storeRegister(ctx, action);
      break;
    case ActionType.Subtract:
      subtract(ctx);
      break;
    case ActionType.TypeOf:
      typeOf(ctx);
      break;
    default:
      console.error(action);
      throw new Error(`UnknownAction: ${action.action} (${ActionType[action.action]})`);
  }
}

export function add2(ctx: ActionContext): void {
  const right: AvmValue = ctx.pop();
  const left: AvmValue = ctx.pop();
  ctx.push(ctx.add(left, right));
}

export function bitAnd(ctx: ActionContext): void {
  const right: AvmValue = ctx.pop();
  const left: AvmValue = ctx.pop();
  ctx.push(ctx.bitwiseAnd(left, right));
}

export function bitLShift(ctx: ActionContext): void {
  const right: AvmValue = ctx.pop();
  const left: AvmValue = ctx.pop();
  ctx.push(ctx.leftShift(left, right));
}

export function bitOr(ctx: ActionContext): void {
  const right: AvmValue = ctx.pop();
  const left: AvmValue = ctx.pop();
  ctx.push(ctx.bitwiseOr(left, right));
}

export function bitRShift(ctx: ActionContext): void {
  const right: AvmValue = ctx.pop();
  const left: AvmValue = ctx.pop();
  ctx.push(ctx.signedRightShift(left, right));
}

export function bitURShift(ctx: ActionContext): void {
  const right: AvmValue = ctx.pop();
  const left: AvmValue = ctx.pop();
  ctx.push(ctx.unsignedRightShift(left, right));
}

export function bitXor(ctx: ActionContext): void {
  const right: AvmValue = ctx.pop();
  const left: AvmValue = ctx.pop();
  ctx.push(ctx.bitwiseXor(left, right));
}

export function callFunction(ctx: ActionContext): void {
  const fnName: string = ctx.toHostString(ctx.pop());
  const argCount: Uint32 = ctx.toHostUint32(ctx.pop());

  const args: AvmValue[] = [];
  for (let i: UintSize = 0; i < argCount; i++) {
    args.push(ctx.pop());
  }
  const fn: AvmValue = ctx.getVar(fnName);

  const result: AvmValue = ctx.apply(fn, AVM_UNDEFINED, []);

  ctx.push(result);
}

export function constantPool(ctx: ActionContext, action: ConstantPool): void {
  const pool: AvmString[] = [];
  for (const value of action.constantPool) {
    pool.push(AvmValue.fromHostString(value));
  }
  ctx.setConstantPool(pool);
}

export function decrement(ctx: ActionContext): void {
  const arg: number = ctx.toHostNumber(ctx.pop());
  ctx.push(AvmValue.fromHostNumber(arg - 1));
}

export function defineFunction(ctx: ActionContext, action: CfgDefineFunction): void {
  const name: string | undefined = action.name !== undefined && action.name.length > 0
    ? action.name
    : undefined;
  const registerCount: UintSize = 4;
  const parameters: AvmFunctionParameter[] = [];
  for (const name of action.parameters) {
    parameters.push({name});
  }
  const body: CfgTable = new CfgTable(action.body);

  const fn: AvmSimpleObject = ctx.createAvmFunction(
    name,
    registerCount,
    ParameterState.Default,
    ParameterState.Default,
    ParameterState.Default,
    false,
    false,
    false,
    parameters,
    body,
  );

  if (name !== undefined) {
    ctx.setLocal(name, fn);
  }
  ctx.push(fn);
}

export function defineFunction2(ctx: ActionContext, action: CfgDefineFunction2): void {
  const name: string | undefined = action.name !== undefined && action.name.length > 0
    ? action.name
    : undefined;
  const registerCount: UintSize = action.registerCount;
  const parameters: AvmFunctionParameter[] = [];
  for (const param of action.parameters) {
    parameters.push({name: param.name, register: param.register > 0 ? param.register : undefined});
  }
  const body: CfgTable = new CfgTable(action.body);

  const fn: AvmSimpleObject = ctx.createAvmFunction(
    name,
    registerCount,
    getParamState(action.preloadThis, action.suppressThis),
    getParamState(action.preloadArguments, action.preloadArguments),
    getParamState(action.preloadSuper, action.preloadSuper),
    action.preloadRoot,
    action.preloadParent,
    action.preloadGlobal,
    parameters,
    body,
  );

  if (name !== undefined) {
    ctx.setLocal(name, fn);
  }
  ctx.push(fn);

  function getParamState(preload: boolean, suppress: boolean) {
    if (preload) {
      return ParameterState.Preload;
    } else if (suppress) {
      return ParameterState.Suppress;
    } else {
      return ParameterState.Default;
    }
  }
}

export function defineLocal(ctx: ActionContext): void {
  const value: AvmValue = ctx.pop();
  const name: string = ctx.toHostString(ctx.pop());
  ctx.setLocal(name, value);
}

export function defineLocal2(ctx: ActionContext): void {
  const name: string = ctx.toHostString(ctx.pop());
  ctx.touchLocal(name);
}

export function divide(ctx: ActionContext): void {
  const right: AvmValue = ctx.pop();
  const left: AvmValue = ctx.pop();
  ctx.push(ctx.divide(left, right));
}

export function increment(ctx: ActionContext): void {
  const arg: number = ctx.toHostNumber(ctx.pop());
  ctx.push(AvmValue.fromHostNumber(arg + 1));
}

export function initArray(ctx: ActionContext): void {
  const len: number = ctx.toHostNumber(ctx.pop());

  const items: AvmValue[] = [];
  for (let i: UintSize = 0; i < len; i++) {
    items.push(ctx.pop());
  }

  ctx.push(ctx.initArray(items));
}

export function getMember(ctx: ActionContext): void {
  const key: AvmValue = ctx.pop();
  const target: AvmValue = ctx.pop();
  ctx.push(ctx.getMember(target, key));
}

const PROPERTY_INDEX_TO_KEY: ReadonlyMap<Uint32, string> = new Map([
  [0, "_X"],
  [1, "_Y"],
  [2, "_xscale"],
  [3, "_yscale"],
  [4, "_currentframe"],
  [5, "_totalframes"],
  [6, "_alpha"],
  [7, "_visible"],
  [8, "_width"],
  [9, "_height"],
  [10, "_rotation"],
  [11, "_target"],
  [12, "_framesloaded"],
  [13, "_name"],
  [14, "_droptarget"],
  [15, "_url"],
  [16, "_highquality"],
  [17, "_focusrect"],
  [18, "_soundbuftime"],
  [19, "_quality"],
  [20, "_xmouse"],
  [21, "_ymouse"],
]);

export function getProperty(ctx: ActionContext): void {
  const keyIndex: Uint32 = ctx.toHostUint32(ctx.pop());
  const target: AvmValue = ctx.pop();
  const key: string | undefined = PROPERTY_INDEX_TO_KEY.get(keyIndex);
  if (key === undefined) {
    throw new Error(`InvalidPropertyIndex: ${keyIndex}`);
  }
  ctx.push(ctx.getStringMember(target, key));
}

export function getUrl2(ctx: ActionContext, action: GetUrl2): void {
  const target: AvmValue = ctx.pop();
  const url: string = ctx.toHostString(ctx.pop());
  if (
    url === "FSCommand:quit"
    && target.type === AvmValueType.String
    && target.value === ""
    && action.method === GetUrl2Method.None
    && !action.loadTarget
    && !action.loadVariables
  ) {
    ctx.abort();
  }
  throw new Error("NotImplemented: GetUrl2");
}

export function getVariable(ctx: ActionContext): void {
  const name: string = ctx.toHostString(ctx.pop());
  const value: AvmValue = ctx.getVar(name);
  ctx.push(value);
}

export function enumerate2(ctx: ActionContext): void {
  const obj: AvmValue = ctx.pop();
  ctx.push(AVM_NULL);
  const keys: AvmString[] = ctx.getOwnKeys(obj);
  for (const key of keys) {
    ctx.push(key);
  }
}

export function equals2(ctx: ActionContext): void {
  const right: AvmValue = ctx.pop();
  const left: AvmValue = ctx.pop();
  ctx.push(ctx.equals(left, right));
}

export function instanceOf(ctx: ActionContext): void {
  const right: AvmValue = ctx.pop();
  const left: AvmValue = ctx.pop();
  ctx.push(ctx.instanceof(left, right));
}

export function modulo(ctx: ActionContext): void {
  const right: AvmValue = ctx.pop();
  const left: AvmValue = ctx.pop();
  ctx.push(ctx.remainder(left, right));
}

export function multiply(ctx: ActionContext): void {
  const right: AvmValue = ctx.pop();
  const left: AvmValue = ctx.pop();
  ctx.push(ctx.multiply(left, right));
}

export function newMethod(ctx: ActionContext): void {
  const key: string = ctx.toHostString(ctx.pop());
  const target: AvmValue = ctx.pop();
  const argCount: Uint32 = ctx.toHostUint32(ctx.pop());
  const args: AvmValue[] = [];
  for (let i: UintSize = 0; i < argCount; i++) {
    args.push(ctx.pop());
  }

  const fn: AvmValue = key !== ""
    ? ctx.getStringMember(target, key)
    : target;

  const result: AvmValue = ctx.construct(fn, args);
  ctx.push(result);
}

export function pop(ctx: ActionContext): void {
  ctx.pop();
}

export function push(ctx: ActionContext, action: Push): void {
  for (const value of action.values) {
    switch (value.type) {
      case AstValueType.Boolean:
        ctx.push(AvmValue.fromHostBoolean(value.value));
        break;
      case AstValueType.Constant:
        ctx.push(ctx.getConstant(value.value));
        break;
      case AstValueType.Float32:
        ctx.push(AvmValue.fromHostNumber(value.value));
        break;
      case AstValueType.Float64:
        ctx.push(AvmValue.fromHostNumber(value.value));
        break;
      case AstValueType.Null:
        ctx.push(AVM_NULL);
        break;
      case AstValueType.Register:
        ctx.push(ctx.getReg(value.value));
        break;
      case AstValueType.Sint32:
        ctx.push(AvmValue.fromHostNumber(value.value));
        break;
      case AstValueType.String:
        ctx.push(AvmValue.fromHostString(value.value));
        break;
      case AstValueType.Undefined:
        ctx.push(AVM_UNDEFINED);
        break;
      default:
        throw new Error(`UnexpectedPushValueType: ${value}`);
    }
  }
}

export function newObject(ctx: ActionContext): void {
  const fnName: string = ctx.toHostString(ctx.pop());
  const argCount: Uint32 = ctx.toHostUint32(ctx.pop());

  const args: AvmValue[] = [];
  for (let i: UintSize = 0; i < argCount; i++) {
    args.push(ctx.pop());
  }
  const fn: AvmValue = ctx.getVar(fnName);

  const result: AvmValue = ctx.construct(fn, args);

  ctx.push(result);
}

export function pushDuplicate(ctx: ActionContext): void {
  const top: AvmValue = ctx.pop();
  ctx.push(top);
  ctx.push(top);
}

export function setMember(ctx: ActionContext): void {
  const value: AvmValue = ctx.pop();
  const key: AvmValue = ctx.pop();
  const target: AvmValue = ctx.pop();
  ctx.setMember(target, key, value);
}

export function setVariable(ctx: ActionContext): void {
  const value: AvmValue = ctx.pop();
  const path: string = ctx.toAvmString(ctx.pop()).value;
  if (path.indexOf(":") >= 0) {
    throw new Error("NotImplemented: SetVariableInRemoteTarget");
  }
  ctx.setVar(path, value);
}

export function storeRegister(ctx: ActionContext, action: StoreRegister): void {
  const value: AvmValue = ctx.peek();
  ctx.setReg(action.register, value);
}

export function subtract(ctx: ActionContext): void {
  const right: AvmValue = ctx.pop();
  const left: AvmValue = ctx.pop();
  ctx.push(ctx.subtract(left, right));
}

export function typeOf(ctx: ActionContext): void {
  const value: AvmValue = ctx.pop();
  ctx.push(ctx.typeOf(value));
}
