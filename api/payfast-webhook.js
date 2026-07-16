/**
 * PayFast ITN handler — deployed as Firebase Cloud Function (see functions/payfast-webhook.js).
 * Point PayFast notify_url to: https://<region>-<project>.cloudfunctions.net/payfastWebhook
 */
module.exports = require('../functions/payfast-webhook');
