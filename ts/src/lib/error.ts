export class ReferenceToUndeclaredVariableWarning {
  public readonly variable: string;

  constructor(variable: string) {
    this.variable = variable;
  }

  toString(): string {
    return `Warning: Reference to undeclared variable, '${this.variable}'`;
  }
}
