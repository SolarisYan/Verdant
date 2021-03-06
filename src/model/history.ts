import {
  Nodey,
  NodeyCell,
  NodeyCode,
  NodeyCodeCell,
  NodeyMarkdown,
  NodeyOutput,
  SyntaxToken
} from "./nodey";

import { Star } from "./star";

import * as levenshtein from "fast-levenshtein";

import { Notes } from "./notes";

import { ChangeType, RunModel } from "./run";

import { NotebookListen } from "../jupyter-hooks/notebook-listen";

import { RenderBaby } from "../jupyter-hooks/render-baby";

import { Inspect } from "../inspect";

import { FileManager } from "../file-manager";

import {
  serialized_NodeyHistory,
  serialized_Nodey,
  serialized_NodeyOutput
} from "../file-manager";

import { CodeCell } from "@jupyterlab/cells";

export class HistoryModel {
  constructor(renderBaby: RenderBaby, fileManager: FileManager) {
    this._inspector = new Inspect(this, renderBaby);
    this.fileManager = fileManager;
    this._runModel = new RunModel(this);
  }

  private _inspector: Inspect;
  readonly fileManager: FileManager;
  private _runModel: RunModel;
  private _notebook: NotebookListen;

  private _nodeyStore: NodeHistory[] = [];
  private _cellList: number[] = [];
  private _outputStore: NodeHistory[] = [];
  private _deletedCellList: number[] = [];
  private _starStore: Star[] = [];
  private _notesStore: Notes[] = [];

  public async init(): Promise<boolean> {
    // check if there is an existing history file for this notebook
    var data = await this.fileManager.loadFromFile(this._notebook);
    if (data) {
      var history = JSON.parse(data) as serialized_NodeyHistory;
      this.fromJSON(history);
      console.log("Historical Notebook is", this.dump());
      return true;
    }
    return false;
  }

  set notebook(notebook: NotebookListen) {
    this._notebook = notebook;
    this._inspector.notebook = this._notebook;
  }

  get notebook() {
    return this._notebook;
  }

  get inspector(): Inspect {
    return this._inspector;
  }

  get runModel(): RunModel {
    return this._runModel;
  }

  get cellList(): NodeyCell[] {
    return this._cellList.map(num => this.getNodeyCell(num));
  }

  get cellIndices(): number[] {
    return this._cellList;
  }

  get deletedCellIndices(): number[] {
    return this._deletedCellList;
  }

  public writeToFile() {
    this.fileManager.writeToFile(this.notebook, this);
  }

  public getVersionsFor(nodey: Nodey) {
    if (nodey instanceof NodeyOutput)
      return this._outputStore[parseInt(nodey.id)];
    return this._nodeyStore[parseInt(nodey.id)];
  }

  getNodeyHead(name: string): Nodey {
    let [id, ver, tag] = name.split(".");

    if (id === "*" && tag) {
      let cell = this.getNodeyCell(parseInt(ver));
      console.log("looking for a star node ", name, cell);
      return cell.starNodes[parseInt(tag) - 1];
    }

    let nodeHist = this._nodeyStore[parseInt(id)];
    return nodeHist.latest;
  }

  getNodeyCell(id: number): NodeyCell {
    //console.log("getting cell history ", id, this._cellList);
    let nodeHist = this._nodeyStore[id];
    return <NodeyCell>nodeHist.latest;
  }

  getNodey(name: string): Nodey {
    if (!name) return null;
    //console.log("attempting to find", name);
    let [id, ver, tag] = name.split(".");
    if (id === "*" && tag) {
      let cell = this.getNodeyCell(parseInt(ver));
      console.log("looking for a star node ", name, cell);
      return cell.starNodes[parseInt(tag) - 1];
    }

    if (ver === "*") return this._nodeyStore[parseInt(id)].starNodey;

    return this._nodeyStore[parseInt(id)].versions[parseInt(ver)];
  }

  getOutput(name: string): NodeyOutput {
    let [id, ver] = name.split(".");
    let nodeHist = this._outputStore[parseInt(id)];
    console.log("trying to find", id, ver, name);
    return nodeHist.versions[parseInt(ver)] as NodeyOutput;
  }

