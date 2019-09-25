import { Cfg } from "avm1-tree/cfg";
import { CfgBlock } from "avm1-tree/cfg-block";
import { CfgLabel } from "avm1-tree/cfg-label";
import { AvmValue } from "./avm-value";
import { MovieId, TargetId } from "./vm";

export type Avm1ScriptId = number;

export interface Avm1Script {
  /**
   * ID uniquely identifying this script relative to the VM that created it.
   */
  readonly id: Avm1ScriptId;

  /**
   * Raw AVM1 bytes corresponding to this script.
   */
  readonly bytes: Uint8Array;

  /**
   * Control Flow Graph as a table.
   */
  readonly cfgTable: CfgTable;

  /**
   * Movie owning this script, for movie-wide context such as constant pools.
   */
  readonly movie: MovieId | null;

  /**
   * Target (e.g. MovieClip) owning this script.
   *
   * Used for contextual actions such as `gotoAndPlay` or `stop`.
   * Value used for `setTarget("");`
   */
  readonly target: TargetId | null;

  /**
   * Object to use as the root scope (dynamic scope) or `null` to use a static scope.
   */
  readonly rootScope: AvmValue | null;
}

// TODO: Do not recompute table for the same CFG
export class CfgTable {
  // `undefined` means the block is a no-op.
  readonly entryBlock: CfgBlock | undefined;
  readonly labelToBlock: ReadonlyMap<CfgLabel, CfgBlock>;

  constructor(cfg: Cfg) {
    const labelToBlock: Map<CfgLabel, CfgBlock> = new Map();
    for (const block of cfg.blocks) {
      labelToBlock.set(block.label, block);
    }
    this.entryBlock = cfg.blocks.length > 0 ? cfg.blocks[0] : undefined;
    this.labelToBlock = labelToBlock;
  }
}
