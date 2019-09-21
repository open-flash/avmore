import { UintSize } from "semantic-types";
import { TargetId } from "./vm";

export interface Host {
  trace(message: string): void;

  warn(error: any): void;

  getTarget(targetId: TargetId): Target | undefined;
}

export interface Target {
  stop(): void;

  play(): void;

  gotoFrame(frameIndex: UintSize): void;

  getFrameLoadingProgress(): {loaded: UintSize; total: UintSize};
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

  constructor() {
    this.logs = [];
  }

  trace(message: string): void {
    this.logs.push(message);
  }

  warn(error: any): void {
    this.logs.push(String(error));
  }

  getTarget(): undefined {
    return;
  }
}