  getPriorVersion(nodey: Nodey, prior: number = -1) {
    let nodeHist;
    if (nodey instanceof NodeyOutput) {
      nodeHist = this._outputStore[nodey.id];
    } else {
      nodeHist = this._nodeyStore[nodey.id];
    }
    if (prior > -1) return nodeHist.versions[prior];
    if (nodey.version !== 0) return nodeHist.versions[nodey.version - 1];
  }

  handleCellRun(nodey: NodeyCell) {
    this._runModel.cellRun(nodey);
  }

  getStar(id: number) {
    return this._starStore[id];
  }

  getNote(id: number) {
    return this._notesStore[id];
  }

  public moveCell(old_pos: number, new_pos: number) {
    this._cellList.splice(new_pos, 0, this._cellList.splice(old_pos, 1)[0]);
  }

  public registerNote(text: string, target: any): Notes {
    let note = new Notes(target.name, target.constructor.name, text);
    console.log("CREATED NOTE", note);
    let id = this._notesStore.push(note) - 1;
    note.id = id;
    return note;
  }

  public registerStar(target: any): Star {
    let star = new Star(target.name, target.constructor.name);
    console.log("CREATED STAR", star);
    let id = this._starStore.push(star) - 1;
    star.id = id;
    return star;
  }

  public deRegisterStar(id: number) {
    this._starStore[id] = null;
  }

  public registerNodey(nodey: Nodey): void {
    let id = this._nodeyStore.push(new NodeHistory()) - 1;
    nodey.id = id;
    let version = this._nodeyStore[nodey.id].versions.push(nodey) - 1;
    nodey.version = version;
    return;
  }

  public registerTiedNodey(nodey: NodeyCell, forceTie: string): void {
    let oldNodey = this.getNodey(forceTie);
    let history = this.getVersionsFor(oldNodey);
    let version = history.versions.push(nodey) - 1;
    nodey.id = oldNodey.id;
    nodey.version = version;
    return;
  }

  public registerCellNodey(nodey: NodeyCell, position: number): void {
    this.registerNodey(nodey);
    if (this._cellList[position]) {
      // everybody got to shove over
      this._cellList.splice(position, 0, nodey.id);
    } else this._cellList[position] = nodey.id;
  }

  public registerOutputNodey(nodey: NodeyOutput) {
    let id = this._outputStore.push(new NodeHistory()) - 1;
    nodey.id = id;
    let version = this._outputStore[nodey.id].versions.push(nodey) - 1;
    nodey.version = version;

    return;
  }

  public clearCellStatus(cell: NodeyCell) {
    var status = cell.cell.status;
    if (status !== ChangeType.REMOVED) cell.cell.clearStatus();
    else {
      cell.cell.dispose();
      cell.cell = null;
      var index = this._cellList.indexOf(cell.id);
      this._cellList.splice(index, 1);
      this._deletedCellList.push(cell.id);
    }
  }

  public markAsEdited(unedited: NodeyCode): NodeyCode {
    if (unedited.id === "*") {
      //already a baby star node. has no history
      return unedited;
    }

    //otherwise, a normal node with a history
    let history = this.getVersionsFor(unedited);
    console.log("history of this node", history, unedited);
    if (!history.starNodey) {
      //newly entering star state!
      let nodey = history.versions[history.versions.length - 1];
      history.starNodey = nodey.clone();
      history.starNodey.version = "*";
      if (history.starNodey.parent) {
        console.log("parent is", history.starNodey.parent, history.starNodey);
        // star all the way up the chain
        let parent = this.getNodeyHead(history.starNodey.parent) as NodeyCode;
        var starParent = this.markAsEdited(parent);

        //finally, fix pointer names to be stars too
        history.starNodey.parent = starParent.name;
        starParent.content[starParent.content.indexOf(nodey.name)] =
          history.starNodey.name;
      }
    }
    return history.starNodey as NodeyCode;
  }

