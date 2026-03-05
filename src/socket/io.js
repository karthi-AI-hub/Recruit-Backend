/**
 * Shared Socket.io instance holder.
 *
 * Allows controllers and utilities to emit events without
 * passing `io` through every function signature.
 */
let _io = null;

module.exports = {
  setIO(io) {
    _io = io;
  },
  getIO() {
    return _io;
  },
};
