import { CellListen } from "../jupyter-hooks/cell-listen";

import { CodeCell } from "@jupyterlab/cells";

import { HistoryModel } from "./history";

import {
  serialized_NodeyOutput,
  serialized_Nodey,
  serialized_NodeyCode,
  serialized_NodeyMarkdown,
  serialized_NodeyCodeCell
} from "../file-manager";

export abstract class Nodey {
  private node_id: number; //id for this node
  private version_id: any; //chronological number
  run: number[] = []; //id marking which run
  pendingUpdate: string;
  parent: string; //lookup id for the parent Nodey of this Nodey
  star: number = -1;
  note: number = -1;

  constructor(options: { [id: string]: any }) {
    this.node_id = options.id;
    this.run = options.run || [];
    this.parent = options.parent;
  }

  get name(): string {
    return this.node_id + "." + this.version_id;
  }

  get id(): any {
    return this.node_id;
  }

  set id(val: any) {
    this.node_id = val;
  }

  get version(): any {
    return this.version_id;
  }

  set version(verNum: any) {
    this.version_id = verNum;
  }

  /*
  * In case there's many runs, check the most recent first
  */
  public changedAt(run: number) {
    for (var i = this.run.length - 1; i > -1; i--) {
      if (i == run) return true;
      if (i < run) return false;
    }
  }

  abstract clone(): Nodey;

  abstract toJSON(): serialized_Nodey;

  abstract get typeName(): string;
}

/*
*  does not do anything. For syntax punctuation and new lines only
*/
export class SyntaxToken {
  tokens: string;

  constructor(tokens: string) {
    this.tokens = tokens;
  }

  toJSON(): { [id: string]: any } {
    return { syntok: this.tokens };
  }
}

export namespace SyntaxToken {
  export const KEY = "syntok";
}

export class NodeyOutput extends Nodey {
  dependsOn: Nodey[];
  raw: { [id: string]: any };

  constructor(options: { [id: string]: any }) {
    super(options);
    this.raw = options["raw"]; // note for different output types, the data is all named differently
    this.dependsOn = options["dependsOn"];
  }

  static EMPTY() {
    return new NodeyOutput({ raw: {}, dependsOn: [] });
  }

  clone(): Nodey {
    return new NodeyOutput({
      dependsOn: this.dependsOn,
      raw: this.raw,
      id: this.id,
      parent: this.parent
    });
  }

  toJSON(): serialized_NodeyOutput {
    return {
      parent: this.parent,
      typeName: "output",
      raw: this.raw,
      runs: this.run
    };
  }

  get typeName(): string {
    return "output";
  }
}

export class NodeyCode extends Nodey {
  type: string;
  output: string[] = [];
  content: any[];
  start: { line: number; ch: number };
  end: { line: number; ch: number };
  literal: any;
  right: string; // lookup id for the next Nodey to the right of this one

  constructor(options: { [id: string]: any }) {
    super(options);
    this.type = options.type;
    this.content = options.content;
    this.output = options.output || [];
    this.literal = options.literal;
    this.start = options.start;
    this.end = options.end;
    this.right = options.right;
  }

  positionRelativeTo(target: NodeyCode) {
    //may run into historical targets that do not have position info
    let myStart = this.start || { line: 0, ch: 0 };
    if (target.start && target.end) {
      var deltaLine = Math.max(target.start.line - myStart.line, 0);
      var deltaCh = Math.max(target.start.ch - myStart.ch, 0);
      this.start = {
        line: deltaLine + this.start.line,
        ch: deltaCh + this.start.ch
      };
      this.end = { line: deltaLine + this.end.line, ch: deltaCh + this.end.ch };
    }
  }

  public hasChild(name: string) {
    return this.content.find(
      item => item instanceof SyntaxToken === false && item === name
    );
  }

  getOutput(): string[] {
    return this.output;
  }

  addOutput(name: string) {
    this.output.push(name);
  }

  getChildren() {
    if (!this.content || this.content.length === 0) return [];
    return this.content.filter(item => !(item instanceof SyntaxToken));
  }

