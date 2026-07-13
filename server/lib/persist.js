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

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEBOUNCE_MS = Number(process.env.PERSIST_DEBOUNCE_MS) || 4000;
const BRANCH = process.env.GITHUB_BRANCH || 'main';

let debounceTimer = null;
let pendingReasons = new Set();
let isPushing = false;
let gitConfigured = false;
let disabled = false;
// Diagnostic state exposed via status() so we can see WHY a push failed
// without needing SSH access to the Render container.
let lastAttempt = null;   // ISO timestamp of last flush attempt
let lastSuccess = null;   // ISO timestamp of last successful push
let lastError = null;     // string, last error message (scrubbed)
let attemptCount = 0;
let successCount = 0;
let errorCount = 0;

function isEnabled() {
  if (disabled) return false;
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) return false;
  return true;
}

function scrub(str) {
  return String(str).replace(/x-access-token:[^@\s]+@/g, 'x-access-token:***@');
}

/**
 * Run a command with args as a discrete array (no shell interpolation) so
 * user-controlled inputs like commit messages, filenames, and remote URLs
 * are passed through argv rather than parsed by bash. This eliminates any
 * possibility of shell metacharacter injection from admin input.
 */
async function run(cmd, args = [], options = {}) {
  const preview = `${cmd} ${args.map(scrub).join(' ')}`;
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: REPO_ROOT,
      maxBuffer: 4 * 1024 * 1024,
      ...options
    });
    return { stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (err) {
    const enriched = new Error(`command failed: ${preview} — ${scrub(err.message || '')}`);
    enriched.original = err;
    throw enriched;
  }
}

/**
 * Re-check the .git directory on every call so that if it disappears
 * (unusual, but possible on partial redeploys, disk pressure, or an
 * out-of-band cleanup), we detect it, drop our cached "configured" flag,
 * and rebuild the repo before the next commit instead of silently failing.
 */
async function ensureGitConfigured() {
  const gitDir = path.join(REPO_ROOT, '.git');
  const gitExists = fs.existsSync(gitDir);

  if (gitConfigured && gitExists) return;

  if (gitConfigured && !gitExists) {
    console.warn('[persist] .git directory disappeared — reinitializing');
    gitConfigured = false;
  }

  if (!gitExists) {
    await run('git', ['init']);
    await run('git', ['checkout', '-B', BRANCH]);
  }

  await run('git', ['config', 'user.email', 'cms@portfolio.local']);
  await run('git', ['config', 'user.name', 'Portfolio CMS']);
  await run('git', ['config', '--global', '--add', 'safe.directory', REPO_ROOT]).catch(() => {});

  const remoteUrl = `https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPO}.git`;
  try {
    await run('git', ['remote', 'set-url', 'origin', remoteUrl]);
  } catch (_) {
    await run('git', ['remote', 'add', 'origin', remoteUrl]);
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

const TRACKED_FILES = [
  'server/data/db.json',
  'server/data/db.seed.json',
  'server/data/content.json',
  'server/uploads/'
];

/**
 * Snapshot the writable files in memory so we can safely reset the working
 * tree to origin/main and then restore our admin edits on top. This is
 * bulletproof: no matter what git does with branches/refs, our latest file
 * state always wins.
 */
function snapshotFiles() {
  const snap = {};
  for (const rel of TRACKED_FILES) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    walk(abs, (filePath) => {
      const relPath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
      snap[relPath] = fs.readFileSync(filePath);
    });
  }
  return snap;
}

function walk(entry, cb) {
  const stat = fs.statSync(entry);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(entry)) {
      walk(path.join(entry, name), cb);
    }
  } else if (stat.isFile()) {
    cb(entry);
  }
}

function restoreFiles(snap) {
  for (const [relPath, buffer] of Object.entries(snap)) {
    const abs = path.join(REPO_ROOT, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buffer);
  }
}

