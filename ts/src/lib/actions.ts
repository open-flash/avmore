import { StoreRegister } from "avm1-tree/actions";
import { AVM_NULL, AVM_UNDEFINED, AvmString, AvmValue } from "./avm-value";
import { ActionContext } from "./context";

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