  public addStarNode(starNode: NodeyCode, relativeTo: NodeyCode): string {
    let cell = this.getCellParent(relativeTo);
    console.log("adding star node to", relativeTo, cell, starNode);
    cell.starNodes.push(starNode);
    let num = cell.starNodes.length;
    return cell.id + "." + num;
  }

  public getCellParent(relativeTo: NodeyCode): NodeyCodeCell {
    if (relativeTo instanceof NodeyCodeCell) return relativeTo;
    else if (relativeTo.parent)
      return this.getCellParent(this.getNodey(relativeTo.parent) as NodeyCode);
  }

  public commitChanges(cell: NodeyCell, runId: number) {
    console.log("Cell to commit is " + cell.name, cell, runId);
    if (cell instanceof NodeyCodeCell) {
      let output = this._commitOutput(cell, runId);
      console.log("Output committed", output);
      var newNode = this._commitCode(
        cell,
        runId,
        output,
        this._deStar.bind(this)
      ) as NodeyCodeCell;
      newNode.starNodes = [];
      return newNode;
    } else if (cell instanceof NodeyMarkdown) {
      return this._commitMarkdown(cell, runId);
    }
  }

  private _deStar(nodey: Nodey, runId: number, output: string[]) {
    let newNodey = nodey.clone();
    if (newNodey instanceof NodeyCode && output) {
      output.forEach(out => (newNodey as NodeyCode).addOutput(out));
    }
    newNodey.run.push(runId);
    this.registerNodey(newNodey);
    console.log("star node now ", newNodey);
    return newNodey;
  }

  private _commitMarkdown(nodey: NodeyMarkdown, runId: number) {
    let priorText = nodey.markdown;
    let cell = nodey.cell.cell;
    let score = 0;
    if (cell && cell.model) {
      //cell has not been deleted!
      let newText = cell.model.value.text;
      score = levenshtein.get(priorText, newText);
      if (score > 0) {
        nodey.cell.status = ChangeType.CHANGED;
        let history = this.getVersionsFor(nodey);
        let newNodey = nodey.clone() as NodeyMarkdown;
        newNodey.markdown = newText;
        history.starNodey = newNodey;
        return history.deStar(runId) as NodeyMarkdown;
      }
    }
    if (score === 0) {
      nodey.run.push(runId);
      return nodey;
    }
  }

  private _commitOutput(nodey: NodeyCodeCell, runId: number) {
    let oldOutput = nodey.getOutput();
    let oldRun = -1;
    let old = oldOutput.map(out => {
      let output = this.getOutput(out);
      if (oldRun < 0 || output.run.indexOf(oldRun) > -1) {
        return output;
      }
    });
    return Nodey.outputToNodey(nodey.cell.cell as CodeCell, this, old, runId);
  }

  private _commitCode(
    nodey: NodeyCode,
    runId: number,
    output: string[],
    starFactory: (x: NodeyCode, num: number, out: string[]) => NodeyCode,
    prior: NodeyCode = null
  ): NodeyCode {
    console.log("Commiting code", nodey);
    let newNodey: NodeyCode;
    if (nodey.id === "*") newNodey = starFactory(nodey, runId, output);
    else if (nodey.version === "*") {
      let history = this.getVersionsFor(nodey);
      newNodey = history.deStar(runId, output) as NodeyCode;
    } else {
      output.forEach(out => nodey.addOutput(out));
      return nodey; // nothing to change, stop update here
    }

    if (prior) prior.right = newNodey.name;
    prior = null;

    if (newNodey.content)
      newNodey.content.forEach((childName: any, index: number) => {
        if (!(childName instanceof SyntaxToken)) {
          //skip syntax tokens
          let [id, ver] = childName.split(".");
          let child = this.getNodey(childName) as NodeyCode;
          if (id === "*" || ver === "*") {
            // only update children that are changed
            console.log("getting " + childName, child);
            let newChild = this._commitCode(
              child,
              runId,
              output,
              starFactory,
              prior
            );
            newNodey.content[index] = newChild.name;
            newChild.parent = newNodey.name;
            if (prior) prior.right = newChild.name;
            prior = newChild;
          } else {
            child.run.push(runId);
            child.parent = newNodey.name;
            if (prior) prior.right = child.name;
            prior = child;
          }
        }
      });

    return newNodey;
  }

