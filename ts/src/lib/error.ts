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
