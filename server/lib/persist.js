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

async function flush() {
  if (!isEnabled() || isPushing) return;
  isPushing = true;

  const reasons = [...pendingReasons];
  pendingReasons.clear();

  try {
    await ensureGitConfigured();

    // CRITICAL: pull the latest from origin BEFORE committing so our push is
    // always a fast-forward. Without this step, whenever the developer pushes
    // code from their machine (which is common), any admin change made on the
    // running container gets rejected with "non-fast-forward" and is lost
    // when the container is recycled by Render's auto-deploy.
    //
    // We use fetch + `reset --soft` because:
    //   - the writable files (db.json, content.json, uploads/) sit in the
    //     working tree at the moment flush runs;
    //   - `reset --soft` moves HEAD to the fetched remote tip but keeps the
    //     working tree and index intact, so no file changes are lost;
    //   - the subsequent `git add` re-stages our changes on top of the
    //     up-to-date HEAD, and the commit + push is guaranteed fast-forward.
    try {
      await run('git', ['fetch', 'origin', BRANCH]);
      await run('git', ['reset', '--soft', `origin/${BRANCH}`]);
    } catch (err) {
      // Non-fatal — if there's no upstream state (fresh repo) or a transient
      // network hiccup, we still try to commit locally. The push may fail,
      // and we'll retry next flush.
      console.warn('[persist] fetch/reset failed, continuing:', err.message);
    }

    await run('git', [
      'add', '-A', '--',
      'server/data/db.json',
      'server/data/db.seed.json',
      'server/data/content.json',
      'server/uploads/'
    ]).catch((e) => console.warn('[persist] add failed:', e.message));

    const { stdout: status } = await run('git', ['status', '--porcelain']);
    if (!status.trim()) {
      console.log('[persist] no changes to commit');
      return;
    }

    const message = buildMessage(reasons);
    // Commit message is passed as a discrete argv element — bash never
    // parses it, so backticks / $() / ; inside admin-supplied titles
    // cannot escape and execute on the container.
    await run('git', ['commit', '-m', message]);

    try {
      await run('git', ['push', 'origin', `HEAD:${BRANCH}`]);
      console.log(`[persist] pushed: ${message}`);
    } catch (pushErr) {
      // If the push was rejected as non-fast-forward (someone else pushed
      // between our fetch and our push), fetch + soft-reset again to pull
      // their commit under ours, then push once more.
      if (/non-fast-forward|rejected|fetch first/i.test(pushErr.message)) {
        console.warn('[persist] push rejected — rebasing and retrying');
        try {
          await run('git', ['fetch', 'origin', BRANCH]);
          await run('git', ['reset', '--soft', `HEAD~1`]);
          await run('git', ['reset', '--soft', `origin/${BRANCH}`]);
          await run('git', ['add', '-A', '--',
            'server/data/db.json',
            'server/data/db.seed.json',
            'server/data/content.json',
            'server/uploads/'
          ]);
          await run('git', ['commit', '-m', message]);
          await run('git', ['push', 'origin', `HEAD:${BRANCH}`]);
          console.log(`[persist] pushed after retry: ${message}`);
        } catch (retryErr) {
          console.warn('[persist] retry also failed:', retryErr.message);
          throw retryErr;
        }
      } else {
        throw pushErr;
      }
    }
  } catch (err) {
    console.warn('[persist] error:', err.message);
    // Re-queue the reasons so we try again next flush instead of losing them.
    reasons.forEach((r) => pendingReasons.add(r));
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
