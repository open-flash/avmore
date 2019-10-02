import { AvmValue } from "./avm-value";

export abstract class Signal {
}

// Wrapper for catchable AVM1 errors.
export class AvmThrowSignal extends Signal {
  public readonly value: AvmValue;

  constructor(value: AvmValue) {
    super();
    this.value = value;
  }
}

export class AbortSignal extends Signal {
  constructor() {
    super();
  }
}
