"use strict";var x=Object.create;var d=Object.defineProperty;var g=Object.getOwnPropertyDescriptor;var f=Object.getOwnPropertyNames;var U=Object.getPrototypeOf,y=Object.prototype.hasOwnProperty;var k=(o,t)=>{for(var a in t)d(o,a,{get:t[a],enumerable:!0})},m=(o,t,a,l)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of f(t))!y.call(o,r)&&r!==a&&d(o,r,{get:()=>t[r],enumerable:!(l=g(t,r))||l.enumerable});return o};var w=(o,t,a)=>(a=o!=null?x(U(o)):{},m(t||!o||!o.__esModule?d(a,"default",{value:o,enumerable:!0}):a,o)),E=o=>m(d({},"__esModule",{value:!0}),o);var W={};k(W,{activate:()=>S,deactivate:()=>$});module.exports=E(W);var e=w(require("vscode")),b=class o{constructor(t){this.context=t}static{this.viewType="mdVisualEditor.markdownEditor"}static register(t){return e.window.registerCustomEditorProvider(o.viewType,new o(t),{webviewOptions:{retainContextWhenHidden:!0},supportsMultipleEditorsPerDocument:!1})}async resolveCustomTextEditor(t,a,l){a.webview.options={enableScripts:!0,localResourceRoots:[e.Uri.joinPath(this.context.extensionUri,"media"),e.Uri.joinPath(this.context.extensionUri,"node_modules")]},a.webview.html=this.getHtmlForWebview(a.webview);function r(){a.webview.postMessage({type:"update",text:t.getText()}),a.webview.postMessage({type:"saveStatus",dirty:t.isDirty})}let c=!1,u=a.webview.onDidReceiveMessage(async s=>{switch(s.type){case"edit":{c=!0;let i=new e.WorkspaceEdit,n=new e.Range(t.positionAt(0),t.positionAt(t.getText().length));i.replace(t.uri,n,s.text),await e.workspace.applyEdit(i),c=!1,a.webview.postMessage({type:"saveStatus",dirty:t.isDirty});break}case"ready":{r();break}case"openLink":{let i=String(s.href||"").trim();if(!i)break;try{if(/^[a-z][a-z0-9+.-]*:/i.test(i))/^(https?|mailto):/i.test(i)?await e.env.openExternal(e.Uri.parse(i)):await e.commands.executeCommand("vscode.open",e.Uri.parse(i));else{if(i.startsWith("#"))break;{let n=e.Uri.joinPath(t.uri,"..",i);await e.commands.executeCommand("vscode.open",n)}}}catch(n){let h=n instanceof Error?n.message:String(n);e.window.showWarningMessage(`\u30EA\u30F3\u30AF\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F: ${i}
\u7406\u7531: ${h}`)}break}case"openAsText":{await e.commands.executeCommand("vscode.openWith",t.uri,"default");break}case"undo":{await e.commands.executeCommand("undo");break}case"redo":{await e.commands.executeCommand("redo");break}}}),p=e.workspace.onDidChangeTextDocument(s=>{s.document.uri.toString()===t.uri.toString()&&!c&&r()}),v=e.workspace.onDidSaveTextDocument(s=>{s.uri.toString()===t.uri.toString()&&a.webview.postMessage({type:"saveStatus",dirty:!1})});a.onDidDispose(()=>{p.dispose(),v.dispose(),u.dispose()})}getHtmlForWebview(t){let a=C(),l=t.asWebviewUri(e.Uri.joinPath(this.context.extensionUri,"media","editor.js")),r=t.asWebviewUri(e.Uri.joinPath(this.context.extensionUri,"media","mermaid-visual-editor.js")),c=t.asWebviewUri(e.Uri.joinPath(this.context.extensionUri,"media","diagram-editors.js")),u=t.asWebviewUri(e.Uri.joinPath(this.context.extensionUri,"media","extra-diagram-editors.js")),p=t.asWebviewUri(e.Uri.joinPath(this.context.extensionUri,"media","editor.css")),v=t.asWebviewUri(e.Uri.joinPath(this.context.extensionUri,"node_modules","marked","marked.min.js")),s=t.asWebviewUri(e.Uri.joinPath(this.context.extensionUri,"node_modules","mermaid","dist","mermaid.min.js")),i=t.cspSource;return`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    img-src ${i} data: blob: https:;
    style-src ${i} 'unsafe-inline';
    script-src 'nonce-${a}' 'unsafe-eval';
    font-src ${i};
    worker-src ${i} blob:;
    connect-src ${i};
  ">
  <link href="${p}" rel="stylesheet">
  <title>Markdown Visual Editor</title>
</head>
<body>
  <div id="topbar">
    <div id="toolbar" role="toolbar" aria-label="\u66F8\u5F0F\u30C4\u30FC\u30EB\u30D0\u30FC">
      <div class="toolbar-group" role="group" aria-label="\u30A4\u30F3\u30E9\u30A4\u30F3\u66F8\u5F0F">
        <button class="toolbar-btn" data-action="bold" title="\u592A\u5B57" aria-label="\u592A\u5B57" aria-keyshortcuts="Control+B"><b>B</b></button>
        <button class="toolbar-btn" data-action="italic" title="\u659C\u4F53" aria-label="\u659C\u4F53" aria-keyshortcuts="Control+I"><i>I</i></button>
        <button class="toolbar-btn" data-action="strikethrough" title="\u53D6\u308A\u6D88\u3057\u7DDA" aria-label="\u53D6\u308A\u6D88\u3057\u7DDA"><s>S</s></button>
        <button class="toolbar-btn" data-action="code" title="\u30A4\u30F3\u30E9\u30A4\u30F3\u30B3\u30FC\u30C9" aria-label="\u30A4\u30F3\u30E9\u30A4\u30F3\u30B3\u30FC\u30C9">&lt;/&gt;</button>
      </div>
      <div class="toolbar-group" role="group" aria-label="\u898B\u51FA\u3057">
        <button class="toolbar-btn" data-action="h1" title="\u898B\u51FA\u30571" aria-label="\u898B\u51FA\u30571">H1</button>
        <button class="toolbar-btn" data-action="h2" title="\u898B\u51FA\u30572" aria-label="\u898B\u51FA\u30572">H2</button>
        <button class="toolbar-btn" data-action="h3" title="\u898B\u51FA\u30573" aria-label="\u898B\u51FA\u30573">H3</button>
        <button class="toolbar-btn toolbar-btn-more" data-action="heading-more" title="\u898B\u51FA\u30574\u301C6" aria-label="\u898B\u51FA\u30574\u301C6" aria-haspopup="menu">\u2026</button>
      </div>
      <div class="toolbar-group" role="group" aria-label="\u30EA\u30B9\u30C8\u30FB\u30EA\u30F3\u30AF\u30FB\u8868">
        <button class="toolbar-btn" data-action="ul" title="\u7B87\u6761\u66F8\u304D" aria-label="\u7B87\u6761\u66F8\u304D">\u2022 List</button>
        <button class="toolbar-btn" data-action="ol" title="\u756A\u53F7\u4ED8\u304D\u30EA\u30B9\u30C8" aria-label="\u756A\u53F7\u4ED8\u304D\u30EA\u30B9\u30C8">1. List</button>
        <button class="toolbar-btn" data-action="link" title="\u30EA\u30F3\u30AF\u633F\u5165" aria-label="\u30EA\u30F3\u30AF\u633F\u5165">&#128279;</button>
        <button class="toolbar-btn" data-action="table" title="\u30C6\u30FC\u30D6\u30EB\u633F\u5165" aria-label="\u30C6\u30FC\u30D6\u30EB\u633F\u5165">&#8862;</button>
      </div>
      <div class="toolbar-group" role="group" aria-label="\u30B3\u30FC\u30C9\u30FB\u56F3">
        <button class="toolbar-btn" data-action="codeblock" title="\u30B3\u30FC\u30C9\u30D6\u30ED\u30C3\u30AF" aria-label="\u30B3\u30FC\u30C9\u30D6\u30ED\u30C3\u30AF">{ }</button>
        <button class="toolbar-btn" data-action="mermaid" title="Mermaid\u30C0\u30A4\u30A2\u30B0\u30E9\u30E0\u633F\u5165" aria-label="Mermaid\u30C0\u30A4\u30A2\u30B0\u30E9\u30E0\u633F\u5165">&#9671; Mermaid</button>
      </div>
      <div class="toolbar-group toolbar-group-right" role="group" aria-label="\u30E6\u30FC\u30C6\u30A3\u30EA\u30C6\u30A3">
        <span id="save-status" class="save-status save-status-saved" role="status" aria-live="polite" title="\u4FDD\u5B58\u6E08\u307F">\u25CF</span>
        <button class="toolbar-btn" data-action="undo" title="\u5143\u306B\u623B\u3059" aria-label="\u5143\u306B\u623B\u3059" aria-keyshortcuts="Control+Z">\u21B6</button>
        <button class="toolbar-btn" data-action="redo" title="\u3084\u308A\u76F4\u3057" aria-label="\u3084\u308A\u76F4\u3057" aria-keyshortcuts="Control+Y Control+Shift+Z">\u21B7</button>
        <button class="toolbar-btn" data-action="find" title="\u691C\u7D22\u3068\u7F6E\u63DB" aria-label="\u691C\u7D22\u3068\u7F6E\u63DB" aria-keyshortcuts="Control+F Control+H" aria-pressed="false" aria-controls="find-bar">\u{1F50D}</button>
        <button class="toolbar-btn" data-action="toggleTheme" title="\u30C6\u30FC\u30DE\u5207\u66FF" aria-label="\u30E9\u30A4\u30C8 / \u30C0\u30FC\u30AF\u30C6\u30FC\u30DE\u5207\u66FF">\u2600\uFE0F</button>
        <button class="toolbar-btn" data-action="openAsText" title="\u30C6\u30AD\u30B9\u30C8\u30A8\u30C7\u30A3\u30BF\u3067\u958B\u304F" aria-label="\u30C6\u30AD\u30B9\u30C8\u30A8\u30C7\u30A3\u30BF\u3067\u958B\u304F">\u{1F4DD}</button>
      </div>
    </div>
    <div id="find-bar" role="search" aria-label="\u691C\u7D22\u3068\u7F6E\u63DB" hidden>
      <input type="text" id="find-input" placeholder="\u691C\u7D22\u6587\u5B57\u5217" aria-label="\u691C\u7D22\u6587\u5B57\u5217" />
      <button id="find-prev" title="\u524D\u3078 (Shift+Enter)" aria-label="\u524D\u306E\u4E00\u81F4\u3078">\u2191</button>
      <button id="find-next" title="\u6B21\u3078 (Enter)" aria-label="\u6B21\u306E\u4E00\u81F4\u3078">\u2193</button>
      <span id="find-count" aria-live="polite" aria-atomic="true">0/0</span>
      <input type="text" id="replace-input" placeholder="\u7F6E\u63DB\u6587\u5B57\u5217" aria-label="\u7F6E\u63DB\u6587\u5B57\u5217" />
      <button id="replace-one" title="\u7F6E\u63DB (Enter)" aria-label="\u73FE\u5728\u306E\u4E00\u81F4\u3092\u7F6E\u63DB">\u7F6E\u63DB</button>
      <button id="replace-all" title="\u3059\u3079\u3066\u7F6E\u63DB" aria-label="\u3059\u3079\u3066\u7F6E\u63DB">\u3059\u3079\u3066\u7F6E\u63DB</button>
      <label class="find-opt" title="\u5927\u6587\u5B57\u30FB\u5C0F\u6587\u5B57\u3092\u533A\u5225"><input type="checkbox" id="find-case" aria-label="\u5927\u6587\u5B57\u30FB\u5C0F\u6587\u5B57\u3092\u533A\u5225" /> Aa</label>
      <label class="find-opt" title="\u6B63\u898F\u8868\u73FE"><input type="checkbox" id="find-regex" aria-label="\u6B63\u898F\u8868\u73FE" /> .*</label>
      <button id="find-close" title="\u9589\u3058\u308B (Esc)" aria-label="\u691C\u7D22\u30D0\u30FC\u3092\u9589\u3058\u308B">\xD7</button>
    </div>
  </div>
  <div id="editor-container">
    <div id="editor" role="textbox" aria-multiline="true" aria-label="Markdown \u30A8\u30C7\u30A3\u30BF\u3002Tab \u3067\u30D6\u30ED\u30C3\u30AF\u3092\u79FB\u52D5\u3001Enter \u3067\u7DE8\u96C6\u958B\u59CB\u3001Esc \u307E\u305F\u306F Ctrl+Enter \u3067\u78BA\u5B9A"></div>
  </div>
  <script nonce="${a}" src="${v}"></script>
  <script nonce="${a}" src="${s}"></script>
  <script nonce="${a}" src="${r}"></script>
  <script nonce="${a}" src="${c}"></script>
  <script nonce="${a}" src="${u}"></script>
  <script nonce="${a}" src="${l}"></script>
</body>
</html>`}};function C(){let o="",t="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let a=0;a<32;a++)o+=t.charAt(Math.floor(Math.random()*t.length));return o}function S(o){o.subscriptions.push(b.register(o))}function $(){}0&&(module.exports={activate,deactivate});
