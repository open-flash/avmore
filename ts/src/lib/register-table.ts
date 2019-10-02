import { UintSize } from "semantic-types";
import { AVM_UNDEFINED, AvmValue } from "./avm-value";

export class RegisterTable {
  private readonly table: AvmValue[];

  constructor(size: UintSize = 4) {
    const table: AvmValue[] = [];
    for (let i: UintSize = 0; i < size; i++) {
      table.push(AVM_UNDEFINED);
    }
    this.table = table;
  }

  public set(regId: UintSize, value: AvmValue): void {
    if (regId < 0 || regId >= this.table.length) {
      throw new Error("InvalidRegisterId");
    }
    this.table[regId] = value;
  }

  public get(regId: UintSize): AvmValue {
    if (regId < 0 || regId >= this.table.length) {
      throw new Error("InvalidRegisterId");
    }
    return this.table[regId];
  }
}
