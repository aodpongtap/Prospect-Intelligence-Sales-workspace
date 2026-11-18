// Create issues from tools/backlog-crm.json and add them to GitHub Project #1
// Usage: node tools/add-backlog.js [jsonFile]
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GH = 'C:\\Users\\pongtap.p\\tools\\gh\\gh.exe';
const OWNER = 'aodpongtap';
const REPO = 'Prospect-Intelligence-Sales-workspace';
const PROJECT = '1';
const PROJECT_ID = 'PVT_kwHODJDy2M4BsJtx';
const STATUS_FIELD = 'PVTSSF_lAHODJDy2M4BsJtxzhqZJLU';
const OPT = 'f75ad846'; // Todo

const file = process.argv[2] || path.resolve(__dirname, 'backlog-crm.json');
const items = JSON.parse(fs.readFileSync(file, 'utf8'));

function gh(args) {
  return execFileSync(GH, args, { encoding: 'utf8' });
}

let n = 0;
for (const it of items) {
  const url = gh(['issue', 'create', '--repo', `${OWNER}/${REPO}`, '--title', it.title, '--body', it.body]).trim();
  const item = JSON.parse(gh(['project', 'item-add', PROJECT, '--owner', OWNER, '--url', url, '--format', 'json']));
  gh(['project', 'item-edit', '--id', item.id, '--project-id', PROJECT_ID, '--field-id', STATUS_FIELD, '--single-select-option-id', OPT]);
  n++;
  console.log(n + '. ' + url);
}
console.log('added ' + n + ' cards');
