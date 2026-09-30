// Run: node test-fields.cjs (no browser, dependencies, or changes to saved data).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const context = vm.createContext({
  document: { body: { dataset: {} }, querySelector: () => null },
  location: { search: '' }, window: {}, URLSearchParams,
  console: { ...console, assert: (value, message) => assert.ok(value, message) }
});
// Load the actual functions without starting IndexedDB or the interface.
vm.runInContext(source.slice(0, source.lastIndexOf('      init().catch')) +
  'globalThis.api = { normalizePlusField, cleanPlusField, validatePlusConfig, buildPlusOutput, quickPanelValues, isQuickPanelRequest, exportPlusJson, importPlusJson }; })();', context);
const api = context.api;
const normalize = fields => fields.map(api.normalizePlusField);
const fields = normalize([
  { name: 'nome', kind: 'manual' },
  { name: 'nota', kind: 'manual', required: false },
  { name: 'allegati', kind: 'manual', inputType: 'checkbox', label: 'Includi allegati', checkedText: 'Documenti allegati.' }
]);
const template = '{nome}|{nota}|{allegati}';
assert.equal(fields[0].required, true, 'Legacy fields stay required');
assert.equal(api.validatePlusConfig('Test', template, fields).length, 0);
assert.equal(api.buildPlusOutput(template, fields, { nome: 'Ada', allegati: true }).output, 'Ada||Documenti allegati.');
for (const checked of [false, undefined, 'false', 'true']) {
  const result = api.buildPlusOutput(template, fields, { nome: 'Ada', allegati: checked });
  assert.equal(result.output, 'Ada||');
  assert.equal(result.errors.length, 0);
}
assert.equal(api.buildPlusOutput(template, fields, {}).errors.length, 1);
assert.equal(api.buildPlusOutput(template, fields, { nome: ' ' }).errors.length, 1);
assert.equal(api.buildPlusOutput(template, fields, { nome: 'Ada', nota: 'testo' }).output, 'Ada|testo|');
assert.equal(api.buildPlusOutput(template, fields, { nome: 'Ada', nota: '   ' }).output, 'Ada||');
const dependent = normalize([
  { name: 'lista', kind: 'manual', inputType: 'textarea', required: false, extraction: { name: 'riferimento', prefix: 'A00' } },
  { name: 'totale', kind: 'computed', source: 'lista', operation: 'sum' }
]);
const dependentTemplate = '{lista}|%totale%|%riferimento%';
assert.equal(api.validatePlusConfig('Test', dependentTemplate, dependent).length, 0);
const empty = api.buildPlusOutput(dependentTemplate, dependent, {});
assert.equal(empty.output, '||');
assert.equal(empty.errors.length, 0);
const filled = api.buildPlusOutput(dependentTemplate, dependent, { lista: 'A001 12,50\nA002 2,50' });
assert.equal(filled.errors.length, 0);
assert.ok(filled.output.endsWith('|15,00|A001, A002'));
assert.ok(api.buildPlusOutput(dependentTemplate, dependent, { lista: 'testo senza numeri' }).errors.length);
assert.ok(api.validatePlusConfig('Test', '{allegati}', normalize([{name:'allegati', inputType:'checkbox'}])).length);
assert.ok(api.validatePlusConfig('Test', '{allegati}%totale%', [...fields.slice(2), {name:'totale',kind:'computed',source:'allegati',operation:'sum'}]).length);
// The same serialization is used by saved models, backup imports, and the quick panel.
const restored = normalize(JSON.parse(JSON.stringify(fields.map(api.cleanPlusField))));
assert.equal(JSON.stringify(restored), JSON.stringify(fields));
assert.equal(api.buildPlusOutput(template, restored, {nome:'Ada',allegati:true}).output, 'Ada||Documenti allegati.');
assert.equal(api.quickPanelValues({fields}, {nome:'Ada', allegati:true}).allegati, true);
assert.equal(api.quickPanelValues({fields}, {allegati:'true'}).allegati, false);
assert.ok(api.isQuickPanelRequest({type:'preview-plus',id:'test',requestId:'1',values:{allegati:true}}));
assert.ok(!api.isQuickPanelRequest({type:'preview-plus',id:'test',requestId:'1',values:{allegati:{}}}));
console.log('OK: legacy, optional fields, checkbox, calculations, extraction, serialization, quick-panel protocol.');

// Exercise the real backup functions with in-memory storage and download boundaries.
async function checkBackup() {
  let download;
  context.Blob = Blob;
  context.URL = { createObjectURL: blob => { download = blob; return 'blob:test'; }, revokeObjectURL() {} };
  context.document.createElement = () => ({ click() {} });
  context.savedTemplates = [{ id: 'test', title: 'Test', template, fields, lastValues: { nome: 'Private' } }];
  // Re-evaluate in the same isolated context with test-only storage boundaries.
  const boundaries = `getAllPlusTemplates = async () => globalThis.savedTemplates;
    plusTx = () => ({ put: value => globalThis.imported = value });
    requestToPromise = async value => value;
    syncQuickPanelState = async () => {};
    toast = () => {};
    showPlusImportErrors = errors => { globalThis.importErrors = errors; };
    globalThis.backup = { exportPlusJson, importPlusJson }; })();`;
  vm.runInContext(source.slice(0, source.lastIndexOf('      init().catch')) + boundaries, context);
  await context.backup.exportPlusJson();
  const payload = JSON.parse(await download.text());
  assert.equal(payload.version, 3);
  assert.equal('lastValues' in payload.templates[0], false);
  context.savedTemplates = [];
  await context.backup.importPlusJson({ text: async () => JSON.stringify(payload) });
  assert.equal(context.importErrors.length, 0);
  assert.equal(JSON.stringify(context.imported.fields), JSON.stringify(fields));
  assert.equal(api.buildPlusOutput(context.imported.template, context.imported.fields, {nome:'Ada',allegati:true}).output, 'Ada||Documenti allegati.');
  console.log('OK: actual backup export/import round trip preserves checkbox and optional fields.');
}
checkBackup().catch(error => { console.error(error); process.exitCode = 1; });
