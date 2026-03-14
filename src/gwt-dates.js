/**
 * GWT uses a custom base64 encoding for Java long values (epoch ms).
 * Charset: ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$_
 */

const GWT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$_';

function decodeGwtLong(encoded) {
  if (!encoded || encoded.length === 0) return 0;

  const negative = encoded.startsWith('!');
  const str = negative ? encoded.slice(1) : encoded;

  let result = 0n;
  for (const ch of str) {
    const idx = GWT_CHARS.indexOf(ch);
    if (idx === -1) return 0;
    result = result * 64n + BigInt(idx);
  }

  return Number(negative ? -result : result);
}

function encodeGwtLong(epochMs) {
  if (epochMs === 0) return 'A';

  const negative = epochMs < 0;
  let value = BigInt(Math.abs(epochMs));
  const chars = [];

  while (value > 0n) {
    chars.unshift(GWT_CHARS[Number(value % 64n)]);
    value = value / 64n;
  }

  return (negative ? '!' : '') + chars.join('');
}

function gwtToDate(encoded) {
  const ms = decodeGwtLong(encoded);
  return ms ? new Date(ms) : null;
}

function dateToGwt(date) {
  return encodeGwtLong(date.getTime());
}

module.exports = { decodeGwtLong, encodeGwtLong, gwtToDate, dateToGwt };
