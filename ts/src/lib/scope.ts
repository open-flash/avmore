import { AvmValue } from "./avm-value";
import { ExecutionContext } from "./vm";

export interface AvmScope {
  get(name: string, ectx: ExecutionContext): AvmValue | undefined;

  set(name: string, value: AvmValue, ectx: ExecutionContext): void;
}

// MovieClip scope, `with` statement
export class DynamicScope implements AvmScope {
  private readonly scope: AvmValue;

  constructor(scope: AvmValue) {
    this.scope = scope;
  }

  get(name: string, ectx: ExecutionContext): AvmValue | undefined {
    return ectx.vm.tryGetMember(this.scope, name);
  }

  set(name: string, value: AvmValue, ectx: ExecutionContext): void {
    return ectx.vm.setMember(this.scope, name, value);
  }
}

export class StaticScope implements AvmScope {
  private readonly scope: Map<string, AvmValue>;

  constructor() {
    this.scope = new Map();
  }

  get(name: string): AvmValue | undefined {
    return this.scope.get(name);
  }

  set(name: string, value: AvmValue): void {
    this.scope.set(name, value);
  }
}
