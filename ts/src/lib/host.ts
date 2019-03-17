import { TargetId } from "./vm";

export interface Host {
  trace(message: string): void;

  getTarget(targetId: TargetId): Target | undefined;
}

export interface Target {
  stop(): void;
}

export class NativeHost implements Host {
  trace(message: string): void {
    console.log(message);
  }

  getTarget(): undefined {
    return;
  }
}

export class NoopHost implements Host {
  trace(): void {
  }

  getTarget(): undefined {
    return;
  }
}

export class LoggedHost implements Host {
  public readonly logs: string[];

  constructor() {
    this.logs = [];
  }

  trace(message: string): void {
    this.logs.push(message);
  }

  getTarget(): undefined {
    return;
  }
}
