import { AVM_UNDEFINED, AvmValue } from "./avm-value";
import { StackContext } from "./context";

export class AvmStack implements StackContext {
  private readonly stack: AvmValue[];

  public constructor() {
    this.stack = [];
  }

  public push(value: AvmValue): void {
    this.stack.push(value);
  }

  public pop(): AvmValue {
    return this.stack.length > 0 ? this.stack.pop()! : AVM_UNDEFINED;
  }

  public peek(): AvmValue {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : AVM_UNDEFINED;
  }
}
