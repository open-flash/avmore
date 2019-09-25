import { UintSize } from "semantic-types";
import { AVM_UNDEFINED, AvmString, AvmUndefined } from "./avm-value";

export class AvmConstantPool {
  private pool: ReadonlyArray<AvmString>;

  public constructor() {
    this.pool = [];
  }

  public set(pool: ReadonlyArray<AvmString>): void {
    this.pool = [...pool];
  }

  public get(index: UintSize): AvmString | AvmUndefined {
    // TODO: Warn on out-of-bound pool access?
    // TODO: Mimick unitialized pool with the values used by Adobe's player?
    return index < this.pool.length ? this.pool[index] : AVM_UNDEFINED;
  }
}
