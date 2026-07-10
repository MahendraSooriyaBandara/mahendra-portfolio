const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const DEFAULT_DB = {
  admin: null,
  cv: null,
  certifications: []
};

function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_DB,
      ...parsed,
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications : []
    };
  } catch (err) {
    return { ...DEFAULT_DB };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getAdmin() {
  return readDB().admin;
}

function setAdmin(admin) {
  const db = readDB();
  db.admin = admin;
  writeDB(db);
  return admin;
}

module.exports = { readDB, writeDB, getAdmin, setAdmin };
