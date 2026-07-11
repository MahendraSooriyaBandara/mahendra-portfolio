/**
 * Auto-persist admin changes to GitHub.
 *
 * On Render's free tier, the filesystem is ephemeral — every deploy or
 * spin-down wipes db.json, content.json, and server/uploads/. To survive
 * this we commit + push those files back to the source repository. Render's
 * auto-deploy webhook then picks up the change and rolls out a fresh
 * container that has the persisted state baked in.
 *
 * Requires two env vars:
 *   GITHUB_TOKEN  — a fine-grained personal access token with `Contents:
 *                   Read & Write` permission on the target repo.
 *   GITHUB_REPO   — "owner/repo" (e.g. "MahendraSooriyaBandara/mahendra-portfolio")
 *
 * Optional env vars:
 *   GITHUB_BRANCH — branch to push to (defaults to "main")
 *   PERSIST_DEBOUNCE_MS — how long to wait after last change before pushing
 *                         (defaults to 4000 ms; higher = fewer commits)
 *
 * Writes are debounced so a burst of rapid admin actions produces a single
 * commit instead of one per action.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEBOUNCE_MS = Number(process.env.PERSIST_DEBOUNCE_MS) || 4000;
const BRANCH = process.env.GITHUB_BRANCH || 'main';

let debounceTimer = null;
let pendingReasons = new Set();
let isPushing = false;
let gitConfigured = false;
let disabled = false;

function isEnabled() {
  if (disabled) return false;
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) return false;
  return true;
}

async function run(cmd, options = {}) {
  const scrubbed = cmd.replace(/x-access-token:[^@]+@/, 'x-access-token:***@');
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: REPO_ROOT, ...options });
    return { stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (err) {
    const msg = (err.message || '').replace(/x-access-token:[^@]+@/g, 'x-access-token:***@');
    const enriched = new Error(`git command failed: ${scrubbed} — ${msg}`);
    enriched.original = err;
    throw enriched;
  }
}

async function ensureGitConfigured() {
  if (gitConfigured) return;

  const gitDir = path.join(REPO_ROOT, '.git');
  if (!fs.existsSync(gitDir)) {
    await run('git init');
    await run(`git checkout -B ${BRANCH}`);
  }

  await run('git config user.email "cms@portfolio.local"');
  await run('git config user.name "Portfolio CMS"');
  await run(`git config --global --add safe.directory ${REPO_ROOT.replace(/\\/g, '/')}`).catch(() => {});

  const remoteUrl = `https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPO}.git`;
  try {
    await run(`git remote set-url origin "${remoteUrl}"`);
  } catch (_) {
    await run(`git remote add origin "${remoteUrl}"`);
  }

  gitConfigured = true;
}

function persistChange(reason) {
  if (!isEnabled()) return;
  pendingReasons.add(reason || 'update');
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    flush().catch((err) => {
      console.warn('[persist] flush failed:', err.message);
    });
  }, DEBOUNCE_MS);
}

async function flush() {
  if (!isEnabled() || isPushing) return;
  isPushing = true;

  const reasons = [...pendingReasons];
  pendingReasons.clear();

  try {
    await ensureGitConfigured();

    await run(
      'git add -A -- server/data/db.json server/data/db.seed.json server/data/content.json server/uploads/'
    ).catch((e) => console.warn('[persist] add failed:', e.message));

    const { stdout: status } = await run('git status --porcelain');
    if (!status.trim()) {
      console.log('[persist] no changes to commit');
      return;
    }

    const message = buildMessage(reasons);
    await run(`git commit -m "${message.replace(/"/g, "'")}"`);
    await run(`git push origin HEAD:${BRANCH}`);
    console.log(`[persist] ✓ pushed: ${message}`);
  } catch (err) {
    console.warn('[persist] error:', err.message);
  } finally {
    isPushing = false;
  }
}

function buildMessage(reasons) {
  if (reasons.length === 0) return 'admin: update';
  if (reasons.length === 1) return `admin: ${reasons[0]}`;
  const preview = reasons.slice(0, 3).join(', ');
  const extra = reasons.length > 3 ? ` (+${reasons.length - 3} more)` : '';
  return `admin: ${preview}${extra}`;
}

function disable(reason) {
  disabled = true;
  if (reason) console.warn(`[persist] disabled: ${reason}`);
}

function status() {
  return {
    enabled: isEnabled(),
    disabled,
    hasToken: !!process.env.GITHUB_TOKEN,
    hasRepo: !!process.env.GITHUB_REPO,
    branch: BRANCH,
    debounceMs: DEBOUNCE_MS,
    pending: pendingReasons.size,
    isPushing
  };
}

module.exports = { persistChange, flush, disable, status };
