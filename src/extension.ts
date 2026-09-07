import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extractStateVariables, findStorageCollisions } from './storageLayout';

const execFileAsync = promisify(execFile);

let diagnostics: vscode.DiagnosticCollection;

async function readGitBaseline(workspaceRoot: string, relativePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['show', `HEAD:${relativePath}`], { cwd: workspaceRoot, maxBuffer: 10_000_000 });
    return stdout;
  } catch {
    return null;
  }
}

async function checkStorageCollisions(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showErrorMessage('Proxy Storage Collision Companion: open a .sol file first.');
    return;
  }
  const document = editor.document;
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) {
    void vscode.window.showErrorMessage('Proxy Storage Collision Companion: file is not inside an open workspace folder.');
    return;
  }

  const relativePath = vscode.workspace.asRelativePath(document.uri, false);
  const baselineText = await readGitBaseline(folder.uri.fsPath, relativePath);
  if (baselineText === null) {
    void vscode.window.showInformationMessage(
      'Proxy Storage Collision Companion: no git HEAD version of this file found -- nothing to compare against.',
    );
    diagnostics.delete(document.uri);
    return;
  }

  const before = extractStateVariables(baselineText);
  const after = extractStateVariables(document.getText());
  const collisions = findStorageCollisions(before, after);

  if (collisions.length === 0) {
    diagnostics.delete(document.uri);
    void vscode.window.showInformationMessage('Proxy Storage Collision Companion: no storage layout collisions vs. git HEAD.');
    return;
  }

  const diags = collisions.map((collision) => {
    const range = new vscode.Range(0, 0, 0, Number.MAX_SAFE_INTEGER);
    const diagnostic = new vscode.Diagnostic(range, `Storage layout collision: ${collision.reason}`, vscode.DiagnosticSeverity.Error);
    diagnostic.source = 'Proxy Storage Collision Companion';
    return diagnostic;
  });
  diagnostics.set(document.uri, diags);
}

export function activate(context: vscode.ExtensionContext): void {
  diagnostics = vscode.languages.createDiagnosticCollection('proxyStorageCollisionCompanion');
  context.subscriptions.push(diagnostics);

  context.subscriptions.push(
    vscode.commands.registerCommand('proxyStorageCollisionCompanion.check', () => void checkStorageCollisions()),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
  );
}

export function deactivate(): void {
  diagnostics?.dispose();
}
