// Local-inspector-only weak reference; no app import, route, or strong lifetime extension.
let ref;
module.exports = {
  get: () => ref?.deref(),
  set: service => {
    if (process.env.NODE_ENV !== 'development') throw Error('Development only');
    ref = new WeakRef(service);
  },
};
