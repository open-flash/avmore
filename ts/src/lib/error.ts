export class ReferenceToUndeclaredVariableWarning {
  public readonly variable: string;

  constructor(variable: string) {
    this.variable = variable;
  }

  toString(): string {
    return `Warning: Reference to undeclared variable, '${this.variable}'`;
  }
}

export class TargetHasNoPropertyWarning {
  public readonly targetName: string;
  public readonly propertyName: string;

  constructor(targetName: string, propertyName: string) {
    this.targetName = targetName;
    this.propertyName = propertyName;
  }

  toString(): string {
    return `Warning: '${this.targetName}' has no property '${this.propertyName}'`;
  }
}

export class CorruptDataWarning {
  constructor() {}

  toString(): string {
    return "Warning: Failed to parse corrupt data.";
  }
}

export class UncaughtException {
  public readonly valueString: string;

  constructor(valueString: string) {
    this.valueString = valueString;
  }

  toString(): string {
    return `Warning: Uncaught exception, ${this.valueString}`;
  }
}
