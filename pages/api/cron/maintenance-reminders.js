const maintenance = require('../../../lib/api/maintenance');

export default async function handler(req, res) {
  try {
    await maintenance.sendMaintenanceReminders({ email: '' });
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
