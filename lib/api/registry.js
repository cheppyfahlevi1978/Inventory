const auth = require('./auth');
const master = require('./master');
const assets = require('./assets');
const dashboard = require('./dashboard');
const mpl = require('./mpl');
const mutasi = require('./mutasi');
const opname = require('./opname');
const maintenance = require('./maintenance');
const depresiasi = require('./depresiasi');
const writeoff = require('./writeoff');

/**
 * Maps the original google.script.run function names to their ported
 * implementations. Every entry is called as fn(ctx, ...args) where ctx =
 * { email } is derived from the session cookie (see lib/session.js) —
 * this replaces GAS's implicit Session.getEffectiveUser().
 */
const REGISTRY = {
  checkSession: auth.checkSession,
  loginWithPassword: auth.loginWithPassword,
  registerUser: auth.registerUser,
  requestOtp: auth.requestOtp,
  verifyOtpAndLogin: auth.verifyOtpAndLogin,
  logLogout: auth.logLogout,

  getBootstrap: master.getBootstrap,
  getHotels: master.getHotels,
  getDepartments: master.getDepartments,
  getSettings: master.getSettings,
  saveSettings: master.saveSettings,
  saveBranding: master.saveBranding,
  saveHotel: master.saveHotel,
  deleteHotel: master.deleteHotel,
  saveDepartment: master.saveDepartment,
  deleteDepartment: master.deleteDepartment,
  getUsers: master.getUsers,
  saveUser: master.saveUser,
  setUserStatus: master.setUserStatus,
  deleteUser: master.deleteUser,

  getAssets: assets.getAssets,
  saveAsset: assets.saveAsset,
  deleteAsset: assets.deleteAsset,

  getMplAssets: mpl.getMplAssets,
  saveMplAsset: mpl.saveMplAsset,
  deleteMplAsset: mpl.deleteMplAsset,

  requestMutasi: mutasi.requestMutasi,
  getMutasi: mutasi.getMutasi,
  decideMutasi: mutasi.decideMutasi,

  startOpname: opname.startOpname,
  getOpnameSession: opname.getOpnameSession,
  scanOpnameAsset: opname.scanOpnameAsset,
  closeOpname: opname.closeOpname,
  listOpnameSessions: opname.listOpnameSessions,

  saveMaintenance: maintenance.saveMaintenance,
  completeMaintenance: maintenance.completeMaintenance,
  cancelMaintenance: maintenance.cancelMaintenance,
  getMaintenance: maintenance.getMaintenance,
  sendMaintenanceReminders: maintenance.sendMaintenanceReminders,

  refreshDepresiasi: depresiasi.refreshDepresiasi,
  getDepresiasi: depresiasi.getDepresiasi,

  requestWriteOff: writeoff.requestWriteOff,
  getWriteOffs: writeoff.getWriteOffs,
  decideWriteOff: writeoff.decideWriteOff,

  getNotifications: dashboard.getNotifications,
  getCombinedReport: dashboard.getCombinedReport,
  getDashboard: dashboard.getDashboard,
  getActivities: dashboard.getActivities,
};

module.exports = { REGISTRY };
