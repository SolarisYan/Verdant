import {
  ILayoutRestorer,
  JupyterLab,
  JupyterLabPlugin
} from "@jupyterlab/application";

import { IEditorServices } from "@jupyterlab/codeeditor";

import { IRenderMimeRegistry } from "@jupyterlab/rendermime";

import { IDocumentManager } from "@jupyterlab/docmanager";

import { NotebookPanel } from "@jupyterlab/notebook";

import { FileManager } from "./file-manager";

import { StackedPanel } from "@phosphor/widgets";

import * as renderers from "@jupyterlab/rendermime";

import "../style/index.css";
import "../style/ghost-book.css";
import "../style/cell-history.css";
import "../style/inspect.css";
import "../style/run-history.css";
import "../style/verdant-panel.css";

import { ASTGenerate } from "./analysis/ast-generate";

import { DocumentRegistry } from "@jupyterlab/docregistry";

import { NotebookListen } from "./jupyter-hooks/notebook-listen";

import { HistoryModel } from "./model/history";

import { VerdantPanel } from "./panel/verdant-panel";

import { GhostBookFactory, GhostBookPanel } from "./ghost-book/ghost-model";

import { RenderBaby } from "./jupyter-hooks/render-baby";

/**
 * Initialization data for the Verdant extension.
 */
const extension: JupyterLabPlugin<void> = {
  id: "Verdant",
  activate: (
    app: JupyterLab,
    restorer: ILayoutRestorer,
    docManager: IDocumentManager,
    rendermime: IRenderMimeRegistry,
    latexTypesetter: renderers.ILatexTypesetter,
    contentFactory: NotebookPanel.IContentFactory,
    editorServices: IEditorServices
  ) => {
    const { shell } = app;
    const panel = new StackedPanel();
    var activePanel: NotebookPanel;
    const linkHandler = {
      handleLink: (node: HTMLElement, path: string) => {
        app.commandLinker.connectNode(node, "docmanager:open", { path: path });
      }
    };
    const fileManager = new FileManager(docManager);
    var notebook: NotebookListen;
    const renderBaby = new RenderBaby(rendermime, latexTypesetter, linkHandler);
    const model = new HistoryModel(renderBaby, fileManager);
    const astUtils = new ASTGenerate(model);
    const ghostFactory = GhostBookFactory.registerFileType(
      app.docRegistry as DocumentRegistry,
      restorer,
      rendermime,
      contentFactory,
      editorServices
    );
    console.log("created ghost factory", ghostFactory);

    restorer.add(panel, "v-VerdantPanel");
    panel.id = "v-VerdantPanel";
    panel.title.label = "History";
    const verdantPanel = new VerdantPanel(model);
    panel.addWidget(verdantPanel);

    shell.addToLeftArea(panel, { rank: 600 });

    app.restored.then(() => {
      const populate = () => {
        var widg = shell.currentWidget;
        if (widg instanceof NotebookPanel) {
          //verdantPanel.onNotebookSwitch(widg);
          if (!activePanel || activePanel !== widg) {
            activePanel = widg;
            notebook = new NotebookListen(activePanel, astUtils, model);
            notebook.ready.then(() => {
              console.log("Notebook is ready");
            });
          }
        } else if (widg instanceof GhostBookPanel) {
          verdantPanel.ghostBookOpened(widg);
        }
      };

      // Connect signal handlers.
      shell.layoutModified.connect(() => {
        populate();
      });

      // Populate the tab manager.
      populate();
    });
  },
  autoStart: true,
  requires: [
    ILayoutRestorer,
    IDocumentManager,
    IRenderMimeRegistry,
    renderers.ILatexTypesetter,
    NotebookPanel.IContentFactory,
    IEditorServices
  ]
};

export default extension;
