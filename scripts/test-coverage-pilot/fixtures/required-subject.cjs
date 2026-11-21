exports.run = function (flag) {
  const x = '🧪';
  if (flag) {
    return x;
  }
  return 'other';
};
exports.unused = function () {
  return 'never';
};
