import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { schemaDiffAppHtml } from "../../dist/ui/schema-diff/app.js";

const fixture = JSON.parse(
  await readFile(
    new URL(
      "../ppg-dev/fixtures/prisma-contract-migrations.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const migration =
  fixture.ledger.find((row) => row.migration_name.includes("add_project")) ??
  fixture.ledger[1];
const comparison = {
  status: "available",
  mode: "diff",
  title: "Project database",
  fromLabel: "main",
  toLabel: "feat/projects",
  before: migration.contract_json_before,
  after: migration.contract_json_after,
};
const json = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Schema MCP app host</title></head><body style="margin:0;font:14px system-ui">
<nav style="padding:12px"><button id="light">Light</button> <button id="dark">Dark</button> <button id="branch">Branch diff</button> <button id="main">Main schema</button> <button id="missing">Missing snapshot</button></nav>
<iframe title="Database schema app" sandbox="allow-scripts" style="border:0;width:100%;height:600px"></iframe>
<script>
const frame = document.querySelector('iframe');
const schema = ${json(comparison)};
const send = (method, params) => frame.contentWindow.postMessage({jsonrpc:'2.0', method, params}, '*');
const result = (schema) => send('ui/notifications/tool-result', {content:[{type:'text',text:'Recorded database schema'}], structuredContent:{schema}});
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow || event.data?.jsonrpc !== '2.0') return;
  const message = event.data;
  if (message.method === 'ui/initialize') frame.contentWindow.postMessage({jsonrpc:'2.0',id:message.id,result:{protocolVersion:message.params.protocolVersion,hostInfo:{name:'Local schema demo',version:'1.0.0'},hostCapabilities:{},hostContext:{theme:'light'}}},'*');
  if (message.method === 'ui/notifications/initialized') result(schema);
});
document.querySelector('#light').onclick = () => send('ui/notifications/host-context-changed', {theme:'light'});
document.querySelector('#dark').onclick = () => send('ui/notifications/host-context-changed', {theme:'dark'});
document.querySelector('#branch').onclick = () => result(schema);
document.querySelector('#main').onclick = () => result({...schema,mode:'schema',before:schema.after,fromLabel:'Recorded schema',toLabel:'main'});
document.querySelector('#missing').onclick = () => result({...schema,status:'unavailable',message:'The database on main has no current contract snapshot. Compare is unavailable.'});
frame.srcdoc = ${json(schemaDiffAppHtml)};
</script></body></html>`;
createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}).listen(4320, "127.0.0.1", () =>
  console.log("Schema MCP app host: http://localhost:4320"),
);
