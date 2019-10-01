import { AvmValue } from "./avm-value";

const SLOTS: WeakMap<AvmValue, WeakMap<NatSlot<any>, any>> = new WeakMap();

declare const NAT_SLOT_BRAND: unique symbol;
export interface NatSlot<T> {
  readonly description: string;
  [NAT_SLOT_BRAND]?(id: T): T;
}

export function createNatSlot<T>(description: string): NatSlot<T> {
  return {description};
}

export function getNatSlot<T>(target: AvmValue, slot: NatSlot<T>): T | undefined {
  const slots: WeakMap<NatSlot<any>, any> = getSlots(target);
  return slots.get(slot);
}

export function setNatSlot<T>(target: AvmValue, slot: NatSlot<T>, value: T): void {
  const slots: WeakMap<NatSlot<any>, any> = getSlots(target);
  slots.set(slot, value);
}

function getSlots(target: AvmValue): WeakMap<NatSlot<any>, any> {
  let slots: WeakMap<NatSlot<any>, any> | undefined = SLOTS.get(target);
  if (slots === undefined) {
    slots = new WeakMap();
    SLOTS.set(target, slots);
  }
  return slots;
}
