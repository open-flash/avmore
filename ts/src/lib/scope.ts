import { AvmValue } from "./avm-value";

export type AvmScope = DynamicScope | StaticScope;

export enum ScopeType {
  Dynamic,
  Static,
}

/**
 * A scope backed by an object, as defined by the spec.
 *
 * Used as the `MovieClip` (root) scope, `with` statements, etc.
 */
export interface DynamicScope {
  readonly type: ScopeType.Dynamic;
  readonly container: AvmValue;
  readonly parent?: AvmScope;
  //
  // constructor(scope: AvmValue) {
  //   this.scope = scope;
  // }
  //
  // get(name: string, ectx: ExecutionContext): AvmValue | undefined {
  //   return ectx.vm.tryGetMember(this.scope, name);
  // }
  //
  // set(name: string, value: AvmValue, ectx: ExecutionContext): void {
  //   ectx.vm.setMember(this.scope, name, value);
  // }
}

/**
 * Optimized scope for static cases.
 *
 * Used for function scopes.
 */
export interface StaticScope {
  readonly type: ScopeType.Static;
  readonly variables: Map<string, AvmValue>;
  readonly parent?: AvmScope;

  // constructor() {
  //   this.scope = new Map();
  // }
  //
  // get(name: string): AvmValue | undefined {
  //   return this.scope.get(name);
  // }
  //
  // set(name: string, value: AvmValue): void {
  //   this.scope.set(name, value);
  // }
}
