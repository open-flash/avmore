import { NullableCfgLabel } from "avm1-types/cfg-label";
import { AvmValue } from "./avm-value";

export type FlowResult = FlowReturn | FlowSimple | FlowThrow;

export enum FlowResultType {
  Return,
  Simple,
  Throw,
}

export interface FlowReturn {
  type: FlowResultType.Return;
  value: AvmValue;
}

export interface FlowSimple {
  type: FlowResultType.Simple;
  target: NullableCfgLabel;
}

export interface FlowThrow {
  type: FlowResultType.Throw;
  value: AvmValue;
}
