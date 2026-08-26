// Accounts system for Howard Construction Site Manager.
const crypto = require('crypto');

function hash(pw, salt) {
  return crypto.pbkdf2Sync(pw, salt, 100000, 64, 'sha512').toString('hex');
}
function makeUser(username, name, role, pw, mustChange) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { username: username, name: name, role: role, salt: salt, hash: hash(pw, salt), mustChange: !!mustChange };
}

module.exports = async function handler(req, res) {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) { return res.status(200).json({ error: 'Database not configured.' }); }
    const base = url.replace(/\/+$/, '');
    const auth = { Authorization: 'Bearer ' + token };
    const UKEY = 'hci_users';

    async function loadUsers() {
      const r = await fetch(base + '/get/' + UKEY, { headers: auth });
      const out = await r.json();
      if (out && out.result) { try { return JSON.parse(out.result); } catch (e) { return {}; } }
      return {};
    }
    async function saveUsers(users) {
      await fetch(base + '/set/' + UKEY, { method: 'POST', headers: auth, body: JSON.stringify(users) });
    }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};
    const action = body.action || '';

    let users = await loadUsers();

    if (action === 'seedOwner') {
      if (Object.keys(users).length > 0) { return res.status(200).json({ error: 'Owner already exists.' }); }
      const uname = (body.username || 'phil').toLowerCase().trim();
      users[uname] = makeUser(uname, body.name || 'Phil Howard', 'owner', body.password || 'changeme', true);
      await saveUsers(users);
      return res.status(200).json({ ok: true, message: 'Owner account created.' });
    }

    if (action === 'login') {
      const uname = (body.username || '').toLowerCase().trim();
      const u = users[uname];
      if (!u) { return res.status(200).json({ ok: false, error: 'Wrong username or password.' }); }
      if (u.hash !== hash(body.password || '', u.salt)) { return res.status(200).json({ ok: false, error: 'Wrong username or password.' }); }
      return res.status(200).json({ ok: true, user: { username: u.username, name: u.name, role: u.role, mustChange: !!u.mustChange } });
    }

    if (action === 'changePassword') {
      const uname = (body.username || '').toLowerCase().trim();
      const u = users[uname];
      if (!u || u.hash !== hash(body.oldPassword || '', u.salt)) { return res.status(200).json({ ok: false, error: 'Current password is wrong.' }); }
      if (!body.newPassword || body.newPassword.length < 4) { return res.status(200).json({ ok: false, error: 'New password too short.' }); }
      u.salt = crypto.randomBytes(16).toString('hex');
      u.hash = hash(body.newPassword, u.salt);
      u.mustChange = false;
      await saveUsers(users);
      return res.status(200).json({ ok: true });
    }

    const callerRole = body.callerRole || '';

    if (action === 'list') {
      if (callerRole !== 'owner' && callerRole !== 'manager') { return res.status(200).json({ error: 'Not allowed.' }); }
      const list = Object.keys(users).map(function (k) { return { username: users[k].username, name: users[k].name, role: users[k].role, mustChange: !!users[k].mustChange }; });
      return res.status(200).json({ ok: true, users: list });
    }

    if (action === 'add') {
      if (callerRole !== 'owner') { return res.status(200).json({ error: 'Only the owner can add people.' }); }
      const uname = (body.username || '').toLowerCase().trim();
      if (!uname || !body.password) { return res.status(200).json({ error: 'Username and temp password required.' }); }
      if (users[uname]) { return res.status(200).json({ error: 'That username already exists.' }); }
      const role = ['owner', 'manager', 'crew'].indexOf(body.role) >= 0 ? body.role : 'crew';
      users[uname] = makeUser(uname, body.name || uname, role, body.password, true);
      await saveUsers(users);
      return res.status(200).json({ ok: true });
    }

    if (action === 'remove') {
      if (callerRole !== 'owner') { return res.status(200).json({ error: 'Only the owner can remove people.' }); }
      const uname = (body.username || '').toLowerCase().trim();
      if (users[uname] && users[uname].role === 'owner') { return res.status(200).json({ error: 'Cannot remove the owner.' }); }
      delete users[uname];
      await saveUsers(users);
      return res.status(200).json({ ok: true });
    }

    if (action === 'setRole') {
      if (callerRole !== 'owner') { return res.status(200).json({ error: 'Only the owner can change roles.' }); }
      const uname = (body.username || '').toLowerCase().trim();
      if (!users[uname]) { return res.status(200).json({ error: 'No such user.' }); }
      if (['owner', 'manager', 'crew'].indexOf(body.role) < 0) { return res.status(200).json({ error: 'Bad role.' }); }
      users[uname].role = body.role;
      await saveUsers(users);
      return res.status(200).json({ ok: true });
    }

    if (action === 'resetPassword') {
      if (callerRole !== 'owner') { return res.status(200).json({ error: 'Only the owner can reset passwords.' }); }
      const uname = (body.username || '').toLowerCase().trim();
      if (!users[uname]) { return res.status(200).json({ error: 'No such user.' }); }
      users[uname].salt = crypto.randomBytes(16).toString('hex');
      users[uname].hash = hash(body.password || 'changeme', users[uname].salt);
      users[uname].mustChange = true;
      await saveUsers(users);
      return res.status(200).json({ ok: true });
    }

    if (action === 'status') {
      return res.status(200).json({ ok: true, hasUsers: Object.keys(users).length > 0 });
    }

    return res.status(200).json({ error: 'Unknown action.' });
  } catch (err) {
    return res.status(200).json({ error: 'Accounts error: ' + err.message });
  }
};
