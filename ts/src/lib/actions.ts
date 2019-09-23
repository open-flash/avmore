import { AvmValue } from "./avm-value";
import { ActionContext } from "./context";

export function pop(ctx: ActionContext): void {
  ctx.pop();
}

export function pushDuplicate(ctx: ActionContext): void {
  const top: AvmValue = ctx.pop();
  ctx.push(top);
  ctx.push(top);
}
