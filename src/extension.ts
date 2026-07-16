import * as vscode from 'vscode';
import { MarkdownVisualEditorProvider } from './markdownVisualEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    MarkdownVisualEditorProvider.register(context)
  );

  // Switch from the plain text editor back to the visual editor. Contributed
  // as an editor-title button for .md files so the round-trip is one click
  // (the visual editor already has the 📝 button for the other direction).
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'mdVisualEditor.openVisualEditor',
      async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target) {
          vscode.window.showWarningMessage('アクティブな Markdown ファイルが見つかりません。');
          return;
        }
        await vscode.commands.executeCommand(
          'vscode.openWith',
          target,
          MarkdownVisualEditorProvider.viewType
        );
      }
    )
  );
}

export function deactivate() {}
