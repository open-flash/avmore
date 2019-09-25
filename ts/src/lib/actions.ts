import { ActionType } from "avm1-tree/action-type";
import { StoreRegister } from "avm1-tree/actions";
import { CfgAction } from "avm1-tree/cfg-action";
import { AVM_NULL, AVM_UNDEFINED, AvmString, AvmValue } from "./avm-value";
import { ActionContext } from "./context";

export function action(ctx: ActionContext, action: CfgAction): void {
  switch (action.action) {
    case ActionType.Add2:
      add2(ctx);
      break;
    case ActionType.CallFunction:
      callFunction(ctx);
      break;
    case ActionType.DefineLocal:
      defineLocal(ctx);
      break;
    case ActionType.Enumerate2:
      enumerate2(ctx);
      break;
    case ActionType.GetMember:
      getMember(ctx);
      break;
    case ActionType.GetVariable:
      getVariable(ctx);
      break;
    case ActionType.NewObject:
      newObject(ctx);
      break;
    case ActionType.Pop:
      pop(ctx);
      break;
    case ActionType.PushDuplicate:
      pushDuplicate(ctx);
      break;
    case ActionType.SetVariable:
      setVariable(ctx);
      break;
    case ActionType.StoreRegister:
      storeRegister(ctx, action);
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

export function callFunction(ctx: ActionContext): void {
  const fnName: string = ctx.toHostString(ctx.pop());
  const argCount: number = ctx.toHostNumber(ctx.pop());

  if (argCount !== 0) {
    throw new Error("NotImplemented: CallFunction with arguments");
  }
  const fn: AvmValue = ctx.getVar(fnName);

  const result: AvmValue = ctx.apply(fn, AVM_UNDEFINED, []);

  ctx.push(result);
}

export function defineLocal(ctx: ActionContext): void {
  const value: AvmValue = ctx.pop();
  const name: string = ctx.toHostString(ctx.pop());
  ctx.localVar(name, value);
}

export function getMember(ctx: ActionContext): void {
  const key: AvmValue = ctx.pop();
  const target: AvmValue = ctx.pop();
  ctx.push(ctx.getMember(target, key));
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

export function pop(ctx: ActionContext): void {
  ctx.pop();
}

export function newObject(ctx: ActionContext): void {
  const fnName: string = ctx.toHostString(ctx.pop());
  const argCount: number = ctx.toHostNumber(ctx.pop());

  if (argCount !== 0) {
    throw new Error("NotImplemented: NewObject with arguments");
  }
  const fn: AvmValue = ctx.getVar(fnName);

  const result: AvmValue = ctx.construct(fn, []);

  ctx.push(result);
}

export function pushDuplicate(ctx: ActionContext): void {
  const top: AvmValue = ctx.pop();
  ctx.push(top);
  ctx.push(top);
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
