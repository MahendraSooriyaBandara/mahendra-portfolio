const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const CONTENT_PATH = path.join(__dirname, '..', 'data', 'content.json');
const DEFAULT_PATH = path.join(__dirname, '..', 'data', 'content.default.json');

function readDefault() {
  try {
    return JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf8'));
  } catch (err) {
    return {};
  }
}

function readContent() {
  try {
    if (!fs.existsSync(CONTENT_PATH)) {
      const defaults = readDefault();
      fs.writeFileSync(CONTENT_PATH, JSON.stringify(defaults, null, 2));
      return defaults;
    }
    return JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
  } catch (err) {
    return readDefault();
  }
}

function writeContent(data) {
  fs.writeFileSync(CONTENT_PATH, JSON.stringify(data, null, 2));
  return data;
}

function updateSection(section, value) {
  const content = readContent();
  content[section] = value;
  return writeContent(content);
}

function upsertListItem(section, item) {
  const content = readContent();
  if (!Array.isArray(content[section])) content[section] = [];
  const withId = { ...item, id: item.id || `${section}-${crypto.randomBytes(4).toString('hex')}` };
  const idx = content[section].findIndex((x) => x.id === withId.id);
  if (idx === -1) content[section].push(withId);
  else content[section][idx] = withId;
  writeContent(content);
  return withId;
}

function deleteListItem(section, id) {
  const content = readContent();
  if (!Array.isArray(content[section])) return false;
  const idx = content[section].findIndex((x) => x.id === id);
  if (idx === -1) return false;
  content[section].splice(idx, 1);
  writeContent(content);
  return true;
}

function reorderList(section, ids) {
  const content = readContent();
  if (!Array.isArray(content[section])) return content[section] || [];
  const map = new Map(content[section].map((x) => [x.id, x]));
  const ordered = ids.map((id) => map.get(id)).filter(Boolean);
  const missing = content[section].filter((x) => !ids.includes(x.id));
  content[section] = [...ordered, ...missing];
  writeContent(content);
  return content[section];
}

function resetToDefault() {
  const defaults = readDefault();
  writeContent(defaults);
  return defaults;
}

module.exports = {
  readContent,
  writeContent,
  updateSection,
  upsertListItem,
  deleteListItem,
  reorderList,
  resetToDefault
};
