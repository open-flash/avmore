import { UintSize } from "semantic-types";
import { AvmObject, AvmUndefined } from "./avm-value";
import { TargetId } from "./vm";

export interface Host {
  trace(message: string): void;

  warn(error: any): void;

  getTarget(targetId: TargetId): Target | undefined;
}

export interface Target {
  // `this` value to use for the scripts executed with this target
  getThis(): AvmObject | AvmUndefined;

  stop(): void;

  play(): void;

  gotoFrame(frameIndex: UintSize): void;

  getFrameLoadingProgress(): { loaded: UintSize; total: UintSize };
}

export class NativeHost implements Host {
  trace(message: string): void {
    console.log(message);
  }

  warn(error: string): void {
    console.warn(String(error));
  }

  getTarget(): undefined {
    return;
  }
}

export class NoopHost implements Host {
  trace(): void {
  }

  warn(): void {
  }

  getTarget(): undefined {
    return;
  }
}

export class LoggedHost implements Host {
  public readonly logs: string[];
  public readonly targets: Map<UintSize, LoggedTarget>;

  constructor() {
    this.logs = [];
    this.targets = new Map();
  }

  trace(message: string): void {
    this.logs.push(message);
  }

  warn(error: any): void {
    this.logs.push(String(error));
  }

  getTarget(targetId: TargetId): LoggedTarget | undefined {
    return this.targets.get(targetId);
  }

  createTarget(thisArg: AvmObject | AvmUndefined): TargetId {
    const id: TargetId = this.targets.size;
    this.targets.set(id, new LoggedTarget(thisArg));
    return id;
  }
}

export class LoggedTarget implements Target {
  public readonly logs: string[];
  public readonly thisArg: AvmObject | AvmUndefined;

  constructor(thisArg: AvmObject | AvmUndefined) {
    this.logs = [];
    this.thisArg = thisArg;
  }

  // `this` value to use for the scripts executed with this target
  getThis(): AvmObject | AvmUndefined {
    return this.thisArg;
  }

  stop(): void {
    this.logs.push("stop");
  }

  play(): void {
    this.logs.push("play");
  }

  gotoFrame(frameIndex: UintSize): void {
    this.logs.push(`gotoFrame: ${frameIndex}`);
  }

  getFrameLoadingProgress(): { loaded: UintSize; total: UintSize } {
    return {loaded: 1, total: 4};
  }
}
