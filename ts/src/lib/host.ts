export interface Host {
  trace(message: string): void;
}

export class NativeHost implements Host {
  trace(message: string): void {
    console.log(message);
  }
}

export class NoopHost implements Host {
  trace(): void {
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
}
