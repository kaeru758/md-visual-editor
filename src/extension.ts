import * as vscode from 'vscode';
import { MarkdownVisualEditorProvider } from './markdownVisualEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    MarkdownVisualEditorProvider.register(context)
  );
}

export function deactivate() {}
