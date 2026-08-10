/**
 * STUB — to be ported from legacy-gas/Code.gs by the follow-up porting pass.
 * Do not treat as implemented; every export throws until replaced.
 */
function notImplemented(name) {
  return async function () {
    throw new Error('opname.' + name + '() belum diimplementasikan di backend Vercel.');
  };
}

module.exports = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'then') return undefined;
    return notImplemented(String(prop));
  },
});
