import {
  NotebookPanel, Notebook
} from '@jupyterlab/notebook';

import {
  Cell
} from '@jupyterlab/cells';

import {
  PromiseDelegate
} from '@phosphor/coreutils';

import {
  ASTUtils
} from './ast-utils';

import{
  CellListen
} from './cell-listen'


export
class NotebookListen
{
  notebook : Notebook; //the currently active notebook Verdant is working on
  notebookPanel : NotebookPanel
  astUtils : ASTUtils
  cells: CellListen[]


  constructor(notebookPanel : NotebookPanel, astUtils : ASTUtils){
    this.notebookPanel = notebookPanel
    this.astUtils = astUtils
    this.cells = []
    this.init()
  }

  get ready(): Promise<void> {
    return this._ready.promise
  }

  private async init()
  {
    await this.notebookPanel.ready
    this.notebook = this.notebookPanel.notebook
    await this.astUtils.ready

    var cellsReady : Promise<void>[] = []
    this.notebook.widgets.forEach( (item, index) => {
      if(item instanceof Cell)
      {
        var cell = new CellListen(item, this.astUtils)
        this.cells.push(cell)
        cellsReady.push(cell.ready)
      }
    })
    await Promise.all(cellsReady)
    console.log("Loaded Notebook", this.cells)
    this.listen()
    this._ready.resolve(undefined);
  }

  private listen()
  {
    this.notebook.activeCellChanged //TODO
  }

  private _ready = new PromiseDelegate<void>();
}
