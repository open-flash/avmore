// tslint:disable:max-classes-per-file max-file-line-count

import { cfgFromBytes } from "avm1-parser";
import {
  AvmExternalHandler,
  AvmExternalObject,
  AvmNull,
  AvmObject,
  AvmSimpleObject,
  AvmValue,
  AvmValueType,
} from "./avm-value";
import { AvmConstantPool } from "./constant-pool";
import { BaseContext, RunBudget } from "./context";
import { ExecutionContext } from "./execution-context";
import { AvmFunction } from "./function";
import { Host } from "./host";
import { createRealm, Realm } from "./realm";
import { NatRootRuntime } from "./runtime";
import { Avm1Script, Avm1ScriptId, CfgTable } from "./script";

export type TargetId = number;
export type MovieId = number;

export class Vm {
  public readonly realm: Realm;
  public readonly host: Host;
  public readonly constantPool: AvmConstantPool;
  public readonly swfVersion: number;

  private nextScriptId: number;
  private readonly scriptsById: Map<Avm1ScriptId, Avm1Script>;

  constructor(host: Host) {
    this.realm = createRealm();
    this.host = host;
    this.nextScriptId = 0;
    this.scriptsById = new Map();
    this.constantPool = new AvmConstantPool();
    this.swfVersion = 8;
  }

  createAvm1Script(
    avm1Bytes: Uint8Array,
    target: TargetId | null,
    rootScope: AvmValue | null,
  ): Avm1ScriptId {
    const id: number = this.nextScriptId++;
    const movie: MovieId = 0;
    const cfgTable: CfgTable = new CfgTable(cfgFromBytes(avm1Bytes));
    const script: Avm1Script = {id, bytes: avm1Bytes, cfgTable, movie, target, rootScope};
    this.scriptsById.set(id, script);
    return id;
  }

  runToCompletion(scriptId: Avm1ScriptId, maxActions: number = 1000): void {
    const script: Avm1Script | undefined = this.scriptsById.get(scriptId);
    if (script === undefined) {
      throw new Error(`ScriptNotFound: ${scriptId}`);
    }
    const budget: RunBudget = {maxActions, totalActions: 0};
    ExecutionContext.runScript(this, budget, script);
  }

  public withContext<R = void>(fn: (ctx: BaseContext) => R): R {
    const budget: RunBudget = {maxActions: Infinity, totalActions: 0};
    return fn(new NatRootRuntime(this, budget));
  }

  public newExternal(handler: AvmExternalHandler): AvmExternalObject {
    return {
      type: AvmValueType.Object,
      external: true,
      handler,
    };
  }

  public newObject(proto?: AvmObject | AvmNull): AvmSimpleObject {
    return {
      type: AvmValueType.Object,
      external: false,
      class: "Object",
      prototype: proto !== undefined ? proto : this.realm.objectPrototype,
      ownProperties: new Map(),
    };
  }
}

abstract class BaseActivation {
  abstract getScript(): Avm1Script;
}

export class ScriptActivation extends BaseActivation {
  readonly script: Avm1Script;

  constructor(script: Avm1Script) {
    super();
    this.script = script;
  }

  getScript(): Avm1Script {
    return this.script;
  }
}

export class FunctionActivation extends BaseActivation {
  readonly func: AvmFunction;

  constructor(func: AvmFunction) {
    super();
    this.func = func;
  }

  getScript(): Avm1Script {
    return this.func.script;
  }
}

export type Activation = ScriptActivation | FunctionActivation;