  toJSON(): serialized_NodeyCode {
    var jsn: serialized_NodeyCode = {
      typeName: "code",
      parent: this.parent,
      right: this.right,
      type: this.type,
      runs: this.run
    };
    if (this.literal) jsn.literal = this.literal;
    if (this.output && this.output.length > 0) {
      jsn.output = this.output;
    }
    if (this.content && this.content.length > 0)
      jsn.content = this.content.map(item => {
        if (item instanceof SyntaxToken) return item.toJSON();
        return item;
      });

    return jsn;
  }

  clone(): Nodey {
    var content = null;
    if (this.content) content = this.content.slice(0);
    //really important to slice the content array or it references, instead of copies, the list
    return new NodeyCode({
      type: this.type,
      content: content,
      literal: this.literal,
      start: this.start,
      end: this.end,
      right: this.right,
      id: this.id,
      parent: this.parent
    });
  }

  get typeName(): string {
    return "code";
  }

  static EMPTY() {
    return new NodeyCode({ type: "EMPTY", content: [] });
  }
}

/*
* Cell-level nodey
*/
export interface NodeyCell extends Nodey {
  cell: CellListen;
  starNodes: Nodey[];
}

export class NodeyCodeCell extends NodeyCode implements NodeyCell {
  cell: CellListen;
  starNodes: NodeyCode[] = [];

  constructor(options: { [id: string]: any }) {
    super(options);
    this.cell = options.cell;
    this.starNodes = options.starNodes || [];
  }

  clone(): Nodey {
    var content = null;
    var starNodes = null;
    if (this.content) content = this.content.slice(0);
    if (this.starNodes) starNodes = this.starNodes.slice(0);
    //really important to slice the content array or it references, instead of copies, the list
    return new NodeyCodeCell({
      type: this.type,
      content: content,
      starNodes: starNodes,
      literal: this.literal,
      start: this.start,
      end: this.end,
      right: this.right,
      id: this.id,
      parent: this.parent,
      cell: this.cell
    });
  }

  toJSON(): serialized_NodeyCodeCell {
    var jsn: serialized_NodeyCodeCell = super.toJSON();
    jsn.typeName = "codeCell";
    jsn.starNodes = this.starNodes;
    return jsn;
  }
}

export class NodeyMarkdown extends Nodey implements NodeyCell {
  markdown: string;
  cell: CellListen;
  starNodes: NodeyMarkdown[] = [];

  constructor(options: { [id: string]: any }) {
    super(options);
    this.cell = options.cell;
    this.markdown = options.markdown;
  }

  clone(): Nodey {
    return new NodeyMarkdown({
      markdown: this.markdown,
      id: this.id,
      parent: this.parent,
      cell: this.cell
    });
  }

  toJSON(): serialized_NodeyMarkdown {
    return {
      parent: this.parent,
      typeName: "markdown",
      markdown: this.markdown,
      runs: this.run
    };
  }

  get typeName(): string {
    return "markdown";
  }
}

/**
 * A namespace for Nodey statics.
 */
export namespace Nodey {
  export function fromJSON(dat: serialized_Nodey): Nodey {
    switch (dat.typeName) {
      case "code":
        var codedat = dat as serialized_NodeyCode;
        var content = codedat.content;
        if (content) {
          content = content.map(item => {
            if (typeof item === "string" || item instanceof String) return item;
            else return new SyntaxToken(item[SyntaxToken.KEY]);
          });
        }
        return new NodeyCode({
          type: codedat.type,
          content: content,
          output: codedat.output,
          literal: codedat.literal,
          right: codedat.right,
          parent: codedat.parent,
          run: codedat.runs
        });
      case "codeCell":
        var codedat = dat as serialized_NodeyCode;
        var content = codedat.content;
        if (content) {
          content = content.map(item => {
            if (typeof item === "string" || item instanceof String) return item;
            else return new SyntaxToken(item[SyntaxToken.KEY]);
          });
        }
        return new NodeyCodeCell({
          type: codedat.type,
          output: codedat.output,
          content: content,
          literal: codedat.literal,
          right: codedat.right,
          parent: codedat.parent,
          run: codedat.runs
        });
      case "markdown":
        var markdat = dat as serialized_NodeyMarkdown;
        return new NodeyMarkdown({
          markdown: markdat.markdown,
          parent: markdat.parent,
          run: markdat.runs
        });
      default:
        return;
    }
  }

