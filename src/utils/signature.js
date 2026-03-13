const crypto = require('crypto');

function generateSignature({ timestamp, method, uri, secretKey }) {
  const message = `${timestamp}.${method}.${uri}`;

  return crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('base64');
}

module.exports = {
  generateSignature,
};
