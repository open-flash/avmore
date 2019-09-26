import { AVM_UNDEFINED, AvmValue } from "./avm-value";
import { BaseContext } from "./context";
import { AvmFunction } from "./function";

export type Scope = DynamicScope | FunctionScope | StaticScope;

export enum ScopeType {
  // Object-backed dynamic scope
  Dynamic,
  // Static scope with support for dynamic arguments
  Function,
  // Fully static scope
  Static,
}

abstract class BaseScope {
  public abstract readonly type: ScopeType;

  protected readonly parent?: Scope;

  public getVar(ctx: BaseContext, varName: string): AvmValue | undefined {
    // tslint:disable-next-line:no-this-assignment
    let cur: BaseScope | undefined = this;
    while (cur !== undefined) {
      const value: AvmValue | undefined = cur.tryGetLocal(ctx, varName);
      if (value !== undefined) {
        return value;
      }
      cur = cur.parent;
    }
    return undefined;
  }

  public setVar(ctx: BaseContext, varName: string, value: AvmValue): void {
    // tslint:disable-next-line:no-this-assignment
    let cur: BaseScope | undefined = this;
    while (cur !== undefined) {
      const wasUpdated: boolean = cur.updateLocal(ctx, varName, value);
      if (wasUpdated) {
        return;
      }
      cur = cur.parent;
    }
    // Not found in the scope chain, set as local
    this.setLocal(ctx, varName, value);
  }

  // Ensures the local variable exists
  // If it already exists, don't do anything.
  // If it does not exist, initialize the local variable with `undefined`
  public touchLocal(ctx: BaseContext, varName: string): void {
    if (!this.hasLocal(ctx, varName)) {
      this.setLocal(ctx, varName, AVM_UNDEFINED);
    }
  }

  public abstract setLocal(ctx: BaseContext, varName: string, value: AvmValue): void;

  protected updateLocal(ctx: BaseContext, varName: string, value: AvmValue): boolean {
    if (this.hasLocal(ctx, varName)) {
      this.setLocal(ctx, varName, value);
      return true;
    } else {
      return false;
    }
  }

  protected abstract tryGetLocal(ctx: BaseContext, varName: string): AvmValue | undefined;

  protected abstract hasLocal(ctx: BaseContext, varName: string): boolean;
}

/**
 * A scope backed by an object, as defined by the spec.
 *
 * Used as the `MovieClip` (root) scope, `with` statements, etc.
 */
// TODO: Check how it interracts with `__resolve`, getters and prototype.
export class DynamicScope extends BaseScope {
  readonly type: ScopeType.Dynamic;
  readonly parent?: Scope;
  readonly target: AvmValue;

  constructor(target: AvmValue, parent: Scope | undefined) {
    super();
    this.type = ScopeType.Dynamic;
    this.parent = parent;
    this.target = target;
  }

  public setLocal(ctx: BaseContext, varName: string, value: AvmValue): void {
    return ctx.setStringMember(this.target, varName, value);
  }

  protected tryGetLocal(ctx: BaseContext, varName: string): AvmValue | undefined {
    return ctx.tryGetStringMember(this.target, varName);
  }

  protected hasLocal(ctx: BaseContext, varName: string): boolean {
    return ctx.tryGetStringMember(this.target, varName) !== undefined;
  }
}

export class FunctionScope extends BaseScope {
  readonly type: ScopeType.Function;
  readonly parent?: Scope;
  readonly variables: Map<string, AvmValue>;

  constructor(fn: AvmFunction) {
    super();
    this.type = ScopeType.Function;
    this.parent = fn.parentScope;
    this.variables = new Map();
  }

  public setLocal(_ctx: BaseContext, varName: string, value: AvmValue): void {
    // TODO: Update `arguments`
    this.variables.set(varName, value);
  }

  protected tryGetLocal(_ctx: BaseContext, varName: string): AvmValue | undefined {
    return this.variables.get(varName);
  }

  protected hasLocal(_ctx: BaseContext, varName: string): boolean {
    return this.variables.has(varName);
  }
}

/**
 * Optimized scope for static cases.
 *
 * Used for function scopes.
 */
export class StaticScope extends BaseScope {
  readonly type: ScopeType.Static;
  readonly parent?: Scope;
  readonly variables: Map<string, AvmValue>;

  constructor(parent: Scope | undefined) {
    super();
    this.type = ScopeType.Static;
    this.parent = parent;
    this.variables = new Map();
  }

  public setLocal(_ctx: BaseContext, varName: string, value: AvmValue): void {
    this.variables.set(varName, value);
  }

  protected tryGetLocal(_ctx: BaseContext, varName: string): AvmValue | undefined {
    return this.variables.get(varName);
  }

  protected hasLocal(_ctx: BaseContext, varName: string): boolean {
    return this.variables.has(varName);
  }
}