async function flush() {
  if (!isEnabled() || isPushing) return;
  isPushing = true;
  attemptCount++;
  lastAttempt = new Date().toISOString();

  const reasons = [...pendingReasons];
  pendingReasons.clear();

  try {
    await ensureGitConfigured();

    // Step 1: Snapshot the current admin state in memory. Whatever we do to
    // the git tree from here on, we can always restore these bytes.
    const snap = snapshotFiles();

    // Step 2: Align local repo with the freshest remote state so the push
    // will be a fast-forward. `reset --hard` overwrites the working tree, so
    // the snapshot above is critical.
    try {
      await run('git', ['fetch', 'origin', BRANCH]);
      await run('git', ['reset', '--hard', `origin/${BRANCH}`]);
    } catch (err) {
      // Fresh repo or network hiccup — proceed anyway; commit + push may
      // still succeed if HEAD is compatible.
      console.warn('[persist] fetch/reset failed, continuing:', err.message);
    }

    // Step 3: Restore our admin edits on top of the fresh remote state.
    restoreFiles(snap);

    // Step 4: Stage the tracked files.
    await run('git', ['add', '-A', '--', ...TRACKED_FILES])
      .catch((e) => console.warn('[persist] add failed:', e.message));

    const { stdout: status } = await run('git', ['status', '--porcelain']);
    if (!status.trim()) {
      console.log('[persist] no changes to commit');
      lastSuccess = new Date().toISOString();
      successCount++;
      return;
    }

    // Step 5: Commit + push. Commit message is a discrete argv element so
    // shell metacharacters in admin-supplied titles can never escape.
    const message = buildMessage(reasons);
    await run('git', ['commit', '-m', message]);

    try {
      await run('git', ['push', 'origin', `HEAD:${BRANCH}`]);
      console.log(`[persist] pushed: ${message}`);
      lastSuccess = new Date().toISOString();
      successCount++;
    } catch (pushErr) {
      // Race window: someone else pushed between our fetch and our push.
      // Snapshot again, re-align, re-apply, re-commit, and push once more.
      if (/non-fast-forward|rejected|fetch first/i.test(pushErr.message)) {
        console.warn('[persist] push rejected — rebuilding on latest remote');
        const snap2 = snapshotFiles();
        await run('git', ['fetch', 'origin', BRANCH]);
        await run('git', ['reset', '--hard', `origin/${BRANCH}`]);
        restoreFiles(snap2);
        await run('git', ['add', '-A', '--', ...TRACKED_FILES]);
        await run('git', ['commit', '-m', message]);
        await run('git', ['push', 'origin', `HEAD:${BRANCH}`]);
        console.log(`[persist] pushed after retry: ${message}`);
        lastSuccess = new Date().toISOString();
        successCount++;
      } else {
        throw pushErr;
      }
    }
  } catch (err) {
    console.warn('[persist] error:', err.message);
    lastError = scrub(err.message || 'unknown error');
    errorCount++;
    // Re-queue the reasons so we try again next flush instead of losing them.
    reasons.forEach((r) => pendingReasons.add(r));
    // Schedule a retry so a transient failure doesn't strand the changes
    // forever waiting for another admin action to trigger flush.
    if (!debounceTimer) {
      debounceTimer = setTimeout(() => {
        flush().catch(() => {});
      }, Math.min(DEBOUNCE_MS * 4, 30000));
    }
  } finally {
    isPushing = false;
  }
}

function sanitizeReason(reason) {
  return String(reason || 'update')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function buildMessage(reasons) {
  const cleaned = reasons.map(sanitizeReason).filter(Boolean);
  if (cleaned.length === 0) return 'admin: update';
  if (cleaned.length === 1) return `admin: ${cleaned[0]}`;
  const preview = cleaned.slice(0, 3).join(', ');
  const extra = cleaned.length > 3 ? ` (+${cleaned.length - 3} more)` : '';
  return `admin: ${preview}${extra}`;
}

function disable(reason) {
  disabled = true;
  if (reason) console.warn(`[persist] disabled: ${reason}`);
}

/**
 * Pull the latest tracked data files from origin/main BEFORE the server
 * starts serving requests.
 *
 * Why this exists: Render's free tier redeploys a new container every time
 * we push (from auto-persist) AND when the service wakes from idle. But
 * Render sometimes deploys an *older* build image — meaning the new
 * container's disk has stale content.json / db.json / uploads/ relative to
 * what's on GitHub. That looks to you like "my admin change reverted a few
 * minutes later" — the change was saved to GitHub, but the fresh container
 * booted from a stale snapshot.
 *
 * This function fixes that by always aligning the container's data files
 * with GitHub's origin/main at startup. GitHub becomes the single source of
 * truth for admin data; Render's deploy image is just used for code.
 *
 * We only reset the tracked DATA files, never the code. That way an
 * accidentally-old deploy still runs its own code (safest) but always sees
 * the latest admin state.
 */
async function syncFromRemote() {
  if (!isEnabled()) {
    console.log('[persist] sync skipped (auto-persist disabled — no GITHUB_TOKEN/REPO)');
    return { ok: false, reason: 'disabled' };
  }
  try {
    await ensureGitConfigured();
    await run('git', ['fetch', 'origin', BRANCH]);
    // Restore only tracked data files/dirs from origin/main. Using
    // `git checkout origin/BRANCH -- <path>` leaves untracked code alone
    // and only rewrites the data files we care about.
    for (const rel of TRACKED_FILES) {
      // If the path doesn't exist in origin/main at all, checkout will
      // fail — swallow it so a fresh deploy without uploads doesn't crash.
      await run('git', ['checkout', `origin/${BRANCH}`, '--', rel]).catch((err) => {
        console.warn(`[persist] sync could not restore ${rel}:`, err.message);
      });
    }
    console.log(`[persist] synced data files from origin/${BRANCH}`);
    return { ok: true };
  } catch (err) {
    console.warn('[persist] startup sync failed:', err.message);
    return { ok: false, error: err.message };
  }
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
    isPushing,
    attemptCount,
    successCount,
    errorCount,
    lastAttempt,
    lastSuccess,
    lastError
  };
}

module.exports = { persistChange, flush, disable, status, syncFromRemote };
