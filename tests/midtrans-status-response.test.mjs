import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMidtransStatusResponse } from '../supabase/functions/_shared/midtrans-status-response.mjs';

test('classifies HTTP 404 as an unused Snap session even without a JSON body', () => {
  assert.deepEqual(parseMidtransStatusResponse(404, null), { kind: 'not_found' });
});

test('classifies Midtrans API status_code 404 inside an HTTP 200 response as not found', () => {
  assert.deepEqual(
    parseMidtransStatusResponse(200, {
      status_code: '404',
      status_message: 'The requested resource is not found',
    }),
    { kind: 'not_found' },
  );
});

test('accepts a valid Midtrans transaction status with string or numeric API code', () => {
  assert.deepEqual(
    parseMidtransStatusResponse(200, { status_code: '200', transaction_status: 'pending' }),
    { kind: 'found', transactionStatus: 'pending' },
  );
  assert.deepEqual(
    parseMidtransStatusResponse(200, { status_code: 200, transaction_status: 'expire' }),
    { kind: 'found', transactionStatus: 'expire' },
  );
  assert.deepEqual(
    parseMidtransStatusResponse(200, { status_code: '201', transaction_status: 'pending' }),
    { kind: 'found', transactionStatus: 'pending' },
  );
});

test('fails closed when the HTTP request itself is unsuccessful', () => {
  assert.throws(() => parseMidtransStatusResponse(401, { status_code: '404' }), /HTTP 401/);
  assert.throws(() => parseMidtransStatusResponse(502, {}), /HTTP 502/);
});

test('fails closed for non-404 Midtrans API errors even when HTTP is 200', () => {
  assert.throws(
    () => parseMidtransStatusResponse(200, { status_code: '401', status_message: 'Unauthorized' }),
    /HTTP 200, API 401/,
  );
});

test('fails closed when a successful response has no transaction_status', () => {
  assert.throws(
    () => parseMidtransStatusResponse(200, { status_code: '200' }),
    /does not|tidak berisi transaction_status/,
  );
  assert.throws(() => parseMidtransStatusResponse(200, null), /tidak valid/);
});