  export function outputFromJSON(dat: serialized_NodeyOutput): NodeyOutput {
    return new NodeyOutput({
      raw: dat.raw,
      parent: dat.parent,
      run: dat.runs
    });
  }

  export function dictToCodeCellNodey(
    dict: { [id: string]: any },
    position: number,
    historyModel: HistoryModel,
    forceTie: string = null
  ) {
    if ("start" in dict === false) {
      dict.start = { line: 1, ch: 0 };
      dict.end = { line: 1, ch: 0 };
    }
    if ("type" in dict === false) {
      dict.type = "Module";
    }

    dict.start.line -= 1; // convert the coordinates of the range to code mirror style
    dict.end.line -= 1;
    dict.start.ch -= 1;
    dict.end.ch -= 1;

    var n = new NodeyCodeCell(dict);
    if (forceTie) {
      // only occurs when cells change type from code/markdown
      historyModel.registerTiedNodey(n, forceTie);
    } else historyModel.registerCellNodey(n, position);

    dictToCodeChildren(dict, historyModel, n);
    return n;
  }

  export function dictToCodeNodeys(
    dict: { [id: string]: any },
    historyModel: HistoryModel,
    prior: NodeyCode = null
  ): NodeyCode {
    dict.start.line -= 1; // convert the coordinates of the range to code mirror style
    dict.end.line -= 1;
    dict.start.ch -= 1;
    dict.end.ch -= 1;

    // give every node a nextNode so that we can shift/walk for repairs
    var n = new NodeyCode(dict);
    historyModel.registerNodey(n);

    if (prior) prior.right = n.name;

    dictToCodeChildren(dict, historyModel, n);
    return n;
  }

  function dictToCodeChildren(
    dict: { [id: string]: any },
    historyModel: HistoryModel,
    n: NodeyCode
  ) {
    var prior = null;
    n.content = [];
    for (var item in dict.content) {
      if (SyntaxToken.KEY in dict.content[item]) {
        n.content.push(new SyntaxToken(dict.content[item][SyntaxToken.KEY]));
      } else {
        var child = dictToCodeNodeys(dict.content[item], historyModel, prior);
        child.parent = n.name;
        if (prior) prior.right = child.name;
        n.content.push(child.name);
        prior = child;
      }
    }

    return n;
  }

  export function dictToMarkdownNodey(
    text: string,
    position: number,
    historyModel: HistoryModel,
    cell: CellListen,
    forceTie: string = null
  ) {
    var n = new NodeyMarkdown({ markdown: text, cell: cell });
    if (forceTie) {
      // only occurs when cells change type from code/markdown
      historyModel.registerTiedNodey(n, forceTie);
    } else historyModel.registerCellNodey(n, position);
    return n;
  }

  export function outputToNodey(
    cell: CodeCell,
    historyModel: HistoryModel,
    oldOutput: NodeyOutput[] = null,
    runId: number = -1
  ): string[] {
    let outarea = cell.outputArea;
    if (!outarea) return []; // no output!

    var output = cell.outputArea.model.toJSON();

    if (oldOutput) {
      // need to check if the output is different
      if (
        JSON.stringify(output) === JSON.stringify(oldOutput.map(out => out.raw))
      )
        return []; //outputs are the same don't bother
    }

    var outNode: string[] = [];

    if (output.length > 0) {
      for (var item in output) {
        var out = dictToOutputNodey(output[item], historyModel);
        if (runId !== -1) out.run.push(runId);
        outNode.push(out.name);
      }
    }
    return outNode;
  }

  function dictToOutputNodey(
    output: { [id: string]: any },
    historyModel: HistoryModel
  ) {
    var n = new NodeyOutput({ raw: output });
    historyModel.registerOutputNodey(n);
    return n;
  }
}
