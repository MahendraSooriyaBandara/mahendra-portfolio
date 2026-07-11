const path = require('path');
const fs = require('fs');
const { persistChange } = require('./persist');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const SEED_PATH = path.join(__dirname, '..', 'data', 'db.seed.json');

const DEFAULT_DB = {
  admin: null,
  cv: null,
  certifications: []
};

function readSeed() {
  try {
    const raw = fs.readFileSync(SEED_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_DB,
      ...parsed,
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications : []
    };
  } catch (err) {
    return null;
  }
}

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
    const seed = readSeed();
    if (seed) return seed;
    return { ...DEFAULT_DB };
  }
}

function writeDB(data, reason) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  persistChange(reason || 'db update');
}

function getAdmin() {
  return readDB().admin;
}

function setAdmin(admin) {
  const db = readDB();
  db.admin = admin;
  writeDB(db, 'update admin');
  return admin;
}

module.exports = { readDB, writeDB, getAdmin, setAdmin };