  private fromJSON(data: serialized_NodeyHistory) {
    this._runModel.fromJSON(data.runs);
    this._cellList = data.cells;
    data.nodey.map(item => {
      let id = item.nodey;
      var hist = new NodeHistory();
      item.versions.forEach(nodeDat => {
        var node: Nodey = Nodey.fromJSON(nodeDat);
        node.id = id;
        var ver = hist.versions.push(node) - 1;
        node.version = ver;
      });
      this._nodeyStore[id] = hist;
    });
    data.output.map(out => {
      let id = out.output;
      var hist = new NodeHistory();
      out.versions.forEach(nodeDat => {
        var node: Nodey = Nodey.outputFromJSON(nodeDat);
        node.id = id;
        var ver = hist.versions.push(node) - 1;
        node.version = ver;
      });
      this._outputStore[id] = hist;
    });
    this._deletedCellList = data.deletedCells;

    this._starStore = [];
    data.stars.forEach(item => {
      let star = Star.fromJSON(item);
      let index = this._starStore.push(star) - 1;
      star.id = index;
      let target: any = null;
      console.log("Trying to load star!", item, star);
      if (star.target_type === "Run")
        target = this.runModel.getRun(Number.parseInt(star.target));
      else if (star.target_type === "NodeyOutput")
        target = this.getOutput(star.target);
      else target = this.getNodey(star.target);
      target.star = index;
    });
    this._notesStore = [];
    data.notes.forEach(item => {
      let note = Notes.fromJSON(item);
      let index = this._notesStore.push(note) - 1;
      note.id = index;
      let target: any = null;
      if (note.target_type === "Run")
        target = this.runModel.getRun(Number.parseInt(note.target));
      else if (note.target_type === "NodeyOutput")
        target = this.getOutput(note.target);
      else target = this.getNodey(note.target);
      target.note = index;
    });
  }

  public toJSON(): serialized_NodeyHistory {
    var jsn = {
      runs: this._runModel.toJSON(),
      cells: this._cellList
    } as serialized_NodeyHistory;
    jsn["nodey"] = this._nodeyStore.map(
      (history: NodeHistory, index: number) => {
        if (history) {
          let versions = history.versions.map((item: Nodey) => item.toJSON());
          let nodey = index;
          return { nodey: nodey, versions: versions };
        }
      }
    ) as { nodey: number; versions: serialized_Nodey[] }[];
    jsn["output"] = this._outputStore.map(
      (history: NodeHistory, index: number) => {
        if (history) {
          let versions = history.versions.map((item: Nodey) => item.toJSON());
          let nodey = index;
          return { versions: versions, output: nodey };
        }
      }
    ) as { output: number; versions: serialized_NodeyOutput[] }[];
    jsn["deletedCells"] = this._deletedCellList;
    jsn["stars"] = this._starStore
      .filter(item => item !== null)
      .map(item => item.toJSON());
    jsn["notes"] = this._notesStore
      .filter(item => item !== null)
      .map(item => item.toJSON());
    return jsn;
  }

  dump(): void {
    //for debugging only
    console.log(
      "CELLS",
      this._cellList,
      "NODES",
      this._nodeyStore,
      "OUTPUT",
      this._outputStore,
      "DELETED CELLS",
      this._deletedCellList
    );
  }
}

/*
* Just a container for a list of nodey versions
*/
export class NodeHistory {
  versions: Nodey[] = [];
  starNodey: Nodey = null;

  get latest() {
    if (this.starNodey !== null) return this.starNodey;
    return this.versions[this.versions.length - 1];
  }

  deStar(runId: number, output: string[] = null) {
    console.log("HAS OUTPUT", output);
    let newNodey = this.starNodey.clone();
    newNodey.run.push(runId);
    if (newNodey instanceof NodeyCode && output) {
      output.forEach(out => (newNodey as NodeyCode).addOutput(out));
    }
    this.starNodey = null;
    this.versions.push(newNodey);
    newNodey.version = this.versions.length - 1;
    console.log("de-staring", newNodey, this);
    return newNodey;
  }
}
