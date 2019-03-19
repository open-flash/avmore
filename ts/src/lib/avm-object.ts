// import { AVM_UNDEFINED, AvmValue } from "./avm-value";
//
// export interface AvmObjectProperty {
//   readonly value: AvmValue;
// }
//
// export class AvmObject {
//   ownProperties: Map<string, AvmObjectProperty>;
//
//   private constructor() {
//     this.ownProperties = new Map();
//   }
//
//   public static empty(): AvmObject {
//     return new AvmObject();
//   }
//
//   public get(key: string): AvmValue {
//     const prop: AvmObjectProperty | undefined = this.ownProperties.get(key);
//     return prop !== undefined ? prop.value : AVM_UNDEFINED;
//   }
//
//   public setProperty(key: string, value: AvmValue): void {
//     this.ownProperties.set(key, {value});
//   }
// }
